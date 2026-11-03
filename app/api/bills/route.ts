import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods, utilityBills } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, rateHeaders, requireApiUser } from "@/lib/api-security";
import { getMembership } from "@/lib/server-data";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const { user, rate } = await requireApiUser(request, { scope: "bills.upload", limit: 8, windowMs: 60 * 60_000, mutation: true });
    const membership = await getMembership(user.userId);
    if (!membership || !["admin", "treasurer"].includes(membership.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > MAX_PDF_BYTES + 512 * 1024) throw new ApiError("La boleta supera el máximo de 10 MB", 413);
    const form = await request.formData();
    const periodId = text(form, "periodId", 80);
    const invoiceNumber = text(form, "invoiceNumber", 80);
    const issuedAt = text(form, "issuedAt", 10);
    const dueDate = text(form, "dueDate", 10);
    const total = integer(form, "total");
    const consumptionKwh = integer(form, "consumptionKwh");
    const previousPaymentAmount = optionalInteger(form, "previousPaymentAmount");
    const previousPaymentAt = text(form, "previousPaymentAt", 10) || null;
    const file = form.get("bill");
    if (!periodId || !invoiceNumber || !DATE_PATTERN.test(issuedAt) || !DATE_PATTERN.test(dueDate) || total === null || consumptionKwh === null || !(file instanceof File)) return NextResponse.json({ error: "Datos de la boleta incompletos" }, { status: 422 });
    if (file.type !== "application/pdf" || file.size === 0 || file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "La boleta debe ser un PDF de hasta 10 MB" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "El archivo no contiene un PDF válido" }, { status: 422 });
    const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
    const db = getDb();
    const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, periodId)).limit(1);
    if (!period || period.communityId !== membership.communityId) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    const [duplicate] = await db.select().from(utilityBills).where(eq(utilityBills.sha256, digest)).limit(1);
    if (duplicate && duplicate.periodId !== periodId) return NextResponse.json({ error: "Esta boleta ya está asociada a otro período" }, { status: 409 });
    const [existing] = await db.select().from(utilityBills).where(eq(utilityBills.periodId, periodId)).limit(1);
    const id = existing?.id ?? crypto.randomUUID();
    const objectKey = `${period.communityId}/bills/${periodId}/${id}-${digest.slice(0, 12)}.pdf`;
    await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: "application/pdf", cacheControl: "private, no-store" }, customMetadata: { sha256: digest, invoiceNumber, uploadedBy: user.userId } });
    const now = new Date().toISOString();
    try {
      const values = { invoiceNumber, objectKey, mimeType: "application/pdf", sizeBytes: file.size, sha256: digest, issuedAt, dueDate, total, consumptionKwh, previousPaymentAmount, previousPaymentAt, updatedAt: now };
      if (existing) await db.update(utilityBills).set(values).where(eq(utilityBills.id, existing.id));
      else await db.insert(utilityBills).values({ id, periodId, ...values, status: "pending", paidAmount: null, paidAt: null, paymentReference: null, createdBy: user.userId, createdAt: now });
      await db.update(billingPeriods).set({ invoiceNumber, utilityTotal: total, masterKwh: consumptionKwh, dueDate }).where(eq(billingPeriods.id, periodId));
      await recordAudit({ communityId: membership.communityId, userId: user.userId, action: existing ? "utility_bill.replaced" : "utility_bill.uploaded", entityType: "utility_bill", entityId: id, payload: { previous: existing ? { invoiceNumber: existing.invoiceNumber, total: existing.total, consumptionKwh: existing.consumptionKwh, sha256: existing.sha256 } : null, next: { invoiceNumber, total, consumptionKwh, sha256: digest } }, createdAt: now });
    } catch (error) {
      await env.BUCKET.delete(objectKey);
      throw error;
    }
    if (existing && existing.objectKey !== objectKey) await env.BUCKET.delete(existing.objectKey);
    return NextResponse.json({ ok: true, billId: id }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}

function text(form: FormData, key: string, max: number) { const value = form.get(key); return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function integer(form: FormData, key: string) { const value = form.get(key); return typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null; }
function optionalInteger(form: FormData, key: string) { const value = form.get(key); return value === "" || value === null ? null : integer(form, key); }
function hex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
