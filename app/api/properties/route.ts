import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods, meters, properties } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { calculatePeriod, getMembership } from "@/lib/server-data";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
  const { user, rate } = await requireApiUser(request, { scope: "properties.create", limit: 20, windowMs: 60 * 60_000, mutation: true });
  const membership = await getMembership(user.userId);
  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede crear parcelas" }, { status: 403 });
  }
  const body = await parseJsonObject(request);
  const parcelNumber = cleanText(body.parcelNumber, 20);
  const ownerLabel = cleanText(body.ownerLabel, 100);
  const ownerEmail = cleanText(body.ownerEmail, 254).toLowerCase();
  const serialNumber = cleanText(body.serialNumber, 60);
  const meterLabel = cleanText(body.meterLabel, 40) || "Parcela";
  const kind = body.kind === "well" ? "well" : "parcel";
  if (!parcelNumber || !ownerLabel || !serialNumber) {
    return NextResponse.json({ error: "Parcela, propietario y número de medidor son obligatorios" }, { status: 422 });
  }
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return NextResponse.json({ error: "El correo del propietario no es válido" }, { status: 422 });
  }
  if (!/^[\p{L}\p{N} ._/-]+$/u.test(parcelNumber) || !/^[\p{L}\p{N} ._/-]+$/u.test(serialNumber)) {
    return NextResponse.json({ error: "La parcela o el medidor contienen caracteres no permitidos" }, { status: 422 });
  }
  const db = getDb();
  const [existingParcel] = await db.select().from(properties).where(and(eq(properties.communityId, membership.communityId), eq(properties.parcelNumber, parcelNumber))).limit(1);
  if (existingParcel) return NextResponse.json({ error: "Ya existe una parcela con ese número" }, { status: 409 });
  const [existingMeter] = await db.select().from(meters).where(and(eq(meters.communityId, membership.communityId), eq(meters.serialNumber, serialNumber))).limit(1);
  if (existingMeter) return NextResponse.json({ error: "Ya existe un medidor con ese número" }, { status: 409 });

  const propertyId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.insert(properties).values({ id: propertyId, communityId: membership.communityId, parcelNumber, ownerLabel, ownerEmail: ownerEmail || null, active: true, createdAt });
  await db.insert(meters).values({ id: crypto.randomUUID(), communityId: membership.communityId, propertyId, serialNumber, label: meterLabel, kind, active: true, createdAt });
  await recordAudit({ communityId: membership.communityId, userId: user.userId, action: "property.created", entityType: "property", entityId: propertyId, payload: { parcelNumber, ownerLabel, ownerEmail: ownerEmail || null, serialNumber, kind }, createdAt });
  const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.communityId, membership.communityId)).limit(1);
  if (period) await calculatePeriod(period.id, user.userId);
  return NextResponse.json({ ok: true, propertyId }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
