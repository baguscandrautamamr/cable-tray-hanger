import type {
  AddinApiKey,
  CreatedAddinApiKey,
  HangerConfigInput,
  HangerConfigResult,
  ScanRecord,
} from "../types";
import { supabase } from "./supabaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * The add-in endpoints (`/api/scan-cable-tray`, `/api/latest-config`,
 * `/api/config-status/:id`) are deliberately absent from this module. They
 * authenticate with the shared ADDIN_API_KEY, which is a server-side secret and
 * must never be shipped to the browser.
 */
async function request<T>(
  path: string,
  init?: RequestInit,
  // Some 404s are an answer rather than a failure — "you have no scan yet" is
  // a state the UI renders, not an error it reports.
  options?: { notFoundAsNull?: boolean },
): Promise<T> {
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

  if (res.status === 404 && options?.notFoundAsNull) {
    return null as T;
  }

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

/**
 * The most recent scan the add-in sent, or null when there is none yet. Carries
 * its own `project_name`, which the form compares against VITE_PROJECT_NAME —
 * a mismatch there is otherwise completely silent.
 */
export async function fetchLatestScan(): Promise<ScanRecord | null> {
  const result = await request<{ scan: ScanRecord } | null>(
    "/api/latest-scan",
    undefined,
    { notFoundAsNull: true },
  );

  return result?.scan ?? null;
}

/**
 * Turns a scan into a pending placement covering every tray in it. The trays
 * themselves are not sent — the server reads them from the scan.
 */
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
