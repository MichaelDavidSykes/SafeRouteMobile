import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ApiRequestError,
  ApiSessionExpiredError
} from '../src/features/api/apiClientCore';
import {
  AreaRiskRetryableReadError,
  fetchAreaRiskForRegion as fetchAreaRiskForRegionTransport,
  fetchAreaRiskViewport as fetchAreaRiskViewportTransport,
  parseRetryAfterSeconds,
  type AreaRiskHttpRequester
} from '../src/features/live-map/areaRiskApiTransportCore';
import {
  AREA_RISK_CAPABILITY_HEADER,
  MOBILE_AREA_RISK_CAPABILITY,
  type AreaRiskViewportRequest
} from '../src/features/live-map/areaRiskApiCore';

describe('area risk API transport', () => {
  it('preserves exact rejection authority across pages without double-counting it', async () => {
    const safetyFilter = rejectionSafetyFilter({ cityScaleRejectedCount: 1 });
    const feed = await fetchAreaRiskViewport(createRequest(), {
      accessToken: 'token-1',
      intent: 'read',
      request: captureRequester([], ({ url }) =>
        jsonResponse(feedEnvelope({
          items: createItems(url.searchParams.has('cursor') ? 1 : 0, 1),
          hasMore: !url.searchParams.has('cursor'),
          nextCursor: url.searchParams.has('cursor') ? null : 'opaque-next',
          providerStatus: 'partial',
          safetyFilter
        }))
      )
    });

    assert.equal(feed.pagesLoaded, 2);
    assert.equal(feed.zones.length, 2);
    assert.equal(feed.partial, true);
    assert.equal(feed.safetyFilter.rejectedCount, 1);
    assert.equal(feed.discardedUnsafeAreaCount, 1);
    assert.match(feed.safetyWarning ?? '', /excluded 1 unsafe or unverifiable risk area/i);
  });

  it('fails closed for malformed or unexplained partial safety authority', async () => {
    for (const safetyFilter of [
      undefined,
      {
        ...rejectionSafetyFilter({ cityScaleRejectedCount: 1 }),
        rejectedCount: 2
      }
    ]) {
      await assert.rejects(
        fetchAreaRiskViewport(createRequest(), {
          accessToken: 'token-1',
          intent: 'read',
          request: async () => jsonResponse(feedEnvelope({
            items: createItems(0, 1),
            providerStatus: 'partial',
            safetyFilter
          }))
        }),
        (error: unknown) =>
          error instanceof ApiRequestError
          && error.statusCode === 502
          && /safety-filter authority/i.test(error.message)
      );
    }
  });

  it('fails closed when safety-filter authority changes between pages', async () => {
    await assert.rejects(
      fetchAreaRiskViewport(createRequest(), {
        accessToken: 'token-1',
        intent: 'read',
        request: captureRequester([], ({ url }) =>
          jsonResponse(feedEnvelope({
            items: createItems(url.searchParams.has('cursor') ? 1 : 0, 1),
            hasMore: !url.searchParams.has('cursor'),
            nextCursor: url.searchParams.has('cursor') ? null : 'opaque-next',
            providerStatus: 'partial',
            safetyFilter: rejectionSafetyFilter({
              cityScaleRejectedCount: url.searchParams.has('cursor') ? 2 : 1
            })
          }))
        )
      }),
      (error: unknown) =>
        error instanceof ApiRequestError
        && error.statusCode === 502
        && /changed safety-filter authority between pages/i.test(error.message)
    );
  });

  it('loads every page with strict non-mutating GETs and opaque cursors', async () => {
    const calls: CapturedRequest[] = [];
    const requester = captureRequester(calls, ({ url }) => {
      const cursor = url.searchParams.get('cursor');
      return jsonResponse(feedEnvelope({
        items: cursor
          ? createItems(100, 20)
          : createItems(0, 100),
        hasMore: !cursor,
        nextCursor: cursor ? null : 'opaque-next'
      }));
    });

    const feed = await fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
      accessToken: 'token-1',
      intent: 'read',
      request: requester
    });

    assert.equal(feed.zones.length, 120);
    assert.equal(feed.pagesLoaded, 2);
    assert.equal(feed.partial, false);
    assert.equal(calls.length, 2);
    calls.forEach(({ init, url }, index) => {
      assert.notEqual(init.method, 'POST');
      assert.equal(url.searchParams.get('refresh'), 'false');
      assert.equal(url.searchParams.get('read_only'), 'true');
      assert.equal(url.searchParams.get('client_id'), 'tenant-1');
      assert.equal(url.searchParams.get('page_size'), index === 0 ? '100' : '20');
      assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer token-1');
      assert.equal(
        (init.headers as Record<string, string>)[AREA_RISK_CAPABILITY_HEADER],
        MOBILE_AREA_RISK_CAPABILITY
      );
    });
    assert.equal(calls[0].url.searchParams.has('cursor'), false);
    assert.equal(calls[1].url.searchParams.get('cursor'), 'opaque-next');
  });

  it('serializes an explicit bounded command before a cache-bypassed strict read', async () => {
    const calls: CapturedRequest[] = [];
    const requester = captureRequester(calls, ({ init }) => {
      if (init.method === 'POST') {
        return jsonResponse({
          data: {
            accepted: true,
            coalesced: false,
            coverageStatus: 'missing',
            pending: true,
            queued: true,
            retryAfterSeconds: 10,
            seedId: 'seed-1',
            seedStatus: 'queued',
            status: 'queued'
          }
        });
      }
      return jsonResponse(feedEnvelope({
        items: [],
        providerStatus: 'queued',
        seedStatus: 'queued'
      }));
    });

    const feed = await fetchAreaRiskViewport(createRequest(), {
      accessToken: 'token-1',
      intent: 'research',
      request: requester
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.pathname.endsWith('/intel/map/area-risk/research'), true);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(
      (calls[0].init.headers as Record<string, string>)[AREA_RISK_CAPABILITY_HEADER],
      MOBILE_AREA_RISK_CAPABILITY
    );
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      client_id: 'tenant-1',
      scope: 'detail',
      bounds: {
        min_lat: -34.1,
        max_lat: -33.8,
        min_lon: 18.3,
        max_lon: 18.8
      },
      zoom: 12,
      country_hints: ['ZA']
    });
    assert.equal(calls[1].url.searchParams.get('refresh'), 'false');
    assert.equal(calls[1].url.searchParams.get('read_only'), 'true');
    assert.equal(
      (calls[1].init.headers as Record<string, string>)[AREA_RISK_CAPABILITY_HEADER],
      MOBILE_AREA_RISK_CAPABILITY
    );
    assert.ok(calls[1].url.searchParams.get('_read_nonce'));
    assert.equal(feed.research?.pending, true);
    assert.equal(feed.research?.status, 'queued');
    assert.equal(feed.legacyFallback, false);
  });

  it('never commands public, global, or oversized views', async () => {
    for (const [request, accessToken] of [
      [createRequest({ clientId: undefined }), null],
      [createRequest({
        bbox: '-85.00000,-180.00000,85.00000,180.00000',
        maxLat: 85,
        maxLon: 180,
        minLat: -85,
        minLon: -180,
        scope: 'global',
        zoom: 2
      }), 'token-1'],
      [createRequest({
        bbox: '-10.00000,-20.00000,10.00000,20.00000',
        maxLat: 10,
        maxLon: 20,
        minLat: -10,
        minLon: -20,
        scope: 'regional',
        zoom: 5
      }), 'token-1']
    ] as const) {
      const calls: CapturedRequest[] = [];
      await fetchAreaRiskViewport(request, {
        accessToken,
        intent: 'research',
        request: captureRequester(calls, () =>
          jsonResponse(feedEnvelope({
            bounds: request.scope === 'global' ? undefined : requestBounds(request),
            items: []
          }))
        )
      });
      assert.equal(calls.some(({ init }) => init.method === 'POST'), false);
      assert.equal(calls[0].url.searchParams.get('read_only'), 'true');
      assert.equal(calls[0].url.searchParams.get('refresh'), 'false');
    }
  });

  it('uses one non-forcing legacy ensure only for generic command 404 or 405', async () => {
    for (const status of [404, 405]) {
      const calls: CapturedRequest[] = [];
      const feed = await fetchAreaRiskViewport(createRequest(), {
        accessToken: 'token-1',
        intent: 'research',
        request: captureRequester(calls, ({ init }) =>
          init.method === 'POST'
            ? jsonResponse(status === 404 ? { detail: 'Not Found' } : {}, status)
            : jsonResponse(feedEnvelope({ items: createItems(0, 1) }))
        )
      });

      assert.equal(calls.length, 2);
      assert.equal(calls[1].url.searchParams.get('read_only'), 'false');
      assert.equal(calls[1].url.searchParams.get('refresh'), 'false');
      assert.equal(
        (calls[1].init.headers as Record<string, string>)[AREA_RISK_CAPABILITY_HEADER],
        MOBILE_AREA_RISK_CAPABILITY
      );
      assert.equal(feed.legacyFallback, true);
      assert.match(feed.researchError ?? '', /legacy compatibility request/i);
    }
  });

  it('stops after one mutating legacy ensure instead of requesting continuation pages', async () => {
    const calls: CapturedRequest[] = [];
    const feed = await fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
      accessToken: 'token-1',
      intent: 'research',
      request: captureRequester(calls, ({ init, url }) => {
        if (init.method === 'POST') {
          return jsonResponse({ detail: 'Not Found' }, 404);
        }
        return jsonResponse(feedEnvelope({
          items: url.searchParams.has('cursor')
            ? createItems(100, 20)
            : createItems(0, 100),
          hasMore: !url.searchParams.has('cursor'),
          nextCursor: url.searchParams.has('cursor') ? null : 'opaque-next'
        }));
      })
    });

    assert.equal(feed.zones.length, 100);
    assert.equal(feed.partial, true);
    assert.match(feed.readError ?? '', /only its first page/i);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.searchParams.get('read_only'), 'false');
    assert.equal(calls[1].url.searchParams.get('refresh'), 'false');
  });

  it('does not convert a structured tenant 404 into a mutating legacy fallback', async () => {
    const calls: CapturedRequest[] = [];
    await assert.rejects(
      fetchAreaRiskViewport(createRequest(), {
        accessToken: 'token-1',
        intent: 'research',
        request: captureRequester(calls, () =>
          jsonResponse({
            detail: {
              details: 'The selected tenant is unavailable.',
              message: 'Client not found'
            }
          }, 404)
        )
      }),
      (error: unknown) =>
        error instanceof ApiRequestError && error.statusCode === 404
    );
    assert.equal(calls.length, 1);
  });

  it('never converts command authorization failures into a legacy GET', async () => {
    for (const status of [401, 403]) {
      const calls: CapturedRequest[] = [];
      await assert.rejects(
        fetchAreaRiskViewport(createRequest(), {
          accessToken: 'token-1',
          intent: 'research',
          request: captureRequester(calls, () =>
            jsonResponse({ detail: 'Access rejected' }, status)
          )
        }),
        (error: unknown) =>
          status === 401
            ? error instanceof ApiSessionExpiredError
            : error instanceof ApiRequestError && error.statusCode === status
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].init.method, 'POST');
    }
  });

  it('retains a command failure beside successful strict existing coverage', async () => {
    const calls: CapturedRequest[] = [];
    const feed = await fetchAreaRiskViewport(createRequest(), {
      accessToken: 'token-1',
      intent: 'research',
      request: captureRequester(calls, ({ init }) =>
        init.method === 'POST'
          ? jsonResponse({
              detail: {
                message: 'Area-risk research is temporarily read-only'
              }
            }, 503)
          : jsonResponse(feedEnvelope({ items: createItems(0, 1) }))
      )
    });

    assert.equal(feed.zones.length, 1);
    assert.match(feed.researchError ?? '', /temporarily read-only/i);
    assert.equal(calls[1].url.searchParams.get('read_only'), 'true');
    assert.equal(calls[1].url.searchParams.get('refresh'), 'false');
  });

  it('returns retained first-page coverage as explicitly partial after a later-page failure', async () => {
    const calls: CapturedRequest[] = [];
    const feed = await fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
      accessToken: 'token-1',
      intent: 'read',
      request: captureRequester(calls, ({ url }) =>
        url.searchParams.has('cursor')
          ? jsonResponse({ detail: 'Provider unavailable' }, 503)
          : jsonResponse(feedEnvelope({
              items: createItems(0, 100),
              hasMore: true,
              nextCursor: 'opaque-next'
            }))
      )
    });

    assert.equal(feed.zones.length, 100);
    assert.equal(feed.pagesLoaded, 1);
    assert.equal(feed.partial, true);
    assert.match(feed.readError ?? '', /provider unavailable/i);
  });

  it('retains only trusted pages when a continuation drifts by one query step', async () => {
    const feed = await fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
      accessToken: 'token-1',
      intent: 'read',
      request: captureRequester([], ({ url }) =>
        jsonResponse(feedEnvelope({
          bounds: url.searchParams.has('cursor')
            ? { ...requestBounds(createRequest()), minLat: -34.09999 }
            : requestBounds(createRequest()),
          items: url.searchParams.has('cursor')
            ? createItems(100, 20)
            : createItems(0, 100),
          hasMore: !url.searchParams.has('cursor'),
          nextCursor: url.searchParams.has('cursor') ? null : 'opaque-next'
        }))
      )
    });

    assert.equal(feed.zones.length, 100);
    assert.equal(feed.pagesLoaded, 1);
    assert.equal(feed.partial, true);
    assert.match(feed.readError ?? '', /bounds that do not match/i);
  });

  it('preserves exact shared-guard Retry-After truth on a later strict page', async () => {
    const calls: CapturedRequest[] = [];
    const feed = await fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
      accessToken: 'token-1',
      intent: 'read',
      request: captureRequester(calls, ({ url }) =>
        url.searchParams.has('cursor')
          ? jsonResponse({
              detail: {
                message: 'SafeRoute risk coverage is temporarily unavailable',
                operation: 'read',
                retryAfterSeconds: 5
              }
            }, 503, { 'Retry-After': '5' })
          : jsonResponse(feedEnvelope({
              items: createItems(0, 100),
              hasMore: true,
              nextCursor: 'opaque-next'
            }))
      )
    });

    assert.equal(feed.zones.length, 100);
    assert.equal(feed.partial, true);
    assert.deepEqual(feed.retryableReadFailure, {
      operation: 'read',
      retryAfterSeconds: 5,
      statusCode: 503
    });
  });

  it('throws a typed retryable failure only for an exact strict-read 503 contract', async () => {
    await assert.rejects(
      fetchAreaRiskViewport(createRequest(), {
        accessToken: 'token-1',
        intent: 'read',
        request: async () => jsonResponse({
          detail: {
            details: 'The shared request guard could not verify capacity.',
            message: 'SafeRoute risk coverage is temporarily unavailable',
            operation: 'read',
            retryAfterSeconds: 3
          }
        }, 503, { 'Retry-After': '5' })
      }),
      (error: unknown) =>
        error instanceof AreaRiskRetryableReadError
        && error.retryableReadFailure.retryAfterSeconds === 5
    );

    await assert.rejects(
      fetchAreaRiskViewport(createRequest(), {
        accessToken: 'token-1',
        intent: 'read',
        request: async () => jsonResponse({
          detail: {
            message: 'Unrelated service failure',
            operation: 'research',
            retryAfterSeconds: 5
          }
        }, 503, { 'Retry-After': '5' })
      }),
      (error: unknown) =>
        error instanceof ApiRequestError
        && !(error instanceof AreaRiskRetryableReadError)
        && error.statusCode === 503
    );
  });

  it('parses delta and HTTP-date Retry-After values without accepting malformed input', () => {
    const now = Date.parse('2026-07-21T12:00:00Z');
    assert.equal(parseRetryAfterSeconds('5', now), 5);
    assert.equal(parseRetryAfterSeconds('Tue, 21 Jul 2026 12:00:05 GMT', now), 5);
    assert.equal(parseRetryAfterSeconds('not-a-deadline', now), null);
    assert.equal(parseRetryAfterSeconds('-1', now), null);
    assert.equal(parseRetryAfterSeconds('999999999999', now), null);
  });

  it('marks an overfilled final page partial instead of hiding sliced records', async () => {
    const feed = await fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
      accessToken: 'token-1',
      intent: 'read',
      request: captureRequester([], ({ url }) =>
        url.searchParams.has('cursor')
          ? jsonResponse(feedEnvelope({
              items: createItems(100, 50),
              hasMore: false
            }))
          : jsonResponse(feedEnvelope({
              items: createItems(0, 100),
              hasMore: true,
              nextCursor: 'opaque-next'
            }))
      )
    });

    assert.equal(feed.zones.length, 120);
    assert.equal(feed.partial, true);
  });

  it('rethrows a continuation-page session boundary instead of publishing partial data', async () => {
    await assert.rejects(
      fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
        accessToken: 'token-1',
        intent: 'read',
        request: captureRequester([], ({ url }) =>
          url.searchParams.has('cursor')
            ? jsonResponse({ detail: 'Session expired' }, 401)
            : jsonResponse(feedEnvelope({
                items: createItems(0, 100),
                hasMore: true,
                nextCursor: 'opaque-next'
              }))
        )
      }),
      (error: unknown) => error instanceof ApiSessionExpiredError
    );
  });

  it('preserves accepted command truth when the following strict read fails', async () => {
    const calls: CapturedRequest[] = [];
    const feed = await fetchAreaRiskViewport(createRequest(), {
      accessToken: 'token-1',
      intent: 'research',
      request: captureRequester(calls, ({ init }) =>
        init.method === 'POST'
          ? jsonResponse({
              data: {
                accepted: true,
                pending: true,
                queued: true,
                retryAfterSeconds: 10,
                seedId: 'seed-1',
                seedStatus: 'queued',
                status: 'queued'
              }
            })
          : jsonResponse({ detail: 'Read unavailable' }, 503)
      )
    });

    assert.equal(feed.research?.accepted, true);
    assert.equal(feed.research?.pending, true);
    assert.equal(feed.pagesLoaded, 0);
    assert.match(feed.readError ?? '', /read unavailable/i);
  });

  it('rejects one query-step of response-bound drift before rendering or caching', async () => {
    await assert.rejects(
      fetchAreaRiskViewport(createRequest(), {
        accessToken: 'token-1',
        intent: 'read',
        request: async () =>
          jsonResponse(feedEnvelope({
            bounds: {
              ...requestBounds(createRequest()),
              minLat: -34.09999
            },
            items: createItems(0, 1)
          }))
      }),
      /bounds that do not match/i
    );
  });

  it('omits remote and unverifiable first-page items with truthful partial coverage', async () => {
    const feed = await fetchAreaRiskViewport(createRequest(), {
      accessToken: 'token-1',
      intent: 'read',
      request: async () => jsonResponse(feedEnvelope({
        items: [
          ...createItems(0, 1),
          {
            id: 'edge-circle',
            label: 'Edge circle',
            lat: -33.95,
            lon: 18.29,
            radiusM: 1200,
            severity: 'medium'
          },
          {
            id: 'remote-london',
            label: 'Remote London risk',
            lat: 51.5,
            lon: -0.1,
            radiusM: 900,
            severity: 'high'
          },
          { id: 'unverifiable', label: 'No geometry' }
        ]
      }))
    });

    assert.deepEqual(feed.zones.map((zone) => zone.id), [
      'generated-area-risk-risk-0',
      'generated-area-risk-edge-circle'
    ]);
    assert.equal(feed.localCityScaleRejectedCount, 0);
    assert.equal(feed.localSpatialRejectedCount, 2);
    assert.equal(feed.discardedUnsafeAreaCount, 2);
    assert.equal(feed.partial, true);
    assert.match(feed.safetyWarning ?? '', /excluded 2 unsafe or unverifiable risk areas/i);
  });

  it('omits remote continuation items without discarding earlier trusted pages', async () => {
    const feed = await fetchAreaRiskViewport(createRequest({ maxRecords: 120 }), {
      accessToken: 'token-1',
      intent: 'read',
      request: captureRequester([], ({ url }) =>
        jsonResponse(feedEnvelope({
          items: url.searchParams.has('cursor')
            ? [
                ...createItems(100, 19),
                {
                  id: 'remote-london',
                  label: 'Remote London risk',
                  lat: 51.5,
                  lon: -0.1,
                  radiusM: 900,
                  severity: 'high'
                }
              ]
            : createItems(0, 100),
          hasMore: !url.searchParams.has('cursor'),
          nextCursor: url.searchParams.has('cursor') ? null : 'opaque-next'
        }))
      )
    });

    assert.equal(feed.pagesLoaded, 2);
    assert.equal(feed.zones.length, 119);
    assert.equal(feed.zones.some((zone) => zone.id.includes('remote-london')), false);
    assert.equal(feed.localSpatialRejectedCount, 1);
    assert.equal(feed.discardedUnsafeAreaCount, 1);
    assert.equal(feed.partial, true);
    assert.equal(feed.message, '119 SafeRoute area-risk signals prepared.');
  });

  it('marks a split view partial when either antimeridian partition lacks tenant coverage', async () => {
    const feed = await fetchAreaRiskForRegionTransport({
      latitude: 0,
      latitudeDelta: 1,
      longitude: 179.9,
      longitudeDelta: 1
    }, {
      accessToken: 'token-1',
      apiBase: 'https://api.example.test/api/v1',
      clientId: 'tenant-1',
      request: async (input) => {
        const url = new URL(String(input));
        const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
          .split(',')
          .map(Number);
        const coveredPartition = minLon >= 0;
        return jsonResponse({
          data: {
            bounds: { minLat, maxLat, minLon, maxLon },
            hasMore: false,
            items: coveredPartition ? [{
              id: 'dateline-local',
              label: 'Dateline local risk',
              lat: (minLat + maxLat) / 2,
              lon: (minLon + maxLon) / 2,
              radiusM: 100,
              severity: 'high'
            }] : [],
            providerStatus: coveredPartition ? 'primary' : 'empty',
            seedStatus: coveredPartition ? 'covered' : 'not-requested'
          }
        });
      }
    });

    assert.equal(feed.partial, true);
    assert.equal(feed.zones.length, 1);
  });

  it('does not let one current antimeridian partition hide stale or partial coverage', async () => {
    for (const incompleteStatus of ['stale', 'partial']) {
      const feed = await fetchAreaRiskForRegionTransport({
        latitude: 0,
        latitudeDelta: 1,
        longitude: 179.9,
        longitudeDelta: 1
      }, {
        apiBase: 'https://api.example.test/api/v1',
        request: async (input) => {
          const url = new URL(String(input));
          const [minLat, minLon, maxLat, maxLon] = String(url.searchParams.get('bbox'))
            .split(',')
            .map(Number);
          const currentPartition = minLon >= 0;
          return jsonResponse({
            data: {
              bounds: { minLat, maxLat, minLon, maxLon },
              coverageStatus: currentPartition ? 'current' : incompleteStatus,
              hasMore: false,
              items: [],
              providerStatus: 'empty',
              seedStatus: 'covered'
            }
          });
        }
      });

      assert.equal(feed.partial, true);
    }
  });
});

