import {describe,expect,it} from 'vitest';
import {nativeNotificationPackets} from '../src/server/native-form-notifications';
const context={formId:48543,recordId:'a33fe8fa-494c-4edc-9557-7080966ab68e',reference:'YES-TEST-123',submittedAt:'2026-11-14T10:00:00.000Z',portalOrigin:'https://youthecosummit.com',normalizedAnswers:{'email-1':'participant@example.test','text-1':'<script>unsafe</script>','radio-1':'individual'},verifiedFileDescriptors:[{fieldId:'upload-1',fileId:'e13c7770-a4c3-4459-bb7b-694ef4879539',filename:'private.pdf',byteSize:123,checksum:'a'.repeat(64),mimeType:'application/pdf'}]};
const form=()=>({post_title:'Student registration',definition:{fields:[{element_id:'email-1',type:'email',field_label:'Email'},{element_id:'text-1',type:'text',field_label:'Name'},{element_id:'upload-1',type:'upload',field_label:'Entry file'}],notifications:[{slug:'receipt',recipients:'{email-1}', 'email-recipients':'default','email-subject':'{form_name}: {submission_id}','email-editor':'<p>Hello {text-1}</p>{all_fields}<a href="{submission_url}">View registration</a>','email-attachment':'true',conditions:[]}]}});
describe('native form notification planning',()=>{
 it('preserves configured recipients and private attachments without PHP or WordPress mail',()=>{
  const [packet]=nativeNotificationPackets(form(),context);
  expect(packet).toMatchObject({notificationSlug:'receipt',recipients:['participant@example.test'],subject:'Student registration: YES-TEST-123',attachmentFieldIds:['upload-1']});
  expect(packet.body).toContain('&lt;script&gt;unsafe&lt;/script&gt;');expect(packet.body).not.toContain('<script>');
  expect(packet.body).toContain('https://youthecosummit.com/files/'+context.verifiedFileDescriptors[0].fileId);
  expect(packet.body).not.toContain('/home/');expect(packet.body).toContain('https://youthecosummit.com/dashboard');
 });
 it('never includes an upload hidden by field conditions',()=>{
  const definition=form();Object.assign(definition.definition.fields[2],{conditions:[{element_id:'radio-1',rule:'is',value:'team'}]});
  const [packet]=nativeNotificationPackets(definition,context);expect(packet.attachmentFieldIds).toEqual([]);expect(packet.body).not.toContain('private.pdf');
 });
 it('honors notification exclusions and explicit empty configurations',()=>{
  const definition=form();definition.definition.notifications[0].conditions=[{element_id:'radio-1',rule:'is',value:'team'}] as never[];
  expect(nativeNotificationPackets(definition,context)).toEqual([]);
  definition.definition.notifications=[];expect(nativeNotificationPackets(definition,context)).toEqual([]);
 });
 it('rejects recipient injection and unknown rendering semantics before sending',()=>{
  const definition=form();definition.definition.notifications[0].recipients='admin@example.test\r\nBcc: other@example.test';
  expect(()=>nativeNotificationPackets(definition,context)).toThrow();
  definition.definition.notifications[0].recipients='{email-1}';definition.definition.notifications[0]['email-editor']='Unknown {private_secret}';
  expect(()=>nativeNotificationPackets(definition,context)).toThrow();
 });
 it('matches the source mailer by omitting deleted recipient fields and keeping the valid recipient',()=>{
  const definition=form();definition.definition.notifications[0].recipients='{email-3}, {email-1}, {email-2}';
  expect(nativeNotificationPackets(definition,context)[0].recipients).toEqual(['participant@example.test']);
  definition.definition.notifications[0].recipients='{email-2},{email-3}';expect(()=>nativeNotificationPackets(definition,context)).toThrow();
 });
});
