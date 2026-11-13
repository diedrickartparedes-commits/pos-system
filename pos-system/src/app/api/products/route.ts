import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureUser } from "@/lib/session";
const productInput = z.object({ name: z.string().trim().min(1).max(150), price: z.coerce.number().finite().min(0), gst: z.coerce.number().min(0).max(100), taxExempt: z.boolean(), stock: z.coerce.number().int().min(0), image: z.string().max(255).nullable().optional(), description: z.string().max(5000).nullable().optional(), sku: z.string().max(80).nullable().optional(), cost: z.coerce.number().min(0).nullable().optional() });
export async function GET(req: NextRequest) {
  const denied=await ensureUser(req);if(denied)return denied;
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const products = await db.product.findMany({ where: { active: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: { name: "asc" } });
  return NextResponse.json(products);
}
export async function POST(req: NextRequest) {
  const denied=await ensureUser(req);if(denied)return denied;
  const data = productInput.safeParse(await req.json().catch(() => null)); if (!data.success) return NextResponse.json({ error: data.error.issues[0]?.message ?? "Invalid product" }, { status: 400 });
  try { const product = await db.product.create({ data: data.data }); return NextResponse.json(product, { status: 201 }); }
  catch (e) { return NextResponse.json({ error: "Could not save product. Check that its SKU is unique." }, { status: 409 }); }
}
