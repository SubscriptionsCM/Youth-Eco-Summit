import nodemailer, { type Transporter } from 'nodemailer';
import {existsSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { z } from 'zod';
import { AppError } from './core';

export type TransactionalEmail = {
 to:string|string[]; subject:string; body:string; html?:string;
 replyTo?:string; cc?:string[]; bcc?:string[];
 attachments?:{filename:string;content:Buffer|string;contentType?:string}[];
};
const address=z.email().max(254);
const unavailable=()=>new AppError(503,'Email delivery is temporarily unavailable. Please try again shortly.');
let cached:{key:string;transport:Transporter}|undefined;
function settings(){
 if(process.env.EMAIL_TRANSPORT==='hostinger'){
  const path=process.env.SENDMAIL_PATH,from=process.env.MAIL_FROM;
  if(!path||!isAbsolute(path)||!existsSync(path)||!from||!address.safeParse(from).success)throw unavailable();
  return {mode:'hostinger' as const,path,from,name:'Youth Eco Summit'};
 }
 const host=process.env.SMTP_HOST?.trim(),user=process.env.SMTP_USER?.trim(),pass=process.env.SMTP_PASSWORD;
 const from=process.env.SMTP_FROM?.trim()||user,port=Number(process.env.SMTP_PORT||465);
 if(!host||!user||!pass||!from||!address.safeParse(from).success||!Number.isInteger(port)||port<1||port>65535)throw unavailable();
 let test=false;
 if(process.env.SMTP_TEST_MODE==='true'){
  try{
   const origin=new URL(process.env.APP_ORIGIN||''),database=new URL(process.env.DATABASE_URL||'');
   test=['localhost','127.0.0.1','::1'].includes(host)&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)&&database.pathname==='/yes_local_migration';
  }catch{throw unavailable();}
  if(!test)throw unavailable();
 }
 const secure=process.env.SMTP_SECURE?process.env.SMTP_SECURE==='true':port===465;
 const name=(process.env.SMTP_FROM_NAME||'Youth Eco Summit').trim();
 if(/[\r\n\0]/.test(name))throw unavailable();
 return {mode:'smtp' as const,host,user,pass,from,port,secure,name,test};
}
export function emailConfigured(){try{settings();return true;}catch{return false;}}
export const smtpConfigured=emailConfigured;
function transport(){
 const config=settings(),key=JSON.stringify(config);
 if(!cached||cached.key!==key){
  cached?.transport.close();
  cached={key,transport:config.mode==='hostinger'?nodemailer.createTransport({sendmail:true,path:config.path,newline:'unix',disableFileAccess:true,disableUrlAccess:true}):nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,
   requireTLS:!config.test,auth:{user:config.user,pass:config.pass},tls:{rejectUnauthorized:true},
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:45000,
   disableFileAccess:true,disableUrlAccess:true})};
 }
 return {config,client:cached.transport};
}
export async function verifySmtpConnection(){
 const {config,client}=transport();
 if(config.mode==='hostinger')await promisify(execFile)(config.path,['--check'],{timeout:15000,maxBuffer:4096});
 else await client.verify();
}
export async function sendTransactionalEmail(message:TransactionalEmail):Promise<void>{
 const to=(Array.isArray(message.to)?message.to:[message.to]).map(value=>address.parse(value.trim()));
 const cc=message.cc?.map(value=>address.parse(value.trim())),bcc=message.bcc?.map(value=>address.parse(value.trim()));
 if(!to.length||to.length+(cc?.length||0)+(bcc?.length||0)>100||/[\r\n\0]/.test(message.subject)||message.subject.length>2000)throw unavailable();
 if(message.replyTo)address.parse(message.replyTo);
 if((message.attachments?.length||0)>100||message.attachments?.some(file=>/[\r\n\0]/.test(file.filename)||file.filename.length>255))throw unavailable();
 const {config,client}=transport();
 try{
  const result=await client.sendMail({from:{name:config.name,address:config.from},to,cc,bcc,replyTo:message.replyTo,
   subject:message.subject,text:message.body,...message.html?{html:message.html}:{},attachments:message.attachments,
   disableFileAccess:true,disableUrlAccess:true});
  if(config.mode==='hostinger'){
   if(!result.messageId||!result.envelope?.to?.length||result.response!=='Messages queued for delivery')throw unavailable();
  }else if(result.rejected?.length||result.pending?.length||!result.accepted?.length)throw unavailable();
 }catch{throw unavailable();}
}