function fetchAreaRiskViewport(
  ...[request, options]: Parameters<typeof fetchAreaRiskViewportTransport>
) {
  return fetchAreaRiskViewportTransport(request, {
    ...options,
    apiBase: 'https://api.example.test/api/v1'
  });
}

interface CapturedRequest {
  init: RequestInit;
  url: URL;
}

function captureRequester(
  calls: CapturedRequest[],
  respond: (call: CapturedRequest) => Response
): AreaRiskHttpRequester {
  return async (input, init = {}) => {
    const call = {
      init,
      url: new URL(String(input))
    };
    calls.push(call);
    return respond(call);
  };
}

function createRequest(
  overrides: Partial<AreaRiskViewportRequest> = {}
): AreaRiskViewportRequest {
  return {
    bbox: '-34.10000,18.30000,-33.80000,18.80000',
    clientId: 'tenant-1',
    countries: ['ZA'],
    maxLat: -33.8,
    maxLon: 18.8,
    maxRecords: 100,
    minLat: -34.1,
    minLon: 18.3,
    scope: 'detail',
    zoom: 12,
    ...overrides
  };
}

function requestBounds(request: AreaRiskViewportRequest) {
  return {
    minLat: request.minLat,
    maxLat: request.maxLat,
    minLon: request.minLon,
    maxLon: request.maxLon
  };
}

