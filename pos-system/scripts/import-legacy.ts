import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";

type Row=Record<string,unknown>;
type ParseResult={tables:Record<string,Row[]>;source:string;warnings:string[]};
const report:Record<string,any>={startedAt:new Date().toISOString(),tables:{},manualReview:[],warnings:[]};

function readSqlValue(raw:string):unknown {
  const s=raw.trim(); if(s.toUpperCase()==="NULL")return null;
  if(s.startsWith("'")&&s.endsWith("'"))return s.slice(1,-1).replace(/\\([\\'"nrt0bZ])/g,(_m,c:string)=>({"\\":"\\","'":"'",'"':'"',n:"\n",r:"\r",t:"\t",0:"\0",b:"\b",Z:"\x1a"}[c]??c)).replace(/''/g,"'");
  if(/^-?\d+$/.test(s))return Number(s); if(/^-?\d+\.\d+$/.test(s))return Number(s); return s;
}
function splitSqlValues(input:string):string[][] {
  const tuples:string[][]=[]; let fields:string[]=[]; let token=""; let quote=false; let escaped=false; let depth=0; let inTuple=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quote){token+=c;if(escaped){escaped=false;continue}if(c==="\\"){escaped=true;continue}if(c==="'"){if(input[i+1]==="'"){token+=input[++i];continue}quote=false}continue}
    if(c==="'"){quote=true;token+=c;inTuple=true;continue}
    if(c==="("){if(depth===0){fields=[];token="";inTuple=true}else token+=c;depth++;continue}
    if(c===")"){depth--;if(depth===0){fields.push(token.trim());tuples.push(fields);token="";inTuple=false}else token+=c;continue}
    if(depth>0&&c===","){fields.push(token.trim());token="";continue}
    if(depth>0)token+=c;
  }
  return tuples;
}
function parseSql(text:string):ParseResult{
  const tables:Record<string,Row[]>={};const warnings:string[]=[];
  const re=/INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);/gi; let match:RegExpExecArray|null;
  while((match=re.exec(text))){const table=match[1];const columns=match[2].split(",").map(v=>v.trim().replace(/^`|`$/g,""));const rows=splitSqlValues(match[3]).map(tuple=>Object.fromEntries(columns.map((col,i)=>[col,readSqlValue(tuple[i]??"NULL")])));(tables[table]??=[]).push(...rows)}
  for(const name of ["products","sales","sale_items","end_of_day","cash_drawer"])if(!tables[name])warnings.push(`SQL dump has no INSERT records for ${name}.`);
  return {tables,source:"mysql-sql-dump",warnings};
}
function csvRecords(text:string){const rows:string[][]=[];let row:string[]=[],field="",quoted=false;const s=text.replace(/^\uFEFF/,"");for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'&&s[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c;continue}if(c==='"'){quoted=true;continue}if(c===","){row.push(field);field="";continue}if(c==="\n"){row.push(field.replace(/\r$/, ""));field="";rows.push(row);row=[];continue}field+=c}if(field.length||row.length){row.push(field.replace(/\r$/, ""));rows.push(row)}return rows}
function parseCsvTables(text:string):ParseResult{
  const tables:Record<string,Row[]>={};const warnings:string[]=[];let active="";let header:string[]=[];
  const types:Record<string,string>={
    "id,opening,closing,expected,difference,created_at":"cash_drawer",
    "id,report_date,total_sales,cash_received,expected_cash,actual_cash,float_amount,difference,created_at":"end_of_day",
    "id,name,price,gst,tax_exempt,stock,image,description":"products",
    "id,subtotal,gst_total,total,created_at,sale_date,cash,change_amount,gst":"sales",
    "id,sale_id,product_id,product_name,tax_exempt,qty,price,gst,subtotal,discount,gst_rate":"sale_items",
    "id,username,password":"users"
  };
  for(const cells of csvRecords(text)){if(cells[0]?.trim().toLowerCase()==="id"&&cells.length>1){header=cells.map(x=>x.trim().toLowerCase());active=types[header.join(",")]??"";continue}if(!active||!cells.length)continue;const vals=Object.fromEntries(header.map((h,i)=>[h,cells[i]??""]));if(!/^\d+$/.test(String(vals.id??"")))continue;(tables[active]??=[]).push(Object.fromEntries(Object.entries(vals).map(([k,v])=>[k,v===""?null:v])))}
  if(!tables.products?.length)warnings.push("No product rows could be read from the stitched CSV export.");
  if(!tables.sales?.length)warnings.push("No sales rows could be read from the stitched CSV export.");
  if(!tables.sale_items?.length)warnings.push("No sale-item rows could be read from the stitched CSV export.");
  return {tables,source:"stitched-multitable-csv",warnings};
}
function mismatchedIds(left:Row[],right:Row[],fields:string[]){const a=new Map(left.map(r=>[Number(r.id),r]));const b=new Map(right.map(r=>[Number(r.id),r]));return Object.fromEntries(fields.map(field=>[field,[...a.keys()].filter(id=>b.has(id)&&!sameNumber(a.get(id)?.[field],b.get(id)?.[field]))])) as Record<string,number[]>}
function sameNumber(a:unknown,b:unknown){if((a===null||a===undefined)&&(b===null||b===undefined))return true;if(a===null||a===undefined||b===null||b===undefined)return false;return Number(a)===Number(b)}
function auditLineTotals(sales:Row[],items:Row[]){const lines=new Map<number,number>();for(const item of items){if(item.sale_id==null)continue;const id=Number(item.sale_id);const amount=Math.round(((Number(item.subtotal)||0)+(Number(item.gst)||0))*100);lines.set(id,(lines.get(id)||0)+amount)}const mismatches=sales.flatMap(s=>{const id=Number(s.id);const recorded=Math.round((Number(s.total)||0)*100);const lineAmount=lines.get(id)??0;return recorded===lineAmount?[]:[{saleId:id,recordedTotal:(recorded/100).toFixed(2),lineSubtotalAndGst:(lineAmount/100).toFixed(2),difference:((recorded-lineAmount)/100).toFixed(2)}]});return {salesCompared:sales.length,mismatchedSales:mismatches.length,mismatches}}
function val(row:Row,key:string, fallback:any=null){return row[key]===undefined?fallback:row[key]}
function int(row:Row,key:string,fallback=0){const n=Number(val(row,key,fallback));if(!Number.isSafeInteger(n))throw new Error(`Invalid integer in ${key}`);return n}
function dec(row:Row,key:string,fallback:number|null=null){const v=val(row,key,fallback);if(v===null||v==="")return null;const n=Number(v);if(!Number.isFinite(n))throw new Error(`Invalid decimal in ${key}`);return n}
function date(row:Row,key:string,fallback?:Date){const v=val(row,key,null);if(v===null)return fallback??null;const s=String(v);const d=new Date(s.includes("T")?s:s.replace(" ","T")+"Z");if(Number.isNaN(+d))throw new Error(`Invalid date in ${key}: ${s}`);return d}
function mapProduct(r:Row){if(r.name==null||r.price==null)throw new Error("Product is missing name or price");const now=new Date();return {id:int(r,"id"),name:String(r.name),price:dec(r,"price")!,gst:dec(r,"gst",0)??0,taxExempt:Boolean(Number(val(r,"tax_exempt",0))),stock:int(r,"stock",0),image:val(r,"image")?String(r.image):null,description:val(r,"description")?String(r.description):null,active:true,createdAt:now,updatedAt:now}}
function mapSale(r:Row){if(r.total==null)throw new Error("Sale is missing its total");const createdAt=date(r,"created_at",new Date())!;if(r.subtotal==null||r.gst_total==null)report.manualReview.push({table:"sales",id:r.id,reason:"Source sale subtotal and/or GST total is null; original total is preserved and receipt breakdown uses stored line values."});return {id:int(r,"id"),subtotal:dec(r,"subtotal"),gstTotal:dec(r,"gst_total"),total:dec(r,"total")!,createdAt,saleDate:date(r,"sale_date",createdAt)!,cash:dec(r,"cash"),changeAmount:dec(r,"change_amount"),gst:dec(r,"gst",0)??0,customerName:val(r,"customer_name")?String(r.customer_name):null,customerNote:val(r,"customer_note")?String(r.customer_note):null,imported:true}}
function mapItem(r:Row,productNames:Map<number,string>){if(r.sale_id==null||r.price==null||r.qty==null)throw new Error("Sale item is missing sale, quantity, or price");const productId=r.product_id==null?null:int(r,"product_id");const sourceName=val(r,"product_name");const inferred=!sourceName;const name=sourceName?String(sourceName):(productId?productNames.get(productId):null)??`Legacy item ${productId??"unknown"}`;if(inferred)report.manualReview.push({table:"sale_items",id:r.id,reason:`Source item name missing; used ${productNames.has(productId??-1)?"the source product catalog name":"a legacy placeholder"} for display. Historical amounts remain unchanged.`});return {id:int(r,"id"),saleId:int(r,"sale_id"),productId,productName:name,productNameInferred:inferred,taxExempt:Boolean(Number(val(r,"tax_exempt",0))),qty:int(r,"qty"),price:dec(r,"price")!,gst:dec(r,"gst",0)??0,subtotal:dec(r,"subtotal",0)??0,discount:dec(r,"discount",0)??0,gstRate:dec(r,"gst_rate",0)??0}}
function mapEod(r:Row){return {id:int(r,"id"),reportDate:date(r,"report_date"),totalSales:dec(r,"total_sales"),cashReceived:dec(r,"cash_received"),expectedCash:dec(r,"expected_cash"),actualCash:dec(r,"actual_cash"),floatAmount:dec(r,"float_amount"),difference:dec(r,"difference"),createdAt:date(r,"created_at",new Date())!}}
function mapDrawer(r:Row){return {id:int(r,"id"),opening:dec(r,"opening"),closing:dec(r,"closing"),expected:dec(r,"expected"),difference:dec(r,"difference"),createdAt:date(r,"created_at",new Date())!}}
async function importRows<T extends {id:number}>(name:string,rows:Row[],mapper:(r:Row)=>T,exists:(id:number)=>Promise<boolean>,createMany:(data:T[])=>Promise<{count:number}>,inputCount=rows.length){
  const reviewStart=report.manualReview.length;
  const mapped:T[]=[];for(const row of rows){try{mapped.push(mapper(row))}catch(e){report.manualReview.push({table:name,id:row.id??null,reason:e instanceof Error?e.message:String(e)})}}
  let inserted=0,duplicates=0,failed=0;for(const row of mapped){if(await exists(row.id)){duplicates++;continue}try{const created=await createMany([row]);if(created.count===0)duplicates++;else inserted++}catch(e){failed++;report.manualReview.push({table:name,id:row.id,reason:e instanceof Error?e.message:String(e)})}}
  const manualReview=report.manualReview.slice(reviewStart).filter((entry:any)=>entry.table===name).length;
  report.tables[name]={sourceRecords:inputCount,validRows:mapped.length,imported:inserted,duplicates,failed,manualReview};
}
async function main(){
 const args=process.argv.slice(2);const file=args.find(v=>!v.startsWith("--"));if(!file)throw new Error("Usage: npm run import:legacy -- <path-to-pos_db.sql-or-csv> [--inventory-csv <path-to-products.csv>]");const sourcePath=path.resolve(file);const raw=await fs.readFile(sourcePath,"utf8");
 const parsed=sourcePath.toLowerCase().endsWith(".csv")?parseCsvTables(raw):parseSql(raw);report.source=parsed.source;report.sourceFile=path.basename(sourcePath);report.warnings=parsed.warnings;
 const csvArg=args.indexOf("--inventory-csv");let csvProducts:Row[]|null=null;
 if(csvArg>=0&&args[csvArg+1]){const cp=path.resolve(args[csvArg+1]);const csv=parseCsvTables(await fs.readFile(cp,"utf8"));csvProducts=csv.tables.products??[];report.inventorySnapshotFile=path.basename(cp);const sourceProducts=parsed.tables.products??[];const byId=new Map(sourceProducts.map(p=>[Number(p.id),p]));let changed=0,added=0;for(const p of csvProducts){const id=Number(p.id);const old=byId.get(id);if(old){if(Number(old.stock??0)!==Number(p.stock??0))changed++;byId.set(id,{...old,stock:p.stock});}else{added++;byId.set(id,p)}}parsed.tables.products=[...byId.values()];report.inventorySnapshotComparison={csvProducts:csvProducts.length,dumpProducts:sourceProducts.length,stockValuesDifferent:changed,productsOnlyInCsv:added,policy:"CSV stock is authoritative when supplied; products absent from the snapshot retain the SQL dump stock."};
  const sqlSales=parsed.tables.sales??[],csvSales=csv.tables.sales??[];const sqlSaleById=new Map(sqlSales.map(s=>[Number(s.id),s]));const csvSaleById=new Map(csvSales.map(s=>[Number(s.id),s]));const sqlItems=parsed.tables.sale_items??[],csvItems=csv.tables.sale_items??[];const sqlItemIds=new Set(sqlItems.map(r=>Number(r.id))),csvItemIds=new Set(csvItems.map(r=>Number(r.id)));const saleFinancialMismatches=mismatchedIds(sqlSales,csvSales,["total","subtotal","gst_total","cash","change_amount"]);const lineFinancialMismatches=mismatchedIds(sqlItems,csvItems,["price","gst","subtotal","discount"]);const mismatchCount=[...Object.values(saleFinancialMismatches),...Object.values(lineFinancialMismatches)].reduce((n,ids)=>n+ids.length,0);report.sourceCrossCheck={sqlSales:sqlSales.length,csvSales:csvSales.length,salesOnlyInSql:[...sqlSaleById.keys()].filter(id=>!csvSaleById.has(id)),salesOnlyInCsv:[...csvSaleById.keys()].filter(id=>!sqlSaleById.has(id)),saleFinancialMismatches,lineFinancialMismatches,sqlSaleItems:sqlItems.length,csvSaleItems:csvItems.length,saleItemsOnlyInSql:[...sqlItemIds].filter(id=>!csvItemIds.has(id)),saleItemsOnlyInCsv:[...csvItemIds].filter(id=>!sqlItemIds.has(id))};
  if(changed||added||mismatchCount||report.sourceCrossCheck.salesOnlyInSql.length||report.sourceCrossCheck.salesOnlyInCsv.length||report.sourceCrossCheck.saleItemsOnlyInSql.length||report.sourceCrossCheck.saleItemsOnlyInCsv.length)report.manualReview.push({table:"source-comparison",reason:"The SQL dump and CSV differ in product stock or historical transaction/line coverage; inspect sourceCrossCheck and inventorySnapshotComparison."});}
 report.sourceCounts={products:(parsed.tables.products??[]).length,historicalTransactions:(parsed.tables.sales??[]).length,receiptRecords:(parsed.tables.sales??[]).length,receiptLineItems:(parsed.tables.sale_items??[]).length,endOfDayReports:(parsed.tables.end_of_day??[]).length,cashDrawerRecords:(parsed.tables.cash_drawer??[]).length,sourceUsersExcluded:(parsed.tables.users??[]).length};
 report.lineToSaleReconciliation=auditLineTotals(parsed.tables.sales??[],parsed.tables.sale_items??[]);if(report.lineToSaleReconciliation.mismatchedSales)report.manualReview.push({table:"sales",reason:`${report.lineToSaleReconciliation.mismatchedSales} stored sale totals differ from the sum of their stored line subtotals and GST; source amounts are preserved.`});
 const tx=db;
 await importRows("products",parsed.tables.products??[],mapProduct,id=>tx.product.findUnique({where:{id},select:{id:true}}).then(Boolean),async data=>tx.product.createMany({data,skipDuplicates:true}));
 if(parsed.tables.sales){await importRows("sales",parsed.tables.sales,mapSale,id=>tx.sale.findUnique({where:{id},select:{id:true}}).then(Boolean),async data=>tx.sale.createMany({data,skipDuplicates:true}));}
 if(parsed.tables.sale_items){const productNames=new Map((parsed.tables.products??[]).map(p=>[Number(p.id),String(p.name??"")]));await importRows("sale_items",parsed.tables.sale_items,r=>mapItem(r,productNames),async id=>Boolean(await tx.saleItem.findUnique({where:{id},select:{id:true}})),async data=>tx.saleItem.createMany({data,skipDuplicates:true}));}
 if(parsed.tables.cash_drawer){await importRows("cash_drawer",parsed.tables.cash_drawer,mapDrawer,async id=>Boolean(await tx.cashDrawer.findUnique({where:{id},select:{id:true}})),async data=>tx.cashDrawer.createMany({data,skipDuplicates:true}));}
 if(parsed.tables.end_of_day){await importRows("end_of_day",parsed.tables.end_of_day,mapEod,async id=>Boolean(await tx.endOfDay.findUnique({where:{id},select:{id:true}})),async data=>tx.endOfDay.createMany({data,skipDuplicates:true}));}
 for(const table of ["products","sales","sale_items","cash_drawer","end_of_day"]){try{await db.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"','id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), EXISTS(SELECT 1 FROM "${table}"))`)}catch{ /* Empty/import-only table sequences will be checked at next insert. */}}
 const [p,s,i,e,c]=await Promise.all([db.product.count({where:{active:true}}),db.sale.count({where:{imported:true}}),db.saleItem.count({where:{sale:{is:{imported:true}}}}),db.endOfDay.count(),db.cashDrawer.count()]);report.destination={activeProducts:p,importedSales:s,importedSaleItems:i,endOfDayReports:e,cashDrawerRecords:c};
 const importedSalesTotal=(await db.sale.aggregate({where:{imported:true},_sum:{total:true}}))._sum.total?.toString()??"0.00";const sourceSales=parsed.tables.sales??[];const sourceTotal=sourceSales.reduce((n,r)=>n+(Number(r.total)||0),0);report.financialReconciliation={sourceSalesRows:sourceSales.length,sourceSalesTotal:sourceTotal.toFixed(2),destinationImportedSalesTotal:importedSalesTotal,delta:(Number(importedSalesTotal)-sourceTotal).toFixed(2),note:"The importer preserves each stored historical total; it does not recalculate transaction amounts or change stock for historical sales."};
 report.finishedAt=new Date().toISOString();const reportPath=path.resolve(`import-report-${Date.now()}.json`);await fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));console.log(`Report saved to ${reportPath}`);
}
main().catch(e=>{console.error(e instanceof Error?e.stack:e);process.exitCode=1}).finally(()=>db.$disconnect());
