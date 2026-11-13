import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
const input = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(200), confirmPassword: z.string().min(1) });
export async function POST(req: NextRequest) {
  const session = await requireUser(req); if (!session?.sub) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = input.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "New password must be at least 12 characters." }, { status: 400 });
  if(parsed.data.newPassword!==parsed.data.confirmPassword)return NextResponse.json({error:"New passwords do not match."},{status:400});
  const user = await db.user.findUnique({ where: { id: Number(session.sub) } });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) } });
  return NextResponse.json({ ok: true });
}
