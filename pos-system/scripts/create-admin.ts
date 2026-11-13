import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
async function main(){
  const username=process.env.ADMIN_USERNAME?.trim(); const password=process.env.ADMIN_PASSWORD;
  if(!username||!password||password.length<12) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 12 characters) in the command environment.");
  const existing=await db.user.findUnique({where:{username}});
  if(existing) throw new Error("That administrator username already exists; use the in-app password screen to change its password.");
  await db.user.create({data:{username,passwordHash:await bcrypt.hash(password,12)}});
  console.log(`Administrator ${username} created.`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1}).finally(()=>db.$disconnect());
