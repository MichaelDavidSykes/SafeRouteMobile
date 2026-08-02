import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyLiveReroutePreview,
  buildLiveRerouteAvoidRectangles,
  buildRouteOptionAvoidRectangles,
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

  it('constrains only risk areas close to a real candidate route', () => {
    const route = [
      { latitude: 51.507198, longitude: -0.127598 },
      { latitude: 51.51, longitude: -0.09 },
    ];
    const nearbyButClearRisk = riskZone(
      'liverpool-street',
      { latitude: 51.517853, longitude: -0.081602 },
      650,
    );

    assert.deepEqual(
      buildRouteOptionAvoidRectangles(
        [nearbyButClearRisk],
        route,
        [route[0], route[1]],
      ),
      [],
    );

    const intersectingRisk = riskZone(
      'route-risk',
      { latitude: 51.5085, longitude: -0.11 },
      200,
    );
    assert.equal(
      buildRouteOptionAvoidRectangles(
        [intersectingRisk],
        route,
        [route[0], route[1]],
      ).length,
      1,
    );
  });

  it('does not treat gaps between alternative routes as route segments', () => {
    const firstRoute = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    ];
    const secondRoute = [
      { latitude: 1, longitude: 0 },
      { latitude: 1, longitude: 1 },
    ];
    const gapRisk = riskZone(
      'gap-risk',
      { latitude: 0.5, longitude: 0.5 },
      100,
    );

    assert.deepEqual(
      buildRouteOptionAvoidRectangles(
        [gapRisk],
        [firstRoute, secondRoute],
        [firstRoute[0], secondRoute.at(-1)!],
      ),
      [],
    );
  });

  it('submits only high-risk rectangles that the candidate route actually enters', () => {
    const crossingRisk = riskZone(
      'London Bridge–Borough High Street',
      { latitude: -33.95, longitude: 18.50 },
      900
    );
    const clearRisk = riskZone(
      'Unrelated district',
      { latitude: -33.86, longitude: 18.72 },
      900
    );

    const rectangles = buildLiveRerouteAvoidRectangles(
      [clearRisk, crossingRisk],
      routePlan.route.coordinates,
      [routePlan.checkpoints[0].coordinate, routePlan.checkpoints[2].coordinate]
    );

    assert.deepEqual(rectangles.map(({ label }) => label), [
      'London Bridge–Borough High Street'
    ]);
  });

  it('does not let district-scale high risk block the Cape Town corridor while critical remains fail closed', () => {
    const origin = { latitude: -33.90876894132692, longitude: 18.420521374095387 };
    const destination = { latitude: -33.86984598482066, longitude: 18.5545751389195 };
    const zones = [
      polygonRiskZone('Woodstock district', 'high', [
        [-33.940183, 18.428262],
        [-33.940183, 18.464066],
        [-33.910443, 18.464066],
        [-33.910443, 18.428262]
      ]),
      polygonRiskZone('Jakes Gerwel district', 'high', [
        [-33.940621, 18.452212],
        [-33.940621, 18.477788],
        [-33.919379, 18.477788],
        [-33.919379, 18.452212]
      ]),
      polygonRiskZone('Long Street local risk', 'high', [
        [-33.930961, 18.408297],
        [-33.930961, 18.426503],
        [-33.915839, 18.426503],
        [-33.915839, 18.408297]
      ]),
      polygonRiskZone('Critical shared area', 'critical', [
        [-33.902602, 18.550364],
        [-33.902602, 18.570294],
        [-33.886032, 18.570294],
        [-33.886032, 18.550364]
      ])
    ];

    const rectangles = buildLiveRerouteAvoidRectangles(
      zones,
      [
        origin,
        { latitude: -33.923, longitude: 18.417 },
        { latitude: -33.894, longitude: 18.56 },
        destination
      ],
      [origin, destination]
    );
    const labels = rectangles.map((rectangle) => rectangle.label);

    assert.deepEqual(labels, ['Critical shared area', 'Long Street local risk']);
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
      snapped: true,
      routeAlerts: [riskZone(
        'reroute-alert',
        { latitude: -33.975, longitude: 18.56 },
        175
      )]
    };
    const next = applyLiveReroutePreview({
      currentCoordinate: current,
      preview,
      requestRevision: 4,
      riskZones: [riskZone('live-risk', { latitude: -33.98, longitude: 18.57 }, 200)],
      routePlan,
      targets
    });

    assert.equal(next.id, routePlan.id);
    assert.equal(next.route.id, 'route-1-reroute-4');
    assert.deepEqual(next.route.coordinates, preview.coordinates);
    assert.equal(next.route.distance, '5.2 km');
    assert.equal(next.route.eta, '13 min');
    assert.equal(next.origin, 'Current location');
    assert.equal(next.checkpoints[0].kind, 'origin');
    assert.equal(next.checkpoints.at(-1)?.kind, 'destination');
    assert.equal(next.clientId, 'client-1');
    assert.deepEqual(next.riskZones.map(({ id }) => id), ['live-risk', 'reroute-alert']);
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

function polygonRiskZone(
  title: string,
  avoidanceSeverity: 'high' | 'critical',
  coordinates: Array<[number, number]>
): RiskZone {
  const polygonCoordinates = coordinates.map(([latitude, longitude]) => ({ latitude, longitude }));
  const latitude = polygonCoordinates.reduce((total, coordinate) => total + coordinate.latitude, 0) /
    polygonCoordinates.length;
  const longitude = polygonCoordinates.reduce((total, coordinate) => total + coordinate.longitude, 0) /
    polygonCoordinates.length;
  return {
    id: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    description: title,
    severity: 'high',
    ...(avoidanceSeverity === 'critical' ? { avoidanceSeverity } : {}),
    category: 'area-risk',
    coordinate: { latitude, longitude },
    polygonCoordinates,
    shape: 'polygon',
    radiusMeters: 0,
    markerColor: '#d84a3f',
    strokeColor: '#d84a3f',
    fillColor: 'rgba(216,74,63,.18)'
  };
}
