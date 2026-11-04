'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, json, type Row } from './api';
import { Errors, Field, Notice } from './shared';
import { AssetList } from './uploads';
import { SchoolForm } from './registration';
export function AdminRecordActions({ resource, row, onChanged }: { resource: string; row: Row; onChanged: () => void }) {
  if (resource === 'students') return <StudentCorrection row={row} onChanged={onChanged} />;
  if (resource === 'schools') return <details><summary>Correct school details</summary><p>Changes are recorded in the audit history.</p><SchoolForm key={row.id} school={row} onSaved={onChanged} /></details>;
  if (resource === 'files') return <FileRecordDetails key={row.id} row={row} onChanged={onChanged} />;
  if (resource === 'repairs') return <><p>This historical file is not retained and ready yet. An administrator must retrieve an authorized local copy and run the documented repair import. No external file is fetched automatically.</p><Link href={`/entries/${row.submission_id}`}>Open affected entry</Link></>;
  return null;
}
function FileRecordDetails({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false), [recovered, setRecovered] = useState(false);
  async function recover(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const reason = String(new FormData(event.currentTarget).get('reason') || '');
      await api(`/api/uploads/${encodeURIComponent(row.id)}/recover`, json('POST', { reason }));
      setRecovered(true); onChanged();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  const asset = recovered ? { ...row, trashed_at: null } : row;
  return <><AssetList assets={[asset]} /><Link href={`/entries/${row.submission_id}`}>Open owning entry and revision history</Link>{recovered && <Notice>File recovered into the retained archive. Submitted revisions, scored work and public selections are unchanged.</Notice>}{!recovered && row.trashed_at && <p>This file is in Trash.</p>}{!recovered && row.can_recover_archival === true && <details><summary>Recover archival file</summary><p>Recover this earlier draft file into the retained archive. Recovery does not add it to the submitted revision or approved public files.</p><form className="form" onSubmit={recover}><Errors error={error} /><Field name="reason" title="Reason for archival recovery" required minLength={3} maxLength={2000} /><button disabled={busy}>{busy ? 'Recovering…' : 'Recover archival file'}</button></form></details>}</>;
}
function StudentCorrection({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(null); try { const data = Object.fromEntries(new FormData(e.currentTarget)); await api(`/api/admin/students/${row.id}`, json('PATCH', { ...data, emergencyContact: data.emergencyContact || null, action: 'correct' })); setMessage('Support correction saved with an audit record.'); onChanged(); } catch (e) { setError(e); } finally { setBusy(false); } }
  return <details><summary>Support correction</summary><form key={row.id} className="form" onSubmit={submit}><Errors error={error} />{message && <Notice>{message}</Notice>}<Field name="name" title="Student name" required defaultValue={row.name} /><Field name="emergencyContact" title="Emergency contact (optional)" defaultValue={row.emergency_contact} /><Field name="reason" title="Reason for support correction" required minLength={3} /><button disabled={busy}>{busy ? 'Saving…' : 'Save support correction'}</button></form></details>;
}
