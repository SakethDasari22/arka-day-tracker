"use client";

/** Small typed fetch wrapper for the client screens. Throws on non-2xx. */
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function nowTime(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
