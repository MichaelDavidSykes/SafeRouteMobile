import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRouteRiskCorridorRegions,
  loadRouteRiskCorridor
} from '../src/features/live-map/routeRiskCorridorCore';
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
});

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
