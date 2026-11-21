import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('materializes exact private bytes and rejects corrupt content or archive traversal',()=>{
 const result=execFileSync('python3',['tests/fixtures/native_export_materialize.py'],{encoding:'utf8'});
 expect(result.trim()).toBe('verified');
});
