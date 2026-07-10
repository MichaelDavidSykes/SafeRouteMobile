import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SAVED_ROUTE_PLANS, getSavedRoutePlan } from '../src/features/live-map/demoRoute';
import {
  ARRIVAL_THRESHOLD_METERS,
  DEMO_DRIVE_MIN_DURATION_MS,
  DEMO_DRIVE_STEP_INTERVAL_MS,
  OFF_ROUTE_THRESHOLD_METERS,
  buildInterpolatedProgressCoordinates,
  calculateRouteProgress,
  clampRouteStep,
  coordinateForInterpolatedStep,
  densifyRouteCoordinates,
  formatDistance,
  formatEta,
  haversineDistanceMeters,
  normalizeRouteCoordinates,
  projectCoordinateToRoute,
  resolveDemoDriveStepIncrement,
  resolveGuidance
} from '../src/features/live-map/routeProgress';

describe('saved SafeRoute plans', () => {
  it('loads a route by id from the saved-route fixture set', () => {
    const route = getSavedRoutePlan('sr-city-airport-alpha');

    assert.equal(route?.name, 'City Airport transfer');
    assert.equal(route?.route.coordinates.length, 7);
  });

  it('contains only traversable routes', () => {
    for (const route of SAVED_ROUTE_PLANS) {
      assert.ok(route.route.coordinates.length >= 2, `${route.id} needs at least origin and destination`);
      assert.equal(route.checkpoints.length, 2);
    }
  });
});

