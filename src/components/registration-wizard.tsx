'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, json, type PublicConfig, type Row } from './api';
import { SchoolAutocomplete } from './registration';
import { FormSteps } from './form-steps';
import { Empty, Errors, Field, Notice, ResourceState, useResource } from './shared';
import { studentRegisteredFor } from './participant-options';

type Kind = 'school' | 'student' | 'teacher';
function useRegistrationDraft(kind: Kind, scope: string, initial: Row = {}) {
 const source = useResource<Row>(`/api/registration-drafts?${new URLSearchParams({ kind, scope })}`);
 const [data, setData] = useState<Row>(initial), [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [saved, setSaved] = useState(''), [receipt, setReceipt] = useState<Row | null>(null);
 const [activeId, setActiveId] = useState(''), [completionPending, setCompletionPending] = useState(false);
 const pendingCompletion = useRef<Row | null>(null);
 const version = useRef(0), draftId = useRef(''), hydrated = useRef(false), dirty = useRef(false), saving = useRef(false);
 const heading = useRef<HTMLHeadingElement>(null);
 function load(draft: Row | undefined) {
  draftId.current = draft?.id || ''; version.current = draft?.lock_version || 0;
  setActiveId(draftId.current); pendingCompletion.current = null; setCompletionPending(false); setReceipt(null);
  setData(draft?.payload || initial); setStep(draft?.current_step || 0); setError(null); dirty.current = false;
  setSaved(draft ? 'Your saved registration has been restored.' : '');
 }
 useEffect(() => { if (source.data && !hydrated.current) { hydrated.current = true; load(source.data.items?.[0]); } }, [source.data]);
 useEffect(() => { heading.current?.focus(); }, [step]);
 useEffect(() => {
  function warn(event: BeforeUnloadEvent) { if (dirty.current || pendingCompletion.current) { event.preventDefault(); event.returnValue = ''; } }
  window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
 }, []);
 function change(fields: Row) { if (pendingCompletion.current) return; dirty.current = true; setSaved('Changes have not been saved yet.'); setData(previous => ({ ...previous, ...fields })); }
 async function finish(body: Row) {
  pendingCompletion.current = body; setCompletionPending(true);
  try {
   const result = await api<Row>(`/api/registration-drafts/${draftId.current}/complete`, json('POST', body));
   pendingCompletion.current = null; setCompletionPending(false); setReceipt(result); return result;
  } catch (e) {
   if (e instanceof ApiError && e.status && e.status < 500) { pendingCompletion.current = null; setCompletionPending(false); }
   throw e;
  }
 }
 async function persist(nextStep = step, complete?: Row, override?: Row) {
  if (saving.current || !hydrated.current) return null;
  saving.current = true; setBusy(true); setError(null);
  try {
   // Retry a possibly committed confirmation before attempting another draft update.
   if (pendingCompletion.current) return await finish(pendingCompletion.current);
   if (!draftId.current) { draftId.current = crypto.randomUUID(); setActiveId(draftId.current); }
   const payload = Object.fromEntries(Object.entries(override || data).filter(([, value]) => value !== undefined));
   const draft = await api<Row>('/api/registration-drafts', json('PUT', { id: draftId.current, kind, scope, payload, currentStep: nextStep, lockVersion: version.current }));
   source.setData(previous => ({ ...previous, items: [draft, ...(previous?.items || []).filter((item: Row) => item.id !== draft.id)] }));
   setData(draft.payload); version.current = draft.lock_version; dirty.current = false; setStep(draft.current_step); setSaved('Progress saved to your account. You can return later.');
   if (complete) {
    return await finish({ ...complete, lockVersion: version.current });
   }
   return draft;
  } catch (e) { setError(e); setSaved(pendingCompletion.current ? 'Confirmation could not be checked. Press Confirm registration again to retrieve the result safely.' : 'Progress could not be saved. Your answers remain on this page.'); return null; }
  finally { saving.current = false; setBusy(false); }
 }
 async function discard() {
  if (saving.current || pendingCompletion.current) return;
  setBusy(true); setError(null);
  try { if (draftId.current) await api(`/api/registration-drafts/${draftId.current}`, json('DELETE', { lockVersion: version.current })); load(undefined); source.reload(); }
  catch (e) { setError(e); } finally { setBusy(false); }
 }
 async function reload() {
  if (saving.current || pendingCompletion.current) return;
  setBusy(true); setError(null);
  try { const fresh = await api<Row>(`/api/registration-drafts?${new URLSearchParams({ kind, scope })}`); source.setData(fresh); load(fresh.items?.[0]); }
  catch (e) { setError(e); } finally { setBusy(false); }
 }
 return { source, data, step, busy, error, saved, receipt, activeId, completionPending, change, persist, heading, discard, select: load, reload, isDirty: () => dirty.current };
}
type Draft = ReturnType<typeof useRegistrationDraft>;
function DraftStatus({ draft }: { draft: Draft }) {
 return <>{draft.source.data?.items?.length > 1 && <div className="draft-picker"><label>Continue another saved draft<select disabled={draft.busy || draft.completionPending} defaultValue="" onChange={e => { const saved = draft.source.data?.items.find((item: Row) => item.id === e.target.value); if (saved && (!draft.isDirty() || window.confirm('Switch drafts and discard unsaved changes?'))) draft.select(saved); e.target.value=''; }}><option value="">Choose a saved draft</option>{draft.source.data?.items.map((item: Row) => <option key={item.id} value={item.id}>{item.payload?.name || item.payload?.schoolName || 'Unfinished registration'} · Step {item.current_step + 1}</option>)}</select></label></div>}<Errors error={draft.error} />{draft.saved && <p className="form-save-status" role="status">{draft.saved}</p>}{draft.error && !draft.completionPending && <button type="button" className="secondary" disabled={draft.busy} onClick={() => { if (window.confirm('Reload saved progress? Unsaved changes on this page will be discarded.')) void draft.reload(); }}>Reload saved progress</button>}</>;
}
function DraftActions({ draft, last = false, canContinue = true, onExit }: { draft: Draft; last?: boolean; canContinue?: boolean; onExit?: () => void }) {
 return <div className="form-step-actions">{draft.step > 0 && !draft.completionPending && <button type="button" className="secondary" disabled={draft.busy} onClick={() => void draft.persist(draft.step - 1)}>Back</button>}{!draft.completionPending && <button type="button" className="secondary" disabled={draft.busy} onClick={async () => { if (await draft.persist()) onExit?.(); }}>Save and exit</button>}<button disabled={draft.busy || !canContinue}>{draft.busy ? 'Saving…' : last ? 'Confirm registration' : 'Save and continue'}</button><button type="button" className="secondary" disabled={draft.busy || draft.completionPending} onClick={() => { if (window.confirm('Discard this unfinished registration and start again?')) void draft.discard(); }}>Start over</button></div>;
}
function Summary({ data, labels }: { data: Row; labels: Record<string,string> }) {
 return <dl className="registration-summary">{Object.entries(labels).map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{data[key] === undefined || data[key] === '' ? 'Not provided' : String(data[key])}</dd></div>)}</dl>;
}
const exit = () => window.location.assign('/dashboard');
function selectedSchool(school: Row) { return { schoolId: school.id, schoolName: school.name, schoolReference: school.reference, schoolLocation: [school.address, school.city, school.state, school.postal_code].filter(Boolean).join(', ') }; }
function SchoolSelection({ draft }: { draft: Draft }) {
 return draft.data.schoolId ? <><Notice><strong>{draft.data.schoolName}</strong><br />{draft.data.schoolLocation}<br />School ID: {draft.data.schoolReference}<div className="actions"><button className="secondary" type="button" onClick={() => draft.change({ schoolId: undefined, schoolName: '', schoolReference: '', schoolLocation: '' })}>Change school</button></div></Notice></> : <><SchoolAutocomplete onSelect={school => draft.change(selectedSchool(school))} /><p>School not registered? <Link href="/schools/register">Register your school</Link>, or <Link href="/schools">nominate the school</Link>.</p></>;
}
function BoundField({ draft, name, title, ...props }: { draft: Draft; name: string; title: string; [key: string]: any }) {
 return <Field name={name} title={title} {...props} value={draft.data[name] ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => draft.change({ [name]: props.type === 'number' ? e.target.value === '' ? undefined : Number(e.target.value) : e.target.value })} />;
}

