import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  isAppTabDisabled,
  resolveAppTabBarLayout,
  type AppTab,
} from '../src/components/appTabBarState';

describe('app tab bar authentication', () => {
  it('keeps Map enabled and disables every protected tab while signed out', () => {
    assert.equal(isAppTabDisabled('map', false), false);

    for (const tab of ['routes', 'convoys', 'calendar'] satisfies AppTab[]) {
      assert.equal(isAppTabDisabled(tab, false), true);
      assert.equal(isAppTabDisabled(tab, true), false);
    }
  });

  it('keeps the tab controls above the device home indicator', () => {
    assert.deepEqual(resolveAppTabBarLayout(0), {
      bottomInset: 26,
      height: 86,
    });
    assert.deepEqual(resolveAppTabBarLayout(34), {
      bottomInset: 34,
      height: 94,
    });
  });

  it('wires the disabled state into both the control and navigation boundary', () => {
    const tabBarSource = readFileSync(
      join(process.cwd(), 'src/components/AppTabBar.tsx'),
      'utf8',
    );
    const appSource = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');

    assert.match(tabBarSource, /accessibilityState=\{\{ disabled, selected \}\}/);
    assert.match(tabBarSource, /disabled=\{disabled\}/);
    assert.match(
      appSource,
      /if \(isAppTabDisabled\(tab, authenticated\)\) \{\s*return;\s*\}/,
    );
  });
});
