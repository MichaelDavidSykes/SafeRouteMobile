import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_ROUTE_INTELLIGENCE_VISIBLE,
  LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH,
  LIVE_ROUTE_STATUS_LABEL_MAX_LENGTH,
  LIVE_ROUTE_TITLE_MAX_LENGTH,
  ROUTE_START_PROXIMITY_THRESHOLD_METERS,
  activeGuidanceAuthorizationNotice,
  createLiveLocationNoticePresentation,
  createRouteEndpointLinePresentation,
  createRouteHeaderPresentation,
  createRouteTitleAccessibilityLabel,
  createRouteTitleDisplayText,
  liveLocationNotice,
  mapControlAccessibility,
  mapControlDisplayLabel,
  primaryRouteActionAccessibility,
  resolveNavigationStatusNotice,
  resolveVisibleMapControls,
  routeStartBlockedReason,
  routeStartLocationDecision,
  routeStartProximityBlockedReason,
  routeStatusPillPresentation,
  shouldShowNativeUserLocation,
  shouldShowDriveAlongControl,
  shouldShowGuidanceCard,
  shouldShowRouteIntelligenceControl,
  shouldUseCompactRouteHeader,
  shouldUseMinimalActiveRouteHeader,
  workspaceGuidanceStartBlockedReason
} from '../src/features/live-map/liveMapUiState';

