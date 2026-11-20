'use client';
import Link from 'next/link';
import {useEffect,useRef,type ReactNode} from 'react';
import {portalGroups,isPortalLinkActive,portalLocation} from '../domain/portal-navigation';
import {manualReviewMode,dedicatedJudgingMode} from '../domain/review-mode';
import {dashboardPath} from './auth-navigation';

export function PortalWorkspace({role,pathname,children}:{role:string;pathname:string;children:ReactNode}){
 const menu=useRef<HTMLDetailsElement>(null),groups=portalGroups(role,dedicatedJudgingMode()?'portal':manualReviewMode()?'manual':'legacy');
 useEffect(()=>{if(menu.current)menu.current.open=false;},[pathname]);
 const label=role==='judge'?'Judge workspace':role==='participant'?'Participant workspace':'Staff workspace';
 function navigation(mobile=false){return <nav aria-label={mobile?'Mobile workspace navigation':'Workspace navigation'}>{groups.map(group=><details key={group.label} className="workspace-nav-group" open={group.root===pathname||group.primary||group.label==='Judging'||!['owner','admin'].includes(role)||group.items.some(i=>isPortalLinkActive(pathname,i.href))}><summary>{group.label}</summary><ul>{group.items.map(i=><li key={i.href}><Link href={i.href} aria-current={isPortalLinkActive(pathname,i.href)?'page':undefined}>{i.label}</Link></li>)}</ul></details>)}<div className="workspace-nav-help"><p>Need a hand?</p><Link href="/how-to-participate">Participation guide</Link><Link href="/contact">Contact the summit team</Link></div></nav>;}
 return <div className={`workspace-layout ${groups.length?'':'workspace-awaiting'}`}><aside className="workspace-sidebar" hidden={!groups.length}><div className="workspace-identity"><span className="workspace-eyebrow">Youth Eco Summit</span><strong>{label}</strong><span className="workspace-role">{role==='owner'?'Owner':role==='admin'?'Administrator':role==='judge'?'Judge':'Participant'}</span></div><div className="workspace-desktop-navigation">{navigation()}</div><details className="workspace-mobile-menu" ref={menu} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary><span>Workspace menu</span><span className="workspace-mobile-location">{portalLocation(pathname)}</span></summary>{navigation(true)}</details></aside><div className="workspace-body">{!!groups.length&&<nav className="workspace-breadcrumb" aria-label="Breadcrumb"><Link href={dashboardPath(role)}>{label}</Link><span aria-hidden="true">/</span><span aria-current="page">{portalLocation(pathname)}</span></nav>}{children}</div></div>;
}
