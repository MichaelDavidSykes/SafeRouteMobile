import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGuestMapRouteRenderSession } from '../src/features/guest-map/guestMapRoutePresentation';
import { createGuestRoutePlan } from '../src/features/guest-map/guestRoutePlanner';
import type { RiskZone } from '../src/features/live-map/liveMapTypes';

const routeCoordinates = [
  { latitude: 51.5, longitude: -0.12 },
  { latitude: 51.51, longitude: -0.1 },
];

describe('guest map route presentation', () => {
  it('renders overlays only for the selected route alternative', () => {
    const primary = createRoute('primary', riskZone('primary-alert'));
    const alternative = createRoute('alternative', riskZone('alternative-alert'));

    const primarySession = createSession(primary, [primary, alternative]);
    assert.deepEqual(
      primarySession.riskZones.map(({ id }) => id),
      ['primary-alert'],
    );

    const alternativeSession = createSession(alternative, [primary, alternative]);
    assert.deepEqual(
      alternativeSession.riskZones.map(({ id }) => id),
      ['alternative-alert'],
    );
  });

  it('keeps route alerts ahead of area overlays within the native map cap', () => {
    const routeAlerts = [
      riskZone('route-alert-high'),
      riskZone('route-alert-medium', 'medium'),
    ];
    const areaRisks = Array.from({ length: 90 }, (_, index) =>
      areaRiskZone(`area-risk-${index}`),
    );
    const primary = createRouteWithZones('primary', [
      ...areaRisks,
      ...routeAlerts,
    ]);

    const session = createSession(primary, [primary]);

    assert.equal(session.riskZones.length, 80);
    assert.deepEqual(
      session.riskZones.slice(0, routeAlerts.length).map(({ id }) => id),
      ['route-alert-high', 'route-alert-medium'],
    );
  });
});

function createSession(
  selectedRoute: ReturnType<typeof createRoute>,
  routes: Array<ReturnType<typeof createRoute>>,
) {
  return createGuestMapRouteRenderSession({
    alternativeColors: ['#64748b'],
    alternativeStrokeWidth: 3,
    maxFitCoordinates: 100,
    maxRenderedRiskZones: 80,
    maxRouteCoordinates: 100,
    routes,
    selectedColor: '#10b981',
    selectedRoute,
    selectedStrokeWidth: 5,
  });
}

function createRoute(id: string, zone: RiskZone) {
  return createRouteWithZones(id, [zone]);
}

function createRouteWithZones(id: string, zones: RiskZone[]) {
  return createGuestRoutePlan({
    destination: 'Destination',
    origin: 'Origin',
    planId: id,
    riskZones: zones,
    roadSnappedCoordinates: routeCoordinates,
  });
}

function riskZone(id: string, severity: RiskZone['severity'] = 'high'): RiskZone {
  return {
    id,
    title: 'Route alert',
    description: 'Alert scoped to this route alternative.',
    severity,
    category: 'Road suitability',
    coordinate: routeCoordinates[0],
    routeSegmentCoordinates: routeCoordinates,
    shape: 'route-alert',
    radiusMeters: 250,
    markerColor: '#f97316',
    strokeColor: '#f97316',
    fillColor: 'rgba(249,115,22,.1)',
  };
}

function areaRiskZone(id: string): RiskZone {
  return {
    ...riskZone(id),
    category: 'Area risk',
    routeSegmentCoordinates: [],
    shape: 'circle',
  };
}
