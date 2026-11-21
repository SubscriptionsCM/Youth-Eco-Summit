import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({sendMail:vi.fn(),verify:vi.fn(),close:vi.fn(),createTransport:vi.fn()}));
vi.mock('nodemailer',()=>({default:{createTransport:mocks.createTransport}}));
import {sendTransactionalEmail,smtpConfigured,verifySmtpConnection} from '../src/server/email';
describe('direct SMTP email delivery',()=>{
 beforeEach(()=>{
  vi.stubEnv('EMAIL_TRANSPORT','smtp');
  vi.stubEnv('SMTP_HOST','smtp.hostinger.com');vi.stubEnv('SMTP_PORT','465');vi.stubEnv('SMTP_USER','noreply@example.test');vi.stubEnv('SMTP_PASSWORD','private-test-secret');vi.stubEnv('SMTP_FROM','noreply@example.test');vi.stubEnv('SMTP_TEST_MODE','false');
  mocks.createTransport.mockReturnValue({sendMail:mocks.sendMail,verify:mocks.verify,close:mocks.close});
  mocks.sendMail.mockResolvedValue({accepted:['participant@example.test'],rejected:[]});mocks.verify.mockResolvedValue(true);
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
 it('requires authenticated SMTP and verifies TLS before sending attachments',async()=>{
  expect(smtpConfigured()).toBe(true);await verifySmtpConnection();
  await sendTransactionalEmail({to:'participant@example.test',subject:'Your receipt',body:'Submission received',html:'<p>Submission received</p>',attachments:[{filename:'receipt.txt',content:Buffer.from('Receipt')}]});
  expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({host:'smtp.hostinger.com',port:465,secure:true,requireTLS:true,tls:{rejectUnauthorized:true},disableFileAccess:true,disableUrlAccess:true}));
  expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({from:{name:'Youth Eco Summit',address:'noreply@example.test'},attachments:[expect.objectContaining({filename:'receipt.txt'})]}));
 });
 it('fails closed without credentials and rejects header injection before SMTP',async()=>{
  vi.stubEnv('SMTP_PASSWORD','');expect(smtpConfigured()).toBe(false);
  await expect(sendTransactionalEmail({to:'participant@example.test',subject:'Receipt',body:'Body'})).rejects.toThrow();
  vi.stubEnv('SMTP_PASSWORD','test-secret');await expect(sendTransactionalEmail({to:'participant@example.test',subject:'Receipt\r\nBcc: other@example.test',body:'Body'})).rejects.toThrow();
  expect(mocks.sendMail).not.toHaveBeenCalled();
 });
 it('does not report success after a rejected recipient or ambiguous provider failure',async()=>{
  mocks.sendMail.mockResolvedValueOnce({accepted:[],rejected:['participant@example.test']});
  await expect(sendTransactionalEmail({to:'participant@example.test',subject:'Receipt',body:'Body'})).rejects.toThrow();
  mocks.sendMail.mockRejectedValueOnce(new Error('SMTP connection closed'));
  await expect(sendTransactionalEmail({to:'participant@example.test',subject:'Receipt',body:'Body'})).rejects.toThrow();
 });
 it('permits the plaintext capture server only in the isolated loopback migration test database',()=>{
  vi.stubEnv('SMTP_TEST_MODE','true');expect(smtpConfigured()).toBe(false);
  vi.stubEnv('SMTP_HOST','127.0.0.1');vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3000');vi.stubEnv('DATABASE_URL','postgresql://test@127.0.0.1/yes_local_migration');expect(smtpConfigured()).toBe(true);
  vi.stubEnv('DATABASE_URL','postgresql://test@127.0.0.1/yes_app');expect(smtpConfigured()).toBe(false);
 });
 it('uses the existing Hostinger send-only transport without SMTP mailbox credentials',async()=>{
  vi.stubEnv('EMAIL_TRANSPORT','hostinger');vi.stubEnv('SENDMAIL_PATH','/usr/bin/false');vi.stubEnv('MAIL_FROM','noreply@youthecosummit.com');vi.stubEnv('SMTP_PASSWORD','');
  mocks.sendMail.mockResolvedValueOnce({messageId:'test-message',envelope:{to:['participant@example.test']},response:'Messages queued for delivery'});
  expect(smtpConfigured()).toBe(true);await sendTransactionalEmail({to:'participant@example.test',subject:'Receipt',body:'Body'});
  expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({sendmail:true,path:'/usr/bin/false',disableFileAccess:true,disableUrlAccess:true}));
 });
});
