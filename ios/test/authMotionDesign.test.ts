import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const authBackdropSource = readFileSync(
  join(process.cwd(), 'src/features/auth/AuthBackdrop.tsx'),
  'utf8'
);
const createAccountSource = readFileSync(
  join(process.cwd(), 'src/features/auth/CreateAccountScreen.tsx'),
  'utf8'
);
const loginSource = readFileSync(join(process.cwd(), 'src/features/auth/LoginScreen.tsx'), 'utf8');
const motionSource = readFileSync(join(process.cwd(), 'src/motion/SafeRouteMotion.tsx'), 'utf8');

describe('SafeRoute authentication motion handoff', () => {
  it('draws the backdrop route over 1.6 seconds after the designed delay', () => {
    assert.match(authBackdropSource, /delay:\s*200/);
    assert.match(authBackdropSource, /duration:\s*1600/);
    assert.match(authBackdropSource, /strokeDasharray=\{AUTH_ROUTE_LENGTH\}/);
    assert.match(authBackdropSource, /outputRange:\s*\[AUTH_ROUTE_LENGTH,\s*0\]/);
  });

  it('stages sign-in and flow screens at the designed delays', () => {
    assert.match(loginSource, /delay=\{60\}[\s\S]*replayKey="credentials"/);
    assert.match(loginSource, /delay=\{120\}[\s\S]*replayKey="credentials"/);
    assert.match(loginSource, /delay=\{180\}[\s\S]*replayKey="credentials"/);
    assert.match(loginSource, /delay=\{0\}\s+replayKey=\{view\}/);
    assert.match(loginSource, /delay=\{60\}\s+replayKey=\{view\}/);
    assert.match(loginSource, /delay=\{120\}\s+replayKey=\{view\}/);
    assert.match(loginSource, /delay=\{180\}\s+replayKey=\{view\}/);
  });

  it('stages account creation and email verification without changing their controls', () => {
    for (const delay of [0, 60, 100, 120, 140, 200]) {
      assert.match(createAccountSource, new RegExp(`delay=\\{${delay}\\}`));
    }
    assert.match(createAccountSource, /testID=\{uiTestIds\.accountCreateSubmit\}/);
    assert.match(createAccountSource, /testID=\{uiTestIds\.accountVerifySubmit\}/);
  });

  it('uses reduced-motion-aware shared values for MFA emphasis and entrances', () => {
    assert.match(loginSource, /useMotionValue\(filled \|\| focused \? 1\.06 : 1/);
    assert.match(loginSource, /<MfaCodeCell/);
    assert.match(motionSource, /AccessibilityInfo\.isReduceMotionEnabled/);
    assert.match(motionSource, /if \(reduceMotionEnabled\)/);
  });
});
