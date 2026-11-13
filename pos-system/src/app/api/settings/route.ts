import { NextRequest,NextResponse } from "next/server";
import { ensureUser } from "@/lib/session";
export async function GET(req:NextRequest){const denied=await ensureUser(req);if(denied)return denied;return NextResponse.json({name:process.env.BUSINESS_NAME||"H&A Home Centre",address:process.env.BUSINESS_ADDRESS||"Palmar village palmar road",tin:process.env.BUSINESS_TIN||"242802",currency:process.env.BUSINESS_CURRENCY||"BZD",timezone:process.env.BUSINESS_TIMEZONE||"America/Belize"})}
