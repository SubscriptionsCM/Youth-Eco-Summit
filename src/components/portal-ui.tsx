import Link from 'next/link';
import type {ReactNode} from 'react';
import {label} from './api';
export function StatusBadge({value,children}:{value?:unknown;children?:ReactNode}){
 const state=String(value||'').toLowerCase(),tone=['submitted','approved','ready','active','complete','delivered'].includes(state)?'success':['failed','declined','quarantined','inactive'].includes(state)?'danger':['draft','pending','uploaded','processing'].includes(state)?'waiting':'neutral';
 return <span className="portal-status" data-tone={tone}>{children||((state?label(state):'Not set').replace(/^./,c=>c.toUpperCase()))}</span>;
}
export function SummaryMetric({title,value,description,href}:{title:string;value:ReactNode;description:string;href?:string}){
 const content=<><span className="metric-label">{title}</span><strong className="metric-value">{value??'—'}</strong><span className="metric-description">{description}</span></>;
 return href?<Link className="portal-metric" href={href}>{content}</Link>:<div className="portal-metric">{content}</div>;
}
