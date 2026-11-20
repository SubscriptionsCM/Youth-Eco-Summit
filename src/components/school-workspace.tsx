'use client';
import Link from 'next/link';

import { useState, type FormEvent, type ReactNode } from 'react';
import { api, json, type Row } from './api';
import { StatusBadge } from './portal-ui';
import { SchoolAutocomplete } from './registration';
import { AuthGate, Empty, Errors, Field, Notice, PageTitle, Pagination, ResourceState, useResource } from './shared';

const endpoint = '/api/school-workspace';
type SchoolRequest = {
  id: string; schoolId: string; schoolName: string; schoolReference: string; city: string; state: string;
  status: 'pending' | 'approved' | 'revoked'; reason: string; decisionReason?: string | null;
  requesterName?: string; requesterContact?: string; requesterActive?: boolean;
};
type RequestList = { requests: SchoolRequest[] };
type StaffRequestList = RequestList & { total: number; page: number; pageSize: number };
type SchoolCompetition = { title: string; reference: string; source: 'portal' | 'wordpress'; submittedAt: string | null };
type Student = {
  id: string; reference: string; name: string; className: string; section: string; year: string | null;
  source: SchoolCompetition['source']; lockVersion: number; competitions: SchoolCompetition[];
};
type SchoolResults = {
  school: { name: string; reference: string; city: string; state: string };
  students: Student[]; years: string[]; page: number; pageSize: number; total: number;
  competitionTotal: number; competitionProgress: { title: string; submitted: number }[];
};

function SaveForm({ path, method, label, success, changed, fields, children }: {
  path: string; method: 'POST' | 'PATCH'; label: string; success: string; changed: () => void;
  fields?: Record<string, string | number>; children: ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError(null);
    setMessage('');
    try {
      await api(path, json(method, { ...Object.fromEntries(new FormData(form)), ...fields }));
      form.reset();
      setMessage(success);
      changed();
    } catch (error) {
      setError(error);
    } finally {
      setSaving(false);
    }
  }
  return <form className="form" onSubmit={save}>
    {children}
    <div className="actions"><button disabled={saving}>{saving ? 'Saving…' : label}</button></div>
    <Errors error={error}/>
    {message && <Notice>{message}</Notice>}
  </form>;
}

function Reason({ title = 'Reason' }: { title?: string }) {
  return <Field name="reason" title={title} required>
    <textarea name="reason" rows={3} required minLength={3} maxLength={1000}/>
  </Field>;
}

function RequestCard({ request, children }: { request: SchoolRequest; children?: ReactNode }) {
  const city = [request.city, request.state].filter(Boolean).join(', ');
  return <article className="panel">
    <h3>{request.schoolName}</h3>
    <p>{request.schoolReference}{city && <> · {city}</>}</p>
    <p><StatusBadge value={request.status}/></p>
    {children}
  </article>;
}

export function SchoolWorkspace() {
  return <>
    <PageTitle title="My school">Request access to view your school’s student registrations and competition progress.</PageTitle>
    <AuthGate roles={['participant']}>{() => <ParticipantWorkspace/>}</AuthGate>
  </>;
}

function ParticipantWorkspace() {
  const resource = useResource<RequestList>(endpoint);
  const [chosenId, setChosenId] = useState('');
  const [requestedSchool, setRequestedSchool] = useState<Row | null>(null);
  const requests = resource.data?.requests ?? [];
  const approved = requests.filter(request => request.status === 'approved');
  const schoolId = approved.some(item => item.schoolId === chosenId) ? chosenId : (approved[0]?.schoolId ?? '');
  return <>
    <section className="panel">
      <h2>Request access</h2>
      <p>A Summit administrator reviews each request before granting access.</p>
      {requestedSchool ? <>
        <p role="status"><strong>{requestedSchool.name}</strong> · {[requestedSchool.address, requestedSchool.city, requestedSchool.state].filter(Boolean).join(', ')} · {requestedSchool.reference}</p>
        <button type="button" className="secondary" onClick={() => setRequestedSchool(null)}>Change school</button>
        <SaveForm path={endpoint + '/requests'} method="POST" label="Request school access" success="Your request is awaiting review."
          fields={{schoolId:String(requestedSchool.reference)}} changed={resource.reload}>
          <Reason title="How do you represent this school?"/>
        </SaveForm>
      </> : <SchoolAutocomplete onSelect={setRequestedSchool}/>}
    </section>
    <ResourceState {...resource} retry={resource.reload}/>
    {resource.data && !resource.error && <section>
      <div className="actions"><h2>Your access requests</h2><button type="button" className="secondary" onClick={resource.reload}>Refresh access status</button></div>
      {requests.length ? requests.map(request => <RequestCard key={request.id} request={request}/>) : <Empty>No school access requests yet.</Empty>}
    </section>}
    {schoolId && !resource.error && <section>
      {approved.length > 1 && <Field name="school" title="School">
        <select name="school" value={schoolId} onChange={event => setChosenId(event.target.value)}>
          {approved.map(request => <option key={request.id} value={request.schoolId}>{request.schoolName} ({request.schoolReference})</option>)}
        </select>
      </Field>}
      <SchoolRecords key={schoolId} schoolId={schoolId}/>
    </section>}
  </>;
}

