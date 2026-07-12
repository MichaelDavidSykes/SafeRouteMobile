import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_ROUTE_INTELLIGENCE_VISIBLE,
  LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH,
  LIVE_ROUTE_STATUS_LABEL_MAX_LENGTH,
  LIVE_ROUTE_TITLE_MAX_LENGTH,
  createLiveLocationNoticePresentation,
  createRouteEndpointLinePresentation,
  createRouteHeaderPresentation,
  createRouteTitleAccessibilityLabel,
  createRouteTitleDisplayText,
  liveLocationNotice,
  mapControlAccessibility,
  mapControlDisplayLabel,
  primaryRouteActionAccessibility,
  resolveVisibleMapControls,
  routeStartBlockedReason,
  routeStatusPillPresentation,
  shouldShowNativeUserLocation,
  shouldShowDriveAlongControl,
  shouldShowGuidanceCard,
  shouldShowRouteIntelligenceControl,
  shouldUseCompactRouteHeader,
  shouldUseMinimalActiveRouteHeader
} from '../src/features/live-map/liveMapUiState';

describe('live map UI state helpers', () => {
  it('blocks starting live guidance until foreground location is ready', () => {
    const incompleteGeometryMessage = 'Saved route geometry is incomplete. Re-sync the route before live guidance.';

    assert.equal(
      routeStartBlockedReason({
        demoDriveActive: true,
        hasLiveCoordinate: false,
        permissionStatus: 'granted',
        routeCoordinateCount: 1
      }),
      incompleteGeometryMessage
    );
    assert.equal(
      routeStartBlockedReason({
        demoDriveActive: false,
        hasLiveCoordinate: true,
        permissionStatus: 'granted',
        routeCoordinateCount: 0
      }),
      incompleteGeometryMessage
    );
    assert.equal(
      routeStartBlockedReason({ demoDriveActive: false, hasLiveCoordinate: false, permissionStatus: 'denied' }),
      'Turn on foreground location access to start live guidance.'
    );
    assert.equal(
      routeStartBlockedReason({ demoDriveActive: false, hasLiveCoordinate: false, permissionStatus: 'idle' }),
      null
    );
    assert.equal(
      routeStartBlockedReason({ demoDriveActive: false, hasLiveCoordinate: false, permissionStatus: 'checking' }),
      'Checking foreground location access before live guidance can start.'
    );
    assert.equal(
      routeStartBlockedReason({ demoDriveActive: false, hasLiveCoordinate: false, permissionStatus: 'granted' }),
      'Waiting for a live location fix before guidance can start.'
    );
    assert.equal(
      routeStartBlockedReason({ demoDriveActive: false, hasLiveCoordinate: true, permissionStatus: 'granted' }),
      null
    );
    assert.equal(
      routeStartBlockedReason({
        demoDriveActive: false,
        hasLiveCoordinate: true,
        permissionStatus: 'granted',
        routeCoordinateCount: 2
      }),
      null
    );
    assert.equal(
      routeStartBlockedReason({ demoDriveActive: true, hasLiveCoordinate: false, permissionStatus: 'denied' }),
      null
    );
  });

  it('shows production-friendly location notices without exposing test controls', () => {
    assert.equal(
      liveLocationNotice({
        demoDriveActive: false,
        errorMessage: '',
        hasLiveCoordinate: false,
        permissionStatus: 'denied'
      }),
      'Location access is off. Enable it in iOS Settings for live route guidance.'
    );
    assert.equal(
      liveLocationNotice({
        demoDriveActive: false,
        errorMessage: '',
        hasLiveCoordinate: false,
        permissionStatus: 'idle'
      }),
      null
    );
    assert.equal(
      liveLocationNotice({
        demoDriveActive: false,
        errorMessage: '  Live location is unavailable right now.  ',
        hasLiveCoordinate: false,
        permissionStatus: 'granted'
      }),
      'Live location is unavailable right now.'
    );
    assert.equal(
      liveLocationNotice({
        demoDriveActive: true,
        errorMessage: 'Location off',
        hasLiveCoordinate: false,
        permissionStatus: 'denied',
        routeCoordinateCount: 1
      }),
      'Saved route geometry is incomplete. Re-sync the route before live guidance.'
    );
    assert.equal(
      liveLocationNotice({
        demoDriveActive: true,
        errorMessage: 'Location off',
        hasLiveCoordinate: false,
        permissionStatus: 'denied'
      }),
      null
    );
  });

  it('condenses location notices for map chrome while preserving VoiceOver detail', () => {
    assert.equal(createLiveLocationNoticePresentation(null), null);
    assert.deepEqual(
      createLiveLocationNoticePresentation(
        'Location access is off. Enable it in iOS Settings for live route guidance.'
      ),
      {
        accessibilityLabel:
          'Location status. Location access is off. Enable it in iOS Settings for live route guidance.',
        displayText: 'Location access off'
      }
    );
    assert.deepEqual(
      createLiveLocationNoticePresentation(
        'Waiting for a live location fix before guidance can start.'
      ),
      {
        accessibilityLabel:
          'Location status. Waiting for a live location fix before guidance can start.',
        displayText: 'Location needed'
      }
    );
    assert.deepEqual(
      createLiveLocationNoticePresentation(
        'Saved route geometry is incomplete. Re-sync the route before live guidance.'
      ),
      {
        accessibilityLabel:
          'Location status. Saved route geometry is incomplete. Re-sync the route before live guidance.',
        displayText: 'Re-sync route'
      }
    );
    assert.deepEqual(
      createLiveLocationNoticePresentation('Live location is unavailable right now.'),
      {
        accessibilityLabel: 'Location status. Live location is unavailable right now.',
        displayText: 'Location unavailable'
      }
    );
    assert.deepEqual(createLiveLocationNoticePresentation('  GPS fix delayed  '), {
      accessibilityLabel: 'Location status. GPS fix delayed.',
      displayText: 'Location unavailable'
    });
    assert.deepEqual(createLiveLocationNoticePresentation('Provider retry pending…'), {
      accessibilityLabel: 'Location status. Provider retry pending…',
      displayText: 'Location unavailable'
    });
  });

  it('keeps route endpoint chrome as one normalized text line', () => {
    assert.deepEqual(
      createRouteEndpointLinePresentation({
        origin: '  North   Gate  ',
        destination: ' Harbor   Depot '
      }),
      {
        accessibilityLabel: 'Route from North Gate to Harbor Depot.',
        displayText: 'North Gate → Harbor Depot'
      }
    );

    assert.deepEqual(
      createRouteEndpointLinePresentation({
        origin: '',
        destination: '   '
      }),
      {
        accessibilityLabel: 'Route from Route start to Destination.',
        displayText: 'Route start → Destination'
      }
    );

    assert.deepEqual(
      createRouteEndpointLinePresentation({
        origin: 'North Gate',
        destination: 'Harbor Depot…'
      }),
      {
        accessibilityLabel: 'Route from North Gate to Harbor Depot…',
        displayText: 'North Gate → Harbor Depot…'
      }
    );
  });

  it('bounds live route header labels while preserving full VoiceOver context', () => {
    const longOrigin = 'O'.repeat(60);
    const longDestination = 'D'.repeat(60);
    const longRouteName = 'R'.repeat(90);

    assert.deepEqual(
      createRouteEndpointLinePresentation({
        origin: longOrigin,
        destination: longDestination
      }),
      {
        accessibilityLabel: `Route from ${longOrigin} to ${longDestination}.`,
        displayText: `${'O'.repeat(LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH - 1)}… → ${'D'.repeat(
          LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH - 1
        )}…`
      }
    );

    assert.equal(
      createRouteTitleDisplayText(longRouteName),
      `${'R'.repeat(LIVE_ROUTE_TITLE_MAX_LENGTH - 1)}…`
    );
    assert.equal(createRouteTitleDisplayText('   '), 'Saved route');
    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: '  Eagle   One ',
        name: longRouteName,
        operation: '  Night   Watch '
      }),
      `Route ${longRouteName}. Operation Night Watch. Convoy Eagle One.`
    );
  });

  it('keeps live route header accessibility sentences calm when labels include punctuation', () => {
    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: '  Convoy   Eagle One. ',
        name: ' Embassy transfer. ',
        operation: ' Night Watch? '
      }),
      'Route Embassy transfer. Operation Night Watch? Convoy Eagle One.'
    );
    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: '  Eagle   One! ',
        name: '  ',
        operation: '  '
      }),
      'Route Saved route. Convoy Eagle One!'
    );
    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: '  Provider   convoy… ',
        name: '  River detour… ',
        operation: '  '
      }),
      'Route River detour… Convoy Provider convoy…'
    );
  });

  it('describes text-led map controls for VoiceOver', () => {
    assert.deepEqual(mapControlAccessibility('center', { hasLiveLocation: false }), {
      label: 'Center map on route start',
      hint: 'Moves the map to the saved route start until live location is available.',
      state: { disabled: false }
    });
    assert.deepEqual(mapControlAccessibility('center', { driveAlongActive: true, hasLiveLocation: true }), {
      label: 'Re-center drive-along view',
      hint: 'Returns to the route-facing navigation camera.',
      state: { disabled: false }
    });
    assert.deepEqual(mapControlAccessibility('fit', { driveAlongActive: true }), {
      label: 'Show full route',
      hint: 'Shows the full route and pauses drive-along follow for map review.',
      state: { disabled: false }
    });
    assert.deepEqual(mapControlAccessibility('follow', { active: true }), {
      label: 'Turn follow mode off',
      hint: 'Stops the map from following convoy movement.',
      state: { disabled: false, selected: true }
    });
    assert.deepEqual(mapControlAccessibility('follow', { active: true, driveAlongActive: true }), {
      label: 'Turn drive-along view off',
      hint: 'Stops the map from following the route-facing navigation view.',
      state: { disabled: false, selected: true }
    });
    assert.deepEqual(mapControlAccessibility('follow', { active: false, driveAlongActive: true }), {
      label: 'Turn drive-along view on',
      hint: 'Follows the convoy from a route-facing navigation view.',
      state: { disabled: false, selected: false }
    });
    assert.deepEqual(mapControlAccessibility('follow', { active: false, disabled: true }), {
      label: 'Drive-along starts with guidance',
      hint: 'Start route guidance before changing the drive-along camera.',
      state: { disabled: true, selected: false }
    });
    assert.deepEqual(mapControlAccessibility('intelligence', { active: false }), {
      label: 'Show route risk notes',
      hint: 'Shows risk overlays on the map.',
      state: { disabled: false, selected: false }
    });
    assert.deepEqual(mapControlAccessibility('intelligence', { active: true }), {
      label: 'Hide route risk notes',
      hint: 'Hides risk overlays from the map.',
      state: { disabled: false, selected: true }
    });
    assert.deepEqual(mapControlAccessibility('reroute'), {
      label: 'Reroute from current location',
      hint: 'Finds a new risk-aware route from your current location.',
      state: { disabled: false, selected: false }
    });
    assert.deepEqual(mapControlAccessibility('reroute', { disabled: true }), {
      label: 'Reroute from current location',
      hint: 'A reliable live location is required before rerouting.',
      state: { disabled: true, selected: false }
    });
    assert.deepEqual(mapControlAccessibility('reroute', { active: true, disabled: true }), {
      label: 'Finding a safer route',
      hint: 'A new risk-aware route is being calculated.',
      state: { disabled: true, selected: true }
    });
  });

  it('keeps map-control visible labels short for compact iPhone map chrome', () => {
    assert.equal(mapControlDisplayLabel('center', { hasLiveLocation: false }), 'Start');
    assert.equal(mapControlDisplayLabel('center', { hasLiveLocation: true }), 'Me');
    assert.equal(mapControlDisplayLabel('center', { driveAlongActive: true, hasLiveLocation: true }), 'Me');
    assert.equal(mapControlDisplayLabel('fit'), 'Route');
    assert.equal(mapControlDisplayLabel('follow'), 'Follow');
    assert.equal(mapControlDisplayLabel('follow', { driveAlongActive: true }), 'Drive');
    assert.equal(mapControlDisplayLabel('intelligence'), 'Risk');
    assert.equal(mapControlDisplayLabel('reroute'), 'Reroute');
    assert.equal(mapControlDisplayLabel('reroute', { active: true }), 'Routing');
  });

  it('hides route-intelligence chrome when a route has no overlays', () => {
    assert.equal(shouldShowRouteIntelligenceControl(0), false);
    assert.equal(shouldShowRouteIntelligenceControl(-1), false);
    assert.equal(shouldShowRouteIntelligenceControl(Number.NaN), false);
    assert.equal(shouldShowRouteIntelligenceControl(1), true);
    assert.equal(shouldShowRouteIntelligenceControl(4), true);
  });

  it('keeps active drive-along controls minimal like a navigation app', () => {
    assert.deepEqual(
      resolveVisibleMapControls({ routeIntelCount: 3, state: 'loaded' }),
      ['center', 'fit', 'intelligence']
    );
    assert.deepEqual(
      resolveVisibleMapControls({ routeIntelCount: 0, state: 'loaded' }),
      ['center', 'fit']
    );
    assert.deepEqual(
      resolveVisibleMapControls({ routeIntelCount: 3, state: 'navigating' }),
      ['fit', 'follow', 'reroute']
    );
    assert.deepEqual(
      resolveVisibleMapControls({ routeIntelCount: 3, state: 'off-route' }),
      ['fit', 'follow', 'reroute']
    );
    assert.deepEqual(
      resolveVisibleMapControls({ routeIntelCount: 3, state: 'paused' }),
      ['center', 'fit', 'intelligence']
    );
  });

  it('hides the native user dot during active custom drive-along guidance', () => {
    assert.equal(
      shouldShowNativeUserLocation({
        demoDriveActive: false,
        permissionStatus: 'granted',
        state: 'loaded'
      }),
      true
    );
    assert.equal(
      shouldShowNativeUserLocation({
        demoDriveActive: false,
        permissionStatus: 'granted',
        state: 'navigating'
      }),
      false
    );
    assert.equal(
      shouldShowNativeUserLocation({
        demoDriveActive: false,
        permissionStatus: 'granted',
        state: 'off-route'
      }),
      false
    );
    assert.equal(
      shouldShowNativeUserLocation({
        demoDriveActive: true,
        permissionStatus: 'granted',
        state: 'loaded'
      }),
      false
    );
    assert.equal(
      shouldShowNativeUserLocation({
        demoDriveActive: false,
        permissionStatus: 'denied',
        state: 'loaded'
      }),
      false
    );
  });

  it('builds VoiceOver-friendly route header status copy', () => {
    assert.deepEqual(
      routeStatusPillPresentation({
        state: 'navigating',
        trackingLabel: 'Live GPS'
      }),
      {
        label: 'Live GPS',
        accessibilityLabel: 'Route status: Live GPS.',
        tone: 'live'
      }
    );
    assert.deepEqual(
      routeStatusPillPresentation({
        state: 'navigating',
        trackingLabel: '  Convoy live  '
      }),
      {
        label: 'Convoy live',
        accessibilityLabel: 'Route status: Convoy live.',
        tone: 'live'
      }
    );
    assert.deepEqual(
      routeStatusPillPresentation({
        state: 'off-route',
        trackingLabel: ''
      }),
      {
        label: 'Off route',
        accessibilityLabel: 'Route status: Off route.',
        tone: 'danger'
      }
    );
    assert.equal(
      routeStatusPillPresentation({
        state: 'navigating',
        trackingLabel: '   '
      }).label,
      'Live guidance'
    );
    assert.deepEqual(
      routeStatusPillPresentation({
        state: 'paused',
        trackingLabel: 'GPS live'
      }),
      {
        label: 'Paused',
        accessibilityLabel: 'Route status: Paused.',
        tone: 'demo'
      }
    );
    assert.deepEqual(
      routeStatusPillPresentation({
        state: 'loaded',
        trackingLabel: ''
      }),
      {
        label: 'Ready',
        accessibilityLabel: 'Route status: Ready.',
        tone: 'demo'
      }
    );
    assert.deepEqual(
      routeStatusPillPresentation({
        state: 'stopped',
        trackingLabel: 'GPS live'
      }),
      {
        label: 'Stopped',
        accessibilityLabel: 'Route status: Stopped.',
        tone: 'demo'
      }
    );
    assert.deepEqual(
      routeStatusPillPresentation({
        state: 'navigating',
        trackingLabel: 'GPS pending…'
      }),
      {
        label: 'GPS pending…',
        accessibilityLabel: 'Route status: GPS pending…',
        tone: 'live'
      }
    );
  });

  it('bounds live tracking status pills while preserving full VoiceOver context', () => {
    const trackingLabel = '  Live   GPS connected through extended convoy telemetry  ';
    const presentation = routeStatusPillPresentation({
      state: 'navigating',
      trackingLabel
    });

    assert.equal(presentation.label, 'Live GPS connecte…');
    assert.equal(presentation.label.length, LIVE_ROUTE_STATUS_LABEL_MAX_LENGTH);
    assert.equal(
      presentation.accessibilityLabel,
      'Route status: Live GPS connected through extended convoy telemetry.'
    );
    assert.equal(presentation.tone, 'live');
  });

  it('adds normalized disabled guidance context to primary route action', () => {
    assert.deepEqual(primaryRouteActionAccessibility('loaded', 'Waiting for a live location fix before guidance can start.'), {
      label: 'Start route. Waiting for a live location fix before guidance can start.',
      hint: 'Waiting for a live location fix before guidance can start.',
      state: { disabled: true }
    });
    assert.deepEqual(
      primaryRouteActionAccessibility('loaded', '  Waiting   for a live location fix before guidance can start  '),
      {
        label: 'Start route. Waiting for a live location fix before guidance can start.',
        hint: 'Waiting for a live location fix before guidance can start.',
        state: { disabled: true }
      }
    );
    assert.deepEqual(primaryRouteActionAccessibility('loaded', '   '), {
      label: 'Start route guidance',
      hint: 'Starts live route guidance for this saved route.',
      state: { disabled: false }
    });
    assert.deepEqual(primaryRouteActionAccessibility('navigating'), {
      label: 'Pause route guidance',
      hint: 'Pauses live route guidance for this saved route.',
      state: { disabled: false }
    });
    assert.equal(primaryRouteActionAccessibility('arrived').state.disabled, true);
  });

  it('keeps the current-instruction card for active guidance only', () => {
    assert.equal(shouldShowGuidanceCard('loaded'), false);
    assert.equal(shouldShowGuidanceCard('stopped'), false);
    assert.equal(shouldShowGuidanceCard('navigating'), true);
    assert.equal(shouldShowGuidanceCard('off-route'), true);
    assert.equal(shouldShowGuidanceCard('paused'), true);
    assert.equal(shouldShowGuidanceCard('arrived'), false);
  });

  it('compacts the route header while guidance owns the map', () => {
    assert.equal(shouldUseCompactRouteHeader('loaded'), false);
    assert.equal(shouldUseCompactRouteHeader('stopped'), false);
    assert.equal(shouldUseCompactRouteHeader('arrived'), false);
    assert.equal(shouldUseCompactRouteHeader('paused'), true);
    assert.equal(shouldUseCompactRouteHeader('navigating'), true);
    assert.equal(shouldUseCompactRouteHeader('off-route'), true);

    assert.equal(shouldUseMinimalActiveRouteHeader('loaded'), false);
    assert.equal(shouldUseMinimalActiveRouteHeader('paused'), false);
    assert.equal(shouldUseMinimalActiveRouteHeader('arrived'), false);
    assert.equal(shouldUseMinimalActiveRouteHeader('navigating'), true);
    assert.equal(shouldUseMinimalActiveRouteHeader('off-route'), true);
  });

  it('uses a lightweight single-row route header during active guidance', () => {
    assert.deepEqual(
      createRouteHeaderPresentation({
        state: 'navigating',
        showRouteEndpoints: true,
        showRouteSubtitle: true
      }),
      {
        compactNavigation: true,
        minimalActiveNavigation: true,
        showInlineEndpoints: false,
        showRouteEndpoints: false,
        showRouteSubtitle: false,
        showRouteTitle: false
      }
    );

    assert.deepEqual(
      createRouteHeaderPresentation({
        state: 'paused',
        showRouteEndpoints: true,
        showRouteSubtitle: true
      }),
      {
        compactNavigation: true,
        minimalActiveNavigation: false,
        showInlineEndpoints: false,
        showRouteEndpoints: false,
        showRouteSubtitle: false,
        showRouteTitle: true
      }
    );

    assert.deepEqual(
      createRouteHeaderPresentation({
        state: 'loaded',
        showRouteEndpoints: false,
        showRouteSubtitle: true
      }),
      {
        compactNavigation: false,
        minimalActiveNavigation: false,
        showInlineEndpoints: true,
        showRouteEndpoints: false,
        showRouteSubtitle: false,
        showRouteTitle: true
      }
    );

    assert.deepEqual(
      createRouteHeaderPresentation({
        state: 'paused',
        showRouteEndpoints: true,
        showRouteSubtitle: true
      }),
      {
        compactNavigation: true,
        minimalActiveNavigation: false,
        showInlineEndpoints: false,
        showRouteEndpoints: false,
        showRouteSubtitle: false,
        showRouteTitle: true
      }
    );
  });

  it('keeps route operation and convoy context in the route-title accessibility label', () => {
    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: 'Convoy 12',
        name: 'North Loop',
        operation: 'Market escort'
      }),
      'Route North Loop. Operation Market escort. Convoy 12.'
    );

    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: '   ',
        name: '   ',
        operation: '  Night   check  '
      }),
      'Route Saved route. Operation Night check.'
    );

    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: '  Convoy   Alpha  ',
        name: 'West Loop',
        operation: '  '
      }),
      'Route West Loop. Convoy Alpha.'
    );

    assert.equal(
      createRouteTitleAccessibilityLabel({
        convoyCallsign: 'Night check',
        name: 'South Loop',
        operation: 'Night check'
      }),
      'Route South Loop. Operation Night check.'
    );
  });

  it('only shows the drive-along follow control while route guidance is active', () => {
    assert.equal(shouldShowDriveAlongControl('loaded'), false);
    assert.equal(shouldShowDriveAlongControl('paused'), false);
    assert.equal(shouldShowDriveAlongControl('stopped'), false);
    assert.equal(shouldShowDriveAlongControl('arrived'), false);
    assert.equal(shouldShowDriveAlongControl('navigating'), true);
    assert.equal(shouldShowDriveAlongControl('off-route'), true);
  });

  it('keeps route intelligence collapsed by default for a cleaner map', () => {
    assert.equal(DEFAULT_ROUTE_INTELLIGENCE_VISIBLE, false);
  });
});
