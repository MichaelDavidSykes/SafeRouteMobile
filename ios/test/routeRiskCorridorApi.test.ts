import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRouteRiskCorridorRegions,
  loadRouteRiskCorridor
} from '../src/features/live-map/routeRiskCorridorCore';
import { fetchAreaRiskAlongRoute as fetchAreaRiskAlongRouteTransport } from '../src/features/live-map/routeRiskCorridorApiCore';
import { AreaRiskRetryableReadError } from '../src/features/live-map/areaRiskApiTransportCore';
import {
  AREA_RISK_CAPABILITY_HEADER,
  MOBILE_AREA_RISK_CAPABILITY
} from '../src/features/live-map/areaRiskApiCore';
import type { RiskZone } from '../src/features/live-map/liveMapTypes';

describe('route risk corridor loading', () => {
  it('samples long routes into a bounded set of overlapping risk chunks', () => {
    const regions = buildRouteRiskCorridorRegions([
      { latitude: -33.9249, longitude: 18.4241 },
      { latitude: -34.035, longitude: 19.0 },
      { latitude: -34.15, longitude: 19.65 }
    ]);

    assert.ok(regions.length >= 3);
    assert.ok(regions.length <= 8);
    assert.deepEqual(
      { latitude: regions[0].latitude, longitude: regions[0].longitude },
      { latitude: -33.9249, longitude: 18.4241 }
    );
    assert.deepEqual(
      { latitude: regions.at(-1)?.latitude, longitude: regions.at(-1)?.longitude },
      { latitude: -34.15, longitude: 19.65 }
    );
    assert.ok(regions.every((region) => region.latitudeDelta >= 0.12 && region.latitudeDelta <= 0.75));
  });

  it('downloads concurrently and deduplicates bounded provider risk chunks', async () => {
    const regions = buildRouteRiskCorridorRegions([
      { latitude: -33.9249, longitude: 18.4241 },
      { latitude: -33.9696, longitude: 18.5972 }
    ]);
    let requests = 0;
    const sharedRisk = riskZone('shared-risk');
    const zones = await loadRouteRiskCorridor(regions, async () => {
      requests += 1;
      return [sharedRisk];
    });

    assert.equal(zones.length, 1);
    assert.equal(zones[0].title, 'shared-risk');
    assert.equal(requests, 2);
  });

  it('does not request corridor risks for incomplete geometry', async () => {
    let requests = 0;
    const regions = buildRouteRiskCorridorRegions([
      { latitude: -33.9249, longitude: 18.4241 }
    ]);
    const zones = await loadRouteRiskCorridor(regions, async () => {
      requests += 1;
      return [riskZone('unexpected')];
    });

    assert.deepEqual(zones, []);
    assert.equal(requests, 0);
  });

  it('uses strict read-only transport for every corridor chunk and never researches', async () => {
    const calls: Array<{ init: RequestInit; url: URL }> = [];
    const zones = await fetchAreaRiskAlongRoute([
      { latitude: -33.9249, longitude: 18.4241 },
      { latitude: -33.9696, longitude: 18.5972 }
    ], {
      accessToken: 'token-1',
      clientId: 'tenant-1',
      request: async (input, init = {}) => {
        const url = new URL(String(input));
        calls.push({ init, url });
        const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
          .split(',')
          .map(Number);
        return new Response(JSON.stringify({
          data: {
            bounds: { minLat, maxLat, minLon, maxLon },
            hasMore: false,
            items: [{
              id: `risk-${calls.length}`,
              label: `Risk ${calls.length}`,
              lat: (minLat + maxLat) / 2,
              lon: (minLon + maxLon) / 2,
              severity: 'high'
            }],
            privacy: tenantPrivacy(),
            providerStatus: 'primary',
            seedStatus: 'covered'
          }
        }), { status: 200 });
      }
    });

    assert.ok(zones.length >= 1);
    assert.ok(calls.length >= 2);
    calls.forEach(({ init, url }) => {
      assert.notEqual(init.method, 'POST');
      assert.equal(url.pathname.endsWith('/intel/map/area-risk'), true);
      assert.equal(url.searchParams.get('refresh'), 'false');
      assert.equal(url.searchParams.get('read_only'), 'true');
      assert.equal(url.searchParams.get('client_id'), 'tenant-1');
      assert.equal(url.searchParams.get('max_records'), '160');
      assert.equal(
        (init.headers as Record<string, string>)[AREA_RISK_CAPABILITY_HEADER],
        MOBILE_AREA_RISK_CAPABILITY
      );
    });
  });

  it('fails closed when a strict corridor chunk is pending or incomplete', async () => {
    const calls: Array<{ init: RequestInit; url: URL }> = [];
    await assert.rejects(
      fetchAreaRiskAlongRoute([
        { latitude: -33.9249, longitude: 18.4241 },
        { latitude: -33.9696, longitude: 18.5972 }
      ], {
        accessToken: 'token-1',
        clientId: 'tenant-1',
        request: async (input, init = {}) => {
          const url = new URL(String(input));
          calls.push({ init, url });
          const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
            .split(',')
            .map(Number);
          return new Response(JSON.stringify({
            data: {
              bounds: { minLat, maxLat, minLon, maxLon },
              hasMore: false,
              items: [],
              privacy: tenantPrivacy(),
              providerStatus: 'queued',
              seedStatus: 'researching'
            }
          }), { status: 200 });
        }
      }),
      /coverage is incomplete/i
    );
    assert.equal(calls.some(({ init }) => init.method === 'POST'), false);
    assert.ok(calls.every(({ url }) => url.searchParams.get('read_only') === 'true'));
  });

  it('fails closed when the provider excluded a city-scale route risk area', async () => {
    await assert.rejects(
      fetchAreaRiskAlongRoute([
        { latitude: -33.9249, longitude: 18.4241 },
        { latitude: -33.9696, longitude: 18.5972 }
      ], {
        accessToken: 'token-1',
        clientId: 'tenant-1',
        request: async (input) => {
          const url = new URL(String(input));
          const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
            .split(',')
            .map(Number);
          return new Response(JSON.stringify({
            data: {
              bounds: { minLat, maxLat, minLon, maxLon },
              hasMore: false,
              items: [],
              privacy: tenantPrivacy(),
              providerStatus: 'partial',
              safetyFilter: {
                capability: 'safe-route-risk-rejection-v1',
                rejectedCount: 1,
                localityRejectedCount: 0,
                cityScaleRejectedCount: 1,
                invalidRecordRejectedCount: 0,
                outOfBoundsRejectedCount: 0
              },
              seedStatus: 'covered'
            }
          }), { status: 200 });
        }
      }),
      /coverage is incomplete/i
    );
  });

  it('fails closed when a corridor response contains only remote risk geometry', async () => {
    await assert.rejects(
      fetchAreaRiskAlongRoute([
        { latitude: -33.9249, longitude: 18.4241 },
        { latitude: -33.9696, longitude: 18.5972 }
      ], {
        accessToken: 'token-1',
        clientId: 'tenant-1',
        request: async (input) => {
          const url = new URL(String(input));
          const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
            .split(',')
            .map(Number);
          return new Response(JSON.stringify({
            data: {
              bounds: { minLat, maxLat, minLon, maxLon },
              hasMore: false,
              items: [{
                id: 'remote-london',
                label: 'Remote London risk',
                lat: 51.5,
                lon: -0.1,
                radiusM: 900,
                severity: 'high'
              }],
              privacy: tenantPrivacy(),
              providerStatus: 'primary',
              seedStatus: 'covered'
            }
          }), { status: 200 });
        }
      }),
      /coverage is incomplete/i
    );
  });

  it('fails closed when strict coverage reports a terminal research failure', async () => {
    await assert.rejects(
      fetchAreaRiskAlongRoute([
        { latitude: -33.9249, longitude: 18.4241 },
        { latitude: -33.9696, longitude: 18.5972 }
      ], {
        accessToken: 'token-1',
        clientId: 'tenant-1',
        request: async (input) => {
          const url = new URL(String(input));
          const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
            .split(',')
            .map(Number);
          return new Response(JSON.stringify({
            data: {
              bounds: { minLat, maxLat, minLon, maxLon },
              hasMore: false,
              items: [],
              privacy: tenantPrivacy(),
              providerStatus: 'empty',
              seedStatus: 'failed'
            }
          }), { status: 200 });
        }
      }),
      /workspace research did not complete/i
    );
  });

  it('does not treat shared items as complete tenant AOI research', async () => {
    await assert.rejects(
      fetchAreaRiskAlongRoute([
        { latitude: -33.9249, longitude: 18.4241 },
        { latitude: -33.9696, longitude: 18.5972 }
      ], {
        accessToken: 'token-1',
        clientId: 'tenant-1',
        request: async (input) => {
          const url = new URL(String(input));
          const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
            .split(',')
            .map(Number);
          return new Response(JSON.stringify({
            data: {
              bounds: { minLat, maxLat, minLon, maxLon },
              hasMore: false,
              items: [{
                id: 'shared-only',
                label: 'Shared signal',
                lat: (minLat + maxLat) / 2,
                lon: (minLon + maxLon) / 2,
                severity: 'high'
              }],
              privacy: tenantPrivacy(),
              providerStatus: 'primary',
              seedStatus: 'not-requested'
            }
          }), { status: 200 });
        }
      }),
      /coverage is incomplete/i
    );
  });

  it('accepts an honestly empty public strict feed without requiring tenant research', async () => {
    const zones = await fetchAreaRiskAlongRoute([
      { latitude: -33.9249, longitude: 18.4241 },
      { latitude: -33.9696, longitude: 18.5972 }
    ], {
      request: async (input) => {
        const url = new URL(String(input));
        const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
          .split(',')
          .map(Number);
        return new Response(JSON.stringify({
          data: {
            bounds: { minLat, maxLat, minLon, maxLon },
            hasMore: false,
            items: [],
            privacy: publicPrivacy(),
            providerStatus: 'empty',
            seedStatus: 'not-requested'
          }
        }), { status: 200 });
      }
    });

    assert.deepEqual(zones, []);
  });

  it('waits for Retry-After once, then recovers strict corridor proof without researching', async () => {
    const coordinates = [
      { latitude: -33.9249, longitude: 18.4241 },
      { latitude: -33.9696, longitude: 18.5972 }
    ];
    const firstWaveCount = buildRouteRiskCorridorRegions(coordinates).length;
    const calls: Array<{ at: number; init: RequestInit; url: URL }> = [];
    const startedAt = Date.now();
    const zones = await fetchAreaRiskAlongRoute(coordinates, {
      accessToken: 'token-1',
      clientId: 'tenant-1',
      request: async (input, init = {}) => {
        const url = new URL(String(input));
        calls.push({ at: Date.now(), init, url });
        if (calls.length <= firstWaveCount) {
          return new Response(JSON.stringify({
            detail: {
              message: 'SafeRoute risk coverage is temporarily unavailable',
              operation: 'read',
              retryAfterSeconds: 1
            }
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '1'
            },
            status: 503
          });
        }
        const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
          .split(',')
          .map(Number);
        return new Response(JSON.stringify({
          data: {
            bounds: { minLat, maxLat, minLon, maxLon },
            hasMore: false,
            items: [{
              id: `recovered-${calls.length}`,
              label: 'Recovered risk',
              lat: (minLat + maxLat) / 2,
              lon: (minLon + maxLon) / 2,
              severity: 'high'
            }],
            privacy: tenantPrivacy(),
            providerStatus: 'primary',
            seedStatus: 'covered'
          }
        }), { status: 200 });
      }
    });

    assert.ok(zones.length >= 1);
    assert.equal(calls.length, firstWaveCount * 2);
    assert.ok(calls[firstWaveCount].at - startedAt >= 900);
    assert.ok(calls.every(({ init, url }) =>
      init.method !== 'POST'
      && url.searchParams.get('read_only') === 'true'
    ));
  });

  it('hard-caps automatic corridor recovery at one retry and keeps proof closed', async () => {
    const coordinates = [
      { latitude: -33.9249, longitude: 18.4241 },
      { latitude: -33.9696, longitude: 18.5972 }
    ];
    const requestCount = buildRouteRiskCorridorRegions(coordinates).length;
    let calls = 0;
    await assert.rejects(
      fetchAreaRiskAlongRoute(coordinates, {
        accessToken: 'token-1',
        clientId: 'tenant-1',
        request: async () => {
          calls += 1;
          return new Response(JSON.stringify({
            detail: {
              message: 'SafeRoute risk coverage is temporarily unavailable',
              operation: 'read',
              retryAfterSeconds: 0
            }
          }), {
            headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
            status: 503
          });
        }
      }),
      (error: unknown) => error instanceof AreaRiskRetryableReadError
    );
    assert.equal(calls, requestCount * 2);
  });
});

function fetchAreaRiskAlongRoute(
  ...[coordinates, options]: Parameters<typeof fetchAreaRiskAlongRouteTransport>
) {
  return fetchAreaRiskAlongRouteTransport(coordinates, {
    ...options,
    apiBase: 'https://api.example.test/api/v1'
  });
}

function riskZone(id: string): RiskZone {
  return {
    id,
    title: id,
    description: id,
    severity: 'high',
    category: 'area-risk',
    coordinate: { latitude: -33.95, longitude: 18.5 },
    radiusMeters: 300,
    markerColor: '#d84a3f',
    strokeColor: '#d84a3f',
    fillColor: 'rgba(216,74,63,.18)'
  };
}

function tenantPrivacy() {
  return {
    tenantScopedSeed: true,
    sharedOutput: 'sanitized-global'
  };
}

function publicPrivacy() {
  return {
    tenantScopedSeed: false,
    sharedOutput: 'sanitized-global'
  };
}
