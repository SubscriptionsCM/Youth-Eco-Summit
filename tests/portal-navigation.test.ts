import {expect,it} from 'vitest';
import {portalGroups,isWorkspacePath,isPortalLinkActive,currentAdminDestination} from '../src/domain/portal-navigation';
const links=(role:string,mode='portal',kind?:'student'|'educator'|'school'|'unclassified')=>portalGroups(role,mode,kind).flatMap(g=>g.items).map(i=>i.href);
it('does not duplicate navigation destinations across groups',()=>{
 for(const mode of ['portal','manual','legacy']){const items=links('owner',mode);expect(new Set(items).size).toBe(items.length);}
});
it('shows one unified submissions link for staff in every mode, including old bookmarked URLs',()=>{
 for(const role of ['owner','admin'])for(const mode of ['portal','manual','legacy']){
  const items=portalGroups(role,mode).flatMap(group=>group.items);
  expect(items.filter(item=>item.label==='Forms & submissions').map(item=>item.href)).toEqual(['/admin/reference-forms']);
  expect(items.some(item=>item.href==='/admin/wordpress-history')).toBe(false);
  expect(items.filter(item=>isPortalLinkActive('/admin/wordpress-history',item.href)).map(item=>item.href)).toEqual(['/admin/reference-forms']);
 }
});
it('exposes the new reporting and school workspaces only to the relevant roles',()=>{
 expect(links('owner')).toContain('/admin/reports');expect(links('admin')).toContain('/admin/school-access');
 expect(links('participant','portal','educator')).toContain('/school');expect(links('judge')).not.toContain('/school');
 expect(isWorkspacePath('/school')).toBe(true);expect(isWorkspacePath('/school-news')).toBe(false);
});
it('keeps administrative destinations out of judge and participant navigation',()=>{
 expect(links('judge')).toContain('/judge');expect(links('judge').some(p=>p.startsWith('/admin'))).toBe(false);
 expect(links('participant','portal','educator')).toContain('/teachers/register');expect(links('participant','portal','school')).toContain('/schools/register');
 expect(links('participant').some(p=>p.startsWith('/admin')||p==='/judge')).toBe(false);expect(links('unknown')).toEqual([]);
});
it('keeps dedicated and legacy judging destinations separate',()=>{
 expect(links('owner')).toContain('/admin/judging');expect(links('admin')).toContain('/admin/judges');expect(links('owner')).not.toContain('/admin/rules');
 expect(links('owner','manual')).not.toContain('/admin/judging');expect(links('owner','manual')).not.toContain('/admin/judges');
 expect(links('owner','legacy')).toContain('/admin/rules');
});
it('takes staff to the current named-round manager in every CMS mode',()=>{
 for(const mode of ['portal','manual','legacy']){
  expect(currentAdminDestination('rounds',new URLSearchParams(),mode)).toBe('/admin/judging#review-round-setup');
  for(const role of ['owner','admin']){
   const roundLinks=portalGroups(role,mode).flatMap(group=>group.items).filter(item=>item.label==='Review rounds');
   if(mode!=='portal')expect(roundLinks.map(item=>item.href)).toEqual(['/admin/judging#review-round-setup']);
   expect(portalGroups(role,mode).flatMap(group=>group.items).filter(item=>isPortalLinkActive('/admin/judging',item.href))).toHaveLength(1);
   expect(links(role,mode)).not.toContain('/admin/rounds');
  }
 }
});
it('keeps the active website admin menu focused on populated submission and judging workflows',()=>{
 for(const role of ['admin','owner']){
  expect(links(role)).toEqual(['/admin','/admin/reports','/admin/reference-forms','/admin/schools','/admin/school-access','/admin/school-records','/admin/judging','/admin/judges','/admin/jobs','/admin/audit','/admin/trash']);
  expect(portalGroups(role)[0].items.map(i=>i.href)).toEqual(['/admin','/admin/reports','/admin/reference-forms']);
  expect(portalGroups(role)[0].items[0].label).toBe('Dashboard');
  expect(links(role)).not.toContain('/admin/wordpress-history');
  const groups=portalGroups(role),tools=groups.filter(g=>g.label==='Tools');
  expect(tools).toHaveLength(1);expect(tools[0].items.map(i=>i.label)).toEqual(['Background tasks','Activity log','Trash']);
  expect(groups.some(g=>g.label==='Support')).toBe(false);
  expect(portalGroups(role).flatMap(g=>g.items).find(i=>i.href==='/admin/judges')?.label).toBe('Staff accounts');
 }
});
it('routes older registration links into filtered current forms while preserving school context',()=>{
 expect(currentAdminDestination('students',new URLSearchParams({schoolId:'school-one',id:'old-person'}),'portal')).toBe('/admin/reference-forms?schoolId=school-one&formKey=student');
 expect(currentAdminDestination('teachers',new URLSearchParams(),'portal')).toBe('/admin/reference-forms?formKey=teacher');
 expect(currentAdminDestination('nominations',new URLSearchParams(),'portal')).toBe('/admin/reference-forms?formKey=nomination');
 expect(currentAdminDestination('partner-enquiries',new URLSearchParams(),'portal')).toBe('/admin/reference-forms?formKey=partner');
 expect(currentAdminDestination('entries',new URLSearchParams(),'portal')).toBe('/admin/reference-forms');
});
it('replaces duplicate judging and empty configuration screens without redirecting current or legacy-mode pages',()=>{
 for(const section of ['assignments','rules','reviews','results'])expect(currentAdminDestination(section,new URLSearchParams(),'portal')).toBe('/admin/judging');
 for(const section of ['files','repairs','imports','editions','competitions','content'])expect(currentAdminDestination(section,new URLSearchParams(),'portal')).toBe('/admin/tools');
 for(const section of ['overview','judging','judges','reference-forms','schools','tools','jobs','audit','trash'])expect(currentAdminDestination(section,new URLSearchParams(),'portal')).toBeNull();
 expect(currentAdminDestination('wordpress-history',new URLSearchParams({id:'old-record',q:'Green'}),'portal')).toBe('/admin/reference-forms?q=Green&id=old-record');
 expect(currentAdminDestination('students',new URLSearchParams(),'legacy')).toBeNull();
 expect(currentAdminDestination('editions',new URLSearchParams(),'manual')).toBeNull();
});
it('recognizes only existing workspace path boundaries and excludes public sign-in pages',()=>{
 for(const path of ['/admin','/admin/reference-forms','/dashboard','/judge/123','/forms/teacher','/schools/register','/teachers/register','/competitions/enter'])expect(isWorkspacePath(path)).toBe(true);
 for(const path of ['/','/about','/schools','/judge/login','/login','/invite','/administrator','/competitions/painting'])expect(isWorkspacePath(path)).toBe(false);
});
it('marks the current destination without selecting the entire admin menu',()=>{
 expect(isPortalLinkActive('/admin/reference-forms','/admin')).toBe(false);
 expect(isPortalLinkActive('/judge/123','/judge')).toBe(true);
 expect(isPortalLinkActive('/forms/teacher','/teachers/register')).toBe(true);
 expect(isPortalLinkActive('/forms/school','/schools/register')).toBe(true);
 expect(isPortalLinkActive('/admin/jobs-extra','/admin/jobs')).toBe(false);
 for(const path of ['/admin/jobs','/admin/audit','/admin/trash'])expect(isPortalLinkActive(path,'/admin/tools')).toBe(true);
 expect(isPortalLinkActive('/admin/jobs-extra','/admin/tools')).toBe(false);
});
