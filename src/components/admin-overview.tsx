'use client';
import Link from 'next/link';
import {useResource, ResourceState} from './shared';
import {SummaryMetric} from './portal-ui';
import type {Row} from './api';
import {dedicatedJudgingMode, manualReviewMode} from '../domain/review-mode';
import './admin-overview.css';

const number = (value: unknown) => value === null || value === undefined ? '—'
  : Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN') : '—';

export function AdminOverview() {
  const portal = dedicatedJudgingMode();
  const report = useResource<Row>(portal ? '/api/submission-report' : null);
  const overview = useResource<Row>('/api/admin/overview');
  const data = !report.loading && !report.error ? report.data : null;
  const summary = data?.summary;
  const counts = !overview.loading && !overview.error ? overview.data?.counts || overview.data : null;
  const judging = data?.judges?.reduce((total: {assigned: number; completed: number}, judge: Row) => ({
    assigned: total.assigned + Number(judge.assigned),
    completed: total.completed + Number(judge.completed)
  }), {assigned: 0, completed: 0});

  return <div className="admin-dashboard">
    {counts && Number(counts.failed_jobs_all_editions) > 0 && <div className="portal-attention-banner" role="status">
      <strong>{number(counts.failed_jobs_all_editions)} website tasks need attention</strong>
      <Link href="/admin/jobs">Review tasks</Link>
    </div>}

    {portal && <section aria-labelledby="dashboard-summary">
      <div className="dashboard-section-heading">
        <div><h2 id="dashboard-summary">Submission summary</h2><p>All years · All available submissions</p></div>
        <button type="button" className="secondary" disabled={report.loading || overview.loading}
          onClick={() => {report.reload(); overview.reload();}}>Refresh dashboard</button>
      </div>
      <ResourceState {...report} retry={report.reload}/>
      <div className="portal-metrics dashboard-metrics" aria-busy={report.loading}>
        <SummaryMetric title="Student registrations" value={number(summary?.registrations)} description="Submitted registration forms" href="/admin/reports"/>
        <SummaryMetric title="Competition entries" value={number(summary?.submissions)} description="Submitted work; drafts excluded" href="/admin/reports"/>
        <SummaryMetric title="Quality checks remaining" value={number(summary?.qcRemaining)} description="Entries still needing a check" href="/admin/reports"/>
        <SummaryMetric title="Quality checks completed" value={number(summary?.qcCompleted)} description={summary ? `${number(summary.qcCompletedToday)} completed today (India time)` : 'Recorded quality checks'} href="/admin/reports"/>
      </div>
      <details className="dashboard-count-help">
        <summary>What do these totals include?</summary>
        <p>Registrations count submitted forms, not unique people. Competition entries exclude drafts. Quality checks are separate from judge scores; earlier offline checks count here only after staff record them against individual entries.</p>
        {summary && <p>Other registration forms: {number(summary.educators)} educator · {number(summary.schoolRegistrations)} school.</p>}
        <p>Totals reflect records currently available in this workspace. Reconcile missing records before preparing final reports.</p>
        <Link href="/admin/reports">Open the full report and filters</Link>
      </details>
    </section>}

    <section className="portal-section" aria-labelledby="dashboard-actions">
      <div className="portal-section-heading"><h2 id="dashboard-actions">What would you like to do?</h2><p>Choose the task you want to work on.</p></div>
      <div className="portal-task-grid overview-task-grid dashboard-actions">
        <Link className="portal-task" href={portal ? '/admin/reports' : '/admin/reference-forms'}>
          <span className="workspace-eyebrow">Submissions</span><h3>Check submitted work</h3>
          <p>Open entries and attachments, record quality checks and follow category-wise progress.</p>
          <span className="portal-task-link">{portal ? 'Open submissions & quality checks' : 'Open forms inbox'}</span>
        </Link>
        <Link className="portal-task" href={portal ? '/admin/judging' : manualReviewMode() ? '/admin/reference-forms' : '/admin/assignments'}>
          <span className="workspace-eyebrow">{portal ? 'Judging' : 'Review'}</span><h3>{portal ? 'Manage judges & reviews' : 'Review submissions'}</h3>
          <p>{portal ? 'Assign entries to judges and see which reviews are complete.' : 'Open submitted work and follow its review progress.'}</p>
          {portal && <span className="dashboard-task-status">{judging
            ? judging.assigned ? `${number(judging.completed)} of ${number(judging.assigned)} assignments completed` : 'No entries assigned yet'
            : 'Refresh the summary to see judging progress'}</span>}
          <span className="portal-task-link">{portal ? 'Open judging' : 'Open review workspace'}</span>
        </Link>
        <Link className="portal-task" href={portal ? '/admin/school-access' : '/admin/schools'}>
          <span className="workspace-eyebrow">Schools</span><h3>Manage school access</h3>
          <p>{portal ? 'Approve school representatives so they can view their own students and competition entries.' : 'Find registered schools and review their information.'}</p>
          <span className="portal-task-link">{portal ? 'Review school access' : 'Open schools'}</span>
        </Link>
      </div>
    </section>

    <section className="panel dashboard-records"><h2>Forms & attachments</h2><p>Find registrations, competition work and enquiries together. Each form keeps its original submission date and attachments.</p><Link href="/admin/reference-forms">Browse all forms & submissions</Link></section>
    {overview.error && <div className="dashboard-data-warning"><ResourceState {...overview} retry={overview.reload}/></div>}
  </div>;
}
