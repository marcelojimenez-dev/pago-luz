import "server-only";

import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

type AuditEvent = {
  communityId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  createdAt?: string;
};

export async function recordAudit(event: AuditEvent) {
  const db = getDb();
  const [previous] = await db.select({ entryHash: auditLog.entryHash }).from(auditLog)
    .where(eq(auditLog.communityId, event.communityId)).orderBy(desc(auditLog.createdAt)).limit(1);
  const id = crypto.randomUUID();
  const createdAt = event.createdAt ?? new Date().toISOString();
  const payload = JSON.stringify(event.payload ?? {});
  const previousHash = previous?.entryHash ?? "GENESIS";
  const canonical = canonicalEntry({ id, communityId: event.communityId, userId: event.userId, action: event.action, entityType: event.entityType, entityId: event.entityId, payload, createdAt, previousHash });
  const entryHash = await sign(canonical);
  await db.insert(auditLog).values({ id, communityId: event.communityId, userId: event.userId, action: event.action, entityType: event.entityType, entityId: event.entityId, payload, previousHash, entryHash, createdAt });
  return { id, entryHash };
}

export async function verifyAuditEntry(entry: typeof auditLog.$inferSelect) {
  if (!entry.entryHash || !entry.previousHash) return false;
  const canonical = canonicalEntry({ id: entry.id, communityId: entry.communityId, userId: entry.userId, action: entry.action, entityType: entry.entityType, entityId: entry.entityId, payload: entry.payload, createdAt: entry.createdAt, previousHash: entry.previousHash });
  return timingSafeEqual(entry.entryHash, await sign(canonical));
}

function canonicalEntry(value: Record<string, string>) {
  return [value.id, value.communityId, value.userId, value.action, value.entityType, value.entityId, value.payload, value.createdAt, value.previousHash].join("\u001f");
}

async function sign(value: string) {
  const data = new TextEncoder().encode(value);
  if (env.AUDIT_SIGNING_KEY) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AUDIT_SIGNING_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await crypto.subtle.sign("HMAC", key, data));
  }
  return hex(await crypto.subtle.digest("SHA-256", data));
}

function hex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function timingSafeEqual(left: string, right: string) { if (left.length !== right.length) return false; let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index); return mismatch === 0; }
