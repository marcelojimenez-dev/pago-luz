import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { communityMembers } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { getMembership } from "@/lib/server-data";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";

const roles = new Set(["admin", "reader", "treasurer", "auditor", "resident"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
  const { user, rate } = await requireApiUser(request, { scope: "members.role", limit: 40, windowMs: 60 * 60_000, mutation: true });
  const actingMembership = await getMembership(user.userId);
  if (!actingMembership || actingMembership.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await context.params;
  const body = await parseJsonObject(request);
  if (typeof body.role !== "string" || !roles.has(body.role)) return NextResponse.json({ error: "Perfil inválido" }, { status: 422 });
  const db = getDb();
  const [target] = await db.select().from(communityMembers).where(and(eq(communityMembers.id, id), eq(communityMembers.communityId, actingMembership.communityId))).limit(1);
  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
  if (target.role === "admin" && body.role !== "admin") {
    const [count] = await db.select({ value: sql<number>`count(*)` }).from(communityMembers).where(and(eq(communityMembers.communityId, actingMembership.communityId), eq(communityMembers.role, "admin")));
    if (Number(count?.value ?? 0) <= 1) return NextResponse.json({ error: "La comunidad debe conservar al menos un administrador" }, { status: 409 });
  }
  await db.update(communityMembers).set({ role: body.role as typeof target.role }).where(eq(communityMembers.id, id));
  await recordAudit({ communityId: actingMembership.communityId, userId: user.userId, action: "member.role_changed", entityType: "community_member", entityId: id, payload: { previousRole: target.role, role: body.role } });
  return NextResponse.json({ ok: true }, { headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}
