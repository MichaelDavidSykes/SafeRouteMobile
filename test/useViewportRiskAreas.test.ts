import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('viewport risk hook integration contract', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/features/live-map/useViewportRiskAreas.ts'),
    'utf8'
  );

  it('debounces, aborts stale requests, and uses the bounded cache', () => {
    assert.match(source, /VIEWPORT_RISK_DEBOUNCE_MS\s*=\s*280/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /requestRevisionRef\.current !== revision/);
    assert.match(source, /getCachedViewportRiskZones/);
    assert.match(source, /cacheViewportRiskZones/);
  });

  it('exposes calm loading, empty, retryable error, and zoom-gate states', () => {
    assert.match(source, /Loading risk areas…/);
    assert.match(source, /No risk areas in this map view\./);
    assert.match(source, /Risk areas could not be updated/);
    assert.match(source, /Zoom in to load risk areas\./);
    assert.match(source, /retry:/);
  });
});
