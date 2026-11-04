import { expect,test } from '@playwright/test';

test('real API rejects anonymous private reads and cross-origin mutations',async({request})=>{
 const health=await request.get('/api/health');expect(health.status()).toBe(200);
 expect((await health.json()).data.service).toBe('Youth Eco Summit');
 for(const path of ['/api/participant','/api/admin/students','/api/judge','/api/media/11111111-1111-4111-8111-111111111111']){
  const response=await request.get(path);expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
 }
 const denied=await request.post('/api/public/nominations',{headers:{Origin:'https://unrelated.example'},data:{name:'Must not be recorded'}});
 expect(denied.status()).toBe(403);
 const invalidMedia=await request.get('/api/public/showcase/not-a-uuid/media/not-a-uuid');
 expect(invalidMedia.status()).toBe(404);
});
