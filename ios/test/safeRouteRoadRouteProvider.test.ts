import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  buildPublicSafeRoutePreviewPayload,
  buildSafeRoutePreviewPayload,
  normalizeSafeRoutePreviewResponse,
  resolveSafeRoutePreviewRequestMode,
  SAFE_ROUTE_POLICY_VERSION,
} from '../src/features/guest-map/safeRouteRoadRouteProviderCore';

const transportSource = readFileSync(
  new URL('../src/features/guest-map/safeRouteRoadRouteProvider.ts', import.meta.url),
  'utf8',
);

const stops = [
  { latitude: -33.9249, longitude: 18.4241 },
  { latitude: -33.9696, longitude: 18.5972 },
];

describe('verified SafeRoute road route provider', () => {
  it('allows only a complete workspace identity or a genuinely public request', () => {
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({
      accessToken: ' token ',
      clientId: ' tenant-1 ',
    }), {
      accessToken: 'token',
      clientId: 'tenant-1',
      kind: 'workspace',
    });
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({}), { kind: 'public' });
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({ accessToken: 'token' }), {
      kind: 'invalid',
    });
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({ clientId: 'public-only' }), {
      kind: 'public',
    });
  });

  it('builds a versioned workspace request without client-derived avoid areas', () => {
    assert.deepEqual(buildSafeRoutePreviewPayload({
      clientId: ' tenant-1 ',
      stops,
      travelMode: 'drive',
    }), {
      client_id: 'tenant-1',
      include_alternatives: true,
      include_road_metadata: true,
      include_route_alerts: true,
      policy_version: 'safe-route-v1',
      target_alternative_count: 2,
      travel_mode: 'drive',
      waypoints: [
        { lat: -33.9249, lon: 18.4241, elevation_m: null },
        { lat: -33.9696, lon: 18.5972, elevation_m: null },
      ],
    });
  });

  it('builds the same versioned planning contract for public travel modes', () => {
    assert.deepEqual(buildPublicSafeRoutePreviewPayload({
      stops,
      travelMode: 'walk',
    }), {
      include_alternatives: true,
      include_route_alerts: true,
      policy_version: 'safe-route-v1',
      target_alternative_count: 2,
      travel_mode: 'walk',
      waypoints: [
        { lat: -33.9249, lon: 18.4241, elevation_m: null },
        { lat: -33.9696, lon: 18.5972, elevation_m: null },
      ],
    });
  });

  it('sends only enabled provider-enforced preferences', () => {
    const preferences = {
      avoidFerries: false,
      avoidMotorways: true,
      avoidTolls: true,
      avoidUnpavedRoads: false,
    };
    assert.deepEqual(buildSafeRoutePreviewPayload({
      clientId: 'tenant-1',
      stops,
      preferences,
    }).preferences, {
      avoid_ferries: false,
      avoid_motorways: true,
      avoid_tolls: true,
      avoid_unpaved_roads: false,
    });
    assert.equal(buildPublicSafeRoutePreviewPayload({
      stops,
      preferences: {
        avoidFerries: false,
        avoidMotorways: false,
        avoidTolls: false,
        avoidUnpavedRoads: false,
      },
    }).preferences, undefined);
  });

  it('requires the exact central risk-avoidance authority', () => {
    const valid = verifiedResponse();
    assert.ok(normalizeSafeRoutePreviewResponse(valid, stops));

    assert.equal(normalizeSafeRoutePreviewResponse({
      ...valid,
      policy_version: undefined,
    }, stops), null);
    assert.equal(normalizeSafeRoutePreviewResponse({
      ...valid,
      policy_version: 'legacy-safe-route',
    }, stops), null);

    for (const riskAvoidance of [
      undefined,
      proof({ policy_version: 'legacy-policy' }),
      proof({ status: 'pending' }),
      proof({ coverage_status: 'partial' }),
      proof({ ignored_area_count: 1 }),
      proof({ ignored_area_count: false }),
    ]) {
      assert.equal(normalizeSafeRoutePreviewResponse({
        ...valid,
        risk_avoidance: riskAvoidance,
      }, stops), null);
    }

    assert.ok(normalizeSafeRoutePreviewResponse({
      ...valid,
      risk_avoidance: proof({
        coverage_status: 'current-empty',
        status: 'not-required',
      }),
    }, stops));
  });

  it('still requires evidence that enabled road preferences were applied', () => {
    const preferences = {
      avoidFerries: false,
      avoidMotorways: true,
      avoidTolls: true,
      avoidUnpavedRoads: false,
    };
    assert.equal(
      normalizeSafeRoutePreviewResponse(
        verifiedResponse(),
        stops,
        'drive',
        preferences,
      ),
      null,
    );
    assert.ok(normalizeSafeRoutePreviewResponse(
      verifiedResponse({
        route_preferences: {
          requested: ['tollRoads', 'motorways'],
          applied: ['tollRoads', 'motorways'],
          provider: 'tomtom',
        },
      }),
      stops,
      'drive',
      preferences,
    ));
  });

  it('rejects manual, unsnapped, and endpoint-mismatched geometry', () => {
    assert.equal(normalizeSafeRoutePreviewResponse(
      verifiedResponse({ provider: 'manual' }),
      stops,
    ), null);
    assert.equal(normalizeSafeRoutePreviewResponse(
      verifiedResponse({ snapped: false }),
      stops,
    ), null);
    assert.equal(normalizeSafeRoutePreviewResponse(verifiedResponse({
      coordinates: [
        { lat: 51.5, lon: -0.1 },
        { lat: 51.6, lon: -0.2 },
      ],
    }), stops), null);
  });

  it('preserves the exact verified coordinate sequence and rejects malformed points', () => {
    const backendCoordinates = [
      { lat: -33.92481, lon: 18.42419 },
      { lat: -33.945123456, lon: 18.510987654 },
      { lat: -33.945123456, lon: 18.510987654 },
      { lat: -33.96951, lon: 18.59711 },
    ];
    const result = normalizeSafeRoutePreviewResponse(verifiedResponse({
      coordinates: backendCoordinates,
    }), stops);

    assert.deepEqual(result?.coordinates, backendCoordinates.map(({ lat, lon }) => ({
      latitude: lat,
      longitude: lon,
    })));
    assert.notDeepEqual(result?.coordinates[0], stops[0]);
    assert.notDeepEqual(result?.coordinates.at(-1), stops.at(-1));

    for (const malformedPoint of [
      null,
      { lat: '-33.945', lon: 18.51 },
      { lat: -91, lon: 18.51 },
    ]) {
      assert.equal(normalizeSafeRoutePreviewResponse(verifiedResponse({
        coordinates: [
          { lat: stops[0].latitude, lon: stops[0].longitude },
          malformedPoint,
          { lat: stops[1].latitude, lon: stops[1].longitude },
        ],
      }), stops), null);
    }
  });

  it('keeps authoritative risk areas separate from route alerts', () => {
    const result = normalizeSafeRoutePreviewResponse(verifiedResponse({
      risk_areas: [{
        id: 'critical-area',
        title: 'Critical area',
        description: 'Avoid this area.',
        severity: 'critical',
        category: 'area-risk',
        coordinate: { lat: -33.94, lon: 18.5 },
        radius_meters: 250,
      }],
      route_alerts: [{
        id: 'road-alert',
        title: 'Narrow road',
        description: 'Width restriction.',
        severity: 'medium',
        category: 'road-suitability',
        coordinate: { lat: -33.945, lon: 18.52 },
        radius_meters: 100,
      }],
    }), stops);

    assert.equal(result?.riskAvoidance.policyVersion, SAFE_ROUTE_POLICY_VERSION);
    assert.deepEqual(result?.riskZones.map(({ id }) => id), ['critical-area']);
    assert.equal(result?.riskZones[0]?.avoidanceSeverity, 'critical');
    assert.deepEqual(result?.routeAlerts?.map(({ id }) => id), ['road-alert']);
  });

  it('requires independent verified proof on every accepted alternative', () => {
    const result = normalizeSafeRoutePreviewResponse(verifiedResponse({
      alternatives: [
        alternativeResponse(-33.94, 18.54, {
          route_alerts: [{
            id: 'alternative-route-alert',
            title: 'Alternative road alert',
            severity: 'high',
            category: 'road-suitability',
            shape: 'route-alert',
            coordinate: { lat: -33.94, lon: 18.54 },
            route_segment_coordinates: [
              { lat: stops[0].latitude, lon: stops[0].longitude },
              { lat: -33.94, lon: 18.54 },
            ],
          }],
        }),
        alternativeResponse(-33.93, 18.55, {
          risk_avoidance: proof({ ignored_area_count: 1 }),
        }),
      ],
    }), stops);

    assert.equal(result?.alternatives?.length, 1);
    assert.equal(result?.alternatives?.[0].riskAvoidance.status, 'verified');
    assert.equal(result?.alternatives?.[0].riskZones[0]?.id, 'alternative-risk');
    assert.deepEqual(
      result?.alternatives?.[0].routeAlerts.map(({ id }) => id),
      ['alternative-route-alert'],
    );

    const missingProof = normalizeSafeRoutePreviewResponse(verifiedResponse({
      alternatives: [alternativeResponse(-33.92, 18.56, {
        risk_avoidance: undefined,
      })],
    }), stops);
    assert.deepEqual(missingProof?.alternatives, []);

    const wrongPolicy = normalizeSafeRoutePreviewResponse(verifiedResponse({
      alternatives: [alternativeResponse(-33.92, 18.56, {
        policy_version: 'legacy-safe-route',
      })],
    }), stops);
    assert.deepEqual(wrongPolicy?.alternatives, []);
  });

  it('retains two disclosed provider alternatives when avoiding risk is impossible', () => {
    const bestEffortProof = proof({
      status: 'best-effort',
      crossed_area_count: 1,
      critical_crossed_area_count: 0,
      risk_exposure_meters: 420,
    });
    const bestEffortFields = {
      best_effort_risk_crossing: true,
      constraints_applied: true,
      constraints_satisfied: false,
      crossed_avoid_area_count: 1,
      critical_crossed_avoid_area_count: 0,
      risk_exposure_meters: 420,
      risk_avoidance: bestEffortProof,
      risk_areas: [{
        id: 'unavoidable-area',
        title: 'Unavoidable area',
        severity: 'high',
        coordinate: { lat: -33.945, lon: 18.51 },
        radius_meters: 300,
      }],
    };
    const result = normalizeSafeRoutePreviewResponse(verifiedResponse({
      ...bestEffortFields,
      alternatives: [
        alternativeResponse(-33.94, 18.54, bestEffortFields),
        alternativeResponse(-33.93, 18.55, bestEffortFields),
      ],
    }), stops);

    assert.equal(result?.riskAvoidance.status, 'best-effort');
    assert.equal(result?.alternatives?.length, 2);
    assert.deepEqual(
      result?.alternatives?.map(({ riskAvoidance }) => riskAvoidance.status),
      ['best-effort', 'best-effort'],
    );

    assert.equal(normalizeSafeRoutePreviewResponse(verifiedResponse({
      ...bestEffortFields,
      crossed_avoid_area_count: 2,
    }), stops), null);
  });

  it('derives optional alternative details without weakening its proof', () => {
    const result = normalizeSafeRoutePreviewResponse(verifiedResponse({
      alternatives: [alternativeResponse(-33.94, 18.54, {
        distance_meters: undefined,
        duration_seconds: undefined,
        guidance_steps: undefined,
      })],
    }), stops);

    assert.equal(result?.alternatives?.length, 1);
    assert.ok((result?.alternatives?.[0].distanceMeters ?? 0) > 0);
    assert.ok((result?.alternatives?.[0].durationSeconds ?? 0) > 0);
    assert.deepEqual(result?.alternatives?.[0].guidanceSteps, []);
    assert.equal(result?.alternatives?.[0].riskAvoidance.status, 'verified');
  });

  it('requires non-driving responses to confirm the requested mode', () => {
    const response = verifiedResponse({ travel_mode: undefined });
    assert.equal(normalizeSafeRoutePreviewResponse(response, stops, 'walk'), null);
    assert.equal(normalizeSafeRoutePreviewResponse({
      ...response,
      travel_mode: 'drive',
    }, stops, 'cycle'), null);
    assert.ok(normalizeSafeRoutePreviewResponse({
      ...response,
      travel_mode: 'walk',
    }, stops, 'walk'));
  });

  it('uses the authenticated verified endpoint for every supported travel mode', () => {
    assert.match(
      transportSource,
      /const requestMode = resolveSafeRoutePreviewRequestMode\(options\)/,
    );
    assert.doesNotMatch(
      transportSource,
      /travelMode === ['"]drive['"][\s\S]*resolveSafeRoutePreviewRequestMode/,
    );
    assert.match(
      transportSource,
      /['"]\/convoy-routes\/verified-route-preview['"]/,
    );
    assert.match(
      transportSource,
      /if \(travelMode === ['"]transit['"]\)[\s\S]*new ApiRequestError\([\s\S]*400[\s\S]*resolveSafeRoutePreviewRequestMode\(options\)/,
    );
  });

  it('uses the public verified endpoint and never falls back to direct OSRM', () => {
    assert.match(
      transportSource,
      /\/mobile\/safe-route\/verified-route-preview/,
    );
    assert.doesNotMatch(
      transportSource,
      /fetchGuestRoadRoutePreview|openstreetmap|project-osrm|profileFallback|completeSafeRouteAlternatives/,
    );
  });

  it('uses a 60 second default verified-planner budget', () => {
    assert.match(
      transportSource,
      /export const SAFE_ROUTE_PREVIEW_TIMEOUT_MS = 60_000/,
    );
  });
});

function verifiedResponse(overrides: Record<string, unknown> = {}) {
  return {
    policy_version: SAFE_ROUTE_POLICY_VERSION,
    provider: 'tomtom',
    snapped: true,
    travel_mode: 'drive',
    distance_meters: 17_000,
    duration_seconds: 1_800,
    coordinates: [
      { lat: stops[0].latitude, lon: stops[0].longitude },
      { lat: -33.945, lon: 18.51 },
      { lat: stops[1].latitude, lon: stops[1].longitude },
    ],
    risk_avoidance: proof(),
    risk_areas: [],
    route_alerts: [],
    ...overrides,
  };
}

function alternativeResponse(
  latitude: number,
  longitude: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    policy_version: SAFE_ROUTE_POLICY_VERSION,
    provider: 'tomtom',
    snapped: true,
    distance_meters: 18_100,
    duration_seconds: 1_920,
    coordinates: [
      { lat: stops[0].latitude, lon: stops[0].longitude },
      { lat: latitude, lon: longitude },
      { lat: stops[1].latitude, lon: stops[1].longitude },
    ],
    guidance_steps: [{
      id: `alternative-${latitude}`,
      instruction: 'Bear left',
      distance_along_meters: 500,
      coordinate: { lat: latitude, lon: longitude },
    }],
    risk_avoidance: proof(),
    risk_areas: [{
      id: 'alternative-risk',
      title: 'Alternative advisory',
      severity: 'medium',
      coordinate: { lat: latitude, lon: longitude },
    }],
    ...overrides,
  };
}

function proof(overrides: Record<string, unknown> = {}) {
  return {
    policy_version: SAFE_ROUTE_POLICY_VERSION,
    status: 'verified',
    coverage_status: 'complete',
    crossed_area_count: 0,
    critical_crossed_area_count: 0,
    ignored_area_count: 0,
    risk_exposure_meters: 0,
    ...overrides,
  };
}
