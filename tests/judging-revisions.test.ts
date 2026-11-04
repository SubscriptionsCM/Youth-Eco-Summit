import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { testDb } from './helpers/db';
import { id, type Actor } from '../src/server/core';
import { createEntry, submitEntry } from '../src/server/entries';
import { adminPatch } from '../src/server/admin';
import { assignmentDetail, recordDecision, routeEntries, saveReview } from '../src/server/judging';

describe('judging revisions and prerequisite scoring rounds', () => {
  let store: Awaited<ReturnType<typeof testDb>>;
  let parent: Actor, admin: Actor, judge: Actor, secondJudge: Actor;
  let editionId: string, competitionId: string, otherCompetitionId: string, participationId: string;
  const config = {
    mode: 'individual', entryLimit: 100, minMembers: 1, maxMembers: 1,
    categories: [{ id: 'junior', label: 'Junior', classes: [5] }], fields: [],
    files: { minCount: 0, maxCount: 0, maxBytes: 10000, types: ['application/pdf'] },
  };
  const rubric = { criteria: [{ id: 'quality', label: 'Quality', min: 0, max: 10, required: true, weight: 1 }], commentRequired: false };

  beforeAll(async () => {
    store = await testDb();
    const actors: Actor[] = [];
    for (const role of ['participant', 'admin', 'judge', 'judge'] as const) {
      const actor = { id: id(), role };
      await store.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)', [actor.id, role, `${actor.id}@example.test`]);
      actors.push(actor);
    }
    [parent, admin, judge, secondJudge] = actors;
    editionId = id(); competitionId = id(); otherCompetitionId = id(); participationId = id();
    const schoolId = id(), studentId = id();
    await store.db.query("INSERT INTO editions(id,label,state) VALUES($1,'Revision tests','open')", [editionId]);
    await store.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-REVISION','School','Test street','Delhi','Delhi','110001','active')", [schoolId]);
    await store.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,'STU-REVISION','Student','+919000000001')", [studentId]);
    await store.db.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)', [parent.id, studentId]);
    await store.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,5,'{}')", [participationId, studentId, schoolId, editionId]);
    for (const cid of [competitionId, otherCompetitionId]) {
      await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,$3,'Test competition','Approved test guidelines','approved',now()-interval '1 day',now()+interval '1 day',$4)", [cid, editionId, cid, JSON.stringify(config)]);
    }
  });
  afterAll(async () => { await store?.close(); });

  async function round(kind: 'screening' | 'scoring' | 'jury', prerequisites: string[] = [], requiredReviews = 1, cid = competitionId) {
    const roundId = id();
    await store.db.query(`INSERT INTO review_rounds(id,competition_id,name,kind,eligible_states,open,rubric,decision_roles,required_reviews,prerequisite_round_ids)
      VALUES($1,$2,$3,$4,'["submitted","longlisted","shortlisted"]',true,$5,'["admin"]',$6,$7)`,
    [roundId, cid, `${kind} ${roundId}`, kind, JSON.stringify(rubric), requiredReviews, JSON.stringify(prerequisites)]);
    return roundId;
  }
  async function submittedEntry() {
    const draft = await createEntry(store.db, parent, { participationId, competitionId, answers: {} });
    await submitEntry(store.db, parent, draft.id, draft.lock_version);
    return draft.id as string;
  }
  async function routedEntry() {
    const entryId = await submittedEntry(), roundId = await round('screening');
    await store.db.query("INSERT INTO assignment_rules(id,competition_id,category_id,round_id,judge_id) VALUES($1,$2,'junior',$3,$4)", [id(), competitionId, roundId, judge.id]);
    await routeEntries(store.db);
    const { rows: [assignment] } = await store.db.query('SELECT * FROM judge_assignments WHERE submission_id=$1 AND round_id=$2 AND judge_id=$3', [entryId, roundId, judge.id]);
    return { entryId, roundId, assignmentId: assignment.id as string };
  }
  async function resubmit(entryId: string) {
    const { rows: [entry] } = await store.db.query('SELECT lock_version FROM submissions WHERE id=$1', [entryId]);
    await submitEntry(store.db, parent, entryId, entry.lock_version);
    await routeEntries(store.db);
    await routeEntries(store.db);
  }
  async function review(entryId: string, roundId: string, reviewer = judge, revision = 1, status = 'submitted', eligible = true) {
    const { rows: [assignment] } = await store.db.query(`INSERT INTO judge_assignments(id,submission_id,judge_id,round_id,revision) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(submission_id,judge_id,round_id) DO UPDATE SET revision=greatest(judge_assignments.revision,excluded.revision) RETURNING id`, [id(), entryId, reviewer.id, roundId, revision]);
    const reviewId = id();
    await store.db.query("INSERT INTO reviews(id,assignment_id,revision,rubric_version,scores,status,eligible_for_results) VALUES($1,$2,$3,1,'{\"quality\":7}',$4,$5)", [reviewId, assignment.id, revision, status, eligible]);
    return reviewId;
  }
  function decision(entryId: string, roundId: string, state: 'shortlisted' | 'finalized') {
    return recordDecision(store.db, admin, { entryId, roundId, state, reason: 'Approved jury outcome', juryReference: 'JURY-MINUTES-TEST' });
  }

  it('routes a resubmitted revision once and preserves the previously submitted review', async () => {
    const { entryId, assignmentId } = await routedEntry();
    const original = await saveReview(store.db, judge, assignmentId, { scores: { quality: 8 }, comment: 'Original review' }, true);
    await adminPatch(store.db, admin, 'entries', entryId, { action: 'reopen', reason: 'Approved correction' });
    // Reopening an already reopened draft must not convert system invalidation to an exclusion.
    await adminPatch(store.db, admin, 'entries', entryId, { action: 'reopen', reason: 'Correction still pending' });
    await resubmit(entryId);
    const { rows: assignments } = await store.db.query('SELECT * FROM judge_assignments WHERE id=$1', [assignmentId]);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ active: true, revision: 2, revoked_at: null, revision_invalidated: false });
    expect((await assignmentDetail(store.db, judge, assignmentId)).review).toBeNull();
    await saveReview(store.db, judge, assignmentId, { scores: { quality: 6 }, comment: 'Replacement review' }, true);
    const { rows: reviews } = await store.db.query('SELECT * FROM reviews WHERE assignment_id=$1 ORDER BY revision', [assignmentId]);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({ id: original.id, revision: 1, scores: { quality: 8 }, comment: 'Original review', status: 'submitted' });
    expect(reviews[1]).toMatchObject({ revision: 2, scores: { quality: 6 }, status: 'submitted' });
  });

  it.each(['before', 'after'] as const)('does not recreate an assignment manually revoked %s reopening', async when => {
    const { entryId, assignmentId } = await routedEntry();
    const revoke = () => adminPatch(store.db, admin, 'assignments', assignmentId, { action: 'revoke', reason: 'Declared conflict of interest' });
    if (when === 'before') await revoke();
    await adminPatch(store.db, admin, 'entries', entryId, { action: 'reopen', reason: 'Approved correction' });
    if (when === 'after') await revoke();
    await adminPatch(store.db, admin, 'entries', entryId, { action: 'reopen', reason: 'Correction still pending' });
    await resubmit(entryId);
    const { rows: [assignment] } = await store.db.query('SELECT * FROM judge_assignments WHERE id=$1', [assignmentId]);
    expect(assignment).toMatchObject({ active: false, revision: 1, revision_invalidated: false });
    expect(assignment.revoked_at).not.toBeNull();
    await expect(assignmentDetail(store.db, judge, assignmentId)).rejects.toThrow('Active assignment not found');
  });

  it.each(['shortlisted', 'finalized'] as const)('requires eligible final reviews of the exact revision in the configured round before %s', async state => {
    const entryId = await submittedEntry(), preliminary = await round('scoring'), required = await round('scoring');
    const jury = await round('jury', [required]);
    await store.db.query(`INSERT INTO submission_revisions(id,submission_id,version,answers,context,asset_ids,config,submitted_by)
      SELECT $1,submission_id,2,answers,context,asset_ids,config,submitted_by FROM submission_revisions WHERE submission_id=$2 AND version=1`, [id(), entryId]);
    await store.db.query('UPDATE submissions SET state=$2,revision=2 WHERE id=$1', [entryId, state === 'shortlisted' ? 'longlisted' : 'shortlisted']);
    await review(entryId, preliminary, judge, 2);
    await expect(decision(entryId, jury, state)).rejects.toThrow('required submitted reviews');
    await review(entryId, required, judge, 1);
    await expect(decision(entryId, jury, state)).rejects.toThrow('required submitted reviews');
    const current = await review(entryId, required, judge, 2, 'draft');
    await expect(decision(entryId, jury, state)).rejects.toThrow('required submitted reviews');
    await store.db.query("UPDATE reviews SET status='submitted',eligible_for_results=false WHERE id=$1", [current]);
    await expect(decision(entryId, jury, state)).rejects.toThrow('required submitted reviews');
    await store.db.query('UPDATE reviews SET eligible_for_results=true WHERE id=$1', [current]);
    expect(await decision(entryId, jury, state)).toEqual({ state });
    const { rows: decisions } = await store.db.query('SELECT * FROM decisions WHERE submission_id=$1', [entryId]);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ round_id: jury, revision: 2, to_state: state });
  });

  it('requires the configured number of distinct judges in every prerequisite round', async () => {
    const entryId = await submittedEntry(), first = await round('scoring'), second = await round('scoring');
    const jury = await round('jury', [first, second], 2);
    await store.db.query("UPDATE submissions SET state='longlisted' WHERE id=$1", [entryId]);
    await review(entryId, first, judge); await review(entryId, first, secondJudge);
    await review(entryId, second, judge);
    await expect(decision(entryId, jury, 'shortlisted')).rejects.toThrow('every prerequisite round');
    await review(entryId, second, secondJudge);
    expect(await decision(entryId, jury, 'shortlisted')).toEqual({ state: 'shortlisted' });
  });

  it.each(['missing', 'other competition', 'screening'] as const)('rejects %s prerequisite configuration instead of accepting unrelated scores', async invalid => {
    const entryId = await submittedEntry();
    const source = invalid === 'missing' ? null : await round(invalid === 'screening' ? 'screening' : 'scoring', [], 1, invalid === 'other competition' ? otherCompetitionId : competitionId);
    const jury = await round('jury', source ? [source] : []);
    await store.db.query("UPDATE submissions SET state='longlisted' WHERE id=$1", [entryId]);
    const unrelated = await round('scoring');
    await review(entryId, unrelated);
    await expect(decision(entryId, jury, 'shortlisted')).rejects.toThrow(invalid === 'missing' ? 'prerequisite scoring rounds' : 'scoring rounds for this competition');
    expect((await store.db.query('SELECT id FROM decisions WHERE submission_id=$1', [entryId])).rows).toHaveLength(0);
  });
});
