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
  const mapDetailCallout = readFileSync(
    join(process.cwd(), 'src/features/live-map/LiveMapRiskDetailCallout.tsx'),
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
      /const searchStageActive = Boolean\(activeInput\);[\s\S]*const showRouteFooter =[\s\S]*!searchStageActive/,
    );
    assert.match(
      screen,
      /\{!searchStageActive \? \(\s*<Pressable[\s\S]*testID=\{uiTestIds\.guestMapAddWaypoint\}/,
    );
    assert.match(
      screen,
      /configureNextSafeRouteLayoutAnimation\(duration, options\)[\s\S]*GUEST_SEARCH_STAGE_TRANSITION_MS/,
    );
    assert.match(
      screen,
      /useKeyboardTranslateY\(\{[\s\S]*reduceMotionEnabled[\s\S]*viewportHeight: viewport\.height/,
    );
    assert.match(
      screen,
      /duration=\{GUEST_SEARCH_STAGE_TRANSITION_MS\}[\s\S]*testID=\{uiTestIds\.guestMapSearchResults\}[\s\S]*variant="scrim"/,
    );
    assert.doesNotMatch(
      screen,
      /replayKey=\{`\$\{pending\}:\$\{message\}:\$\{results\.length\}:\$\{shortcuts\.length\}`\}/,
    );
    assert.match(
      screen,
      /\{showRouteFooter \? \([\s\S]*\(routeChoicesOpen \|\| routePlan\)[\s\S]*Choose a travel mode[\s\S]*Tap a mode to plot its route immediately\.[\s\S]*<TravelModeSelector/,
    );
    assert.match(
      screen,
      /plotTravelMode[\s\S]*setTravelMode\(nextMode\)[\s\S]*handlePlotRoute\(nextMode\)[\s\S]*handlePlotRouteAction[\s\S]*plotTravelMode\(travelMode\)[\s\S]*handleTravelModeChange[\s\S]*plotTravelMode\(nextMode\)/,
    );
    assert.match(
      screen,
      /Tap a mode to plot its route immediately\.[\s\S]*<TravelModeSelector/,
    );
    assert.match(
      screen,
      /\(routeChoicesOpen \|\| routePlan\)[\s\S]*Plot another travel mode/,
    );
    assert.match(
      screen,
      /reopenRouteModeChoices[\s\S]*couldn't plot the \$\{requestedModeLabel\} route[\s\S]*setRouteChoicesOpen\(true\)/,
    );
    assert.match(
      screen,
      /accessibilityLabel=\{option\.accessibilityLabel\}[\s\S]*accessibilityRole="button"[\s\S]*onPress=\{onPress\}/,
    );
    assert.equal(
      (screen.match(/testID=\{uiTestIds\.guestMapAddWaypoint\}/g) || []).length,
      1,
    );
    assert.match(
      screen,
      /<KeyboardAvoidingView[\s\S]*behavior="height"[\s\S]*enabled=\{Platform\.OS !== 'ios'\}/,
    );
    assert.match(
      screen,
      /styles\.sheetDock[\s\S]*transform: \[\{ translateY: keyboardTranslateY \}\]/,
    );
    assert.match(screen, /styles\.sheetKeyboardCornerFill/);
    assert.match(
      styles,
      /sheetKeyboardCornerFill:[\s\S]*bottom: -28[\s\S]*backgroundColor: colors\.sheet/,
    );
    assert.match(
      styles,
      /searchResults:[\s\S]*maxHeight: 280[\s\S]*marginTop: spacing\.sm[\s\S]*marginBottom: spacing\.sm/,
    );
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
    assert.match(screen, /!selectedRiskZone && !mapAction && sheetCollapsed/);
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
    const plottedRouteIndex = screen.indexOf(
      'coordinates={routePlan.route.coordinates}',
    );
    const currentLocationMarkerIndex = screen.indexOf(
      'testID={uiTestIds.guestMapCurrentLocationMarker}',
    );

    assert.match(screen, /useDeviceHeading\(permissionStatus === 'granted'\)/);
    assert.match(deviceHeadingHook, /Location\.watchHeadingAsync\(/);
    assert.match(deviceHeadingHook, /subscription\?\.remove\(\)/);
    assert.match(screen, /showsUserLocation=\{false\}/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapCurrentLocationMarker\}/);
    assert.match(screen, /currentLocationVisible && liveCoordinate \? \(/);
    assert.match(
      screen,
      /liveCoordinate && isCurrentLocationLabel\(origin\)[\s\S]*fitToCoordinates\(routeFitCoordinates/,
    );
    assert.match(screen, /title="Current location"[\s\S]*zIndex=\{100\}/);
    assert.ok(currentLocationMarkerIndex > plottedRouteIndex);
    assert.match(screen, /onRegionChangeComplete=\{handleMapRegionChangeComplete\}/);
    assert.doesNotMatch(screen, /deviceHeadingScreenRotation|currentLocationDirectionBorder|currentLocationDirectionFill/);
    assert.match(screen, /createDeviceHeadingAccessibilityLabel\(deviceHeadingDegrees\)/);
    assert.match(styles, /currentLocationDot:[\s\S]*backgroundColor: colors\.appleBlue/);
    assert.match(styles, /currentLocationHalo:[\s\S]*rgba\(10, 132, 255, 0\.25\)/);
  });

  it('keeps route plotting available while workspace selection protects scoped work', () => {
    const routeGate = screen.slice(
      screen.indexOf('const routeRequestContextDisabled ='),
      screen.indexOf('const mapSelectionSetsDestination ='),
    );
    assert.doesNotMatch(
      routeGate,
      /workspaceSelectionPending|workspaceSelectionRequired|workspaceAuthorizationRequired/,
    );
    assert.match(
      screen,
      /riskAreaAuthorizationRequired =[\s\S]*workspaceSelectionPending/,
    );
    assert.match(
      screen,
      /refreshEnabled:[\s\S]*online &&[\s\S]*!workspaceSelectionPending/,
    );
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
    assert.match(screen, /createGuestMapSheetLayout\([\s\S]*viewport\.height/);
    assert.match(screen, /animatedIndex=\{routeSheetAnimatedIndex\}/);
    assert.match(screen, /index=\{mapSheetLayout\.collapsedIndex\}/);
    assert.doesNotMatch(screen, /index=\{-1\}|routeSheetRef\.current\?\.close\(\)/);
    assert.match(
      screen,
      /handleCollapsedLocationSearch[\s\S]*transitionActiveInput\(nextStopId\)[\s\S]*animateRouteSheet\([\s\S]*scheduleRouteStopInputFocus\(nextStopId\)/,
    );
    assert.match(screen, /animateRouteSheet[\s\S]*snapToIndex\(mapSheetLayout\.plannerIndex\)/);
    assert.match(screen, /styles\.persistentCollapsedContent/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapCollapsedSheet\}/);
    assert.match(screen, /onLongPress=\{\(event\) => handleMapLongPress/);
    assert.match(screen, /testID=\{uiTestIds\.guestMapLongPressMenu\}/);
    assert.match(
      screen,
      /<LiveMapDetailContent[\s\S]*testID=\{uiTestIds\.guestMapLongPressMenu\}/,
    );
    assert.match(
      mapDetailCallout,
      /<LiveMapDetailCallout[\s\S]*testID=\{uiTestIds\.liveMapRiskDetail\}/,
    );
    assert.match(screen, /!selectedRiskZone && !mapAction && !sheetCollapsed/);
    assert.doesNotMatch(styles, /mapActionMenu:/);
    assert.match(styles, /mapActionIconTile:[\s\S]*backgroundColor: colors\.appleBlueSoft/);
    assert.match(screen, />Add stop<\/Text>/);
    assert.match(screen, /Add risk area/);
    assert.match(screen, /handleMapLongPress[\s\S]*snapToIndex\(mapSheetLayout\.detailCompactIndex\)/);
    assert.match(screen, /handleSelectRiskZone[\s\S]*snapToIndex\(mapSheetLayout\.detailCompactIndex\)/);
    assert.doesNotMatch(screen, /Ionicons|MaterialIcons|FontAwesome/);
  });

  it('keeps a plotted route start action available while location search is open', () => {
    assert.match(
      screen,
      /const showRouteFooter =\s*routePlotted \|\|[\s\S]*!searchStageActive/,
    );
    assert.match(
      screen,
      /!searchStageActive && routePlan && routeAlternatives\.length > 1/,
    );
    assert.match(
      screen,
      /showRouteFooter \? \([\s\S]*testID=\{uiTestIds\.guestMapPlotAction\}[\s\S]*onPress=\{routePlan \? handleOpenPreview : handlePlotRouteAction\}/,
    );
    assert.match(
      screen,
      /const handleCollapsedRouteEdit =[\s\S]*animateRouteSheet\(false\)/,
    );
    assert.match(
      screen,
      /routePlan \? \([\s\S]*Route ready[\s\S]*testID=\{uiTestIds\.guestMapCollapsedStartRoute\}[\s\S]*onPress=\{handleOpenPreview\}/,
    );
    assert.match(
      screen,
      /testID=\{uiTestIds\.guestMapCollapsedCancelRoute\}[\s\S]*onPress=\{handleCancelReadyRoute\}[\s\S]*>Cancel<\/Text>/,
    );
    assert.match(
      screen,
      /const handleCancelReadyRoute = \(\) => \{[\s\S]*cancelRoadRouteUpgrade\(\);[\s\S]*setRoutePlan\(null\);[\s\S]*setRouteAlternatives\(\[\]\);[\s\S]*transitionActiveInput\(null\);[\s\S]*animateRouteSheet\(false\);/,
    );
    const cancelReadyRouteStart = screen.indexOf('const handleCancelReadyRoute =');
    const cancelReadyRouteEnd = screen.indexOf('\n  };', cancelReadyRouteStart);
    const cancelReadyRouteHandler = screen.slice(
      cancelReadyRouteStart,
      cancelReadyRouteEnd,
    );
    assert.doesNotMatch(cancelReadyRouteHandler, /dispatchRouteDraft|createGuestRouteDraft/);
    assert.match(
      screen,
      /testID=\{uiTestIds\.guestMapCollapsedStartRoute\}[\s\S]*\{collapsedRouteActionLabel\}/,
    );
    assert.match(
      screen,
      /setRoutePreviewHandoffPending\(true\);[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*openRoutePreviewWithReturnState\(routePlan\)/,
    );
    assert.match(
      screen,
      /const stagedRouteActionBusy =[\s\S]*routePreviewHandoffPending/,
    );
    assert.match(
      styles,
      /collapsedRouteStartButton:[\s\S]*width:\s*88[\s\S]*minHeight:\s*44[\s\S]*backgroundColor:\s*colors\.appleBlueSoft/,
    );
    assert.match(styles, /collapsedRouteReadyIcon:[\s\S]*backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(
      screen,
      /resolveGuestCollapsedRouteCardState\(\{[\s\S]*roadPreviewPending,[\s\S]*routePlotted,[\s\S]*\}\)/,
    );
    assert.match(
      screen,
      /styles\.persistentCollapsedContent[\s\S]*collapsedRouteCardState === 'finding'[\s\S]*guestMapCollapsedRouteStatus[\s\S]*`Finding \$\{travelModeRouteLabel\} route`/,
    );
    assert.match(
      screen,
      /guestMapCollapsedStartRoute[\s\S]*<Navigation[\s\S]*\{stagedRouteActionLabel\}/,
    );
    assert.match(
      styles,
      /collapsedSheetButton:[\s\S]*(?:height|minHeight):\s*60[\s\S]*collapsedRouteActions:[\s\S]*minHeight:\s*60[\s\S]*collapsedRouteStatus:[\s\S]*(?:height|minHeight):\s*60/,
    );
    assert.match(
      styles,
      /currentLocationControlDock:[\s\S]*bottom:\s*chrome\.screenBottomInset \+ 76 \+ spacing\.sm \+ 46 \+ spacing\.sm/,
    );
  });

  it('keeps plotting stable and collapses only after verified routing succeeds', () => {
    const plotStart = screen.indexOf('const handlePlotRoute = async (');
    const roadUpgradeStart = screen.indexOf(
      'const upgradeGuestRouteWithRoadPreview =',
      plotStart,
    );
    const plotHandler = screen.slice(plotStart, roadUpgradeStart);

    assert.doesNotMatch(
      plotHandler,
      /animateRouteSheet\(true\)/,
    );
    assert.match(
      screen,
      /!acceptedRoadPreview && !sessionExpiryHandled && !workspaceUnavailableHandled[\s\S]*showRoutePlotFailure\(localRoutePlan\.travelMode \?\? 'drive'\)/,
    );
    const upgradeEnd = screen.indexOf('const handleOpenPreview =', roadUpgradeStart);
    const upgradeHandler = screen.slice(roadUpgradeStart, upgradeEnd);
    const publishStart = upgradeHandler.indexOf('const publishRoadPreview =');
    const fetcherStart = upgradeHandler.indexOf('const routePreviewFetcher =');
    const publishHandler = upgradeHandler.slice(publishStart, fetcherStart);
    assert.match(
      publishHandler,
      /setRoutePlan\(roadRoutePlan\)[\s\S]*animateRouteSheet\(true\)/,
    );
    assert.equal(upgradeHandler.match(/routePreviewFetcher\(\{/g)?.length, 1);
    assert.doesNotMatch(
      upgradeHandler,
      /fetchAreaRiskAlongRoute|buildRouteOptionAvoidRectangles|avoidRectangles/,
    );
    assert.match(
      screen,
      /\.catch\(\(error\) => \{[\s\S]*handleRouteSessionExpiry\(error\)[\s\S]*handleRouteWorkspaceUnavailable\(error\)[\s\S]*finalizer fails closed/,
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
    assert.match(screen, /renderedRiskZones\.map\(\(zone\) => \(/);
    assert.match(screen, /routeCoordinates=\{routeMapCoordinates\}/);
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
      /resolveGuestRouteDraftNextStopInputId\(routeDraft\)[\s\S]*transitionActiveInput\(nextStopId\)[\s\S]*animateRouteSheet\([\s\S]*false[\s\S]*scheduleRouteStopInputFocus\(nextStopId\)/
    );
    assert.match(screen, /routeInputRefs\.current\.get\(stopId\)\?\.focus\(\)/);
    assert.doesNotMatch(screen, />Expand<\/Text>/);
  });
});
