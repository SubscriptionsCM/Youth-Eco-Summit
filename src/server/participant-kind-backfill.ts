import type {Db} from './db';
import {AppError,id} from './core';
import {fingerprint} from './wordpress-migration';

type Kind='student'|'educator'|'school';
type User={id:string;participant_kind:string};
type Binding={user_id:string;source:string;source_user_id:string};
type Archive={id:string;source:string;source_id:string;kind:string;payload:Record<string,unknown>;checksum:string;baseline_checksum?:string};
type Signup={user_id:string;form_key:string};
type LegacySignup={registration_nonce:string;form_key:string};
type Audit={actor_id:string;entity_id:string;detail:{formKey?:unknown}};
type Contact={user_id:string;verified_contact:string};
export type ParticipantKindBackfillInput={users:User[];bindings:Binding[];records:Archive[];versions:Archive[];signups:Signup[];legacySignups:LegacySignup[];audits:Audit[];contacts?:Contact[]};
const kind=(value:unknown):Kind|undefined=>value==='student'?'student':value==='teacher'?'educator':value==='school'?'school':undefined;
const registrationForms:Record<string,Kind>={'48441':'student','48413':'student','28713':'student','48437':'educator','28734':'educator'};
const metadata=(payload:Record<string,unknown>)=>Array.isArray(payload.meta)?payload.meta.filter((item):item is {meta_key:string;meta_value:unknown}=>!!item&&typeof item==='object'&&typeof item.meta_key==='string'):[];
const emptyDraft=(value:unknown)=>value===undefined||value===null||value===false||value===0||typeof value==='string'&&['','0','false'].includes(value.trim().toLowerCase());
const submitted=(payload:Record<string,unknown>)=>['active','submitted','completed'].includes(String(payload.status))&&emptyDraft(payload.is_draft)&&emptyDraft(payload.draft_id)&&emptyDraft(payload.is_spam);

/** Default uses source IDs/signup proofs; approved history matches only verified own-registration email. */
export function planParticipantKinds(input:ParticipantKindBackfillInput,options:{registrationHistory?:boolean}={}){
 const users=new Map(input.users.map(user=>[user.id,user]));
 const evidence=new Map<string,Map<Kind,Set<string>>>();
 const add=(userId:string,value:Kind|undefined,source:string)=>{
  if(!value||!users.has(userId))return;
  const kinds=evidence.get(userId)??new Map<Kind,Set<string>>(),sources=kinds.get(value)??new Set<string>();
  sources.add(source);kinds.set(value,sources);evidence.set(userId,kinds);
 };
 for(const signup of input.signups)add(signup.user_id,kind(signup.form_key),'native-signup');
 for(const audit of input.audits)if(audit.actor_id===audit.entity_id)add(audit.actor_id,kind(audit.detail?.formKey),'native-signup-audit');
 const bindings=new Map(input.bindings.filter(binding=>users.has(binding.user_id)).map(binding=>[binding.source+'\0'+binding.source_user_id,binding.user_id]));
 const contacts=new Map<string,Set<string>>();
 for(const contact of input.contacts??[]){if(!users.has(contact.user_id))continue;const email=contact.verified_contact.trim().toLowerCase(),matches=contacts.get(email)??new Set<string>();matches.add(contact.user_id);contacts.set(email,matches);}
 const baselines=new Map(input.records.map(record=>[record.id,record]));
 let invalidArchives=0;
 for(const record of [...input.records,...input.versions]){
  const baseline=baselines.get(record.id);
  if(fingerprint(record.payload)!==record.checksum||(record.baseline_checksum!==undefined&&(!baseline||baseline.checksum!==record.baseline_checksum||fingerprint(baseline.payload)!==baseline.checksum))){invalidArchives++;continue;}
  if(record.kind==='user'){
   const userId=bindings.get(record.source+'\0'+record.source_id);
   if(!userId)continue;
   const nonces=metadata(record.payload).filter(item=>item.meta_key==='_yes_next_registration_nonce').map(item=>item.meta_value);
   if(nonces.length!==1||typeof nonces[0]!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(nonces[0]))continue;
   for(const signup of input.legacySignups)if(signup.registration_nonce===nonces[0])add(userId,kind(signup.form_key),'legacy-signup-nonce');
  }else if(record.kind==='entry'){
   const formId=String(record.payload.form_id),value=Object.hasOwn(registrationForms,formId)?registrationForms[formId]:undefined;
   if(!value||!submitted(record.payload))continue;
   const pointers=metadata(record.payload).filter(item=>['_yes_owner_user_id','_yes_entry_account_id'].includes(item.meta_key)).map(item=>typeof item.meta_value==='number'||typeof item.meta_value==='string'?String(item.meta_value).trim():'');
   const validPointers=pointers.length&&pointers.every(pointer=>/^[1-9]\d*$/.test(pointer)&&pointer===pointers[0]);
   const userId=validPointers?bindings.get(record.source+'\0'+pointers[0]):undefined;
   if(userId)add(userId,value,'owned-source-registration');
   if(options.registrationHistory&&['48441','48437'].includes(formId)){
    const emails=metadata(record.payload).filter(item=>item.meta_key==='email-1').map(item=>typeof item.meta_value==='string'?item.meta_value.trim().toLowerCase():'');
    if(!emails.length||!emails.every(email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email===emails[0]))continue;
    const matches=contacts.get(emails[0]);
    if(matches?.size!==1)continue;
    const matched=[...matches][0];
    if(pointers.length&&(!validPointers||userId!==matched))continue;
    add(matched,value,'verified-registration-history');
   }
  }
 }
 const planned:{userId:string;kind:Kind;sources:string[]}[]=[],counts={student:0,educator:0,school:0};
 let unclassified=0,conflicting=0,alreadyClassified=0;
 for(const user of input.users){
  const values=evidence.get(user.id);
  if(user.participant_kind!=='unclassified'){alreadyClassified++;continue;}
  if(!values?.size){unclassified++;continue;}
  if(values.size!==1){unclassified++;conflicting++;continue;}
  const [value,sources]=[...values][0];planned.push({userId:user.id,kind:value,sources:[...sources].sort()});counts[value]++;
 }
 return {planned,report:{participants:users.size,alreadyClassified,ready:planned.length,byKind:counts,unclassified,conflicting,invalidArchives}};
}