export function SchoolWizard({ school, onSaved }: { school?: Row; onSaved?: () => void }) {
 const session = useResource<Row>('/api/auth/session');
 const initial = { name: school?.name || '', address: school?.address || '', city: school?.city || '', state: school?.state || '', postalCode: school?.postalCode || school?.postal_code || '', contactName: school?.contactName || '', contactRole: school?.contactRole || '', email: school?.email || '', coordinator: school?.coordinator || '', ...(school?.id ? { schoolId: school.id } : {}) };
 const draft = useRegistrationDraft('school', school?.id || 'new', initial);
 if (!draft.source.data || !session.data) return <ResourceState {...(draft.source.data ? session : draft.source)} retry={draft.source.data ? session.reload : draft.source.reload} />;
 if (draft.receipt) return <div className="receipt" role="status"><h2>{school?.id ? 'School details saved' : 'School registration received'}</h2><p>Permanent school ID: <strong>{draft.receipt.reference || draft.receipt.id}</strong></p><p>Status: {draft.receipt.status || 'pending review'}. Share the ID with students after the school is approved. School registration is lifetime.</p><Link className="button" href="/dashboard">Your dashboard</Link></div>;
 return <div className="registration-form"><FormSteps steps={['School','Location','Teacher contact','Review']} current={draft.step} /><DraftStatus draft={draft} /><form onSubmit={async e => { e.preventDefault(); if (draft.step === 3) { if (await draft.persist(3, {})) onSaved?.(); } else await draft.persist(draft.step + 1); }}><fieldset disabled={draft.busy}><legend className="sr-only">School registration</legend><div key={draft.step} className="form-step-content"><h2 ref={draft.heading} tabIndex={-1} className="form-step-heading">{['Your school','School location','Teacher or school contact','Review your school registration'][draft.step]}</h2>{draft.step === 0 && <><p>Check the <Link href="/schools">school directory</Link> before adding a new record. Each school branch keeps its own permanent ID.</p><BoundField draft={draft} name="name" title="School name" required maxLength={200} /></>}{draft.step === 1 && <><BoundField draft={draft} name="address" title="School address" required minLength={5} maxLength={1000} /><div className="field-row"><BoundField draft={draft} name="city" title="City or district" required /><BoundField draft={draft} name="state" title="State" required /></div><BoundField draft={draft} name="postalCode" title="Postal code" required autoComplete="postal-code" /></>}{draft.step === 2 && <><BoundField draft={draft} name="contactName" title="Teacher or contact name" required maxLength={150} /><BoundField draft={draft} name="contactRole" title="Role at school" required maxLength={100} /><BoundField draft={draft} name="email" title="School contact email" required type="email" autoComplete="email" /><Field name="verified-school-phone" title="Verified school contact phone" value={session.data.actor?.contact || ''} readOnly hint="The phone verified for this account will be saved as the school contact." /><BoundField draft={draft} name="coordinator" title="Additional coordinator details (optional)" maxLength={200} /></>}{draft.step === 3 && <><Summary data={draft.data} labels={{ name:'School',address:'Address',city:'City',state:'State',postalCode:'Postal code',contactName:'Contact name',contactRole:'Role',email:'Email',coordinator:'Coordinator' }} /><p>Verified phone: {session.data.actor?.contact}</p><p>Confirming creates a permanent school record for review. It does not confirm summit attendance.</p></>}</div><DraftActions draft={draft} last={draft.step === 3} onExit={exit} /></fieldset></form></div>;
}

