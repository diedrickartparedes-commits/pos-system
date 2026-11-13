import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("mypos_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (token && secret) {
    try { await jwtVerify(token, new TextEncoder().encode(secret)); return NextResponse.next(); } catch { /* send to login */ }
  }
  if (request.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL("/login", request.url); url.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!login|uploads/|logo\\.png|_next/static|_next/image|favicon.ico|icon.png).*)"] };
