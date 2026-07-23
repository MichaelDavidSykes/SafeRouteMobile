import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRouteSharePath,
  createRouteShareMessage,
  normalizeRouteShareUrl,
} from '../src/features/routes/routeShareCore';
import type { SavedSafeRoutePlan } from '../src/features/live-map/liveMapTypes';

const routePlan: SavedSafeRoutePlan = {
  id: 'plan-1',
  name: 'Airport transfer',
  operation: 'Executive move',
  status: 'ready',
  convoyCallsign: 'Lead 1',
  updatedAtLabel: 'Now',
  origin: 'Hotel',
  destination: 'Airport',
  region: {
    latitude: 51.5,
    longitude: -0.1,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  },
  route: {
    id: 'route/1',
    label: 'Primary',
    eta: '18 min',
    distance: '8.0 km',
    safeScore: 20,
    riskLabel: 'Low',
    tone: 'safe',
    color: '#0a84ff',
    mutedColor: '#8e8e93',
    description: 'Risk-aware route',
    nextInstruction: 'Continue',
    nextDistance: '1 km',
    coordinates: [],
  },
  riskZones: [],
  checkpoints: [],
};

describe('saved route sharing', () => {
  it('builds an encoded backend share action path', () => {
    assert.equal(
      buildRouteSharePath(' route/1 '),
      '/convoy-routes/route%2F1/share',
    );
    assert.throws(() => buildRouteSharePath(''), /saved route/i);
  });

  it('accepts only trusted SafeRoute web links', () => {
    assert.equal(
      normalizeRouteShareUrl('/safe-route?route=route-1'),
      'https://app.lunarchain.net/safe-route?route=route-1',
    );
    assert.throws(() => normalizeRouteShareUrl('//attacker.example/safe-route'));
    assert.throws(() => normalizeRouteShareUrl('https://attacker.example/safe-route'));
    assert.throws(() => normalizeRouteShareUrl('/account'));
  });

  it('creates a useful native share message for saved and guest routes', () => {
    assert.equal(
      createRouteShareMessage(routePlan),
      'Airport transfer: Hotel to Airport (18 min · 8.0 km).',
    );
    assert.match(
      createRouteShareMessage(
        routePlan,
        'https://app.lunarchain.net/safe-route?route=route-1',
      ),
      /Airport transfer[\s\S]*https:\/\/app\.lunarchain\.net\/safe-route/,
    );
  });
});