describe('live map UI state helpers', () => {
  it('labels fresh workspace guidance gates without implying a completed check', () => {
    assert.equal(
      workspaceGuidanceStartBlockedReason({
        checking: true,
        fresh: false,
        navigationState: 'loaded',
        unavailable: false,
        workspaceScoped: true
      }),
      'Checking workspace access before starting guidance…'
    );
    assert.equal(
      workspaceGuidanceStartBlockedReason({
        checking: false,
        fresh: false,
        navigationState: 'stopped',
        unavailable: true,
        workspaceScoped: true
      }),
      'Workspace access is unavailable. Return to the map to retry before starting guidance.'
    );
    for (const options of [
      { checking: false, fresh: true, navigationState: 'loaded' as const, unavailable: false, workspaceScoped: true },
      { checking: true, fresh: false, navigationState: 'navigating' as const, unavailable: false, workspaceScoped: true },
      { checking: true, fresh: false, navigationState: 'loaded' as const, unavailable: false, workspaceScoped: false }
    ]) {
      assert.equal(workspaceGuidanceStartBlockedReason(options), null);
    }
  });

  it('shows non-blocking foreground authorization status only for current workspace guidance', () => {
    assert.equal(
      activeGuidanceAuthorizationNotice({
        checking: true,
        navigationState: 'paused',
        unavailable: false,
        workspaceScoped: true
      }),
      'Checking current workspace access. Guidance remains available while workspace risk and rerouting updates wait.'
    );
    assert.equal(
      activeGuidanceAuthorizationNotice({
        checking: true,
        navigationState: 'navigating',
        unavailable: false,
        workspaceScoped: true
      }),
      'Checking current workspace access. Guidance remains available while workspace risk and rerouting updates wait.'
    );
    assert.equal(
      activeGuidanceAuthorizationNotice({
        checking: false,
        navigationState: 'paused',
        unavailable: true,
        workspaceScoped: true
      }),
      'Workspace access could not be verified. Guidance remains available, but workspace risk and rerouting updates are paused.'
    );
    for (const options of [
      { checking: false, navigationState: 'paused' as const, unavailable: false, workspaceScoped: true },
      { checking: true, navigationState: 'loaded' as const, unavailable: false, workspaceScoped: true },
      { checking: true, navigationState: 'paused' as const, unavailable: false, workspaceScoped: false }
    ]) {
      assert.equal(activeGuidanceAuthorizationNotice(options), null);
    }
  });

  it('keeps current route safety status ahead of background authorization status', () => {
    assert.equal(
      resolveNavigationStatusNotice({
        authorizationNotice:
          'Checking current workspace access. Guidance remains available while workspace risk and rerouting updates wait.',
        authorizationPending: false,
        readinessNotice: 'A severe risk now intersects this route.'
      }),
      'A severe risk now intersects this route.'
    );
  });

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
      'Finding your current location before guidance can start.'
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

  it('makes one shared start-location decision without weakening location gates', () => {
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: false,
        locationRequested: false,
        permissionStatus: 'granted',
        routeCoordinateCount: 2
      }),
      { status: 'request-location' }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: false,
        locationRequested: true,
        permissionStatus: 'idle',
        routeCoordinateCount: 2
      }),
      {
        status: 'blocked',
        reason: 'Finding your current location before guidance can start.'
      }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: false,
        locationRequested: false,
        permissionStatus: 'idle',
        routeCoordinateCount: 2
      }),
      { status: 'request-location' }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: false,
        locationRequested: false,
        permissionStatus: 'checking',
        routeCoordinateCount: 2
      }),
      {
        status: 'blocked',
        reason: 'Finding your current location before guidance can start.'
      }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: false,
        locationRequested: false,
        permissionStatus: 'denied',
        routeCoordinateCount: 2
      }),
      {
        status: 'blocked',
        reason: 'Turn on foreground location access to start live guidance.'
      }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: false,
        locationRequested: true,
        permissionStatus: 'granted',
        routeCoordinateCount: 2
      }),
      {
        status: 'blocked',
        reason: 'Finding your current location before guidance can start.'
      }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: true,
        locationRequested: false,
        permissionStatus: 'granted',
        routeCoordinateCount: 2
      }),
      { status: 'ready' }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: false,
        hasLiveCoordinate: false,
        locationRequested: false,
        permissionStatus: 'granted',
        routeCoordinateCount: 1
      }),
      {
        status: 'blocked',
        reason: 'Saved route geometry is incomplete. Re-sync the route before live guidance.'
      }
    );
    assert.deepEqual(
      routeStartLocationDecision({
        demoDriveActive: true,
        hasLiveCoordinate: false,
        locationRequested: false,
        permissionStatus: 'denied',
        routeCoordinateCount: 2
      }),
      { status: 'ready' }
    );
  });

  it('blocks fresh guidance when the live location is away from the route start', () => {
    const routeStart = { latitude: 51.5074, longitude: -0.1278 };

    assert.equal(ROUTE_START_PROXIMITY_THRESHOLD_METERS, 250);
    assert.equal(
      routeStartProximityBlockedReason({
        currentCoordinate: { latitude: 51.508, longitude: -0.1278 },
        routeStartCoordinate: routeStart
      }),
      null
    );
    assert.equal(
      routeStartProximityBlockedReason({
        currentCoordinate: { latitude: 53.4808, longitude: -2.2426 },
        routeStartCoordinate: routeStart
      }),
      'Move within 250 m of the route start before starting guidance.'
    );
    assert.equal(
      routeStartProximityBlockedReason({
        currentCoordinate: null,
        routeStartCoordinate: routeStart
      }),
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
        errorMessage: '',
        hasLiveCoordinate: false,
        locationRequested: false,
        permissionStatus: 'granted'
      }),
      null
    );
    assert.equal(
      liveLocationNotice({
        demoDriveActive: false,
        errorMessage: '',
        hasLiveCoordinate: false,
        locationRequested: true,
        permissionStatus: 'granted'
      }),
      'Finding your current location before guidance can start.'
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
        'Finding your current location before guidance can start.'
      ),
      {
        accessibilityLabel:
          'Location status. Finding your current location before guidance can start.',
        displayText: 'Finding current location'
      }
    );
    assert.deepEqual(
      createLiveLocationNoticePresentation(
        'Move within 250 m of the route start before starting guidance.'
      ),
      {
        accessibilityLabel:
          'Location status. Move within 250 m of the route start before starting guidance.',
        displayText: 'Too far from route start'
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
    assert.deepEqual(
      createLiveLocationNoticePresentation(
        'Checking workspace access before starting guidance…'
      ),
      {
        accessibilityLabel:
          'Access status. Checking workspace access before starting guidance…',
        displayText: 'Checking access'
      }
    );
    assert.deepEqual(
      createLiveLocationNoticePresentation(
        'Workspace access could not be verified. Reconnect and try again.'
      ),
      {
        accessibilityLabel:
          'Access status. Workspace access could not be verified. Reconnect and try again.',
        displayText: 'Retry access'
      }
    );
    assert.deepEqual(
      createLiveLocationNoticePresentation(
        'Workspace access could not be verified. Guidance remains available, but workspace risk and rerouting updates are paused.'
      ),
      {
        accessibilityLabel:
          'Access status. Workspace access could not be verified. Guidance remains available, but workspace risk and rerouting updates are paused.',
        displayText: 'Updates paused'
      }
    );
  });

  it('keeps access retry status coherent with current route readiness', () => {
    assert.equal(
      resolveNavigationStatusNotice({
        authorizationNotice:
          'Checking workspace access before starting guidance…',
        authorizationPending: true,
        readinessNotice: 'Waiting for a live location fix before guidance can start.'
      }),
      'Checking workspace access before starting guidance…'
    );
    assert.equal(
      resolveNavigationStatusNotice({
        authorizationNotice:
          'Workspace access could not be verified. Reconnect and try again.',
        authorizationPending: false,
        readinessNotice: 'A severe risk now intersects this route.'
      }),
      'A severe risk now intersects this route.'
    );
    assert.equal(
      resolveNavigationStatusNotice({
        authorizationNotice:
          'Workspace access could not be verified. Reconnect and try again.',
        authorizationPending: false,
        readinessNotice: null
      }),
      'Workspace access could not be verified. Reconnect and try again.'
    );
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
    assert.deepEqual(mapControlAccessibility('intelligence', { active: false }), {
      label: 'Show route intelligence',
      hint: 'Shows risk areas and route alerts on the map.',
      state: { disabled: false, selected: false }
    });
    assert.deepEqual(mapControlAccessibility('intelligence', { active: true }), {
      label: 'Hide route intelligence',
      hint: 'Hides risk areas and route alerts from the map.',
      state: { disabled: false, selected: true }
    });
  });

  it('keeps map-control visible labels short for compact iPhone map chrome', () => {
    assert.equal(mapControlDisplayLabel('center'), 'Center');
    assert.equal(mapControlDisplayLabel('fit'), 'Overview');
    assert.equal(mapControlDisplayLabel('intelligence'), 'Alerts');
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
      ['fit', 'center']
    );
    assert.deepEqual(
      resolveVisibleMapControls({ routeIntelCount: 3, state: 'off-route' }),
      ['fit', 'center']
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
    assert.deepEqual(
      primaryRouteActionAccessibility(
        'loaded',
        null,
        'Workspace access could not be verified. Reconnect and try again.'
      ),
      {
        label: 'Retry workspace access',
        hint: 'Checks workspace access again before starting route guidance.',
        state: { disabled: false }
      }
    );
    assert.deepEqual(
      primaryRouteActionAccessibility(
        'loaded',
        'Waiting for a live location fix before guidance can start.',
        'Workspace access could not be verified. Reconnect and try again.'
      ),
      {
        label: 'Start route. Waiting for a live location fix before guidance can start.',
        hint: 'Waiting for a live location fix before guidance can start.',
        state: { disabled: true }
      }
    );
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

  it('identifies the route-facing camera lifecycle only during active guidance', () => {
    assert.equal(shouldShowDriveAlongControl('loaded'), false);
    assert.equal(shouldShowDriveAlongControl('paused'), false);
    assert.equal(shouldShowDriveAlongControl('stopped'), false);
    assert.equal(shouldShowDriveAlongControl('arrived'), false);
    assert.equal(shouldShowDriveAlongControl('navigating'), true);
    assert.equal(shouldShowDriveAlongControl('off-route'), true);
  });

  it('keeps route intelligence visible by default', () => {
    assert.equal(DEFAULT_ROUTE_INTELLIGENCE_VISIBLE, true);
  });
});
