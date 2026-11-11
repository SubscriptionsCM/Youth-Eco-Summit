import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const php=['C:/xampp/php/php.exe','/usr/bin/php','/usr/local/bin/php'].find(existsSync);
function probe(scenario:string,origin='https://new.wordpress.example.org'){
 return new Promise<Record<string,any>>((resolve,reject)=>{
  const child=execFile(php!,[path.resolve('tests/fixtures/wordpress-recovery.php')],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:16384,env:{NODE_ENV:'test',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,YES_APP_ORIGIN:origin}},(error,stdout)=>{if(error){reject(error);return;}try{resolve(JSON.parse(stdout));}catch(error){reject(error);}});
  child.stdin?.on('error',reject);child.stdin?.end(JSON.stringify({scenario}));
 });
}
describe.skipIf(!php)('native WordPress recovery adapter',()=>{
 it('sends a clickable HTML reset link on the configured application with the native key in its fragment',async()=>{
  const result=await probe('mail');expect(result.ok).toBe(true);
  expect(result.mail.headers).toContain('Content-Type: text/html; charset=UTF-8');
  expect(result.mail.message).toContain('<a href="https://new.wordpress.example.org/reset-password#');
  const href=result.mail.message.match(/href="([^"]+)"/)![1].replaceAll('&amp;','&');const url=new URL(href);
  expect(url.search).toBe('');expect(new URLSearchParams(url.hash.slice(1)).get('key')).toBe('FixtureNativeKey12345');
  expect(new URLSearchParams(url.hash.slice(1)).get('login')).toBe('fixture-user');
  expect(result.mail.message).not.toContain('wp-login.php');expect(result.hooksRestored).toBe(true);
 });
 it('does not disclose whether a requested account exists',async()=>{
  const result=await probe('unknown');expect(result.ok).toBe(true);expect(result.mail).toBeNull();expect(result.result).toEqual({sent:true});
 });
 it('reports an actual native mail failure without exposing provider details',async()=>{
  const result=await probe('mail-failure');expect(result.ok).toBe(false);expect(result.hooksRestored).toBe(true);expect(JSON.stringify(result)).not.toContain('private SMTP');
 });
 it('uses native key validation and password-reset hooks, consumes the key and restores POST context',async()=>{
  const result=await probe('reset');expect(result.ok).toBe(true);expect(result.resetCount).toBe(1);expect(result.validated).toBe(true);expect(result.postRestored).toBe(true);expect(result.replayAccepted).toBe(false);expect(result.keyChecks).toBeGreaterThanOrEqual(3);
 });
 it.each(['invalid','expired','changed-key','blocked-account','blocked-password','lock-failure'])('does not change a password for %s',async scenario=>{
  const result=await probe(scenario);expect(result.ok).toBe(false);expect(result.resetCount).toBe(0);expect(result.postRestored).toBe(true);
 });
 it.each(['policy-weak','policy-length','policy-backslash'])('preserves the source Ultimate Member validator for %s',async scenario=>{
  const result=await probe(scenario);expect(result.ok).toBe(false);expect(result.resetCount).toBe(0);expect(result.memberValidation).toBe(true);expect(result.memberStateRestored).toBe(true);
 });
 it.each(['policy-limit','policy-unapproved','policy-alias-limit','policy-alias-unapproved','policy-ambiguous-email'])('does not send mail when source policy blocks %s',async scenario=>{
  const result=await probe(scenario);expect(result.ok).toBe(true);expect(result.result).toEqual({sent:true});expect(result.mail).toBeNull();expect(result.memberStateRestored).toBe(true);
 });
 it('preserves successful member reset notifications and clears native recovery flags',async()=>{
  const result=await probe('policy-valid');expect(result.ok).toBe(true);expect(result.memberValidation).toBe(true);expect(result.memberNotice).toBe(1);expect(result.requestCounter).toBe(0);expect(result.passwordRequired).toBe(false);expect(result.memberStateRestored).toBe(true);
 });
 it('sends the application link after native request checks pass',async()=>{
  const result=await probe('policy-mail');expect(result.ok).toBe(true);expect(result.mail.message).toContain('/reset-password#');expect(result.memberStateRestored).toBe(true);expect(result.hooksRestored).toBe(true);
 });
 it.each(['http://new.wordpress.example.org','https://new.wordpress.example.org/other','https://user:pass@new.wordpress.example.org','https://new.wordpress.example.org?next=evil'])('rejects unsafe configured recovery origin %s',async origin=>{
  const result=await probe('mail',origin);expect(result.ok).toBe(false);expect(result.mail).toBeNull();
 });
});
