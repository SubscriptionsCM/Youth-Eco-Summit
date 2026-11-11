import { describe, expect, it, vi } from 'vitest';
import { createSignatureUpdater } from '../src/server/storage/signature-updates';

describe('serial worker antivirus signature maintenance',()=>{
 it('preserves workers without a configured updater',async()=>{
  const run=vi.fn(async()=>{}),log=vi.fn();
  const update=createSignatureUpdater(undefined,{run,log,now:()=>0});
  expect(await update()).toBe(false);expect(run).not.toHaveBeenCalled();expect(log).not.toHaveBeenCalled();
 });

 it('runs an absolute command with no arguments or shell before its initial success interval',async()=>{
  let now=1000;
  const run=vi.fn(async()=>{}),log=vi.fn();
  const update=createSignatureUpdater(process.execPath,{run,log,now:()=>now});
  expect(await update()).toBe(true);
  expect(run).toHaveBeenCalledExactlyOnceWith(process.execPath,[],{shell:false,windowsHide:true,timeout:600000,killSignal:'SIGKILL',maxBuffer:65536});
  now+=12*60*60*1000-1;expect(await update()).toBe(false);
  now++;expect(await update()).toBe(true);expect(run).toHaveBeenCalledTimes(2);expect(log).not.toHaveBeenCalled();
 });

 it('redacts failed command output and retries after one hour',async()=>{
  let now=0;
  const run=vi.fn(async()=>{throw Object.assign(new Error('secret/private/freshclam path'),{stderr:'sensitive provider stderr'});});
  const log=vi.fn();const update=createSignatureUpdater(process.execPath,{run,log,now:()=>now});
  expect(await update()).toBe(false);
  expect(log).toHaveBeenCalledExactlyOnceWith({event:'file_scan_signature_update_failed'});
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|stderr|private\/freshclam/);
  now=60*60*1000-1;expect(await update()).toBe(false);expect(run).toHaveBeenCalledOnce();
  now++;expect(await update()).toBe(false);expect(run).toHaveBeenCalledTimes(2);
 });

 it.each(['freshclam','./freshclam','relative/path','/private/updater\ninvalid'])('rejects unsafe updater configuration %s without invoking it',async(command)=>{
  const run=vi.fn(async()=>{}),log=vi.fn();
  expect(await createSignatureUpdater(command,{run,log,now:()=>0})()).toBe(false);
  expect(run).not.toHaveBeenCalled();expect(log).toHaveBeenCalledExactlyOnceWith({event:'file_scan_signature_update_failed'});
 });

 it('schedules from completion time so slow updates retain the full success interval',async()=>{
  let now=0;
  const run=vi.fn(async()=>{now+=600000;});
  const update=createSignatureUpdater(process.execPath,{run,now:()=>now});
  await update();now=12*60*60*1000;expect(await update()).toBe(false);
  now+=600000;expect(await update()).toBe(true);
 });
});
