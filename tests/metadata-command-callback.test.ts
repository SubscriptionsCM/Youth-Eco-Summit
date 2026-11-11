import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {inspectFileMetadata} from '../src/server/storage/validation';

const commands=vi.hoisted(()=>({run:vi.fn(),stdout:''}));
// Hosting instrumentation can wrap execFile without copying promisify.custom.
// Its documented callback contract must be sufficient for extraction.
vi.mock('node:child_process',()=>({execFile:commands.run}));
beforeEach(()=>{
 commands.run.mockImplementation((_command:string,_args:string[],_options:unknown,callback:(error:Error|null,stdout:string,stderr:string)=>void)=>{
  queueMicrotask(()=>callback(null,commands.stdout,''));
 });
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
async function* retained(){yield Buffer.from('synthetic retained fixture');}

describe('metadata command callback compatibility',()=>{
 it('uses PDF output when the host wraps execFile without a custom promisifier',async()=>{
  commands.stdout='planet '.repeat(510);
  vi.stubEnv('PDFTOTEXT_PATH','/private/tools/pdftotext');
  await expect(inspectFileMetadata(retained(),'application/pdf',{minCount:1,maxCount:1,maxBytes:1000,types:['application/pdf'],minWords:500,maxWords:600})).resolves.toEqual({wordCount:510});
  expect(commands.run).toHaveBeenCalledWith('/private/tools/pdftotext',expect.any(Array),expect.objectContaining({timeout:20000,maxBuffer:2*1024*1024}),expect.any(Function));
 });
 it('parses media output using the same callback contract',async()=>{
  commands.stdout=JSON.stringify({format:{duration:'2'},streams:[{codec_type:'video',width:640,height:360}]});
  vi.stubEnv('FFPROBE_PATH','/private/tools/ffprobe');
  await expect(inspectFileMetadata(retained(),'video/mp4',{minCount:1,maxCount:1,maxBytes:1000,types:['video/mp4'],maxDurationSeconds:30,maxHeight:1080,orientation:'landscape'})).resolves.toEqual({durationSeconds:2,width:640,height:360});
 });
});
