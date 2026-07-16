import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  GUIDANCE_CONTRACT_EVIDENCE_PATH,
  GUIDANCE_CONTRACT_MODES,
  GUIDANCE_CONTRACT_ROUTE_IDS,
  GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS,
  GUIDANCE_CONTRACT_WORKSPACES,
  GUIDANCE_START_BOUNDARY_PATH,
  WORKSPACE_CATALOG_RECOVERY_PHASES,
  WORKSPACE_CATALOG_RETRY_DELAY_MS,
  WORKSPACE_CATALOG_SUCCESS_DELAY_MS,
  assertGuidanceContractEvidenceJournal,
  assertGuidanceContractRequestJournal,
  assertGuidanceContractRouteCacheReadbackEvidence,
  assertGuidanceStartTrafficBoundary,
  createGuidanceContractAccessToken,
  createGuidanceContractEvidenceJournal,
  createGuidanceContractRequestJournal,
  isGuidanceStartProtectedTraffic,
  startGuidanceContractApi
} from '../scripts/maestro-guidance-contract-api.mjs';

describe('Maestro guidance contract API', () => {
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
        [WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess, 200, 'catalog-active'],
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
          'tracking.stop.settled'
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
      assert.throws(() => assertGuidanceContractEvidenceJournal(entries, {
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
        `${base}/intel/map/area-risk?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`,
        { headers: { Authorization: authorization } }
      )).status, 403);
      assert.equal((await fetch(
        `${base}/intel/map/area-risk?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
      )).status, 200);
      assert.equal((await fetch(`${base}/intel/map/area-risk`, {
        headers: { Authorization: 'Bearer invalid' }
      })).status, 401);
      assert.equal((await fetch(`${base}/users/me`, {
        headers: { Authorization: createGuidanceContractAccessToken() }
      })).status, 401);

      mode = GUIDANCE_CONTRACT_MODES.active;
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
      search: `?refresh=false&client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}`
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
    for (const invalidRiskRequest of [
      { ...survivorRiskRequest, search: '' },
      {
        ...survivorRiskRequest,
        search: `?client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
      },
      {
        ...survivorRiskRequest,
        search:
          `?client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}` +
          `&client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
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