function feedEnvelope({
  bounds,
  hasMore = false,
  items,
  nextCursor = null,
  providerStatus = 'primary',
  safetyFilter,
  seedStatus = 'covered'
}: {
  bounds?: ReturnType<typeof requestBounds>;
  hasMore?: boolean;
  items: unknown[];
  nextCursor?: string | null;
  providerStatus?: string;
  safetyFilter?: unknown;
  seedStatus?: string;
}) {
  return {
    data: {
      bounds: bounds ?? requestBounds(createRequest()),
      fetchedAt: '2026-07-18T12:00:00Z',
      hasMore,
      items,
      nextCursor,
      providerStatus,
      ...(safetyFilter === undefined ? {} : { safetyFilter }),
      seedStatus
    }
  };
}

function rejectionSafetyFilter({
  cityScaleRejectedCount = 0,
  invalidRecordRejectedCount = 0,
  localityRejectedCount = 0,
  outOfBoundsRejectedCount = 0
}: {
  cityScaleRejectedCount?: number;
  invalidRecordRejectedCount?: number;
  localityRejectedCount?: number;
  outOfBoundsRejectedCount?: number;
} = {}) {
  return {
    capability: 'safe-route-risk-rejection-v1',
    rejectedCount: cityScaleRejectedCount
      + invalidRecordRejectedCount
      + localityRejectedCount
      + outOfBoundsRejectedCount,
    localityRejectedCount,
    cityScaleRejectedCount,
    invalidRecordRejectedCount,
    outOfBoundsRejectedCount
  };
}

function createItems(start: number, count: number) {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `risk-${index}`,
      label: `Risk ${index}`,
      lat: -34 + index * 0.0001,
      lon: 18.4 + index * 0.0001,
      radiusM: 100,
      severity: index % 2 ? 'medium' : 'high'
    };
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...headers },
    status
  });
}
