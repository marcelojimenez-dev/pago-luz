import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { billingPeriods, emailDeliveries, properties, statements, utilityBills } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { apiError, parseJsonObject, rateHeaders, requireApiUser } from "@/lib/api-security";
import { getMembership } from "@/lib/server-data";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, rate } = await requireApiUser(request, { scope: "emails.send", limit: 10, windowMs: 60 * 60_000, mutation: true });
    const membership = await getMembership(user.userId);
    if (!membership || !["admin", "treasurer"].includes(membership.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const body = await parseJsonObject(request);
    const requestedIds = Array.isArray(body.statementIds)
      ? [...new Set(body.statementIds.filter((value): value is string => typeof value === "string"))].slice(0, 30)
      : [];
    const { id: periodId } = await context.params;
    const db = getDb();
    const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, periodId)).limit(1);
    if (!period || period.communityId !== membership.communityId) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    const where = requestedIds.length
      ? and(eq(statements.periodId, periodId), inArray(statements.id, requestedIds))
      : eq(statements.periodId, periodId);
    const recipients = await db.select({ statement: statements, property: properties })
      .from(statements).innerJoin(properties, eq(statements.propertyId, properties.id)).where(where);
    const deliverable = recipients.filter(({ property }) => property.active && property.ownerEmail);
    if (!deliverable.length) return NextResponse.json({ error: "No hay liquidaciones seleccionadas con correo de propietario" }, { status: 422 });
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      return NextResponse.json({ error: "El envío automático aún no tiene proveedor de correo configurado", configurationRequired: true }, { status: 503, headers: rateHeaders(rate) });
    }
    const [bill] = await db.select().from(utilityBills).where(eq(utilityBills.periodId, periodId)).limit(1);
    const billObject = bill ? await env.BUCKET.get(bill.objectKey) : null;
    const attachment = billObject?.body ? { filename: `boleta-CGE-${bill!.invoiceNumber}.pdf`, content: arrayBufferToBase64(await billObject.arrayBuffer()) } : null;

    const results: Array<{ statementId: string; ok: boolean; recipient: string }> = [];
    for (const { statement, property } of deliverable) {
      const recipient = property.ownerEmail!;
      const subject = `Cobro de electricidad ${period.name} · Parcela ${property.parcelNumber}`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${statement.id}-${statement.calculatedAt}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128),
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [recipient],
          subject,
          text: emailText(period, property, statement),
          html: emailHtml(period, property, statement),
          ...(attachment ? { attachments: [attachment] } : {}),
        }),
      });
      let providerMessageId: string | null = null;
      let errorCode: string | null = null;
      try {
        const result = await response.json() as { id?: string; name?: string; message?: string };
        providerMessageId = response.ok ? result.id ?? null : null;
        errorCode = response.ok ? null : (result.name ?? `http_${response.status}`).slice(0, 80);
      } catch {
        errorCode = response.ok ? null : `http_${response.status}`;
      }
      const sentAt = new Date().toISOString();
      await db.insert(emailDeliveries).values({
        id: crypto.randomUUID(), statementId: statement.id, recipient, subject,
        status: response.ok ? "sent" : "failed", providerMessageId, errorCode,
        sentBy: user.userId, sentAt,
      });
      results.push({ statementId: statement.id, ok: response.ok, recipient });
    }
    await recordAudit({
      communityId: membership.communityId, userId: user.userId,
      action: "statements.email_batch_completed", entityType: "billing_period", entityId: periodId,
      payload: { requested: deliverable.length, sent: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length },
      createdAt: new Date().toISOString(),
    });
    const failed = results.filter((item) => !item.ok).length;
    return NextResponse.json({ ok: failed === 0, sent: results.length - failed, failed, results }, { status: failed ? 207 : 200, headers: rateHeaders(rate) });
  } catch (error) {
    return apiError(error);
  }
}

function emailText(period: typeof billingPeriods.$inferSelect, property: typeof properties.$inferSelect, statement: typeof statements.$inferSelect) {
  return [
    `Estimado/a ${property.ownerLabel},`, "",
    `Este es el consolidado de electricidad de la parcela ${property.parcelNumber} para ${period.name}.`,
    `Período medido: ${period.startDate} al ${period.endDate}`,
    `Consumo: ${statement.consumptionKwh} kWh`,
    `Energía: ${clp(statement.energyCharge)}`,
    `Punta: ${clp(statement.peakCharge)}`,
    `Cargo común: ${clp(statement.sharedCharge)}`,
    `Fondo común: ${clp(statement.maintenanceFund)}`,
    `Saldo anterior: ${clp(statement.previousBalance)}`,
    `TOTAL: ${clp(statement.total)}`,
    `Vencimiento: ${period.dueDate}`, "",
    "Este correo fue generado por Luz Clara · Rincón de Zapata.",
  ].join("\n");
}

function emailHtml(period: typeof billingPeriods.$inferSelect, property: typeof properties.$inferSelect, statement: typeof statements.$inferSelect) {
  const rows = [
    ["Consumo", `${statement.consumptionKwh} kWh`], ["Energía", clp(statement.energyCharge)],
    ["Punta", clp(statement.peakCharge)], ["Cargo común", clp(statement.sharedCharge)],
    ["Fondo común", clp(statement.maintenanceFund)], ["Saldo anterior", clp(statement.previousBalance)],
  ];
  return `<div style="font-family:Arial,sans-serif;color:#173f31;max-width:620px;margin:auto"><h1 style="color:#176b4d">Luz Clara</h1><p>Estimado/a ${escapeHtml(property.ownerLabel)},</p><p>Consolidado de electricidad de la <strong>parcela ${escapeHtml(property.parcelNumber)}</strong> para ${escapeHtml(period.name)}.</p><p>Medición: ${period.startDate} al ${period.endDate}</p><table style="width:100%;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:9px;border-bottom:1px solid #e5e7eb">${label}</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${value}</strong></td></tr>`).join("")}</table><p style="font-size:22px;background:#ecfdf5;padding:16px;border-radius:10px">Total: <strong>${clp(statement.total)}</strong></p><p>Vencimiento: <strong>${period.dueDate}</strong></p><p style="color:#64748b;font-size:12px">Correo generado por Luz Clara · Rincón de Zapata.</p></div>`;
}

function clp(value: number) { return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value); }
function escapeHtml(value: string) { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!); }
function arrayBufferToBase64(buffer: ArrayBuffer) { const bytes = new Uint8Array(buffer); let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(binary); }
