import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { chrome } from '../src/theme';

describe('guest map tab bar inset', () => {
  it('keeps the collapsed location search fully above the tab bar', () => {
    const stylesSource = readFileSync(
      join(process.cwd(), 'src/features/guest-map/GuestMapScreen.styles.ts'),
      'utf8',
    );

    assert.ok(chrome.screenBottomInset > chrome.tabBarHeight);
    assert.match(
      stylesSource,
      /collapsedSheet:\s*\{[\s\S]*bottom: chrome\.screenBottomInset/,
    );
    assert.doesNotMatch(
      stylesSource,
      /collapsedSheet:\s*\{[\s\S]*bottom: chrome\.tabBarHeight/,
    );
  });

  it('positions the collapsed search outside the full-height planner dock', () => {
    const screenSource = readFileSync(
      join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
      'utf8',
    );
    const dockStart = screenSource.indexOf(
      '<View pointerEvents="box-none" style={styles.sheetDock}>',
    );
    const dockEnd = screenSource.indexOf('</View>', dockStart);
    const collapsedSearch = screenSource.indexOf(
      'styles.collapsedSheet,',
      dockStart,
    );

    assert.ok(dockStart >= 0);
    assert.ok(dockEnd > dockStart);
    assert.ok(collapsedSearch > dockEnd);
  });
});
