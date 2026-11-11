import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { AppError } from '../core';
import { wordCount } from '../../domain/rules';

export class ContentRejected extends Error {}
export interface MediaRules { maxDurationSeconds?:number; maxHeight?:number; orientation?:'landscape'|'landscape-or-portrait'; minWords?:number; maxWords?:number }
export interface FileRole extends MediaRules { id:string; label:string; minCount:number; maxCount:number; maxBytes:number; types:string[] }
export interface FileRules extends MediaRules { minCount: number; maxCount: number; maxBytes: number; types: string[]; maxTotalBytes?:number; roles?:FileRole[] }
export interface VerifiedMetadata { durationSeconds?:number; width?:number; height?:number; wordCount?:number }
export function rulesForRole(files:FileRules, role?:string|null):FileRules {
  if(!files.roles?.length){if(role)throw new AppError(422,'This form does not accept a named file role.');return files;}
  const selected=files.roles.find(item=>item.id===role);
  if(!selected)throw new AppError(422,'Choose the required purpose of this file.');
  return {...files,...selected,roles:undefined};
}
export function validateFileSelection(files:FileRules, assets:Record<string,any>[], final:boolean){
  if(assets.length>files.maxCount||(final&&assets.length<files.minCount))throw new AppError(422,'The number of files does not match the competition requirements.');
  if(files.maxTotalBytes&&assets.reduce((sum,a)=>sum+Number(a.byte_size||a.expected_size),0)>files.maxTotalBytes)throw new AppError(422,'The combined files exceed the allowed size.');
  for(const role of files.roles??[]){const count=assets.filter(a=>a.role===role.id).length;if(count>role.maxCount||(final&&count<role.minCount))throw new AppError(422,`${role.label}: upload ${role.minCount===role.maxCount?role.minCount:`${role.minCount}–${role.maxCount}`} file(s).`);}
  for(const asset of assets){const rule=rulesForRole(files,asset.role);const bytes=Number(asset.byte_size||asset.expected_size);if(!Number.isFinite(bytes)||bytes<=0||bytes>rule.maxBytes)throw new AppError(422,'A file exceeds the size allowed for its purpose.');if(final&&(asset.status!=='ready'||!rule.types.includes(asset.mime_type)))throw new AppError(422,'All required retained files must finish verification before submission.');if(final)validateMetadata(asset.metadata??{},rule,asset.mime_type);}
}
export function validateMetadata(metadata:VerifiedMetadata, rules:MediaRules, mime:string){
  if(mime==='application/pdf'&&(rules.minWords!==undefined||rules.maxWords!==undefined)){
    if(!Number.isInteger(metadata.wordCount)||!metadata.wordCount)throw new ContentRejected('A typed PDF with readable text is required.');
    if((rules.minWords!==undefined&&metadata.wordCount<rules.minWords)||(rules.maxWords!==undefined&&metadata.wordCount>rules.maxWords))throw new ContentRejected(`The written PDF must contain ${rules.minWords??0}–${rules.maxWords??'unlimited'} words (found ${metadata.wordCount}).`);
  }
  if(mime.startsWith('video/')&&rules.maxDurationSeconds!==undefined){if(!Number.isFinite(metadata.durationSeconds)||metadata.durationSeconds!<=0)throw new ContentRejected('Video duration could not be verified.');if(metadata.durationSeconds!>rules.maxDurationSeconds)throw new ContentRejected(`Video exceeds the ${rules.maxDurationSeconds}-second limit.`);}
  if((mime.startsWith('image/')||mime.startsWith('video/'))&&(rules.maxHeight||rules.orientation)){
    if(!Number.isInteger(metadata.width)||!Number.isInteger(metadata.height)||metadata.width!<1||metadata.height!<1)throw new ContentRejected('Media dimensions could not be verified.');
    if(rules.orientation==='landscape'&&metadata.width!<=metadata.height!)throw new ContentRejected('This file must use landscape (horizontal) orientation.');
    const landscapeHeight=rules.orientation==='landscape-or-portrait'?Math.min(metadata.width!,metadata.height!):metadata.height!;
    const landscapeWidth=rules.orientation==='landscape-or-portrait'?Math.max(metadata.width!,metadata.height!):metadata.width!;
    if(rules.maxHeight&&(landscapeHeight>rules.maxHeight||landscapeWidth>Math.ceil(rules.maxHeight*16/9)))throw new ContentRejected(`Resolution must not exceed ${rules.maxHeight}p.`);
  }
}
// Hosting wrappers may preserve execFile's callback but lose its custom
// promisifier, which otherwise changes the resolved value to stdout alone.
const exec=(command:string,args:string[],options:{timeout:number;maxBuffer:number})=>new Promise<{stdout:string;stderr:string}>((resolve,reject)=>{
  execFile(command,args,{...options,encoding:'utf8',shell:false,windowsHide:true},(error,stdout,stderr)=>{
    if(error)reject(error);else resolve({stdout,stderr});
  });
});
export async function inspectFileMetadata(stream:AsyncIterable<Uint8Array>,mime:string,rules:FileRules):Promise<VerifiedMetadata>{
  const pdf=mime==='application/pdf'&&(rules.minWords!==undefined||rules.maxWords!==undefined);
  const media=(mime.startsWith('video/')||mime.startsWith('image/'))&&(rules.maxDurationSeconds!==undefined||rules.maxHeight!==undefined||rules.orientation!==undefined);
  if(!pdf&&!media)return {};
  const dir=await mkdtemp(join(tmpdir(),'yes-inspect-'));
  try{
    const path=join(dir,'retained-file');let bytes=0;
    await pipeline(Readable.from(stream),new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>rules.maxBytes?new ContentRejected('File exceeds its role size limit.'):null,chunk);}}),createWriteStream(path,{mode:0o600}));
    let metadata:VerifiedMetadata;
    try{
      if(pdf){const {stdout}=await exec(process.env.PDFTOTEXT_PATH||'pdftotext',['-enc','UTF-8','-nopgbrk',path,'-'],{timeout:20000,maxBuffer:2*1024*1024});metadata={wordCount:wordCount(stdout)};}
      else{const {stdout}=await exec(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-protocol_whitelist','file','-show_entries','format=duration:stream=codec_type,width,height,duration:stream_tags=rotate:stream_side_data=rotation','-of','json',path],{timeout:20000,maxBuffer:1024*1024});const info=JSON.parse(stdout);const video=info.streams?.find((s:any)=>s.codec_type==='video');const rotation=Number(video?.side_data_list?.find((s:any)=>s.rotation!==undefined)?.rotation??video?.tags?.rotate??0);const rotated=Math.abs(rotation%180)===90;metadata={width:Number(rotated?video?.height:video?.width),height:Number(rotated?video?.width:video?.height),...(mime.startsWith('video/')?{durationSeconds:Number(info.format?.duration??video?.duration)}:{})};}
    }catch(error){if(['ENOENT','EACCES'].includes((error as NodeJS.ErrnoException).code??'')||(error as {killed?:boolean}).killed)throw new Error(`${pdf?'PDF text':'Media'} verification executable is not configured.`);throw new ContentRejected(`The ${pdf?'PDF text':'media metadata'} could not be read. Upload a valid file.`);}
    validateMetadata(metadata,rules,mime);return metadata;
  }finally{await rm(dir,{recursive:true,force:true});}
}
export function submissionLabel(parts:string[]){
  const cleaned=parts.map(part=>part.normalize('NFC').trim().replace(/[^\p{L}\p{M}\p{N}]+/gu,'_').replace(/^_+|_+$/g,''));
  const label=cleaned.join('_');
  if(cleaned.some(part=>!part)||!label)throw new AppError(422,'School, class, category, project title and author names are required for the submission label.');
  return label;
}
export async function inspectContent(stream: AsyncIterable<Uint8Array>, expected: { size: number; checksum: string; maxBytes: number; types: string[] }) {
  const hash = createHash('sha256');
  const sample: Buffer[] = [];
  let sampled = 0, byteSize = 0;
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let isText = true;
  for await (const chunk of stream) {
    byteSize += chunk.byteLength;
    if (byteSize > expected.maxBytes || byteSize > expected.size) throw new ContentRejected('File size exceeds the permitted size');
    hash.update(chunk);
    if (sampled < 131072) { const part = Buffer.from(chunk.subarray(0, 131072 - sampled)); sample.push(part); sampled += part.length; }
    if (isText) {
      try { const text = utf8.decode(chunk, { stream: true }); if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) isText = false; }
      catch { isText = false; }
    }
  }
  if (isText) { try { utf8.decode(); } catch { isText = false; } }
  if (!byteSize || byteSize !== expected.size) throw new ContentRejected('File size does not match the declared size');
  const checksum = hash.digest('hex');
  if (checksum !== expected.checksum.toLowerCase()) throw new ContentRejected('File checksum does not match the original');
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try { detected = await fileTypeFromBuffer(Buffer.concat(sample)); } catch { throw new ContentRejected('File type could not be verified'); }
  const mimeType = detected?.mime ?? (isText ? 'text/plain' : 'application/octet-stream');
  if (mimeType === 'application/octet-stream' || !expected.types.includes(mimeType)) throw new ContentRejected('Actual file type is not allowed');
  return { byteSize, checksum, mimeType };
}

export function parseRange(header: string, size: number): { start: number; end: number } {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid byte range');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || size < 1 || start < 0 || end < start || start >= size || (!match[1] && Number(match[2]) <= 0)) throw new Error('Unsatisfiable byte range');
  return { start, end };
}

export function safeDisposition(mime: string, filename: string, download = false): string {
  const inline = !download && /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime|x-matroska))$/.test(mime);
  const clean = filename.toWellFormed().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 240).toWellFormed() || 'download';
  const ascii = clean.replace(/[^\x20-\x7E]|["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`;
}

export function anonymousFilename(mime: string): string {
  const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'application/zip': 'zip', 'text/plain': 'txt', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
  return `submitted-file.${extensions[mime] ?? 'bin'}`;
}
