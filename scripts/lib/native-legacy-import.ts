import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../src/server/db';
import { fingerprint, type WordPressExport } from '../../src/server/wordpress-migration';
import { importNativeParticipantCredentials } from '../../src/server/native-participant-auth';

const passwordHash = z.string().max(255).refine(value =>
 /^\$wp\$2[ayb]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(value) ||
 /^\$P\$[./A-Za-z0-9]{31}$/.test(value)&&'./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.indexOf(value[3])>=7&&'./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.indexOf(value[3])<=20,
 'A supported legacy password hash is required.');
const accountSchema = z.object({
 sourceUserId:z.string().regex(/^[1-9][0-9]{0,19}$/),
 username:z.string().trim().min(1).max(60).refine(value=>![...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)),
 email:z.string().trim().toLowerCase().pipe(z.email().max(254)),
 name:z.string().max(254), passwordHash, active:z.boolean(),
 credentialFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const accountsSchema = z.object({
 format:z.literal('yes-native-accounts/v1'), source:z.url(),
 capturedAt:z.iso.datetime({offset:true}), accounts:z.array(accountSchema),
}).strict();
export type NativeAccountExport = z.infer<typeof accountsSchema>;
const staffMappingsSchema=z.object({
 format:z.literal('yes-native-staff-mappings/v1'),source:z.url(),mappings:z.array(z.object({
  sourceUserId:z.string().regex(/^[1-9][0-9]{0,19}$/),userId:z.uuid(),expectedRole:z.enum(['owner','admin']),sourceChecksum:z.string().regex(/^[a-f0-9]{64}$/),
 }).strict()),
}).strict();
export type NativeStaffMappings=z.infer<typeof staffMappingsSchema>;
export function validateStaffMappings(input:unknown):NativeStaffMappings {
 const result=staffMappingsSchema.parse(input),ids=new Set<string>(),users=new Set<string>();
 for(const mapping of result.mappings){
  if(ids.has(mapping.sourceUserId)||users.has(mapping.userId))throw new Error('Duplicate reviewed staff mapping.');
  ids.add(mapping.sourceUserId);users.add(mapping.userId);
 }
 return result;
}
export type NativeImportIssue = {sourceUserId:string;reason:string};
export class NativeImportConflict extends Error {
 constructor(public issues:NativeImportIssue[]) { super('Native account identities need reconciliation; no account changes were committed.'); }
}
export function validateNativeAccounts(input:unknown):NativeAccountExport {
 const data=accountsSchema.parse(input),url=new URL(data.source);
 if(url.protocol!=='https:'||url.origin!==data.source)throw new Error('Use the exact HTTPS source origin.');
 const ids=new Set<string>(),names=new Set<string>(),emails=new Set<string>();
 for(const account of data.accounts){
  const username=account.username.toLowerCase();
  if(ids.has(account.sourceUserId)||names.has(username)||emails.has(account.email))throw new Error('Duplicate source account identity, username or email.');
  ids.add(account.sourceUserId);names.add(username);emails.add(account.email);
 }
 return data;
}

/** Retains exact current form checksums, including reversion to an original payload. */
export function currentFormSnapshot(data:WordPressExport):WordPressExport['records'][number] {
 const forms=Object.fromEntries(data.records.filter(record=>record.kind==='form'&&/^[1-9][0-9]*$/.test(record.sourceId))
  .map(record=>[record.sourceId,fingerprint(record.payload)]));
 if(!Object.keys(forms).length)throw new Error('The current form snapshot is empty.');
 return {kind:'option',sourceId:'native-current-forms:'+data.capturedAt,
  payload:{format:'yes-native-form-snapshot/v1',capturedAt:data.capturedAt,forms}};
}

/** Pins every current source payload, including exact reversions and legacy records. */
export function currentSourceSnapshot(data:WordPressExport):WordPressExport['records'][number] {
 const records=Object.fromEntries(['user','entry','school','form','option','post'].map(kind=>[kind,
  Object.fromEntries(data.records.filter(record=>record.kind===kind).map(record=>[record.sourceId,fingerprint(record.payload)]))]));
 return {kind:'option',sourceId:'native-current-records:'+data.capturedAt,
  payload:{format:'yes-native-source-snapshot/v1',capturedAt:data.capturedAt,records}};
}

type User = {id:string;role:string;contact:string;active:boolean;password_hash:string|null;has_totp?:boolean};
type Binding = User & {source_user_id:string;credential_fingerprint:string};
type Claim = {source_user_id:string;user_id:string;source_checksum:string;checksum:string;payload:Record<string,unknown>;verified_contact:string};

/** Source IDs authorize reuse. Contact text alone never claims an existing user. */
export async function importNativeLegacyAccounts(db:Db,input:unknown,options:{commit?:boolean;staffMappings?:unknown;sourceUsers?:WordPressExport['records']}={}) {
 const data=validateNativeAccounts(input);
 const reviewed=options.staffMappings===undefined?undefined:validateStaffMappings(options.staffMappings);
 if(reviewed&&reviewed.source!==data.source)throw new Error('Reviewed staff mappings belong to another source.');
 const staffBySource=new Map((reviewed?.mappings??[]).map(mapping=>[mapping.sourceUserId,mapping]));
 if([...staffBySource.keys()].some(id=>!data.accounts.some(account=>account.sourceUserId===id)))throw new Error('Reviewed staff mapping has no current source account.');
 const sourceUsers=new Map((options.sourceUsers??[]).filter(record=>record.kind==='user').map(record=>[record.sourceId,record.payload]));
 return db.transaction(async tx=>{
  if(options.commit)await tx.query('LOCK TABLE supabase_identities,wordpress_account_identities,wordpress_user_links,users,native_participant_accounts IN EXCLUSIVE MODE');
  const {rows:bindings}=await tx.query<Binding>('SELECT u.id,u.role,u.contact,u.active,u.password_hash,u.totp_secret IS NOT NULL has_totp,w.source_user_id,w.credential_fingerprint FROM wordpress_account_identities w JOIN users u ON u.id=w.user_id WHERE w.source=$1',[data.source]);
  const bound=new Map(bindings.map(row=>[row.source_user_id,row]));
  const {rows:claims}=await tx.query<Claim>("SELECT r.source_id source_user_id,l.user_id,l.source_checksum,r.checksum,r.payload,i.verified_contact FROM wordpress_user_links l JOIN wordpress_records r ON r.id=l.record_id JOIN supabase_identities i ON i.auth_user_id=l.auth_user_id AND i.user_id=l.user_id WHERE r.source=$1 AND r.kind='user'",[data.source]);
  const claimed=new Map(claims.map(row=>[row.source_user_id,row]));
  const {rows:users}=await tx.query<User>('SELECT id,role,contact,active,password_hash,totp_secret IS NOT NULL has_totp FROM users');
  const byId=new Map(users.map(user=>[user.id,user]));
  const contacts=new Map<string,User[]>();
  for(const user of users){const contact=user.contact.trim().toLowerCase();contacts.set(contact,[...(contacts.get(contact)??[]),user]);}
  const {rows:native}=await tx.query<{user_id:string;username:string;verified_contact:string}>('SELECT user_id,username,verified_contact FROM native_participant_accounts');
  const nativeByUser=new Map(native.map(row=>[row.user_id,row]));
  const nativeNames=new Map(native.map(row=>[row.username.trim().toLowerCase(),row.user_id]));
  const {rows:allBindings}=await tx.query<{source:string;source_user_id:string;user_id:string}>('SELECT source,source_user_id,user_id FROM wordpress_account_identities');
  const sourceByUser=new Map(allBindings.map(row=>[row.user_id,row]));
  const issues:NativeImportIssue[]=[],plans=[];
  for(const account of data.accounts){
   const old=bound.get(account.sourceUserId),claim=claimed.get(account.sourceUserId);
   if(old&&claim&&claim.user_id!==old.id){
    issues.push({sourceUserId:account.sourceUserId,reason:'conflicting-explicit-source-links'});continue;
   }
   const staff=staffBySource.get(account.sourceUserId);
   if(staff){
    const payload=sourceUsers.get(account.sourceUserId),user=byId.get(staff.userId),profile=nativeByUser.get(staff.userId),link=sourceByUser.get(staff.userId);
    const capabilities=Array.isArray(payload?.meta)?payload.meta.filter((item):item is {meta_key:string;meta_value:Record<string,unknown>}=>
     !!item&&typeof item==='object'&&typeof item.meta_key==='string'&&item.meta_key.endsWith('_capabilities')&&!!item.meta_value&&typeof item.meta_value==='object'&&!Array.isArray(item.meta_value)):[];
    if(!payload||String(payload.ID)!==account.sourceUserId||fingerprint(payload)!==staff.sourceChecksum||capabilities.length!==1||capabilities[0].meta_value.administrator!==true){
     issues.push({sourceUserId:account.sourceUserId,reason:'reviewed-staff-source-evidence'});continue;
    }
    if(!user||user.role!==staff.expectedRole||!user.active||!account.active||user.contact.trim().toLowerCase()!==account.email||!user.has_totp||!/^scrypt-32768-8-3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(user.password_hash??'')||profile){
     issues.push({sourceUserId:account.sourceUserId,reason:'reviewed-staff-native-evidence'});continue;
    }
    if(old&&old.id!==user.id||claim&&claim.user_id!==user.id||link&&(link.source!==data.source||link.source_user_id!==account.sourceUserId)){
     issues.push({sourceUserId:account.sourceUserId,reason:'reviewed-staff-source-binding-conflict'});continue;
    }
    plans.push({account,user,old,create:false,profile:undefined,staff:true});continue;
   }
   let user:User|undefined=old;
   if(!user&&claim){
    if(claim.source_checksum!==claim.checksum||fingerprint(claim.payload)!==claim.checksum||claim.verified_contact.trim().toLowerCase()!==account.email){
     issues.push({sourceUserId:account.sourceUserId,reason:'archived-claim-integrity'});continue;
    }
    user=byId.get(claim.user_id);
    if(!user){issues.push({sourceUserId:account.sourceUserId,reason:'claimed-user-missing'});continue;}
   }
   if(user){
    if(user.role!=='participant'||user.contact.trim().toLowerCase()!==account.email){
     issues.push({sourceUserId:account.sourceUserId,reason:'linked-role-or-contact-conflict'});continue;
    }
    const link=sourceByUser.get(user.id);
    if(link&&(link.source!==data.source||link.source_user_id!==account.sourceUserId)){
     issues.push({sourceUserId:account.sourceUserId,reason:'source-identity-already-claimed'});continue;
    }
   }else{
    if(contacts.has(account.email)){issues.push({sourceUserId:account.sourceUserId,reason:'unlinked-native-contact'});continue;}
    user={id:randomUUID(),role:'participant',contact:account.email,active:account.active,password_hash:null};
   }
   const profile=nativeByUser.get(user.id),named=nativeNames.get(account.username.toLowerCase());
   if(named&&named!==user.id||profile&&(profile.username.trim().toLowerCase()!==account.username.toLowerCase()||profile.verified_contact.trim().toLowerCase()!==account.email)){
    issues.push({sourceUserId:account.sourceUserId,reason:'native-username-or-contact-conflict'});continue;
   }
   if(profile&&old&&old.credential_fingerprint!==account.credentialFingerprint&&user.password_hash!==account.passwordHash){
    issues.push({sourceUserId:account.sourceUserId,reason:'source-credentials-changed-after-native-import'});continue;
   }
   plans.push({account,user,old,create:!byId.has(user.id),profile,staff:false});
   nativeNames.set(account.username.toLowerCase(),user.id);
  }
  if(issues.length)throw new NativeImportConflict(issues);
  const report={sourceAccounts:data.accounts.length,participantAccounts:plans.filter(plan=>!plan.staff).length,staffAccounts:plans.filter(plan=>plan.staff).length,ready:plans.filter(plan=>!plan.staff&&!plan.profile).length,createdUsers:0,linkedSourceIdentities:0,credentialsImported:0,preservedStaff:0,unchanged:0,inactive:plans.filter(plan=>!plan.account.active||!plan.user.active).length,committed:!!options.commit};
  if(!options.commit)return report;
  for(const {account,user,old,create,staff} of plans){
   if(create){await tx.query("INSERT INTO users(id,role,contact,name,active) VALUES($1,'participant',$2,$3,$4)",[user.id,account.email,account.name,account.active]);report.createdUsers++;}
   if(!account.active&&user.active)await tx.query('UPDATE users SET active=false,updated_at=now() WHERE id=$1',[user.id]);
   if(!old){await tx.query('INSERT INTO wordpress_account_identities(source,source_user_id,user_id,credential_fingerprint) VALUES($1,$2,$3,$4)',[data.source,account.sourceUserId,user.id,account.credentialFingerprint]);report.linkedSourceIdentities++;}
   if(staff)report.preservedStaff++;
   else{
    const imported=await importNativeParticipantCredentials(tx,user.id,{username:account.username,email:account.email,passwordHash:account.passwordHash});
    if(imported.imported)report.credentialsImported++;else report.unchanged++;
   }
   if(old&&old.credential_fingerprint!==account.credentialFingerprint)await tx.query('UPDATE wordpress_account_identities SET credential_fingerprint=$3,updated_at=now() WHERE source=$1 AND source_user_id=$2',[data.source,account.sourceUserId,account.credentialFingerprint]);
  }
  await tx.query("INSERT INTO audit_events(id,action,entity_type,entity_id,detail) VALUES($1,'migration.native-accounts','source',$2,$3)",[randomUUID(),data.source,JSON.stringify({...report,capturedAt:data.capturedAt})]);
  return report;
 });
}
