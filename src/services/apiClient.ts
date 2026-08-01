import type {
  AddinApiKey,
  CreatedAddinApiKey,
  HangerConfigInput,
  HangerConfigResult,
} from "../types";
import { supabase } from "./supabaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * The origin the API calls actually go to, when that is not the page's own.
 * Null means same-origin, which is the correct setup for a normal deployment.
 *
 * A wrong value here sends every request to somebody else's deployment, which
 * answers with platform 404/405 errors that look like bugs in this app — so it
 * is worth surfacing rather than debugging blind.
 */
export function crossOriginApiTarget(): string | null {
  if (!API_BASE_URL) return null;

  try {
    const target = new URL(API_BASE_URL, window.location.href);
    return target.origin === window.location.origin ? null : target.origin;
  } catch {
    return API_BASE_URL; // Unparseable: definitely worth complaining about.
  }
}

/**
 * The add-in endpoints (`/api/scan-cable-tray`, `/api/latest-config`,
 * `/api/config-status/:id`) are deliberately absent from this module. They
 * authenticate with the shared ADDIN_API_KEY, which is a server-side secret and
 * must never be shipped to the browser.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Your session has expired. Please log in again.");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${describeError(body)}`);
  }

  return res.json() as Promise<T>;
}

/** Turn an error body into something a person can act on. */
function describeError(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);

    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;

      // Our own shape.
      if (typeof record.message === "string") {
        return record.message;
      }

      // Vercel's shape when a function crashes before running. The raw blob
      // (FUNCTION_INVOCATION_FAILED plus a request id) tells the reader
      // nothing, so say what it actually means.
      const error = record.error as Record<string, unknown> | undefined;
      if (error && typeof error.message === "string") {
        return (
          `${error.message}. The serverless function crashed before it ran — ` +
          "check the Functions logs for this deployment in Vercel, and that the " +
          "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY variables are set on this project."
        );
      }
    }
  } catch {
    // Not JSON — an HTML error page, say. Fall through to the raw body.
  }

  return body || "(no response body)";
}

export function submitHangerConfig(input: HangerConfigInput) {
  return request<HangerConfigResult>("/api/hanger-config", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listAddinKeys() {
  return request<{ keys: AddinApiKey[] }>("/api/addin-keys");
}

/** The response carries the secret in clear text — it is never retrievable again. */
export function createAddinKey(label: string) {
  return request<CreatedAddinApiKey>("/api/addin-keys", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function revokeAddinKey(id: string) {
  return request<{ message: string }>(`/api/addin-keys?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
