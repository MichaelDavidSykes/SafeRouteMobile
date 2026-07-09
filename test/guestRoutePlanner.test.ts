import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUEST_ROUTE_LABEL_MAX_LENGTH,
  createGuestMapHomeCopy,
  createGuestRouteActionState,
  createGuestRouteInputCopy,
  createGuestRoutePlan,
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
    assert.equal(route.riskZones.length, 3);
    assert.equal(route.checkpoints.length, 2);
    assert.equal(route.route.description, 'Local preview. Sign in to save.');
    assert.equal(route.route.nextInstruction, 'Review the route, then sign in to save it.');
    assert.equal(route.route.nextDistance, 'Preview');
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
        'Unsaved route preview from HQ to Airport Terminal. 24 min, 8.6 km. Sign in to save it.',
      summaryLabel: '24 min · 8.6 km'
    });

    assert.deepEqual(createGuestRoutePreviewState(route, { authenticated: true }), {
      accessibilityLabel:
        'Local route preview from HQ to Airport Terminal. 24 min, 8.6 km. Open the preview map for guidance. Saved plans are available from Saved.',
      summaryLabel: '24 min · 8.6 km'
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
