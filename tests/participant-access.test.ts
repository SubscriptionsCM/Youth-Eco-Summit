import {expect,it} from 'vitest';
import {canUseForm,canUseSchoolWorkspace,entrySubmitter,participantKind,type ParticipantKind} from '../src/domain/participant-access';
import {portalGroups} from '../src/domain/portal-navigation';
import {afterLoginPath} from '../src/components/auth-navigation';
const actor=(kind:ParticipantKind)=>({role:'participant',participantKind:kind});
it('limits each participant to its own registration and competition submitter type',()=>{
 for(const kind of ['student','educator','school','unclassified'] as const){
  for(const [form,allowed] of [['student','student'],['teacher','educator'],['school','school']])expect(canUseForm(actor(kind),form)).toBe(kind===allowed);
  for(const submitter of ['student','educator'])expect(canUseForm(actor(kind),'painting',submitter)).toBe(kind===submitter);
 }
});
it('denies registration to staff, judges and anonymous sessions while keeping public enquiries open',()=>{
 for(const value of [null,{role:'judge'},{role:'admin'},{role:'owner'}]){
  for(const form of ['student','teacher','school','painting'])expect(canUseForm(value,form,'student')).toBe(false);
  for(const form of ['partner','nomination','legacy-12146'])expect(canUseForm(value,form)).toBe(true);
 }
 expect(canUseForm(actor('student'),'legacy-48437')).toBe(false);
 expect(canUseForm(actor('student'),'made-up')).toBe(false);
});
it('fails closed for unknown kinds and preserves educator/school approval-based workspace entry',()=>{
 expect(participantKind({role:'participant'})).toBe('unclassified');expect(entrySubmitter({role:'participant'})).toBeNull();
 for(const kind of ['student','educator','school','unclassified'] as const)expect(canUseSchoolWorkspace(actor(kind))).toBe(kind==='school'||kind==='educator');
 expect(canUseSchoolWorkspace({role:'judge',participantKind:'school'})).toBe(false);
});
it('never offers another registration kind in workspace menus',()=>{
 for(const kind of ['student','educator','school','unclassified'] as const){
  const links=portalGroups('participant','portal',kind).flatMap(group=>group.items).map(item=>item.href);
  expect(links).toContain('/dashboard');
  expect(links.includes('/register')).toBe(kind==='student');expect(links.includes('/teachers/register')).toBe(kind==='educator');expect(links.includes('/schools/register')).toBe(kind==='school');
  expect(links.some(link=>link.startsWith('/competitions/enter'))).toBe(kind==='student'||kind==='educator');
 }
 for(const role of ['judge','owner','admin'])expect(portalGroups(role).flatMap(group=>group.items).some(item=>['/register','/teachers/register','/schools/register'].includes(item.href))).toBe(false);
});
it('rejects cross-kind login return paths and preserves receipt reading',()=>{
 for(const path of ['/teachers/register','/schools/register','/forms/teacher','/forms/school','/competitions/enter?submitter=educator','/school'])expect(afterLoginPath('participant',path,'student')).toBe('/dashboard');
 for(const path of ['/teachers/register','/schools/register','/register','/competitions/enter','/forms/student','#saved=one'])if(path.startsWith('/'))expect(afterLoginPath('judge',path)).toBe('/judge');
 expect(afterLoginPath('participant','/forms/teacher#saved=owned-receipt','student')).toBe('/forms/teacher#saved=owned-receipt');
 expect(afterLoginPath('admin','/forms/student#saved=review')).toBe('/forms/student#saved=review');
 expect(afterLoginPath('participant','/teachers/register','educator')).toBe('/teachers/register');
 expect(afterLoginPath('participant','/competitions/enter?competition=painting&submitter=student','student')).toContain('submitter=student');
});
