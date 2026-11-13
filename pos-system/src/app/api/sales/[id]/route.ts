import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureUser } from "@/lib/session";
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied=await ensureUser(_req);if(denied)return denied;
  const id = Number((await params).id); if (!Number.isSafeInteger(id)) return NextResponse.json({ error: "Invalid receipt" }, { status: 400 });
  const sale = await db.sale.findUnique({ where: { id }, include: { items: true } }); return sale ? NextResponse.json(sale) : NextResponse.json({ error: "Receipt not found" }, { status: 404 });
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied=await ensureUser(_req);if(denied)return denied;
  const id = Number((await params).id); if (!Number.isSafeInteger(id)) return NextResponse.json({ error: "Invalid sale" }, { status: 400 });
  const sale = await db.sale.findUnique({ where: { id } }); if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  if (sale.imported) return NextResponse.json({ error: "Imported historical sales are protected from deletion." }, { status: 409 });
  await db.sale.delete({ where: { id } }); return NextResponse.json({ ok: true });
}
