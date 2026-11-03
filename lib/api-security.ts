import "server-only";

import { lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { rateLimits } from "@/db/schema";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "private, no-store", ...error.headers } },
    );
  }
  console.error("Unhandled API error", error);
  return NextResponse.json(
    { error: "No fue posible completar la solicitud" },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new ApiError("Solicitud de origen no permitido", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError("Solicitud de origen no permitido", 403);
  }
}

export async function requireApiUser(
  request: Request,
  options: { scope: string; limit: number; windowMs: number; mutation?: boolean },
) {
  if (options.mutation) assertSameOrigin(request);
  const user = await getChatGPTUser();
  if (!user) throw new ApiError("No autenticado", 401);
  const rate = await enforceRateLimit(user.userId, options.scope, options.limit, options.windowMs);
  return { user, rate };
}

export async function parseJsonObject(request: Request, maxBytes = 64 * 1024) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new ApiError("Se requiere contenido JSON", 415);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new ApiError("Solicitud demasiado grande", 413);
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError("Contenido JSON inválido", 400);
  }
}

export function rateHeaders(rate: { limit: number; remaining: number; resetAt: number }) {
  return {
    "RateLimit-Limit": String(rate.limit),
    "RateLimit-Remaining": String(rate.remaining),
    "RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)),
    "Cache-Control": "private, no-store",
  };
}

async function enforceRateLimit(userId: string, scope: string, limit: number, windowMs: number) {
  const now = Date.now();
  const resetAt = Math.floor(now / windowMs) * windowMs + windowMs;
  const identity = await sha256(`${scope}:${userId}`);
  const key = `${scope}:${identity}:${resetAt}`;
  const db = getDb();
  const [row] = await db.insert(rateLimits).values({ key, count: 1, resetAt })
    .onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  const count = Number(row?.count ?? 1);
  if ((crypto.getRandomValues(new Uint8Array(1))[0] & 63) === 0) {
    await db.delete(rateLimits).where(lt(rateLimits.resetAt, now));
  }
  if (count > limit) {
    throw new ApiError("Demasiadas solicitudes. Intenta nuevamente en unos minutos.", 429, {
      "Retry-After": String(Math.max(1, Math.ceil((resetAt - now) / 1000))),
      "RateLimit-Limit": String(limit),
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
    });
  }
  return { limit, remaining: Math.max(0, limit - count), resetAt };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
