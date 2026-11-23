import 'server-only';
import reference from '@/data/live-presentation.json';
import { LiveReferenceContent } from './live-reference-content';
import { connection } from 'next/server';
import { db } from '../server/db';
import { participationSettings } from '../server/participation-settings';
import { participationWindow, participationWindowStatus } from '../data/participation-window';

/** Reviewed, versioned public content only. Transactional routes retain their own components. */
export async function LiveReferencePage({ path }: { path: keyof typeof reference.pages }) {
  const page = reference.pages[path];
  let html=page.html;
  if(html.includes('__YES_DEADLINE_DATE__')){
    await connection();
    const window=process.env.DATABASE_URL?(await participationSettings(db)).window:participationWindow;
    const state=participationWindowStatus(Date.now(),window);
    html=html.replaceAll('__YES_DEADLINE_DATE__',`<span data-current-deadline-date>${window.dateLabel}</span>`).replaceAll('__YES_DEADLINE_STATE__',`<span data-current-deadline-state>${state.label}.</span>`);
  }
  return <><style data-live-route={path} dangerouslySetInnerHTML={{ __html: page.css }} /><LiveReferenceContent html={html} /></>;
}
