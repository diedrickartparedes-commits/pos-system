import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { makeSession } from "@/lib/session";
const input = z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(200) });
export async function POST(req: NextRequest) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  const user = await db.user.findUnique({ where: { username: parsed.data.username } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  const token = await makeSession(user.id, user.username);
  const res = NextResponse.json({ username: user.username });
  res.cookies.set("mypos_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return res;
}
