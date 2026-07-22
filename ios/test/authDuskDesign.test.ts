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

describe('LunarChain Dusk authentication design', () => {
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

  it('uses one Dusk primary action recipe and glass controls across every auth state', () => {
    assert.match(styleSource, /card:[\s\S]*borderTopColor:\s*authColors\.glassTopEdge/);
    assert.match(styleSource, /primaryButton:[\s\S]*backgroundColor:\s*authColors\.accent/);
    assert.match(styleSource, /inputShell:[\s\S]*backgroundColor:\s*authColors\.input/);
    assert.match(styleSource, /letterSpacing:\s*0/);
    assert.match(loginSource, /<AuthBackdrop \/>/);
    assert.match(loginSource, /<BlurView[\s\S]*intensity=\{30\}[\s\S]*style=\{styles\.cardBlur\}/);
    assert.match(styleSource, /card:[\s\S]*overflow:\s*'hidden'/);
    assert.match(styleSource, /inputShellFocused:[\s\S]*shadowRadius:\s*3/);
    assert.match(loginSource, /Forgot password\?/);
    assert.match(loginSource, /Resend code/);
    assert.match(loginSource, /Create a new password/);
    assert.match(loginSource, /Verify and continue/);
  });
});
