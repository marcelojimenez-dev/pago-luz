import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { billingPeriods } from "@/db/schema";
import { calculatePeriod, getMembership } from "@/lib/server-data";
import { apiError, rateHeaders, requireApiUser } from "@/lib/api-security";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
  const { user, rate } = await requireApiUser(request, { scope: "periods.calculate", limit: 20, windowMs: 10 * 60_000, mutation: true });
  const membership = await getMembership(user.userId);
  if (!membership || !["admin", "treasurer"].includes(membership.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await context.params;
  const [period] = await getDb().select().from(billingPeriods).where(eq(billingPeriods.id, id)).limit(1);
  if (!period || period.communityId !== membership.communityId) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
  await calculatePeriod(id, user.userId);
  return NextResponse.json({ ok: true }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
