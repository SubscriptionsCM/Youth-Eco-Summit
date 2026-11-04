'use client';
import { useState } from 'react';
import { api, json, label, type Row } from './api';
import { Errors, Field, Notice } from './shared';
export function JudgeDecision({ entry, round, onChanged }: { entry: Row; round: Row; onChanged: () => void }) {
  const [error, setError] = useState<unknown>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [review, setReview] = useState<Row | null>(null);
  async function save() { setBusy(true); setError(null); try { await api('/api/judge/decisions', json('POST', { ...review, entryId: entry.id, roundId: round.id })); setMessage('Decision recorded.'); setReview(null); onChanged(); } catch (e) { setError(e); } finally { setBusy(false); } }
  const states = round.kind === 'screening' ? ['longlisted', 'disqualified'] : round.kind === 'jury' ? ['shortlisted', 'not_selected', 'finalized'] : [];
  if (!states.length) return null;
  return <section className="panel"><h2>{round.kind === 'screening' ? 'Guideline screening' : 'Jury decision'}</h2><Errors error={error} />{message && <Notice>{message}</Notice>}{review ? <><dl>{Object.entries(review).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{String(value)}</dd></div>)}</dl><div className="actions"><button className="secondary" disabled={busy} onClick={() => setReview(null)}>Back</button><button disabled={busy} onClick={save}>{busy ? 'Recording…' : 'Confirm decision'}</button></div></> : <form className="form" onSubmit={e => { e.preventDefault(); setReview(Object.fromEntries(new FormData(e.currentTarget))); }}><Field name="state" title="Outcome" required><select id="state" name="state" required><option value="">Select outcome</option>{states.map(state => <option value={state} key={state}>{label(state)}</option>)}</select></Field><Field name="reason" title="Guideline or decision reason" required minLength={3} />{round.kind === 'jury' && <><Field name="juryReference" title="Jury approval reference" required /><Field name="award" title="Approved award (optional)" /></>}<button>Review decision</button></form>}</section>;
}
