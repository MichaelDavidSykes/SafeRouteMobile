import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveLoginViewportLayout } from '../src/features/auth/loginViewportLayout';

describe('login viewport layout', () => {
  it('uses compact spacing on small iPhone viewports', () => {
    const layout = resolveLoginViewportLayout({ height: 667, platform: 'ios', width: 375 });

    assert.equal(layout.compact, true);
    assert.equal(layout.keyboardVerticalOffset, 12);
  });

  it('keeps the default centered layout on taller iPhone viewports', () => {
    const layout = resolveLoginViewportLayout({ height: 844, platform: 'ios', width: 390 });

    assert.equal(layout.compact, false);
  });

  it('treats very narrow viewports as compact even when height is available', () => {
    const layout = resolveLoginViewportLayout({ height: 780, platform: 'ios', width: 320 });

    assert.equal(layout.compact, true);
  });

  it('does not apply an iOS keyboard offset on non-iOS platforms', () => {
    const layout = resolveLoginViewportLayout({ height: 720, platform: 'android', width: 360 });

    assert.equal(layout.compact, false);
    assert.equal(layout.keyboardVerticalOffset, 0);
  });
});