function SchoolRecords({ schoolId }: { schoolId: string }) {
  const [filters, setFilters] = useState({ year: '', q: '' });
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState('');
  const path = endpoint + '/schools/' + schoolId + '?' + new URLSearchParams({...filters, page:String(page)});
  const result = useResource<SchoolResults>(path);
  const data = result.dataPath === path && !result.error ? result.data : null;
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved('');
    const values = new FormData(event.currentTarget);
    setFilters({year:String(values.get('year') ?? ''), q:String(values.get('q') ?? '').trim()});
    setPage(1);
  }
  return <>
    <h2>{result.data?.school.name ?? 'Student registrations'}</h2>
    <form className="portal-filter-panel" onSubmit={filter}>
      <div className="field-row">
        <Field name="year" title="Submission year">
          <select name="year" defaultValue="">
            <option value="">All years</option>
            {result.data?.years.map(year => <option key={year} value={year}>{year === 'unknown' ? 'Unknown year' : year}</option>)}
          </select>
        </Field>
        <Field name="q" title="Search students" maxLength={200}/>
      </div>
      <div className="actions"><button>Apply filters</button><button type="button" className="secondary" onClick={result.reload}>Refresh</button></div>
    </form>
    {saved && <Notice>{saved}</Notice>}
    <ResourceState {...result} retry={result.reload}/>
    {data && !result.loading && <>
      <section className="panel">
        <h3>Competition progress</h3>
        <p>{data.competitionTotal} submissions for {filters.year === 'unknown' ? 'an unknown year' : filters.year || 'all years'}</p>
        {data.competitionProgress.length > 0 && <ul>{data.competitionProgress.map(item =>
          <li key={item.title}>{item.title} · {item.submitted} submitted</li>)}</ul>}
      </section>
      <h3>Student registrations</h3><p>Corrections update this school roster. Original registration forms, eligibility and submitted work stay unchanged.</p>
      {data.students.length ? data.students.map(student =>
        <StudentCard key={student.source + ':' + student.id} student={student} schoolId={schoolId}
          changed={() => { setSaved('Student correction saved.'); result.reload(); }}/>
      ) : <Empty>No student registrations match these filters.</Empty>}
      {(data.total > data.pageSize || page > 1) && <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage}/>}
    </>}
  </>;
}

function StudentCard({student, schoolId, changed}: {student: Student; schoolId: string; changed: () => void}) {
  const classDetails = [student.className && 'Class ' + student.className, student.section && 'Section ' + student.section].filter(Boolean);
  const path = [endpoint, 'schools', schoolId, 'students', student.source, student.id].join('/');
  return <article className="panel">
    <h4>{student.name || 'Name unavailable'}</h4>
    <p>{[...classDetails, student.reference, student.year ?? 'Unknown year'].join(' · ')}</p>
    {student.competitions.length ? <ul>{student.competitions.map(item =>
      <li key={item.source + ':' + item.reference}>{item.title} · Submitted · {item.reference}</li>
    )}</ul> : <p>No linked competition submissions for this filter.</p>}
    <details>
      <summary>Correct student details</summary>
      <SaveForm key={student.lockVersion} path={path} method="PATCH" fields={{lockVersion:student.lockVersion}} label="Save correction" success="Correction saved." changed={changed}>
        <Field name="name" title="Student name" defaultValue={student.name} maxLength={200} required/>
        <div className="field-row">
          <Field name="className" title="Class" defaultValue={student.className} maxLength={80}/>
          <Field name="section" title="Section" defaultValue={student.section} maxLength={80}/>
        </div>
        <Reason title="Reason for correction"/>
      </SaveForm>
    </details>
  </article>;
}

export function SchoolAccessAdministration() {
  return <>
    <PageTitle title="School access">Review requests from school representatives and manage their access.</PageTitle><p><Link href="/admin/school-records">Link student records to their school</Link></p>
    <AuthGate roles={['owner', 'admin']}>{() => <StaffRequests/>}</AuthGate>
  </>;
}

function StaffRequests() {
  const [page, setPage] = useState(1);
  const path = endpoint + '/admin?page=' + page;
  const resource = useResource<StaffRequestList>(path);
  const data = resource.dataPath === path && !resource.error && !resource.loading ? resource.data : null;
  const [saved, setSaved] = useState('');
  return <>
    <ResourceState {...resource} retry={resource.reload}/>
    {saved && <Notice>{saved}</Notice>}
    <div className="actions"><button type="button" className="secondary" onClick={resource.reload}>Refresh requests</button></div>
    {data && (data.requests.length ? data.requests.map(request =>
      <RequestCard key={request.id} request={request}>
        <p>Requested by <strong>{request.requesterName || request.requesterContact}</strong>
          {request.requesterName && <> · {request.requesterContact}</>}
          {!request.requesterActive && <> · Inactive account</>}
        </p>
        <p>{request.reason}</p>
        {request.decisionReason && <p>Decision reason · {request.decisionReason}</p>}
        {request.status !== 'revoked' && <details key={request.status}>
          <summary>Review access</summary>
          {request.status === 'pending' && <p>Verify the requester represents this school before approving access.</p>}
          <SaveForm path={endpoint + '/admin/' + request.id} method="PATCH" label="Save decision" success="Decision saved."
            fields={{expectedStatus:request.status}}
            changed={() => { setSaved('Access decision saved.'); resource.reload(); }}>
            <Field name="status" title="Decision" required>
              <select name="status" defaultValue="" required>
                <option value="">Select a decision</option>
                {request.status === 'pending' && request.requesterActive && <option value="approved">Approve access</option>}
                <option value="revoked">{request.status === 'pending' ? 'Decline request' : 'Revoke access'}</option>
              </select>
            </Field>
            <Reason title="Reason for decision"/>
          </SaveForm>
        </details>}
      </RequestCard>
    ) : <Empty>No school access requests on this page.</Empty>)}
    {data && (data.total > data.pageSize || page > 1) && <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage}/>}
  </>;
}
