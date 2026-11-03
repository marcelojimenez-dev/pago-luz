import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { meterReadings, meters, readingPhotos } from "@/db/schema";
import { canAccessProperty } from "@/lib/server-data";
import { apiError, rateHeaders, requireApiUser } from "@/lib/api-security";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
  const { user, rate } = await requireApiUser(request, { scope: "photos.read", limit: 120, windowMs: 60_000 });
  const { id } = await context.params;
  const db = getDb();
  const [record] = await db.select({
    objectKey: readingPhotos.objectKey,
    mimeType: readingPhotos.mimeType,
    propertyId: meters.propertyId,
  }).from(readingPhotos)
    .innerJoin(meterReadings, eq(readingPhotos.readingId, meterReadings.id))
    .innerJoin(meters, eq(meterReadings.meterId, meters.id))
    .where(eq(readingPhotos.id, id))
    .limit(1);
  if (!record?.propertyId) return new Response("No encontrado", { status: 404 });
  if (!(await canAccessProperty(user.userId, record.propertyId))) {
    return new Response("No autorizado", { status: 403 });
  }
  const object = await env.BUCKET.get(record.objectKey);
  if (!object?.body) return new Response("No encontrado", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": "inline; filename=lectura-medidor",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      ...rateHeaders(rate),
    },
  });
  } catch (error) {
    return apiError(error);
  }
}
