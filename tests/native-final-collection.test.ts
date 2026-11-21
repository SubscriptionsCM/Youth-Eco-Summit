import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('guards the final capture, verifies reused bytes and reports staff changes without rewriting mappings',()=>{
 expect(execFileSync('python3',['tests/fixtures/native_final_collection.py'],{encoding:'utf8'}).trim()).toBe('verified');
});
