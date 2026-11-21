'use client';
import Link from 'next/link';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {portalGroups,isPortalLinkActive,portalLocation} from '../domain/portal-navigation';
import {manualReviewMode,dedicatedJudgingMode} from '../domain/review-mode';
import {dashboardPath} from './auth-navigation';
import {type ParticipantKind} from '../domain/participant-access';
import {Icon} from './icon';

function revealExpandedGroup(sidebar:HTMLElement|null){
 if(!sidebar||sidebar.scrollHeight<=sidebar.clientHeight)return;
 const trigger=Array.from(sidebar.querySelectorAll<HTMLButtonElement>('.workspace-nav-trigger[aria-expanded="true"]')).find(button=>button.getClientRects().length);
 const firstLink=trigger?.parentElement?.querySelector('a');
 if(!trigger||!firstLink)return;
 const top=sidebar.getBoundingClientRect().top+sidebar.clientTop,bottom=top+sidebar.clientHeight;
 const headingTop=trigger.getBoundingClientRect().top,linkBottom=firstLink.getBoundingClientRect().bottom;
 // Reveal the heading and first link within the sidebar without moving the page.
 if(headingTop<top)sidebar.scrollTop+=headingTop-top;
 else if(linkBottom>bottom)sidebar.scrollTop+=Math.min(linkBottom-bottom,headingTop-top);
}

export function PortalWorkspace({role,displayRole,participantKind,pathname,children}:{role:string;displayRole?:string;participantKind?:ParticipantKind|null;pathname:string;children:ReactNode}){
 const menu=useRef<HTMLDetailsElement>(null),sidebar=useRef<HTMLElement>(null),id=useId();
 const groups=portalGroups(role,dedicatedJudgingMode()?'portal':manualReviewMode()?'manual':'legacy',participantKind);
 const activeGroup=groups.find(group=>group.root===pathname||group.items.some(item=>isPortalLinkActive(pathname,item.href)))?.label??groups.find(group=>group.primary)?.label??groups[0]?.label??null;
 const [openGroup,setOpenGroup]=useState<string|null>(activeGroup);
 useEffect(()=>{setOpenGroup(activeGroup);if(menu.current)menu.current.open=false;},[pathname,role,participantKind,activeGroup]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>revealExpandedGroup(sidebar.current));return()=>cancelAnimationFrame(frame);},[openGroup]);
 const profileLabel=participantKind==='student'?'Student':participantKind==='educator'?'Educator':participantKind==='school'?'School':'Participant';
 const label=role==='judge'?'Judge workspace':role==='participant'?`${profileLabel} workspace`:'Staff workspace';
 function navigation(mobile=false){return <nav aria-label={mobile?'Mobile workspace navigation':'Workspace navigation'}>{groups.map((group,index)=>{
  const open=openGroup===group.label,panelId=`${id}-${mobile?'mobile':'desktop'}-${index}`,triggerId=`${panelId}-trigger`;
  return <div key={group.label} className="workspace-nav-group" data-open={open}>
   <button type="button" id={triggerId} className="workspace-nav-trigger" aria-expanded={open} aria-controls={panelId} onClick={()=>setOpenGroup(current=>current===group.label?null:group.label)}><span className="workspace-nav-chevron"><Icon name="chevron-down"/></span><span>{group.label}</span></button>
   <div id={panelId} className="workspace-nav-panel" aria-labelledby={triggerId} aria-hidden={!open} inert={!open}><div className="workspace-nav-clip"><ul>{group.items.map(item=><li key={item.href}><Link href={item.href} tabIndex={open?undefined:-1} aria-current={isPortalLinkActive(pathname,item.href)?'page':undefined}>{item.label}</Link></li>)}</ul></div></div>
  </div>;
 })}<div className="workspace-nav-help"><p>Need a hand?</p><Link href="/how-to-participate">Participation guide</Link><Link href="/contact">Contact the summit team</Link></div></nav>;}
 return <div className={`workspace-layout ${groups.length?'':'workspace-awaiting'}`}><aside className="workspace-sidebar" ref={sidebar} hidden={!groups.length} onTransitionEnd={event=>{if(event.propertyName==='grid-template-rows')revealExpandedGroup(sidebar.current);}}><div className="workspace-identity"><span className="workspace-eyebrow">Youth Eco Summit</span><strong>{label}</strong><span className="workspace-role">{role==='owner'?(displayRole==='Developer'?'Developer':'Owner'):role==='admin'?'Administrator':role==='judge'?'Judge':profileLabel}</span></div><div className="workspace-desktop-navigation">{navigation()}</div><details className="workspace-mobile-menu" ref={menu} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary><span>Workspace menu</span><span className="workspace-mobile-location">{portalLocation(pathname)}</span></summary>{navigation(true)}</details></aside><div className="workspace-body">{!!groups.length&&<nav className="workspace-breadcrumb" aria-label="Breadcrumb"><Link href={dashboardPath(role)}>{label}</Link><span aria-hidden="true">/</span><span aria-current="page">{portalLocation(pathname)}</span></nav>}{children}</div></div>;
}
