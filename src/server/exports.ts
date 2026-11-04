import ExcelJS from 'exceljs';
import type { Db } from './db';
import { type Actor,AppError,audit,id,requireAdmin } from './core';
import { adminList } from './admin';
import { csvCell } from '../domain/rules';
const columns:Record<string,string[]>={schools:['id','reference','name','address','city','state','postal_code','status','registered_at'],students:['id','reference','name','guardian_contact','emergency_contact','created_at'],entries:['id','reference','title','student_name','school_name','class','category_id','state','revision','submitted_at','platform_url'],reviews:['id','reference','judge_id','round_id','revision','rubric_version','scores','comment','submitted_at']};
export async function exportData(db:Db,actor:Actor,params:URLSearchParams){
 requireAdmin(actor);const resource=params.get('resource')??'entries';const fields=columns[resource];if(!fields)throw new AppError(422,'Select schools, students, entries or reviews.');
 const format=params.get('format')??'csv';if(!['csv','xlsx'].includes(format))throw new AppError(422,'Select CSV or XLSX.');
 await audit(db,actor,'export.download','exports',id(),{resource,format,filters:Object.fromEntries(params)});
 const filters=new URLSearchParams(params);filters.set('pageSize','100');filters.set('page','1');
 const first=await adminList(db,actor,resource,filters) as {items:any[];total:number};
 if(format==='xlsx'&&first.total>10000)throw new AppError(422,'Narrow the filters to 10,000 rows for XLSX or use streaming CSV.');
 const values=(row:any)=>fields.map(k=>k==='platform_url'?`/entries/${row.id}`:typeof row[k]==='object'?JSON.stringify(row[k]):row[k]??'');
 if(format==='csv'){
  const encoder=new TextEncoder();let page=0,ended=false;
  const stream=new ReadableStream({async pull(controller){try{
   if(ended){controller.close();return;}
   if(!page)controller.enqueue(encoder.encode('\uFEFF'+fields.map(csvCell).join(',')+'\r\n'));
   page++;filters.set('page',String(page));
   // Re-check current account for every export page; deactivation stops subsequent chunks.
   const {rows:[user]}=await db.query('SELECT active,role FROM users WHERE id=$1',[actor.id]);if(!user?.active||!['owner','admin'].includes(user.role))throw new AppError(403,'Access revoked.');
   const result=page===1?first:await adminList(db,actor,resource,filters) as {items:any[];total:number};
   controller.enqueue(encoder.encode(result.items.map(row=>values(row).map(csvCell).join(',')).join('\r\n')+'\r\n'));ended=result.items.length<100||page*100>=result.total;
  }catch(error){controller.error(error);}}});
  return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${resource}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet(resource);sheet.addRow(fields);
 for(let page=1;page<=Math.max(1,Math.ceil(first.total/100));page++){filters.set('page',String(page));const data=page===1?first:await adminList(db,actor,resource,filters) as {items:any[]};for(const row of data.items)sheet.addRow(values(row).map(value=>String(value)));}
 const buffer=await workbook.xlsx.writeBuffer();return new Response(new Uint8Array(buffer as ArrayBuffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${resource}.xlsx"`,'Cache-Control':'no-store'}});
}
