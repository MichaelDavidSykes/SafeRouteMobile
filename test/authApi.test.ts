import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const authApiSource = readFileSync(join(process.cwd(), 'src/features/auth/authApi.ts'), 'utf8');

describe('LunarChain auth API requests', () => {
  it('uses the dedicated rate-limited mobile login endpoint without spoofable bypass headers', () => {
    assert.match(authApiSource, /\/auth\/mobile-login/);
    assert.doesNotMatch(authApiSource, /\/auth\/login['"`]/);
    assert.match(authApiSource, /headers:\s*buildAuthContentHeaders\('application\/x-www-form-urlencoded'\)/);
    assert.match(authApiSource, /headers:\s*buildAuthContentHeaders\('application\/json'\)/);
    assert.match(authApiSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
    assert.doesNotMatch(authApiSource, /X-SafeRoute-Client|buildMobileClientHeaders|buildMobileAuthHeaders/);
  });
});
