// @vitest-environment happy-dom
import {createElement,act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import QRCode from 'qrcode';
import {AuthenticatorSetup} from '../src/components/authenticator-setup';
vi.mock('qrcode',()=>({default:{toCanvas:vi.fn(async()=>{})}}));
const secret='JBSWY3DPEHPK3PXP',uri=`otpauth://totp/Youth%20Eco%20Summit:judge%40qa.example?issuer=Youth%20Eco%20Summit&secret=${secret}&algorithm=SHA1&digits=6&period=30`;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function render(value=uri){await act(async()=>{root.render(createElement(AuthenticatorSetup,{provisioningUri:value}));});}
it('renders the exact setup URI locally as a QR code and explains where the code comes from',async()=>{
 await render();expect(QRCode.toCanvas).toHaveBeenCalledWith(expect.any(HTMLCanvasElement),uri,expect.objectContaining({margin:4}));
 expect(host.textContent).toContain('Add your account to an authenticator app');expect(host.textContent).toContain('not sent by email');
 expect(host.querySelector('a')?.getAttribute('href')).toBe(uri);expect(host.querySelector('details')?.open).toBe(false);
 expect(host.textContent).not.toContain('otpauth://');expect(host.querySelector('img[src^="http"]')).toBeNull();
});
it('provides separate account, issuer and setup-key fields without asking users to interpret a URI',async()=>{
 await render();expect(host.textContent).toContain('judge@qa.example');expect(host.textContent).toContain('Youth Eco Summit');
 const input=host.querySelector<HTMLInputElement>('input')!;expect(input.value).toBe(secret);expect(input.readOnly).toBe(true);
 expect(host.textContent).toContain('Time based');expect(host.textContent).toContain('30 seconds');
});
it('copies only the manual secret and gives a usable fallback if clipboard access fails',async()=>{
 const copy=vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValue(undefined);vi.spyOn(navigator.clipboard,'writeText').mockImplementation(copy);
 await render();const button=host.querySelector('button')!;
 await act(async()=>button.click());expect(copy).toHaveBeenCalledWith(secret);expect(host.textContent).toContain('Select the setup key and copy it manually');
 await act(async()=>button.click());expect(host.textContent).toContain('Setup key copied');
});
it('keeps manual setup available when QR rendering fails',async()=>{
 vi.mocked(QRCode.toCanvas).mockRejectedValueOnce(new Error('Canvas unavailable'));
 await render();expect(host.querySelector('details')?.open).toBe(true);expect(host.textContent).toContain('Use the manual setup below');
 expect(host.querySelector<HTMLInputElement>('input')?.value).toBe(secret);
});
it('rejects malformed or non-authenticator links without exposing them or generating a QR code',async()=>{
 for(const value of ['https://outside.qa/?secret=private','javascript:alert(1)','otpauth://hotp/account?secret=INVALID!']){
  await render(value);expect(host.querySelector('a')).toBeNull();expect(host.querySelector('input')).toBeNull();expect(host.textContent).toContain('could not be loaded');
 }
 expect(QRCode.toCanvas).not.toHaveBeenCalled();
});
