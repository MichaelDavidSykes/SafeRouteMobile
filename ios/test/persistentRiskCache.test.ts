import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AreaRiskViewportRequest } from '../src/features/live-map/areaRiskApiCore';
import type { RiskZone } from '../src/features/live-map/liveMapTypes';
import {
  createPersistentRiskWriteQueue
} from '../src/features/live-map/persistentRiskWriteQueue';
import {
  cacheViewportRiskZones,
  viewportRiskCacheKey,
  type ViewportRiskCache
} from '../src/features/live-map/viewportRiskState';
import {
  VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS,
  VIEWPORT_RISK_PERSISTENT_MAX_ENTRIES,
  mergeViewportRiskCaches,
  parseViewportRiskCache,
  serializeViewportRiskCache
} from '../src/features/live-map/viewportRiskPersistentCacheCore';
import {
  parseWorkspaceRiskCache,
  serializeWorkspaceRiskCache
} from '../src/features/live-map/workspaceRiskPersistentCacheCore';

describe('persistent risk cache', () => {
  it('restores a defensive, principal-scoped viewport snapshot', () => {
    const cache: ViewportRiskCache = new Map();
    const request = createRequest();
    cacheViewportRiskZones(cache, request, [createZone('cached')], {
      now: 1000
    });

    const raw = serializeViewportRiskCache(cache, 'principal-1', 1100);
    const restored = parseViewportRiskCache(raw, 'principal-1', 1200);

    assert.ok(restored);
    assert.equal(restored.size, 1);
    assert.equal(
      restored.get(viewportRiskCacheKey(request))?.zones[0].id,
      'cached'
    );
    restored.get(viewportRiskCacheKey(request))!.zones[0].coordinate.latitude = 0;
    assert.equal(
      cache.get(viewportRiskCacheKey(request))?.zones[0].coordinate.latitude,
      51.5
    );
    assert.equal(parseViewportRiskCache(raw, 'principal-2', 1200), null);
  });

  it('hard-expires old cache data and rejects corrupt geometry', () => {
    const cache: ViewportRiskCache = new Map();
    cacheViewportRiskZones(
      cache,
      createRequest(),
      [createZone('expiring')],
      { now: 1000 }
    );
    const raw = serializeViewportRiskCache(cache, 'principal-1', 1100);

    assert.equal(
      parseViewportRiskCache(
        raw,
        'principal-1',
        1000 + VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS + 1
      ),
      null
    );

    const corrupt = JSON.parse(raw) as {
      entries: Array<{ zones: Array<{ coordinate: { latitude: number } }> }>;
    };
    corrupt.entries[0].zones[0].coordinate.latitude = 999;
    assert.equal(
      parseViewportRiskCache(
        JSON.stringify(corrupt),
        'principal-1',
        1200
      ),
      null
    );
  });

  it('salvages valid viewport entries when one stored bucket is corrupt', () => {
    const cache: ViewportRiskCache = new Map();
    cacheViewportRiskZones(
      cache,
      createRequest(),
      [createZone('valid')],
      { now: 1000 }
    );
    cacheViewportRiskZones(
      cache,
      createRequest({
        bbox: '51.50000,0.10000,51.55000,0.20000',
        minLon: 0.1,
        maxLon: 0.2
      }),
      [createZone('corrupt')],
      { now: 1100 }
    );
    const record = JSON.parse(
      serializeViewportRiskCache(cache, 'principal-1', 1200)
    ) as {
      entries: Array<{
        zones: Array<{ coordinate: { latitude: number } }>;
      }>;
    };
    const corruptEntry = record.entries.find((entry) =>
      entry.zones.some((zone) => (
        zone as unknown as { id: string }
      ).id === 'corrupt')
    );
    assert.ok(corruptEntry);
    corruptEntry.zones[0].coordinate.latitude = 999;

    const restored = parseViewportRiskCache(
      JSON.stringify(record),
      'principal-1',
      1300
    );
    assert.ok(restored);
    assert.equal(restored.size, 1);
    assert.equal(
      Array.from(restored.values())[0].zones[0].id,
      'valid'
    );
  });

  it('bounds persisted viewports and keeps the newest cache entry on merge', () => {
    const cache: ViewportRiskCache = new Map();
    for (
      let index = 0;
      index < VIEWPORT_RISK_PERSISTENT_MAX_ENTRIES + 4;
      index += 1
    ) {
      cacheViewportRiskZones(
        cache,
        createRequest({
          bbox: `51.5,${index},51.55,${index + 0.05}`,
          minLon: index,
          maxLon: index + 0.05
        }),
        [createZone(`zone-${index}`)],
        { maxEntries: 40, now: 1000 + index }
      );
    }
    const restored = parseViewportRiskCache(
      serializeViewportRiskCache(cache, 'principal-1', 2000),
      'principal-1',
      2100
    );
    assert.equal(restored?.size, VIEWPORT_RISK_PERSISTENT_MAX_ENTRIES);
    assert.equal(
      Array.from(restored?.values() || []).some((entry) =>
        entry.zones.some((zone) => zone.id === 'zone-0')
      ),
      false
    );

    const request = createRequest();
    const oldCache: ViewportRiskCache = new Map();
    const newCache: ViewportRiskCache = new Map();
    cacheViewportRiskZones(oldCache, request, [createZone('old')], {
      now: 1000
    });
    cacheViewportRiskZones(newCache, request, [createZone('new')], {
      now: 2000
    });
    const merged = mergeViewportRiskCaches(oldCache, newCache, 2100);
    assert.equal(merged.get(viewportRiskCacheKey(request))?.zones[0].id, 'new');
  });

  it('restores shared workspace markers only for the matching principal and workspace', () => {
    const raw = serializeWorkspaceRiskCache(
      'principal-1',
      'workspace-1',
      [createZone('shared')],
      1000
    );
    const snapshot = parseWorkspaceRiskCache(
      raw,
      'principal-1',
      'workspace-1',
      1200
    );
    assert.equal(snapshot?.zones[0].id, 'shared');
    assert.equal(
      parseWorkspaceRiskCache(
        raw,
        'principal-1',
        'workspace-2',
        1200
      ),
      null
    );
    assert.equal(
      parseWorkspaceRiskCache(
        raw,
        'principal-2',
        'workspace-1',
        1200
      ),
      null
    );
  });

  it('coalesces rapid cache saves and preserves clear ordering', async () => {
    const operations: string[] = [];
    const queue = createPersistentRiskWriteQueue({
      async removeItem(key) {
        operations.push(`remove:${key}`);
      },
      async setItem(key, value) {
        operations.push(`set:${key}:${value}`);
      }
    });

    await Promise.all([
      queue.save('risk-key', 'first'),
      queue.save('risk-key', 'second'),
      queue.save('risk-key', 'latest')
    ]);
    assert.deepEqual(operations, ['set:risk-key:latest']);

    await Promise.all([
      queue.clear('risk-key'),
      queue.save('risk-key', 'after-clear')
    ]);
    assert.deepEqual(operations, [
      'set:risk-key:latest',
      'remove:risk-key',
      'set:risk-key:after-clear'
    ]);
  });
});

function createRequest(
  overrides: Partial<AreaRiskViewportRequest> = {}
): AreaRiskViewportRequest {
  return {
    bbox: '51.50000,-0.15000,51.55000,-0.05000',
    clientId: 'workspace-1',
    maxLat: 51.55,
    maxLon: -0.05,
    maxRecords: 160,
    minLat: 51.5,
    minLon: -0.15,
    scope: 'detail',
    zoom: 10,
    ...overrides
  };
}

function createZone(id: string): RiskZone {
  return {
    id,
    title: id,
    description: 'Persisted risk area',
    severity: 'high',
    category: 'Area Risk',
    coordinate: { latitude: 51.5, longitude: -0.1 },
    radiusMeters: 500,
    markerColor: '#d84a3f',
    strokeColor: '#d84a3f',
    fillColor: 'rgba(216, 74, 63, 0.18)'
  };
}
