import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureUser } from "@/lib/session";
const schema = z.object({ delta: z.coerce.number().int().refine(v => v !== 0), reason: z.string().trim().min(2).max(240) });
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied=await ensureUser(_req);if(denied)return denied;
  const id=Number((await params).id);if(!Number.isSafeInteger(id))return NextResponse.json({error:"Invalid product"},{status:400});
  return NextResponse.json(await db.inventoryAdjustment.findMany({where:{productId:id},orderBy:{createdAt:"desc"},take:100}));
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied=await ensureUser(req);if(denied)return denied;
  const id = Number((await params).id); const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!Number.isSafeInteger(id) || !parsed.success) return NextResponse.json({ error: "Enter a nonzero quantity change and reason." }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      const product = await tx.product.findUniqueOrThrow({ where: { id } });
      if (product.stock + parsed.data.delta < 0) throw new Error("Stock cannot be negative.");
      const updated = await tx.product.update({ where: { id }, data: { stock: { increment: parsed.data.delta } } });
      await tx.inventoryAdjustment.create({ data: { productId: id, delta: parsed.data.delta, reason: parsed.data.reason } }); return updated;
    }); return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Adjustment failed." }, { status: 400 }); }
}
