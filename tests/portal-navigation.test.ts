import {expect,it} from 'vitest';
import {portalGroups,isWorkspacePath,isPortalLinkActive} from '../src/domain/portal-navigation';
const links=(role:string,mode='portal')=>portalGroups(role,mode).flatMap(g=>g.items).map(i=>i.href);
it('does not duplicate navigation destinations across groups',()=>{
 for(const mode of ['portal','manual','legacy']){const items=links('owner',mode);expect(new Set(items).size).toBe(items.length);}
});
it('keeps administrative destinations out of judge and participant navigation',()=>{
 expect(links('judge')).toContain('/judge');expect(links('judge').some(p=>p.startsWith('/admin'))).toBe(false);
 expect(links('participant')).toContain('/teachers/register');expect(links('participant')).toContain('/schools/register');
 expect(links('participant').some(p=>p.startsWith('/admin')||p==='/judge')).toBe(false);expect(links('unknown')).toEqual([]);
});
it('keeps dedicated and legacy judging destinations separate',()=>{
 expect(links('owner')).toContain('/admin/judging');expect(links('admin')).toContain('/admin/judges');expect(links('owner')).not.toContain('/admin/rules');
 expect(links('owner','manual')).not.toContain('/admin/judging');expect(links('owner','manual')).not.toContain('/admin/judges');
 expect(links('owner','legacy')).toContain('/admin/rules');
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
});
