'use client';
import Link from 'next/link';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { api, json, type PublicConfig, type Row } from './api';
import './school-registration.css';
import { SchoolWizard, StudentWizard, TeacherWizard } from './registration-wizard';
import { AuthGate, Empty, Errors, Field, Notice, PageTitle, Pagination, ResourceState, useResource } from './shared';

export function SchoolDirectory({ onSelect, embedded = false }: { onSelect?: (school: Row) => void; embedded?: boolean }) {
  const [query, setQuery] = useState(''), [city, setCity] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const result = useResource<Row>(`/api/public/schools?${search}&page=${page}`);
  const SearchContainer = embedded ? 'div' : 'form';
  function searchSchools() { setPage(1); setSearch(new URLSearchParams({ q: query, city }).toString()); }
  return <><SearchContainer onSubmit={e => { e.preventDefault(); searchSchools(); }}><div className="field-row"><Field name="school-search" title="School name or ID" value={query} onChange={(e: any) => setQuery(e.target.value)} /><Field name="school-city" title="City or district" value={city} onChange={(e: any) => setCity(e.target.value)} /></div><button type={embedded ? "button" : "submit"} onClick={embedded ? searchSchools : undefined}>Search schools</button></SearchContainer><ResourceState {...result} retry={result.reload} />{result.data && <>{result.data.items?.length ? <div className="table-wrap"><table><caption>Registered schools</caption><thead><tr><th>School</th><th>Location</th><th>Permanent school ID</th>{onSelect && <th>Action</th>}</tr></thead><tbody>{result.data.items.map((school: Row) => <tr key={school.id}><td>{school.name}</td><td>{[school.address, school.city, school.state, school.postal_code || school.postalCode].filter(Boolean).join(', ')}</td><td>{school.reference || school.schoolId || school.id}</td>{onSelect && <td><button type="button" onClick={() => onSelect(school)}>Select {school.name}</button></td>}</tr>)}</tbody></table></div> : <Empty>No registered schools match your search. Check the spelling and location, or nominate your school below.</Empty>}<Pagination page={page} total={result.data.total || 0} pageSize={result.data.pageSize} onPage={setPage} /></>}</>;
}
/** Keyboard and touch friendly school suggestions; names never select a branch automatically. */
export function SchoolAutocomplete({ onSelect }: { onSelect: (school: Row) => void }) {
  const [query, setQuery] = useState(''), [city, setCity] = useState(''), [search, setSearch] = useState('');
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const inputId = useId(), listId = `${inputId}-suggestions`;
  const request = new URLSearchParams({ q: query.trim(), city: city.trim() }).toString();
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim().length >= 2 ? request : ''); setActive(-1); }, 250); return () => clearTimeout(timer); }, [request, query]);
  const result = useResource<Row>(search ? `/api/public/schools?${search}` : null);
  const current = search === request && !result.loading;
  const suggestions: Row[] = current ? result.data?.items || [] : [];
  function choose(school: Row) { setOpen(false); setQuery(''); onSelect(school); }
  return <div className="school-autocomplete"><p>Type a school name or the ID shared by your teacher. Check the address and permanent ID before selecting a branch.</p><div className="field-row"><Field id={inputId} name="school-suggestions" title="School name or ID" value={query} autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open && query.trim().length >= 2} aria-activedescendant={open && active >= 0 && suggestions[active] ? `${listId}-${active}` : undefined} onFocus={() => setOpen(true)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setQuery(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); setActive(-1); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(previous => suggestions.length ? (previous < 0 ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1) : (previous + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length) : -1); }
    if (event.key === 'Enter' && open && suggestions[active]) { event.preventDefault(); choose(suggestions[active]); }
  }} /><Field name="school-suggestions-city" title="City or district (optional)" value={city} onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setCity(event.target.value); setOpen(true); }} /></div>{open && query.trim().length >= 2 && <><p className="school-search-status" role="status">{!current ? 'Finding schools…' : result.error ? 'School search is unavailable. Try again below.' : `${result.data?.total || 0} matching schools. Select the correct branch.`}</p>{current && result.error && <ResourceState {...result} retry={result.reload} />}<ul id={listId} role="listbox" aria-label="Matching registered schools" className="school-suggestions">{suggestions.map((school, index) => <li role="option" id={`${listId}-${index}`} key={school.id} aria-selected={active === index} className={active === index ? 'is-active' : ''}><button type="button" onClick={() => choose(school)}><strong>{school.name}</strong><span>{[school.address, school.city, school.state, school.postal_code].filter(Boolean).join(', ')}</span><small>School ID: {school.reference}{school.alternate_references?.length ? ` · Also registered as ${school.alternate_references.join(', ')}` : ''}</small></button></li>)}</ul>{current && !result.error && result.data?.total > 25 && <p>Enter a city or more of the name to narrow these results.</p>}</>}<details><summary>Browse all registered schools</summary><SchoolDirectory onSelect={choose} embedded /></details></div>;
}
export function SchoolsPage() { return <><PageTitle title="Find your school">Search for the school’s permanent registration before creating a new record.</PageTitle><SchoolDirectory /><section className="panel"><h2>School not listed?</h2><p>Nominate your school for review. A nomination does not register or approve the school.</p><NominationForm /></section><p>Authorized school contact? <Link href="/schools/register">Register a school</Link>.</p></>; }
function LegalGate({ children }: { children: ReactNode }) {
  const config = useResource<PublicConfig>('/api/public/config');
  if (config.loading || config.error) return <ResourceState {...config} retry={config.reload} />;
  if (!['privacy', 'terms'].every(key => config.data?.content.some(c => c.key === key && c.body))) return <Empty>Registration and nominations are currently closed while approved privacy information and participation terms are prepared.</Empty>;
  return <>{children}</>;
}
function NominationForm() { return <LegalGate><NominationFields /></LegalGate>; }
function NominationFields() {
  const [error, setError] = useState<unknown>(null), [receipt, setReceipt] = useState<Row | null>(null), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(null); try { setReceipt(await api('/api/public/nominations', json('POST', Object.fromEntries(new FormData(e.currentTarget))))); } catch (e) { setError(e); } finally { setBusy(false); } }
  if (receipt) return <div className="receipt" role="status"><h3>Nomination received</h3><p>Reference: <strong>{receipt.reference || receipt.id}</strong></p><p>Status: {receipt.status || 'pending'}. Registration becomes available after the school is approved.</p></div>;
  return <form className="form" onSubmit={submit}><Errors error={error} /><Field name="name" title="School name" required maxLength={200} /><div className="field-row"><Field name="city" title="City or district" required /><Field name="state" title="State" required /></div><Field name="address" title="School address" required /><Field name="nominatorContact" title="Your contact phone or email" required /><Field name="schoolContact" title="School contact phone or email (if known)" /><button disabled={busy}>{busy ? 'Sending…' : 'Nominate school'}</button></form>;
}
export function SchoolRegistrationPage() { return <><PageTitle title="School registration">Access your existing school or create a permanent school record. School verification is required before student registration.</PageTitle><AuthGate roles={['participant']}>{actor => <SchoolRegistrationWorkspace actor={actor} />}</AuthGate></>; }
function SchoolRegistrationWorkspace({ actor }: { actor: Row }) {
  const [schoolId, setSchoolId] = useState(''), [school, setSchool] = useState<Row | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  async function claim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const claimed = await api<Row>(`/api/schools/${encodeURIComponent(schoolId.trim())}/claim`, json('POST', {}));
      const records = await api<Row>('/api/participant');
      const result = claimed.school || claimed;
      const accessible = records.schools?.find((item: Row) => item.id === result.id || item.reference === result.reference || item.id === schoolId.trim() || item.reference === schoolId.trim());
      if (!accessible) throw new Error('The school could not be loaded into this account. Refresh your dashboard or try again.');
      setSchool(accessible);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <>{school ? <section className="panel"><h2>Update your registered school</h2><Notice>Access verified for {school.name}. Changes are saved to the existing permanent school record.</Notice><SchoolForm key={school.id} school={school} /><button className="secondary" onClick={() => { setSchool(null); setSchoolId(''); }}>Access another school</button></section> : <><section className="panel"><h2>Access a registered school</h2><p>Sign in using the school contact’s registered phone number. Access is granted only when your verified contact matches the school’s existing contact record. A school ID alone does not grant access.</p><Errors error={error} /><form className="form" onSubmit={claim}><Field name="claim-school-id" title="Permanent school ID" required value={schoolId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchoolId(e.target.value)} hint="Enter the school’s permanent reference, or select it from the directory below." /><button disabled={busy}>{busy ? 'Verifying school access…' : 'Access registered school'}</button></form><details><summary>Find the school ID</summary><SchoolDirectory onSelect={selected => { setSchoolId(selected.reference || selected.id); setError(null); }} /></details></section><details><summary>Register a new school</summary><p>Search the directory first to avoid creating a duplicate school record.</p><LegalGate><SchoolForm school={{ phone: actor.contact }} /></LegalGate></details></>}</>;
}
export function SchoolForm({ school, onSaved }: { school?: Row; onSaved?: () => void }) { return <SchoolWizard school={school} onSaved={onSaved} />; }
export function StudentRegistrationPage() { return <><PageTitle title="Student registration">Register an individual student for an open edition.</PageTitle><LegalGate><AuthGate roles={['participant']}>{actor => <StudentForm actor={actor} />}</AuthGate></LegalGate></>; }
function StudentForm({ actor }: { actor: Row }) { return <StudentWizard actor={actor} />; }
export function TeacherRegistrationPage() { return <><PageTitle title="Teacher registration">Link your verified teacher account to a registered school. Your progress is saved at each step.</PageTitle><LegalGate><AuthGate roles={['participant']}>{actor => <TeacherWizard actor={actor} />}</AuthGate></LegalGate></>; }
