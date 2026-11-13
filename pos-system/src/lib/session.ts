import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(secret);
};
export async function makeSession(userId: number, username: string) {
  return new SignJWT({ sub: String(userId), username }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(key());
}
export async function readToken(token?: string) {
  if (!token) return null;
  try { return (await jwtVerify(token, key())).payload; } catch { return null; }
}
export async function currentUser() {
  return readToken((await cookies()).get("mypos_session")?.value);
}
export function unauthorized() { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }
export async function requireUser(request: NextRequest) {
  return readToken(request.cookies.get("mypos_session")?.value);
}
export async function ensureUser(request: NextRequest) {
  return await requireUser(request) ? null : unauthorized();
}
