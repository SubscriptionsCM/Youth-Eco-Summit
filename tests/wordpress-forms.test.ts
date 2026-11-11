import { describe, expect, it } from 'vitest';
import { referenceForms, visibleFields, validateReferenceAnswers } from '../src/domain/wordpress-forms';

describe('WordPress reference forms', () => {
 it('retains the fifteen current forms and all thirty-nine live source definitions', () => {
  expect(referenceForms).toHaveLength(39);
  expect(referenceForms.find(f => f.key === 'student')?.fields.some(f => f.id === 'password-1')).toBe(true);
  expect(referenceForms.filter(f => f.competition)).toHaveLength(10);
 });
 it('requires contacts only for the declared role and included students', () => {
  const form = referenceForms.find(f => f.key === 'eco-business-model')!;
  const answers = { 'hidden-yes-submitter': 'student', 'radio-yes-entry-mode': 'team', 'number-yes-team-size': '2', 'email-yes-student-1': 'discard@example.org', 'email-yes-guardian-1': 'guardian@example.org', 'email-yes-guardian-3': 'discard@example.org' };
  const ids = visibleFields(form, answers).map(f => f.id);
  expect(ids).toContain('phone-yes-guardian-2');
  expect(ids).not.toContain('email-yes-student-1');
  expect(ids).not.toContain('email-yes-guardian-3');
  const saved = validateReferenceAnswers(form, answers, { final: false });
  expect(saved.answers).not.toHaveProperty('email-yes-student-1');
  expect(saved.answers).not.toHaveProperty('email-yes-guardian-3');
 });
 it('rejects fractional teams and an unsupported role even for drafts', () => {
  const form = referenceForms.find(f => f.key === 'eco-business-model')!;
  expect(validateReferenceAnswers(form, { 'hidden-yes-submitter': 'student', 'radio-yes-entry-mode': 'team', 'number-yes-team-size': '2.5' }, { final: false }).errors).toHaveProperty('number-yes-team-size');
  expect(validateReferenceAnswers(form, { 'hidden-yes-submitter': 'owner' }, { final: true }).errors).toHaveProperty('hidden-yes-submitter');
 });
 it('rejects whitespace-only required values and evaluates conditions against normalized selections',()=>{
  const form=referenceForms.find(form=>form.key==='student')!;
  const result=validateReferenceAnswers(form,{'text-1':'   ','select-2':' Other (Not listed) '},{final:true,now:new Date('2026-11-04T12:00:00Z')});
  expect(result.errors).toHaveProperty('text-1');expect(result.errors).toHaveProperty('text-4');
 });
 it('does not persist passwords, verification codes or unchecked/replayed consent in drafts', () => {
  const form = referenceForms.find(f => f.key === 'student')!;
  const saved = validateReferenceAnswers(form, { 'text-1': 'Asha', 'password-1': 'a-password', 'consent-1': true, otp: '123456' }, { final: false });
  expect(saved.answers).toEqual({ 'text-1': 'Asha' });
 });
 it('validates class-specific topics and duplicate team participants on the server', () => {
  const form = referenceForms.find(f => f.key === 'eco-business-model')!;
  const result = validateReferenceAnswers(form, { 'hidden-yes-submitter': 'educator', 'radio-yes-entry-mode': 'team', 'number-yes-team-size': '2', 'text-yes-name': 'Asha Singh', 'text-yes-student-2': 'asha singh', 'select-yes-class': '5', 'select-yes-topic': 'invented', 'text-yes-title': 'invalid title' }, { final: true });
  expect(result.errors).toHaveProperty('text-yes-student-2');
  expect(result.errors).toHaveProperty('select-yes-class');
  expect(result.errors).toHaveProperty('select-yes-topic');
  expect(result.errors).toHaveProperty('text-yes-title');
 });
 it.each(['2026-11-10T12:00:00.000Z', '2026-11-15T18:29:59.999Z'])('keeps student registration and all competition submissions open at %s', timestamp => {
  const now = new Date(timestamp);
  for (const form of referenceForms.filter(form => form.key === 'student' || form.competition)) {
   expect(validateReferenceAnswers(form, {}, { final: true, now }).errors).not.toHaveProperty('_form');
  }
 });
 it('uses the exact cutoff and keeps school and educator registrations available afterwards', () => {
  const now = new Date('2026-11-15T18:30:00.000Z');
  for (const form of referenceForms.filter(form => form.key === 'student' || form.competition)) {
   expect(validateReferenceAnswers(form, {}, { final: true, now }).errors._form).toBe('Student registration and competition submissions are closed. The deadline is 15 November 2026, 11:59 p.m. IST.');
  }
  for (const key of ['school','teacher']) expect(validateReferenceAnswers(referenceForms.find(f=>f.key===key)!, {}, { final: true, now }).errors).not.toHaveProperty('_form');
 });
});
