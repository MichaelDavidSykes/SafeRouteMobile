import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('guest map interaction contract', () => {
  const screen = readFileSync(
    join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
    'utf8'
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/features/guest-map/GuestMapScreen.styles.ts'),
    'utf8'
  );
  const deviceHeadingHook = readFileSync(
    join(process.cwd(), 'src/features/maps/useDeviceHeading.ts'),
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

  it('allocates one immutable identity per plot and preserves it through road snapping', () => {
    assert.match(
      screen,
      /const routePlanId = createGuestRoutePlanId\(\);[\s\S]*createGuestRoutePlan\(\{[\s\S]*planId: routePlanId/,
    );
    assert.match(
      screen,
      /createGuestRoadSnappedRoutePlan\(\{[\s\S]*planId: localRoutePlan\.id/,
    );
    assert.equal(
      (screen.match(/createGuestRoutePlanId\(\)/g) || []).length,
      1,
    );
  });

  it('offers an accessible current-location control above either route sheet state', () => {
    assert.match(screen, /testID=\{uiTestIds\.guestMapCurrentLocation\}/);
    assert.match(screen, /accessibilityLabel=\{[\s\S]*Center map on current location/);
    assert.match(screen, /disabled=\{!mapReady \|\| !liveCoordinate\}/);
    assert.match(
      screen,
      /currentLocationControlBottom = sheetProgress\.interpolate\([\s\S]*routeSheetHeight[\s\S]*64 \+ routeSheetBottomMargin/,
    );
    assert.match(
      screen,
      /handleCenterCurrentLocation[\s\S]*!mapReady \|\| !liveCoordinate[\s\S]*userMovedMapRef\.current = false[\s\S]*animateCamera\([\s\S]*center: liveCoordinate/,
    );
    assert.match(styles, /currentLocationButton:[\s\S]*width: controlSizes\.icon[\s\S]*height: controlSizes\.icon/);
    assert.match(styles, /currentLocationGlyphRing:[\s\S]*borderColor: colors\.appleBlue/);
    assert.doesNotMatch(screen, /Ionicons|MaterialIcons|FontAwesome/);
  });

  it('shows a compass-backed facing direction at the live map coordinate', () => {
    assert.match(screen, /useDeviceHeading\(permissionStatus === 'granted'\)/);
    assert.match(deviceHeadingHook, /Location\.watchHeadingAsync\(/);
    assert.match(deviceHeadingHook, /subscription\?\.remove\(\)/);
    assert.match(screen, /showsUserLocation=\{false\}/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapCurrentLocationMarker\}/);
    assert.match(
      screen,
      /resolveDeviceHeadingScreenRotation\([\s\S]*deviceHeadingDegrees[\s\S]*mapCameraHeadingDegrees/,
    );
    assert.match(screen, /onRegionChangeComplete=\{handleMapRegionChangeComplete\}/);
    assert.match(screen, /rotate: `\$\{deviceHeadingScreenRotation\}deg`/);
    assert.doesNotMatch(screen, /rotation=\{deviceHeadingDegrees/);
    assert.match(
      screen,
      /deviceHeadingDegrees !== null[\s\S]*currentLocationDirectionBorder[\s\S]*currentLocationDirectionFill/,
    );
    assert.match(screen, /createDeviceHeadingAccessibilityLabel\(deviceHeadingDegrees\)/);
    assert.match(styles, /currentLocationDot:[\s\S]*backgroundColor: colors\.appleBlue/);
    assert.match(styles, /currentLocationDirectionFill:[\s\S]*borderBottomColor: colors\.appleBlue/);
  });

  it('keeps the source map intact and blocks protected work while workspace selection saves', () => {
    assert.match(
      screen,
      /routeActionDisabled =[\s\S]*workspaceSelectionPending[\s\S]*workspaceSelectionRequired/,
    );
    assert.match(
      screen,
      /riskAreaAuthorizationRequired =[\s\S]*workspaceSelectionPending/,
    );
    assert.match(
      screen,
      /enabled:[\s\S]*online &&[\s\S]*!workspaceSelectionPending/,
    );
    assert.match(screen, /Saving workspace…/);
    assert.match(screen, /Wait while the workspace choice is saved/);
    assert.match(screen, /Wait while SafeRoute verifies workspace access/);
    assert.match(screen, /switchingDisabled = switchDisabled \|\| selectionPending \|\| loading/);
    assert.match(screen, /busy: loading \|\| selectionPending/);
    assert.match(screen, /Checking…/);
    assert.match(screen, /Try again/);
    assert.match(
      screen,
      /workspaceAlternativeSelectionPending &&[\s\S]*availableWorkspaces\.length > 0[\s\S]*Keyboard\.dismiss\(\)[\s\S]*sheetGestureActionRef\.current\(false\)[\s\S]*setWorkspaceMenuOpen\(true\)/,
    );
    assert.match(
      screen,
      /alternativeSelectionPending[\s\S]*menuOpen[\s\S]*'Closes the workspace menu\.'[\s\S]*'Opens the workspace menu to choose another workspace\. Selecting the current workspace keeps it\.'/,
    );
    assert.match(
      screen,
      /alternativeSelectionPending[\s\S]*menuOpen \? 'Close' : 'Choose'[\s\S]*selectionFailed[\s\S]*'Try again'/,
    );
    assert.match(
      screen,
      /workspace\.id === routingClientId[\s\S]*!workspaceSelectionFailed &&[\s\S]*!workspaceAlternativeSelectionPending[\s\S]*onWorkspaceChange\?\.\(workspace\)/,
    );
    assert.match(
      screen,
      /useEffect\(\(\) => \{[\s\S]*workspaceSelectionPending[\s\S]*setWorkspaceMenuOpen\(false\)/,
    );
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

  it('offers bounded authenticated research separately from passive reloads', () => {
    assert.match(screen, /viewportRisk\.researchAvailable/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapRiskResearch\}/);
    assert.match(screen, /onPress=\{viewportRisk\.research\}/);
    assert.match(screen, /Research this area for updated risk intelligence/);
    assert.match(screen, /No current risks · Research/);
    assert.match(screen, /Risks current · Research/);
    assert.match(screen, /:\s*'Research risks'/);
    assert.match(screen, /Check risks/);
    assert.match(screen, /Research cooling down/);
    assert.match(screen, /Coverage unavailable/);
    assert.match(screen, /viewportRisk\.coverageState === 'pending'/);
    assert.match(screen, /accessibilityLiveRegion="polite"/);
  });

  it('renders route-preview alerts together with viewport risk intelligence', () => {
    assert.match(
      screen,
      /const visibleRiskZones = useMemo\([\s\S]*mergeRiskZonesById\([\s\S]*viewportRisk\.zones[\s\S]*routePlan\?\.riskZones \|\| \[\]/,
    );
    assert.match(screen, /visibleRiskZones\.map\(\(zone\) => \(/);
    assert.match(screen, /routeCoordinates=\{routePlan\?\.route\.coordinates\}/);
    assert.match(
      screen,
      /selectedRiskZone &&[\s\S]*!visibleRiskZones\.some\(\(zone\) => zone\.id === selectedRiskZone\.id\)/,
    );
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
