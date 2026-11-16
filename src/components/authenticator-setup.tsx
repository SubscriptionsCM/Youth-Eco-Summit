'use client';
import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';

function setupDetails(value:string){
 try{
  const url=new URL(value),key=url.searchParams.get('secret')||'';
  if(url.protocol!=='otpauth:'||url.hostname!=='totp'||!/[A-Z2-7]/i.test(key)||!/^[A-Z2-7]+=*$/i.test(key))return null;
  if((url.searchParams.get('digits')||'6')!=='6'||(url.searchParams.get('period')||'30')!=='30'||(url.searchParams.get('algorithm')||'SHA1').toUpperCase()!=='SHA1')return null;
  const label=decodeURIComponent(url.pathname.slice(1)),separator=label.indexOf(':');
  return {key,account:separator>=0?label.slice(separator+1):label,issuer:url.searchParams.get('issuer')||(separator>=0?label.slice(0,separator):'Youth Eco Summit')};
 }catch{return null;}
}

export function AuthenticatorSetup({provisioningUri}:{provisioningUri:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[qrError,setQrError]=useState(false),[copyMessage,setCopyMessage]=useState('');
 const setup=setupDetails(provisioningUri);
 useEffect(()=>{
  let active=true;setQrError(false);setCopyMessage('');
  if(setup&&canvas.current)QRCode.toCanvas(canvas.current,provisioningUri,{width:240,margin:4,errorCorrectionLevel:'M'}).catch(()=>{if(active)setQrError(true);});
  return()=>{active=false;};
 },[provisioningUri]); // Only rerender the QR when the private setup value changes.
 async function copy(){try{await navigator.clipboard.writeText(setup!.key);setCopyMessage('Setup key copied. Paste it into your authenticator app.');}catch{setCopyMessage('Select the setup key and copy it manually.');}}
 if(!setup)return <div className="notice error" role="alert">Authenticator setup could not be loaded. Reload this page and begin setup again.</div>;
 return <section className="account-setup-step"><h2>1. Add your account to an authenticator app</h2><p>An authenticator app on your phone creates the six-digit security code you will use to sign in. This code is not sent by email.</p><div className="authenticator-setup-grid"><div>{qrError?<p role="status">The QR code could not be displayed. Use the manual setup below.</p>:<canvas ref={canvas} className="authenticator-qr" role="img" aria-label="Authenticator setup QR code">Use the manual setup key below.</canvas>}</div><div><p>In your authenticator app, choose <strong>Add account</strong>, then <strong>Scan a QR code</strong>. Scan this code with the app.</p><p>Setting up on the same phone? <a href={provisioningUri}>Open my authenticator app</a>, then confirm adding the account.</p><p>Look for <strong>{setup.account}</strong> under <strong>{setup.issuer}</strong>. The code changes every 30 seconds.</p></div></div><details open={qrError||undefined}><summary>Cannot scan? Enter a setup key manually</summary><p>In the app, choose to enter a setup key. Use these details:</p><dl><dt>Account name</dt><dd>{setup.account}</dd><dt>Issuer</dt><dd>{setup.issuer}</dd><dt>Key type</dt><dd>Time based</dd></dl><label className="field">Setup key<input className="authenticator-setup-key" readOnly value={setup.key} spellCheck={false} autoComplete="off" onFocus={e=>e.currentTarget.select()}/></label><button className="secondary" type="button" onClick={copy}>Copy setup key</button><p role="status" aria-live="polite">{copyMessage}</p></details><p className="account-setup-private">Keep the QR code and setup key private. You will need this authenticator app each time you sign in.</p></section>;
}
