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
    assert.match(
      screen,
      /<View style=\{styles\.inputStack\}>[\s\S]*testID=\{uiTestIds\.guestMapAddWaypoint\}[\s\S]*<\/ScrollView>\s*<View style=\{styles\.sheetFooter\}>[\s\S]*<TravelModeSelector/,
    );
    assert.equal(
      (screen.match(/testID=\{uiTestIds\.guestMapAddWaypoint\}/g) || []).length,
      1,
    );
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
      /createGuestRoadSnappedRoutePlan\(\{[\s\S]*planId: index === 0[\s\S]*localRoutePlan\.id/,
    );
    assert.match(screen, /`\$\{localRoutePlan\.id\}-alternative-\$\{index\}`/);
    assert.equal(
      (screen.match(/createGuestRoutePlanId\(\)/g) || []).length,
      1,
    );
  });

  it('offers an accessible current-location FAB only when map chrome is clear', () => {
    assert.match(screen, /testID=\{uiTestIds\.guestMapCurrentLocation\}/);
    assert.match(screen, /accessibilityLabel=\{[\s\S]*Center map on current location/);
    assert.match(screen, /disabled=\{!mapReady \|\| !liveCoordinate\}/);
    assert.match(screen, /sheetCollapsed && !selectedRiskZone/);
    assert.doesNotMatch(screen, /currentLocationControlBottom = sheetProgress\.interpolate/);
    assert.match(
      screen,
      /handleCenterCurrentLocation[\s\S]*!mapReady \|\| !liveCoordinate[\s\S]*userMovedMapRef\.current = false[\s\S]*animateCamera\([\s\S]*center: liveCoordinate, heading: 0, pitch: 0/,
    );
    assert.match(styles, /currentLocationButton:[\s\S]*width: 46[\s\S]*height: 46/);
    assert.match(screen, /<Crosshair/);
    assert.doesNotMatch(screen, /Ionicons|MaterialIcons|FontAwesome/);
  });

  it('shows the handoff blue location dot without a directional triangle', () => {
    assert.match(screen, /useDeviceHeading\(permissionStatus === 'granted'\)/);
    assert.match(deviceHeadingHook, /Location\.watchHeadingAsync\(/);
    assert.match(deviceHeadingHook, /subscription\?\.remove\(\)/);
    assert.match(screen, /showsUserLocation=\{false\}/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapCurrentLocationMarker\}/);
    assert.match(screen, /onRegionChangeComplete=\{handleMapRegionChangeComplete\}/);
    assert.doesNotMatch(screen, /deviceHeadingScreenRotation|currentLocationDirectionBorder|currentLocationDirectionFill/);
    assert.match(screen, /createDeviceHeadingAccessibilityLabel\(deviceHeadingDegrees\)/);
    assert.match(styles, /currentLocationDot:[\s\S]*backgroundColor: colors\.appleBlue/);
    assert.match(styles, /currentLocationHalo:[\s\S]*rgba\(10, 132, 255, 0\.25\)/);
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
    assert.match(screen, /resolveGuestRouteSheetHeight\(viewport\.height\)/);
    assert.doesNotMatch(screen, /viewport\.height\s*-\s*72/);
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

  it('collapses accepted route plots and reopens only when road routing fails', () => {
    const plotStart = screen.indexOf('const handlePlotRoute = async () => {');
    const roadUpgradeStart = screen.indexOf(
      'const upgradeGuestRouteWithRoadPreview =',
      plotStart,
    );
    const plotHandler = screen.slice(plotStart, roadUpgradeStart);

    assert.match(
      plotHandler,
      /createGuestRoutePlan\([\s\S]*animateRouteSheet\(true\)[\s\S]*upgradeGuestRouteWithRoadPreview\(localRoutePlan\)/,
    );
    assert.ok(
      plotHandler.indexOf('if (unresolvedStopIds.length)') <
        plotHandler.indexOf('animateRouteSheet(true)'),
    );
    assert.match(
      screen,
      /!acceptedRoadPreview && !sessionExpiryHandled && !workspaceUnavailableHandled[\s\S]*setRouteMessage\('A road-snapped safe route is unavailable\. Retry in a moment\.'\);[\s\S]*animateRouteSheet\(false\)/,
    );
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
    assert.match(screen, /viewportRisk\.coverageState === 'partial'/);
    assert.match(screen, /Broad risks excluded/);
    assert.match(screen, /accessibilityLiveRegion="polite"/);
  });

  it('renders route-preview alerts together with viewport risk intelligence', () => {
    assert.match(
      screen,
      /const visibleRiskZones = useMemo\([\s\S]*mergeRiskZonesById\([\s\S]*viewportRisk\.zones[\s\S]*routePlan\?\.riskZones \|\| \[\]/,
    );
    assert.match(screen, /visibleRiskZones\.map\(\(zone\) => \(/);
    assert.match(screen, /routeCoordinates=\{routePlan\?\.route\.coordinates\}/);
    assert.doesNotMatch(
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
