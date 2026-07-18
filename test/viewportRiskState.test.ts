import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AreaRiskViewportRequest } from '../src/features/live-map/areaRiskApiCore';
import type { RiskZone } from '../src/features/live-map/liveMapTypes';
import {
  VIEWPORT_RISK_CACHE_TTL_MS,
  cacheViewportRiskZones,
  canCacheViewportRiskFeed,
  collectFreshViewportRiskZones,
  getCachedViewportRiskZones,
  isAreaRiskFeedMissing,
  isAreaRiskFeedPending,
  isViewportRiskCacheEntryFresh,
  pruneViewportRiskCache,
  resolveViewportRiskCoverageOutcome,
  resolveViewportRiskDisplayZones,
  viewportRiskCacheKey,
  type ViewportRiskCache
} from '../src/features/live-map/viewportRiskState';

describe('viewport risk state', () => {
  it('retains rendered zones during replacement downloads and swaps only when ready', () => {
    const retained = [createZone('retained', 'medium')];
    const incoming = [createZone('incoming', 'high')];

    assert.deepEqual(
      resolveViewportRiskDisplayZones(retained, incoming, false).map((zone) => zone.id),
      ['retained', 'incoming']
    );
    assert.deepEqual(
      resolveViewportRiskDisplayZones(retained, incoming, true).map((zone) => zone.id),
      ['incoming']
    );
    assert.deepEqual(
      resolveViewportRiskDisplayZones(retained, [], false).map((zone) => zone.id),
      ['retained']
    );
  });

  it('keeps an identical stable partition in the same zoom-quantized cache key', () => {
    const first = createRequest({
      minLat: 51.501,
      maxLat: 51.549,
      minLon: -0.149,
      maxLon: -0.051,
      zoom: 10.11
    });
    const nearby = createRequest({
      minLat: 51.501,
      maxLat: 51.549,
      minLon: -0.149,
      maxLon: -0.051,
      zoom: 10.2
    });

    assert.equal(viewportRiskCacheKey(first), viewportRiskCacheKey(nearby));
    assert.notEqual(
      viewportRiskCacheKey(first),
      viewportRiskCacheKey({ ...first, clientId: 'another-tenant' })
    );
    assert.notEqual(
      viewportRiskCacheKey(first),
      viewportRiskCacheKey({ ...first, minLon: 0.2, maxLon: 0.3 })
    );
  });

  it('keeps distinct stabilized detail bboxes in distinct exact cache buckets', () => {
    const first = createRequest({
      minLat: 51.4,
      maxLat: 51.6,
      minLon: -0.2,
      maxLon: 0
    });
    const adjacent = createRequest({
      minLat: 51.42,
      maxLat: 51.62,
      minLon: -0.18,
      maxLon: 0.02
    });

    assert.notEqual(viewportRiskCacheKey(first), viewportRiskCacheKey(adjacent));
  });

  it('never caches pending, partial, or read-failed coverage as complete', () => {
    const complete = {
      coverageStatus: 'current',
      partial: false,
      providerStatus: 'primary',
      readError: null,
      research: null,
      seedStatus: 'covered',
      zones: []
    };
    assert.equal(canCacheViewportRiskFeed(complete), true);
    assert.equal(canCacheViewportRiskFeed({ ...complete, partial: true }), false);
    assert.equal(
      canCacheViewportRiskFeed({ ...complete, readError: 'later page failed' }),
      false
    );
    assert.equal(
      canCacheViewportRiskFeed({ ...complete, providerStatus: 'queued' }),
      false
    );
    assert.equal(
      canCacheViewportRiskFeed({ ...complete, coverageStatus: 'pending' }),
      false
    );
    assert.equal(
      canCacheViewportRiskFeed({ ...complete, seedStatus: 'failed' }),
      false
    );
    assert.equal(
      canCacheViewportRiskFeed(
        {
          ...complete,
          seedStatus: 'not-requested',
          zones: [createZone('shared-only', 'medium')]
        },
        { requireTenantResearch: true }
      ),
      false
    );
    assert.equal(
      isAreaRiskFeedMissing({
        coverageStatus: null,
        providerStatus: 'empty',
        seedStatus: 'not-requested',
        zones: []
      }, { requireTenantResearch: true }),
      true
    );
    assert.equal(
      isAreaRiskFeedPending({
        coverageStatus: 'pending',
        providerStatus: 'primary',
        research: {
          accepted: true,
          coalesced: true,
          coverageStatus: 'pending',
          pending: true,
          queued: false,
          retryAfterSeconds: 10,
          seedId: 'seed-1',
          seedStatus: 'researching',
          status: 'researching'
        },
        seedStatus: 'researching'
      }),
      true
    );
  });

  it('keeps accepted pending research truthful when its strict read fails', () => {
    const pending = resolveViewportRiskCoverageOutcome({
      allRequestsFailed: true,
      cooldownRequestCount: 0,
      cooldownRetryAfterSeconds: 0,
      currentEmptyResearchCount: 0,
      failedRequestCount: 1,
      missingRequestCount: 0,
      partialRequestCount: 0,
      pendingRequestCount: 1,
      readFailureCount: 1,
      researchAvailable: false,
      researchFailureCount: 0,
      researchRequested: true,
      statusFailureCount: 0,
      visibleZoneCount: 0
    });
    assert.equal(pending.coverageState, 'partial');
    assert.match(pending.errorMessage, /research is active/i);
    assert.match(pending.statusMessage, /Researching risk coverage/);

    const cooldown = resolveViewportRiskCoverageOutcome({
      allRequestsFailed: true,
      cooldownRequestCount: 1,
      cooldownRetryAfterSeconds: 90,
      currentEmptyResearchCount: 0,
      failedRequestCount: 1,
      missingRequestCount: 0,
      partialRequestCount: 0,
      pendingRequestCount: 0,
      readFailureCount: 1,
      researchAvailable: false,
      researchFailureCount: 0,
      researchRequested: true,
      statusFailureCount: 0,
      visibleZoneCount: 0
    });
    assert.equal(cooldown.coverageState, 'cooldown');
    assert.match(cooldown.statusMessage, /2 min/);
  });

  it('treats TTL expiry inclusively and rejects future timestamps', () => {
    const now = 1_000_000;
    assert.equal(isViewportRiskCacheEntryFresh({ cachedAt: now }, now), true);
    assert.equal(
      isViewportRiskCacheEntryFresh({ cachedAt: now - VIEWPORT_RISK_CACHE_TTL_MS }, now),
      true
    );
    assert.equal(
      isViewportRiskCacheEntryFresh({ cachedAt: now - VIEWPORT_RISK_CACHE_TTL_MS - 1 }, now),
      false
    );
    assert.equal(isViewportRiskCacheEntryFresh({ cachedAt: now + 1 }, now), false);
  });

  it('returns defensive cache copies and expires stale entries on read', () => {
    const cache: ViewportRiskCache = new Map();
    const request = createRequest();
    const zone = createZone('zone-1', 'high');
    cacheViewportRiskZones(cache, request, [zone], { now: 1000 });

    const cached = getCachedViewportRiskZones(cache, request, { now: 1100 });
    assert.ok(cached);
    cached[0].coordinate.latitude = 0;
    assert.equal(cache.values().next().value?.zones[0].coordinate.latitude, 51.5);

    assert.equal(
      getCachedViewportRiskZones(cache, request, {
        now: 1000 + VIEWPORT_RISK_CACHE_TTL_MS + 1
      }),
      null
    );
    assert.equal(cache.size, 0);
  });

  it('prunes stale entries first and then evicts least-recently-used entries', () => {
    const cache: ViewportRiskCache = new Map();
    const first = createRequest({ minLon: -0.2, maxLon: -0.1 });
    const second = createRequest({ minLon: 0, maxLon: 0.1 });
    const third = createRequest({ minLon: 0.2, maxLon: 0.3 });
    cacheViewportRiskZones(cache, first, [createZone('first', 'high')], {
      maxEntries: 10,
      now: 100
    });
    cacheViewportRiskZones(cache, second, [createZone('second', 'medium')], {
      maxEntries: 10,
      now: 200
    });
    cacheViewportRiskZones(cache, third, [createZone('third', 'low')], {
      maxEntries: 10,
      now: 300
    });
    getCachedViewportRiskZones(cache, first, { now: 400 });

    pruneViewportRiskCache(cache, { maxEntries: 2, now: 500 });

    assert.equal(cache.has(viewportRiskCacheKey(first)), true);
    assert.equal(cache.has(viewportRiskCacheKey(second)), false);
    assert.equal(cache.has(viewportRiskCacheKey(third)), true);
  });

  it('collects fresh zones across neighboring cache buckets and deduplicates canonical IDs', () => {
    const cache: ViewportRiskCache = new Map();
    const first = createRequest({ minLon: -0.2, maxLon: -0.1 });
    const second = createRequest({ minLon: 0, maxLon: 0.1 });
    cacheViewportRiskZones(cache, first, [createZone('shared', 'medium')], { now: 100 });
    cacheViewportRiskZones(cache, second, [
      createZone('shared', 'high'),
      createZone('unique', 'low')
    ], { now: 200 });

    const zones = collectFreshViewportRiskZones(cache, { now: 300 });

    assert.deepEqual(zones.map((zone) => zone.id), ['shared', 'unique']);
    assert.equal(zones[0].severity, 'high');
  });
});

function createRequest(
  overrides: Partial<AreaRiskViewportRequest> = {}
): AreaRiskViewportRequest {
  return {
    bbox: '51.50000,-0.15000,51.55000,-0.05000',
    clientId: 'tenant-1',
    maxLat: 51.55,
    maxLon: -0.05,
    maxRecords: 60,
    minLat: 51.5,
    minLon: -0.15,
    scope: 'detail',
    zoom: 10.1,
    ...overrides
  };
}

function createZone(id: string, severity: RiskZone['severity']): RiskZone {
  return {
    id,
    title: id,
    description: '',
    severity,
    category: 'Area Risk',
    coordinate: { latitude: 51.5, longitude: -0.1 },
    radiusMeters: 500,
    markerColor: '#d84a3f',
    strokeColor: '#d84a3f',
    fillColor: 'rgba(216, 74, 63, 0.18)'
  };
}
