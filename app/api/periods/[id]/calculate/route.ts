import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { calculatePeriod, getMembership } from "@/lib/server-data";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const membership = await getMembership(user.userId);
  if (!membership || !["admin", "treasurer"].includes(membership.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await context.params;
  await calculatePeriod(id, user.userId);
  return NextResponse.json({ ok: true });
}
