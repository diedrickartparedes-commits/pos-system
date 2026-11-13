import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { ensureUser } from "@/lib/session";
const MAX_IMAGE_BYTES=4_000_000;
function detectImage(bytes:Uint8Array){
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
  if(bytes[0]===0x89&&String.fromCharCode(...bytes.slice(1,4))==="PNG")return "image/png";
  if(String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
  if(String.fromCharCode(...bytes.slice(4,8))==="ftyp"&&["avif","avis"].includes(String.fromCharCode(...bytes.slice(8,12))))return "image/avif";
  return null;
}
export async function POST(req:NextRequest){
  const denied=await ensureUser(req);if(denied)return denied;
  if(!process.env.BLOB_READ_WRITE_TOKEN)return NextResponse.json({error:"Product image storage is not configured. Add a Vercel Blob read/write token."},{status:503});
  const form=await req.formData().catch(()=>null);const file=form?.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"Choose an image file."},{status:400});
  if(file.size===0||file.size>MAX_IMAGE_BYTES)return NextResponse.json({error:"Image must be smaller than 4 MB."},{status:400});
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());const contentType=detectImage(bytes);
  if(!contentType)return NextResponse.json({error:"Use a JPEG, PNG, WebP, or AVIF image."},{status:400});
  const base=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,"-").slice(-90)||"product-image";
  try{const blob=await put(`products/${Date.now()}-${base}`,file,{access:"public",addRandomSuffix:true,contentType});return NextResponse.json({url:blob.url});}
  catch{return NextResponse.json({error:"Image upload failed. Check the connected Blob store."},{status:502});}
}
