import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/** Wrap a route handler: AppErrors and validation errors become JSON responses. */
export function handle<Args extends unknown[]>(fn: (req: Request, ...args: Args) => Promise<Response | unknown>) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const out = await fn(req, ...args);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.code, message: err.message, ...err.details }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: "invalid_input", message: err.issues[0]?.message ?? "Nieprawidłowe dane.", issues: err.issues },
      { status: 400 },
    );
  }
  console.error("[api] unhandled", err);
  return NextResponse.json({ error: "internal", message: "Coś poszło nie tak. Spróbuj ponownie." }, { status: 500 });
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("invalid_json", "Nieprawidłowe żądanie.");
  }
  return schema.parse(body);
}

/**
 * CSRF guard for cookie-authenticated mutations. SameSite=Lax already stops
 * most cross-site POSTs; this also rejects any request whose Origin is not us.
 */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin fetches from older browsers, server-to-server calls
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || new URL(origin).host !== host) {
    throw new AppError("bad_origin", "Żądanie z niedozwolonego źródła.", 403);
  }
}

export const uuid = z.string().uuid();
