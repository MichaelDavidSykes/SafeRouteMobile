import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const createSource = readFileSync(
  join(process.cwd(), 'src/features/auth/CreateAccountScreen.tsx'),
  'utf8'
);
const createStyles = readFileSync(
  join(process.cwd(), 'src/features/auth/CreateAccountScreen.styles.ts'),
  'utf8'
);
const loginSource = readFileSync(
  join(process.cwd(), 'src/features/auth/LoginScreen.tsx'),
  'utf8'
);
const backdropSource = readFileSync(
  join(process.cwd(), 'src/features/auth/AuthBackdrop.tsx'),
  'utf8'
);

describe('SafeRoute account creation handoff', () => {
  it('implements every designed account field, requirement, and navigation action', () => {
    assert.match(createSource, /Create account/);
    assert.match(createSource, /Set up your SafeRoute account/);
    assert.match(createSource, /placeholder="First name"/);
    assert.match(createSource, /placeholder="Last name"/);
    assert.match(createSource, /placeholder="Email"/);
    assert.match(createSource, /placeholder="Password"/);
    assert.match(createSource, /At least 8 characters/);
    assert.match(createSource, /One letter and one number/);
    assert.match(createSource, /One special character/);
    assert.match(createSource, /Already have an account\?/);
    assert.match(createSource, /testID=\{uiTestIds\.accountCreateSignIn\}/);
  });

  it('uses the handoff sizing, white action, and route-around-risk backdrop', () => {
    assert.match(createStyles, /inputShell:[\s\S]*minHeight:\s*52/);
    assert.match(createStyles, /inputShell:[\s\S]*borderRadius:\s*14/);
    assert.match(createStyles, /primaryButton:[\s\S]*minHeight:\s*54/);
    assert.match(createStyles, /primaryButton:[\s\S]*backgroundColor:\s*'#FFFFFF'/);
    assert.match(backdropSource, /auth-risk/);
    assert.match(backdropSource, /strokeDasharray="1 16"/);
    assert.match(backdropSource, /fill="#30B85A"/);
    assert.match(backdropSource, /fill="#5CA4FF"/);
  });

  it('adds the designed create-account action to sign in', () => {
    assert.match(loginSource, /testID=\{uiTestIds\.loginCreateAccount\}/);
    assert.match(loginSource, />Create account<\/Text>/);
    assert.match(loginSource, /setView\('register'\)/);
  });
});
