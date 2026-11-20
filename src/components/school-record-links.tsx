'use client';

import { useState, type FormEvent } from 'react';
import { api, json } from './api';
import {JudgePickerDate} from './judge-picker-date';
import { AuthGate, Empty, Errors, Field, Notice, PageTitle, Pagination, ResourceState, useResource } from './shared';

const endpoint = '/api/school-record-links';
type School = { id: string; name: string; reference: string; city: string; state: string };
type SchoolRecord = {
  id: string; source: 'portal' | 'wordpress'; title: string; reference: string; name: string;
  schoolId: string | null; directSchoolId: string | null; submittedAt: string | null;
  sourceChecksum: string; linkVersion: number; linkStale: boolean; linkActive: boolean; href: string;
};
type Results = { records: SchoolRecord[]; schools: School[]; years: string[]; page: number; pageSize: number; total: number };

function RecordCard({ record, schools, saved }: { record: SchoolRecord; schools: School[]; saved: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const current = schools.find(school => school.id === record.schoolId);
  async function save(event: FormEvent<HTMLFormElement>, action: 'link' | 'unlink') {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true);
    setError(null);
    try {
      await api(endpoint, json('POST', {
        action, source: record.source, recordId: record.id,
        ...(action === 'link' ? {schoolId: fields.get('schoolId')} : {}),
        sourceVersion: record.sourceChecksum, lockVersion: record.linkVersion, reason: fields.get('reason')
      }));
      form.reset();
      saved(action === 'link' ? 'School link saved.' : 'School link removed.');
    } catch (error) {
      setError(error);
    } finally {
      setSaving(false);
    }
  }
  return <article className="panel">
    <h2>{record.name || record.reference}</h2>
    <p>{record.title} / {record.reference}</p><JudgePickerDate source={record.source} entry={{submitted_at:record.submittedAt}}/>
    <p><a href={record.href} target="_blank" rel="noopener">Original submission (opens in a new tab)</a></p>
    <p>{record.directSchoolId
      ? 'Permanent school ID in original submission' + (current ? ` · ${current.name} (${current.reference})` : '')
      : record.linkStale ? 'The previous verification needs review. Verify the current original before saving.'
      : record.schoolId ? `Staff-verified school link${current ? ` · ${current.name} (${current.reference})` : ''}`
      : 'No permanent school ID resolved from the original submission.'}</p>
    {!record.directSchoolId && <form className="form" onSubmit={event => save(event, 'link')}>
      <Field name="schoolId" title="Verified school" required><select name="schoolId" required defaultValue={current?.id ?? ''}>
        <option value="">Choose a registered school</option>
        {schools.map(school => <option key={school.id} value={school.id}>
          {school.name} ({school.reference}){[school.city, school.state].filter(Boolean).map(location => ` · ${location}`)}
        </option>)}
      </select></Field>
      <Field name="reason" title="Verification reason" required hint="Describe the evidence you checked.">
        <textarea name="reason" required minLength={3} maxLength={1000}/>
      </Field>
      <div className="actions"><button disabled={saving || !schools.length}>{saving ? 'Saving…' : 'Save school link'}</button></div>
    </form>}
    {record.linkActive && <details>
      <summary>Remove manual school link</summary>
      {record.directSchoolId && <p>This removes the earlier manual verification. The permanent school ID in the original still applies.</p>}
      <form className="form" onSubmit={event => save(event, 'unlink')}>
        <Field name="reason" title="Removal reason" required>
          <textarea name="reason" required minLength={3} maxLength={1000}/>
        </Field>
        <div className="actions"><button className="danger" disabled={saving}>Remove school link</button></div>
      </form>
    </details>}
    <Errors error={error}/>
  </article>;
}

function LinkWorkspace() {
  const [filters, setFilters] = useState('status=unlinked');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const path = `${endpoint}?${filters}&page=${page}`;
  const resource = useResource<Results>(path);
  const data = resource.dataPath === path ? resource.data : null;
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
    }
    setPage(1);
    setFilters(params.toString());
    setMessage('');
  }
  function saved(message: string) {
    setMessage(message);
    setPage(1);
    resource.reload();
  }
  return <>
    <PageTitle title="Link school records">Verify the school against the original submission and supporting records before making it visible to approved school representatives.</PageTitle>
    <form className="form panel" onSubmit={apply}>
      <div className="field"><label htmlFor="record-link-search">Search by name, form or reference</label><input id="record-link-search" name="q" maxLength={200}/></div>
      <Field name="status" title="School link status"><select name="status" defaultValue="unlinked">
        <option value="unlinked">Unlinked</option><option value="linked">Linked</option>
      </select></Field>

      <Field name="kind" title="Record type"><select name="kind">
        <option value="">All types</option><option value="student">Student registration</option><option value="teacher">Teacher registration</option><option value="competition">Competition</option>
      </select></Field>
      <Field name="year" title="Submission year"><input name="year" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder="All years"/></Field>
      <div className="actions"><button type="submit">Apply filters</button></div>
    </form>
    {message && <Notice>{message}</Notice>}
    <ResourceState {...resource} retry={resource.reload}/>
    {!resource.error && !resource.loading && data && <>
      {data.records.length ? <div className="stack">{data.records.map(record =>
        <RecordCard key={`${record.source}:${record.id}:${record.linkVersion}:${record.sourceChecksum}`} record={record} schools={data.schools} saved={saved}/>
      )}</div> : <Empty>No submitted records match these filters.</Empty>}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/>
    </>}
  </>;
}

export function SchoolRecordLinks() {
  return <AuthGate roles={['owner', 'admin']}>{() => <LinkWorkspace/>}</AuthGate>;
}
