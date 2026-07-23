import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { authColors, authRadius } from '../src/features/auth/authDesign';

const loginSource = readFileSync(
  join(process.cwd(), 'src/features/auth/LoginScreen.tsx'),
  'utf8'
);
const styleSource = readFileSync(
  join(process.cwd(), 'src/features/auth/LoginScreen.styles.ts'),
  'utf8'
);

describe('SafeRoute authentication design', () => {
  it('ports the final handoff tokens without changing semantic severity colors', () => {
    assert.equal(authColors.background, '#161B2E');
    assert.equal(authColors.text, '#F4F5FB');
    assert.equal(authColors.muted, '#A6ACC4');
    assert.equal(authColors.accent, '#C9C4F4');
    assert.equal(authColors.critical, '#E5484D');
    assert.equal(authColors.criticalText, '#FFB4B8');
    assert.equal(authRadius.card, 22);
    assert.equal(authRadius.row, 14);
    assert.equal(authRadius.pill, 999);
  });

  it('uses the current unframed auth hierarchy across sign-in, MFA, and password reset', () => {
    assert.match(loginSource, /useSafeAreaInsets/);
    assert.match(loginSource, /top:\s*safeAreaInsets\.top \+ 12/g);
    assert.match(styleSource, /handoffPrimaryButton:[\s\S]*backgroundColor:\s*'#FFFFFF'/);
    assert.match(styleSource, /handoffPrimaryButton:[\s\S]*borderRadius:\s*15/);
    assert.match(styleSource, /handoffInputShell:[\s\S]*minHeight:\s*54/);
    assert.match(styleSource, /flowTitle:[\s\S]*fontSize:\s*25/);
    assert.match(styleSource, /flowTitle:[\s\S]*textAlign:\s*'center'/);
    assert.match(styleSource, /codeCell:[\s\S]*borderRadius:\s*14/);
    assert.match(styleSource, /letterSpacing:\s*0/);
    assert.match(loginSource, /<AuthBackdrop \/>/);
    assert.doesNotMatch(loginSource, /BlurView|cardFrame|styles\.card/);
    assert.doesNotMatch(styleSource, /flowTitle:[\s\S]*textTransform:\s*'uppercase'/);
    assert.match(loginSource, /title:\s*'Reset password'/);
    assert.match(loginSource, /title:\s*'Two-factor auth'/);
    assert.match(loginSource, /Array\.from\(\{ length: 6 \}/);
    assert.match(loginSource, /Forgot password\?/);
    assert.match(loginSource, /Didn't receive a code\?/);
    assert.match(loginSource, /Create a new password/);
    assert.match(loginSource, /Verify and continue/);
  });
});
