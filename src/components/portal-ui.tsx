import Link from 'next/link';
import type {ReactNode} from 'react';
import {statusText} from '../domain/portal-language';
export function StatusBadge({value,children}:{value?:unknown;children?:ReactNode}){
 const state=String(value||'').toLowerCase(),tone=['submitted','approved','ready','active','complete','delivered'].includes(state)?'success':['failed','declined','quarantined','inactive','purge_failed','rejected'].includes(state)?'danger':['draft','pending','uploaded','processing','running','in_progress','purging'].includes(state)?'waiting':'neutral';
 return <span className="portal-status" data-tone={tone}>{children||statusText(state)}</span>;
}
export function SummaryMetric({title,value,description,href}:{title:string;value:ReactNode;description:string;href?:string}){
 const content=<><span className="metric-label">{title}</span><strong className="metric-value">{value??'—'}</strong><span className="metric-description">{description}</span></>;
 return href?<Link className="portal-metric" href={href}>{content}</Link>:<div className="portal-metric">{content}</div>;
}
