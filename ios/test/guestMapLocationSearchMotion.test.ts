import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const guestMapSource = readFileSync(
  new URL('../src/features/guest-map/GuestMapScreen.tsx', import.meta.url),
  'utf8',
);
const bottomSheetSource = readFileSync(
  new URL('../src/components/SafeRouteBottomSheet.tsx', import.meta.url),
  'utf8',
);

describe('guest location-search motion', () => {
  it('uses the shared native bottom sheet with one explicit snap point', () => {
    assert.match(
      guestMapSource,
      /const routeSheetSnapPoints = useMemo\([\s\S]*\[routeSheetMaxHeight\]/,
    );
    assert.match(
      guestMapSource,
      /<SafeRouteBottomSheet[\s\S]*enablePanDownToClose[\s\S]*index=\{-1\}[\s\S]*snapPoints=\{routeSheetSnapPoints\}/,
    );
    assert.match(guestMapSource, /<BottomSheetScrollView/);
    assert.match(bottomSheetSource, /enableDynamicSizing=\{false\}/);
    assert.doesNotMatch(
      guestMapSource,
      /routeSheetTravelDistance|sheetProgress|PanResponder/,
    );
  });

  it('waits for the opening animation to settle before focusing the input', () => {
    assert.match(
      guestMapSource,
      /handleCollapsedLocationSearch[\s\S]*transitionActiveInput\(nextStopId\)[\s\S]*animateRouteSheet\([\s\S]*false,[\s\S]*\(\) => scheduleRouteStopInputFocus\(nextStopId\)/,
    );
    assert.match(
      guestMapSource,
      /handleRouteSheetChange[\s\S]*finishRouteSheetTransition\(false\)/,
    );
    assert.match(
      guestMapSource,
      /requestAnimationFrame\(\(\) => \{[\s\S]*routeInputRefs\.current\.get\(stopId\)\?\.focus\(\)/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /onAnimationStarted|animateRouteSheet\([\s\S]{0,80}undefined,[\s\S]{0,80}scheduleRouteStopInputFocus/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /pendingInputFocusRecoveryRef|Keyboard\.isVisible\(\)|input\?\.blur\(\)/,
    );
    assert.match(
      guestMapSource,
      /function RouteStopInput[\s\S]*<Pressable[\s\S]*onPress=\{focusNativeInput\}[\s\S]*<BottomSheetTextInput[\s\S]*showSoftInputOnFocus/,
    );
  });

  it('keeps search-stage content stable instead of crossfading conditional trees', () => {
    assert.match(
      guestMapSource,
      /const locationSearchOwnerRef = useRef<string \| null>\(null\)/,
    );
    assert.match(
      guestMapSource,
      /inputChanged \|\|[\s\S]*normalizedQuery\.length < GUEST_LOCATION_SEARCH_MIN_LENGTH[\s\S]*setLocationSearchResults\(\[\]\)/,
    );
    assert.match(
      guestMapSource,
      /locationSearchResultsQuery !== activeLocationSearchQuery[\s\S]*resultsDisabled=\{locationSearchResultsDisabled\}/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /searchStageProgress|animateSearchStageContent|translateY: searchStageProgress/,
    );
    assert.match(
      guestMapSource,
      /function LocationSearchResults[\s\S]*<View[\s\S]*testID=\{uiTestIds\.guestMapSearchResults\}/,
    );
  });

  it('lets the bottom sheet own interactive keyboard movement', () => {
    assert.match(
      bottomSheetSource,
      /keyboardBehavior="interactive"[\s\S]*keyboardBlurBehavior="restore"/,
    );
    assert.match(guestMapSource, /<BottomSheetTextInput/);
    assert.doesNotMatch(
      guestMapSource,
      /useKeyboardTranslateY|keyboardTranslateY|KeyboardAvoidingView/,
    );
  });

  it('keeps the native map mounted while route and search state changes', () => {
    assert.match(
      guestMapSource,
      /const mapRenderSessionKey = `guest-map-\$\{nativeMapType\}`/,
    );
    assert.doesNotMatch(
      guestMapSource,
      /const mapRenderSessionKey[\s\S]{0,120}routeCollectionRevision/,
    );
    assert.match(
      guestMapSource,
      /routeCollectionRevision,[\s\S]*routeFitBottomPadding/,
    );
  });
});
