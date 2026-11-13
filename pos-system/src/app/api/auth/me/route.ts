import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
export async function GET(req:NextRequest){const session=await requireUser(req);return session?NextResponse.json({username:session.username}):NextResponse.json({error:"Authentication required"},{status:401})}
