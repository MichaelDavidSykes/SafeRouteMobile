import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldRecenterGuestMap } from '../src/features/guest-map/guestMapLocation';

describe('guest map location centering', () => {
  const london = {
    coordinate: { latitude: 51.5074, longitude: -0.1278 },
    timestampMs: 1000
  };
  const capeTown = {
    coordinate: { latitude: -34.033, longitude: 18.585 },
    timestampMs: 2000
  };

  it('centers on the first valid device fix and replaces a stale far-away fix', () => {
    assert.equal(shouldRecenterGuestMap({
      candidate: london,
      previous: null,
      routePlotted: false,
      userMovedMap: false
    }), true);
    assert.equal(shouldRecenterGuestMap({
      candidate: capeTown,
      previous: london,
      routePlotted: false,
      userMovedMap: false
    }), true);
  });

  it('does not pull the map after a user pan, during a route, or for GPS jitter', () => {
    assert.equal(shouldRecenterGuestMap({
      candidate: capeTown,
      previous: london,
      routePlotted: false,
      userMovedMap: true
    }), false);
    assert.equal(shouldRecenterGuestMap({
      candidate: capeTown,
      previous: london,
      routePlotted: true,
      userMovedMap: false
    }), false);
    assert.equal(shouldRecenterGuestMap({
      candidate: {
        coordinate: { latitude: 51.50745, longitude: -0.12782 },
        timestampMs: 2000
      },
      previous: london,
      routePlotted: false,
      userMovedMap: false
    }), false);
  });

  it('rejects older and invalid fixes', () => {
    assert.equal(shouldRecenterGuestMap({
      candidate: { ...capeTown, timestampMs: 500 },
      previous: london,
      routePlotted: false,
      userMovedMap: false
    }), false);
    assert.equal(shouldRecenterGuestMap({
      candidate: {
        coordinate: { latitude: Number.NaN, longitude: 18.585 },
        timestampMs: 3000
      },
      previous: london,
      routePlotted: false,
      userMovedMap: false
    }), false);
  });
});
