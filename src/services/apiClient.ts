import type {
  AddinApiKey,
  CreatedAddinApiKey,
  HangerConfigInput,
  HangerConfigResult,
} from "../types";
import { supabase } from "./supabaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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
    throw new Error(`API ${path} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
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
