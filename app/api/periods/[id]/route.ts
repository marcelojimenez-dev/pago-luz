import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { auditLog, billingPeriods } from "@/db/schema";
import { calculatePeriod, getMembership } from "@/lib/server-data";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const membership = await getMembership(user.userId);
  if (!membership || !["admin", "treasurer"].includes(membership.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await request.json() as { startDate?: unknown; endDate?: unknown; dueDate?: unknown };
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
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    communityId: membership.communityId,
    userId: user.userId,
    action: "period.dates_updated",
    entityType: "billing_period",
    entityId: id,
    payload: JSON.stringify({ previous: { startDate: period.startDate, endDate: period.endDate, dueDate: period.dueDate }, next: body }),
    createdAt: new Date().toISOString(),
  });
  await calculatePeriod(id, user.userId);
  return NextResponse.json({ ok: true });
}
