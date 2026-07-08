import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRouteDetailErrorState, createRouteSyncErrorState } from '../src/features/routes/routeListErrors';

describe('route list error states', () => {
  it('uses concise retry copy for saved-route sync failures', () => {
    assert.deepEqual(createRouteSyncErrorState({}), {
      action: 'sync',
      message: 'Unable to sync saved SafeRoute plans. Check your connection and retry.',
      retryAccessibilityLabel: 'Retry syncing saved SafeRoute plans',
      retryLabel: 'Retry',
      title: 'Routes unavailable'
    });
  });

  it('trims backend sync errors when present', () => {
    assert.equal(createRouteSyncErrorState(new Error('  Hosted API unavailable  ')).message, 'Hosted API unavailable');
  });

  it('adds route context to detail-load failures', () => {
    assert.deepEqual(createRouteDetailErrorState(new Error('  Details are temporarily unavailable.  '), ' Morning convoy '), {
      action: 'detail',
      message: 'Could not load Morning convoy. Details are temporarily unavailable.',
      retryAccessibilityLabel: 'Retry loading Morning convoy',
      retryLabel: 'Retry',
      title: 'Route unavailable'
    });
  });



  it('replaces native network errors with production-friendly retry copy', () => {
    assert.equal(
      createRouteSyncErrorState(new TypeError('Network request failed')).message,
      'Unable to reach LunarChain. Check your connection and retry.'
    );
    assert.equal(
      createRouteDetailErrorState(new Error('Failed to fetch'), 'Evening escort').message,
      'Could not load Evening escort. Unable to reach LunarChain. Check your connection and retry.'
    );
  });

  it('falls back to generic route detail retry guidance', () => {
    assert.equal(
      createRouteDetailErrorState(null, '').message,
      'Could not load that route. Retry before starting guidance.'
    );
  });
});
