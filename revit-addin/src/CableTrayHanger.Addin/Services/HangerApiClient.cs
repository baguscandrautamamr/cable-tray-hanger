using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
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

    /// <summary>Pull the API's `message` out of an error body when there is one.</summary>
    private static string Describe(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("message", out var message))
            {
                return message.GetString() ?? body;
            }
        }
        catch (JsonException)
        {
            // Not JSON — a proxy error page, say. Fall through to the raw body.
        }

        return string.IsNullOrWhiteSpace(body) ? "(no response body)" : body;
    }
}
