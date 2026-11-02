import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import {
  auditLog,
  billingPeriods,
  meterReadings,
  meters,
  readingPhotos,
} from "@/db/schema";
import { calculatePeriod, canAccessProperty, getMembership } from "@/lib/server-data";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function integerField(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return null;
  return Number(value);
}

function sniffImageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const membership = await getMembership(user.userId);
  if (!membership || !["admin", "reader", "resident"].includes(membership.role)) {
    return NextResponse.json({ error: "Tu rol no permite ingresar lecturas" }, { status: 403 });
  }

  const form = await request.formData();
  const meterId = form.get("meterId");
  const periodId = form.get("periodId");
  const previousValue = integerField(form, "previousValue");
  const currentValue = integerField(form, "currentValue");
  const capturedAt = form.get("capturedAt");
  const file = form.get("photo");
  if (
    typeof meterId !== "string" ||
    typeof periodId !== "string" ||
    typeof capturedAt !== "string" ||
    previousValue === null ||
    currentValue === null ||
    !(file instanceof File)
  ) {
    return NextResponse.json({ error: "Datos de lectura incompletos" }, { status: 400 });
  }
  if (currentValue < previousValue) {
    return NextResponse.json({ error: "La lectura actual no puede ser menor que la anterior" }, { status: 422 });
  }
  if (!Number.isFinite(Date.parse(capturedAt))) {
    return NextResponse.json({ error: "Fecha de captura inválida" }, { status: 422 });
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "La foto debe ser JPEG, PNG o WebP y pesar hasta 5 MB" }, { status: 413 });
  }

  const db = getDb();
  const [meter] = await db.select().from(meters).where(eq(meters.id, meterId)).limit(1);
  const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, periodId)).limit(1);
  if (!meter || !meter.propertyId || !period || meter.communityId !== period.communityId) {
    return NextResponse.json({ error: "Medidor o período inválido" }, { status: 404 });
  }
  if (!["open", "review"].includes(period.status)) {
    return NextResponse.json({ error: "El período está cerrado para nuevas lecturas" }, { status: 409 });
  }
  if (!(await canAccessProperty(user.userId, meter.propertyId))) {
    return NextResponse.json({ error: "No puedes ingresar lecturas para esta vivienda" }, { status: 403 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detectedType = sniffImageType(bytes);
  if (!detectedType || detectedType !== file.type) {
    return NextResponse.json({ error: "El contenido de la foto no coincide con su formato" }, { status: 422 });
  }
  const digest = hex(await crypto.subtle.digest("SHA-256", arrayBuffer));
  const [duplicate] = await db.select().from(readingPhotos).where(eq(readingPhotos.sha256, digest)).limit(1);
  if (duplicate) {
    return NextResponse.json({ error: "Esta fotografía ya fue utilizada" }, { status: 409 });
  }

  const [existing] = await db.select().from(meterReadings).where(
    and(eq(meterReadings.meterId, meterId), eq(meterReadings.periodId, periodId)),
  ).limit(1);
  const readingId = existing?.id ?? crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const extension = detectedType === "image/jpeg" ? "jpg" : detectedType === "image/png" ? "png" : "webp";
  const objectKey = `${period.communityId}/${meter.propertyId}/${meter.id}/${period.id}/${photoId}.${extension}`;

  await env.BUCKET.put(objectKey, arrayBuffer, {
    httpMetadata: { contentType: detectedType, cacheControl: "private, no-store" },
    customMetadata: { sha256: digest, uploadedBy: user.userId, meterId, periodId },
  });
  try {
    if (existing) {
      await db.update(meterReadings).set({
        previousValue,
        currentValue,
        consumptionKwh: currentValue - previousValue,
        status: membership.role === "admin" ? "approved" : "submitted",
        capturedAt: new Date(capturedAt).toISOString(),
        submittedBy: user.userId,
        approvedBy: membership.role === "admin" ? user.userId : null,
      }).where(eq(meterReadings.id, readingId));
    } else {
      await db.insert(meterReadings).values({
        id: readingId,
        meterId,
        periodId,
        previousValue,
        currentValue,
        consumptionKwh: currentValue - previousValue,
        status: membership.role === "admin" ? "approved" : "submitted",
        capturedAt: new Date(capturedAt).toISOString(),
        submittedBy: user.userId,
        approvedBy: membership.role === "admin" ? user.userId : null,
        notes: null,
        createdAt: new Date().toISOString(),
      });
    }
    await db.insert(readingPhotos).values({
      id: photoId,
      readingId,
      objectKey,
      mimeType: detectedType,
      sizeBytes: file.size,
      sha256: digest,
      createdAt: new Date().toISOString(),
    });
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      communityId: period.communityId,
      userId: user.userId,
      action: "reading.photo_uploaded",
      entityType: "meter_reading",
      entityId: readingId,
      payload: JSON.stringify({ meterId, periodId, consumptionKwh: currentValue - previousValue, sha256: digest }),
      createdAt: new Date().toISOString(),
    });
    await calculatePeriod(periodId, user.userId);
  } catch (error) {
    await env.BUCKET.delete(objectKey);
    throw error;
  }

  return NextResponse.json({ ok: true, readingId, photoId });
}
