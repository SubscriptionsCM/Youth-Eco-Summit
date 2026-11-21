import {afterEach,expect,it,vi} from 'vitest';
import {api,ApiError} from '../src/components/api';
afterEach(()=>vi.unstubAllGlobals());
it('retains validated mismatch metadata without treating it as a successful response',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'Use the Educator sign-in option for this account.',code:'LOGIN_AUDIENCE_MISMATCH',loginAudience:'educator'},{status:409})));
 await expect(api('/api/auth/participant/login')).rejects.toMatchObject({status:409,code:'LOGIN_AUDIENCE_MISMATCH',loginAudience:'educator'});
});
it.each(['owner','https://outside.test',{},null])('does not accept an arbitrary audience metadata value %s',async loginAudience=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'Rejected',code:24,loginAudience},{status:409})));
 try{await api('/api/auth/login');throw new Error('Expected rejection');}catch(error){expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({status:409});expect((error as ApiError).loginAudience).toBeUndefined();expect((error as ApiError).code).toBeUndefined();}
});
it('keeps the response status when a service error returns no JSON',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('Unavailable',{status:503})));
 await expect(api('/api/auth/login')).rejects.toMatchObject({status:503});
});
