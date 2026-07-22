import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const authApiSource = readFileSync(join(process.cwd(), 'src/features/auth/authApi.ts'), 'utf8');

describe('LunarChain auth API requests', () => {
  it('uses the dedicated rate-limited mobile login endpoint without spoofable bypass headers', () => {
    assert.match(authApiSource, /\/auth\/mobile-login/);
    assert.match(authApiSource, /\/auth\/verify-login-code/);
    assert.match(authApiSource, /\/auth\/resend-login-code/);
    assert.match(authApiSource, /\/auth\/request-password-reset/);
    assert.match(authApiSource, /\/auth\/reset-password/);
    assert.match(authApiSource, /\/auth\/register/);
    assert.match(authApiSource, /\/auth\/verify-code/);
    assert.doesNotMatch(authApiSource, /\/auth\/login['"`]/);
    assert.match(authApiSource, /headers:\s*buildAuthContentHeaders\('application\/x-www-form-urlencoded'\)/);
    assert.match(authApiSource, /headers:\s*buildAuthContentHeaders\('application\/json'\)/);
    assert.match(authApiSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
    assert.match(authApiSource, /payload\._id \|\| payload\.id/);
    assert.match(authApiSource, /id,\s*\n\s*name: payload\.name/);
    assert.doesNotMatch(authApiSource, /X-SafeRoute-Client|buildMobileClientHeaders|buildMobileAuthHeaders/);
  });

  it('uses the same password-reset and MFA payload contracts as LunarChain web', () => {
    assert.match(authApiSource, /buildLoginCodePayload\(email, challengeToken, code\)/);
    assert.match(authApiSource, /buildLoginCodeResendPayload\(challenge\.email, challenge\.challengeToken\)/);
    assert.match(authApiSource, /buildPasswordResetRequestPayload\(email\)/);
    assert.match(authApiSource, /buildPasswordResetPayload\(email, code, newPassword\)/);
    assert.match(authApiSource, /buildAccountRegistrationPayload\(\{ email, firstName, lastName, password \}\)/);
    assert.match(authApiSource, /buildAccountVerificationPayload\(email, code\)/);
    assert.match(authApiSource, /assertPublicAuthResponseOk/);
  });
});