export function StudentWizard({ actor }: { actor: Row }) {
 const config = useResource<PublicConfig>('/api/public/config'), records = useResource<Row>('/api/participant');
 const draft = useRegistrationDraft('student','new');
 const [consent, setConsent] = useState(false), [requestedId, setRequestedId] = useState('');
 useEffect(() => { setRequestedId(new URLSearchParams(window.location.search).get('competitionId') || ''); }, []);
 const editions = config.data?.editions.filter(e => e.state === 'open' && e.config?.registrationApproved && e.registration_opens && e.registration_closes && new Date(e.registration_opens).getTime() <= Date.now() && new Date(e.registration_closes).getTime() > Date.now()) || [];
 const requested = config.data?.competitions.find(c => c.id === requestedId);
 const edition = draft.data.editionId ? editions.find(e => e.id === draft.data.editionId) : editions.find(e => e.id === requested?.edition_id) || editions[0];
 const existing = records.data?.students?.find((s: Row) => s.id === draft.data.studentId);
 const already = existing && studentRegisteredFor(existing, edition?.id || '');
 const dashboard = requested ? `/dashboard?${new URLSearchParams({ competitionId: requestedId })}` : '/dashboard';
 const wording = edition?.config?.consentText, wordingVersion = edition?.config?.consentVersion;
 useEffect(() => { setConsent(false); }, [wordingVersion, edition?.id, draft.activeId, draft.data.studentId, draft.data.name, draft.data.class, draft.data.schoolId]);
 if (config.loading || config.error) return <ResourceState {...config} retry={config.reload} />;
 if (records.loading || records.error) return <ResourceState {...records} retry={records.reload} />;
 if (!draft.source.data) return <ResourceState {...draft.source} retry={draft.source.reload} />;
 if (draft.receipt) return <div className="receipt" role="status"><h2>Student registration received</h2><p>Student reference: <strong>{draft.receipt.student?.reference || draft.receipt.reference}</strong></p><p>Registration does not confirm physical event attendance.</p><Link className="button" href={dashboard}>Choose a competition</Link></div>;
 if (!edition || !wording || !wordingVersion) return <><DraftStatus draft={draft} /><Empty>{draft.data.editionId ? 'The edition in this saved registration is no longer open. Your saved answers remain in your account.' : 'Student registration is currently closed. Registration dates and consent information will be published before it opens.'}</Empty>{editions.length > 0 && <Field name="change-edition" title="Choose an open edition to continue"><select value="" disabled={draft.busy} onChange={e => { if (e.target.value) { setConsent(false); void draft.persist(0, undefined, { ...draft.data, editionId: e.target.value }); } }}><option value="">Select an edition</option>{editions.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></Field>}</>;
 const editionId = edition.id;
 async function next(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (draft.step === 0 && !draft.data.schoolId) return;
  // Persist the selected default edition without losing the remaining answers.
  const payload = { ...draft.data, editionId };
  if (draft.step === 3) await draft.persist(3, { consent, consentVersion: String(wordingVersion) }, payload);
  else await draft.persist(draft.step + 1, undefined, payload);
 }
 return <div className="registration-form"><FormSteps steps={['School','Student','Contact & consent','Review']} current={draft.step} /><DraftStatus draft={draft} />{already && <Notice>This student is already registered for {edition.label}. <Link href={dashboard}>Continue from the dashboard</Link>.</Notice>}<form onSubmit={next}><fieldset disabled={draft.busy}><legend className="sr-only">Student registration</legend><div key={draft.step} className="form-step-content"><h2 ref={draft.heading} tabIndex={-1} className="form-step-heading">{['Find your school','Student details','Parent contact and consent','Review your registration'][draft.step]}</h2>{draft.step === 0 && <><Field name="edition" title="Summit edition" required><select required value={draft.data.editionId || edition.id} onChange={e => { setConsent(false); draft.change({ editionId:e.target.value }); }}>{editions.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></Field><SchoolSelection draft={draft} /></>}{draft.step === 1 && <><Field name="existing-student" title="Student profile"><select value={draft.data.studentId || ''} onChange={e => { const selected = records.data?.students?.find((s: Row) => s.id === e.target.value); draft.change({ studentId:e.target.value || undefined,name:selected?.name || '',class:undefined,section:'' }); }}><option value="">Register a new student</option>{records.data?.students?.map((s: Row) => <option key={s.id} value={s.id}>{s.name} · {s.reference}</option>)}</select></Field><p>Returning students keep their existing student reference. Register each sibling separately.</p><BoundField draft={draft} name="name" title="Student name" required minLength={2} maxLength={150} readOnly={Boolean(existing)} /><div className="field-row"><BoundField draft={draft} name="class" title="Class" type="number" required min={1} max={12} /><BoundField draft={draft} name="section" title="Section (optional)" maxLength={30} /></div><BoundField draft={draft} name="coordinator" title="Teacher or coordinator name (optional)" maxLength={150} /></>}{draft.step === 2 && <><Field name="guardian-phone" title="Verified parent or guardian phone" type="tel" value={actor.contact || ''} readOnly hint="Use the parent or guardian’s verified account. Teachers should share the school ID and registration link with families." /><BoundField draft={draft} name="emergencyContact" title="Emergency contact phone (optional)" type="tel" pattern="\+[1-9][0-9]{7,14}" hint="Include the country code, for example +91. An emergency contact is not automatically a guardian." /><p className="prose">{wording}</p><label className="check-label"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />I confirm the consent stated above.</label><p><Link href="/privacy">Privacy information</Link> · <Link href="/terms">Participation terms</Link></p></>}{draft.step === 3 && <><Summary data={draft.data} labels={{ schoolName:'School',schoolReference:'School ID',schoolLocation:'School location',name:'Student',class:'Class',section:'Section',coordinator:'Teacher',emergencyContact:'Emergency contact' }} /><p>Parent or guardian phone: {actor.contact}</p><p>Edition: {edition.label}</p><p>Consent version: {String(wordingVersion)}</p>{!consent && <label className="check-label"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />I have read and agree to the participation consent. <span className="prose">{wording}</span></label>}<p>Confirming registration creates your student record. Competition entry and event attendance are separate steps.</p></>}</div><DraftActions draft={draft} last={draft.step === 3} canContinue={!already && (draft.step !== 0 || Boolean(draft.data.schoolId))} onExit={exit} /></fieldset></form></div>;
}

export function TeacherWizard({ actor }: { actor: Row }) {
 const draft = useRegistrationDraft('teacher','new');
 if (!draft.source.data) return <ResourceState {...draft.source} retry={draft.source.reload} />;
 if (draft.receipt) return <div className="receipt" role="status"><h2>Teacher registration received</h2><p>Reference: <strong>{draft.receipt.reference}</strong></p><p>Status: {draft.receipt.status}. The team will verify your school association before enabling school dashboard access.</p><Link className="button" href="/dashboard">Your dashboard</Link></div>;
 return <div className="registration-form"><FormSteps steps={['School','Teacher details','Review']} current={draft.step} /><DraftStatus draft={draft} /><form onSubmit={async e => { e.preventDefault(); if (draft.step === 0 && !draft.data.schoolId) return; if (draft.step === 2) await draft.persist(2,{}); else await draft.persist(draft.step + 1); }}><fieldset disabled={draft.busy}><legend className="sr-only">Teacher registration</legend><div key={draft.step} className="form-step-content"><h2 ref={draft.heading} tabIndex={-1} className="form-step-heading">{['Your registered school','Your teacher details','Review teacher registration'][draft.step]}</h2>{draft.step === 0 && <SchoolSelection draft={draft} />}{draft.step === 1 && <><BoundField draft={draft} name="name" title="Teacher name" required minLength={2} maxLength={150} /><BoundField draft={draft} name="role" title="Role at school" required minLength={2} maxLength={100} /><BoundField draft={draft} name="email" title="Teacher email" required type="email" /><BoundField draft={draft} name="subject" title="Subject or department (optional)" maxLength={200} /><Field name="teacher-phone" title="Verified teacher phone" value={actor.contact || ''} readOnly /></>}{draft.step === 2 && <><Summary data={draft.data} labels={{ schoolName:'School',schoolReference:'School ID',schoolLocation:'Location',name:'Teacher',role:'Role',email:'Email',subject:'Subject or department' }} /><p>Verified phone: {actor.contact}</p><p>The team will review your school association. After approval, the school dashboard shows linked students and competition progress.</p></>}</div><DraftActions draft={draft} last={draft.step === 2} canContinue={draft.step !== 0 || Boolean(draft.data.schoolId)} onExit={exit} /></fieldset></form></div>;
}

export function RegistrationDraftList() {
 return <section className="panel"><h2>Continue a saved registration</h2><p>Sign in with the same verified phone to resume from your last saved step.</p><div className="actions"><Link href="/register">Student registration</Link><Link href="/teachers/register">Teacher registration</Link><Link href="/schools/register">School registration</Link></div></section>;
}
