import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { adjustments, billingPeriods, statements } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";
import { calculatePeriod, getMembership } from "@/lib/server-data";

export async function POST(request: Request) {
  try {
    const { user, rate } = await requireApiUser(request, { scope: "adjustments.create", limit: 40, windowMs: 60 * 60_000, mutation: true });
    const membership = await getMembership(user.userId);
    if (!membership || !["admin", "treasurer"].includes(membership.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const body = await parseJsonObject(request);
    const statementId = typeof body.statementId === "string" ? body.statementId : "";
    const amount = typeof body.amount === "number" && Number.isSafeInteger(body.amount) && body.amount > 0 && body.amount <= 100_000_000 ? body.amount : null;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!statementId || amount === null || reason.length < 10) return NextResponse.json({ error: "Indica monto y una explicación de al menos 10 caracteres" }, { status: 422 });
    const db = getDb();
    const [record] = await db.select({ statement: statements, period: billingPeriods }).from(statements).innerJoin(billingPeriods, eq(statements.periodId, billingPeriods.id)).where(eq(statements.id, statementId)).limit(1);
    if (!record || record.period.communityId !== membership.communityId) return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 });
    if (!["open", "review"].includes(record.period.status)) return NextResponse.json({ error: "La compensación debe aplicarse en un período abierto o en revisión" }, { status: 409 });
    if (amount > Math.max(0, record.statement.total)) return NextResponse.json({ error: "La compensación no puede superar el total actual de la parcela" }, { status: 422 });
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db.insert(adjustments).values({ id, propertyId: record.statement.propertyId, sourcePeriodId: record.statement.periodId, applyPeriodId: record.statement.periodId, amount: -amount, reason, status: "applied", createdBy: user.userId, createdAt });
    await recordAudit({ communityId: membership.communityId, userId: user.userId, action: "adjustment.credit_applied", entityType: "adjustment", entityId: id, payload: { statementId, propertyId: record.statement.propertyId, previousTotal: record.statement.total, amount: -amount, reason }, createdAt });
    await calculatePeriod(record.statement.periodId, user.userId);
    return NextResponse.json({ ok: true, adjustmentId: id }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
