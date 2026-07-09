import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiRequestError } from '../src/features/api/apiClientCore';
import {
  ROUTE_DETAIL_ERROR_ROUTE_NAME_MAX_LENGTH,
  createRouteDetailErrorState,
  createRouteSyncErrorState
} from '../src/features/routes/routeListErrors';

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

  it('bounds visible route detail error names while preserving retry context', () => {
    const longRouteName = `${'Airport transfer '.repeat(6)}north service entrance`;
    const state = createRouteDetailErrorState(
      new Error('  Details are temporarily unavailable.  '),
      `  ${longRouteName}  `
    );
    const compactRouteName = /^Could not load (.*)\. Details are temporarily unavailable\.$/.exec(
      state.message
    )?.[1];

    assert.ok(compactRouteName);
    assert.equal(compactRouteName.length, ROUTE_DETAIL_ERROR_ROUTE_NAME_MAX_LENGTH);
    assert.match(compactRouteName, /…$/);
    assert.equal(
      state.retryAccessibilityLabel,
      `Retry loading ${longRouteName.trim().replace(/\s+/g, ' ')}`
    );
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

  it('keeps server and rate-limit diagnostics concise for saved routes', () => {
    assert.equal(
      createRouteSyncErrorState(new ApiRequestError('Internal Server Error', 503)).message,
      'LunarChain is having trouble. Try again soon.'
    );
    assert.equal(
      createRouteDetailErrorState(new ApiRequestError('Too many requests', 429), 'Evening escort').message,
      'Could not load Evening escort. Too many attempts. Wait a moment and try again.'
    );
  });

  it('falls back to generic route detail retry guidance', () => {
    assert.equal(
      createRouteDetailErrorState(null, '').message,
      'Could not load that route. Retry before starting guidance.'
    );
  });
});
