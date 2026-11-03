import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { calculatePeriod, getMembership } from "@/lib/server-data";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { user, rate } = await requireApiUser(request, { scope: "periods.dates", limit: 30, windowMs: 60 * 60_000, mutation: true });
  const membership = await getMembership(user.userId);
  if (!membership || !["admin", "treasurer"].includes(membership.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await parseJsonObject(request);
  if (!validDate(body.startDate) || !validDate(body.endDate) || !validDate(body.dueDate)) {
    return NextResponse.json({ error: "Las fechas ingresadas no son válidas" }, { status: 422 });
  }
  if (body.startDate > body.endDate) {
    return NextResponse.json({ error: "La fecha de término debe ser posterior al inicio" }, { status: 422 });
  }
  if (body.dueDate < body.endDate) {
    return NextResponse.json({ error: "El vencimiento no puede ser anterior al término de la medición" }, { status: 422 });
  }
  const { id } = await context.params;
  const db = getDb();
  const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, id)).limit(1);
  if (!period || period.communityId !== membership.communityId) {
    return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
  }
  if (period.status === "closed") {
    return NextResponse.json({ error: "Un período cerrado no permite cambiar fechas" }, { status: 409 });
  }
  await db.update(billingPeriods).set({ startDate: body.startDate, endDate: body.endDate, dueDate: body.dueDate }).where(eq(billingPeriods.id, id));
  await recordAudit({
    communityId: membership.communityId,
    userId: user.userId,
    action: "period.dates_updated",
    entityType: "billing_period",
    entityId: id,
    payload: { previous: { startDate: period.startDate, endDate: period.endDate, dueDate: period.dueDate }, next: body },
    createdAt: new Date().toISOString(),
  });
  await calculatePeriod(id, user.userId);
  return NextResponse.json({ ok: true }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
