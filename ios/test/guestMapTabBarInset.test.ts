import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { chrome } from '../src/theme';

describe('guest map floating navigation inset', () => {
  it('uses the freed tab-bar space for the collapsed location search', () => {
    const stylesSource = readFileSync(
      join(process.cwd(), 'src/features/guest-map/GuestMapScreen.styles.ts'),
      'utf8',
    );

    assert.ok(chrome.screenBottomInset >= 32);
    assert.ok(chrome.screenBottomInset < chrome.tabBarHeight);
    assert.match(
      readFileSync(
        join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
        'utf8',
      ),
      /bottomInset=\{chrome\.screenBottomInset\}[\s\S]*detached/,
    );
    assert.doesNotMatch(
      stylesSource,
      /bottom: chrome\.tabBarHeight/,
    );
  });

  it('keeps collapsed search and planner inside the same persistent sheet', () => {
    const screenSource = readFileSync(
      join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
      'utf8',
    );
    const dockStart = screenSource.indexOf('<SafeRouteBottomSheet');
    const dockEnd = screenSource.indexOf('</SafeRouteBottomSheet>', dockStart);
    const collapsedSearch = screenSource.indexOf(
      'styles.persistentCollapsedContent',
      dockStart,
    );

    assert.ok(dockStart >= 0);
    assert.ok(dockEnd > dockStart);
    assert.ok(collapsedSearch > dockStart);
    assert.ok(collapsedSearch < dockEnd);
    assert.match(screenSource, /index=\{mapSheetLayout\.collapsedIndex\}/);
    assert.doesNotMatch(screenSource, /index=\{-1\}/);
  });

  it('docks the expanded planner without exposing the map', () => {
    const screenSource = readFileSync(
      join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
      'utf8',
    );

    assert.match(
      screenSource,
      /<SafeAreaView[\s\S]*edges=\{\['top', 'right', 'left'\]\}/,
    );
    assert.match(
      screenSource,
      /createGuestMapSheetLayout\([\s\S]*viewport\.height,[\s\S]*chrome\.screenBottomInset[\s\S]*paddingBottom: routeSheetBottomPadding/,
    );
    assert.doesNotMatch(
      screenSource,
      /paddingBottom: spacing\.lg \+ safeAreaInsets\.bottom/,
    );
  });
});
