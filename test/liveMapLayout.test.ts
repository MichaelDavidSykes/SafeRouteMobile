import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveLiveMapOverlayLayout } from '../src/features/live-map/liveMapLayout';

describe('live map overlay layout', () => {
  it('keeps the regular overlay on modern iPhone sizes', () => {
    const layout = resolveLiveMapOverlayLayout({ height: 844, platform: 'ios', width: 390 });

    assert.equal(layout.isCompact, false);
    assert.equal(layout.density, 'regular');
    assert.equal(layout.mapControlsDirection, 'column');
    assert.equal(layout.showRouteEndpoints, false);
    assert.equal(layout.guidanceBottom, 386);
    assert.equal(layout.mapControlsTop, 196);
    assert.deepEqual(layout.edgePadding, { top: 188, right: 72, bottom: 336, left: 44 });
  });

  it('uses a denser overlay on small iPhone viewports', () => {
    const layout = resolveLiveMapOverlayLayout({ height: 667, platform: 'ios', width: 375 });

    assert.equal(layout.isCompact, true);
    assert.equal(layout.density, 'compact');
    assert.equal(layout.mapControlsDirection, 'row');
    assert.equal(layout.showRouteEndpoints, false);
    assert.equal(layout.showRouteSubtitle, true);
    assert.equal(layout.guidanceBottom, 314);
    assert.deepEqual(layout.edgePadding, { top: 172, right: 44, bottom: 286, left: 36 });
  });

  it('normalizes invalid dimensions to a safe regular iPhone layout', () => {
    const layout = resolveLiveMapOverlayLayout({ height: Number.NaN, platform: 'ios', width: 0 });

    assert.equal(layout.isCompact, false);
    assert.equal(layout.showRouteEndpoints, false);
    assert.equal(layout.guidanceDistanceVisible, true);
  });
});
