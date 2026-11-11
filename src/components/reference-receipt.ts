type RecordData=Record<string,any>;
export function pendingSubmittedRecord(previous:RecordData,receipt:RecordData):RecordData{
 return {id:previous.id,form_key:previous.form_key,reference:receipt.reference||previous.reference,status:'submitted',receipt,files:previous.files||[],details_pending:true};
}
export async function loadSubmittedRecord(previous:RecordData,receipt:RecordData,read:()=>Promise<RecordData>):Promise<RecordData>{
 try{
  const saved=await read();
  if(saved.id!==previous.id||saved.status!=='submitted'||saved.receipt?.reference!==receipt.reference)throw new Error('Submitted record readback did not match.');
  return saved;
 }catch{return pendingSubmittedRecord(previous,receipt);}
}
