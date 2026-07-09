import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUEST_ROUTE_LABEL_MAX_LENGTH,
  GUEST_ROUTE_PREVIEW_METRIC_MAX_LENGTH,
  GUEST_ROUTE_PREVIEW_SUMMARY_FALLBACK,
  createGuestMapHomeCopy,
  createGuestRouteActionState,
  createGuestRouteInputCopy,
  createGuestRouteMetrics,
  createGuestRoutePlan,
  createGuestRoutePreviewMetricPresentation,
  createGuestRoutePreviewState,
  getGuestFullAccessCopy,
  getGuestMapGateFeatures,
  hasGuestRouteDestination,
  normalizeGuestRouteLabel,
  shouldShowGuestMapGateRow,
  shouldShowGuestMapSubtitle
} from '../src/features/guest-map/guestRoutePlanner';

describe('guest route planner helpers', () => {
  it('keeps map-home state copy minimal before and after sign-in', () => {
    assert.deepEqual(createGuestMapHomeCopy(false), {
      primaryActionAccessibilityLabel: 'Sign in to SafeRoute',
      primaryActionLabel: 'Sign in',
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
        accessibilityHint: 'Opens this plotted route to London City Airport in the live map preview.',
        accessibilityLabel: 'Open route preview to London City Airport',
        disabled: false,
        label: 'Preview map'
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

  it('rejects blank guest destinations before creating local route data', () => {
    assert.throws(
      () => createGuestRoutePlan({ origin: 'HQ', destination: '   ' }),
      /destination is required/i
    );
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
    const convoys = getGuestFullAccessCopy('convoy-management');

    assert.equal(saved.title, 'Saved');
    assert.equal(trips.title, 'Trips');
    assert.equal(convoys.title, 'Convoys');

    for (const copy of [saved, trips, convoys]) {
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
    assert.equal(
      shouldShowGuestMapGateRow({
        authenticated: false,
        routePlotted: false
      }),
      false
    );
    assert.deepEqual(
      getGuestMapGateFeatures({
        authenticated: true,
        routePlotted: false
      }),
      ['planned-trips', 'convoy-management']
    );
    assert.equal(
      shouldShowGuestMapGateRow({
        authenticated: true,
        routePlotted: false
      }),
      true
    );
    assert.deepEqual(
      getGuestMapGateFeatures({
        authenticated: true,
        routePlotted: true
      }),
      []
    );
    assert.equal(
      shouldShowGuestMapGateRow({
        authenticated: true,
        routePlotted: true
      }),
      false
    );
  });
});
