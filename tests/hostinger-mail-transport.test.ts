import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('restricts Hostinger MTA access, performs a no-send health check and preserves MIME/BCC/exit status',()=>{
 expect(execFileSync('python3',['tests/fixtures/hostinger_mail_transport.py'],{encoding:'utf8'}).trim()).toBe('verified');
});
