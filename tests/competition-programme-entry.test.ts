import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompetitionProgramme } from '../src/components/competition-programme';
import { CompetitionsPage } from '../src/components/public-pages';

const forms = vi.hoisted(() => ({ enabled: true, configured: true, deadlineAvailable:true,managed:false,deadlineDate:'2026-11-30',config:null as any }));
vi.mock('../src/components/use-participation-window',async()=>{
 const {windowForDeadline,participationWindowStatus}=await import('../src/data/participation-window');
 return {useParticipationWindow:()=>{const window=windowForDeadline(forms.deadlineDate);return {window,managed:forms.managed,status:forms.deadlineAvailable?participationWindowStatus(Date.now(),window):null,error:''};}};
});
vi.mock('../src/components/shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/components/shared')>();
  return {
    ...actual,
    useResource: (path: string) => ({
      data: path === '/api/forms/config' ? forms : forms.config || { editions: [], competitions: [], content: [] },
      loading: false,
      error: '',
      reload: () => {},
    }),
  };
});

const expectedSlugs = [
  'article-writing', 'blog-writing', 'case-study', 'digital-art', 'eco-business-model',
  'open-letter', 'painting', 'short-film-making', 'spoken-word', 'waste-to-art',
];
const entryLinks = (html: string) => [...html.matchAll(/href="(\/competitions\/enter\?competition=[^"]+)"/g)].map(match => match[1]).sort();
const catalogue = () => renderToStaticMarkup(createElement(CompetitionsPage));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  forms.enabled = true;
  forms.configured = true;
  forms.deadlineAvailable = true;forms.managed=false;forms.deadlineDate='2026-11-30';forms.config=null;
});
afterEach(() => vi.useRealTimers());

describe('public reference competition entry links', () => {
  it('waits for the current saved deadline before offering entry links',()=>{
    forms.deadlineAvailable=false;
    expect(entryLinks(catalogue())).toEqual([]);
  });
  it('connects all ten source formats through the normal catalogue when reference forms are enabled without canonical publication', () => {
    expect(entryLinks(catalogue())).toEqual(expectedSlugs.map(slug => `/competitions/enter?competition=${slug}`));
  });

  it.each(['enabled', 'configured'] as const)('does not offer unavailable reference forms when %s is false', property => {
    forms[property] = false;
    expect(entryLinks(catalogue())).toEqual([]);
  });

  it.each([
    ['2026-09-30T18:29:59.999Z', 0],
    ['2026-09-30T18:30:00.000Z', 10],
    ['2026-11-30T18:29:59.999Z', 10],
    ['2026-11-30T18:30:00.000Z', 0],
  ])('matches the participation boundary at %s', (timestamp, count) => {
    vi.setSystemTime(new Date(timestamp));
    expect(entryLinks(catalogue())).toHaveLength(count);
  });

  it('updates canonical entry eligibility when the refreshed shared deadline changes',()=>{
    vi.setSystemTime(new Date('2026-11-23T06:00:00.000Z'));
    forms.config={editions:[{id:'edition',state:'open',label:'2027'}],competitions:[{id:'canonical-preview',edition_id:'edition',status:'approved',opens_at:'2026-10-01T00:00:00.000Z',closes_at:'2026-11-22T18:30:00.000Z',config:{}}],content:[]};
    const render=()=>renderToStaticMarkup(createElement(CompetitionsPage,{id:'canonical-preview'}));
    expect(render()).not.toContain('Start or continue an entry');
    forms.managed=true;forms.deadlineDate='2026-12-03';
    expect(render()).toContain('href="/dashboard?competitionId=canonical-preview"');
  });

  it('preserves the published canonical path when reference forms are disabled', () => {
    const html = renderToStaticMarkup(createElement(CompetitionProgramme, {
      editions: [{ id: 'edition-2027', label: 'Youth Eco Summit 2027', state: 'open' }],
      competitions: [{ id: 'approved-open-letter', edition_id: 'edition-2027', slug: 'open-letter', status: 'approved', opens_at: '2026-10-01T00:00:00Z', closes_at: '2026-11-30T18:30:00Z' }],
    }));
    expect(html).toContain('href="/competitions/approved-open-letter"');
    expect(entryLinks(html)).toEqual([]);
  });
});
