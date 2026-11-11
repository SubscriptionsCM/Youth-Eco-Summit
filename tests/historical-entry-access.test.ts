import {createElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
const session=vi.hoisted(()=>({role:'owner'}));
vi.mock('../src/components/shared',()=>({
 AuthGate:({roles,children}:{roles:string[];children:(actor:{role:string})=>ReactNode})=>roles.includes(session.role)?children({role:session.role}):createElement('p',null,'Access denied'),
 useResource:()=>({data:{title:'Retained QA entry',sourceId:'20',fields:[],attachments:[]},loading:false,error:'',reload:()=>{}}),
 Errors:()=>null,ResourceState:()=>null,PageTitle:({title}:{title:string})=>createElement('h1',null,title),
}));
import {HistoricalEntry} from '../src/components/historical-entry';
describe('historical entry page access',()=>{
 it.each(['owner','admin'])('lets %s reach the authorized archive details and staff return link',role=>{
  session.role=role;const html=renderToStaticMarkup(createElement(HistoricalEntry,{id:'qa-record'}));expect(html).toContain('Retained QA entry');expect(html).toContain('/admin/wordpress-history');
 });
 it('keeps judge access blocked',()=>{session.role='judge';expect(renderToStaticMarkup(createElement(HistoricalEntry,{id:'qa-record'}))).toContain('Access denied');});
 it('retains the participant dashboard return path',()=>{session.role='participant';expect(renderToStaticMarkup(createElement(HistoricalEntry,{id:'qa-record'}))).toContain('href="/dashboard"');});
});
