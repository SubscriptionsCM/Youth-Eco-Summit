'use client';
import Image from 'next/image';
import brand from '@/data/live-brand.json';
import { HeaderSocials } from './header-socials';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, json, type Row } from './api';
import { dashboardLabel, dashboardPath } from './auth-navigation';
import '../app/account-navigation.css';

const marketingPaths = ['/', '/about', '/students', '/parents', '/teachers-schools', '/experience', '/awards', '/partners', '/resources', '/competitions', '/how-to-participate', '/faq', '/contact', '/showcase', '/get-involved'];
const nav = [['The summit', '/about'], ['Competitions', '/competitions'], ['How to participate', '/how-to-participate'], ['For schools', '/teachers-schools']];
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actor, setActor] = useState<Row | null>(null), [signingOut, setSigningOut] = useState(false), [accountError, setAccountError] = useState('');
  const menuButton = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const marketing = marketingPaths.includes(pathname) || (pathname.startsWith('/competitions/') && pathname !== '/competitions/enter');
  useEffect(() => {
    setMenuOpen(false); if (accountMenu.current) accountMenu.current.open = false;
    let active = true;
    const refresh = () => { api<{ actor: Row | null }>('/api/auth/session').then(result => { if (active) setActor(result.actor); }).catch(() => { if (active) setActor(null); }); };
    refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [pathname]);
  async function signOut() {
    setSigningOut(true); setAccountError('');
    try { await api('/api/auth/logout', json('POST', {})); setActor(null); window.location.assign('/login'); }
    catch (error) { setAccountError(error instanceof Error ? error.message : 'Sign out failed. Please try again.'); setSigningOut(false); }
  }
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="yes-header" onKeyDown={e => { if (e.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
      <div className="yes-header-inner">
        <Link className="yes-logo" href="/" aria-label="Youth Eco Summit home"><Image src={brand.logo} alt="Youth Eco Summit" width={199} height={212} priority unoptimized /></Link>
        <nav className="yes-desktop-nav" aria-label="Main navigation">{nav.map(([label, href]) => <Link href={href} key={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</nav>
        <div className="yes-header-actions">{actor ? <details className="yes-account-menu" ref={accountMenu} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary className="yes-signin">Account <span aria-hidden="true">⌄</span></summary><div className="yes-account-options"><Link href={dashboardPath(actor.role)}>{dashboardLabel(actor.role)}</Link>{['admin', 'owner'].includes(actor.role) && <Link href="/judge">Assigned judging</Link>}<button type="button" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>{accountError && <p role="alert">{accountError}</p>}</div></details> : <Link href="/login" className="yes-signin">Sign in</Link>}<HeaderSocials /><button ref={menuButton} className="yes-menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close' : 'Menu'} <span aria-hidden="true">{menuOpen ? '×' : '+'}</span></button></div>
      </div>
      <nav id="mobile-menu" className="yes-mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{nav.map(([label, href]) => <Link href={href} key={href} onClick={() => setMenuOpen(false)}>{label}<span aria-hidden="true">→</span></Link>)}<Link href="/schools">Find your school <span aria-hidden="true">→</span></Link><Link href={actor ? dashboardPath(actor.role) : '/login'}>{actor ? dashboardLabel(actor.role) : 'Sign in'} <span aria-hidden="true">→</span></Link>{actor && <><button type="button" className="yes-mobile-signout" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>{accountError && <p role="alert">{accountError}</p>}</>}</nav>
    </header>
    <main id="main" tabIndex={-1} className={marketing ? 'marketing-main' : 'shell portal-main'}>{children}</main>
    <footer className="yes-footer"><div className="campaign-container"><div className="footer-top"><div className="footer-intro"><Link href="/" className="footer-wordmark">Youth Eco<br/>Summit</Link><p>Learn. Create. Compete. Lead.</p><span className="footer-foundation">An initiative of Bajaj Foundation</span></div><div className="footer-links"><h2>Explore</h2><Link href="/about">The summit</Link><Link href="/competitions">Competitions</Link><Link href="/experience">The experience</Link><Link href="/awards">Recognition</Link><Link href="/showcase">Student work</Link></div><div className="footer-links"><h2>Get involved</h2><Link href="/students">For students</Link><Link href="/parents">For parents</Link><Link href="/teachers-schools">For teachers & schools</Link><Link href="/partners">Become a partner</Link><Link href="/schools">Find your school</Link></div><div className="footer-links"><h2>Need a hand?</h2><Link href="/how-to-participate">Participation guide</Link><Link href="/resources">Resources</Link><Link href="/faq">FAQs</Link><Link href="/contact">Contact us</Link><Link href="/login">Sign in</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Youth Eco Summit</span><div><Link href="/privacy">Privacy policy</Link><Link href="/terms">Participation terms</Link><a href="#main">Back to top ↑</a></div></div></div></footer>
  </>;
}
