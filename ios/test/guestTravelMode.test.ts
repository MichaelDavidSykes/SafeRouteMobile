import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUEST_TRAVEL_MODE_OPTIONS,
  getGuestTravelModeRouteLabel,
  normalizeSafeRouteTravelMode,
} from '../src/features/guest-map/guestTravelMode';

describe('guest travel mode actions', () => {
  it('presents every mode as an immediate route-plotting action', () => {
    assert.deepEqual(
      GUEST_TRAVEL_MODE_OPTIONS.map((option) => ({
        accessibilityLabel: option.accessibilityLabel,
        id: option.id,
        routeLabel: option.routeLabel,
      })),
      [
        {
          accessibilityLabel: 'Plot driving route',
          id: 'drive',
          routeLabel: 'driving',
        },
        {
          accessibilityLabel: 'Plot walking route',
          id: 'walk',
          routeLabel: 'walking',
        },
        {
          accessibilityLabel: 'Plot cycling route',
          id: 'cycle',
          routeLabel: 'cycling',
        },
      ],
    );
  });

  it('provides stable mode copy and keeps unknown values driving-safe', () => {
    assert.equal(getGuestTravelModeRouteLabel('drive'), 'driving');
    assert.equal(getGuestTravelModeRouteLabel('walk'), 'walking');
    assert.equal(getGuestTravelModeRouteLabel('cycle'), 'cycling');
    assert.equal(normalizeSafeRouteTravelMode('walk'), 'walk');
    assert.equal(normalizeSafeRouteTravelMode('cycle'), 'cycle');
    assert.equal(normalizeSafeRouteTravelMode('hovercraft'), 'drive');
  });
});
