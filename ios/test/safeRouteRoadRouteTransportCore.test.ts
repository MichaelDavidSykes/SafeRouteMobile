import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiRequestError, ApiSessionExpiredError } from '../src/features/api/apiClientCore';
import {
  SafeRoutePreviewCoveragePendingError,
  getSafeRoutePreviewRetryAfterSeconds,
  isSafeRoutePreviewCoveragePendingResponse,
  isSafeRoutePreviewProvisionalResponse,
  requestVerifiedSafeRoutePreview,
  resolveSafeRoutePreviewRetryDelaySeconds,
} from '../src/features/guest-map/safeRouteRoadRouteTransportCore';

describe('verified SafeRoute road route transport', () => {
  it('honors the server retry interval without adding client backoff', async () => {
    const responses = [
      pendingResponse({ retryAfter: '10' }),
      pendingResponse({ retryAfter: '10' }),
      jsonResponse({ data: { route: 'verified' } }, 200),
    ];
    const retryDelays: number[] = [];
    let requests = 0;

    const result = await requestVerifiedSafeRoutePreview({
      init: { method: 'POST' },
      input: 'https://example.test/verified-route-preview',
      now: () => 0,
      request: async () => {
        const response = responses[requests];
        requests += 1;
        assert.ok(response);
        return response;
      },
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      timeoutMs: 60_000,
    });

    assert.deepEqual(result, { route: 'verified' });
    assert.equal(requests, 3);
    assert.deepEqual(retryDelays, [10_000, 10_000]);
  });

  it('publishes provisional 200 geometry once and keeps polling for proof', async () => {
    const responses = [
      jsonResponse({ data: pendingPreviewBody() }, 200),
      pendingResponse({ retryAfter: '10' }),
      jsonResponse({ data: { route: 'verified' } }, 200),
    ];
    const provisional: unknown[] = [];
    const provisionalFlags: unknown[] = [];
    const retryDelays: number[] = [];
    let requests = 0;

    const result = await requestVerifiedSafeRoutePreview({
      init: {
        body: JSON.stringify({ accept_provisional_risk_coverage: true }),
        method: 'POST',
      },
      input: 'https://example.test/verified-route-preview',
      now: () => 0,
      onProvisionalResponse: (response) => provisional.push(response),
      request: async (_input, init) => {
        provisionalFlags.push(JSON.parse(String(init?.body)).accept_provisional_risk_coverage);
        return responses[requests++] as Response;
      },
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      timeoutMs: 60_000,
    });

    assert.deepEqual(provisional, [pendingPreviewBody()]);
    assert.deepEqual(provisionalFlags, [true, false, false]);
    assert.deepEqual(retryDelays, [2_000, 10_000]);
    assert.deepEqual(result, { route: 'verified' });
    assert.equal(requests, 3);
    assert.equal(
      isSafeRoutePreviewProvisionalResponse(
        200,
        { data: pendingPreviewBody() },
      ),
      true,
    );
  });

  it('clears a provisional polling loop through the owner AbortSignal', async () => {
    const controller = new AbortController();
    let published = false;
    let requests = 0;
    const preview = requestVerifiedSafeRoutePreview({
      init: { method: 'POST' },
      input: 'https://example.test/verified-route-preview',
      onProvisionalResponse: () => {
        published = true;
        controller.abort();
      },
      request: async () => {
        requests += 1;
        return jsonResponse({ data: pendingPreviewBody() }, 200);
      },
      signal: controller.signal,
      timeoutMs: 60_000,
    });

    await assert.rejects(preview, (error) => (
      error instanceof Error && error.name === 'AbortError'
    ));
    assert.equal(published, true);
    assert.equal(requests, 1);
  });

  it('honors Retry-After directly while bounding invalid server values', () => {
    assert.equal(resolveSafeRoutePreviewRetryDelaySeconds(1), 1);
    assert.equal(resolveSafeRoutePreviewRetryDelaySeconds(25), 25);
    assert.equal(resolveSafeRoutePreviewRetryDelaySeconds(60), 30);

    const response = pendingResponse({
      bodyRetryAfterSeconds: 18,
      retryAfter: '12',
    });
    assert.equal(
      getSafeRoutePreviewRetryAfterSeconds(response, pendingBody({ retryAfterSeconds: 18 })),
      18,
    );
    assert.equal(
      getSafeRoutePreviewRetryAfterSeconds(
        jsonResponse({ data: pendingPreviewBody() }, 200),
        { data: pendingPreviewBody() },
        0,
        2,
      ),
      2,
    );
  });

  it('retries unavailable proof only when its structured coverage state is pending', () => {
    assert.equal(isSafeRoutePreviewCoveragePendingResponse(503, pendingBody({
      coverageStatus: 'pending',
      status: 'unavailable',
    })), true);
    assert.equal(isSafeRoutePreviewCoveragePendingResponse(503, pendingBody({
      coverageStatus: 'unavailable',
      status: 'pending',
    })), true);
    assert.equal(isSafeRoutePreviewCoveragePendingResponse(503, pendingBody({
      coverageStatus: 'complete',
      status: 'unavailable',
    })), false);
    assert.equal(isSafeRoutePreviewCoveragePendingResponse(503, {
      detail: { message: 'Research is pending' },
    }), false);
  });

  it('fails closed immediately for non-pending 503 responses', async () => {
    let requests = 0;
    await assert.rejects(
      requestVerifiedSafeRoutePreview({
        init: { method: 'POST' },
        input: 'https://example.test/verified-route-preview',
        request: async () => {
          requests += 1;
          return jsonResponse(pendingBody({
            coverageStatus: 'complete',
            status: 'unavailable',
          }), 503);
        },
        sleep: async () => {
          assert.fail('non-pending failures must not be retried');
        },
        timeoutMs: 60_000,
      }),
      (error) => error instanceof ApiRequestError
        && !(error instanceof SafeRoutePreviewCoveragePendingError)
        && error.statusCode === 503,
    );
    assert.equal(requests, 1);
  });

  it('preserves workspace session-expiry semantics without retrying', async () => {
    let requests = 0;
    await assert.rejects(
      requestVerifiedSafeRoutePreview({
        init: {
          headers: { Authorization: 'Bearer expired-token' },
          method: 'POST',
        },
        input: 'https://example.test/verified-route-preview',
        request: async () => {
          requests += 1;
          return jsonResponse({ detail: 'Token has expired' }, 401);
        },
        timeoutMs: 60_000,
      }),
      (error) => error instanceof ApiSessionExpiredError,
    );
    assert.equal(requests, 1);
  });

  it('cancels a pending retry through the owner AbortSignal', async () => {
    const controller = new AbortController();
    let requests = 0;
    const preview = requestVerifiedSafeRoutePreview({
      init: { method: 'POST' },
      input: 'https://example.test/verified-route-preview',
      request: async () => {
        requests += 1;
        return pendingResponse({ retryAfter: '10' });
      },
      signal: controller.signal,
      timeoutMs: 60_000,
    });

    controller.abort();
    await assert.rejects(preview, (error) => (
      error instanceof Error && error.name === 'AbortError'
    ));
    assert.equal(requests <= 1, true);
  });

  it('returns a meaningful terminal error after the pending budget expires', async () => {
    await assert.rejects(
      requestVerifiedSafeRoutePreview({
        init: { method: 'POST' },
        input: 'https://example.test/verified-route-preview',
        maxPendingWaitMs: 0,
        now: () => 0,
        request: async () => pendingResponse({ retryAfter: '10' }),
        timeoutMs: 60_000,
      }),
      (error) => error instanceof SafeRoutePreviewCoveragePendingError
        && error.statusCode === 503
        && error.retryAfterSeconds === 10
        && /still verifying risk coverage.*tap plot route/i.test(error.message),
    );
  });
});

