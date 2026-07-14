import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('guest map interaction contract', () => {
  const screen = readFileSync(
    join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
    'utf8'
  );

  it('keeps route drafting map-first, multi-stop, editable, and keyboard-safe', () => {
    assert.match(screen, /useReducer\(\s*guestRouteDraftReducer/);
    assert.match(screen, /routeDraft\.waypoints\.map/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapAddWaypoint\}/);
    assert.match(screen, /KeyboardAvoidingView/);
    assert.match(screen, /keyboardDismissMode="interactive"/);
    assert.match(screen, /keyboardShouldPersistTaps="handled"/);
    assert.match(screen, /mapGuestRouteDraftToCheckpoints/);
    assert.match(screen, /checkpointCoordinates\.length >= 2/);
    assert.match(screen, /shouldRecenterGuestMap/);
    assert.match(screen, /onMapReady=\{\(\) => \{[\s\S]*setMapReady\(true\)/);
    assert.match(screen, /if \(!mapReady\)/);
    assert.match(screen, /onPanDrag=\{\(\) =>/);
  });

  it('supports a smooth collapsible route sheet and deliberate map long-press actions', () => {
    assert.match(screen, /Animated\.spring\(sheetProgress/);
    assert.match(screen, /PanResponder\.create/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapCollapsedSheet\}/);
    assert.match(screen, /onLongPress=\{\(event\) => handleMapLongPress/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapLongPressMenu\}/);
    assert.match(screen, />Add stop<\/Text>/);
    assert.match(screen, /Add risk area/);
    assert.match(screen, /handleMapLongPress[\s\S]*animateRouteSheet\(true\)/);
    assert.match(screen, /handleSelectRiskZone[\s\S]*animateRouteSheet\(true\)/);
    assert.doesNotMatch(screen, /Ionicons|MaterialIcons|FontAwesome/);
  });

  it('turns the collapsed card into a one-tap next-stop search', () => {
    assert.match(screen, /accessibilityLabel="Search for the next stop"/);
    assert.match(screen, />\s*Search for a location\s*</);
    assert.match(screen, /handleCollapsedLocationSearch/);
    assert.match(
      screen,
      /resolveGuestRouteDraftNextStopInputId\(routeDraft\)[\s\S]*animateRouteSheet\(false\)[\s\S]*focusRouteStopInput\(nextStopId\)/
    );
    assert.match(screen, /routeInputRefs\.current\.get\(stopId\)\?\.focus\(\)/);
    assert.doesNotMatch(screen, />Expand<\/Text>/);
  });
});
