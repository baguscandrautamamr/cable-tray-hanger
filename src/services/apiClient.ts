import type {
  HangerConfigInput,
  HangerConfigResult,
  ScanPayload,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
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

export function getLatestConfig(project: string, status = "PENDING") {
  const params = new URLSearchParams({ project, status });
  return request(`/api/latest-config?${params.toString()}`);
}

export function updateConfigStatus(
  configId: string,
  payload: { status: string; hangers_placed: number; sync_timestamp: string; synced_by: string },
) {
  return request(`/api/config-status/${configId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function submitScan(payload: ScanPayload) {
  return request("/api/scan-cable-tray", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
