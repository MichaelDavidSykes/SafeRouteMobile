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
const bottomSheetSource = readFileSync(
  new URL('../src/components/SafeRouteBottomSheet.tsx', import.meta.url),
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

  it('opens location search through the shared native bottom sheet', () => {
    assert.match(
      guestMapSource,
      /const routeSheetSnapPoints = useMemo\([\s\S]*\[routeSheetMaxHeight\]/,
    );
    assert.match(
      guestMapSource,
      /<SafeRouteBottomSheet[\s\S]*animateOnMount=\{false\}[\s\S]*index=\{-1\}[\s\S]*snapPoints=\{routeSheetSnapPoints\}/,
    );
    assert.match(
      guestMapSource,
      /const animateRouteSheet =[\s\S]*routeSheetRef\.current\?\.close\(\)[\s\S]*routeSheetRef\.current\?\.snapToIndex\(0\)/,
    );
    assert.match(
      guestMapSource,
      /handleRouteSheetChange[\s\S]*finishRouteSheetTransition\(false\)[\s\S]*handleRouteSheetClose[\s\S]*finishRouteSheetTransition\(true\)/,
    );
    assert.match(
      bottomSheetSource,
      /enableDynamicSizing=\{false\}[\s\S]*enableOverDrag=\{false\}/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /sheetProgress|routeSheetTravelDistance|PanResponder/,
    );
  });

  it('synchronizes search with the bottom sheet keyboard controller', () => {
    assert.match(
      bottomSheetSource,
      /enableBlurKeyboardOnGesture[\s\S]*keyboardBehavior="interactive"[\s\S]*keyboardBlurBehavior="restore"/,
    );
    assert.match(
      guestMapSource,
      /<BottomSheetScrollView[\s\S]*keyboardDismissMode="interactive"[\s\S]*keyboardShouldPersistTaps="handled"/,
    );
    assert.match(
      guestMapSource,
      /function RouteInput[\s\S]*<BottomSheetTextInput[\s\S]*showSoftInputOnFocus/,
    );
    assert.match(
      guestMapSource,
      /handleCollapsedLocationSearch[\s\S]*animateRouteSheet\([\s\S]*false,[\s\S]*scheduleRouteStopInputFocus\(nextStopId\)/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /useKeyboardTranslateY|keyboardTranslateY|KeyboardAvoidingView|pendingInputFocusRecoveryRef/,
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
      /<SafeRouteBottomSheet[\s\S]*backdrop[\s\S]*dismissOnBackdropPress[\s\S]*enablePanDownToClose/,
    );
    assert.match(
      bottomSheetSource,
      /<BottomSheetBackdrop[\s\S]*pressBehavior=\{dismissOnBackdropPress \? 'close' : 'none'\}/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /styles\.sheetScrim|searchStageProgress/,
    );
    assert.match(
      guestMapSource,
      /function LocationSearchResults[\s\S]*<View[\s\S]*guestMapSearchResults/,
    );
    assert.match(
      guestMapSource,
      /handlePlotRouteAction[\s\S]*plotTravelMode\(travelMode\)/,
    );
    assert.match(detailCalloutSource, /<SafeRouteBottomSheet/);
    assert.match(detailCalloutSource, /snapPoints=\{snapPoints\}/);
    assert.match(detailCalloutSource, /enablePanDownToClose/);
    assert.doesNotMatch(detailCalloutSource, /Animated\.parallel|PanResponder/);
  });
});
