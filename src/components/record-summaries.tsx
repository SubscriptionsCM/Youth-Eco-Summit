import {date,type Row} from './api';
import {StatusBadge} from './portal-ui';
import {activityTitle,recordTypeTitle,removalCounts,reviewFlagTitle,statusText,taskTitle} from '../domain/portal-language';
const recorded=(value:unknown)=>value?date(value):'Not recorded';
const correctionFields:Record<string,string>={name:'Name',className:'Class',section:'Section',address:'Address',city:'City',state:'State',postal_code:'Postal code',postalCode:'Postal code',email:'Email',phone:'Phone',contactName:'Contact name',contactRole:'Contact role',emergency_contact:'Emergency contact',emergencyContact:'Emergency contact',status:'Status',active:'Account active'};
const simple=(value:unknown)=>value===null||value===undefined||['string','number','boolean'].includes(typeof value);
const answer=(value:unknown)=>value===null||value===undefined||value===''?'Not provided':typeof value==='boolean'?value?'Yes':'No':String(value);
function ActivityChanges({detail}:{detail:Row}){
 const before=detail.before&&typeof detail.before==='object'?detail.before:{},after=detail.after&&typeof detail.after==='object'?detail.after:{};
 const corrections=Object.keys(correctionFields).filter(key=>Object.hasOwn(after,key)&&simple(after[key])&&simple(before[key])&&before[key]!==after[key]);
 const facts:[string,string][]=[];
 if(typeof detail.open==='boolean')facts.push(['Judging round',detail.open?'Open':'Closed']);
 if(typeof detail.accepted==='boolean')facts.push(['Permission',detail.accepted?'Granted':'Not granted']);
 if(typeof detail.active==='boolean')facts.push(['Active',detail.active?'Yes':'No']);
 if(typeof detail.total==='number')facts.push(['Total marks',String(detail.total)]);
 if(typeof detail.status==='string')facts.push(['Status',statusText(detail.status)]);
 if(typeof detail.role==='string')facts.push(['Account role',statusText(detail.role)]);
 if(typeof detail.action==='string'&&['approve','activate','deactivate'].includes(detail.action))facts.push(['New status',detail.action==='deactivate'?'Inactive':detail.action==='activate'?'Active':'Approved']);
 if(typeof detail.verificationEvidence==='string'&&!detail.reason)facts.push(['Reason',detail.verificationEvidence]);
 if(!corrections.length&&!facts.length)return null;
 return <><h4>Changes</h4><dl>{corrections.map(key=><div key={key}><dt>{correctionFields[key]}</dt><dd><p>Before: {answer(before[key])}</p><p>After: {answer(after[key])}</p></dd></div>)}{facts.map(([title,value])=><div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl></>;
}
export function TaskDetails({row}:{row:Row}){
 return <><h3>{taskTitle(row.kind)}</h3><dl><dt>Status</dt><dd><StatusBadge value={row.status}/></dd><dt>Attempts</dt><dd>{row.attempts??0}</dd><dt>Created</dt><dd>{recorded(row.created_at)}</dd><dt>Last updated</dt><dd>{recorded(row.updated_at)}</dd>{row.status==='pending'&&<><dt>Scheduled for</dt><dd>{recorded(row.run_after)}</dd></>}</dl><p role="status">{row.status==='complete'?'No action needed. This task finished successfully.':row.status==='failed'?'This task could not finish. You can try it again below. If it fails again, contact the summit support team.':row.status==='running'?'This task is running. Refresh the list to check its progress.':'This task is waiting to run. It will start automatically.'}</p></>;
}
export function ActivityDetails({row}:{row:Row}){
 const detail=row.detail||{};
 return <><h3>{activityTitle(row.action)}</h3><dl><dt>Area</dt><dd>{recordTypeTitle(row.entity_type)}</dd>{row.entity_label&&<><dt>Record</dt><dd>{row.entity_label}</dd></>}<dt>Performed by</dt><dd>{row.actor_name||row.actor_contact||'Website account'}</dd><dt>Recorded</dt><dd>{recorded(row.created_at)}</dd>{typeof detail.reference==='string'&&<><dt>Submission reference</dt><dd>{detail.reference}</dd></>}{typeof detail.reason==='string'&&<><dt>Reason</dt><dd className="prose">{detail.reason}</dd></>}</dl><ActivityChanges detail={detail}/><p>Changes are recorded here so staff can follow the history of website activity.</p></>;
}
export function RemovalSummary({value}:{value:Row}){
 const counts=removalCounts(value);
 return <>{counts.length?<dl>{counts.map(({title,count})=><div key={title}><dt>{title}</dt><dd>{count}</dd></div>)}</dl>:<p>No related records are listed.</p>}</>;
}
export function TrashDetails({row}:{row:Row}){return <><h3>{row.root_label||row.name||recordTypeTitle(row.root_type)}</h3><dl><dt>Status</dt><dd><StatusBadge value={row.status}/></dd><dt>Reason</dt><dd className="prose">{row.reason||'Not recorded'}</dd><dt>Moved to Trash</dt><dd>{recorded(row.created_at)}</dd></dl><h4>Records in this group</h4><RemovalSummary value={row}/><p>Restore brings back eligible records. Permanent deletion is available only to the owner and cannot be undone.</p></>;}

export function EntryReviewHistory({details}:{details:Row}){
 return <details><summary>Judging progress and decisions</summary><h3>Review assignments</h3><ul>{details.assignments?.map((a:Row,index:number)=><li key={a.id||index}>{a.round_name||'Review round'} · {a.judge_name||'Assigned reviewer'} · {a.active===false?'Access removed':a.completed||details.reviews?.some((r:Row)=>r.assignment_id===a.id&&r.revision===a.revision&&r.status==='submitted')?'Completed':'Assigned'}</li>)}</ul>{details.reviews?.length>0&&<><h3>Reviews</h3><ul>{details.reviews.map((r:Row,index:number)=><li key={r.id||index}><StatusBadge value={r.status}/>{r.submitted_at&&<> · {date(r.submitted_at)}</>}{r.revision&&<p>Entry version: {r.revision}</p>}<dl>{Object.entries(r.scores||{}).map(([key,score],i)=><div key={key}><dt>{/^[a-f0-9-]{36}$/i.test(key)?`Scoring criterion ${i+1}`:statusText(key)}</dt><dd>{String(score)}</dd></div>)}</dl>{r.eligible_for_results===false&&<p>Excluded from results</p>}{r.flag&&<p>{reviewFlagTitle(r.flag)}</p>}{r.comment&&<p className="prose">{r.comment}</p>}</li>)}</ul></>}{details.decisions?.length>0&&<><h3>Decisions</h3><ul>{details.decisions.map((d:Row,index:number)=><li key={d.id||index}><StatusBadge value={d.to_state||d.state}/>{d.award&&<> · {d.award}</>}{d.jury_reference&&<p>Jury approval reference: {d.jury_reference}</p>}{d.reason&&<p className="prose">{d.reason}</p>}{d.created_at&&<p>{date(d.created_at)}</p>}</li>)}</ul></>}</details>;
}
