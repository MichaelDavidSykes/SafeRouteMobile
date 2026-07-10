import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildGuestRiskAreaPayload,
  GUEST_RISK_AREA_RADIUS_METERS
} from '../src/features/guest-map/guestRiskAreaApiCore';

describe('guest map risk-area reporting', () => {
  it('builds a bounded authenticated workspace area from a deliberate map selection', () => {
    const payload = buildGuestRiskAreaPayload({
      clientId: ' client-123 ',
      coordinate: { latitude: -33.9249, longitude: 18.4241 },
      locationLabel: '  Cape   Town City Centre  ',
      nowMs: 123456789
    });

    assert.equal(payload.client_id, 'client-123');
    assert.equal(payload.category, 'area-risk');
    assert.equal(payload.shape, 'area');
    assert.equal(payload.area_shape, 'circle');
    assert.equal(payload.radius_m, GUEST_RISK_AREA_RADIUS_METERS);
    assert.equal(payload.severity, 'medium');
    assert.equal(payload.label, 'Reported risk near Cape Town City Centre');
    assert.equal(payload.coordinates.length, 12);
    assert.ok(payload.coordinates.every((coordinate) =>
      Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lon)
    ));
    assert.ok(payload.coordinates.some((coordinate) => coordinate.lat !== payload.lat));
    assert.ok(payload.coordinates.some((coordinate) => coordinate.lon !== payload.lon));
    assert.ok(payload.id.length <= 80);
  });

  it('rejects missing workspace context and invalid map coordinates', () => {
    assert.throws(() => buildGuestRiskAreaPayload({
      clientId: '',
      coordinate: { latitude: 51.5, longitude: -0.1 },
      locationLabel: 'London'
    }));
    assert.throws(() => buildGuestRiskAreaPayload({
      clientId: 'client-123',
      coordinate: { latitude: 120, longitude: -0.1 },
      locationLabel: 'Invalid'
    }));
  });
});
