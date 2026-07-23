import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSafeRoutePreviewPayload,
  buildPublicSafeRoutePreviewPayload,
  normalizeSafeRoutePreviewResponse,
  resolveSafeRoutePreviewRequestMode
} from '../src/features/guest-map/safeRouteRoadRouteProviderCore';

const stops = [
  { latitude: -33.9249, longitude: 18.4241 },
  { latitude: -33.9696, longitude: 18.5972 }
];
const avoidRectangle = {
  label: 'High risk',
  minLatitude: -33.95,
  maxLatitude: -33.94,
  minLongitude: 18.48,
  maxLongitude: 18.49
};

describe('SafeRoute road route provider', () => {
  it('allows only complete workspace identity or a genuinely public request', () => {
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({
      accessToken: ' token ',
      clientId: ' tenant-1 '
    }), {
      accessToken: 'token',
      clientId: 'tenant-1',
      kind: 'workspace'
    });
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({}), { kind: 'public' });
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({ accessToken: 'token' }), {
      kind: 'invalid'
    });
    assert.deepEqual(resolveSafeRoutePreviewRequestMode({ clientId: 'preview-only' }), {
      kind: 'public'
    });
  });

  it('builds the authenticated planner payload with bounded avoid rectangles', () => {
    assert.deepEqual(buildSafeRoutePreviewPayload({
      clientId: ' tenant-1 ',
      stops,
      avoidRectangles: [{ ...avoidRectangle, label: ' High risk ' }]
    }), {
      client_id: 'tenant-1',
      include_road_metadata: true,
      include_route_alerts: true,
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

  it('uses the strict public endpoint schema without workspace-only flags', () => {
    assert.deepEqual(buildPublicSafeRoutePreviewPayload({
      stops,
      avoidRectangles: [avoidRectangle]
    }), {
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

  it('adds a non-driving travel mode to both route-preview contracts', () => {
    assert.equal(buildSafeRoutePreviewPayload({
      clientId: 'tenant-1',
      stops,
      avoidRectangles: [],
      travelMode: 'cycle'
    }).travel_mode, 'cycle');
    assert.equal(buildPublicSafeRoutePreviewPayload({
      stops,
      avoidRectangles: [],
      travelMode: 'walk'
    }).travel_mode, 'walk');
  });

  it('requires a non-driving response to confirm the requested mode', () => {
    const response = {
      provider: 'tomtom',
      snapped: true,
      coordinates: [
        { lat: -33.9249, lon: 18.4241 },
        { lat: -33.9696, lon: 18.5972 }
      ]
    };

    assert.equal(
      normalizeSafeRoutePreviewResponse(response, stops, [], 'walk'),
      null
    );
    assert.equal(
      normalizeSafeRoutePreviewResponse(
        { ...response, travel_mode: 'drive' },
        stops,
        [],
        'cycle'
      ),
      null
    );
    assert.equal(
      normalizeSafeRoutePreviewResponse(
        { ...response, travel_mode: 'walk' },
        stops,
        [],
        'walk'
      )?.provider,
      'tomtom'
    );
  });

  it('normalizes snapped provider geometry and metrics', () => {
    const result = normalizeSafeRoutePreviewResponse({
      provider: 'tomtom',
      snapped: true,
      avoid_area_count: 1,
      ignored_avoid_area_count: 0,
      constraints_applied: true,
      constraints_satisfied: true,
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
      route_alerts: [
        {
          id: 'road-alert-1',
          title: 'Narrow road warning',
          description: 'Width restriction reported.',
          severity: 'high',
          category: 'road-suitability',
          shape: 'route-alert',
          coordinate: { lat: -33.94, lon: 18.5 },
          route_segment_coordinates: [
            { lat: -33.9249, lon: 18.4241 },
            { lat: -33.94, lon: 18.5 }
          ],
          radius_meters: 175
        },
        {
          id: 'structure-alert-1',
          title: 'Elevated building sightline',
          severity: 'medium',
          category: 'structure-exposure',
          shape: 'sightline',
          coordinate: { lat: -33.941, lon: 18.501 },
          connector_coordinates: [
            { lat: -33.941, lon: 18.501 },
            { lat: -33.94, lon: 18.5 }
          ]
        }
      ],
      coordinates: [
        { lat: -33.9249, lon: 18.4241 },
        { lat: -33.94, lon: 18.5 },
        { lat: -33.9696, lon: 18.5972 }
      ]
    }, stops, [avoidRectangle]);

    assert.equal(result?.provider, 'tomtom');
    assert.equal(result?.distanceMeters, 17000);
    assert.equal(result?.durationSeconds, 1800);
    assert.deepEqual(result?.coordinates[0], stops[0]);
    assert.deepEqual(result?.coordinates.at(-1), stops.at(-1));
    assert.equal(result?.guidanceSteps?.[0].instruction, 'Turn right onto Airport Approach');
    assert.equal(result?.guidanceSteps?.[0].distanceAlongMeters, 1200);
    assert.equal(result?.routeAlerts?.length, 2);
    assert.equal(result?.routeAlerts?.[0].category, 'Road Suitability');
    assert.equal(result?.routeAlerts?.[0].routeSegmentCoordinates?.length, 2);
    assert.equal(result?.routeAlerts?.[1].category, 'Structure Exposure');
    assert.equal(result?.routeAlerts?.[1].connectorCoordinates?.length, 2);
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
    }, stops, [avoidRectangle]), null);
  });

  it('requires exact Backend constraint authority for every submitted avoid area', () => {
    const authorityRectangle = {
      minLatitude: -33.92,
      maxLatitude: -33.91,
      minLongitude: 18.5,
      maxLongitude: 18.51
    };
    const safeCoordinates = stops.map((coordinate) => ({
      lat: coordinate.latitude,
      lon: coordinate.longitude
    }));
    const response = {
      provider: 'osrm',
      snapped: true,
      constraints_applied: true,
      constraints_satisfied: true,
      avoid_area_count: 1,
      ignored_avoid_area_count: 0,
      coordinates: safeCoordinates
    };

    assert.ok(normalizeSafeRoutePreviewResponse(response, stops, [authorityRectangle]));
    assert.equal(normalizeSafeRoutePreviewResponse({
      ...response,
      constraints_satisfied: false
    }, stops, [authorityRectangle]), null);
    assert.equal(normalizeSafeRoutePreviewResponse({
      ...response,
      constraints_applied: false
    }, stops, [authorityRectangle]), null);
    assert.equal(normalizeSafeRoutePreviewResponse({
      ...response,
      avoid_area_count: 2
    }, stops, [authorityRectangle]), null);
    assert.equal(normalizeSafeRoutePreviewResponse({
      ...response,
      ignored_avoid_area_count: 1
    }, stops, [authorityRectangle]), null);
  });

  it('rejects constrained geometry whose segment crosses an avoid area without a vertex inside', () => {
    const crossingRectangle = {
      minLatitude: -33.95,
      maxLatitude: -33.94,
      minLongitude: 18.5,
      maxLongitude: 18.52
    };
    const response = {
      provider: 'osrm',
      snapped: true,
      constraints_applied: true,
      constraints_satisfied: true,
      avoid_area_count: 1,
      ignored_avoid_area_count: 0,
      coordinates: [
        { lat: stops[0].latitude, lon: stops[0].longitude },
        { lat: stops[1].latitude, lon: stops[1].longitude }
      ]
    };

    assert.equal(
      normalizeSafeRoutePreviewResponse(response, stops, [crossingRectangle]),
      null
    );
  });

  it('accepts a strictly safe mixed-side route through a dense risk corridor', () => {
    const denseStops = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.05 }
    ];
    const denseRectangles = [
      {
        minLatitude: -0.003,
        maxLatitude: 0.001,
        minLongitude: 0.018,
        maxLongitude: 0.022
      },
      {
        minLatitude: -0.001,
        maxLatitude: 0.003,
        minLongitude: 0.0222,
        maxLongitude: 0.0262
      }
    ];
    const result = normalizeSafeRoutePreviewResponse({
      provider: 'osrm',
      snapped: true,
      constraints_applied: true,
      constraints_satisfied: true,
      avoid_area_count: 2,
      ignored_avoid_area_count: 0,
      coordinates: [
        { lat: 0, lon: 0 },
        { lat: -0.0034, lon: 0.0176 },
        { lat: -0.0034, lon: 0.0224 },
        { lat: 0.0034, lon: 0.0218 },
        { lat: 0.0034, lon: 0.0266 },
        { lat: 0, lon: 0.05 }
      ]
    }, denseStops, denseRectangles);

    assert.ok(result);
    assert.equal(result.provider, 'osrm');
    assert.equal(result.snapped, true);
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
