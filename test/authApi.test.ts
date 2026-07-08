import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const authApiSource = readFileSync(join(process.cwd(), 'src/features/auth/authApi.ts'), 'utf8');

describe('LunarChain auth API requests', () => {
  it('sends the SafeRoute Mobile client marker with credential, verification, and session validation requests', () => {
    assert.match(authApiSource, /buildMobileAuthHeaders/);
    assert.match(authApiSource, /buildMobileClientHeaders/);
    assert.match(authApiSource, /headers:\s*buildMobileAuthHeaders\('application\/x-www-form-urlencoded'\)/);
    assert.match(authApiSource, /headers:\s*buildMobileAuthHeaders\('application\/json'\)/);
    assert.match(authApiSource, /headers:\s*buildMobileClientHeaders\(\{\s*Authorization:/);
  });
});
