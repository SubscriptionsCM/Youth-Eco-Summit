'use client';
import { useParticipationWindow } from './use-participation-window';
import '../app/participation-deadline.css';
export function ParticipationDeadline({compact=false,className=''}:{compact?:boolean;className?:string}){
 const {window,status,error}=useParticipationWindow();
 const detail=compact&&status?`${status.state==='closed'?'Deadline':'Closes'}: ${window.dateLabel} (IST).`:status?.detail;
 return <p className={`participation-deadline${compact?' participation-deadline--compact':''} ${className}`.trim()} data-window-state={status?.state||'scheduled'} role="status">{status?<><strong>{status.label}.</strong>{' '}<span>{detail}</span></>:error||'Checking the current registration and submission deadline…'}</p>;
}
export function ParticipationDate(){const {window,status,error}=useParticipationWindow();return <span>{status?window.deadlineLabel:error||'checking the current deadline'}</span>;}
