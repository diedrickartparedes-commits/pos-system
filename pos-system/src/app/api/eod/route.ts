import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureUser } from "@/lib/session";
import { localDateKey, nextDateKey, zonedMidnight } from "@/lib/dates";
const input = z.object({ floatAmount: z.number().min(0), actualCash: z.number().min(0) });
export async function GET(req:NextRequest) { const denied=await ensureUser(req);if(denied)return denied;return NextResponse.json(await db.endOfDay.findMany({ orderBy: [{ reportDate: "desc" }, { id: "desc" }], take: 200 })); }
export async function POST(req: NextRequest) {
  const denied=await ensureUser(req);if(denied)return denied;
  const parsed = input.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Enter valid drawer amounts." }, { status: 400 });
  const dateKey = localDateKey(new Date()); const from = zonedMidnight(dateKey); const until = zonedMidnight(nextDateKey(dateKey));
  const sales = await db.sale.aggregate({ where: { createdAt: { gte: from, lt: until } }, _sum: { total: true, cash: true, changeAmount: true } });
  const totalSales = Number(sales._sum.total ?? 0); const cashReceived = Number(sales._sum.cash ?? 0) - Number(sales._sum.changeAmount ?? 0); const expectedCash = parsed.data.floatAmount + cashReceived;
  const report = await db.endOfDay.create({ data: { reportDate: from, totalSales, cashReceived, expectedCash, actualCash: parsed.data.actualCash, floatAmount: parsed.data.floatAmount, difference: parsed.data.actualCash - expectedCash } });
  return NextResponse.json(report, { status: 201 });
}
