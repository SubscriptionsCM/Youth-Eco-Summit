import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const php = ['C:/xampp/php/php.exe','/usr/bin/php','/usr/local/bin/php'].find(existsSync);
const body = Buffer.from('verified synthetic attachment');
const checksum = createHash('sha256').update(body).digest('hex');

describe.skipIf(!php)('native notification delivery validation', () => {
  let root: string, input: Record<string, any>, packet: Record<string, any>;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(),'yes-mail-delivery-'));
    await chmod(root,0o700);
    const fileId = randomUUID(), folder = join(root,'mail-Ab12Cd',fileId);
    await mkdir(folder,{recursive:true,mode:0o700});
    const path = join(folder,'retained-file');
    await writeFile(path,body,{mode:0o600});
    packet = {notificationSlug:'native-notice',recipients:['approved@example.org'],subject:'Native subject',body:'Native body',headers:['Content-Type: text/html; charset=UTF-8'],attachmentFieldIds:['upload-1']};
    const file = {fieldId:'upload-1',fileId,filename:'Synthetic.pdf',byteSize:body.length,checksum,mimeType:'application/pdf'};
    input = {formId:9188,recordId:randomUUID(),reference:'YES-TEST',submittedAt:'2026-11-10T12:00:00Z',normalizedAnswers:{},portalOrigin:'https://portal.example.org',verifiedFileDescriptors:[file],ordinal:1,notificationSlug:packet.notificationSlug,payload:structuredClone(packet),attachments:[{...file,path}]};
  });
  afterEach(async () => {
    if (root) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('yes-mail-delivery-')) throw new Error('Unexpected delivery fixture path');
      await rm(root,{recursive:true,force:true});
    }
  });

  function execute(accept = true) {
    const result = spawnSync(php!,[resolve('tests/fixtures/notification-delivery.php'),resolve('wordpress/yes-next-account-bridge/delivery.php')],{input:JSON.stringify({input,plan:[packet],accept}),env:{...process.env,WORDPRESS_MAIL_TEMP_ROOT:root},encoding:'utf8',timeout:10000,maxBuffer:65536,windowsHide:true});
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
  }

  it('accepts only the current native plan and verified private attachment', () => {
    const result = execute();
    expect(result.result).toEqual({sent:true});
    expect(result.mailCalls).toHaveLength(1);
    expect(Object.values(result.mailCalls[0].attachments)).toEqual(['Synthetic.pdf']);
  });
  it('compares persisted JSON objects independently of key order', () => {
    input.payload = Object.fromEntries(Object.entries(input.payload).reverse());
    expect(execute().result).toEqual({sent:true});
  });
  it.each(['recipients','subject','body','headers'])('rejects a modified native %s before SMTP', field => {
    input.payload[field] = field==='recipients'?['outside@example.org']:field==='headers'?['Bcc: outside@example.org']:'Modified';
    expect(execute()).toEqual({rejected:true,mailCalls:[]});
  });
  it('rejects an unrelated notification ordinal or slug', () => {
    input.ordinal = 2;
    expect(execute()).toEqual({rejected:true,mailCalls:[]});
    input.ordinal = 1; input.notificationSlug = 'another-notice';
    expect(execute()).toEqual({rejected:true,mailCalls:[]});
  });
  it('rejects extra attachments and unconfined paths', () => {
    input.attachments.push({...input.attachments[0],fieldId:'upload-2'});
    expect(execute()).toEqual({rejected:true,mailCalls:[]});
    input.attachments.pop();input.attachments[0].path = resolve('package.json');
    expect(execute()).toEqual({rejected:true,mailCalls:[]});
  });
  it('rejects changed bytes and mismatched retained identity', async () => {
    await writeFile(input.attachments[0].path,Buffer.alloc(body.length,97));
    expect(execute()).toEqual({rejected:true,mailCalls:[]});
    await writeFile(input.attachments[0].path,body);
    input.attachments[0].fileId = randomUUID();
    expect(execute()).toEqual({rejected:true,mailCalls:[]});
  });
  it('propagates an unconfirmed mail result', () => {
    expect(execute(false)).toMatchObject({rejected:true,mailCalls:[{}]});
  });
});
