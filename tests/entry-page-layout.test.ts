import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {usePathname} from 'next/navigation';
import {SiteShell} from '../src/components/site-shell';
vi.mock('next/navigation',()=>({usePathname:vi.fn()}));
function render(path:string){vi.mocked(usePathname).mockReturnValue(path);return renderToStaticMarkup(createElement(SiteShell,{children:createElement('p',null,'Entry content')}));}
describe('competition page layout',()=>{
 it('keeps the entry workflow in the padded portal layout',()=>{
  expect(render('/competitions/enter')).toMatch(/<main[^>]*class="shell portal-main"/);
 });
 it.each(['/competitions','/competitions/open-letter'])('preserves full-width information pages at %s',path=>{
  expect(render(path)).toMatch(/<main[^>]*class="marketing-main"/);
 });
});
