import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  approximateMapZoom,
  buildAreaRiskRequestHeaders,
  buildAreaRiskViewportPath,
  canonicalAreaRiskZoneId,
  deriveRiskZoneAvoidRectangles,
  normalizeAreaRiskFeed,
  regionToAreaRiskViewportRequests,
  type AreaRiskViewportRequest
} from '../src/features/live-map/areaRiskApiCore';
import type { RiskZone } from '../src/features/live-map/liveMapTypes';

describe('area risk API core', () => {
  it('gates wide regions and creates a bounded detail request after zooming in', () => {
    assert.ok(approximateMapZoom({ longitudeDelta: 2 }) < 8);
    assert.deepEqual(regionToAreaRiskViewportRequests({
      latitude: 51.5,
      longitude: -0.1,
      latitudeDelta: 1,
      longitudeDelta: 2
    }), []);

    const requests = regionToAreaRiskViewportRequests({
      latitude: 51.5,
      longitude: -0.1,
      latitudeDelta: 0.08,
      longitudeDelta: 0.1
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].scope, 'detail');
    assert.equal(requests[0].maxRecords, 60);
    assert.equal(requests[0].bbox, '51.46000,-0.15000,51.54000,-0.05000');
  });

  it('mirrors bbox, zoom, scope and max_records while protecting tenant-only query data', () => {
    const request: AreaRiskViewportRequest = {
      bbox: '-34.10000,18.30000,-33.80000,18.80000',
      clientId: ' tenant-1 ',
      maxLat: -33.8,
      maxLon: 18.8,
      maxRecords: 12,
      minLat: -34.1,
      minLon: 18.3,
      refresh: true,
      scope: 'detail',
      zoom: 12
    };

    const publicUrl = new URL(buildAreaRiskViewportPath(request), 'https://example.test');
    assert.equal(publicUrl.pathname, '/intel/map/area-risk');
    assert.equal(publicUrl.searchParams.get('bbox'), request.bbox);
    assert.equal(publicUrl.searchParams.get('zoom'), '12.00');
    assert.equal(publicUrl.searchParams.get('scope'), 'detail');
    assert.equal(publicUrl.searchParams.get('max_records'), '12');
    assert.equal(publicUrl.searchParams.get('refresh'), 'false');
    assert.equal(publicUrl.searchParams.has('client_id'), false);

    const protectedUrl = new URL(
      buildAreaRiskViewportPath(request, { authenticated: true }),
      'https://example.test'
    );
    assert.equal(protectedUrl.searchParams.get('refresh'), 'true');
    assert.equal(protectedUrl.searchParams.get('client_id'), 'tenant-1');
  });

  it('splits a dateline-crossing viewport into two bounded API bboxes', () => {
    const requests = regionToAreaRiskViewportRequests({
      latitude: 10,
      longitude: 179.9,
      latitudeDelta: 0.4,
      longitudeDelta: 0.5
    });

    assert.equal(requests.length, 2);
    assert.deepEqual(
      requests.map((request) => request.bbox),
      [
        '9.80000,179.65000,10.20000,180.00000',
        '9.80000,-180.00000,10.20000,-179.85000'
      ]
    );
  });

  it('normalizes provider circles and polygons into stable RiskZone records', () => {
    const circleCoordinates = Array.from({ length: 16 }, (_, index) => ({
      lat: 51.5 + Math.sin(index) * 0.01,
      lon: -0.1 + Math.cos(index) * 0.01
    }));
    const feed = normalizeAreaRiskFeed({
      data: {
        source: 'General Risk Area Source',
        fetchedAt: '2026-07-09T12:00:00Z',
        items: [
          {
            id: ' Safe Route/Central 1 ',
            label: 'Central district',
            severity: 'critical',
            lat: 51.5,
            lon: -0.1,
            radiusM: 1400,
            areaShape: 'circle',
            coordinates: circleCoordinates,
            notes: 'Elevated road disruption.'
          },
          {
            id: 'polygon-1',
            label: 'Port perimeter',
            riskScore: 48,
            area_shape: 'polygon',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [18.40, -33.94],
                [18.44, -33.94],
                [18.44, -33.91],
                [18.40, -33.91],
                [18.40, -33.94]
              ]]
            }
          },
          { id: 'invalid', label: 'Missing geometry' }
        ]
      }
    });

    assert.equal(feed.fetchedAt, '2026-07-09T12:00:00Z');
    assert.equal(feed.zones.length, 2);
    assert.deepEqual(feed.zones[0], {
      id: 'generated-area-risk-safe-route-central-1',
      title: 'Central district',
      description: 'Elevated road disruption. Source: General Risk Area Source.',
      severity: 'high',
      category: 'Area Risk',
      coordinate: { latitude: 51.5, longitude: -0.1 },
      polygonCoordinates: undefined,
      shape: 'circle',
      radiusMeters: 1400,
      markerColor: '#d84a3f',
      strokeColor: 'rgba(216, 74, 63, 0.72)',
      fillColor: 'rgba(216, 74, 63, 0.18)'
    });
    assert.equal(feed.zones[1].severity, 'medium');
    assert.equal(feed.zones[1].polygonCoordinates?.length, 4);
    assert.deepEqual(feed.zones[1].coordinate, {
      latitude: -33.925,
      longitude: 18.42
    });
  });

  it('uses deterministic fallback IDs and merges duplicate provider IDs canonically', () => {
    const identity = {
      coordinate: { latitude: 51.5, longitude: -0.1 },
      radiusMeters: 500,
      severity: 'high' as const,
      title: 'Station risk'
    };
    assert.equal(
      canonicalAreaRiskZoneId(undefined, identity),
      canonicalAreaRiskZoneId('', identity)
    );

    const zones = normalizeAreaRiskFeed({
      items: [
        { id: 'zone/1', label: 'Station risk', severity: 'medium', lat: 51.5, lon: -0.1 },
        { id: 'zone/1', label: 'Station risk', severity: 'high', lat: 51.5, lon: -0.1 }
      ]
    }).zones;
    assert.equal(zones.length, 1);
    assert.equal(zones[0].id, 'generated-area-risk-zone-1');
    assert.equal(zones[0].severity, 'high');
  });

  it('adds bearer auth only when supplied by the caller', () => {
    assert.deepEqual(buildAreaRiskRequestHeaders(), {
      Accept: 'application/json'
    });
    assert.deepEqual(buildAreaRiskRequestHeaders(' token-123 '), {
      Accept: 'application/json',
      Authorization: 'Bearer token-123'
    });
  });

  it('derives bounded high/critical avoid rectangles and splits dateline polygons', () => {
    const low = createZone('low', 'Low zone', { latitude: 51.5, longitude: -0.1 });
    const high = createZone('high', 'High zone', { latitude: 51.51, longitude: -0.11 });
    const criticalDateline = {
      ...createZone('high', 'Critical dateline zone', { latitude: 10, longitude: 179.9 }),
      severity: 'critical',
      polygonCoordinates: [
        { latitude: 9.99, longitude: 179.8 },
        { latitude: 10.01, longitude: 179.8 },
        { latitude: 10.01, longitude: -179.8 },
        { latitude: 9.99, longitude: -179.8 }
      ]
    } as unknown as RiskZone;

    const rectangles = deriveRiskZoneAvoidRectangles([low, high, criticalDateline]);

    assert.equal(rectangles.length, 3);
    assert.equal(rectangles[0].label, 'Critical dateline zone');
    assert.equal(rectangles[1].label, 'Critical dateline zone');
    assert.ok(rectangles.some((rectangle) => rectangle.label === 'High zone'));
    assert.ok(rectangles.every((rectangle) => rectangle.max_lat > rectangle.min_lat));
    assert.ok(rectangles.every((rectangle) => rectangle.max_lon > rectangle.min_lon));
    assert.ok(rectangles.some((rectangle) => rectangle.max_lon === 180));
    assert.ok(rectangles.some((rectangle) => rectangle.min_lon === -180));

    const crossingCircle = {
      ...createZone('high', 'Crossing circle', { latitude: 0, longitude: 179.999 }),
      radiusMeters: 1000
    };
    const circleRectangles = deriveRiskZoneAvoidRectangles([crossingCircle]);
    assert.equal(circleRectangles.length, 2);
    assert.ok(circleRectangles.some((rectangle) => rectangle.max_lon === 180));
    assert.ok(circleRectangles.some((rectangle) => rectangle.min_lon === -180));
  });
});

function createZone(
  severity: RiskZone['severity'],
  title: string,
  coordinate: RiskZone['coordinate']
): RiskZone {
  return {
    id: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    description: '',
    severity,
    category: 'Area Risk',
    coordinate,
    radiusMeters: 500,
    markerColor: '#d84a3f',
    strokeColor: '#d84a3f',
    fillColor: 'rgba(216, 74, 63, 0.18)'
  };
}
