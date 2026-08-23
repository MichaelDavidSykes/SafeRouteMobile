import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  isAppTabDisabled,
  resolveAppNavigationMenuBottomInset,
  type AppTab,
} from '../src/components/appTabBarState';

describe('app navigation menu authentication', () => {
  it('keeps Map enabled and disables every protected tab while signed out', () => {
    assert.equal(isAppTabDisabled('map', false), false);

    for (const tab of ['routes', 'convoys', 'calendar'] satisfies AppTab[]) {
      assert.equal(isAppTabDisabled(tab, false), true);
      assert.equal(isAppTabDisabled(tab, true), false);
    }
  });

  it('keeps the floating trigger above the device home indicator', () => {
    assert.equal(resolveAppNavigationMenuBottomInset(0), 14);
    assert.equal(resolveAppNavigationMenuBottomInset(34), 46);
  });

  it('wires the disabled state into both the control and navigation boundary', () => {
    const menuSource = readFileSync(
      join(process.cwd(), 'src/components/AppTabBar.tsx'),
      'utf8',
    );
    const appSource = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');

    assert.match(menuSource, /accessibilityState=\{\{ disabled, selected \}\}/);
    assert.match(menuSource, /disabled=\{disabled\}/);
    assert.match(menuSource, /accessibilityState=\{\{ expanded: open \}\}/);
    assert.match(
      appSource,
      /if \(isAppTabDisabled\(tab, authenticated\)\) \{\s*return;\s*\}/,
    );
  });

  it('replaces the fixed bar with a menu beneath the map controls', () => {
    const menuSource = readFileSync(
      join(process.cwd(), 'src/components/AppTabBar.tsx'),
      'utf8',
    );
    const appSource = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');
    const mapStylesSource = readFileSync(
      join(process.cwd(), 'src/features/guest-map/GuestMapScreen.styles.ts'),
      'utf8',
    );

    assert.match(menuSource, /<Menu accessibilityElementsHidden/);
    assert.match(menuSource, /menuProgress\.interpolate/);
    assert.match(menuSource, /<BlurView intensity=\{64\}/);
    assert.doesNotMatch(menuSource, /styles\.bar|borderTopWidth/);
    assert.match(appSource, /<AppNavigationMenu[\s\S]*placement=\{screen === 'guest-map' \? 'map' : 'screen'\}/);
    assert.match(
      mapStylesSource,
      /currentLocationControlDock:[\s\S]*bottom:\s*chrome\.screenBottomInset \+ 76 \+ spacing\.sm \+ 46 \+ spacing\.sm/,
    );
  });

  it('hides the floating menu while a map detail modal is open', () => {
    const appSource = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');
    const mapSource = readFileSync(
      join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
      'utf8',
    );

    assert.match(appSource, /onMapModalVisibilityChange=\{setMapModalOpen\}/);
    assert.match(
      appSource,
      /screen === 'guest-map' && \(mapPlannerOpen \|\| mapModalOpen\)/,
    );
    assert.match(
      mapSource,
      /onMapModalVisibilityChange\?\.\(Boolean\(selectedRiskZone \|\| mapAction\)\)/,
    );
    assert.match(
      mapSource,
      /\(\) => \(\) => onMapModalVisibilityChange\?\.\(false\)/,
    );
  });
});
