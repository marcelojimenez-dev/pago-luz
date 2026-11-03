import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods, utilityBills } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";
import { getMembership } from "@/lib/server-data";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, rate } = await requireApiUser(request, { scope: "bills.payment", limit: 30, windowMs: 60 * 60_000, mutation: true });
    const membership = await getMembership(user.userId);
    if (!membership || !["admin", "treasurer"].includes(membership.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const body = await parseJsonObject(request);
    if (typeof body.paid !== "boolean") return NextResponse.json({ error: "Estado inválido" }, { status: 422 });
    const { id } = await context.params;
    const db = getDb();
    const [record] = await db.select({ bill: utilityBills, communityId: billingPeriods.communityId }).from(utilityBills).innerJoin(billingPeriods, eq(utilityBills.periodId, billingPeriods.id)).where(eq(utilityBills.id, id)).limit(1);
    if (!record || record.communityId !== membership.communityId) return NextResponse.json({ error: "Boleta no encontrada" }, { status: 404 });
    const now = new Date().toISOString();
    const paidAt = typeof body.paidAt === "string" && Number.isFinite(Date.parse(body.paidAt)) ? new Date(body.paidAt).toISOString() : now;
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 120) || null : null;
    await db.update(utilityBills).set({ status: body.paid ? "paid" : "pending", paidAmount: body.paid ? record.bill.total : null, paidAt: body.paid ? paidAt : null, paymentReference: body.paid ? reference : null, updatedAt: now }).where(eq(utilityBills.id, id));
    await recordAudit({ communityId: membership.communityId, userId: user.userId, action: body.paid ? "utility_bill.payment_verified" : "utility_bill.payment_reverted", entityType: "utility_bill", entityId: id, payload: { previous: { status: record.bill.status, paidAmount: record.bill.paidAmount, paidAt: record.bill.paidAt }, next: { paid: body.paid, amount: body.paid ? record.bill.total : null, paidAt: body.paid ? paidAt : null } }, createdAt: now });
    return NextResponse.json({ ok: true }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
