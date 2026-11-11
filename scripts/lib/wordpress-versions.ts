import { randomUUID } from 'node:crypto';
import type { Db } from '../../src/server/db';
import { fingerprint, validateWordPressExport } from '../../src/server/wordpress-migration';

/** A subsequent source observation never replaces an original archived identity. */
export async function archiveWordPressVersions(db:Db,input:unknown,options:{commit?:boolean}={}) {
 const data=validateWordPressExport(input);
 if(data.attachments.length)throw new Error('Version retention accepts record metadata only; migrate files through the verified archive.');
 return db.transaction(async tx=>{
  await tx.query('LOCK TABLE wordpress_records IN SHARE MODE');
  if(options.commit)await tx.query('LOCK TABLE wordpress_record_versions IN EXCLUSIVE MODE');
  const result={ready:0,unchanged:0,inserted:0,committed:!!options.commit};
  const plans=[];
  for(const record of data.records){
   const {rows:[parent]}=await tx.query('SELECT id,payload,checksum FROM wordpress_records WHERE source=$1 AND kind=$2 AND source_id=$3',[data.source,record.kind,record.sourceId]);
   if(!parent)throw new Error('Retain the original source identity before adding a version.');
   if(fingerprint(parent.payload)!==parent.checksum)throw new Error('Original source checksum does not verify.');
   const checksum=fingerprint(record.payload);
   const {rows:[previous]}=await tx.query('SELECT payload,checksum,baseline_checksum FROM wordpress_record_versions WHERE record_id=$1 AND checksum=$2',[parent.id,checksum]);
   if(previous&&(fingerprint(previous.payload)!==checksum||previous.baseline_checksum!==parent.checksum))throw new Error('Retained version checksum does not verify.');
   if(checksum===parent.checksum||previous){result.unchanged++;continue;}
   result.ready++;plans.push({parent,record,checksum});
  }
  if(options.commit)for(const {parent,record,checksum} of plans){
   await tx.query('INSERT INTO wordpress_record_versions(id,record_id,baseline_checksum,checksum,payload,captured_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),parent.id,parent.checksum,checksum,JSON.stringify(record.payload),data.capturedAt]);result.inserted++;
  }
  return result;
 });
}
