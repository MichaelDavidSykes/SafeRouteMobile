import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  CONNECTIVITY_CONTRACT_PHASES,
  CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
  CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH,
  CONNECTIVITY_CONTRACT_STATUSES,
  GUIDANCE_CONTRACT_EVIDENCE_PATH,
  GUIDANCE_CONTRACT_MODES,
  GUIDANCE_CONTRACT_ROUTE_IDS,
  GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS,
  GUIDANCE_CONTRACT_TRIP_IDS,
  GUIDANCE_CONTRACT_WORKSPACES,
  GUIDANCE_START_BOUNDARY_PATH,
  OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES,
  OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES,
  OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES,
  WORKSPACE_CATALOG_RECOVERY_PHASES,
  WORKSPACE_CATALOG_RETRY_DELAY_MS,
  WORKSPACE_CATALOG_SUCCESS_DELAY_MS,
  assertConnectivityContractEndedJourneyStayedClosed,
  assertConnectivityContractInactiveGuidanceRevocation,
  assertConnectivityContractInactiveSessionRevocation,
  assertConnectivityContractReconnectAuthorization,
  assertGuidanceContractEvidenceJournal,
  assertGuidanceContractRequestJournal,
  assertGuidanceContractRouteCacheReadbackEvidence,
  assertGuidanceStartTrafficBoundary,
  assertOfflineCalendarAuthBoundaryTraffic,
  assertOfflineCalendarAuthCleanupEvidence,
  assertOfflineCalendarAuthStorageFaultRequests,
  assertOfflineCalendarPrincipalChangeEvidence,
  assertOfflineCalendarPrincipalChangeTraffic,
  assertOfflineCalendarProtectedCacheSeedTraffic,
  assertOfflineCalendarWorkspaceDenialTraffic,
  assertOfflineCalendarWorkspaceRevocationEvidence,
  createGuidanceContractAccessToken,
  createGuidanceContractOperations,
  createGuidanceContractEvidenceJournal,
  createGuidanceContractRequestJournal,
  isGuidanceStartProtectedTraffic,
  startGuidanceContractApi
} from '../scripts/maestro-guidance-contract-api.mjs';

