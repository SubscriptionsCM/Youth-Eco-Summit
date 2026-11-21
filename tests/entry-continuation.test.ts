// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,createElement,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {EntryJourney,entryJourneyHref,registeredEntrySchool} from '../src/components/entry-journey';
import EntryPage from '../src/app/competitions/enter/page';
import {competitionGuidelines2027} from '../src/data/guidelines-2027';

const harness=vi.hoisted(()=>({api:vi.fn(),actor:null as null|{role:string;participantKind?:'student'|'educator'|'school'|'unclassified'},school:{reference:'YES-SCH-0196F5E3'}}));
vi.mock('../src/components/api',()=>({api:harness.api}));
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:ReactNode})=>createElement('a',{href},children)}));
vi.mock('../src/components/registration',()=>({SchoolAutocomplete:({onSelect}:{onSelect:(school:unknown)=>void})=>createElement('button',{type:'button',onClick:()=>onSelect(harness.school)},'Choose test school')}));
vi.mock('../src/components/reference-form',()=>({ReferenceFormPage:(props:unknown)=>createElement('section',null,createElement('pre',{'data-test':'form'},JSON.stringify(props)),createElement('button',{type:'button',onClick:()=>{window.history.replaceState(null,'',window.location.pathname+window.location.search+'#saved=synthetic-saved');window.dispatchEvent(new window.Event('hashchange'));}},'Start saved fixture'))}));
vi.mock('../src/components/shared',()=>({useResource:()=>({loading:false,error:'',reload:vi.fn(),data:{actor:harness.actor}}),ResourceState:()=>null,PageTitle:({title,children}:{title:string;children:ReactNode})=>createElement('div',null,createElement('h1',null,title),children),Notice:({children,error}:{children:ReactNode;error?:boolean})=>createElement('div',{role:error?'alert':'status'},children)}));
const school={id:'school-one',reference:'YES-SCH-0196F5E3',name:'H.R. Patel Kanya Secondary And Higher Secondary School',address:'',city:'Shirpur',alternate_references:['YEC-EDU-0196F5E3']};
const context={submitter:'educator',competition:'waste-to-art',mode:'team',school_id:school.reference,team_size:'3'};
let root:Root,container:HTMLDivElement;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);harness.api.mockReset();harness.actor=null;harness.school={reference:school.reference};
 window.history.replaceState(null,'','/competitions/enter?submitter=educator&competition=waste-to-art&entry_type=team&school_id='+school.reference+'&team_size=3');
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const mount=async(props:Record<string,string>,key='journey')=>{await act(async()=>root.render(createElement(EntryJourney,{...props,key})));};
const form=()=>JSON.parse(container.querySelector('[data-test="form"]')!.textContent!);

