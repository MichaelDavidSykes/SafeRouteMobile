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
    assert.match(source, /VIEWPORT_RISK_DEBOUNCE_MS\s*=\s*450/);
    assert.match(source, /VIEWPORT_RISK_TIMEOUT_MS\s*=\s*6000/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /requestRevisionRef\.current !== revision/);
    assert.match(source, /getCachedViewportRiskZones/);
    assert.match(source, /cacheViewportRiskZones/);
    assert.match(source, /Promise\.allSettled/);
    assert.match(source, /resolveViewportRiskDisplayZones/);
    assert.match(source, /requestSignature/);
    assert.match(source, /allMissingRequestsFailed/);
    assert.doesNotMatch(source, /detailMaxRecords:\s*120/);
    assert.doesNotMatch(source, /regionalMaxRecords:\s*60/);
  });

  it('exposes calm loading, empty, retryable error, and invalid-view states', () => {
    assert.match(source, /Loading risk areas…/);
    assert.match(source, /No risk areas in this map view\./);
    assert.match(source, /Risk areas could not be updated/);
    assert.match(source, /Risk areas are waiting for a valid map view\./);
    assert.match(source, /retry:/);
  });
});