describe('route traversal progress', () => {
  const route = SAVED_ROUTE_PLANS[0].route;

  it('clamps requested progress to the available route geometry', () => {
    assert.equal(clampRouteStep(route.coordinates.length, -3), 0);
    assert.equal(clampRouteStep(route.coordinates.length, 2.8), 2);
    assert.equal(clampRouteStep(route.coordinates.length, 999), route.coordinates.length - 1);
  });

  it('interpolates demo-drive positions between sparse route vertices', () => {
    const coordinate = coordinateForInterpolatedStep(route.coordinates, 1.5);

    assert.ok(coordinate);
    assert.ok(coordinate.latitude > Math.min(route.coordinates[1].latitude, route.coordinates[2].latitude));
    assert.ok(coordinate.latitude < Math.max(route.coordinates[1].latitude, route.coordinates[2].latitude));
    assert.ok(coordinate.longitude > Math.min(route.coordinates[1].longitude, route.coordinates[2].longitude));
    assert.ok(coordinate.longitude < Math.max(route.coordinates[1].longitude, route.coordinates[2].longitude));
  });

  it('builds a completed demo-drive route segment to the interpolated convoy position', () => {
    const progress = buildInterpolatedProgressCoordinates(route.coordinates, 2.5);

    assert.equal(progress.length, 4);
    assert.deepEqual(progress[0], route.coordinates[0]);
    assert.deepEqual(progress[2], route.coordinates[2]);
    assert.notDeepEqual(progress[3], route.coordinates[2]);
    assert.notDeepEqual(progress[3], route.coordinates[3]);
  });

  it('paces sparse demo-drive fixtures long enough for active guidance QA', () => {
    const increment = resolveDemoDriveStepIncrement(route.coordinates.length);
    const requiredTicks = Math.ceil(DEMO_DRIVE_MIN_DURATION_MS / DEMO_DRIVE_STEP_INTERVAL_MS);
    const finalStep = route.coordinates.length - 1;

    assert.ok(increment > 0);
    assert.ok(increment < 1);
    assert.ok(Math.abs(increment * requiredTicks - finalStep) < 0.000001);
  });

  it('densifies long route segments for deterministic preview-route simulation', () => {
    const sparseRoute = [
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 51.5, longitude: -0.1 }
    ];
    const denseRoute = densifyRouteCoordinates(sparseRoute, 250);

    assert.equal(denseRoute.length, 7);
    assert.deepEqual(denseRoute[0], sparseRoute[0]);
    assert.deepEqual(denseRoute[denseRoute.length - 1], sparseRoute[1]);

    for (let index = 0; index < denseRoute.length - 1; index += 1) {
      assert.ok(
        haversineDistanceMeters(denseRoute[index], denseRoute[index + 1]) <= 251,
        `segment ${index} should stay below the configured preview interval`
      );
    }
  });

  it('switches guidance to arrival at the end of the route', () => {
    const guidance = resolveGuidance(route, route.coordinates.length - 1);

    assert.equal(guidance.instruction, 'Arrived at destination');
    assert.equal(guidance.distance, '0 m');
  });

  it('shows the next provider maneuver and distance during live guidance', () => {
    const progress = calculateRouteProgress(route.coordinates, route.coordinates[0]);
    assert.ok(progress);
    const guidedRoute = {
      ...route,
      navigationSteps: [{
        id: 'turn-1',
        instruction: 'Turn right onto Airport Approach',
        maneuverType: 'turn',
        modifier: 'right',
        roadName: 'Airport Approach',
        distanceAlongMeters: 420,
        distanceMeters: 700,
        durationSeconds: 80,
        coordinate: route.coordinates[1]
      }]
    };

    assert.deepEqual(resolveGuidance(guidedRoute, progress, 'navigating'), {
      instruction: 'Turn right onto Airport Approach',
      distance: '420 m'
    });
  });

  it('replaces preview calls to action with driving guidance after route start', () => {
    const progress = calculateRouteProgress(route.coordinates, route.coordinates[0]);
    assert.ok(progress);

    assert.deepEqual(resolveGuidance({
      ...route,
      navigationSteps: [],
      nextInstruction: 'Review the route, then open Saved for synced plans.',
      nextDistance: 'Preview'
    }, progress, 'navigating'), {
      instruction: 'Continue on route',
      distance: formatDistance(progress.remainingDistanceMeters)
    });
  });

  it('snaps a live coordinate to the nearest route segment', () => {
    const progress = calculateRouteProgress(route.coordinates, {
      latitude: 51.5186,
      longitude: -0.099
    });

    assert.ok(progress);
    assert.ok(progress.offRouteDistanceMeters < 180);
    assert.ok(progress.remainingDistanceMeters > 0);
    assert.ok(progress.completedCoordinates.length >= 2);
  });

  it('uses planner-style route projection to snap coordinates onto the route line', () => {
    const plannerRoute = [
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.51, longitude: -0.08 }
    ];
    const projection = projectCoordinateToRoute(plannerRoute, {
      latitude: 51.50035,
      longitude: -0.11
    });

    assert.ok(projection);
    assert.equal(projection.segmentIndex, 0);
    assert.ok(Math.abs(projection.snappedCoordinate.latitude - 51.5) < 0.00001);
    assert.ok(projection.distanceAlongMeters > 650);
    assert.ok(projection.distanceAlongMeters < 750);
    assert.ok(projection.distanceMeters < 45);
  });

  it('keeps route snapping monotonic after progress has advanced', () => {
    const plannerRoute = [
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.51, longitude: -0.08 }
    ];
    const firstSegmentDistance = haversineDistanceMeters(plannerRoute[0], plannerRoute[1]);
    const projection = projectCoordinateToRoute(
      plannerRoute,
      {
        latitude: 51.50002,
        longitude: -0.119
      },
      firstSegmentDistance + 50
    );

    assert.ok(projection);
    assert.ok(projection.distanceAlongMeters >= firstSegmentDistance + 49);
    assert.equal(projection.segmentIndex, 1);
  });

  it('deduplicates and rejects invalid route coordinates before progress calculations', () => {
    const normalized = normalizeRouteCoordinates([
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.5, longitude: -0.1 },
      { latitude: Number.NaN, longitude: -0.09 },
      { latitude: 51.501, longitude: -0.09 }
    ]);

    assert.equal(normalized.length, 2);
    assert.deepEqual(normalized[0], { latitude: 51.5, longitude: -0.1 });
    assert.deepEqual(normalized[1], { latitude: 51.501, longitude: -0.09 });
  });

  it('flags a convoy as off-route after the configured threshold', () => {
    const progress = calculateRouteProgress(
      route.coordinates,
      {
        latitude: 51.58,
        longitude: -0.099
      },
      {
        offRouteThresholdMeters: OFF_ROUTE_THRESHOLD_METERS
      }
    );

    assert.ok(progress?.isOffRoute);
    assert.ok((progress?.offRouteDistanceMeters || 0) > OFF_ROUTE_THRESHOLD_METERS);
  });

  it('detects arrival near the destination threshold', () => {
    const destination = route.coordinates[route.coordinates.length - 1];
    const progress = calculateRouteProgress(
      route.coordinates,
      destination,
      {
        arrivalThresholdMeters: ARRIVAL_THRESHOLD_METERS
      }
    );

    assert.equal(progress?.isArrived, true);
    assert.equal(resolveGuidance(route, progress, 'navigating').instruction, 'Arrived at destination');
  });

  it('treats a far-away position on one-point geometry as off-route instead of arrived', () => {
    const singlePointRoute = [route.coordinates[0]];
    const progress = calculateRouteProgress(
      singlePointRoute,
      {
        latitude: route.coordinates[0].latitude + 0.02,
        longitude: route.coordinates[0].longitude
      },
      {
        offRouteThresholdMeters: OFF_ROUTE_THRESHOLD_METERS,
        arrivalThresholdMeters: ARRIVAL_THRESHOLD_METERS
      }
    );

    assert.ok(progress);
    assert.equal(progress.isArrived, false);
    assert.equal(progress.isOffRoute, true);
    assert.equal(progress.totalDistanceMeters, 0);
    assert.equal(progress.remainingDistanceMeters, 0);
  });

  it('detects arrival on one-point geometry only when the position is near the point', () => {
    const singlePointRoute = [route.coordinates[0]];
    const progress = calculateRouteProgress(
      singlePointRoute,
      route.coordinates[0],
      {
        arrivalThresholdMeters: ARRIVAL_THRESHOLD_METERS
      }
    );

    assert.ok(progress);
    assert.equal(progress.isArrived, true);
    assert.equal(progress.isOffRoute, false);
  });

  it('does not treat zero-distance duplicate geometry as arrived when the convoy is away', () => {
    const waypoint = { latitude: 51.5, longitude: -0.1 };
    const progress = calculateRouteProgress(
      [waypoint, waypoint],
      {
        latitude: 51.58,
        longitude: -0.1
      },
      {
        arrivalThresholdMeters: ARRIVAL_THRESHOLD_METERS,
        offRouteThresholdMeters: OFF_ROUTE_THRESHOLD_METERS
      }
    );

    assert.equal(progress?.totalDistanceMeters, 0);
    assert.equal(progress?.isArrived, false);
    assert.equal(progress?.isOffRoute, true);
  });

  it('prioritizes arrival near the destination over a strict off-route threshold', () => {
    const destination = route.coordinates[route.coordinates.length - 1];
    const progress = calculateRouteProgress(
      route.coordinates,
      {
        latitude: destination.latitude + 0.00018,
        longitude: destination.longitude + 0.00018
      },
      {
        arrivalThresholdMeters: ARRIVAL_THRESHOLD_METERS,
        offRouteThresholdMeters: 5
      }
    );

    assert.equal(progress?.isArrived, true);
    assert.equal(progress?.isOffRoute, false);
  });

  it('does not mark arrival just because the nearest route projection is at the final segment', () => {
    const progress = calculateRouteProgress(
      [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 0.01 }
      ],
      {
        latitude: 0.001,
        longitude: 0.01
      },
      {
        arrivalThresholdMeters: 50,
        offRouteThresholdMeters: 75
      }
    );

    assert.ok(progress);
    assert.equal(progress.isArrived, false);
    assert.equal(progress.isOffRoute, true);
    assert.ok(progress.offRouteDistanceMeters > 75);
  });

  it('estimates ETA from remaining distance and speed', () => {
    const progress = calculateRouteProgress(
      route.coordinates,
      route.coordinates[1],
      {
        speedMetersPerSecond: 10
      }
    );

    assert.ok((progress?.etaSeconds || 0) > 0);
    assert.match(formatEta(progress?.etaSeconds), /min$/);
  });

  it('keeps invalid or non-positive ETA values out of the UI', () => {
    assert.equal(formatEta(null), 'ETA pending');
    assert.equal(formatEta(Number.NaN), 'ETA pending');
    assert.equal(formatEta(-10), 'ETA pending');
    assert.equal(formatEta(0), 'ETA pending');
  });

  it('computes haversine distance in meters', () => {
    const distance = haversineDistanceMeters(route.coordinates[0], route.coordinates[1]);

    assert.ok(distance > 1000);
    assert.ok(distance < 2500);
  });
});