function pendingResponse({
  bodyRetryAfterSeconds,
  retryAfter,
}: {
  bodyRetryAfterSeconds?: number;
  retryAfter?: string;
} = {}): Response {
  return jsonResponse(
    pendingBody({ retryAfterSeconds: bodyRetryAfterSeconds }),
    503,
    retryAfter ? { 'Retry-After': retryAfter } : undefined,
  );
}

function pendingBody({
  coverageStatus = 'pending',
  retryAfterSeconds,
  status = 'pending',
}: {
  coverageStatus?: string;
  retryAfterSeconds?: number;
  status?: string;
} = {}): unknown {
  return {
    detail: {
      message: 'Verifying risk coverage',
      risk_avoidance: {
        coverage_status: coverageStatus,
        policy_version: 'safe-route-v1',
        retry_after_seconds: retryAfterSeconds,
        status,
      },
    },
  };
}

function pendingPreviewBody(): unknown {
  return {
    constraints_applied: false,
    coordinates: [{ lat: -33.9, lon: 18.4 }, { lat: -33.95, lon: 18.5 }],
    policy_version: 'safe-route-v1',
    provider: 'tomtom',
    risk_areas: [],
    risk_avoidance: {
      coverage_status: 'pending',
      ignored_area_count: 0,
      policy_version: 'safe-route-v1',
      status: 'pending',
    },
    snapped: true,
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...headers },
    status,
  });
}
