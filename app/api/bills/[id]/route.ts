import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { billingPeriods, utilityBills } from "@/db/schema";
import { apiError, rateHeaders, requireApiUser } from "@/lib/api-security";
import { getMembership } from "@/lib/server-data";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, rate } = await requireApiUser(request, { scope: "bills.read", limit: 60, windowMs: 60_000 });
    const membership = await getMembership(user.userId);
    if (!membership || !["admin", "treasurer", "auditor"].includes(membership.role)) return new Response("No autorizado", { status: 403 });
    const { id } = await context.params;
    const [record] = await getDb().select({ bill: utilityBills, communityId: billingPeriods.communityId }).from(utilityBills).innerJoin(billingPeriods, eq(utilityBills.periodId, billingPeriods.id)).where(eq(utilityBills.id, id)).limit(1);
    if (!record || record.communityId !== membership.communityId) return new Response("No encontrado", { status: 404 });
    const object = await env.BUCKET.get(record.bill.objectKey);
    if (!object?.body) return new Response("No encontrado", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="boleta-${record.bill.invoiceNumber}.pdf"`, "X-Content-Type-Options": "nosniff", ...rateHeaders(rate) } });
  } catch (error) {
    return apiError(error);
  }
}
