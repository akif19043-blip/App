"use client";

/** Thin fetch wrapper for the JSON API. Throws ApiError with the server's message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; okStatuses?: number[] } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !init.okStatuses?.includes(res.status)) {
    throw new ApiError(res.status, data.error ?? "error", data.message ?? "Coś poszło nie tak.", data);
  }
  return data as T;
}
