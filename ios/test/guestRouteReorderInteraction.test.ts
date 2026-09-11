import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('guest route stop reorder interaction', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
    'utf8',
  );

  it('uses a live sortable list and activates dragging from the whole row', () => {
    assert.match(source, /<SortableRouteStopList[\s\S]*data=\{reorderableRouteStops\}/);
    assert.match(
      source,
      /\(\) => \[routeDraft\.origin, \.\.\.routeDraft\.waypoints, routeDraft\.destination\]/,
    );
    assert.match(source, /function SortableRouteStopRow/);
    assert.match(source, /const rowResponder = useMemo/);
    assert.match(source, /PanResponder\.create/);
    assert.match(source, /onMoveShouldSetPanResponderCapture/);
    assert.match(source, /Date\.now\(\) - touchStartTimeRef\.current >= 160/);
    assert.match(source, /onDragUpdate\(index, gestureState\.dy\)/);
    assert.match(source, /dragStateRef\.current = nextState/);
    assert.match(source, /settling: true/);
    assert.match(source, /GUEST_ROUTE_STOP_SETTLE_DURATION_MS/);
    assert.match(source, /NativeAnimated\.timing\(translationY/);
    assert.match(source, /onDragSettledRef\.current\(stopId, index\)/);
    assert.match(source, /GUEST_ROUTE_STOP_DELETE_WIDTH/);
    assert.match(source, /NativeAnimated\.timing\(swipeTranslationX/);
    assert.match(source, /accessibilityLabel="Delete this stop"/);
    assert.match(source, /accessibilityElementsHidden=\{openSwipeStopId !== stopId\}/);
    assert.match(source, /styles\.routeStopDeleteAction/);
    assert.match(source, /onRemove=\{handleRemoveWaypoint\}/);
    assert.match(source, /onReorder\(stopId, completed\.hoverIndex\)/);
    assert.match(source, /key=\{stop\.reorderKey\}/);
    assert.match(source, /transform: \[\{ translateY: translationY \}\]/);
    assert.match(source, /children\(\(\) => Date\.now\(\) >= suppressFocusUntilRef\.current\)/);
    assert.match(source, /multiline=\{false\}/);
    assert.match(source, /numberOfLines=\{1\}/);
    assert.doesNotMatch(source, /react-native-gesture-handler/);
    assert.match(
      source,
      /onReorder=\{handleReorderStop\}/,
    );
    assert.doesNotMatch(
      source,
      /react-native-draggable-flatlist|ScaleDecorator|GripVertical|waypointDragHandle|useAnimatedReaction/,
    );
  });
});
