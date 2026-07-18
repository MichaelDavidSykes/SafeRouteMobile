import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('viewport risk hook integration contract', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/features/live-map/useViewportRiskAreas.ts'),
    'utf8'
  );
  const stateSource = readFileSync(
    join(process.cwd(), 'src/features/live-map/viewportRiskState.ts'),
    'utf8'
  );

  it('debounces, aborts stale requests, and uses the bounded cache', () => {
    assert.match(source, /VIEWPORT_RISK_DEBOUNCE_MS\s*=\s*450/);
    assert.match(source, /VIEWPORT_RISK_TIMEOUT_MS\s*=\s*6000/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(
      source,
      /const requestIsCurrent = \(\) =>[\s\S]*requestRevisionRef\.current === revision/,
    );
    assert.match(source, /getCachedViewportRiskZones/);
    assert.match(source, /cacheViewportRiskZones/);
    assert.match(source, /Promise\.allSettled/);
    assert.match(source, /resolveViewportRiskDisplayZones/);
    assert.match(source, /canCacheViewportRiskFeed/);
    assert.match(source, /requestSignature/);
    assert.match(source, /allRequestsFailed/);
    assert.doesNotMatch(source, /detailMaxRecords:\s*120/);
    assert.doesNotMatch(source, /regionalMaxRecords:\s*60/);
  });

  it('exposes explicit research, strict poll, empty, partial, stale, and retry states', () => {
    assert.match(source, /intent:\s*researchRequested \? 'research' : 'read'/);
    assert.match(source, /researchAvailable/);
    assert.match(source, /VIEWPORT_RISK_MAX_POLL_ATTEMPTS\s*=\s*4/);
    assert.match(source, /setPollRevision/);
    assert.match(source, /pending-timeout/);
    assert.match(source, /cooldownRequestCount/);
    assert.match(source, /researchBlockedUntilMs/);
    assert.match(source, /missingRequestCount/);
    assert.match(source, /legacyFallbackCount > 0/);
    assert.match(source, /Compatibility research is in progress/);
    assert.match(source, /isAreaRiskFeedMissing/);
    assert.match(source, /bypassCache/);
    assert.match(source, /coverageState/);
    assert.match(source, /Loading risk areas…/);
    assert.match(stateSource, /Researching risk coverage…/);
    assert.match(stateSource, /No current risk areas in this map view\./);
    assert.match(stateSource, /Some risk coverage could not be updated/);
    assert.match(stateSource, /Previously loaded risks remain visible/);
    assert.match(stateSource, /Risk areas could not be updated/);
    assert.match(source, /Risk areas are waiting for a valid map view\./);
    assert.match(source, /\bretry,\n/);
    assert.match(source, /research,/);
  });

  it('clears tenant state synchronously while retaining same-tenant AOI overlays', () => {
    assert.match(
      source,
      /const contextChanged = displayContextRef\.current !== displayContext/,
    );
    assert.match(
      source,
      /const cacheScopeChanged = cacheScopeContextRef\.current !== cacheScopeContext/,
    );
    assert.match(
      source,
      /if \(cacheScopeChanged\) \{[\s\S]*cacheRef\.current\.clear\(\)[\s\S]*zonesRef\.current = \[\][\s\S]*setZones\(\[\]\)/,
    );
    assert.match(source, /const retainedZones = cacheScopeChanged \? \[\] : zonesRef\.current/);
    assert.match(
      source,
      /zones: cacheScopeContextRef\.current === cacheScopeContext \? zones : \[\]/,
    );
  });
});
