import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildWorkspaceRiskAreaPath,
  normalizeWorkspaceRiskAreas,
  selectWorkspaceRiskAreasForRegion
} from '../src/features/live-map/workspaceRiskAreaApiCore';

const clientId = 'workspace/one';

function marker(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'marker-one',
    area_shape: 'circle',
    category: 'area-risk',
    client_id: clientId,
    coordinates: [
      { lat: 51.501, lon: -0.101 },
      { lat: 51.502, lon: -0.100 },
      { lat: 51.501, lon: -0.099 }
    ],
    is_active: true,
    label: 'Shared city risk',
    lat: 51.501,
    lon: -0.1,
    notes: 'Confirmed by the operations team.',
    radius_m: 250,
    severity: 'high',
    shape: 'area',
    ...overrides
  };
}

describe('workspace risk-area API core', () => {
  it('uses the same active workspace marker endpoint as the web planner', () => {
    assert.equal(
      buildWorkspaceRiskAreaPath(' workspace/one ', 'nonce one'),
      '/convoy-routes/risk-markers/client/workspace%2Fone' +
        '?include_inactive=false&request_nonce=nonce%20one'
    );
    assert.throws(
      () => buildWorkspaceRiskAreaPath('', 'nonce'),
      /valid workspace/i
    );
  });

  it('normalizes circles, polygons, sections, and critical avoidance authority', () => {
    const zones = normalizeWorkspaceRiskAreas([
      marker(),
      marker({
        _id: 'polygon',
        area_shape: 'polygon',
        label: 'Shared polygon',
        severity: 'critical'
      }),
      marker({
        _id: 'section',
        coordinates: [
          { lat: 51.49, lon: -0.12 },
          { lat: 51.51, lon: -0.08 }
        ],
        label: 'Shared road section',
        shape: 'section'
      })
    ], clientId);

    assert.equal(zones.length, 3);
    assert.equal(zones[0].id, 'workspace-risk-marker-one');
    assert.equal(zones[0].title, 'Shared city risk');
    assert.equal(zones[0].shape, 'area');
    assert.equal(zones[0].polygonCoordinates?.length ?? 0, 0);
    assert.equal(zones[1].avoidanceSeverity, 'critical');
    assert.equal(zones[1].polygonCoordinates?.length, 3);
    assert.equal(zones[2].routeSegmentCoordinates?.length, 2);
  });

  it('fails closed for cross-tenant, inactive, or malformed marker lists', () => {
    assert.throws(
      () => normalizeWorkspaceRiskAreas([marker({ client_id: 'other' })], clientId),
      /invalid saferoute workspace risk marker/i
    );
    assert.throws(
      () => normalizeWorkspaceRiskAreas([marker({ is_active: false })], clientId),
      /invalid saferoute workspace risk marker/i
    );
    assert.throws(
      () => normalizeWorkspaceRiskAreas([marker({ coordinates: [] })], clientId),
      /invalid saferoute workspace risk marker/i
    );
    assert.throws(
      () => normalizeWorkspaceRiskAreas({}, clientId),
      /invalid saferoute workspace risk marker list/i
    );
  });

  it('shows only markers intersecting the current padded viewport', () => {
    const zones = normalizeWorkspaceRiskAreas([
      marker(),
      marker({
        _id: 'far-away',
        coordinates: [
          { lat: 40.71, lon: -74.01 },
          { lat: 40.72, lon: -74.00 },
          { lat: 40.71, lon: -73.99 }
        ],
        lat: 40.71,
        lon: -74
      })
    ], clientId);
    const visible = selectWorkspaceRiskAreasForRegion(zones, {
      latitude: 51.5,
      longitude: -0.1,
      latitudeDelta: 0.08,
      longitudeDelta: 0.1
    });

    assert.deepEqual(visible.map((zone) => zone.id), ['workspace-risk-marker-one']);
  });
});
