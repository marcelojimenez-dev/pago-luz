import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { auditLog, billingPeriods, meters, properties } from "@/db/schema";
import { calculatePeriod, getMembership } from "@/lib/server-data";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const membership = await getMembership(user.userId);
  if (!membership || membership.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json() as { active?: unknown };
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "Estado inválido" }, { status: 422 });
  const db = getDb();
  const [property] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  if (!property || property.communityId !== membership.communityId) return NextResponse.json({ error: "Parcela no encontrada" }, { status: 404 });
  await db.update(properties).set({ active: body.active }).where(eq(properties.id, id));
  await db.update(meters).set({ active: body.active }).where(eq(meters.propertyId, id));
  await db.insert(auditLog).values({ id: crypto.randomUUID(), communityId: membership.communityId, userId: user.userId, action: body.active ? "property.activated" : "property.deactivated", entityType: "property", entityId: id, payload: JSON.stringify({ parcelNumber: property.parcelNumber, active: body.active }), createdAt: new Date().toISOString() });
  const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.communityId, membership.communityId)).limit(1);
  if (period) await calculatePeriod(period.id, user.userId);
  return NextResponse.json({ ok: true });
}
