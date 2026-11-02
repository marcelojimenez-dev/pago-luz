import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { auditLog, billingPeriods, meters, properties } from "@/db/schema";
import { calculatePeriod, getMembership } from "@/lib/server-data";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const membership = await getMembership(user.userId);
  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede crear parcelas" }, { status: 403 });
  }
  const body = await request.json() as Record<string, unknown>;
  const parcelNumber = cleanText(body.parcelNumber, 20);
  const ownerLabel = cleanText(body.ownerLabel, 100);
  const serialNumber = cleanText(body.serialNumber, 60);
  const meterLabel = cleanText(body.meterLabel, 40) || "Parcela";
  const kind = body.kind === "well" ? "well" : "parcel";
  if (!parcelNumber || !ownerLabel || !serialNumber) {
    return NextResponse.json({ error: "Parcela, propietario y número de medidor son obligatorios" }, { status: 422 });
  }
  if (!/^[\p{L}\p{N} ._/-]+$/u.test(parcelNumber) || !/^[\p{L}\p{N} ._/-]+$/u.test(serialNumber)) {
    return NextResponse.json({ error: "La parcela o el medidor contienen caracteres no permitidos" }, { status: 422 });
  }
  const db = getDb();
  const [existingParcel] = await db.select().from(properties).where(eq(properties.parcelNumber, parcelNumber)).limit(1);
  if (existingParcel) return NextResponse.json({ error: "Ya existe una parcela con ese número" }, { status: 409 });
  const [existingMeter] = await db.select().from(meters).where(eq(meters.serialNumber, serialNumber)).limit(1);
  if (existingMeter) return NextResponse.json({ error: "Ya existe un medidor con ese número" }, { status: 409 });

  const propertyId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.insert(properties).values({ id: propertyId, communityId: membership.communityId, parcelNumber, ownerLabel, active: true, createdAt });
  await db.insert(meters).values({ id: crypto.randomUUID(), communityId: membership.communityId, propertyId, serialNumber, label: meterLabel, kind, active: true, createdAt });
  await db.insert(auditLog).values({ id: crypto.randomUUID(), communityId: membership.communityId, userId: user.userId, action: "property.created", entityType: "property", entityId: propertyId, payload: JSON.stringify({ parcelNumber, ownerLabel, serialNumber, kind }), createdAt });
  const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.communityId, membership.communityId)).limit(1);
  if (period) await calculatePeriod(period.id, user.userId);
  return NextResponse.json({ ok: true, propertyId });
}
