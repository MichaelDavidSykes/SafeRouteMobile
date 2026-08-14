import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUEST_ROUTE_LABEL_MAX_LENGTH,
  GUEST_ROUTE_PLAN_ID_MAX_LENGTH,
  GUEST_ROUTE_PREVIEW_METRIC_MAX_LENGTH,
  GUEST_ROUTE_PREVIEW_SUMMARY_FALLBACK,
  createGuestMapHomeCopy,
  createGuestRoadSnappedRoutePlan,
  createGuestRouteActionState,
  resolveGuestCollapsedRouteCardState,
  createGuestRouteInputCopy,
  createGuestRouteMetrics,
  createGuestRoutePlanId,
  createGuestRoutePlan,
  createGuestRoutePreviewMetricPresentation,
  createGuestRoutePreviewState,
  getGuestFullAccessCopy,
  getGuestMapGateFeatures,
  hasGuestRouteDestination,
  normalizeGuestRouteLabel,
  resolveGuestRoadPreviewStops,
  resolveGuestRouteCoordinates,
  shouldShowGuestMapSubtitle
} from '../src/features/guest-map/guestRoutePlanner';

describe('guest route planner helpers', () => {
  it('keeps map-home state copy minimal before and after sign-in', () => {
    assert.deepEqual(createGuestMapHomeCopy(false), {
      primaryActionAccessibilityLabel: 'Sign in to SafeRoute',
      primaryActionLabel: 'Login',
      sheetTitle: 'Where to?',
      sheetSubtitle: 'Map first. Save after sign-in.'
    });

    assert.deepEqual(createGuestMapHomeCopy(true), {
      primaryActionAccessibilityLabel: 'Open saved routes',
      primaryActionLabel: 'Saved',
      sheetTitle: 'Where to?',
      sheetSubtitle: 'Plot fast or open Saved.'
    });
  });

  it('normalizes blank, padded, and overlong guest route labels', () => {
    assert.equal(normalizeGuestRouteLabel('  Current   location ', 'Fallback'), 'Current location');
    assert.equal(normalizeGuestRouteLabel('  Heathrow\n Terminal\t5 ', 'Fallback'), 'Heathrow Terminal 5');
    assert.equal(normalizeGuestRouteLabel('   ', '  Fallback   point '), 'Fallback point');
    assert.equal(normalizeGuestRouteLabel('   ', ''), '');

    const longLabel = `${'A'.repeat(GUEST_ROUTE_LABEL_MAX_LENGTH)} extra destination detail`;
    const normalized = normalizeGuestRouteLabel(longLabel, 'Fallback');

    assert.equal(normalized.length, GUEST_ROUTE_LABEL_MAX_LENGTH);
    assert.match(normalized, /…$/);
  });

  it('hides the map-home helper subtitle once route context is visible', () => {
    assert.equal(shouldShowGuestMapSubtitle(false), true);
    assert.equal(shouldShowGuestMapSubtitle(true), false);
  });

  it('keeps guest route input accessibility hints concise and state-aware', () => {
    assert.deepEqual(
      createGuestRouteInputCopy({
        field: 'origin',
        routePlotted: false
      }),
      {
        accessibilityHint: 'Edit where the map route starts.',
        accessibilityLabel: 'Route origin',
        placeholder: 'Start point'
      }
    );

    assert.deepEqual(
      createGuestRouteInputCopy({
        field: 'destination',
        routePlotted: false
      }),
      {
        accessibilityHint: 'Enter a destination to unlock route plotting.',
        accessibilityLabel: 'Route destination',
        placeholder: 'Where to?'
      }
    );

    assert.deepEqual(
      createGuestRouteInputCopy({
        field: 'origin',
        routePlotted: true
      }),
      {
        accessibilityHint: 'Changing the start clears the current preview.',
        accessibilityLabel: 'Route origin',
        placeholder: 'Start point'
      }
    );

    assert.deepEqual(
      createGuestRouteInputCopy({
        field: 'destination',
        routePlotted: true
      }),
      {
        accessibilityHint: 'Changing the destination clears the current preview.',
        accessibilityLabel: 'Route destination',
        placeholder: 'Where to?'
      }
    );
  });

  it('keeps local route plotting disabled until a destination is present', () => {
    assert.equal(hasGuestRouteDestination('   '), false);
    assert.equal(hasGuestRouteDestination('  London City Airport '), true);

    assert.deepEqual(
      createGuestRouteActionState({
        destination: '',
        routePlotted: false
      }),
      {
        accessibilityHint: 'Enter a destination before plotting a route on the map.',
        accessibilityLabel: 'Add a destination to plot a route',
        disabled: true,
        label: 'Add destination'
      }
    );

    assert.deepEqual(
      createGuestRouteActionState({
        destination: 'London City Airport',
        routePlotted: true,
        routeVerificationPending: true,
      }),
      {
        accessibilityHint: 'Wait until canonical risk coverage is verified before starting guidance.',
        accessibilityLabel: 'Route to London City Airport is plotted but risk verification is still pending',
        disabled: true,
        label: 'Verifying route',
      },
    );

    assert.deepEqual(
      createGuestRouteActionState({
        destination: '  London   City Airport  ',
        routePlotted: false
      }),
      {
        accessibilityHint: 'Plots a local route to London City Airport on the map.',
        accessibilityLabel: 'Plot local route to London City Airport',
        disabled: false,
        label: 'Plot route'
      }
    );

    assert.deepEqual(
      createGuestRouteActionState({
        destination: 'London City Airport',
        routePlotted: true
      }),
      {
        accessibilityHint: 'Opens this plotted route to London City Airport, ready to start live guidance.',
        accessibilityLabel: 'Open route to London City Airport and start guidance',
        disabled: false,
        label: 'Start route'
      }
    );

    const longDestination = `${'Airport terminal '.repeat(8)}north entrance`;
    const boundedState = createGuestRouteActionState({
      destination: longDestination,
      routePlotted: false
    });

    assert.equal(boundedState.label, 'Plot route');
    assert.ok(boundedState.accessibilityLabel.startsWith('Plot local route to Airport terminal'));
    assert.ok(boundedState.accessibilityLabel.endsWith('…'));
    assert.ok(boundedState.accessibilityLabel.length <= 'Plot local route to '.length + GUEST_ROUTE_LABEL_MAX_LENGTH);
  });

  it('keeps the collapsed route card honest while road routing is in flight', () => {
    assert.equal(
      resolveGuestCollapsedRouteCardState({
        roadPreviewPending: false,
        routePlotted: false,
      }),
      'search',
    );
    assert.equal(
      resolveGuestCollapsedRouteCardState({
        roadPreviewPending: true,
        routePlotted: false,
      }),
      'finding',
    );
    assert.equal(
      resolveGuestCollapsedRouteCardState({
        roadPreviewPending: false,
        routePlotted: true,
      }),
      'ready',
    );
    assert.equal(
      resolveGuestCollapsedRouteCardState({
        roadPreviewPending: true,
        routePlotted: true,
      }),
      'finding',
    );
  });

  it('rejects blank guest destinations before creating local route data', () => {
    assert.throws(
      () => createGuestRoutePlan({ origin: 'HQ', destination: '   ' }),
      /destination is required/i
    );
  });

  it('creates a bounded opaque identity for every explicit plot', () => {
    const first = createGuestRoutePlanId(1_800_000_000_000, 0.1);
    const second = createGuestRoutePlanId(1_800_000_000_000, 0.2);

    assert.match(first, /^guest-plot-/);
    assert.ok(first.length <= GUEST_ROUTE_PLAN_ID_MAX_LENGTH);
    assert.notEqual(first, second);
  });

  it('preserves one plot identity from local scaffold to road preview', () => {
    const planId = createGuestRoutePlanId(1_800_000_000_000, 0.3);
    const local = createGuestRoutePlan({
      destination: 'Airport Terminal',
      origin: 'HQ',
      planId,
    });
    const road = createGuestRoadSnappedRoutePlan({
      destination: local.destination,
      origin: local.origin,
      planId: local.id,
      riskZones: [],
      roadSnappedCoordinates: local.route.coordinates,
    });

    assert.ok(road);
    assert.equal(local.id, planId);
    assert.equal(local.route.id, `${planId}-path`);
    assert.equal(road.id, local.id);
    assert.equal(road.route.id, local.route.id);
  });

  it('creates a local unsaved route preview without authentication data', () => {
    const route = createGuestRoutePlan({
      origin: '  HQ  ',
      destination: '  Airport Terminal  '
    });

    assert.equal(route.origin, 'HQ');
    assert.equal(route.destination, 'Airport Terminal');
    assert.equal(route.name, 'Route preview');
    assert.equal(route.operation, 'Unsaved route');
    assert.equal(route.convoyCallsign, 'Guest mode');
    assert.equal(route.route.coordinates.length >= 2, true);
    assert.deepEqual(createGuestRouteMetrics(route.route.coordinates), {
      distance: '9.4 km',
      eta: '24 min'
    });
    assert.equal(route.route.distance, '9.4 km');
    assert.equal(route.route.eta, '24 min');
    assert.equal(route.riskZones.length, 3);
    assert.equal(route.checkpoints.length, 2);
    assert.equal(route.route.description, 'Local preview. Sign in to save.');
    assert.equal(route.route.nextInstruction, 'Review the route, then sign in to save it.');
    assert.equal(route.route.nextDistance, 'Preview');
  });

  it('uses selected real-world endpoints instead of London preview geometry', () => {
    const originCoordinate = { latitude: -33.9249, longitude: 18.4241 };
    const destinationCoordinate = { latitude: -33.9696, longitude: 18.5972 };
    const route = createGuestRoutePlan({
      origin: 'Cape Town City Centre',
      originCoordinate,
      destination: 'Cape Town International Airport',
      destinationCoordinate
    });

    assert.deepEqual(route.route.coordinates[0], originCoordinate);
    assert.deepEqual(route.route.coordinates.at(-1), destinationCoordinate);
    assert.deepEqual(route.checkpoints[0].coordinate, originCoordinate);
    assert.deepEqual(route.checkpoints.at(-1)?.coordinate, destinationCoordinate);
    assert.equal(route.riskZones.length, 0);
    assert.equal(route.route.coordinates.length > 2, true);
  });

  it('uses destination-aware geometry for London City Airport instead of the placeholder corridor', () => {
    const route = createGuestRoutePlan({
      origin: 'Current location',
      destination: 'London City Airport'
    });
    const routeEnd = route.route.coordinates[route.route.coordinates.length - 1];
    const airportGeometry = resolveGuestRouteCoordinates('LCY');
    const roadPreviewStops = resolveGuestRoadPreviewStops('London City Airport');

    assert.equal(route.destination, 'London City Airport');
    assert.equal(route.route.coordinates.length > 40, true);
    assert.deepEqual(routeEnd, { latitude: 51.5053, longitude: 0.0553 });
    assert.deepEqual(route.checkpoints[1].coordinate, routeEnd);
    assert.notDeepEqual(routeEnd, { latitude: 51.5088, longitude: -0.0182 });
    assert.deepEqual(roadPreviewStops[0], { latitude: 51.5099, longitude: -0.1479 });
    assert.deepEqual(roadPreviewStops[roadPreviewStops.length - 1], {
      latitude: 51.5053,
      longitude: 0.0553
    });
    assert.equal(
      roadPreviewStops.some((stop) => stop.latitude < 51.495 && stop.longitude < -0.04),
      true
    );
    assert.deepEqual(
      airportGeometry[airportGeometry.length - 1],
      { latitude: 51.5053, longitude: 0.0553 }
    );
  });

  it('accepts road-snapped preview coordinates and provider metrics without adding sheet clutter', () => {
    const roadSnappedCoordinates = [
      { latitude: 51.5115, longitude: -0.1478 },
      { latitude: 51.5115, longitude: -0.1478 },
      { latitude: 51.5093, longitude: -0.1184 },
      { latitude: 51.5131, longitude: -0.084 },
      { latitude: 51.5053, longitude: 0.0553 }
    ];
    const route = createGuestRoutePlan({
      origin: 'Paddington',
      destination: 'London City Airport',
      roadSnappedCoordinates,
      routeDistanceMeters: 16497,
      routeDurationSeconds: 2304.9
    });

    assert.equal(route.route.distance, '16.5 km');
    assert.equal(route.route.eta, '38 min');
    assert.equal(route.updatedAtLabel, 'Road preview');
    assert.equal(route.route.description, 'Road-snapped preview. Sign in to save.');
    assert.equal(route.route.coordinates.length, 4);
    assert.deepEqual(route.route.coordinates[0], roadSnappedCoordinates[0]);
    assert.deepEqual(route.route.coordinates[route.route.coordinates.length - 1], roadSnappedCoordinates[4]);
    assert.deepEqual(route.checkpoints[0].coordinate, route.route.coordinates[0]);
    assert.deepEqual(
      route.checkpoints[1].coordinate,
      route.route.coordinates[route.route.coordinates.length - 1]
    );
    assert.deepEqual(createGuestRoutePreviewState(route), {
      accessibilityLabel:
        'Unsaved route preview from Paddington to London City Airport. 38 min, 16.5 km. Sign in to save it.',
      summaryLabel: '38 min · 16.5 km'
    });
  });

  it('accepts only risk-safe road-snapped route upgrades for guest previews', () => {
    const safeLocalRoute = createGuestRoutePlan({
      origin: 'HQ',
      destination: 'London City Airport'
    });
    const safeRoadPreview = createGuestRoadSnappedRoutePlan({
      origin: 'HQ',
      destination: 'London City Airport',
      roadSnappedCoordinates: safeLocalRoute.route.coordinates,
      routeDistanceMeters: 9400,
      routeDurationSeconds: 1440
    });

    assert.ok(safeRoadPreview);
    assert.equal(safeRoadPreview.updatedAtLabel, 'Road preview');
    assert.equal(safeRoadPreview.route.distance, '9.4 km');

    const unsafeRoadPreview = createGuestRoadSnappedRoutePlan({
      origin: 'HQ',
      destination: 'London City Airport',
      roadSnappedCoordinates: [
        { latitude: 51.5099, longitude: -0.1479 },
        { latitude: 51.5134, longitude: -0.089 },
        { latitude: 51.5088, longitude: -0.0182 }
      ],
      routeDistanceMeters: 10563,
      routeDurationSeconds: 1585.3
    });

    assert.equal(unsafeRoadPreview, null);
  });

  it('accepts a constrained route through advisory zones that cannot be hard-avoided', () => {
    const roadSnappedCoordinates = [
      { latitude: 51.5074, longitude: -0.1278 },
      { latitude: 51.5062, longitude: -0.0888 },
      { latitude: 51.5053, longitude: -0.0553 }
    ];
    const roadPreview = createGuestRoadSnappedRoutePlan({
      origin: 'Current location',
      destination: 'London City',
      roadSnappedCoordinates,
      riskZones: [
        riskZone('broad-advisory', 'West End', roadSnappedCoordinates[1], 1500),
        riskZone('origin-advisory', 'Local start area', roadSnappedCoordinates[0], 500)
      ]
    });

    assert.ok(roadPreview);
    assert.deepEqual(roadPreview.route.coordinates, roadSnappedCoordinates);
    assert.deepEqual(
      roadPreview.riskZones.map(({ title }) => title),
      ['West End', 'Local start area']
    );
  });

  it('still rejects a road preview that enters an enforceable high-risk area', () => {
    const roadSnappedCoordinates = [
      { latitude: 51.5074, longitude: -0.1278 },
      { latitude: 51.5062, longitude: -0.0888 },
      { latitude: 51.5053, longitude: -0.0553 }
    ];

    assert.equal(createGuestRoadSnappedRoutePlan({
      origin: 'Current location',
      destination: 'London City',
      roadSnappedCoordinates,
      riskZones: [
        riskZone('local-hard-avoid', 'Local hard avoid', roadSnappedCoordinates[1], 300)
      ]
    }), null);
  });

  it('rejects the London route when it enters the local London Bridge high-risk area', () => {
    const roadSnappedCoordinates = [
      { latitude: 51.5074, longitude: -0.1278 },
      { latitude: 51.5062, longitude: -0.0888 },
      { latitude: 51.5053, longitude: -0.0553 }
    ];

    assert.equal(createGuestRoadSnappedRoutePlan({
      origin: 'Current location',
      destination: 'London City',
      roadSnappedCoordinates,
      riskZones: [
        riskZone(
          'london-bridge-high-risk',
          'London Bridge–Borough High Street',
          roadSnappedCoordinates[1],
          900
        )
      ]
    }), null);
  });

  it('falls back to local preview geometry when provider route data is incomplete', () => {
    const route = createGuestRoutePlan({
      authenticated: true,
      origin: 'HQ',
      destination: 'Airport Terminal',
      roadSnappedCoordinates: [
        { latitude: Number.NaN, longitude: -0.1478 },
        { latitude: 51.5115, longitude: -200 }
      ],
      routeDistanceMeters: 16497,
      routeDurationSeconds: 2304.9
    });

    assert.equal(route.route.coordinates.length, 33);
    assert.equal(route.route.distance, '9.4 km');
    assert.equal(route.route.eta, '24 min');
    assert.equal(route.updatedAtLabel, 'Local preview');
    assert.equal(route.route.description, 'Local preview. Saved plans stay in Saved.');
  });

  it('creates signed-in local route previews without guest sign-in copy', () => {
    const route = createGuestRoutePlan({
      authenticated: true,
      origin: 'HQ',
      destination: 'Airport Terminal'
    });

    assert.equal(route.operation, 'Local route');
    assert.equal(route.convoyCallsign, 'Map preview');
    assert.equal(route.route.description, 'Local preview. Saved plans stay in Saved.');
    assert.equal(route.route.nextInstruction, 'Review the route, then open Saved for synced plans.');
  });

  it('creates a smooth enough guest route for drive-along preview QA', () => {
    const route = createGuestRoutePlan({
      origin: 'HQ',
      destination: 'Airport Terminal'
    });

    assert.equal(route.route.coordinates.length, 33);
    assert.deepEqual(route.checkpoints[0].coordinate, route.route.coordinates[0]);
    assert.deepEqual(
      route.checkpoints[1].coordinate,
      route.route.coordinates[route.route.coordinates.length - 1]
    );
  });

  it('preserves ordered multi-stop checkpoints and previews through every selected stop', () => {
    const checkpoints = [
      {
        id: 'origin',
        label: 'A',
        caption: 'Current location',
        coordinate: { latitude: 51.5, longitude: -0.13 },
        kind: 'origin' as const
      },
      {
        id: 'waypoint-1',
        label: '1',
        caption: 'Bank',
        coordinate: { latitude: 51.51, longitude: -0.09 },
        kind: 'waypoint' as const
      },
      {
        id: 'destination',
        label: 'B',
        caption: 'City Airport',
        coordinate: { latitude: 51.505, longitude: 0.05 },
        kind: 'destination' as const
      }
    ];
    const route = createGuestRoutePlan({
      checkpoints,
      destination: 'City Airport',
      destinationCoordinate: checkpoints[2].coordinate,
      origin: 'Current location',
      originCoordinate: checkpoints[0].coordinate,
      riskZones: []
    });

    assert.deepEqual(route.checkpoints, checkpoints);
    assert.deepEqual(route.route.coordinates[0], checkpoints[0].coordinate);
    assert.ok(
      Math.abs((route.route.coordinates.at(-1)?.latitude ?? 0) - checkpoints[2].coordinate.latitude) < 0.000001 &&
      Math.abs((route.route.coordinates.at(-1)?.longitude ?? 0) - checkpoints[2].coordinate.longitude) < 0.000001
    );
    assert.ok(route.route.coordinates.some((coordinate) =>
      Math.abs(coordinate.latitude - checkpoints[1].coordinate.latitude) < 0.000001 &&
      Math.abs(coordinate.longitude - checkpoints[1].coordinate.longitude) < 0.000001
    ));
  });

  it('creates a compact accessible plotted-route preview with a single summary line', () => {
    const route = createGuestRoutePlan({
      origin: 'HQ',
      destination: 'Airport Terminal'
    });

    assert.deepEqual(createGuestRoutePreviewState(route), {
      accessibilityLabel:
        'Unsaved route preview from HQ to Airport Terminal. 24 min, 9.4 km. Sign in to save it.',
      summaryLabel: '24 min · 9.4 km'
    });

    assert.deepEqual(createGuestRoutePreviewState(route, { authenticated: true }), {
      accessibilityLabel:
        'Local route preview from HQ to Airport Terminal. 24 min, 9.4 km. Open the preview map for guidance. Saved plans are available from Saved.',
      summaryLabel: '24 min · 9.4 km'
    });
  });

  it('preserves full guest preview endpoints for VoiceOver without expanding visible metrics', () => {
    const route = createGuestRoutePlan({
      origin: 'HQ',
      destination: 'Airport Terminal'
    });
    const verboseOrigin = `${'Operations staging '.repeat(5)}west gate`;
    const verboseDestination = `${'International terminal '.repeat(5)}north entrance`;
    const previewState = createGuestRoutePreviewState({
      ...route,
      origin: `  ${verboseOrigin}  `,
      destination: `  ${verboseDestination}  `
    });

    assert.equal(previewState.summaryLabel, '24 min · 9.4 km');
    assert.ok(verboseOrigin.length > GUEST_ROUTE_LABEL_MAX_LENGTH);
    assert.ok(verboseDestination.length > GUEST_ROUTE_LABEL_MAX_LENGTH);
    assert.ok(
      previewState.accessibilityLabel.includes(
        `from ${verboseOrigin} to ${verboseDestination}.`
      )
    );
    assert.doesNotMatch(previewState.accessibilityLabel, /…/);
  });

  it('keeps guest route preview metrics compact when provider labels are sparse', () => {
    assert.deepEqual(
      createGuestRoutePreviewMetricPresentation({
        eta: '  16   min ',
        distance: '  7.5   km '
      }),
      {
        accessibilityLabel: '16 min, 7.5 km',
        summaryLabel: '16 min · 7.5 km'
      }
    );

    assert.deepEqual(
      createGuestRoutePreviewMetricPresentation({
        eta: '  ',
        distance: ' 7.5 km '
      }),
      {
        accessibilityLabel: '7.5 km',
        summaryLabel: '7.5 km'
      }
    );

    assert.deepEqual(
      createGuestRoutePreviewMetricPresentation({
        eta: '',
        distance: '  '
      }),
      {
        accessibilityLabel: 'Preview ready; route metrics unavailable',
        summaryLabel: GUEST_ROUTE_PREVIEW_SUMMARY_FALLBACK
      }
    );
  });

  it('bounds verbose guest route preview metrics while preserving full VoiceOver context', () => {
    const verboseEta = '  Travel time approximately twenty six minutes with traffic signal delay  ';
    const verboseDistance = '  Route distance approximately twelve point four kilometres  ';
    const presentation = createGuestRoutePreviewMetricPresentation({
      eta: verboseEta,
      distance: verboseDistance
    });

    const [etaSummary, distanceSummary] = presentation.summaryLabel.split(' · ');

    assert.equal(
      presentation.accessibilityLabel,
      'Travel time approximately twenty six minutes with traffic signal delay, Route distance approximately twelve point four kilometres'
    );
    assert.ok(etaSummary.length <= GUEST_ROUTE_PREVIEW_METRIC_MAX_LENGTH);
    assert.ok(distanceSummary.length <= GUEST_ROUTE_PREVIEW_METRIC_MAX_LENGTH);
    assert.ok(etaSummary.endsWith('…'));
    assert.ok(distanceSummary.endsWith('…'));
    assert.notEqual(presentation.summaryLabel, presentation.accessibilityLabel);
  });

  it('falls back to calm guest preview copy when route metrics are blank', () => {
    const route = createGuestRoutePlan({
      origin: '  HQ  ',
      destination: '  Airport   Terminal  '
    });

    const sparseMetricRoute = {
      ...route,
      origin: ' ',
      destination: '',
      route: {
        ...route.route,
        distance: ' ',
        eta: ''
      }
    };

    assert.deepEqual(createGuestRoutePreviewState(sparseMetricRoute), {
      accessibilityLabel:
        'Unsaved route preview from Start point to Destination. Preview ready; route metrics unavailable. Sign in to save it.',
      summaryLabel: 'Preview ready'
    });
  });

  it('keeps private feature sign-in prompts concise and specific', () => {
    const saved = getGuestFullAccessCopy('saved-routes');
    const trips = getGuestFullAccessCopy('planned-trips');
    const calendar = getGuestFullAccessCopy('calendar');
    const convoys = getGuestFullAccessCopy('convoy-management');

    assert.equal(saved.title, 'Saved');
    assert.equal(trips.title, 'Trips');
    assert.equal(calendar.title, 'Calendar');
    assert.equal(convoys.title, 'Convoys');

    for (const copy of [saved, trips, calendar, convoys]) {
      assert.equal('eyebrow' in copy, false);
      assert.match(copy.action, /^Sign in/);
      assert.ok(copy.action.length <= 32, `${copy.action} should stay compact`);
      assert.ok(copy.body.length <= 48, `${copy.body} should stay compact`);
    }
  });


  it('keeps Saved primary and limits signed-in support actions', () => {
    assert.deepEqual(
      getGuestMapGateFeatures({
        authenticated: false,
        routePlotted: false
      }),
      []
    );
    assert.deepEqual(
      getGuestMapGateFeatures({
        authenticated: true,
        routePlotted: false
      }),
      ['planned-trips', 'calendar', 'convoy-management']
    );
    assert.deepEqual(
      getGuestMapGateFeatures({
        authenticated: true,
        routePlotted: true
      }),
      []
    );
  });
});

function riskZone(
  id: string,
  title: string,
  coordinate: { latitude: number; longitude: number },
  radiusMeters: number
) {
  return {
    id,
    title,
    description: title,
    severity: 'high' as const,
    category: 'Area Risk',
    coordinate,
    radiusMeters,
    markerColor: '#d84a3f',
    strokeColor: 'rgba(216, 74, 63, 0.72)',
    fillColor: 'rgba(216, 74, 63, 0.18)'
  };
}
