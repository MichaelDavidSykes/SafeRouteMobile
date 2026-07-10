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
  });

  it('supports a smooth collapsible route sheet and deliberate map long-press actions', () => {
    assert.match(screen, /Animated\.spring\(sheetProgress/);
    assert.match(screen, /PanResponder\.create/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapCollapsedSheet\}/);
    assert.match(screen, /onLongPress=\{\(event\) => handleMapLongPress/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapLongPressMenu\}/);
    assert.match(screen, />Add stop<\/Text>/);
    assert.match(screen, /Add risk area/);
    assert.doesNotMatch(screen, /Ionicons|MaterialIcons|FontAwesome/);
  });
});
