import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizeRouteNavigationSteps,
  resolveUpcomingNavigationStep
} from '../src/features/live-map/routeGuidance';

describe('provider route guidance', () => {
  it('normalizes, orders, bounds, and deduplicates provider maneuvers', () => {
    const steps = normalizeRouteNavigationSteps([
      {
        id: 'later',
        instruction: '  Turn   right onto High Street  ',
        maneuver_type: 'turn',
        modifier: 'right',
        road_name: 'High Street',
        distance_along_meters: 450,
        distance_meters: 110,
        duration_seconds: 18,
        coordinate: { latitude: 51.51, longitude: -0.1 }
      },
      {
        id: 'depart',
        message: 'Head north',
        maneuver: 'depart',
        routeOffsetInMeters: 0,
        location: [-0.12, 51.5]
      },
      {
        id: 'duplicate',
        instruction: 'Turn right onto High Street',
        maneuver_type: 'turn',
        distance_along_meters: 450,
        coordinate: { lat: 51.51, lng: -0.1 }
      },
      {
        instruction: 'Invalid coordinate',
        distance_along_meters: 500,
        coordinate: [999, 999]
      }
    ]);

    assert.equal(steps.length, 2);
    assert.equal(steps[0].instruction, 'Head north');
    assert.equal(steps[0].distanceAlongMeters, 0);
    assert.deepEqual(steps[0].coordinate, { latitude: 51.5, longitude: -0.12 });
    assert.equal(steps[1].instruction, 'Turn right onto High Street');
    assert.equal(steps[1].roadName, 'High Street');
  });

  it('selects the next maneuver and never returns a negative distance', () => {
    const steps = normalizeRouteNavigationSteps([
      {
        instruction: 'Head north',
        maneuver_type: 'depart',
        distance_along_meters: 0,
        coordinate: [-0.12, 51.5]
      },
      {
        instruction: 'Turn right',
        maneuver_type: 'turn',
        distance_along_meters: 300,
        coordinate: [-0.11, 51.505]
      },
      {
        instruction: 'Arrive',
        maneuver_type: 'arrive',
        distance_along_meters: 900,
        coordinate: [-0.1, 51.51]
      }
    ]);

    assert.equal(resolveUpcomingNavigationStep(steps, 0)?.step.instruction, 'Head north');
    assert.deepEqual(resolveUpcomingNavigationStep(steps, 125), {
      distanceToStepMeters: 175,
      step: steps[1]
    });
    assert.deepEqual(resolveUpcomingNavigationStep(steps, 950), {
      distanceToStepMeters: 0,
      step: steps[2]
    });
    assert.equal(resolveUpcomingNavigationStep([], 0), null);
  });
});
