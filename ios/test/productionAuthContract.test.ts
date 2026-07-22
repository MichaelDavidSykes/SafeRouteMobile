import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const appSource = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');
const apiSource = readFileSync(
  join(process.cwd(), 'src/features/auth/authApi.ts'),
  'utf8'
);
const storageSource = readFileSync(
  join(process.cwd(), 'src/features/auth/accountInvitationStorage.ts'),
  'utf8'
);

describe('production authentication integration', () => {
  it('resolves trusted initial and foreground invitation links before session restore', () => {
    assert.match(appSource, /Linking\.getInitialURL\(\)/);
    assert.match(appSource, /Linking\.addEventListener\('url'/);
    assert.match(appSource, /extractInvitationTokenFromUrl/);
    assert.match(appSource, /resolveAccountInvitation/);
    assert.match(appSource, /invitationStartupReady/);
    assert.match(appSource, /invitationEntryActive/);
  });

  it('stores pending invitation capabilities only in device-bound SecureStore', () => {
    assert.match(storageSource, /expo-secure-store/);
    assert.match(storageSource, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
    assert.doesNotMatch(storageSource, /AsyncStorage/);
    assert.match(appSource, /savePendingAccountInvitationToken/);
    assert.match(appSource, /clearPendingAccountInvitationToken/);
  });

  it('uses native production auth routes without spoofable bypass markers', () => {
    assert.match(apiSource, /\/auth\/mobile-login/);
    assert.match(apiSource, /\/auth\/mobile-register/);
    assert.match(apiSource, /\/auth\/mobile-verify-code/);
    assert.doesNotMatch(apiSource, /X-SafeRoute-Client|X-Mobile|turnstile_token/);
  });
});
