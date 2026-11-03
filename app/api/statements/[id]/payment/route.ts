import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods, payments, statements } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";
import { getMembership } from "@/lib/server-data";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, rate } = await requireApiUser(request, { scope: "payments.verify", limit: 120, windowMs: 60 * 60_000, mutation: true });
    const membership = await getMembership(user.userId);
    if (!membership || !["admin", "treasurer"].includes(membership.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const body = await parseJsonObject(request);
    if (typeof body.paid !== "boolean") return NextResponse.json({ error: "Estado de pago inválido" }, { status: 422 });
    const { id } = await context.params;
    const db = getDb();
    const [record] = await db.select({ statement: statements, period: billingPeriods })
      .from(statements).innerJoin(billingPeriods, eq(statements.periodId, billingPeriods.id))
      .where(eq(statements.id, id)).limit(1);
    if (!record || record.period.communityId !== membership.communityId) return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 });
    const now = new Date().toISOString();
    const [existing] = await db.select().from(payments).where(eq(payments.statementId, id)).limit(1);
    if (body.paid) {
      const amount = typeof body.amount === "number" && Number.isSafeInteger(body.amount) && body.amount >= 0 ? body.amount : record.statement.total;
      const paidAt = typeof body.paidAt === "string" && Number.isFinite(Date.parse(body.paidAt)) ? new Date(body.paidAt).toISOString() : now;
      const method: "cash" | "other" | "transfer" = body.method === "cash" || body.method === "other" ? body.method : "transfer";
      const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 100) || null : null;
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null;
      const values = { amount, paidAt, method, reference, notes, status: "verified" as const, verifiedBy: user.userId, verifiedAt: now, updatedAt: now };
      if (existing) await db.update(payments).set(values).where(eq(payments.id, existing.id));
      else await db.insert(payments).values({ id: crypto.randomUUID(), statementId: id, ...values, createdAt: now });
      await db.update(statements).set({ status: "paid" }).where(eq(statements.id, id));
    } else {
      if (existing) await db.update(payments).set({ status: "rejected", verifiedBy: user.userId, verifiedAt: now, updatedAt: now }).where(eq(payments.id, existing.id));
      const fallbackStatus = ["published", "closed"].includes(record.period.status) ? "published" : "draft";
      await db.update(statements).set({ status: fallbackStatus }).where(eq(statements.id, id));
    }
    await recordAudit({
      communityId: membership.communityId, userId: user.userId,
      action: body.paid ? "payment.verified" : "payment.reverted", entityType: "statement", entityId: id,
      payload: { previous: { status: record.statement.status, payment: existing }, next: { paid: body.paid } }, createdAt: now,
    });
    return NextResponse.json({ ok: true }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
