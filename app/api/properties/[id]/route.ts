import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods, meters, properties } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { calculatePeriod, getMembership } from "@/lib/server-data";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { user, rate } = await requireApiUser(request, { scope: "properties.update", limit: 60, windowMs: 60 * 60_000, mutation: true });
  const membership = await getMembership(user.userId);
  if (!membership || membership.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await context.params;
  const body = await parseJsonObject(request);
  const db = getDb();
  const [property] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  if (!property || property.communityId !== membership.communityId) return NextResponse.json({ error: "Parcela no encontrada" }, { status: 404 });
  if (typeof body.active === "boolean") {
    await db.update(properties).set({ active: body.active }).where(eq(properties.id, id));
    await db.update(meters).set({ active: body.active }).where(eq(meters.propertyId, id));
    await recordAudit({ communityId: membership.communityId, userId: user.userId, action: body.active ? "property.activated" : "property.deactivated", entityType: "property", entityId: id, payload: { previous: { active: property.active }, next: { active: body.active }, parcelNumber: property.parcelNumber } });
    const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.communityId, membership.communityId)).limit(1);
    if (period) await calculatePeriod(period.id, user.userId);
  } else {
    const ownerLabel = typeof body.ownerLabel === "string" ? body.ownerLabel.trim().slice(0, 100) : "";
    const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase().slice(0, 254) : "";
    if (!ownerLabel) return NextResponse.json({ error: "El nombre del propietario es obligatorio" }, { status: 422 });
    if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return NextResponse.json({ error: "El correo no es válido" }, { status: 422 });
    await db.update(properties).set({ ownerLabel, ownerEmail: ownerEmail || null }).where(eq(properties.id, id));
    await recordAudit({ communityId: membership.communityId, userId: user.userId, action: "property.owner_updated", entityType: "property", entityId: id, payload: { previous: { ownerLabel: property.ownerLabel, ownerEmail: property.ownerEmail }, next: { ownerLabel, ownerEmail: ownerEmail || null } } });
  }
  return NextResponse.json({ ok: true }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
