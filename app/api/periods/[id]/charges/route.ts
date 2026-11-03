import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";
import { calculatePeriod, getMembership } from "@/lib/server-data";

function amount(value: unknown, max = 100_000_000) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, rate } = await requireApiUser(request, { scope: "periods.charges", limit: 30, windowMs: 60 * 60_000, mutation: true });
    const membership = await getMembership(user.userId);
    if (!membership || !["admin", "treasurer"].includes(membership.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const body = await parseJsonObject(request);
    const sharedPool = amount(body.sharedPool);
    const maintenanceFundPerProperty = amount(body.maintenanceFundPerProperty, 10_000_000);
    const readingServiceTotal = amount(body.readingServiceTotal);
    if (sharedPool === null || maintenanceFundPerProperty === null || readingServiceTotal === null) {
      return NextResponse.json({ error: "Los montos deben ser enteros positivos dentro del rango permitido" }, { status: 422 });
    }
    const { id } = await context.params;
    const db = getDb();
    const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, id)).limit(1);
    if (!period || period.communityId !== membership.communityId) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    if (period.status === "closed") return NextResponse.json({ error: "Un período cerrado no permite modificar cargos" }, { status: 409 });
    const next = { sharedPool, maintenanceFundPerProperty, readingServiceTotal };
    await db.update(billingPeriods).set(next).where(eq(billingPeriods.id, id));
    await recordAudit({
      communityId: membership.communityId, userId: user.userId,
      action: "period.common_charges_updated", entityType: "billing_period", entityId: id,
      payload: { previous: { sharedPool: period.sharedPool, maintenanceFundPerProperty: period.maintenanceFundPerProperty, readingServiceTotal: period.readingServiceTotal }, next },
      createdAt: new Date().toISOString(),
    });
    await calculatePeriod(id, user.userId);
    return NextResponse.json({ ok: true }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
