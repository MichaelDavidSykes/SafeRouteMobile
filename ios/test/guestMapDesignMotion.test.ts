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
const detailCalloutSource = readFileSync(
  new URL('../src/features/live-map/LiveMapRiskDetailCallout.tsx', import.meta.url),
  'utf8',
);

describe('guest map design motion', () => {
  it('renders every supported travel mode with a moving selection plate', () => {
    assert.match(guestMapSource, /GUEST_TRAVEL_MODE_OPTIONS/);
    assert.match(guestMapSource, /guestMapTravelModeSelector/);
    assert.match(guestMapSource, /useMotionValue\(Math\.max\(0, selectedIndex\)/);
    assert.match(guestMapSource, /translateX: selectionProgress\.interpolate/);
    assert.match(guestMapSource, /<CarFront/);
    assert.match(guestMapSource, /<PersonStanding/);
    assert.match(guestMapSource, /<Bike/);
    assert.doesNotMatch(guestMapSource, /<TrainFront/);
    assert.match(guestMapSource, /<RouteOptionsPanel/);
    assert.match(guestMapSource, /SAFE_ROUTE_PREFERENCE_OPTIONS/);
    assert.match(guestMapSource, /accessibilityRole="switch"/);
  });

  it('preserves the selected mode through planning and risk-aware retries', () => {
    assert.match(
      guestMapSource,
      /travelMode: requestedTravelMode,\s*\n\s*\}\);/,
    );
    assert.match(
      guestMapSource,
      /setTravelMode\(nextMode\)[\s\S]*handlePlotRoute\(nextMode\)/,
    );
    assert.equal(
      (guestMapSource.match(/travelMode: localRoutePlan\.travelMode \?\? 'drive'/g) || []).length,
      3,
    );
  });

  it('matches the design entrances and pulse while respecting Reduce Motion', () => {
    assert.match(guestMapSource, /variant="chrome"/);
    assert.match(guestMapSource, /variant="sheet"/);
    assert.match(guestMapSource, /variant="disclosure"/);
    assert.match(guestMapSource, /outputRange: \[1, 2\.8\]/);
    assert.match(motionSource, /AccessibilityInfo\.isReduceMotionEnabled/);
    assert.match(motionSource, /duration = 2600/);
  });

  it('opens location search with the shared settled sheet curve', () => {
    assert.match(
      guestMapSource,
      /GUEST_SEARCH_STAGE_TRANSITION_MS = safeRouteMotion\.scrimDurationMs/,
    );
    assert.match(
      guestMapSource,
      /Animated\.timing\(sheetProgress[\s\S]*safeRouteMotion\.sheetExitDurationMs[\s\S]*safeRouteMotion\.sheetDurationMs/,
    );
    assert.match(
      guestMapSource,
      /safeRouteEasing\.exit[\s\S]*safeRouteEasing\.settled/,
    );
    assert.match(
      guestMapSource,
      /const animateRouteSheet =[\s\S]*onComplete\?\.\(\)[\s\S]*const scheduleRouteStopInputFocus/,
    );
    assert.match(guestMapSource, /outputRange: \[0, 24\]/);
    assert.doesNotMatch(guestMapSource, /outputRange: \[0, 620\]/);
  });

  it('synchronizes the search sheet with the native iOS keyboard transition', () => {
    assert.match(motionSource, /keyboardDurationMs: 250/);
    assert.match(motionSource, /export function useKeyboardTranslateY/);
    assert.match(
      motionSource,
      /Animated\.timing\(translateY[\s\S]*duration,[\s\S]*safeRouteEasing\.settled[\s\S]*useNativeDriver: true[\s\S]*keyboardWillChangeFrame/,
    );
    assert.match(motionSource, /Keyboard\.metrics\(\)/);
    assert.match(
      guestMapSource,
      /<KeyboardAvoidingView[\s\S]*enabled=\{Platform\.OS !== 'ios'\}/,
    );
    assert.match(
      guestMapSource,
      /styles\.sheetDock[\s\S]*translateY: keyboardTranslateY/,
    );
    assert.match(
      guestMapSource,
      /handleCollapsedLocationSearch[\s\S]*animateRouteSheet\(false\);[\s\S]*scheduleRouteStopInputFocus\(nextStopId\);/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /animateRouteSheet\(\s*false,\s*\(\) => scheduleRouteStopInputFocus/,
    );
  });

  it('animates authenticated workspace catalogues into the settled picker', () => {
    assert.match(
      guestMapSource,
      /const catalogPresentationKey = workspaces\.length[\s\S]*ready:\$\{workspaces\.map\(\(workspace\) => workspace\.id\)\.join\(':'\)\}/,
    );
    assert.match(
      guestMapSource,
      /key=\{catalogPresentationKey\}[\s\S]*replayKey=\{catalogPresentationKey\}[\s\S]*styles\.workspaceSelectorContent[\s\S]*variant="disclosure"/,
    );
    assert.match(
      guestMapSource,
      /menuOpen && workspaces\.length > 0[\s\S]*replayKey=\{catalogPresentationKey\}[\s\S]*variant="disclosure"/,
    );
  });

  it('shares dismissal and layout motion across search, route choices, and map details', () => {
    assert.match(motionSource, /configureNextSafeRouteLayoutAnimation/);
    assert.match(guestMapSource, /animateNextMapLayout/);
    assert.match(
      guestMapSource,
      /pointerEvents=\{sheetCollapsed \? 'none' : 'auto'\}[\s\S]*styles\.sheetScrim/,
    );
    assert.match(guestMapSource, /replayKey=\{replayKey\}[\s\S]*guestMapSearchResults/);
    assert.match(
      guestMapSource,
      /handlePlotRouteAction[\s\S]*plotTravelMode\(travelMode\)/,
    );
    assert.match(detailCalloutSource, /Animated\.parallel/);
    assert.match(detailCalloutSource, /safeRouteMotion\.sheetExitDurationMs/);
    assert.match(detailCalloutSource, /safeRouteEasing\.exit/);
    assert.match(detailCalloutSource, /useReduceMotionEnabled/);
  });
});
