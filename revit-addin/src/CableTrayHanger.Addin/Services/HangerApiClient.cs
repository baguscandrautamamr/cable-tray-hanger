using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using CableTrayHanger.Addin.Model;

namespace CableTrayHanger.Addin.Services;

/// <summary>Raised for any non-success response, with the server's message.</summary>
internal sealed class ApiException(string message) : Exception(message);

/// <summary>
/// Talks to the Vercel functions in api/. Every endpoint here authenticates
/// with the shared ADDIN_API_KEY, sent as the x-api-key header.
/// </summary>
internal sealed class HangerApiClient(AddinSettings settings)
{
    // One HttpClient for the lifetime of the Revit session: a new one per call
    // leaks sockets, and Revit can stay open for days.
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// GET /api/health — what the deployment has configured. Answers 503 rather
    /// than 200 when something is missing, so an unsuccessful status is still a
    /// usable result here and must not be treated as an error.
    /// </summary>
    public static async Task<HealthDto> CheckHealthAsync(string apiBaseUrl, string? apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            throw new ApiException("Enter the API base URL first.");
        }

        if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var baseUri)
            || (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps))
        {
            throw new ApiException($"'{apiBaseUrl}' is not a valid http(s) URL.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(baseUri, "/api/health"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            request.Headers.Add("x-api-key", apiKey);
        }

        HttpResponseMessage response;
        try
        {
            response = await Http.SendAsync(request).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new ApiException($"Could not reach {baseUri.Host}: {ex.Message}");
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            try
            {
                return JsonSerializer.Deserialize<HealthDto>(body, Json)
                       ?? throw new ApiException("The server returned an empty health response.");
            }
            catch (JsonException)
            {
                // Not our endpoint: an old deployment without /api/health, or a
                // proxy/login page sitting in front of it.
                throw new ApiException(
                    $"{(int)response.StatusCode} {response.ReasonPhrase} — that URL did not return a "
                    + $"health response. Check the base URL, and that the deployment is up to date.");
            }
        }
    }

    /// <summary>POST /api/scan-cable-tray — hand the model contents to the web app.</summary>
    public void SubmitScan(ScanPayload payload)
    {
        using var request = CreateRequest(HttpMethod.Post, "/api/scan-cable-tray");
        request.Content = Serialize(payload);
        SendAsync(request).GetAwaiter().GetResult();
    }

    /// <summary>
    /// GET /api/latest-config — the oldest pending config for this project, or
    /// null when there is nothing waiting (the server answers 404).
    /// </summary>
    public LatestConfigDto? GetLatestConfig()
    {
        var project = WebUtility.UrlEncode(settings.ProjectName);
        using var request = CreateRequest(HttpMethod.Get, $"/api/latest-config?project={project}&status=PENDING");

        var body = SendAsync(request, treatNotFoundAsEmpty: true).GetAwaiter().GetResult();
        return body is null ? null : JsonSerializer.Deserialize<LatestConfigDto>(body, Json);
    }

    /// <summary>PATCH /api/config-status/:id — report the outcome of a sync.</summary>
    public void ReportStatus(string configId, ConfigStatusUpdate update)
    {
        using var request = CreateRequest(HttpMethod.Patch, $"/api/config-status/{WebUtility.UrlEncode(configId)}");
        request.Content = Serialize(update);
        SendAsync(request).GetAwaiter().GetResult();
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path)
    {
        if (!settings.IsConfigured)
        {
            throw new ApiException(
                "The add-in is not configured yet. Use Settings on the ribbon to set the API base URL and key.");
        }

        var request = new HttpRequestMessage(method, new Uri(new Uri(settings.ApiBaseUrl), path));
        request.Headers.Add("x-api-key", settings.ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private static StringContent Serialize<T>(T value) =>
        new(JsonSerializer.Serialize(value, Json), Encoding.UTF8, "application/json");

    /// <summary>
    /// Runs on a worker thread. Revit's commands are synchronous and this is
    /// awaited from the UI thread, so bouncing off the thread pool avoids
    /// deadlocking against Revit's synchronisation context.
    /// </summary>
    private static Task<string?> SendAsync(HttpRequestMessage request, bool treatNotFoundAsEmpty = false) =>
        Task.Run(async () =>
        {
            HttpResponseMessage response;
            try
            {
                response = await Http.SendAsync(request).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                throw new ApiException($"Could not reach the server: {ex.Message}");
            }

            using (response)
            {
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (response.StatusCode == HttpStatusCode.NotFound && treatNotFoundAsEmpty)
                {
                    return null;
                }

                if (!response.IsSuccessStatusCode)
                {
                    throw new ApiException($"{(int)response.StatusCode} {response.ReasonPhrase}: {Describe(body)}");
                }

                return body;
            }
        });

    /// <summary>Pull a human-readable message out of an error body when there is one.</summary>
    private static string Describe(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;

            // Our own shape: {"status":"FAILED","message":"..."}
            if (root.TryGetProperty("message", out var message))
            {
                return message.GetString() ?? body;
            }

            // Vercel's platform shape when a function fails to load:
            // {"error":{"code":"500","message":"A server error has occurred"}}
            // That means the function crashed on import — almost always a
            // missing environment variable on the deployment.
            if (root.TryGetProperty("error", out var error)
                && error.TryGetProperty("message", out var nested))
            {
                return $"{nested.GetString()} (the server function failed to start — "
                       + "check GET /api/health, and the environment variables in Vercel)";
            }
        }
        catch (JsonException)
        {
            // Not JSON — a proxy error page, say. Fall through to the raw body.
        }

        return string.IsNullOrWhiteSpace(body) ? "(no response body)" : body;
    }
}
