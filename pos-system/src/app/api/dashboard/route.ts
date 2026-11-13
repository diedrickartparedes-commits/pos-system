import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { localDateKey, nextDateKey, zonedMidnight } from "@/lib/dates";
import { ensureUser } from "@/lib/session";
export async function GET(req:NextRequest) {
  const denied=await ensureUser(req);if(denied)return denied;
  const today = localDateKey(new Date()); const start = zonedMidnight(today); const end = zonedMidnight(nextDateKey(today));
  const [productCount, stockAgg, lowStock, todayAgg, recent, monthly] = await Promise.all([
    db.product.count({ where: { active: true } }), db.product.aggregate({ where: { active: true }, _sum: { stock: true } }),
    db.product.findMany({ where: { active: true, stock: { lte: 2 } }, orderBy: { stock: "asc" }, take: 8 }),
    db.sale.aggregate({ where: { createdAt: { gte: start, lt: end } }, _sum: { total: true }, _count: { _all: true } }),
    db.sale.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { items: true } }),
    db.sale.aggregate({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, _sum: { total: true }, _count: { _all: true } })
  ]);
  return NextResponse.json({ today, productCount, unitsInStock: stockAgg._sum.stock ?? 0, lowStock, todaySales: todayAgg._sum.total ?? 0, todayTransactions: todayAgg._count._all, recent, monthSales: monthly._sum.total ?? 0, monthTransactions: monthly._count._all });
}