it('accepts the existing entry_type/school_id link and gives explicit native mode precedence',async()=>{
 const page=await EntryPage({searchParams:Promise.resolve({...context,entry_type:'team',mode:undefined})});
 expect(page.props).toMatchObject({submitter:'educator',competition:'waste-to-art',mode:'team',schoolId:school.reference,teamSize:'3'});
 const native=await EntryPage({searchParams:Promise.resolve({...context,entry_type:'team',mode:'individual'})});
 expect(native.props.mode).toBe('individual');
});
it('preserves role, competition, school, team size and saved hash across navigation',()=>{
 const url=new URL(entryJourneyHref(context,{submitter:'student'},'#saved=synthetic-saved'),'https://local.test');
 expect(Object.fromEntries(url.searchParams)).toEqual({...context,submitter:'student'});expect(url.hash).toBe('#saved=synthetic-saved');
 const chooser=new URL(entryJourneyHref(context,{submitter:''}),'https://local.test');
 expect(chooser.searchParams.has('submitter')).toBe(false);expect(chooser.searchParams.get('school_id')).toBe(school.reference);expect(chooser.searchParams.get('mode')).toBe('team');
});
it('caps mode and team size for the selected competition and never carries a draft into another competition',()=>{
 const painting=new URL(entryJourneyHref(context,{competition:'painting'},'#saved=synthetic-saved'),'https://local.test');
 expect(painting.searchParams.get('mode')).toBe('individual');expect(painting.searchParams.has('team_size')).toBe(false);expect(painting.hash).toBe('');
 const capped=new URL(entryJourneyHref(context,{team_size:'99'}),'https://local.test');
 expect(capped.searchParams.get('team_size')).toBe(String(competitionGuidelines2027.find(item=>item.slug==='waste-to-art')!.team.maxMembers));
});
it('resolves exact canonical/alias IDs and rejects partial-name or ambiguous matches',async()=>{
 harness.api.mockResolvedValueOnce({items:[{...school,reference:'YES-SCH-81E1C2A7',alternate_references:['YES-SCH-EB7B157067']}]});
 expect((await registeredEntrySchool(' yes-sch-eb7b157067 ')).reference).toBe('YES-SCH-81E1C2A7');
 harness.api.mockResolvedValueOnce({items:[{...school,reference:'OTHER',name:school.reference,alternate_references:[]}]});
 await expect(registeredEntrySchool(school.reference)).rejects.toThrow('one active registered school');
 harness.api.mockResolvedValueOnce({items:[school,{...school,id:'different'}]});
 await expect(registeredEntrySchool(school.reference)).rejects.toThrow('one active registered school');
});
it('restores an existing old link into the form and canonical URL after exact public lookup',async()=>{
 harness.api.mockResolvedValue({items:[school]});
 const page=await EntryPage({searchParams:Promise.resolve({...context,entry_type:'team',mode:undefined})});
 await mount(page.props);
 expect(form()).toMatchObject({formKey:'waste-to-art',initialAnswers:{'hidden-yes-submitter':'educator','radio-yes-entry-mode':'team','number-yes-team-size':'3','text-yes-school-id':school.reference}});
 const params=new URLSearchParams(window.location.search);expect(params.get('mode')).toBe('team');expect(params.get('school_id')).toBe(school.reference);expect(params.has('entry_type')).toBe(false);
});
it('reports an invalid saved school ID rather than silently looping to the first entry screen',async()=>{
 harness.api.mockResolvedValue({items:[]});await mount({submitter:'educator',competition:'waste-to-art',mode:'team',schoolId:'UNKNOWN'});
 expect(container.querySelector('[role="alert"]')?.textContent).toContain('one active registered school');
 expect(container.textContent).toContain('Try the school ID again');expect(container.textContent).toContain('Choose test school');expect(container.querySelector('[data-test="form"]')).toBeNull();
});
it('recovers when a failed lookup is followed by selecting the same school ID',async()=>{
 harness.api.mockRejectedValueOnce(new Error('Temporary lookup failure')).mockResolvedValueOnce({items:[school]});
 await mount({submitter:'educator',competition:'waste-to-art',mode:'team',schoolId:school.reference});
 expect(container.textContent).toContain('Temporary lookup failure');
 await act(async()=>{[...container.querySelectorAll('button')].find(button=>button.textContent==='Choose test school')!.click();});
 expect(harness.api).toHaveBeenCalledTimes(2);expect(form().initialAnswers['text-yes-school-id']).toBe(school.reference);
});
it('does not let an old lookup response override a newly selected URL context',async()=>{
 let resolveOld!:(value:unknown)=>void;harness.api.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce({items:[{...school,reference:'YES-SCH-NEW',alternate_references:[]}]});
 await mount({submitter:'educator',competition:'waste-to-art',mode:'team',schoolId:school.reference},'old');
 const signal=harness.api.mock.calls[0][1].signal as AbortSignal;
 await mount({submitter:'educator',competition:'waste-to-art',mode:'team',schoolId:'YES-SCH-NEW'},'new');
 expect(signal.aborted).toBe(true);await act(async()=>resolveOld({items:[school]}));
 expect(form().initialAnswers['text-yes-school-id']).toBe('YES-SCH-NEW');expect(new URLSearchParams(window.location.search).get('school_id')).toBe('YES-SCH-NEW');
});
it('uses the signed-in student profile instead of an educator role supplied in the URL',async()=>{
 harness.actor={role:'participant',participantKind:'student'};harness.api.mockResolvedValue({items:[school]});
 await mount({submitter:'educator',competition:'painting',mode:'individual',schoolId:school.reference});
 expect(form().initialAnswers['hidden-yes-submitter']).toBe('student');
 expect(new URLSearchParams(window.location.search).get('submitter')).toBe('student');
 expect(container.textContent).not.toContain('I am an educator');
});
it.each(['judge','admin','owner','school','unclassified'])('does not offer competition submission to %s accounts',async kind=>{
 harness.actor=['judge','admin','owner'].includes(kind)?{role:kind}:{role:'participant',participantKind:kind as 'school'|'unclassified'};
 await mount({submitter:'student',competition:'painting',mode:'individual'});
 expect(container.textContent).toContain('cannot create student or educator competition entries');expect(container.querySelector('[data-test="form"]')).toBeNull();expect(container.textContent).not.toContain('Choose test school');
});
it('recognizes a newly started saved draft and resumes it without the school-context chooser',async()=>{
 harness.api.mockResolvedValue({items:[school]});
 const props={submitter:'educator',competition:'waste-to-art',mode:'team',schoolId:school.reference};
 await mount(props);expect(container.textContent).toContain('Choose another school');
 await act(async()=>{[...container.querySelectorAll('button')].find(button=>button.textContent==='Start saved fixture')!.click();});
 expect(window.location.hash).toBe('#saved=synthetic-saved');expect(container.textContent).not.toContain('Choose another school');expect(container.querySelector('[data-test="form"]')).not.toBeNull();
 harness.api.mockImplementation(()=>new Promise(()=>{}));await mount(props,'saved-reload');
 expect(container.querySelector('[data-test="form"]')).not.toBeNull();expect(container.textContent).not.toContain('Choose another school');expect(container.textContent).not.toContain('Choose test school');expect(container.textContent).not.toContain('Checking your registered school');
});