/** Preview is aggregate-only. A commit never replaces an existing classification. */
export async function backfillParticipantKinds(db:Db,options:{commit?:boolean;registrationHistory?:boolean}={}){
 return db.transaction(async tx=>{
  if(options.commit)await tx.query('LOCK TABLE users,native_participant_challenges,wordpress_registration_challenges,wordpress_account_identities,wordpress_records,wordpress_record_versions,audit_events IN SHARE ROW EXCLUSIVE MODE');
  const {rows:users}=await tx.query<User>("SELECT id,participant_kind FROM users WHERE role='participant'");
  const {rows:bindings}=await tx.query<Binding>('SELECT user_id,source,source_user_id FROM wordpress_account_identities');
  const {rows:records}=await tx.query<Archive>("SELECT id,source,source_id,kind,payload,checksum FROM wordpress_records WHERE kind IN ('user','entry')");
  const {rows:versions}=await tx.query<Archive>("SELECT r.id,r.source,r.source_id,r.kind,v.payload,v.checksum,v.baseline_checksum FROM wordpress_record_versions v JOIN wordpress_records r ON r.id=v.record_id WHERE r.kind IN ('user','entry')");
  const {rows:signups}=await tx.query<Signup>("SELECT user_id,form_key FROM native_participant_challenges WHERE purpose='signup' AND consumed_at IS NOT NULL AND user_id IS NOT NULL");
  const {rows:legacySignups}=await tx.query<LegacySignup>('SELECT registration_nonce,form_key FROM wordpress_registration_challenges WHERE consumed_at IS NOT NULL');
  const {rows:audits}=await tx.query<Audit>("SELECT actor_id,entity_id,detail FROM audit_events WHERE action='auth.participant.register' AND entity_type='user'");
  const {rows:contacts}=options.registrationHistory?await tx.query<Contact>("SELECT a.user_id,a.verified_contact FROM native_participant_accounts a JOIN users u ON u.id=a.user_id WHERE u.role='participant' AND a.verified_contact=lower(btrim(u.contact))"):{rows:[]};
  const {planned,report}=planParticipantKinds({users,bindings,records,versions,signups,legacySignups,audits,contacts},options);
  if(options.commit&&report.invalidArchives)throw new AppError(409,'Archived registration evidence failed its integrity check. Review it before classifying accounts.');
  let updated=0;
  if(options.commit)for(const plan of planned){
   const result=await tx.query("UPDATE users SET participant_kind=$2,updated_at=now() WHERE id=$1 AND role='participant' AND participant_kind='unclassified' RETURNING id",[plan.userId,plan.kind]);
   if(result.rows.length){updated++;await tx.query("INSERT INTO audit_events(id,action,entity_type,entity_id,detail) VALUES($1,'migration.participant-kind','user',$2,$3)",[id(),plan.userId,JSON.stringify({kind:plan.kind,sources:plan.sources})]);}
  }
  return {...report,updated,committed:!!options.commit};
 });
}
