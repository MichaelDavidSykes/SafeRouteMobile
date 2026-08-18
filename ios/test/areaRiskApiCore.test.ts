import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AREA_RISK_QUERY_COORDINATE_DECIMALS,
  AREA_RISK_OVERVIEW_FOCUS_DELTA,
  AREA_RISK_RESEARCH_ENDPOINT_PATH,
  AREA_RISK_RESPONSE_BOUNDS_EPSILON,
  AREA_RISK_VIEWPORT_PADDING_RATIO,
  AREA_RISK_WORLD_VIEW_LONGITUDE_DELTA,
  areaRiskItemIntersectsBounds,
  areaRiskResponseBoundsMatchRequest,
  approximateMapZoom,
  buildAreaRiskRequestHeaders,
  AREA_RISK_CAPABILITY_HEADER,
  MOBILE_AREA_RISK_CAPABILITY,
  SAFE_ROUTE_RISK_AREA_MAX_RADIUS_METERS,
  buildAreaRiskResearchPayload,
  buildAreaRiskViewportPath,
  canRequestAreaRiskResearch,
  canonicalAreaRiskZoneId,
  deriveRiskZoneAvoidRectangles,
  mergeRiskZonesById,
  normalizeAreaRiskFeed,
  normalizeAreaRiskResearchState,
  partitionAreaRiskItemsByBounds,
  regionToAreaRiskViewportRequests,
  type AreaRiskViewportRequest
} from '../src/features/live-map/areaRiskApiCore';
import type { RiskZone } from '../src/features/live-map/liveMapTypes';

