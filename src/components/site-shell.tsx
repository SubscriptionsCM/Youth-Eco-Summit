'use client';
import { Icon } from './icon';
import Image from 'next/image';
import brand from '@/data/live-brand.json';
import footerReference from '@/data/live-footer.json';
import { HeaderSocials } from './header-socials';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, json, type Row } from './api';
import { dashboardLabel, dashboardPath, signedOutPath } from './auth-navigation';
import '../app/account-navigation.css';
import '../app/portal-workspace.css';
import '../app/portal-refinement.css';
import {PortalWorkspace} from './portal-workspace';
import {isWorkspacePath} from '../domain/portal-navigation';

import {manualReviewMode,dedicatedJudgingMode} from '../domain/review-mode';
const marketingPaths = ['/', '/about', '/students', '/parents', '/teachers-schools', '/experience', '/awards', '/partners', '/resources', '/competitions', '/how-to-participate', '/faq', '/contact', '/showcase', '/get-involved'];
const nav = [['The summit', '/about'], ['Competitions', '/competitions'], ['How to participate', '/how-to-participate'], ['For schools', '/teachers-schools']];
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const footerCopy = footerReference[pathname as keyof typeof footerReference] || footerReference['/about'];
  const [menuOpen, setMenuOpen] = useState(false);
  const [actor, setActor] = useState<Row | null>(null), [signingOut, setSigningOut] = useState(false), [accountError, setAccountError] = useState('');
  const menuButton = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const marketing = marketingPaths.includes(pathname) || (pathname.startsWith('/competitions/') && pathname !== '/competitions/enter');
  const workspaceRoute = !marketing && isWorkspacePath(pathname);
  const workspace = workspaceRoute && !!actor && ['owner','admin','judge','participant'].includes(actor.role) && isWorkspacePath(pathname);
  useEffect(() => {
    setMenuOpen(false); if (accountMenu.current) accountMenu.current.open = false;
    let active = true;
    const refresh = () => { api<{ actor: Row | null }>('/api/auth/session').then(result => { if (active) setActor(result.actor); }).catch(() => { /* Keep the last confirmed navigation while a transient refresh fails. */ }); };
    refresh(); window.addEventListener('focus', refresh);window.addEventListener('yes-auth-changed',refresh);
    return () => { active = false; window.removeEventListener('focus', refresh);window.removeEventListener('yes-auth-changed',refresh); };
  }, [pathname]);
  useEffect(()=>{
    const dismiss=(event:Event)=>{const menu=accountMenu.current;if(menu?.open&&event.target instanceof Node&&!menu.contains(event.target))menu.open=false;};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('focusin',dismiss);};
  },[]);
  async function signOut() {
    setSigningOut(true); setAccountError('');
    try { await api('/api/auth/logout', json('POST', {})); setActor(null); window.location.assign(signedOutPath(actor?.role,actor?.participantKind)); }
    catch (error) { setAccountError(error instanceof Error ? error.message : 'Sign out failed. Please try again.'); setSigningOut(false); }
  }
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className={`yes-header ${workspace ? "workspace-site-header" : ""}`} onKeyDown={e => { if (e.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
      <div className="yes-header-inner">
        <Link className="yes-logo" href="/" aria-label="Youth Eco Summit home"><Image src={brand.logo} alt="Youth Eco Summit" width={199} height={212} priority unoptimized /></Link>
        {!workspace&&<nav className="yes-desktop-nav" aria-label="Main navigation">{nav.map(([label, href]) => <Link href={href} key={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</nav>}
        <div className="yes-header-actions">{actor ? <details className="yes-account-menu" ref={accountMenu} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary className="yes-signin">Account <span aria-hidden="true"><Icon name="chevron-down" /></span></summary><div className="yes-account-options"><Link href={dashboardPath(actor.role)}>{dashboardLabel(actor.role)}</Link>{['admin', 'owner'].includes(actor.role) && <Link href={dedicatedJudgingMode()?"/admin/judging":manualReviewMode()?"/admin/reference-forms":"/judge"}>{dedicatedJudgingMode()?"Manage judging":manualReviewMode()?"Review submissions":"Assigned judging"}</Link>}<button type="button" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>{accountError && <p role="alert">{accountError}</p>}</div></details> : <Link href="/login" className="yes-signin">Sign in</Link>}{!workspace&&<HeaderSocials />}{!workspace&&<button ref={menuButton} className="yes-menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close' : 'Menu'} <span aria-hidden="true">{menuOpen ? '×' : '+'}</span></button>}</div>
      </div>
      {!workspace&&<nav id="mobile-menu" className="yes-mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{nav.map(([label, href]) => <Link href={href} key={href} onClick={() => setMenuOpen(false)}>{label}<span aria-hidden="true"><Icon name="arrow-right" /></span></Link>)}<Link href="/schools">Find your school <span aria-hidden="true"><Icon name="arrow-right" /></span></Link><Link href={actor ? dashboardPath(actor.role) : '/login'}>{actor ? dashboardLabel(actor.role) : 'Sign in'} <span aria-hidden="true"><Icon name="arrow-right" /></span></Link>{actor && <><button type="button" className="yes-mobile-signout" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>{accountError && <p role="alert">{accountError}</p>}</>}</nav>}
    </header>
    <main id="main" tabIndex={-1} className={marketing ? 'marketing-main' : workspaceRoute ? 'shell portal-main workspace-main' : 'shell portal-main'}>{workspaceRoute?<PortalWorkspace role={actor?.role||''} participantKind={actor?.participantKind} pathname={pathname}>{children}</PortalWorkspace>:children}</main>
    {workspace?<footer className="workspace-footer"><span>Youth Eco Summit</span><nav aria-label="Workspace support"><Link href="/contact">Get help</Link><Link href="/privacy">Privacy policy</Link><Link href="/terms">Participation terms</Link><a href="#main">Back to top</a></nav></footer>:<footer className="yes-footer"><div className="campaign-container"><div className="footer-top"><div className="footer-intro"><Link href="/" className="footer-wordmark">Youth Eco<br/>Summit</Link><p>Learn. Create. Compete. Lead.</p>{footerCopy.credit && <span className="footer-foundation">{footerCopy.credit}</span>}</div><div className="footer-links"><h2>Explore</h2><Link href="/about">The summit</Link><Link href="/competitions">Competitions</Link><Link href="/experience">The experience</Link><Link href="/awards">Recognition</Link><Link href="/showcase">Student work</Link></div><div className="footer-links"><h2>Get involved</h2><Link href="/students">For students</Link><Link href="/parents">{footerCopy.parentLabel}</Link><Link href="/teachers-schools">{footerCopy.teacherLabel}</Link><Link href="/partners">Become a partner</Link><Link href="/schools">Find your school</Link></div><div className="footer-links"><h2>Need a hand?</h2><Link href="/how-to-participate">Participation guide</Link><Link href="/resources">Resources</Link><Link href="/faq">FAQs</Link><Link href="/contact">Contact us</Link><Link href="/login">Sign in</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Youth Eco Summit</span><div><Link href="/privacy">Privacy policy</Link><Link href="/terms">Participation terms</Link><a href="#main">Back to top <Icon name="arrow-up" /></a></div></div></div></footer>}
  </>;
}
