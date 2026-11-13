import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureUser } from "@/lib/session";
const input = z.object({ items: z.array(z.object({ productId: z.number().int().positive(), qty: z.number().int().positive().max(999), discount: z.number().min(0) })).min(1), cash: z.number().min(0), idempotencyKey: z.string().uuid(), customerName: z.string().max(120).optional() });
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export async function GET(req: NextRequest) {
  const denied=await ensureUser(req);if(denied)return denied;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const sales = await db.sale.findMany({ where: q ? { OR: [{ id: Number(q) || -1 }, { customerName: { contains: q, mode: "insensitive" } }] } : {}, include: { items: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  return NextResponse.json(sales);
}
export async function POST(req: NextRequest) {
  const denied=await ensureUser(req);if(denied)return denied;
  const parsed = input.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  try {
    const sale = await db.$transaction(async tx => {
      const prior = await tx.sale.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { items: true } }); if (prior) return prior;
      const ids = [...new Set(parsed.data.items.map(i => i.productId))];
      const products = await tx.product.findMany({ where: { id: { in: ids }, active: true } });
      if (products.length !== ids.length) throw new Error("A product in this cart is no longer available.");
      const productMap = new Map(products.map(p => [p.id, p])); let subtotal = 0; let gstTotal = 0;
      const lines = parsed.data.items.map(item => {
        const p = productMap.get(item.productId)!; if (item.qty > p.stock) throw new Error(`Insufficient stock for ${p.name}.`);
        const gross = cents(Number(p.price) * item.qty); if (item.discount > gross) throw new Error(`Discount exceeds line amount for ${p.name}.`);
        const lineSubtotal = cents(gross - item.discount); const lineGst = p.taxExempt ? 0 : cents(lineSubtotal * Number(p.gst) / 100);
        subtotal += lineSubtotal; gstTotal += lineGst;
        return { p, qty: item.qty, discount: item.discount, lineSubtotal, lineGst };
      });
      subtotal = cents(subtotal); gstTotal = cents(gstTotal); const total = cents(subtotal + gstTotal);
      if (parsed.data.cash < total) throw new Error("Cash received must cover the sale total.");
      for (const line of lines) {
        const changed = await tx.product.updateMany({ where: { id: line.p.id, active: true, stock: { gte: line.qty } }, data: { stock: { decrement: line.qty } } });
        if (changed.count !== 1) throw new Error(`Insufficient stock for ${line.p.name}.`);
      }
      return tx.sale.create({ data: { subtotal, gstTotal, total, saleDate: new Date(), cash: parsed.data.cash, changeAmount: cents(parsed.data.cash - total), idempotencyKey: parsed.data.idempotencyKey, customerName: parsed.data.customerName || null, items: { create: lines.map(l => ({ productId: l.p.id, productName: l.p.name, taxExempt: l.p.taxExempt, qty: l.qty, price: l.p.price, gst: l.lineGst, subtotal: l.lineSubtotal, discount: l.discount, gstRate: l.p.taxExempt ? 0 : l.p.gst })) } }, include: { items: true } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(sale, { status: 201 });
  } catch (e) {
    const code=(e as {code?:string})?.code;
    if(code==="P2002"||code==="P2034"){
      const prior=await db.sale.findUnique({where:{idempotencyKey:parsed.data.idempotencyKey},include:{items:true}}).catch(()=>null);
      if(prior)return NextResponse.json(prior,{status:200});
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 400 });
  }
}
