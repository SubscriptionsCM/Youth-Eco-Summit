import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { isValidElement,type ReactElement,type ReactNode } from 'react';
import { participantResetContext,ParticipantPasswordReset } from '../src/components/participant-password-reset';

const harness=vi.hoisted(()=>({active:false,cursor:0,values:[] as any[],effects:[] as (()=>void)[],api:vi.fn(),replace:vi.fn()}));
vi.mock('react',async original=>{
 const actual=await original<typeof import('react')>();
 return {...actual,
  useState(initial:unknown){if(!harness.active)return actual.useState(initial);const index=harness.cursor++;if(!(index in harness.values))harness.values[index]=initial;return [harness.values[index],(value:unknown)=>{harness.values[index]=value;}];},
  useEffect(effect:()=>void,deps:unknown[]){if(!harness.active)return actual.useEffect(effect,deps);harness.effects.push(effect);},
  useRef(initial:unknown){if(!harness.active)return actual.useRef(initial);const index=harness.cursor++;if(!(index in harness.values))harness.values[index]={current:initial};return harness.values[index];},
 };
});
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:harness.api}));
function render(){harness.cursor=0;harness.active=true;try{return ParticipantPasswordReset();}finally{harness.active=false;}}
function elements(node:ReactNode):ReactElement<any>[]{if(Array.isArray(node))return node.flatMap(elements);if(!isValidElement<any>(node))return [];const element=node as ReactElement<{children?:ReactNode}>;return [element,...elements(element.props.children)];}
beforeEach(()=>{
 harness.values=[];harness.effects=[];harness.api.mockReset();harness.replace.mockReset();
 const location={hash:'#key=FixtureNativeKey12345&login=fixture.user',pathname:'/reset-password'};
 harness.replace.mockImplementation(()=>{location.hash='';});
 vi.stubGlobal('window',{location,history:{state:null,replaceState:harness.replace}});
 vi.stubGlobal('FormData',class {constructor(private value:Record<string,string>){}[Symbol.iterator](){return Object.entries(this.value)[Symbol.iterator]();}});
});
afterEach(()=>vi.unstubAllGlobals());

describe('participant reset link context',()=>{
 it('reads the native login and key from the fragment',()=>{
  expect(participantResetContext('#key=FixtureNativeKey12345&login=fixture.user')).toEqual({key:'FixtureNativeKey12345',contact:'fixture.user'});
 });
 it.each(['','#key=abc','#key=abc&login=one&login=two','#key=abc&login=one&next=https://evil.example','#key=%3Cscript%3E&login=one'])('rejects incomplete or ambiguous reset context: %s',fragment=>{
  expect(participantResetContext(fragment)).toBeNull();
 });
});

describe('participant reset form',()=>{
 it('removes credentials from the address and survives a repeated mount effect',()=>{
  render();const effect=harness.effects[0];effect();effect();
  expect(harness.replace).toHaveBeenCalledWith(null,'','/reset-password');
  expect(elements(render()).some(element=>element.type==='form')).toBe(true);
 });
 it('sends matching passwords and the private key only to the reset POST endpoint, then returns to sign-in',async()=>{
  render();harness.effects[0]();harness.api.mockResolvedValue({recovered:true});
  const form=elements(render()).find(element=>element.type==='form')!;
  await form.props.onSubmit({preventDefault(){},currentTarget:{password:'synthetic new password',confirmPassword:'synthetic new password'}});
  expect(harness.api).toHaveBeenCalledWith('/api/auth/participant/recovery/complete',expect.objectContaining({method:'POST',body:JSON.stringify({contact:'fixture.user',key:'FixtureNativeKey12345',password:'synthetic new password',confirmPassword:'synthetic new password'})}));
  const tree=elements(render());expect(tree.some(element=>element.type==='form')).toBe(false);expect(tree.some(element=>element.props.href==='/login')).toBe(true);
 });
 it('rejects password confirmation errors before a network request',async()=>{
  render();harness.effects[0]();const form=elements(render()).find(element=>element.type==='form')!;
  await form.props.onSubmit({preventDefault(){},currentTarget:{password:'synthetic new password',confirmPassword:'different'}});
  expect(harness.api).not.toHaveBeenCalled();expect(elements(render()).some(element=>element.type==='form')).toBe(true);
 });
});
