import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const guestMapSource = readFileSync(
  new URL('../src/features/guest-map/GuestMapScreen.tsx', import.meta.url),
  'utf8',
);
const motionSource = readFileSync(
  new URL('../src/motion/SafeRouteMotion.tsx', import.meta.url),
  'utf8',
);

describe('guest location-search motion', () => {
  it('opens the route sheet consistently from below the viewport', () => {
    assert.match(
      guestMapSource,
      /const routeSheetTravelDistance =\s*routeSheetMaxHeight \+ routeSheetBottomPadding \+ spacing\.lg/,
    );
    assert.match(
      guestMapSource,
      /translateY: sheetProgress\.interpolate\(\{[\s\S]*outputRange: \[0, routeSheetTravelDistance\]/,
    );
    assert.doesNotMatch(guestMapSource, /outputRange: \[0, 24\]/);
    assert.match(
      guestMapSource,
      /gesture\.dy \/ Math\.max\([\s\S]*routeSheetTravelDistance/,
    );
  });

  it('starts the sheet before one idempotent focus and keeps failure recovery', () => {
    assert.match(
      guestMapSource,
      /handleCollapsedLocationSearch[\s\S]*transitionActiveInput\(nextStopId, \{ animate: false \}\)[\s\S]*animateRouteSheet\([\s\S]*false,[\s\S]*scheduleRouteStopInputFocus\(nextStopId\)/,
    );
    assert.match(
      guestMapSource,
      /const input = routeInputRefs\.current\.get\(stopId\);[\s\S]*!input\.isFocused\(\)[\s\S]*input\.focus\(\)/,
    );
    assert.doesNotMatch(guestMapSource, /pendingInputFocusRetryRef|setTimeout\([\s\S]{0,120}, 120\)/);
    assert.match(
      guestMapSource,
      /pendingInputFocusRecoveryRef[\s\S]*Keyboard\.isVisible\(\)[\s\S]*input\?\.blur\(\)[\s\S]*input\?\.focus\(\)/,
    );
    assert.match(
      guestMapSource,
      /function RouteInput[\s\S]*<Pressable[\s\S]*onPress=\{focusNativeInput\}[\s\S]*showSoftInputOnFocus/,
    );
  });

  it('crossfades search-stage content upward on the native animation driver', () => {
    assert.match(guestMapSource, /const searchStageProgress = useRef\(new Animated\.Value\(1\)\)\.current/);
    assert.match(
      guestMapSource,
      /Animated\.timing\(searchStageProgress,[\s\S]*safeRouteEasing\.settled[\s\S]*useNativeDriver: true/,
    );
    assert.match(
      guestMapSource,
      /translateY: searchStageProgress\.interpolate\(\{[\s\S]*outputRange: \[12, 0\]/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /function LocationSearchResultRow[\s\S]*<MotionEntrance delay=/,
    );
  });

  it('tracks the native iOS keyboard frame with one explicit transform animation', () => {
    assert.match(motionSource, /keyboardWillChangeFrame/);
    assert.match(
      motionSource,
      /Animated\.timing\(translateY,[\s\S]*easing: safeRouteEasing\.keyboard[\s\S]*useNativeDriver: true/,
    );
    assert.doesNotMatch(motionSource, /Keyboard\.scheduleLayoutAnimation\(event\)/);
    assert.match(
      guestMapSource,
      /styles\.sheetDock[\s\S]*translateY: keyboardTranslateY/,
    );
  });
});
