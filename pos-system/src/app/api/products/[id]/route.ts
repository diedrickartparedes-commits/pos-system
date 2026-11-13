import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureUser } from "@/lib/session";
const schema = z.object({ name: z.string().trim().min(1).max(150), price: z.coerce.number().min(0), gst: z.coerce.number().min(0).max(100), taxExempt: z.boolean(), stock: z.coerce.number().int().min(0), image: z.string().max(255).nullable().optional(), description: z.string().max(5000).nullable().optional(), sku: z.string().max(80).nullable().optional(), cost: z.coerce.number().min(0).nullable().optional() });
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied=await ensureUser(req);if(denied)return denied;
  const id = Number((await params).id); if (!Number.isSafeInteger(id)) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  const data = schema.safeParse(await req.json().catch(() => null)); if (!data.success) return NextResponse.json({ error: data.error.issues[0]?.message }, { status: 400 });
  try {
    const product=await db.$transaction(async tx=>{
      const before=await tx.product.findUniqueOrThrow({where:{id}});
      const updated=await tx.product.update({where:{id},data:data.data});
      if(updated.stock!==before.stock)await tx.inventoryAdjustment.create({data:{productId:id,delta:updated.stock-before.stock,reason:"Stock changed while editing product"}});
      return updated;
    });
    return NextResponse.json(product);
  } catch { return NextResponse.json({ error: "Product could not be updated." }, { status: 404 }); }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied=await ensureUser(_req);if(denied)return denied;
  const id = Number((await params).id); if (!Number.isSafeInteger(id)) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  try { return NextResponse.json(await db.product.update({ where: { id }, data: { active: false } })); } catch { return NextResponse.json({ error: "Product not found." }, { status: 404 }); }
}