describe('area risk API core', () => {
  it('keeps regional risk coverage visible and creates a stable padded detail request', () => {
    assert.equal(AREA_RISK_VIEWPORT_PADDING_RATIO, 0.45);
    assert.ok(approximateMapZoom({ longitudeDelta: 2 }) < 8);
    const regionalRequests = regionToAreaRiskViewportRequests({
      latitude: 51.5,
      longitude: -0.1,
      latitudeDelta: 1,
      longitudeDelta: 2
    });
    assert.equal(regionalRequests.length, 1);
    assert.equal(regionalRequests[0].scope, 'regional');
    assert.equal(regionalRequests[0].maxRecords, 160);
    assert.equal(regionalRequests[0].bbox, '50.50000,-2.50000,52.50000,2.00000');

    const requests = regionToAreaRiskViewportRequests({
      latitude: 51.5,
      longitude: -0.1,
      latitudeDelta: 0.08,
      longitudeDelta: 0.1
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].scope, 'detail');
    assert.equal(requests[0].maxRecords, 160);
    assert.equal(requests[0].bbox, '51.40000,-0.20000,51.60000,0.00000');

    const nearbyRequests = regionToAreaRiskViewportRequests({
      latitude: 51.503,
      longitude: -0.097,
      latitudeDelta: 0.08,
      longitudeDelta: 0.1
    });
    assert.deepEqual(nearbyRequests, requests);
  });

  it('keeps broad pannable views bounded so moving between cities requests new coverage', () => {
    const capeTown = regionToAreaRiskViewportRequests({
      latitude: -33.925,
      longitude: 18.424,
      latitudeDelta: 40,
      longitudeDelta: 80
    }, { clientId: 'workspace-1' });
    const london = regionToAreaRiskViewportRequests({
      latitude: 51.507,
      longitude: -0.128,
      latitudeDelta: 40,
      longitudeDelta: 80
    }, { clientId: 'workspace-1' });

    assert.equal(AREA_RISK_OVERVIEW_FOCUS_DELTA, 5.5);
    assert.ok(capeTown.length > 0);
    assert.ok(london.length > 0);
    assert.ok(capeTown.every((request) => request.scope === 'regional'));
    assert.ok(london.every((request) => request.scope === 'regional'));
    assert.ok(capeTown.every((request) => request.maxRecords === 80));
    assert.ok(london.every((request) => request.maxRecords === 80));
    assert.notDeepEqual(london, capeTown);
    assert.ok(capeTown.every((request) => canRequestAreaRiskResearch(request, 'token')));
    assert.ok(london.every((request) => canRequestAreaRiskResearch(request, 'token')));
    assert.ok(capeTown.some((request) =>
      request.minLat <= -33.925 && request.maxLat >= -33.925 &&
      request.minLon <= 18.424 && request.maxLon >= 18.424
    ));
    assert.ok(london.some((request) =>
      request.minLat <= 51.507 && request.maxLat >= 51.507 &&
      request.minLon <= -0.128 && request.maxLon >= -0.128
    ));
  });

  it('uses one canonical cached partition only for a near-world view', () => {
    assert.equal(AREA_RISK_WORLD_VIEW_LONGITUDE_DELTA, 300);
    const requests = regionToAreaRiskViewportRequests({
      latitude: 0,
      longitude: 90,
      latitudeDelta: 160,
      longitudeDelta: 300
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].scope, 'global');
    assert.equal(requests[0].maxRecords, 160);
    assert.equal(requests[0].bbox, '-85.00000,-180.00000,85.00000,180.00000');
    const url = new URL(buildAreaRiskViewportPath(requests[0]), 'https://example.test');
    assert.equal(url.searchParams.has('bbox'), false);
    assert.equal(url.searchParams.get('scope'), 'global');
    assert.equal(url.searchParams.get('read_only'), 'true');
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
    assert.equal(publicUrl.searchParams.get('read_only'), 'true');
    assert.equal(publicUrl.searchParams.get('page_size'), '12');
    assert.equal(publicUrl.searchParams.has('client_id'), false);

    const protectedUrl = new URL(
      buildAreaRiskViewportPath(request, { authenticated: true }),
      'https://example.test'
    );
    assert.equal(protectedUrl.searchParams.get('refresh'), 'false');
    assert.equal(protectedUrl.searchParams.get('read_only'), 'true');
    assert.equal(protectedUrl.searchParams.get('client_id'), 'tenant-1');

    const cursorUrl = new URL(
      buildAreaRiskViewportPath(request, {
        authenticated: true,
        bypassCacheNonce: 'read-1',
        cursor: 'opaque-cursor',
        pageSize: 10
      }),
      'https://example.test'
    );
    assert.equal(cursorUrl.searchParams.get('cursor'), 'opaque-cursor');
    assert.equal(cursorUrl.searchParams.get('page_size'), '10');
    assert.equal(cursorUrl.searchParams.get('_read_nonce'), 'read-1');
    assert.equal(cursorUrl.searchParams.get('refresh'), 'false');
    assert.equal(cursorUrl.searchParams.get('read_only'), 'true');
  });

  it('admits only response bounds matching the exact five-decimal HTTP query', () => {
    const request: AreaRiskViewportRequest = {
      bbox: 'stale-caller-bbox-is-not-authoritative',
      maxLat: -33.7999956,
      maxLon: 18.7999956,
      maxRecords: 12,
      minLat: -34.1000044,
      minLon: 18.3000044,
      scope: 'detail',
      zoom: 12
    };
    const url = new URL(buildAreaRiskViewportPath(request), 'https://example.test');

    assert.equal(AREA_RISK_QUERY_COORDINATE_DECIMALS, 5);
    assert.equal(AREA_RISK_RESPONSE_BOUNDS_EPSILON, 0.000001);
    assert.equal(url.searchParams.get('bbox'), '-34.10000,18.30000,-33.80000,18.80000');
    assert.equal(areaRiskResponseBoundsMatchRequest({
      data: {
        bounds: {
          minLat: -34.1,
          maxLat: -33.8,
          minLon: 18.3,
          maxLon: 18.8
        }
      }
    }, request), true);
    assert.equal(areaRiskResponseBoundsMatchRequest({
      data: {
        bounds: {
          minLat: -34.09999,
          maxLat: -33.8,
          minLon: 18.3,
          maxLon: 18.8
        }
      }
    }, request), false);
    assert.equal(areaRiskResponseBoundsMatchRequest({
      data: {
        bounds: {
          minLat: -34.0999991,
          maxLat: -33.8,
          minLon: 18.3,
          maxLon: 18.8
        }
      }
    }, request), true);
  });

  it('rejects invalid, inverted, or precision-collapsed response authority', () => {
    const request: AreaRiskViewportRequest = {
      bbox: '-34.10000,18.30000,-33.80000,18.80000',
      maxLat: -33.8,
      maxLon: 18.8,
      maxRecords: 12,
      minLat: -34.1,
      minLon: 18.3,
      scope: 'detail',
      zoom: 12
    };
    assert.equal(areaRiskResponseBoundsMatchRequest({
      data: {
        bounds: { minLat: -33.8, maxLat: -34.1, minLon: 18.3, maxLon: 18.8 }
      }
    }, request), false);
    assert.equal(areaRiskResponseBoundsMatchRequest({
      data: {
        bounds: { minLat: -34.1, maxLat: -33.8, minLon: 18.3, maxLon: 181 }
      }
    }, request), false);
    assert.equal(areaRiskResponseBoundsMatchRequest({ data: { bounds: request } }, {
      ...request,
      minLat: -34.000004,
      maxLat: -34.000003
    }), false);
    assert.equal(areaRiskResponseBoundsMatchRequest({ data: { bounds: request } }, {
      ...request,
      minLat: -33.8,
      maxLat: -34.1
    }), false);
    assert.throws(
      () => buildAreaRiskViewportPath({ ...request, minLat: -33.8, maxLat: -34.1 }),
      /valid, non-crossing viewport bbox/i
    );
  });

  it('admits only points, circles, and geometry intersecting the requested map partition', () => {
    const bounds = { south: -34.1, west: 18.3, north: -33.8, east: 18.8 };
    const localPoint = { id: 'local', lat: -33.95, lon: 18.5 };
    const overlappingCircle = {
      id: 'edge-circle',
      lat: -33.95,
      lon: 18.29,
      radiusM: 1200
    };
    const crossingGeometry = {
      id: 'crossing',
      coordinates: [
        { lat: -33.95, lon: 18.2 },
        { lat: -33.95, lon: 18.9 }
      ]
    };
    const enclosingPolygon = {
      id: 'enclosing',
      coordinates: [
        { lat: -34.2, lon: 18.2 },
        { lat: -34.2, lon: 18.9 },
        { lat: -33.7, lon: 18.9 },
        { lat: -33.7, lon: 18.2 }
      ]
    };
    const remotePoint = { id: 'remote', lat: 51.5, lon: -0.1, radiusM: 900 };

    assert.equal(areaRiskItemIntersectsBounds(localPoint, bounds), true);
    assert.equal(areaRiskItemIntersectsBounds(overlappingCircle, bounds), true);
    assert.equal(areaRiskItemIntersectsBounds(crossingGeometry, bounds), true);
    assert.equal(areaRiskItemIntersectsBounds(enclosingPolygon, bounds), true);
    assert.equal(areaRiskItemIntersectsBounds(remotePoint, bounds), false);
    assert.equal(areaRiskItemIntersectsBounds({ id: 'unverifiable' }, bounds), false);
    assert.deepEqual(
      partitionAreaRiskItemsByBounds([
        localPoint,
        overlappingCircle,
        remotePoint,
        { id: 'unverifiable' }
      ], bounds),
      {
        accepted: [localPoint, overlappingCircle],
        rejectedCount: 2
      }
    );
  });

  it('normalizes longitudes around an antimeridian request partition', () => {
    assert.equal(areaRiskItemIntersectsBounds({
      id: 'dateline-circle',
      lat: -17.5,
      lon: -179.999,
      radiusM: 1200
    }, {
      south: -17.9,
      west: 179.99,
      north: -17.2,
      east: 180
    }), true);
  });

  it('builds only bounded authenticated research commands with the exact backend body', () => {
    const request: AreaRiskViewportRequest = {
      bbox: '-34.10000,18.30000,-33.80000,18.80000',
      clientId: ' tenant-1 ',
      countries: ['ZA', 'za', ' South Africa '],
      maxLat: -33.8,
      maxLon: 18.8,
      maxRecords: 100,
      minLat: -34.1,
      minLon: 18.3,
      scope: 'detail',
      zoom: 12
    };

    assert.equal(AREA_RISK_RESEARCH_ENDPOINT_PATH, '/intel/map/area-risk/research');
    assert.equal(canRequestAreaRiskResearch(request, ' token '), true);
    assert.equal(canRequestAreaRiskResearch(request, ''), false);
    assert.equal(canRequestAreaRiskResearch({ ...request, scope: 'global' }, 'token'), false);
    assert.equal(
      canRequestAreaRiskResearch({ ...request, minLon: -20, maxLon: 20 }, 'token'),
      false
    );
    assert.deepEqual(buildAreaRiskResearchPayload(request), {
      client_id: 'tenant-1',
      scope: 'detail',
      bounds: {
        min_lat: -34.1,
        max_lat: -33.8,
        min_lon: 18.3,
        max_lon: 18.8
      },
      zoom: 12,
      country_hints: ['za', 'South Africa']
    });
  });

  it('normalizes queued, current-empty, and cooldown research truth', () => {
    assert.deepEqual(normalizeAreaRiskResearchState({
      data: {
        accepted: true,
        coalesced: true,
        coverageStatus: 'pending',
        pending: true,
        queued: false,
        retryAfterSeconds: 10,
        seedId: 'seed-1',
        seedStatus: 'researching',
        status: 'researching'
      }
    }), {
      accepted: true,
      coalesced: true,
      coverageStatus: 'pending',
      pending: true,
      queued: false,
      retryAfterSeconds: 10,
      seedId: 'seed-1',
      seedStatus: 'researching',
      status: 'researching'
    });
    const cooldown = normalizeAreaRiskResearchState({
      data: {
        accepted: true,
        pending: false,
        retryAfterSeconds: 3600,
        status: 'cooldown'
      }
    });
    assert.equal(cooldown.pending, false);
    assert.equal(cooldown.retryAfterSeconds, 3600);
    assert.equal(
      normalizeAreaRiskResearchState({
        data: { status: 'current-empty', accepted: true }
      }).pending,
      false
    );
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
        '9.60000,179.40000,10.40000,180.00000',
        '9.60000,-180.00000,10.40000,-179.60000'
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
            notes: 'Elevated road disruption.',
            confidence: 'analyst-reviewed',
            evidenceCount: 15,
            lastVerifiedAt: '2026-07-08T12:00:00Z',
            validUntil: '2026-08-08T12:00:00Z',
            riskAreaSource: 'custom',
            riskAreaSourceLabel: 'Workspace safety team',
            riskAreaSourceDescription: 'Analyst-authored local safety intelligence.',
            sourceUrl: 'https://example.com/risk/central',
            escalationIndicators: [{
              id: 'indicator-1',
              label: 'Road closures reported',
              confidence: 'high',
              evidenceCount: 4
            }],
            linkedEntities: [{
              id: 'entity-1',
              label: 'Central Station',
              relation: 'nearby',
              type: 'transport-hub'
            }]
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
      description: 'Elevated road disruption.',
      severity: 'high',
      avoidanceSeverity: 'critical',
      category: 'Area Risk',
      coordinate: { latitude: 51.5, longitude: -0.1 },
      polygonCoordinates: undefined,
      shape: 'circle',
      radiusMeters: 1400,
      markerColor: '#d84a3f',
      strokeColor: 'rgba(216, 74, 63, 0.82)',
      fillColor: 'rgba(216, 74, 63, 0.22)',
      confidence: 'analyst-reviewed',
      source: 'Workspace safety team',
      sourceDescription: 'Analyst-authored local safety intelligence.',
      sourceType: 'custom',
      sourceUrl: 'https://example.com/risk/central',
      sourceUrls: ['https://example.com/risk/central'],
      evidenceCount: 15,
      escalationIndicators: [{
        id: 'indicator-1',
        label: 'Road closures reported',
        confidence: 'high',
        evidenceCount: 4
      }],
      linkedEntities: [{
        id: 'entity-1',
        label: 'Central Station',
        relation: 'nearby',
        type: 'transport-hub'
      }],
      lastVerifiedAt: '2026-07-08T12:00:00Z',
      validUntil: '2026-08-08T12:00:00Z'
    });
    assert.equal(feed.zones[1].riskScore, 48);
    assert.equal(feed.zones[1].severity, 'medium');
    assert.equal(feed.zones[1].polygonCoordinates?.length, 4);
    assert.deepEqual(feed.zones[1].coordinate, {
      latitude: -33.925,
      longitude: 18.42
    });
  });

  it('rejects city-scale circles and polygons instead of shrinking them into local hotspots', () => {
    const feed = normalizeAreaRiskFeed({
      data: {
        items: [
          {
            id: 'bounded-locality',
            label: 'Bounded locality',
            lat: -33.925,
            lon: 18.424,
            radiusM: SAFE_ROUTE_RISK_AREA_MAX_RADIUS_METERS
          },
          {
            id: 'whole-cape-town-circle',
            label: 'Cape Town',
            lat: -33.925,
            lon: 18.424,
            radiusM: SAFE_ROUTE_RISK_AREA_MAX_RADIUS_METERS + 1
          },
          {
            id: 'whole-cape-town-polygon',
            label: 'Cape Town polygon',
            radiusM: 1200,
            areaShape: 'polygon',
            coordinates: [
              { lat: -34.10, lon: 18.25 },
              { lat: -34.10, lon: 18.75 },
              { lat: -33.70, lon: 18.75 },
              { lat: -33.70, lon: 18.25 }
            ]
          }
        ],
        providerStatus: 'primary',
        seedStatus: 'covered'
      }
    });

    assert.deepEqual(feed.zones.map((zone) => zone.id), [
      'generated-area-risk-bounded-locality'
    ]);
    assert.equal(feed.zones[0].radiusMeters, SAFE_ROUTE_RISK_AREA_MAX_RADIUS_METERS);
    assert.equal(feed.localCityScaleRejectedCount, 2);
    assert.equal(feed.discardedUnsafeAreaCount, 2);
    assert.equal(feed.partial, true);
    assert.match(feed.safetyWarning ?? '', /excluded 2 unsafe or unverifiable risk areas/i);
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
        { id: 'zone/1', label: 'Station risk', severity: 'high', lat: 51.5, lon: -0.1 },
        { id: 'zone/1', label: 'Station risk', severity: 'critical', lat: 51.5, lon: -0.1 }
      ]
    }).zones;
    assert.equal(zones.length, 1);
    assert.equal(zones[0].id, 'generated-area-risk-zone-1');
    assert.equal(zones[0].severity, 'high');
    assert.equal(zones[0].avoidanceSeverity, 'critical');
  });

  it('coalesces regenerated records through canonical and retired family IDs', () => {
    const current = normalizeAreaRiskFeed({
      items: [{
        id: 'current-zone',
        areaFamilyId: 'family-keeper',
        areaFamilyAliases: ['family-retired', 'family-retired'],
        label: 'Canonical area name',
        severity: 'medium',
        lat: -33.92,
        lon: 18.42,
        radiusM: 700
      }]
    }).zones;
    const retired = normalizeAreaRiskFeed({
      items: [{
        id: 'retired-zone',
        area_family_id: 'family-retired',
        area_family_aliases: ['family-older'],
        label: 'Historical area name',
        severity: 'critical',
        lat: -33.921,
        lon: 18.421,
        radiusM: 800
      }]
    }).zones;
    const older = normalizeAreaRiskFeed({
      items: [{
        id: 'older-zone',
        areaFamilyId: 'family-older',
        label: 'Oldest area name',
        severity: 'low',
        lat: -33.922,
        lon: 18.422,
        radiusM: 600
      }]
    }).zones;

    const zones = mergeRiskZonesById(current, older, retired);

    assert.equal(zones.length, 1);
    assert.equal(zones[0].id, 'generated-area-risk-current-zone');
    assert.equal(zones[0].areaFamilyId, 'family-keeper');
    assert.deepEqual(zones[0].areaFamilyAliases, [
      'family-retired',
      'family-older'
    ]);
    assert.equal(zones[0].severity, 'high');
    assert.equal(zones[0].avoidanceSeverity, 'critical');
    assert.equal(zones[0].radiusMeters, 800);
  });

  it('keeps distinct authoritative families separate despite matching geometry', () => {
    const zones = normalizeAreaRiskFeed({
      items: [{
        id: 'zone-a',
        areaFamilyId: 'family-a',
        label: 'Shared label',
        lat: -33.92,
        lon: 18.42,
        radiusM: 700
      }, {
        id: 'zone-b',
        areaFamilyId: 'family-b',
        label: 'Shared label',
        lat: -33.92,
        lon: 18.42,
        radiusM: 700
      }]
    }).zones;

    assert.equal(zones.length, 2);
    assert.deepEqual(zones.map((zone) => zone.areaFamilyId), [
      'family-a',
      'family-b'
    ]);
  });

  it('adds bearer auth only when supplied by the caller', () => {
    assert.deepEqual(buildAreaRiskRequestHeaders(), {
      Accept: 'application/json',
      [AREA_RISK_CAPABILITY_HEADER]: MOBILE_AREA_RISK_CAPABILITY
    });
    assert.deepEqual(buildAreaRiskRequestHeaders(' token-123 '), {
      Accept: 'application/json',
      [AREA_RISK_CAPABILITY_HEADER]: MOBILE_AREA_RISK_CAPABILITY,
      Authorization: 'Bearer token-123'
    });
  });

  it('derives bounded high/critical avoid rectangles and splits dateline polygons', () => {
    const low = createZone('low', 'Low zone', { latitude: 51.5, longitude: -0.1 });
    const high = createZone('high', 'High zone', { latitude: 51.51, longitude: -0.11 });
    const criticalDateline = {
      ...createZone('high', 'Critical dateline zone', { latitude: 10, longitude: 179.9 }),
      avoidanceSeverity: 'critical' as const,
      polygonCoordinates: [
        { latitude: 9.99, longitude: 179.8 },
        { latitude: 10.01, longitude: 179.8 },
        { latitude: 10.01, longitude: -179.8 },
        { latitude: 9.99, longitude: -179.8 }
      ]
    } satisfies RiskZone;

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
      radiusMeters: 700
    };
    const circleRectangles = deriveRiskZoneAvoidRectangles([crossingCircle]);
    assert.equal(circleRectangles.length, 2);
    assert.ok(circleRectangles.some((rectangle) => rectangle.max_lon === 180));
    assert.ok(circleRectangles.some((rectangle) => rectangle.min_lon === -180));
  });

  it('keeps district-scale high risk advisory while critical areas remain hard exclusions', () => {
    const districtHigh = {
      ...createZone('high', 'Jakes Gerwel district', { latitude: -33.93, longitude: 18.465 }),
      radiusMeters: 0,
      polygonCoordinates: [
        { latitude: -33.940621, longitude: 18.452212 },
        { latitude: -33.940621, longitude: 18.477788 },
        { latitude: -33.919379, longitude: 18.477788 },
        { latitude: -33.919379, longitude: 18.452212 }
      ]
    } satisfies RiskZone;
    const districtCritical = {
      ...districtHigh,
      id: 'critical-district',
      title: 'Critical district exclusion',
      avoidanceSeverity: 'critical' as const
    } satisfies RiskZone;

    const highOnly = deriveRiskZoneAvoidRectangles([districtHigh]);
    const critical = deriveRiskZoneAvoidRectangles([districtCritical]);

    assert.deepEqual(highOnly, []);
    assert.equal(critical.length, 1);
    assert.equal(critical[0].label, 'Critical district exclusion');
  });

  it('hard-avoids a local London risk area while keeping a broad start area advisory', () => {
    const londonBridge = {
      ...createZone('high', 'London Bridge–Borough High Street', {
        latitude: 51.506211,
        longitude: -0.088819
      }),
      radiusMeters: 900
    } satisfies RiskZone;
    const westEnd = {
      ...createZone('high', 'West End', {
        latitude: 51.512899,
        longitude: -0.125597
      }),
      radiusMeters: 1500
    } satisfies RiskZone;

    const rectangles = deriveRiskZoneAvoidRectangles([londonBridge, westEnd]);

    assert.deepEqual(rectangles.map(({ label }) => label), [
      'London Bridge–Borough High Street'
    ]);
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