describe('Maestro guidance contract API', () => {
  it('serves distinct backend-shaped Operations calendar fixtures per workspace', () => {
    const fixtureNowMs = new Date('2030-01-01T08:00:00.000Z').getTime();
    const guidance = createGuidanceContractOperations('denied', fixtureNowMs);
    const support = createGuidanceContractOperations('survivor', fixtureNowMs);

    assert.equal(guidance.client_id, GUIDANCE_CONTRACT_WORKSPACES.denied.id);
    assert.equal(support.client_id, GUIDANCE_CONTRACT_WORKSPACES.survivor.id);
    assert.equal(guidance.trips[0].id, GUIDANCE_CONTRACT_TRIP_IDS.denied);
    assert.equal(support.trips[0].id, GUIDANCE_CONTRACT_TRIP_IDS.survivor);
    assert.equal(
      guidance.trips[0].route_assignments[0].route_id,
      GUIDANCE_CONTRACT_ROUTE_IDS.denied,
    );
    assert.notEqual(guidance.trips[0].name, support.trips[0].name);
    assert.equal(
      guidance.trips[0].movement_date,
      '2030-01-03T08:00:00.000Z',
    );
    assert.equal(
      support.trips[0].movement_date,
      '2030-01-04T08:00:00.000Z',
    );
    assert.deepEqual(guidance.people, []);
    assert.deepEqual(guidance.vehicles, []);
  });

  it('issues offline-restore-shaped claims without treating the fixture signature as verification', () => {
    const token = createGuidanceContractAccessToken(10_000);
    const [headerSegment, payloadSegment, signature] = token.split('.');
    const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));

    assert.equal(header.alg, 'HS256');
    assert.equal(payload.sub, 'driver@example.com');
    assert.equal(payload.typ, 'access');
    assert.equal(payload.iat, 9_999);
    assert.equal(payload.exp, 96_400);
    assert.equal(signature, 'guidance-contract-signature');
  });

  it('holds exact-source NetInfo reachability until a terminal control settles', async () => {
    const sourceRevision = 'c'.repeat(40);
    let control = {
      connectivity: CONNECTIVITY_CONTRACT_STATUSES.checking,
      connectivitySequence: 1,
      mode: GUIDANCE_CONTRACT_MODES.active,
      phase: 'connectivityColdChecking',
      sourceRevision,
    };
    const requests: Record<string, unknown>[] = [];
    const server = await startGuidanceContractApi({
      port: 0,
      readControl: () => control,
      requestLog: (entry: Record<string, unknown>) => requests.push(entry),
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint =
      `http://127.0.0.1:${address.port}${CONNECTIVITY_CONTRACT_REACHABILITY_PATH}` +
      `?source_revision=${sourceRevision}`;

    try {
      assert.equal((await fetch(endpoint, { method: 'HEAD' })).status, 403);
      const headers = {
        'X-SafeRoute-Connectivity-Contract': '1',
        'X-SafeRoute-Source-Revision': sourceRevision,
      };
      assert.equal(
        (
          await fetch(endpoint.replace(sourceRevision, 'd'.repeat(40)), {
            headers: {
              ...headers,
              'X-SafeRoute-Source-Revision': 'd'.repeat(40),
            },
            method: 'HEAD',
          })
        ).status,
        403,
      );
      let completed = false;
      const checking = fetch(endpoint, { headers, method: 'HEAD' }).then((response) => {
        completed = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(completed, false);

      control = {
        ...control,
        connectivity: CONNECTIVITY_CONTRACT_STATUSES.offline,
        connectivitySequence: 2,
        phase: 'connectivityOffline',
      };
      assert.equal((await checking).status, 503);

      control = {
        ...control,
        connectivity: CONNECTIVITY_CONTRACT_STATUSES.online,
        connectivitySequence: 3,
        phase: 'connectivityOnline',
      };
      assert.equal(
        (await fetch(endpoint, { headers, method: 'HEAD' })).status,
        204,
      );

      const requestEntries = requests.filter((entry) => entry.event === 'request');
      assert.deepEqual(
        requestEntries.map((entry) => [
          entry.phase,
          entry.connectivity,
          entry.connectivitySequence,
          entry.path,
          entry.requestSourceRevision,
          entry.sourceRevision,
        ]),
        [
          [
            'connectivityColdChecking',
            'checking',
            1,
            CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
            sourceRevision,
            sourceRevision,
          ],
          [
            'connectivityColdChecking',
            'checking',
            1,
            CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
            'd'.repeat(40),
            sourceRevision,
          ],
          [
            'connectivityColdChecking',
            'checking',
            1,
            CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
            sourceRevision,
            sourceRevision,
          ],
          [
            'connectivityOnline',
            'online',
            3,
            CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
            sourceRevision,
            sourceRevision,
          ],
        ],
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('injects exact source-bound storage faults only once per control', async () => {
    const sourceRevision = 'd'.repeat(40);
    const control = {
      storageFaults: [{
        id: 'inactive-auth-clear',
        operation: 'auth-session-tombstone-set',
        remaining: 1,
      }],
      connectivity: CONNECTIVITY_CONTRACT_STATUSES.online,
      connectivitySequence: 7,
      mode: GUIDANCE_CONTRACT_MODES.active,
      phase: OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
      sourceRevision,
    };
    const requests: Record<string, unknown>[] = [];
    const server = await startGuidanceContractApi({
      port: 0,
      readControl: () => control,
      requestLog: (entry: Record<string, unknown>) => requests.push(entry),
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint =
      `http://127.0.0.1:${address.port}${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}` +
      `/auth-session-tombstone-set?source_revision=${sourceRevision}`;
    const headers = {
      'X-SafeRoute-Connectivity-Contract': '1',
      'X-SafeRoute-Source-Revision': sourceRevision,
    };

    try {
      assert.equal((await fetch(endpoint, {
        body: 'credential-shaped-body',
        headers,
        method: 'POST',
      })).status, 403);
      assert.equal((await fetch(`${endpoint}&extra=1`, {
        headers,
        method: 'POST',
      })).status, 403);
      assert.equal((await fetch(endpoint, {
        headers: { ...headers, Authorization: 'Bearer secret' },
        method: 'POST',
      })).status, 403);
      assert.equal((await fetch(endpoint, { headers, method: 'POST' })).status, 503);
      assert.equal((await fetch(endpoint, { headers, method: 'POST' })).status, 204);

      const validRequests = requests.filter((entry) =>
        entry.event === 'request' &&
        entry.path ===
          `${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}/auth-session-tombstone-set` &&
        entry.search === `?source_revision=${sourceRevision}` &&
        entry.authorizationClass === 'none'
      );
      assert.equal(validRequests.length, 3);
      assert.deepEqual(
        validRequests.map((request) => request.requestSourceRevision),
        [sourceRevision, sourceRevision, sourceRevision],
      );

      control.storageFaults = [{
        id: 'workspace-navigation-cleanup',
        operation: 'workspace-handoff-navigation-cleanup-set',
        remaining: 1,
      }];
      const workspaceCleanupEndpoint =
        `http://127.0.0.1:${address.port}${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}` +
        `/workspace-handoff-navigation-cleanup-set?source_revision=${sourceRevision}`;
      assert.equal(
        (await fetch(workspaceCleanupEndpoint, { headers, method: 'POST' })).status,
        503,
      );
      assert.equal(
        (await fetch(workspaceCleanupEndpoint, { headers, method: 'POST' })).status,
        204,
      );

      control.storageFaults = [{
        id: 'workspace-target-save',
        operation: 'workspace-handoff-target-selection-set',
        remaining: 1,
      }];
      const workspaceEndpoint =
        `http://127.0.0.1:${address.port}${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}` +
        `/workspace-handoff-target-selection-set?source_revision=${sourceRevision}`;
      assert.equal(
        (await fetch(workspaceEndpoint, { headers, method: 'POST' })).status,
        503,
      );
      assert.equal(
        (await fetch(workspaceEndpoint, { headers, method: 'POST' })).status,
        204,
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects reconnect authorization sequenced before online settlement', () => {
    const entries = [
      {
        authorized: true,
        event: 'request',
        path: '/api/v1/users/me',
        phase: 'connectivitySeed',
        requestId: 'seed-principal-request',
        search: '',
        sequence: 1,
      },
      {
        completed: true,
        event: 'completion',
        path: CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
        phase: 'connectivityReconnectChecking',
        semanticOutcome: 'connectivity-online',
        sequence: 2,
        statusCode: 204,
      },
      {
        authorized: true,
        event: 'request',
        path: '/api/v1/users/me',
        phase: 'connectivityOnline',
        requestId: 'principal-request',
        search: '',
        sequence: 3,
      },
      {
        completed: true,
        event: 'completion',
        requestId: 'principal-request',
        semanticOutcome: 'principal-a',
        sequence: 4,
        statusCode: 200,
      },
      {
        authorized: true,
        event: 'request',
        path: '/api/v1/mobile/safe-route/routes',
        phase: 'connectivityOnline',
        requestId: 'catalog-request',
        search: '',
        sequence: 5,
      },
      {
        completed: true,
        event: 'completion',
        requestId: 'catalog-request',
        semanticOutcome: 'catalog-active',
        sequence: 6,
        statusCode: 200,
      },
    ];

    assert.doesNotThrow(() =>
      assertConnectivityContractReconnectAuthorization(entries, {
        settlementSequence: 2,
      }),
    );
    assert.doesNotThrow(() =>
      assertConnectivityContractReconnectAuthorization(
        entries.map((entry) => ({
          ...entry,
          phase:
            entry.phase === "connectivityReconnectChecking"
              ? "connectivityResaveReconnectChecking"
              : entry.phase === "connectivityOnline"
                ? "connectivityResaveOnline"
                : entry.phase,
        })),
        {
          onlinePhase: "connectivityResaveOnline",
          reconnectPhase: "connectivityResaveReconnectChecking",
          settlementSequence: 2,
        },
      ),
    );
    assert.throws(
      () =>
        assertConnectivityContractReconnectAuthorization(
          entries.map((entry) =>
            entry.requestId === 'principal-request'
              ? { ...entry, sequence: 1 }
              : entry,
          ),
          { settlementSequence: 2 },
        ),
      /product traffic before online settlement/,
    );
  });

  it('requires one exact inactive principal rejection and no protected relaunch traffic', () => {
    const entries = [
      {
        authorized: true,
        event: 'request',
        path: '/api/v1/users/me',
        phase: 'connectivityInactiveSession',
        requestId: 'inactive-principal-request',
        search: '',
        sequence: 1,
      },
      {
        completed: true,
        event: 'completion',
        requestId: 'inactive-principal-request',
        semanticOutcome: 'principal-inactive',
        sequence: 2,
        statusCode: 400,
      },
    ];

    assert.doesNotThrow(() =>
      assertConnectivityContractInactiveSessionRevocation(entries),
    );
    assert.throws(
      () =>
        assertConnectivityContractInactiveSessionRevocation([
          ...entries,
          {
            authorized: true,
            event: 'request',
            path: '/api/v1/mobile/safe-route/routes',
            phase: 'connectivityInactiveSession',
            requestId: 'escaped-catalog-request',
            search: '',
            sequence: 3,
          },
        ]),
      /stop after one exact authorized principal rejection/,
    );
    assert.throws(
      () =>
        assertConnectivityContractInactiveSessionRevocation([
          ...entries,
          {
            authorized: true,
            event: 'request',
            path: '/api/v1/users/me',
            phase: 'connectivityInactiveRelaunch',
            requestId: 'relaunch-principal-request',
            search: '',
            sequence: 3,
          },
        ]),
      /relaunch issued protected requests/,
    );
  });

  it('correlates inactive-account cleanup with the seeded journey and a later absence', () => {
    const sourceRevision = 'f'.repeat(40);
    const identity = {
      appLaunchId: 'launch-inactive-seed',
      navigationInstanceId: 'navigation-inactive',
      occurredAtMs: 200,
      routeId: 'route-inactive',
      sourceRevision,
      workspaceId: 'workspace-inactive',
    };
    const entries = [
      {
        ...identity,
        authorization: { catalog: 'fresh-authorized', principal: 'matching' },
        durability: { activeNavigation: 'present' },
        outcome: 'persisted',
        serverPhase: 'connectivityInactiveSeed',
        type: 'navigation.persisted',
      },
      {
        ...identity,
        appLaunchId: 'launch-inactive-rejection',
        authorization: { catalog: 'not-checked', principal: 'matching' },
        durability: {
          activeNavigation: 'revoked',
          persistedPermit: 'revoked',
        },
        occurredAtMs: 201,
        outcome: 'cleared',
        serverPhase: 'connectivityInactiveSession',
        type: 'navigation.cleanup.settled',
      },
      {
        ...identity,
        appLaunchId: 'launch-inactive-rejection',
        authorization: { catalog: 'not-checked', principal: 'matching' },
        durability: {
          nativeTracking: 'stopped',
          persistedPermit: 'revoked',
          runtimePermit: 'none',
        },
        occurredAtMs: 202,
        outcome: 'off',
        serverPhase: 'connectivityInactiveSession',
        type: 'tracking.stop.settled',
      },
      {
        ...identity,
        appLaunchId: 'launch-inactive-relaunch',
        authorization: { catalog: 'not-checked', principal: 'unknown' },
        durability: {
          activeNavigation: 'absent',
          nativeTracking: 'unsupported',
          runtimePermit: 'none',
        },
        navigationInstanceId: null,
        occurredAtMs: 203,
        outcome: 'absent',
        routeId: null,
        serverPhase: 'connectivityInactiveRelaunch',
        type: 'navigation.absence.readback',
        workspaceId: null,
      },
    ];
    const options = {
      expectedSourceRevision: sourceRevision,
      minimumOccurredAtMs: 100,
    };

    assert.doesNotThrow(() =>
      assertConnectivityContractInactiveGuidanceRevocation(entries, options),
    );
    assert.throws(
      () =>
        assertConnectivityContractInactiveGuidanceRevocation(
          entries.map((entry) =>
            entry.type === 'navigation.cleanup.settled'
              ? { ...entry, navigationInstanceId: null }
              : entry,
          ),
          options,
        ),
      /cleanup was not durably correlated/,
    );
    assert.throws(
      () =>
        assertConnectivityContractInactiveGuidanceRevocation(
          entries.filter((entry) => entry.type !== 'navigation.absence.readback'),
          options,
        ),
      /not absent after process relaunch/,
    );
  });

  it('correlates one-shot auth faults with durable Calendar cleanup and cold absence', () => {
    const sourceRevision = '9'.repeat(40);
    const faultPath =
      `${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}/auth-session-tombstone-set`;
    const request = (
      phase: string,
      requestId: string,
      sequence: number,
    ) => ({
      authorizationClass: 'none',
      authorized: false,
      event: 'request',
      method: 'POST',
      path: faultPath,
      phase,
      requestId,
      requestSourceRevision: sourceRevision,
      search: `?source_revision=${sourceRevision}`,
      sequence,
      sourceRevision,
    });
    const completion = (
      phase: string,
      requestId: string,
      sequence: number,
      statusCode: number,
      semanticOutcome: string,
    ) => ({
      completed: true,
      event: 'completion',
      path: faultPath,
      phase,
      requestId,
      semanticOutcome,
      sequence,
      statusCode,
    });
    const requests = [
      request(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
        'inactive-fault',
        1,
      ),
      completion(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
        'inactive-fault',
        2,
        503,
        'storage-fault-injected',
      ),
      request(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
        'relaunch-fault',
        3,
      ),
      completion(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
        'relaunch-fault',
        4,
        503,
        'storage-fault-injected',
      ),
      request(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
        'retry-consumed',
        5,
      ),
      completion(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
        'retry-consumed',
        6,
        204,
        'storage-fault-not-armed',
      ),
    ];
    const pendingDurability = {
      authSession: 'present',
      offlineCalendarCleanup: 'durable',
      offlineCalendarPayload: 'present',
      offlineCalendarPreference: 'disabled',
      offlineCalendarSlot: 'payload',
    };
    const cleanDurability = {
      authSession: 'signed-out',
      offlineCalendarCleanup: 'absent',
      offlineCalendarPayload: 'absent',
      offlineCalendarPreference: 'disabled',
      offlineCalendarSlot: 'empty',
    };
    const event = (
      serverPhase: string,
      cause: string,
      outcome: string,
      appLaunchId: string,
      sequence: number,
      durability: Record<string, string>,
    ) => ({
      appLaunchId,
      authorization: {
        catalog: 'not-checked',
        principal: outcome === 'clean' ? 'none' : 'matching',
      },
      cause,
      durability,
      navigationInstanceId: null,
      occurredAtMs: 200 + sequence,
      outcome,
      routeId: null,
      sequence,
      serverPhase,
      sourceRevision,
      type: 'offline.calendar.cleanup',
      unavailableWorkspaceIds: [],
      workspaceId: null,
    });
    const evidence = [
      event(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
        'inactive-account',
        'retry-required',
        'launch-inactive-failure',
        1,
        pendingDurability,
      ),
      event(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
        'startup-terminal-replay',
        'retry-required',
        'launch-relaunch-failure',
        2,
        pendingDurability,
      ),
      event(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
        'cleanup-retry',
        'clean',
        'launch-relaunch-failure',
        3,
        cleanDurability,
      ),
      event(
        OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
        'signed-out-boot',
        'clean',
        'launch-final-absence',
        4,
        cleanDurability,
      ),
    ];

    assert.doesNotThrow(() =>
      assertOfflineCalendarAuthStorageFaultRequests(requests, {
        expectedSourceRevision: sourceRevision,
      }),
    );
    const inactivePrincipalRequest = {
      authorized: true,
      event: 'request',
      method: 'GET',
      path: '/api/v1/users/me',
      phase: OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
      requestId: 'inactive-principal',
      sequence: 0,
    };
    const inactivePrincipalCompletion = {
      completed: true,
      event: 'completion',
      requestId: 'inactive-principal',
      semanticOutcome: 'principal-inactive',
      sequence: 0.5,
      statusCode: 400,
    };
    const boundaryRequests = [
      inactivePrincipalRequest,
      inactivePrincipalCompletion,
      ...requests,
    ];
    assert.doesNotThrow(() =>
      assertOfflineCalendarAuthBoundaryTraffic(boundaryRequests),
    );
    assert.doesNotThrow(() =>
      assertOfflineCalendarAuthCleanupEvidence(evidence, {
        expectedSourceRevision: sourceRevision,
        minimumOccurredAtMs: 100,
      }),
    );
    assert.doesNotThrow(() =>
      assertOfflineCalendarAuthCleanupEvidence(
        [
          event(
            CONNECTIVITY_CONTRACT_PHASES.seed,
            'signed-out-boot',
            'clean',
            'launch-seed',
            0,
            cleanDurability,
          ),
          ...evidence,
        ],
        {
          expectedSourceRevision: sourceRevision,
          minimumOccurredAtMs: 100,
        },
      ),
    );
    assert.throws(
      () =>
        assertOfflineCalendarAuthCleanupEvidence(
          evidence.map((entry) =>
            entry.cause === 'cleanup-retry'
              ? { ...entry, routeId: 'leaked-route' }
              : entry,
          ),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /did not prove pending, relaunched Retry, and final absence/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarAuthCleanupEvidence(
          evidence.map((entry) => ({
            ...entry,
            durability: {
              ...entry.durability,
              offlineCalendarPreference: 'enabled',
            },
          })),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /did not prove pending, relaunched Retry, and final absence/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarAuthCleanupEvidence(
          [...evidence, { ...evidence[0], sequence: 5 }],
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /did not prove pending, relaunched Retry, and final absence/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarAuthStorageFaultRequests(
          requests.filter((entry) => entry.requestId !== 'retry-consumed'),
          { expectedSourceRevision: sourceRevision },
        ),
      /did not issue exactly one injected fault followed by one consumed Retry/,
    );
    const extraConsumedRequest = request(
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
      'extra-inactive-consumed',
      7,
    );
    assert.throws(
      () =>
        assertOfflineCalendarAuthStorageFaultRequests(
          [
            ...requests,
            extraConsumedRequest,
            completion(
              OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
              'extra-inactive-consumed',
              8,
              204,
              'storage-fault-not-armed',
            ),
          ],
          { expectedSourceRevision: sourceRevision },
        ),
      /did not issue exactly one injected auth tombstone fault/,
    );
    for (const phase of [
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
    ]) {
      assert.throws(
        () =>
          assertOfflineCalendarAuthBoundaryTraffic([
            ...boundaryRequests,
            {
              authorized: true,
              event: 'request',
              method: 'GET',
              path: '/api/v1/mobile/safe-route/routes',
              phase,
              requestId: `escaped-${phase}`,
              sequence: 20,
            },
          ]),
        /did not complete one principal rejection|issued product API traffic/,
      );
    }
    assert.throws(
      () =>
        assertOfflineCalendarAuthBoundaryTraffic(
          boundaryRequests.map((entry) =>
            entry.requestId === 'inactive-principal' &&
            entry.event === 'completion'
              ? { ...entry, sequence: 2 }
              : entry,
          ),
        ),
      /did not complete one principal rejection before auth cleanup/,
    );
  });

  it('requires an exact authorized protected-cache seed request multiset', () => {
    const seedPhase = CONNECTIVITY_CONTRACT_PHASES.seed;
    const guidanceWorkspaceId = GUIDANCE_CONTRACT_WORKSPACES.denied.id;
    const supportWorkspaceId = GUIDANCE_CONTRACT_WORKSPACES.survivor.id;
    const request = (
      requestId: string,
      sequence: number,
      method: string,
      path: string,
      search = '',
      authenticated = true,
    ) => ({
      authorizationClass: authenticated ? 'expected-bearer' : 'none',
      authorized: authenticated,
      event: 'request',
      method,
      path,
      phase: seedPhase,
      requestId,
      search,
      sequence,
    });
    const completion = (
      original: ReturnType<typeof request>,
      sequence: number,
      semanticOutcome: string,
    ) => ({
      ...original,
      completed: true,
      event: 'completion',
      semanticOutcome,
      sequence,
      statusCode: 200,
    });
    const login = request(
      'seed-login',
      1,
      'POST',
      '/api/v1/auth/mobile-login',
      '',
      false,
    );
    const principal = request(
      'seed-principal',
      2,
      'GET',
      '/api/v1/users/me',
    );
    const catalog = request(
      'seed-catalog',
      3,
      'GET',
      '/api/v1/mobile/safe-route/routes',
    );
    const routeList = request(
      'seed-route-list',
      4,
      'GET',
      '/api/v1/mobile/safe-route/routes',
      `?client_id=${guidanceWorkspaceId}`,
    );
    const routeDetail = request(
      'seed-route-detail',
      6,
      'GET',
      `/api/v1/mobile/safe-route/routes/${GUIDANCE_CONTRACT_ROUTE_IDS.denied}`,
    );
    const guidanceOperationsFirst = request(
      'seed-guidance-operations-first',
      8,
      'GET',
      `/api/v1/mobile/safe-route/operations/client/${guidanceWorkspaceId}`,
    );
    const supportOperations = request(
      'seed-support-operations',
      10,
      'GET',
      `/api/v1/mobile/safe-route/operations/client/${supportWorkspaceId}`,
    );
    const guidanceOperationsLast = request(
      'seed-guidance-operations-last',
      12,
      'GET',
      `/api/v1/mobile/safe-route/operations/client/${guidanceWorkspaceId}`,
    );
    const entries = [
      login,
      principal,
      catalog,
      routeList,
      completion(routeList, 5, 'catalog-active'),
      routeDetail,
      completion(routeDetail, 7, 'route-detail-active'),
      guidanceOperationsFirst,
      completion(guidanceOperationsFirst, 9, 'operations-active'),
      supportOperations,
      completion(supportOperations, 11, 'operations-active'),
      guidanceOperationsLast,
      completion(guidanceOperationsLast, 13, 'operations-active'),
    ];

    assert.doesNotThrow(() =>
      assertOfflineCalendarProtectedCacheSeedTraffic(entries),
    );
    assert.throws(
      () =>
        assertOfflineCalendarProtectedCacheSeedTraffic([
          ...entries,
          request(
            'seed-unexpected',
            14,
            'GET',
            '/api/v1/mobile/safe-route/routes/66b1b2c3d4e5f60718293b41',
          ),
        ]),
      /protected-cache seed traffic was not the exact authorized/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarProtectedCacheSeedTraffic(
          entries.map((entry) =>
            entry.requestId === 'seed-route-list' &&
            entry.event === 'request'
              ? {
                  ...entry,
                  authorizationClass: 'none',
                  authorized: false,
                }
              : entry,
          ),
        ),
      /protected-cache seed traffic was not the exact authorized/,
    );
  });

  it('correlates a saved-principal change with terminal Calendar revocation and cold absence', () => {
    const sourceRevision = '7'.repeat(40);
    const validationPhase =
      OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable;
    const validationOfflineRelaunchPhase =
      OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch;
    const changePhase = OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change;
    const relaunchPhase = OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch;
    const validationRequest = {
      authorizationClass: 'expected-bearer',
      authorized: true,
      event: 'request',
      method: 'GET',
      path: '/api/v1/users/me',
      phase: validationPhase,
      requestId: 'principal-validation-unavailable-request',
      search: '',
      sequence: 1,
      timestampMs: 180,
    };
    const validationCompletion = {
      ...validationRequest,
      completed: true,
      event: 'completion',
      semanticOutcome: 'principal-validation-unavailable',
      sequence: 2,
      statusCode: 503,
      timestampMs: 190,
    };
    const request = {
      authorizationClass: 'expected-bearer',
      authorized: true,
      event: 'request',
      method: 'GET',
      path: '/api/v1/users/me',
      phase: changePhase,
      requestId: 'principal-change-request',
      search: '',
      sequence: 3,
      timestampMs: 200,
    };
    const completion = {
      ...request,
      completed: true,
      event: 'completion',
      semanticOutcome: 'principal-b',
      sequence: 4,
      statusCode: 200,
      timestampMs: 210,
    };
    const evidence = (
      serverPhase: string,
      cause: string,
      appLaunchId: string,
      sequence: number,
      receivedAtMs: number,
    ) => ({
      appLaunchId,
      authorization: {
        catalog: cause === 'principal-change-seed'
          ? 'fresh-authorized'
          : 'not-checked',
        principal:
          cause === 'principal-change-seed'
          ? 'matching'
          : cause === 'principal-change-validation-unavailable' ||
              cause === 'principal-change-validation-offline-relaunch'
            ? 'unknown'
          : cause === 'principal-change'
            ? 'mismatched'
            : 'none',
      },
      cause,
      durability: {
        authSession:
          cause === 'principal-change-seed' ||
          cause === 'principal-change-validation-unavailable' ||
          cause === 'principal-change-validation-offline-relaunch'
            ? 'present'
            : 'signed-out',
        offlineCalendarCleanup: 'absent',
        offlineCalendarPayload:
          cause === 'principal-change-seed' ||
          cause === 'principal-change-validation-unavailable' ||
          cause === 'principal-change-validation-offline-relaunch'
            ? 'present'
            : 'absent',
        offlineCalendarPreference: 'disabled',
        offlineCalendarSlot:
          cause === 'principal-change-seed' ||
          cause === 'principal-change-validation-unavailable' ||
          cause === 'principal-change-validation-offline-relaunch'
            ? 'payload'
            : cause === 'principal-change-relaunch'
              ? 'empty'
              : 'principal-revoked',
        routeCache:
          cause === 'principal-change-seed' ||
          cause === 'principal-change-validation-unavailable' ||
          cause === 'principal-change-validation-offline-relaunch'
            ? 'present'
            : 'purged',
        workspaceContext:
          cause === 'principal-change-seed' ||
          cause === 'principal-change-validation-unavailable' ||
          cause === 'principal-change-validation-offline-relaunch'
            ? 'persisted'
            : 'revoked',
      },
      navigationInstanceId: null,
      occurredAtMs: 100 + sequence,
      outcome:
        cause === 'principal-change-seed'
          ? 'seeded'
          : cause === 'principal-change-validation-unavailable' ||
              cause === 'principal-change-validation-offline-relaunch'
            ? 'quarantined'
            : 'clean',
      receivedAtMs,
      routeId: GUIDANCE_CONTRACT_ROUTE_IDS.denied,
      sequence,
      serverPhase,
      sourceRevision,
      type: 'offline.calendar.principal-lifecycle',
      unavailableWorkspaceIds: [],
      workspaceId: GUIDANCE_CONTRACT_WORKSPACES.denied.id,
    });
    const entries = [
      evidence(
        CONNECTIVITY_CONTRACT_PHASES.seed,
        'principal-change-seed',
        'launch-principal-seed',
        1,
        150,
      ),
      evidence(
        validationPhase,
        'principal-change-validation-unavailable',
        'launch-principal-validation',
        2,
        195,
      ),
      evidence(
        validationOfflineRelaunchPhase,
        'principal-change-validation-offline-relaunch',
        'launch-principal-validation-offline',
        3,
        198,
      ),
      evidence(
        changePhase,
        'principal-change',
        'launch-principal-change',
        4,
        215,
      ),
      evidence(
        relaunchPhase,
        'principal-change-relaunch-revoked',
        'launch-principal-relaunch',
        5,
        220,
      ),
      evidence(
        relaunchPhase,
        'principal-change-relaunch',
        'launch-principal-relaunch',
        6,
        225,
      ),
    ];

    assert.doesNotThrow(() =>
      assertOfflineCalendarPrincipalChangeTraffic(
        [validationRequest, validationCompletion, request, completion],
        entries,
      ),
    );
    assert.doesNotThrow(() =>
      assertOfflineCalendarPrincipalChangeEvidence(entries, {
        expectedSourceRevision: sourceRevision,
        minimumOccurredAtMs: 100,
      }),
    );
    assert.throws(
      () =>
        assertOfflineCalendarPrincipalChangeTraffic(
          [
            validationRequest,
            validationCompletion,
            request,
            completion,
            {
              ...request,
              path: '/api/v1/mobile/safe-route/routes',
              requestId: 'escaped-catalog',
              sequence: 5,
              timestampMs: 220,
            },
          ],
          entries,
        ),
      /did not durably quarantine one unavailable validation/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarPrincipalChangeTraffic(
          [
            validationRequest,
            {
              ...validationCompletion,
              statusCode: 200,
            },
            request,
            completion,
          ],
          entries,
        ),
      /did not durably quarantine one unavailable validation/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarPrincipalChangeTraffic(
          [
            validationRequest,
            validationCompletion,
            {
              ...validationRequest,
              phase:
                OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES
                  .validationOfflineRelaunch,
              requestId: 'offline-cache-escape',
              sequence: 3,
            },
            {
              ...request,
              sequence: 4,
            },
            {
              ...completion,
              sequence: 5,
            },
          ],
          entries,
        ),
      /did not durably quarantine one unavailable validation/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarPrincipalChangeEvidence(
          entries.map((entry) =>
            entry.cause === 'principal-change'
              ? {
                  ...entry,
                  durability: {
                    ...entry.durability,
                    offlineCalendarSlot: 'payload',
                  },
                }
              : entry,
          ),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /did not prove exact seeded caches/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarPrincipalChangeEvidence(
          entries.map((entry) => ({
            ...entry,
            appLaunchId: 'same-launch',
          })),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /did not prove exact seeded caches/,
    );
  });

  it('correlates an owned Operations denial with durable Calendar revocation and cold absence', () => {
    const sourceRevision = '8'.repeat(40);
    const supportOperationsPath =
      `/api/v1/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}`;
    const routesPath = '/api/v1/mobile/safe-route/routes';
    const request = (
      requestId: string,
      sequence: number,
      path: string,
      search = '',
      phase = OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
    ) => ({
      authorizationClass: 'expected-bearer',
      authorized: true,
      event: 'request',
      method: 'GET',
      path,
      phase,
      requestId,
      search,
      sequence,
    });
    const completion = (
      source: ReturnType<typeof request>,
      sequence: number,
      statusCode: number,
      semanticOutcome: string,
    ) => ({
      ...source,
      completed: true,
      event: 'completion',
      semanticOutcome,
      sequence,
      statusCode,
    });
    const deniedRequest = request(
      'denied-routes',
      1,
      routesPath,
      `?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
    );
    const principalRequest = request('principal', 3, '/api/v1/users/me');
    const catalogRequest = request(
      'catalog',
      5,
      '/api/v1/mobile/safe-route/routes',
    );
    const supportRoutesRequest = request(
      'support-routes',
      7,
      routesPath,
      `?client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}`,
    );
    const supportRequest = request(
      'support-operations',
      9,
      supportOperationsPath,
    );
    const requests = [
      deniedRequest,
      completion(deniedRequest, 2, 403, 'api-error-403'),
      principalRequest,
      completion(principalRequest, 4, 200, 'principal-a'),
      catalogRequest,
      completion(catalogRequest, 6, 200, 'catalog-survivor'),
      supportRoutesRequest,
      completion(supportRoutesRequest, 8, 200, 'catalog-survivor'),
      supportRequest,
      completion(supportRequest, 10, 200, 'operations-active'),
    ];
    const durability = {
      authSession: 'present',
      offlineCalendarCleanup: 'absent',
      offlineCalendarPayload: 'absent',
      offlineCalendarPreference: 'disabled',
      offlineCalendarSlot: 'workspace-revoked',
      workspaceContext: 'persisted',
    };
    const event = (
      serverPhase: string,
      cause: string,
      appLaunchId: string,
      authorizationCatalog: string,
      sequence: number,
    ) => ({
      appLaunchId,
      authorization: {
        catalog: authorizationCatalog,
        principal: 'matching',
      },
      cause,
      durability,
      navigationInstanceId: null,
      occurredAtMs: 200 + sequence,
      outcome: 'clean',
      receivedAtMs: 300 + sequence,
      routeId: null,
      sequence,
      serverPhase,
      sourceRevision,
      type: 'offline.calendar.workspace-lifecycle',
      unavailableWorkspaceIds: [GUIDANCE_CONTRACT_WORKSPACES.denied.id],
      workspaceId: GUIDANCE_CONTRACT_WORKSPACES.denied.id,
    });
    const seedEvidence = {
      ...event(
        CONNECTIVITY_CONTRACT_PHASES.seed,
        'workspace-denial-seed',
        'launch-workspace-seed',
        'fresh-authorized',
        0,
      ),
      durability: {
        ...durability,
        offlineCalendarPayload: 'present',
        offlineCalendarSlot: 'payload',
        workspaceContext: undefined,
      },
      outcome: 'seeded',
      receivedAtMs: 300,
      unavailableWorkspaceIds: [],
    };
    const evidence = [
      seedEvidence,
      event(
        OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
        'workspace-denial',
        'launch-workspace-denial',
        'fresh-denied',
        1,
      ),
      event(
        OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch,
        'workspace-denial-relaunch',
        'launch-workspace-relaunch',
        'not-checked',
        2,
      ),
    ];

    assert.doesNotThrow(() =>
      assertOfflineCalendarWorkspaceDenialTraffic(requests),
    );
    assert.doesNotThrow(() =>
      assertOfflineCalendarWorkspaceRevocationEvidence(evidence, {
        expectedSourceRevision: sourceRevision,
        minimumOccurredAtMs: 100,
      }),
    );
    assert.throws(
      () =>
        assertOfflineCalendarWorkspaceRevocationEvidence(
          evidence.map((entry) => ({
            ...entry,
            durability: {
              ...entry.durability,
              offlineCalendarPreference: 'enabled',
            },
          })),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /did not prove a real seed, one persisted revocation, and one distinct-process absence/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarWorkspaceRevocationEvidence(
          evidence.map((entry) => ({
            ...entry,
            appLaunchId: 'same-launch',
          })),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /did not prove a real seed, one persisted revocation, and one distinct-process absence/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarWorkspaceDenialTraffic(
          requests.filter((entry) => entry.requestId !== 'support-operations'),
        ),
      /did not preserve the exact scoped-403, survivor reconciliation/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarWorkspaceDenialTraffic(
          requests.map((entry) =>
            entry.requestId === 'principal' && entry.event === 'request'
              ? { ...entry, sequence: 2 }
              : entry,
          ),
        ),
      /did not preserve the exact scoped-403, survivor reconciliation/,
    );
    assert.throws(
      () =>
        assertOfflineCalendarWorkspaceDenialTraffic(
          requests.map((entry) =>
            entry.requestId === 'catalog' && entry.event === 'request'
              ? { ...entry, sequence: 4 }
              : entry,
          ),
        ),
      /did not preserve the exact scoped-403, survivor reconciliation/,
    );
    const escapedDeniedRequest = request(
      'escaped-denied-routes',
      11,
      routesPath,
      `?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
    );
    assert.throws(
      () =>
        assertOfflineCalendarWorkspaceDenialTraffic([
          ...requests,
          escapedDeniedRequest,
          completion(escapedDeniedRequest, 12, 403, 'api-error-403'),
        ]),
      /did not preserve the exact scoped-403, survivor reconciliation/,
    );
  });

  it('correlates offline End with an absent, cached-review process relaunch', () => {
    const sourceRevision = 'e'.repeat(40);
    const identity = {
      appLaunchId: 'launch-connectivity',
      navigationInstanceId: 'navigation-connectivity',
      occurredAtMs: 200,
      routeId: 'route-connectivity',
      serverPhase: 'connectivityOffline',
      sourceRevision,
      workspaceId: 'workspace-connectivity',
    };
    const entries = [
      {
        ...identity,
        authorization: { catalog: 'unavailable', principal: 'matching' },
        durability: {
          activeNavigation: 'present',
          nativeTracking: 'stopped',
          runtimePermit: 'none',
        },
        outcome: 'suspended',
        type: 'restore.suspended',
      },
      {
        ...identity,
        authorization: { catalog: 'not-checked', principal: 'matching' },
        durability: {
          activeNavigation: 'revoked',
          persistedPermit: 'revoked',
        },
        occurredAtMs: 201,
        outcome: 'cleared',
        type: 'navigation.cleanup.settled',
      },
      {
        ...identity,
        authorization: { catalog: 'not-checked', principal: 'matching' },
        durability: {
          nativeTracking: 'stopped',
          persistedPermit: 'revoked',
          runtimePermit: 'none',
        },
        occurredAtMs: 202,
        outcome: 'off',
        type: 'tracking.stop.settled',
      },
      {
        ...identity,
        appLaunchId: 'launch-connectivity-relaunch',
        authorization: { catalog: 'not-checked', principal: 'unknown' },
        durability: {
          activeNavigation: 'absent',
          nativeTracking: 'unsupported',
          runtimePermit: 'none',
        },
        navigationInstanceId: null,
        occurredAtMs: 203,
        outcome: 'absent',
        routeId: null,
        serverPhase: 'connectivityOfflineRelaunch',
        type: 'navigation.absence.readback',
        workspaceId: null,
      },
      {
        ...identity,
        appLaunchId: 'launch-connectivity-relaunch',
        authorization: { catalog: 'unavailable', principal: 'matching' },
        durability: {
          routeCache: 'present',
        },
        navigationInstanceId: null,
        occurredAtMs: 204,
        outcome: 'readable',
        serverPhase: 'connectivityOfflineRelaunch',
        type: 'route.cache.readback',
      },
    ];

    assert.doesNotThrow(() =>
      assertConnectivityContractEndedJourneyStayedClosed(entries, {
        expectedSourceRevision: sourceRevision,
        minimumOccurredAtMs: 100,
      }),
    );
    assert.throws(
      () =>
        assertConnectivityContractEndedJourneyStayedClosed(
          entries.map((entry) =>
            entry.type === 'navigation.cleanup.settled'
              ? { ...entry, appLaunchId: 'another-launch' }
              : entry,
          ),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /cleanup was not correlated/,
    );
    assert.throws(
      () =>
        assertConnectivityContractEndedJourneyStayedClosed(
          entries.map((entry) =>
            entry.type === 'navigation.absence.readback'
              ? { ...entry, appLaunchId: identity.appLaunchId }
              : entry,
          ),
          {
            expectedSourceRevision: sourceRevision,
            minimumOccurredAtMs: 100,
          },
        ),
      /absent after process relaunch/,
    );
  });

  it('models transient unscoped catalog failure without blocking cached-workspace surfaces', async () => {
    let phase = WORKSPACE_CATALOG_RECOVERY_PHASES.initialFailure;
    const requestedDelays: number[] = [];
    const requests: Array<{
      event?: string;
      path: string;
      phase: string;
      search: string;
      semanticOutcome?: string;
      statusCode?: number | null;
    }> = [];
    const server = await startGuidanceContractApi({
      port: 0,
      readControl: () => ({ mode: GUIDANCE_CONTRACT_MODES.active, phase }),
      requestLog: (entry: (typeof requests)[number]) => requests.push(entry),
      sleep: async (milliseconds: number) => {
        requestedDelays.push(milliseconds);
      },
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const headers = {
      Authorization: `Bearer ${createGuidanceContractAccessToken()}`,
    };

    try {
      const initialFailure = await fetch(`${base}/mobile/safe-route/routes`, { headers });
      assert.equal(initialFailure.status, 503);

      const cachedWorkspaceRoutes = await fetch(
        `${base}/mobile/safe-route/routes?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
        { headers },
      );
      assert.equal(cachedWorkspaceRoutes.status, 200);

      const operations = await fetch(
        `${base}/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
        { headers },
      );
      assert.equal(operations.status, 200);
      assert.equal((await operations.json()).data.client_id, GUIDANCE_CONTRACT_WORKSPACES.denied.id);
      assert.equal((await fetch(
        `${base}/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
      )).status, 401);

      for (const retryPhase of [
        WORKSPACE_CATALOG_RECOVERY_PHASES.mapRetryFailure,
        WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure,
        WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure,
      ]) {
        phase = retryPhase;
        const retryFailure = await fetch(`${base}/mobile/safe-route/routes`, { headers });
        assert.equal(retryFailure.status, 503);
      }
      assert.deepEqual(requestedDelays, [
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
      ]);

      phase = WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure;
      const restoreFailure = await fetch(`${base}/mobile/safe-route/routes`, { headers });
      assert.equal(restoreFailure.status, 503);
      assert.deepEqual(requestedDelays, [
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
      ]);

      phase = WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRelaunch;
      const endedRelaunchFailure = await fetch(
        `${base}/mobile/safe-route/routes`,
        { headers },
      );
      assert.equal(endedRelaunchFailure.status, 503);

      phase = WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess;
      const freshSuccess = await fetch(`${base}/mobile/safe-route/routes`, { headers });
      assert.equal(freshSuccess.status, 200);
      assert.equal((await freshSuccess.json()).data.clients.length, 2);
      assert.deepEqual(requestedDelays, [
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_SUCCESS_DELAY_MS,
      ]);

      phase = WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRetrySuccess;
      const endedRetrySuccess = await fetch(
        `${base}/mobile/safe-route/routes`,
        { headers },
      );
      assert.equal(endedRetrySuccess.status, 200);
      assert.equal((await endedRetrySuccess.json()).data.clients.length, 2);
      assert.deepEqual(requestedDelays, [
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_RETRY_DELAY_MS,
        WORKSPACE_CATALOG_SUCCESS_DELAY_MS,
        WORKSPACE_CATALOG_SUCCESS_DELAY_MS,
      ]);

      const completionOutcomes = requests
        .filter((entry) =>
          entry.event === 'completion' &&
          entry.path === '/api/v1/mobile/safe-route/routes' &&
          entry.search === ''
        )
        .map((entry) => [entry.phase, entry.statusCode, entry.semanticOutcome]);
      assert.deepEqual(completionOutcomes, [
        [WORKSPACE_CATALOG_RECOVERY_PHASES.initialFailure, 503, 'catalog-initial-unavailable'],
        [WORKSPACE_CATALOG_RECOVERY_PHASES.mapRetryFailure, 503, 'catalog-retry-unavailable'],
        [WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure, 503, 'catalog-retry-unavailable'],
        [WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure, 503, 'catalog-retry-unavailable'],
        [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure, 503, 'catalog-restore-unavailable'],
        [
          WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRelaunch,
          503,
          'catalog-ended-relaunch-unavailable',
        ],
        [WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess, 200, 'catalog-active'],
        [
          WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRetrySuccess,
          200,
          'catalog-active',
        ],
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('holds foreground authorization catalogs until the runner releases the exact phase', async () => {
    let control = {
      catalogReleased: false,
      mode: GUIDANCE_CONTRACT_MODES.active,
      phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate,
    };
    const server = await startGuidanceContractApi({
      port: 0,
      readControl: () => control,
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint = `http://127.0.0.1:${address.port}/api/v1/mobile/safe-route/routes`;
    const headers = {
      Authorization: `Bearer ${createGuidanceContractAccessToken()}`,
    };

    try {
      let completed = false;
      const pendingCatalog = fetch(endpoint, { headers }).then((response) => {
        completed = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(completed, false);
      control = { ...control, catalogReleased: true };
      assert.equal((await pendingCatalog).status, 200);

      control = {
        catalogReleased: false,
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd,
      };
      completed = false;
      const pendingRestoreEnd = fetch(endpoint, { headers }).then((response) => {
        completed = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(completed, false);
      control = { ...control, catalogReleased: true };
      assert.equal((await pendingRestoreEnd).status, 200);

      control = {
        catalogReleased: false,
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRestart,
      };
      completed = false;
      const pendingEndedRestart = fetch(endpoint, { headers }).then((response) => {
        completed = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(completed, false);
      control = { ...control, catalogReleased: true };
      assert.equal((await pendingEndedRestart).status, 200);

      control = {
        catalogReleased: false,
        mode: GUIDANCE_CONTRACT_MODES.denied,
        phase: WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss,
      };
      completed = false;
      const pendingDenial = fetch(endpoint, { headers }).then((response) => {
        completed = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(completed, false);
      control = { ...control, catalogReleased: true };
      const deniedCatalog = await pendingDenial;
      assert.equal(deniedCatalog.status, 200);
      assert.deepEqual((await deniedCatalog.json()).data.clients, [
        GUIDANCE_CONTRACT_WORKSPACES.survivor,
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('holds active-guidance authorization before returning its transient catalog failure', async () => {
    let control = {
      catalogReleased: false,
      mode: GUIDANCE_CONTRACT_MODES.active,
      phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure,
    };
    const requests: Array<{
      event?: string;
      path: string;
      phase: string;
      semanticOutcome?: string;
      statusCode?: number | null;
    }> = [];
    const server = await startGuidanceContractApi({
      port: 0,
      readControl: () => control,
      requestLog: (entry: (typeof requests)[number]) => requests.push(entry),
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint = `http://127.0.0.1:${address.port}/api/v1/mobile/safe-route/routes`;
    const headers = {
      Authorization: `Bearer ${createGuidanceContractAccessToken()}`,
    };

    try {
      let completed = false;
      const pendingCatalog = fetch(endpoint, { headers }).then((response) => {
        completed = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(completed, false);
      control = { ...control, catalogReleased: true };
      assert.equal((await pendingCatalog).status, 503);
      assert.deepEqual(
        requests
          .filter((entry) => entry.event === 'completion')
          .map((entry) => [entry.phase, entry.statusCode, entry.semanticOutcome]),
        [[
          WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure,
          503,
          'catalog-foreground-unavailable',
        ]],
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('acknowledges exact device evidence and rejects missing headers or ID conflicts', async () => {
    const recorded = new Map<string, string>();
    const server = await startGuidanceContractApi({
      evidenceLog: (entry: Record<string, unknown>) => {
        const fingerprint = JSON.stringify(entry);
        const previous = recorded.get(String(entry.eventId));
        if (previous) {
          return previous === fingerprint ? 'duplicate' : 'conflict';
        }
        recorded.set(String(entry.eventId), fingerprint);
        return 'recorded';
      },
      port: 0,
      readControl: () => ({ mode: GUIDANCE_CONTRACT_MODES.active, phase: 'workspaceStart' })
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint = `http://127.0.0.1:${address.port}${GUIDANCE_CONTRACT_EVIDENCE_PATH}`;
    const body = {
      appLaunchId: 'launch-evidence-1',
      authorization: { catalog: 'fresh-authorized', principal: 'matching' },
      cause: 'navigation-state-persist',
      durability: { activeNavigation: 'present' },
      eventId: 'evidence-event-1',
      navigationInstanceId: 'navigation-1',
      occurredAtMs: 100,
      outcome: 'persisted',
      routeId: 'route-1',
      schema: 1,
      sourceRevision: 'a'.repeat(40),
      type: 'navigation.persisted',
      unavailableWorkspaceIds: [],
      workspaceId: 'workspace-1'
    };
    try {
      assert.equal((await fetch(endpoint, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      })).status, 403);
      const send = (value: object) => fetch(endpoint, {
        body: JSON.stringify(value),
        headers: {
          'Content-Type': 'application/json',
          'X-SafeRoute-Guidance-Contract-Evidence': '1'
        },
        method: 'POST'
      });
      const recordedResponse = await send(body);
      assert.equal(recordedResponse.status, 200);
      assert.deepEqual((await recordedResponse.json()).data, {
        event_id: 'evidence-event-1',
        result: 'recorded'
      });
      assert.equal((await send(body)).status, 200);
      assert.equal((await send({ ...body, outcome: 'different' })).status, 409);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('journals correlated durable lifecycle evidence across API restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'saferoute-evidence-'));
    const evidenceLogFile = join(directory, 'evidence.jsonl');
    const append = createGuidanceContractEvidenceJournal({
      evidenceLogFile,
      now: () => 500
    });
    const persisted = {
      appLaunchId: 'launch-evidence-1',
      authorization: { catalog: 'fresh-authorized', principal: 'matching' },
      cause: 'navigation-state-persist',
      durability: { activeNavigation: 'present' },
      eventId: 'evidence-event-1',
      navigationInstanceId: 'navigation-1',
      occurredAtMs: 100,
      outcome: 'persisted',
      routeId: 'route-1',
      schema: 1,
      sourceRevision: 'a'.repeat(40),
      type: 'navigation.persisted',
      unavailableWorkspaceIds: [],
      workspaceId: 'workspace-1'
    };
    const suspended = {
      ...persisted,
      authorization: { catalog: 'unavailable', principal: 'matching' },
      cause: 'workspace-authorization-pending',
      durability: {
        activeNavigation: 'present',
        nativeTracking: 'not-started',
        runtimePermit: 'none'
      },
      eventId: 'evidence-event-2',
      occurredAtMs: 200,
      outcome: 'suspended',
      type: 'restore.suspended'
    };
    const ready = {
      ...persisted,
      eventId: 'evidence-event-3',
      occurredAtMs: 300,
      outcome: 'ready',
      type: 'restore.ready'
    };
    const recovery = {
      ...persisted,
      authorization: { catalog: 'fresh-denied', principal: 'matching' },
      cause: 'workspace-access-loss',
      durability: { routeCache: 'purged', workspaceContext: 'persisted' },
      eventId: 'evidence-event-4',
      navigationInstanceId: null,
      occurredAtMs: 350,
      outcome: 'persisted',
      routeId: null,
      type: 'workspace.recovery.settled',
      unavailableWorkspaceIds: ['workspace-1']
    };
    const cleanup = {
      ...persisted,
      authorization: { catalog: 'not-checked', principal: 'matching' },
      cause: 'navigation-discard',
      durability: { activeNavigation: 'revoked', persistedPermit: 'revoked' },
      eventId: 'evidence-event-5',
      occurredAtMs: 400,
      outcome: 'cleared',
      type: 'navigation.cleanup.settled'
    };
    const tracking = {
      ...cleanup,
      durability: {
        nativeTracking: 'not-started',
        persistedPermit: 'revoked',
        runtimePermit: 'none'
      },
      eventId: 'evidence-event-6',
      occurredAtMs: 410,
      outcome: 'off',
      type: 'tracking.stop.settled'
    };
    const cacheReadback = {
      ...persisted,
      authorization: { catalog: 'unavailable', principal: 'matching' },
      cause: 'saved-list-readback',
      durability: { routeCache: 'present' },
      eventId: 'evidence-event-7',
      navigationInstanceId: null,
      occurredAtMs: 420,
      outcome: 'readable',
      routeId: GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.survivor,
      type: 'route.cache.readback',
      workspaceId: GUIDANCE_CONTRACT_WORKSPACES.survivor.id
    };
    const absenceReadback = {
      ...persisted,
      appLaunchId: 'launch-evidence-2',
      authorization: { catalog: 'not-checked', principal: 'unknown' },
      cause: 'cold-start-readback',
      durability: {
        activeNavigation: 'absent',
        nativeTracking: 'unsupported',
        runtimePermit: 'none'
      },
      eventId: 'evidence-event-8',
      navigationInstanceId: null,
      occurredAtMs: 430,
      outcome: 'absent',
      routeId: null,
      type: 'navigation.absence.readback',
      unavailableWorkspaceIds: [],
      workspaceId: null
    };
    const prestartReadback = {
      ...persisted,
      appLaunchId: 'launch-evidence-2',
      authorization: { catalog: 'fresh-authorized', principal: 'matching' },
      cause: 'loaded-route-prestart-readback',
      durability: {
        activeNavigation: 'absent',
        nativeTracking: 'unsupported',
        runtimePermit: 'none'
      },
      eventId: 'evidence-event-9',
      navigationInstanceId: null,
      occurredAtMs: 435,
      outcome: 'ready',
      routeId: GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1,
      type: 'navigation.prestart.readback',
      unavailableWorkspaceIds: [],
      workspaceId: GUIDANCE_CONTRACT_WORKSPACES.denied.id
    };
    const replacementPersisted = {
      ...persisted,
      appLaunchId: 'launch-evidence-2',
      eventId: 'evidence-event-10',
      navigationInstanceId: 'navigation-instance-2',
      occurredAtMs: 440
    };
    try {
      assert.equal(append(persisted, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: 'workspaceStart'
      }), 'recorded');
      assert.equal(append(persisted, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: 'workspaceStart'
      }), 'duplicate');
      assert.equal(append({ ...persisted, outcome: 'changed' }, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: 'workspaceStart'
      }), 'conflict');
      assert.equal(append(suspended, {
        mode: GUIDANCE_CONTRACT_MODES.offline,
        phase: 'workspaceOffline'
      }), 'recorded');
      assert.equal(append(ready, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: 'workspaceReconnect'
      }), 'recorded');
      assert.equal(append(recovery, {
        mode: GUIDANCE_CONTRACT_MODES.denied,
        phase: 'denied'
      }), 'recorded');
      assert.equal(append(cleanup, {
        mode: GUIDANCE_CONTRACT_MODES.denied,
        phase: 'denied'
      }), 'recorded');
      assert.equal(append(tracking, {
        mode: GUIDANCE_CONTRACT_MODES.denied,
        phase: 'denied'
      }), 'recorded');
      assert.equal(append(cacheReadback, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: 'regained'
      }), 'recorded');
      assert.equal(append(absenceReadback, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRelaunch
      }), 'recorded');
      assert.equal(append(prestartReadback, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRouteReload
      }), 'recorded');
      assert.equal(append(replacementPersisted, {
        mode: GUIDANCE_CONTRACT_MODES.active,
        phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRestart
      }), 'recorded');
      const entries = readFileSync(evidenceLogFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.doesNotThrow(() => assertGuidanceContractEvidenceJournal(entries, {
        expectedSourceRevision: 'a'.repeat(40),
        requiredTypes: ['navigation.persisted', 'restore.suspended']
      }));
      assert.doesNotThrow(() => assertGuidanceContractEvidenceJournal(entries, {
        expectedSourceRevision: 'a'.repeat(40),
        requiredTypes: [
          'navigation.persisted',
          'restore.suspended',
          'restore.ready',
          'workspace.recovery.settled',
          'route.cache.readback',
          'navigation.cleanup.settled',
          'tracking.stop.settled',
          'navigation.absence.readback',
          'navigation.prestart.readback'
        ]
      }));
      const lifecycleEntry = (
        entry: Record<string, unknown>,
        sequence: number,
        eventId: string,
        navigationInstanceId: string,
      ) => ({
        ...entry,
        eventId,
        navigationInstanceId,
        sequence,
      });
      assert.throws(() => assertGuidanceContractEvidenceJournal([
        lifecycleEntry(entries[0], 1, 'split-persist-a', 'navigation-a'),
        lifecycleEntry(entries[4], 2, 'split-cleanup-a', 'navigation-a'),
        lifecycleEntry(entries[0], 3, 'split-persist-b', 'navigation-b'),
        lifecycleEntry(entries[5], 4, 'split-tracking-b', 'navigation-b'),
        lifecycleEntry(entries[4], 5, 'split-cleanup-c', 'navigation-c'),
        lifecycleEntry(entries[5], 6, 'split-tracking-c', 'navigation-c'),
      ], {
        expectedSourceRevision: 'a'.repeat(40),
        requiredTypes: [
          'navigation.persisted',
          'navigation.cleanup.settled',
          'tracking.stop.settled'
        ]
      }), /no correlated navigation cleanup and tracking stop/);
      assert.throws(() => assertGuidanceContractEvidenceJournal([
        entries[0],
        {
          ...entries[1],
          durability: { ...entries[1].durability, nativeTracking: 'active' }
        }
      ], {
        expectedSourceRevision: 'a'.repeat(40),
        requiredTypes: ['navigation.persisted', 'restore.suspended']
      }), /no successful restore\.suspended event/);
      assert.throws(() => assertGuidanceContractEvidenceJournal([
        entries[0],
        { ...entries[1], serverPhase: 'reset' }
      ], {
        expectedSourceRevision: 'a'.repeat(40),
        requiredTypes: ['navigation.persisted', 'restore.suspended']
      }), /no successful restore\.suspended event/);
      assert.throws(() => assertGuidanceContractEvidenceJournal([entries[0]], {
        expectedSourceRevision: 'a'.repeat(40),
        minimumOccurredAtMs: 150,
        requiredTypes: ['navigation.persisted']
      }), /no successful navigation\.persisted event/);
      assert.throws(() => assertGuidanceContractEvidenceJournal([
        { ...entries[1], sequence: 1 },
      ], {
        expectedSourceRevision: 'a'.repeat(40),
        requiredTypes: ['restore.suspended']
      }), /persisted-navigation correlation/);

      const routeReadback = (
        cause: 'saved-detail-readback' | 'saved-list-readback',
        eventId: string,
        routeId: string,
        serverPhase: string,
        workspaceId: string,
      ) => ({
        ...cacheReadback,
        cause,
        eventId,
        routeId,
        serverPhase,
        workspaceId,
      });
      const routeReadbacks = [
        {
          ...recovery,
          eventId: 'exact-denied-recovery',
          occurredAtMs: 405,
          serverPhase: 'denied',
          unavailableWorkspaceIds: [GUIDANCE_CONTRACT_WORKSPACES.denied.id],
          workspaceId: GUIDANCE_CONTRACT_WORKSPACES.denied.id,
        },
        routeReadback(
          'saved-list-readback',
          'survivor-list-readback',
          GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.survivor,
          'regained',
          GUIDANCE_CONTRACT_WORKSPACES.survivor.id,
        ),
        routeReadback(
          'saved-detail-readback',
          'survivor-detail-readback',
          GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.survivor,
          'regained',
          GUIDANCE_CONTRACT_WORKSPACES.survivor.id,
        ),
        routeReadback(
          'saved-list-readback',
          'regained-list-readback',
          GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2,
          'readbackEvidence',
          GUIDANCE_CONTRACT_WORKSPACES.denied.id,
        ),
        routeReadback(
          'saved-detail-readback',
          'regained-detail-readback',
          GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2,
          'readbackEvidence',
          GUIDANCE_CONTRACT_WORKSPACES.denied.id,
        ),
      ];
      const readbackOptions = {
        expectedSourceRevision: 'a'.repeat(40),
        minimumOccurredAtMs: 400,
      };
      assert.doesNotThrow(() =>
        assertGuidanceContractRouteCacheReadbackEvidence(
          routeReadbacks,
          readbackOptions,
        ));
      assert.throws(() =>
        assertGuidanceContractRouteCacheReadbackEvidence([
          ...routeReadbacks,
          {
            ...routeReadbacks[3],
            appLaunchId: 'launch-evidence-2',
            eventId: 'regained-detail-readback-2',
          },
        ], readbackOptions),
      /one-launch list\/detail durability/);
      assert.throws(() =>
        assertGuidanceContractRouteCacheReadbackEvidence([
          ...routeReadbacks,
          routeReadback(
            'saved-list-readback',
            'stale-regained-list-readback',
            GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1,
            'readbackEvidence',
            GUIDANCE_CONTRACT_WORKSPACES.denied.id,
          ),
        ], readbackOptions),
      /accepted the stale pre-denial route variant/);
      assert.throws(() =>
        assertGuidanceContractRouteCacheReadbackEvidence([
          {
            ...routeReadbacks[0],
            unavailableWorkspaceIds: [
              GUIDANCE_CONTRACT_WORKSPACES.denied.id,
              GUIDANCE_CONTRACT_WORKSPACES.survivor.id,
            ],
          },
          ...routeReadbacks.slice(1),
        ], readbackOptions),
      /not correlated with an earlier exact denied-workspace purge/);
      assert.throws(() =>
        assertGuidanceContractRouteCacheReadbackEvidence(
          routeReadbacks.map((entry) =>
            entry.type === 'route.cache.readback' &&
            entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.survivor.id
              ? {
                  ...entry,
                  authorization: {
                    catalog: 'unavailable',
                    principal: 'mismatched',
                  },
                }
              : entry),
          readbackOptions,
        ),
      /Survivor readback|one-launch list\/detail durability/);
      assert.throws(() =>
        assertGuidanceContractRouteCacheReadbackEvidence(
          routeReadbacks.map((entry) =>
            entry.type === 'route.cache.readback' &&
            entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id
              ? {
                  ...entry,
                  authorization: {
                    catalog: 'fresh-authorized',
                    principal: 'matching',
                  },
                }
              : entry),
          readbackOptions,
        ),
      /one-launch list\/detail durability/);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('enforces Bearer auth and models principal, denial, regain, and connection loss', async () => {
    let mode = GUIDANCE_CONTRACT_MODES.active;
    let phase = 'workspaceSeed';
    const requests: Array<{
      authorizationClass: string;
      authorized: boolean;
      completed?: boolean;
      event?: string;
      method: string;
      mode: string;
      path: string;
      phase: string;
      search: string;
      semanticOutcome?: string;
      statusCode?: number | null;
    }> = [];
    const server = await startGuidanceContractApi({
      port: 0,
      readMode: () => mode,
      readPhase: () => phase,
      requestLog: (entry: (typeof requests)[number]) => requests.push(entry)
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const authorization = `Bearer ${createGuidanceContractAccessToken()}`;

    try {
      const login = await fetch(`${base}/auth/mobile-login`, {
        body: 'username=driver%40example.com&password=contract',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST'
      });
      const loginBody = await login.json();
      assert.equal(loginBody.status, 'success');
      assert.equal(loginBody.data.token_type, 'bearer');

      assert.equal((await fetch(`${base}/users/me`)).status, 401);
      const userA = await fetch(`${base}/users/me`, {
        headers: { Authorization: authorization }
      });
      assert.equal((await userA.json()).data._id, '66d1b2c3d4e5f60718293d40');

      mode = GUIDANCE_CONTRACT_MODES.principalValidationUnavailable;
      const unavailableUser = await fetch(`${base}/users/me`, {
        headers: { Authorization: authorization }
      });
      assert.equal(unavailableUser.status, 503);
      assert.equal(
        (await unavailableUser.json()).message,
        'Saved-session verification is temporarily unavailable.'
      );

      mode = GUIDANCE_CONTRACT_MODES.wrongPrincipal;
      const userB = await fetch(`${base}/users/me`, {
        headers: { Authorization: authorization }
      });
      assert.equal((await userB.json()).data._id, '66d1b2c3d4e5f60718293d41');

      mode = GUIDANCE_CONTRACT_MODES.denied;
      const deniedCatalog = await fetch(`${base}/mobile/safe-route/routes`, {
        headers: { Authorization: authorization }
      });
      const deniedCatalogBody = await deniedCatalog.json();
      assert.deepEqual(deniedCatalogBody.data.clients, [
        GUIDANCE_CONTRACT_WORKSPACES.survivor
      ]);
      assert.deepEqual(
        deniedCatalogBody.data.routes.map((route: { id: string }) => route.id),
        [GUIDANCE_CONTRACT_ROUTE_IDS.survivor]
      );
      assert.equal((await fetch(
        `${base}/mobile/safe-route/routes?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
        { headers: { Authorization: authorization } }
      )).status, 403);
      const survivorScopedCatalog = await fetch(
        `${base}/mobile/safe-route/routes?client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}`,
        { headers: { Authorization: authorization } }
      );
      assert.equal(survivorScopedCatalog.status, 200);
      const survivorScopedCatalogBody = await survivorScopedCatalog.json();
      assert.deepEqual(survivorScopedCatalogBody.data.clients, [
        GUIDANCE_CONTRACT_WORKSPACES.survivor
      ]);
      assert.deepEqual(
        survivorScopedCatalogBody.data.routes.map((route: { id: string }) => route.id),
        [GUIDANCE_CONTRACT_ROUTE_IDS.survivor]
      );
      assert.equal(
        survivorScopedCatalogBody.data.selected_client_id,
        GUIDANCE_CONTRACT_WORKSPACES.survivor.id
      );
      assert.equal((await fetch(
        `${base}/mobile/safe-route/routes?client_id=missing-workspace`,
        { headers: { Authorization: authorization } }
      )).status, 404);
      assert.equal((await fetch(`${base}/convoy-routes/route-preview`, {
        body: JSON.stringify({
          client_id: GUIDANCE_CONTRACT_WORKSPACES.denied.id,
          waypoints: [
            { lat: 51.5074, lon: -0.1278 },
            { lat: 51.5053, lon: 0.0553 }
          ]
        }),
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      })).status, 403);
      assert.equal((await fetch(
        `${base}/intel/map/area-risk?refresh=false&read_only=true&client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
        { headers: { Authorization: authorization } }
      )).status, 403);
      assert.equal((await fetch(
        `${base}/intel/map/area-risk?refresh=false&read_only=true&client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
      )).status, 200);
      assert.equal((await fetch(`${base}/intel/map/area-risk?refresh=false&read_only=true`, {
        headers: { Authorization: 'Bearer invalid' }
      })).status, 401);
      const researchPayload = {
        bounds: {
          max_lat: 51.55,
          max_lon: 0.1,
          min_lat: 51.45,
          min_lon: -0.2
        },
        client_id: GUIDANCE_CONTRACT_WORKSPACES.survivor.id,
        country_hints: ['gb'],
        scope: 'detail',
        zoom: 12
      };
      assert.equal((await fetch(`${base}/intel/map/area-risk/research`, {
        body: JSON.stringify(researchPayload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      })).status, 401);
      const acceptedResearch = await fetch(`${base}/intel/map/area-risk/research`, {
        body: JSON.stringify(researchPayload),
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      });
      assert.equal(acceptedResearch.status, 200);
      assert.deepEqual((await acceptedResearch.json()).data.bounds, {
        maxLat: 51.55,
        maxLon: 0.1,
        minLat: 51.45,
        minLon: -0.2
      });
      assert.equal((await fetch(
        `${base}/intel/map/area-risk?refresh=false&read_only=true` +
        `&client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}` +
        '&scope=detail&zoom=12&bbox=51.45%2C-0.2%2C51.55%2C0.1',
        { headers: { Authorization: authorization } }
      )).status, 200);
      assert.equal((await fetch(`${base}/intel/map/area-risk/research`, {
        body: JSON.stringify({
          ...researchPayload,
          unexpected: true
        }),
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      })).status, 422);
      assert.equal((await fetch(`${base}/intel/map/area-risk/research`, {
        body: JSON.stringify({
          ...researchPayload,
          client_id: GUIDANCE_CONTRACT_WORKSPACES.denied.id
        }),
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      })).status, 403);
      assert.equal((await fetch(`${base}/users/me`, {
        headers: { Authorization: createGuidanceContractAccessToken() }
      })).status, 401);

      mode = GUIDANCE_CONTRACT_MODES.active;
      phase = 'connectivityInactiveSession';
      const inactiveUser = await fetch(`${base}/users/me`, {
        headers: { Authorization: authorization }
      });
      assert.equal(inactiveUser.status, 400);
      assert.deepEqual(await inactiveUser.json(), {
        detail: {
          details: 'This account has been deactivated',
          message: 'Inactive user'
        }
      });

      phase = 'unassigned';
      const restoredCatalog = await fetch(`${base}/mobile/safe-route/routes`, {
        headers: { Authorization: authorization }
      });
      const restoredCatalogBody = await restoredCatalog.json();
      assert.deepEqual(
        new Set(restoredCatalogBody.data.clients.map((client: { id: string }) => client.id)),
        new Set(Object.values(GUIDANCE_CONTRACT_WORKSPACES).map((workspace) => workspace.id))
      );
      assert.equal(
        restoredCatalogBody.data.routes.find(
          (route: { id: string }) => route.id === GUIDANCE_CONTRACT_ROUTE_IDS.denied
        ).route.id,
        GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1
      );
      assert.equal(restoredCatalogBody.data.selected_client_id, null);
      const scopedCatalog = await fetch(
        `${base}/mobile/safe-route/routes?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
        { headers: { Authorization: authorization } }
      );
      assert.equal(
        (await scopedCatalog.json()).data.selected_client_id,
        GUIDANCE_CONTRACT_WORKSPACES.denied.id
      );

      phase = 'regained';
      const regainedCatalog = await fetch(`${base}/mobile/safe-route/routes`, {
        headers: { Authorization: authorization }
      });
      const regainedCatalogBody = await regainedCatalog.json();
      const regainedRoute = regainedCatalogBody.data.routes.find(
        (route: { id: string }) => route.id === GUIDANCE_CONTRACT_ROUTE_IDS.denied
      );
      assert.equal(regainedRoute.name, 'Cold restart verification v2');
      assert.equal(regainedRoute.route.id, GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2);
      assert.notEqual(
        regainedRoute.route.id,
        GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1
      );
      const regainedDetail = await fetch(
        `${base}/mobile/safe-route/routes/${GUIDANCE_CONTRACT_ROUTE_IDS.denied}`,
        { headers: { Authorization: authorization } }
      );
      const regainedDetailBody = await regainedDetail.json();
      assert.equal(regainedDetailBody.data.id, GUIDANCE_CONTRACT_ROUTE_IDS.denied);
      assert.equal(
        regainedDetailBody.data.route.id,
        GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2
      );
      assert.deepEqual(regainedDetailBody.data.route_alerts, []);
      assert.deepEqual(regainedDetailBody.data.vehicles, []);
      assert.equal(regainedDetailBody.data.waypoints.length, 2);
      assert.equal(
        regainedDetailBody.data.metadata.route_variant_id,
        GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2
      );

      phase = 'readbackEvidence';
      const readbackCatalog = await fetch(`${base}/mobile/safe-route/routes`, {
        headers: { Authorization: authorization }
      });
      const readbackCatalogBody = await readbackCatalog.json();
      assert.equal(
        readbackCatalogBody.data.routes.find(
          (route: { id: string }) => route.id === GUIDANCE_CONTRACT_ROUTE_IDS.denied
        ).route.id,
        GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2
      );
      const readbackDetail = await fetch(
        `${base}/mobile/safe-route/routes/${GUIDANCE_CONTRACT_ROUTE_IDS.denied}`,
        { headers: { Authorization: authorization } }
      );
      assert.equal(
        (await readbackDetail.json()).data.route.id,
        GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2
      );

      phase = 'regained';
      assert.equal((await fetch(
        `${base}/mobile/safe-route/routes/junk/${GUIDANCE_CONTRACT_ROUTE_IDS.denied}`,
        { headers: { Authorization: authorization } }
      )).status, 404);

      mode = GUIDANCE_CONTRACT_MODES.offline;
      await assert.rejects(fetch(`${base}/users/me`, {
        headers: { Authorization: authorization }
      }));
      assert.ok(requests.some((entry) =>
        entry.event === 'completion' &&
        entry.completed === false &&
        entry.semanticOutcome === 'connection-destroyed' &&
        entry.statusCode === null
      ));

      assert.equal(requests[0].authorized, false);
      assert.equal(requests[0].authorizationClass, 'none');
      assert.equal(requests[0].method, 'POST');
      assert.equal(requests[0].mode, GUIDANCE_CONTRACT_MODES.active);
      assert.equal(requests[0].phase, 'workspaceSeed');
      assert.equal(requests[0].search, '');
      assert.ok(requests.some((entry) => entry.authorized && entry.path.endsWith('/routes')));
      assert.ok(requests.some((entry) => entry.authorizationClass === 'unexpected'));
      phase = 'regained';
      const health = await fetch(
        `http://127.0.0.1:${address.port}/__guidance_contract__/health`
      );
      assert.equal(health.status, 200);
      assert.equal(requests.at(-1)?.phase, 'regained');
      const marker = await fetch(
        `http://127.0.0.1:${address.port}${GUIDANCE_START_BOUNDARY_PATH}?boundary=active-start&edge=open`,
        { method: 'POST' }
      );
      assert.equal(marker.status, 200);
      assert.deepEqual((await marker.json()).data, {
        boundary: 'active-start',
        edge: 'open'
      });
      assert.equal((await fetch(
        `http://127.0.0.1:${address.port}${GUIDANCE_START_BOUNDARY_PATH}?boundary=INVALID&edge=open`,
        { method: 'POST' }
      )).status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('journals real HTTP finish events with status and semantic outcomes', async () => {
    let mode = GUIDANCE_CONTRACT_MODES.active;
    let phase = 'workspaceStart';
    let requestNumber = 0;
    let nowMs = 100;
    const entries: Array<Record<string, unknown>> = [];
    const server = await startGuidanceContractApi({
      createRequestId: () => `request-${++requestNumber}`,
      now: () => nowMs += 10,
      port: 0,
      readControl: () => ({ mode, phase }),
      requestLog: (entry: Record<string, unknown>) => {
        const journalEntry = {
          ...entry,
          sequence: entries.length + 1,
          timestampMs: nowMs
        };
        entries.push(journalEntry);
        return journalEntry;
      }
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const headers = {
      Authorization: `Bearer ${createGuidanceContractAccessToken()}`
    };

    try {
      assert.equal((await fetch(`${base}/users/me`, { headers })).status, 200);
      mode = GUIDANCE_CONTRACT_MODES.denied;
      phase = 'deniedStart';
      assert.equal((await fetch(`${base}/mobile/safe-route/routes`, { headers })).status, 200);
      mode = GUIDANCE_CONTRACT_MODES.offline;
      phase = 'publicResume';
      await assert.rejects(fetch(`${base}/users/me`, { headers }));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    assert.deepEqual(
      entries.map((entry) => [entry.event, entry.statusCode, entry.semanticOutcome]),
      [
        ['request', undefined, undefined],
        ['completion', 200, 'principal-a'],
        ['request', undefined, undefined],
        ['completion', 200, 'catalog-survivor'],
        ['request', undefined, undefined],
        ['completion', null, 'connection-destroyed']
      ]
    );
    assert.doesNotThrow(() => assertGuidanceContractRequestJournal(entries, {
      expectedModeByPhase: {
        workspaceStart: GUIDANCE_CONTRACT_MODES.active,
        deniedStart: GUIDANCE_CONTRACT_MODES.denied,
        publicResume: GUIDANCE_CONTRACT_MODES.offline
      }
    }));
  });

  it('continues a durable monotonic request sequence across fixture restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'saferoute-guidance-journal-test-'));
    const requestLogFile = join(directory, 'requests.jsonl');

    try {
      const appendFirst = createGuidanceContractRequestJournal({
        now: () => 100,
        requestLogFile
      });
      appendFirst({ method: 'GET', path: '/first', phase: 'reset' });

      const appendAfterRestart = createGuidanceContractRequestJournal({
        now: () => 200,
        requestLogFile
      });
      appendAfterRestart({ method: 'POST', path: '/second', phase: 'publicSeed' });

      const entries = readFileSync(requestLogFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.deepEqual(entries.map((entry) => entry.sequence), [1, 2]);
      assert.deepEqual(entries.map((entry) => entry.timestampMs), [100, 200]);
      assert.deepEqual(entries.map((entry) => entry.phase), ['reset', 'publicSeed']);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('rejects inconsistent or incomplete request evidence', () => {
    const expectedModeByPhase = {
      wrongPrincipal: GUIDANCE_CONTRACT_MODES.wrongPrincipal,
      denied: GUIDANCE_CONTRACT_MODES.denied
    };
    const entry = ({
      authorizationClass = 'expected-bearer',
      authorized = true,
      mode = GUIDANCE_CONTRACT_MODES.wrongPrincipal,
      phase = 'wrongPrincipal',
      sequence = 1
    } = {}) => ({
      authorizationClass,
      authorized,
      method: 'GET',
      mode,
      path: '/api/v1/users/me',
      phase,
      search: '',
      sequence,
      timestampMs: 100
    });
    const validEntries = [
      entry(),
      entry({
        authorizationClass: 'none',
        authorized: false,
        mode: GUIDANCE_CONTRACT_MODES.denied,
        phase: 'denied',
        sequence: 2
      })
    ];

    assert.doesNotThrow(() =>
      assertGuidanceContractRequestJournal(validEntries, {
        allowLegacyEntries: true,
        expectedModeByPhase,
        requiredPhases: ['wrongPrincipal', 'denied']
      })
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        entry({ mode: GUIDANCE_CONTRACT_MODES.denied })
      ], { allowLegacyEntries: true, expectedModeByPhase }),
      /phase\/mode mismatch/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        entry({ authorizationClass: 'none', authorized: true })
      ], { allowLegacyEntries: true, expectedModeByPhase }),
      /metadata was invalid/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([entry()], {
        allowLegacyEntries: true,
        expectedModeByPhase,
        requiredPhases: ['wrongPrincipal', 'denied']
      }),
      /no evidence for denied/
    );
  });

  it('proves exact protected traffic between fresh Start markers', () => {
    const entry = ({
      authorizationClass = 'expected-bearer',
      authorized = true,
      method = 'GET',
      path,
      phase = 'workspaceStart',
      search = '',
      sequence
    }: {
      authorizationClass?: string;
      authorized?: boolean;
      method?: string;
      path: string;
      phase?: string;
      search?: string;
      sequence: number;
    }) => ({
      authorizationClass,
      authorized,
      method,
      mode: GUIDANCE_CONTRACT_MODES.active,
      path,
      phase,
      search,
      sequence,
      timestampMs: sequence * 100
    });
    const marker = (
      sequence: number,
      edge: 'armed' | 'open' | 'close' | 'settled',
      {
        boundary = 'active-start',
        openPhase = 'workspacePrepare',
        phase = 'workspaceStart'
      } = {}
    ) => entry({
      authorizationClass: 'none',
      authorized: false,
      method: 'POST',
      path: GUIDANCE_START_BOUNDARY_PATH,
      phase: edge === 'armed' || edge === 'open' ? openPhase : phase,
      search: `?boundary=${boundary}&edge=${edge}`,
      sequence
    });
    const options = {
      boundary: 'active-start',
      expectedPaths: [
        '/api/v1/users/me',
        '/api/v1/mobile/safe-route/routes'
      ],
      openPhase: 'workspacePrepare',
      phase: 'workspaceStart'
    };
    const activeEntries = [
      marker(1, 'armed'),
      marker(2, 'open'),
      entry({ path: '/api/v1/users/me', sequence: 3 }),
      entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 4 }),
      marker(5, 'close'),
      marker(6, 'settled')
    ];

    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary(activeEntries, options)
    );
    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary([
        marker(1, 'armed', {
          boundary: 'public-start',
          openPhase: 'publicPrepare',
          phase: 'publicStart'
        }),
        entry({
          authorizationClass: 'none',
          authorized: false,
          path: '/api/v1/mobile/safe-route/route-preview',
          phase: 'publicPrepare',
          sequence: 2
        }),
        marker(3, 'open', {
          boundary: 'public-start',
          openPhase: 'publicPrepare',
          phase: 'publicStart'
        }),
        marker(4, 'close', {
          boundary: 'public-start',
          openPhase: 'publicPrepare',
          phase: 'publicStart'
        }),
        marker(5, 'settled', {
          boundary: 'public-start',
          openPhase: 'publicPrepare',
          phase: 'publicStart'
        })
      ], {
        boundary: 'public-start',
        expectedPaths: [],
        openPhase: 'publicPrepare',
        phase: 'publicStart'
      })
    );
    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary([
        marker(1, 'armed', {
          boundary: 'wrong-principal-start',
          openPhase: 'wrongPrincipalPrepare',
          phase: 'wrongPrincipalStart'
        }),
        marker(2, 'open', {
          boundary: 'wrong-principal-start',
          openPhase: 'wrongPrincipalPrepare',
          phase: 'wrongPrincipalStart'
        }),
        entry({
          path: '/api/v1/users/me',
          phase: 'wrongPrincipalStart',
          sequence: 3
        }),
        marker(4, 'close', {
          boundary: 'wrong-principal-start',
          openPhase: 'wrongPrincipalPrepare',
          phase: 'wrongPrincipalStart'
        }),
        marker(5, 'settled', {
          boundary: 'wrong-principal-start',
          openPhase: 'wrongPrincipalPrepare',
          phase: 'wrongPrincipalStart'
        })
      ], {
        boundary: 'wrong-principal-start',
        expectedPaths: ['/api/v1/users/me'],
        openPhase: 'wrongPrincipalPrepare',
        phase: 'wrongPrincipalStart'
      })
    );

    assert.throws(
      () => assertGuidanceStartTrafficBoundary(activeEntries.slice(0, -1), options),
      /one armed, open, close, and settled marker/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        ...activeEntries,
        marker(7, 'open')
      ], options),
      /one armed, open, close, and settled marker/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(2, 'armed'),
        marker(1, 'open'),
        ...activeEntries.slice(2)
      ], options),
      /markers were out of order/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        { ...marker(1, 'armed'), phase: 'workspaceStart' },
        ...activeEntries.slice(1)
      ], options),
      /used invalid markers/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'armed'),
        entry({ path: '/api/v1/users/me', phase: 'workspacePrepare', sequence: 2 }),
        marker(3, 'open'),
        entry({ path: '/api/v1/users/me', sequence: 4 }),
        entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 5 }),
        marker(6, 'close'),
        marker(7, 'settled')
      ], options),
      /protected traffic while arming/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'armed'),
        marker(2, 'open'),
        entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 3 }),
        entry({ path: '/api/v1/users/me', sequence: 4 }),
        marker(5, 'close'),
        marker(6, 'settled')
      ], options),
      /exact authorization contract/
    );
    for (const invalidEntry of [
      entry({ method: 'POST', path: '/api/v1/users/me', sequence: 3 }),
      entry({ path: '/api/v1/users/me', phase: 'nextPhase', sequence: 3 }),
      entry({
        authorizationClass: 'none',
        authorized: false,
        path: '/api/v1/users/me',
        sequence: 3
      }),
      entry({
        authorizationClass: 'unexpected',
        authorized: false,
        path: '/api/v1/users/me',
        sequence: 3
      })
    ]) {
      assert.throws(
        () => assertGuidanceStartTrafficBoundary([
          marker(1, 'armed'),
          marker(2, 'open'),
          invalidEntry,
          entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 4 }),
          marker(5, 'close'),
          marker(6, 'settled')
        ], options),
        /exact authorization contract/
      );
    }
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'armed'),
        marker(2, 'open'),
        entry({ path: '/api/v1/users/me', sequence: 3 }),
        entry({
          path: '/api/v1/mobile/safe-route/routes',
          search: '?client_id=66a1b2c3d4e5f60718293a40',
          sequence: 4
        }),
        marker(5, 'close'),
        marker(6, 'settled')
      ], options),
      /exact authorization contract/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'armed'),
        marker(2, 'open'),
        entry({ path: '/api/v1/users/me', sequence: 3 }),
        entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 4 }),
        entry({ path: '/api/v1/intel/map/area-risk', sequence: 5 }),
        marker(6, 'close'),
        marker(7, 'settled')
      ], options),
      /expected 2 protected requests but recorded 3/
    );
    for (const phase of ['workspaceStart', 'nextPhase']) {
      assert.throws(
        () => assertGuidanceStartTrafficBoundary([
          ...activeEntries.slice(0, -1),
          entry({
            path: '/api/v1/mobile/safe-route/routes',
            phase,
            sequence: 6
          }),
          marker(7, 'settled')
        ], options),
        /protected traffic during post-close quarantine/
      );
    }
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        ...activeEntries,
        entry({
          path: '/api/v1/mobile/safe-route/routes',
          sequence: 7
        })
      ], options),
      /protected traffic outside its markers/
    );
  });

  it('requires one correlated response outcome for every instrumented request', () => {
    const expectedModeByPhase = {
      workspaceStart: GUIDANCE_CONTRACT_MODES.active
    };
    const request = {
      authorizationClass: 'expected-bearer',
      authorized: true,
      event: 'request',
      method: 'GET',
      mode: GUIDANCE_CONTRACT_MODES.active,
      path: '/api/v1/users/me',
      phase: 'workspaceStart',
      requestId: 'request-users-me',
      search: '',
      sequence: 1,
      timestampMs: 100
    };
    const completion = {
      ...request,
      completed: true,
      durationMs: 20,
      event: 'completion',
      requestSequence: 1,
      semanticOutcome: 'principal-a',
      sequence: 2,
      statusCode: 200,
      timestampMs: 120
    };

    assert.doesNotThrow(() =>
      assertGuidanceContractRequestJournal([request, completion], {
        expectedModeByPhase
      })
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        {
          ...request,
          event: undefined,
          requestId: undefined
        }
      ], { expectedModeByPhase }),
      /lifecycle metadata was missing/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([request], { expectedModeByPhase }),
      /expected one response outcome but recorded 0/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        request,
        completion,
        { ...completion, sequence: 3, timestampMs: 130 }
      ], { expectedModeByPhase }),
      /expected one response outcome but recorded 2/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        request,
        { ...completion, requestId: 'request-orphan' }
      ], { expectedModeByPhase }),
      /expected one response outcome but recorded 0|unknown request/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        request,
        { ...completion, completed: false, semanticOutcome: 'connection-closed', statusCode: 200 }
      ], { expectedModeByPhase }),
      /response outcome was invalid/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        request,
        { ...completion, authorizationClass: 'none', authorized: false }
      ], { expectedModeByPhase }),
      /response outcome did not match request/
    );
  });

  it('binds fresh Start requests to completed semantic response outcomes before close', () => {
    const marker = (
      sequence: number,
      edge: 'armed' | 'open' | 'close' | 'settled'
    ) => ({
      authorizationClass: 'none',
      authorized: false,
      method: 'POST',
      mode: GUIDANCE_CONTRACT_MODES.denied,
      path: GUIDANCE_START_BOUNDARY_PATH,
      phase: edge === 'armed' || edge === 'open' ? 'deniedPrepare' : 'deniedStart',
      search: `?boundary=denied-workspace-start&edge=${edge}`,
      sequence,
      timestampMs: sequence * 100
    });
    const request = (sequence: number, requestId: string, path: string) => ({
      authorizationClass: 'expected-bearer',
      authorized: true,
      event: 'request',
      method: 'GET',
      mode: GUIDANCE_CONTRACT_MODES.denied,
      path,
      phase: 'deniedStart',
      requestId,
      search: '',
      sequence,
      timestampMs: sequence * 100
    });
    const completion = (
      sequence: number,
      source: ReturnType<typeof request>,
      semanticOutcome: string,
      overrides = {}
    ) => ({
      ...source,
      completed: true,
      durationMs: 10,
      event: 'completion',
      requestSequence: source.sequence,
      semanticOutcome,
      sequence,
      statusCode: 200,
      timestampMs: sequence * 100,
      ...overrides
    });
    const userRequest = request(3, 'request-denied-user', '/api/v1/users/me');
    const catalogRequest = request(
      5,
      'request-denied-catalog',
      '/api/v1/mobile/safe-route/routes'
    );
    const entries = [
      marker(1, 'armed'),
      marker(2, 'open'),
      userRequest,
      completion(4, userRequest, 'principal-a'),
      catalogRequest,
      completion(6, catalogRequest, 'catalog-survivor'),
      marker(7, 'close'),
      marker(8, 'settled')
    ];
    const options = {
      boundary: 'denied-workspace-start',
      expectedOutcomes: [
        { semanticOutcome: 'principal-a', statusCode: 200 },
        { semanticOutcome: 'catalog-survivor', statusCode: 200 }
      ],
      expectedPaths: [
        '/api/v1/users/me',
        '/api/v1/mobile/safe-route/routes'
      ],
      openPhase: 'deniedPrepare',
      phase: 'deniedStart'
    };

    assert.doesNotThrow(() => assertGuidanceStartTrafficBoundary(entries, options));

    const survivorRiskRequest = {
      ...request(7, 'request-survivor-risk', '/api/v1/intel/map/area-risk'),
      search:
        `?refresh=false&read_only=true&client_id=` +
        GUIDANCE_CONTRACT_WORKSPACES.survivor.id
    };
    const survivorRiskCompletion = completion(
      8,
      survivorRiskRequest,
      'api-success'
    );
    const entriesWithSurvivorRisk = [
      ...entries.slice(0, -2),
      survivorRiskRequest,
      survivorRiskCompletion,
      marker(9, 'close'),
      marker(10, 'settled')
    ];
    const optionsWithSurvivorRisk = {
      ...options,
      expectedPostAuthorizationRequests: [{
        clientId: GUIDANCE_CONTRACT_WORKSPACES.survivor.id,
        path: '/api/v1/intel/map/area-risk',
        semanticOutcome: 'api-success',
        statusCode: 200
      }]
    };

    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary(
        entriesWithSurvivorRisk,
        optionsWithSurvivorRisk
      )
    );
    assert.equal(
      isGuidanceStartProtectedTraffic({
        ...survivorRiskRequest,
        authorizationClass: 'none',
        authorized: false
      }),
      true
    );
    assert.equal(
      isGuidanceStartProtectedTraffic({
        ...survivorRiskRequest,
        authorizationClass: 'none',
        authorized: false,
        method: 'POST',
        path: '/api/v1/intel/map/area-risk/research',
        search: ''
      }),
      true
    );
    for (const invalidRiskRequest of [
      { ...survivorRiskRequest, search: '' },
      {
        ...survivorRiskRequest,
        search:
          `?refresh=false&read_only=true&client_id=` +
          GUIDANCE_CONTRACT_WORKSPACES.denied.id
      },
      {
        ...survivorRiskRequest,
        search:
          `?refresh=false&read_only=true&client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}` +
          `&client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
      },
      {
        ...survivorRiskRequest,
        search:
          `?refresh=false&read_only=false&client_id=` +
          GUIDANCE_CONTRACT_WORKSPACES.survivor.id
      },
      {
        ...survivorRiskRequest,
        authorizationClass: 'none',
        authorized: false
      }
    ]) {
      assert.throws(
        () => assertGuidanceStartTrafficBoundary([
          ...entriesWithSurvivorRisk.slice(0, 6),
          invalidRiskRequest,
          { ...survivorRiskCompletion, requestId: invalidRiskRequest.requestId },
          ...entriesWithSurvivorRisk.slice(8)
        ], optionsWithSurvivorRisk),
        /did not match the exact survivor contract/
      );
    }
    assert.throws(
      () => assertGuidanceStartTrafficBoundary(
        entriesWithSurvivorRisk.map((entry) =>
          entry.sequence === 8 ? { ...entry, statusCode: 500 } : entry
        ),
        optionsWithSurvivorRisk
      ),
      /post-authorization request 1 did not complete/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary(
        entriesWithSurvivorRisk.map((entry) =>
          entry.sequence === 8
            ? { ...entry, semanticOutcome: 'catalog-survivor' }
            : entry
        ),
        optionsWithSurvivorRisk
      ),
      /post-authorization request 1 did not complete/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        ...entriesWithSurvivorRisk.slice(0, 8),
        { ...survivorRiskCompletion, sequence: 8.5, timestampMs: 850 },
        ...entriesWithSurvivorRisk.slice(8)
      ], optionsWithSurvivorRisk),
      /post-authorization request 1 did not complete/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        ...entriesWithSurvivorRisk.slice(0, 5),
        { ...survivorRiskRequest, sequence: 6, timestampMs: 600 },
        { ...entriesWithSurvivorRisk[5], sequence: 7, timestampMs: 700 },
        { ...survivorRiskCompletion, sequence: 8, timestampMs: 800 },
        marker(9, 'close'),
        marker(10, 'settled')
      ], optionsWithSurvivorRisk),
      /did not complete before the next authorization request/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        ...entriesWithSurvivorRisk.slice(0, -1),
        {
          ...survivorRiskRequest,
          requestId: 'request-survivor-risk-quarantine',
          sequence: 10,
          timestampMs: 1_000
        },
        marker(11, 'settled')
      ], optionsWithSurvivorRisk),
      /protected traffic during post-close quarantine/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary(entries.filter((entry) => entry.sequence !== 6), options),
      /did not complete with the expected response outcome/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary(
        entries.map((entry) => entry.sequence === 6 ? { ...entry, statusCode: 403 } : entry),
        options
      ),
      /did not complete with the expected response outcome/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary(
        entries.map((entry) => entry.sequence === 6 ? { ...entry, semanticOutcome: 'catalog-active' } : entry),
        options
      ),
      /did not complete with the expected response outcome/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'armed'),
        marker(2, 'open'),
        userRequest,
        { ...catalogRequest, sequence: 4, timestampMs: 400 },
        completion(5, userRequest, 'principal-a'),
        completion(6, catalogRequest, 'catalog-survivor'),
        marker(7, 'close'),
        marker(8, 'settled')
      ], options),
      /did not complete before the next authorization request/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        ...entries.slice(0, 5),
        marker(6, 'close'),
        completion(7, catalogRequest, 'catalog-survivor'),
        marker(8, 'settled')
      ], options),
      /did not complete with the expected response outcome/
    );

    const markerRequest = (
      sequence: number,
      edge: 'armed' | 'open' | 'close' | 'settled'
    ) => ({
      ...marker(sequence, edge),
      event: 'request',
      requestId: `request-marker-${edge}`
    });
    const markerCompletion = (
      sequence: number,
      source: ReturnType<typeof markerRequest>,
      edge: 'armed' | 'open' | 'close' | 'settled'
    ) => ({
      ...source,
      completed: true,
      durationMs: 1,
      event: 'completion',
      requestSequence: source.sequence,
      semanticOutcome: `boundary-${edge}`,
      sequence,
      statusCode: 200,
      timestampMs: sequence * 100
    });
    const armedRequest = markerRequest(1, 'armed');
    const openRequest = markerRequest(3, 'open');
    const closeRequest = markerRequest(5, 'close');
    const settledRequest = markerRequest(7, 'settled');
    const markerLifecycle = [
      armedRequest,
      markerCompletion(2, armedRequest, 'armed'),
      openRequest,
      markerCompletion(4, openRequest, 'open'),
      closeRequest,
      markerCompletion(6, closeRequest, 'close'),
      settledRequest,
      markerCompletion(8, settledRequest, 'settled')
    ];
    assert.doesNotThrow(() => assertGuidanceStartTrafficBoundary(markerLifecycle, {
      boundary: 'denied-workspace-start',
      expectedOutcomes: [],
      expectedPaths: [],
      openPhase: 'deniedPrepare',
      phase: 'deniedStart'
    }));
    assert.throws(
      () => assertGuidanceStartTrafficBoundary(markerLifecycle.slice(0, -1), {
        boundary: 'denied-workspace-start',
        expectedOutcomes: [],
        expectedPaths: [],
        openPhase: 'deniedPrepare',
        phase: 'deniedStart'
      }),
      /marker did not complete successfully/
    );
  });
});
