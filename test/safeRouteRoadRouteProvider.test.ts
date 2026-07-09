import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSafeRoutePreviewPayload,
  normalizeSafeRoutePreviewResponse
} from '../src/features/guest-map/safeRouteRoadRouteProviderCore';

const stops = [
  { latitude: -33.9249, longitude: 18.4241 },
  { latitude: -33.9696, longitude: 18.5972 }
];

describe('SafeRoute road route provider', () => {
  it('builds the authenticated planner payload with bounded avoid rectangles', () => {
    assert.deepEqual(buildSafeRoutePreviewPayload({
      clientId: ' tenant-1 ',
      stops,
      avoidRectangles: [{
        label: ' High risk ',
        minLatitude: -33.95,
        maxLatitude: -33.94,
        minLongitude: 18.48,
        maxLongitude: 18.49
      }]
    }), {
      client_id: 'tenant-1',
      waypoints: [
        { lat: -33.9249, lon: 18.4241, elevation_m: null },
        { lat: -33.9696, lon: 18.5972, elevation_m: null }
      ],
      avoid_rectangles: [{
        label: 'High risk',
        min_lat: -33.95,
        max_lat: -33.94,
        min_lon: 18.48,
        max_lon: 18.49
      }]
    });
  });

  it('normalizes snapped provider geometry and metrics', () => {
    const result = normalizeSafeRoutePreviewResponse({
      provider: 'tomtom',
      snapped: true,
      avoid_area_count: 1,
      distance_meters: 17000,
      duration_seconds: 1800,
      guidance_steps: [{
        id: 'step-1',
        instruction: 'Turn right onto Airport Approach',
        maneuver_type: 'turn',
        modifier: 'right',
        road_name: 'Airport Approach',
        distance_along_meters: 1200,
        distance_meters: 800,
        duration_seconds: 90,
        coordinate: { lat: -33.94, lon: 18.5 }
      }],
      coordinates: [
        { lat: -33.9249, lon: 18.4241 },
        { lat: -33.94, lon: 18.5 },
        { lat: -33.9696, lon: 18.5972 }
      ]
    }, stops, 1);

    assert.equal(result?.provider, 'tomtom');
    assert.equal(result?.distanceMeters, 17000);
    assert.equal(result?.durationSeconds, 1800);
    assert.deepEqual(result?.coordinates[0], stops[0]);
    assert.deepEqual(result?.coordinates.at(-1), stops.at(-1));
    assert.equal(result?.guidanceSteps?.[0].instruction, 'Turn right onto Airport Approach');
    assert.equal(result?.guidanceSteps?.[0].distanceAlongMeters, 1200);
  });

  it('rejects manual, unsnapped, endpoint-mismatched, and unconstrained responses', () => {
    assert.equal(normalizeSafeRoutePreviewResponse({
      provider: 'manual',
      snapped: false,
      coordinates: stops
    }, stops), null);
    assert.equal(normalizeSafeRoutePreviewResponse({
      provider: 'osrm',
      snapped: true,
      coordinates: [
        { lat: 51.5, lon: -0.1 },
        { lat: 51.6, lon: -0.2 }
      ]
    }, stops), null);
    assert.equal(normalizeSafeRoutePreviewResponse({
      provider: 'tomtom',
      snapped: true,
      avoid_area_count: 0,
      coordinates: stops.map((coordinate) => ({
        lat: coordinate.latitude,
        lon: coordinate.longitude
      }))
    }, stops, 1), null);
  });

  it('requires intermediate requested stops to appear in order', () => {
    const orderedStops = [
      stops[0],
      { latitude: -33.94, longitude: 18.48 },
      stops[1]
    ];
    const result = normalizeSafeRoutePreviewResponse({
      provider: 'osrm',
      snapped: true,
      coordinates: [
        { lat: -33.9249, lon: 18.4241 },
        { lat: -33.94, lon: 18.48 },
        { lat: -33.9696, lon: 18.5972 }
      ]
    }, orderedStops);

    assert.ok(result);
  });
});
