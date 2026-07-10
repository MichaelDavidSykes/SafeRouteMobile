import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyLiveReroutePreview,
  buildLiveRerouteAvoidRectangles,
  buildLiveRerouteTargets,
  createLiveRiskRegion
} from '../src/features/live-map/liveReroutePlan';
import type { RiskZone, SavedSafeRoutePlan } from '../src/features/live-map/liveMapTypes';
import { calculateRouteProgress } from '../src/features/live-map/routeProgress';

const routePlan: SavedSafeRoutePlan = {
  id: 'plan-1',
  clientId: 'client-1',
  name: 'Cape Town route',
  operation: 'Movement',
  status: 'ready',
  convoyCallsign: 'Alpha',
  updatedAtLabel: 'Now',
  origin: 'Start',
  destination: 'Finish',
  region: { latitude: -33.95, longitude: 18.5, latitudeDelta: 0.2, longitudeDelta: 0.2 },
  route: {
    id: 'route-1',
    label: 'Primary',
    eta: '20 min',
    distance: '10 km',
    safeScore: 85,
    riskLabel: 'Low',
    tone: 'safe',
    color: '#1677ff',
    mutedColor: '#9bbde8',
    description: 'Primary route',
    nextInstruction: 'Continue',
    nextDistance: '1 km',
    coordinates: [
      { latitude: -33.90, longitude: 18.40 },
      { latitude: -33.95, longitude: 18.50 },
      { latitude: -34.00, longitude: 18.60 }
    ]
  },
  riskZones: [],
  checkpoints: [
    checkpoint('origin', 'origin', -33.90, 18.40),
    checkpoint('via-1', 'waypoint', -33.95, 18.50),
    checkpoint('destination', 'destination', -34.00, 18.60)
  ]
};

describe('live reroute plan integration', () => {
  it('loads live risk chunks around the current vehicle instead of a stale route region', () => {
    const region = createLiveRiskRegion(
      { latitude: -33.925, longitude: 18.424 },
      routePlan.region
    );
    assert.equal(region.latitude, -33.925);
    assert.equal(region.longitude, 18.424);
    assert.equal(region.latitudeDelta, 0.12);
  });

  it('keeps only future waypoints and the destination when rerouting', () => {
    const current = { latitude: -33.97, longitude: 18.54 };
    const progress = calculateRouteProgress(routePlan.route.coordinates, current);
    const targets = buildLiveRerouteTargets(routePlan, current, progress);

    assert.deepEqual(targets.remainingCheckpoints.map(({ id }) => id), ['destination']);
    assert.deepEqual(targets.stops, [current, routePlan.checkpoints[2].coordinate]);
  });

  it('ranks severe risk areas for avoidance and excludes a rectangle containing a required stop', () => {
    const current = { latitude: -33.90, longitude: 18.40 };
    const currentRisk = riskZone('current-risk', current, 500);
    const routeRisk = riskZone('route-risk', { latitude: -33.95, longitude: 18.50 }, 350);
    const rectangles = buildLiveRerouteAvoidRectangles(
      [currentRisk, routeRisk],
      routePlan.route.coordinates,
      [current, routePlan.checkpoints[2].coordinate]
    );

    assert.equal(rectangles.length, 1);
    assert.equal(rectangles[0].label, 'route-risk');
  });

  it('replaces the remaining path with provider-snapped geometry and resets its origin', () => {
    const current = { latitude: -33.96, longitude: 18.53 };
    const targets = buildLiveRerouteTargets(
      routePlan,
      current,
      calculateRouteProgress(routePlan.route.coordinates, current)
    );
    const preview = {
      coordinates: [
        current,
        { latitude: -33.975, longitude: 18.56 },
        routePlan.checkpoints[2].coordinate
      ],
      distanceMeters: 5200,
      durationSeconds: 780,
      provider: 'osrm' as const,
      snapped: true
    };
    const next = applyLiveReroutePreview({
      currentCoordinate: current,
      preview,
      requestRevision: 4,
      riskZones: [riskZone('live-risk', { latitude: -33.98, longitude: 18.57 }, 200)],
      routePlan,
      targets
    });

    assert.equal(next.route.id, 'route-1-reroute-4');
    assert.deepEqual(next.route.coordinates, preview.coordinates);
    assert.equal(next.route.distance, '5.2 km');
    assert.equal(next.route.eta, '13 min');
    assert.equal(next.origin, 'Current location');
    assert.equal(next.checkpoints[0].kind, 'origin');
    assert.equal(next.checkpoints.at(-1)?.kind, 'destination');
    assert.equal(next.clientId, 'client-1');
  });
});

function checkpoint(
  id: string,
  kind: 'origin' | 'waypoint' | 'destination',
  latitude: number,
  longitude: number
) {
  return {
    id,
    kind,
    label: id,
    caption: kind,
    coordinate: { latitude, longitude }
  };
}

function riskZone(id: string, coordinate: { latitude: number; longitude: number }, radiusMeters: number): RiskZone {
  return {
    id,
    title: id,
    description: id,
    severity: 'high',
    category: 'area-risk',
    coordinate,
    radiusMeters,
    markerColor: '#d84a3f',
    strokeColor: '#d84a3f',
    fillColor: 'rgba(216,74,63,.18)'
  };
}
