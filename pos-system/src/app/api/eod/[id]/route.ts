import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureUser } from "@/lib/session";
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){const denied=await ensureUser(req);if(denied)return denied;const id=Number((await params).id);if(!Number.isSafeInteger(id))return NextResponse.json({error:"Invalid report"},{status:400});try{await db.endOfDay.delete({where:{id}});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:"Report not found"},{status:404})}}
