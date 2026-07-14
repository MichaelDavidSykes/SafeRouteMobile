import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  GUIDANCE_CONTRACT_MODES,
  GUIDANCE_START_BOUNDARY_PATH,
  assertGuidanceContractRequestJournal,
  assertGuidanceStartTrafficBoundary,
  createGuidanceContractAccessToken,
  createGuidanceContractRequestJournal,
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
      assert.equal((await userA.json()).data._id, 'guidance-driver-a');

      mode = GUIDANCE_CONTRACT_MODES.wrongPrincipal;
      const userB = await fetch(`${base}/users/me`, {
        headers: { Authorization: authorization }
      });
      assert.equal((await userB.json()).data._id, 'guidance-driver-b');

      mode = GUIDANCE_CONTRACT_MODES.denied;
      const deniedCatalog = await fetch(`${base}/mobile/safe-route/routes`, {
        headers: { Authorization: authorization }
      });
      assert.deepEqual((await deniedCatalog.json()).data.clients, []);
      assert.equal((await fetch(
        `${base}/mobile/safe-route/routes?client_id=guidance-workspace`,
        { headers: { Authorization: authorization } }
      )).status, 403);
      assert.equal((await fetch(
        `${base}/mobile/safe-route/routes?client_id=missing-workspace`,
        { headers: { Authorization: authorization } }
      )).status, 404);
      assert.equal((await fetch(`${base}/convoy-routes/route-preview`, {
        body: JSON.stringify({
          client_id: 'guidance-workspace',
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
        `${base}/intel/map/area-risk?client_id=guidance-workspace`,
        { headers: { Authorization: authorization } }
      )).status, 403);
      assert.equal((await fetch(
        `${base}/intel/map/area-risk?client_id=guidance-workspace`
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
      assert.equal(restoredCatalogBody.data.clients[0].id, 'guidance-workspace');
      assert.equal(restoredCatalogBody.data.selected_client_id, null);
      const scopedCatalog = await fetch(
        `${base}/mobile/safe-route/routes?client_id=guidance-workspace`,
        { headers: { Authorization: authorization } }
      );
      assert.equal(
        (await scopedCatalog.json()).data.selected_client_id,
        'guidance-workspace'
      );

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
        ['completion', 200, 'catalog-denied'],
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
          search: '?client_id=guidance-workspace',
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
      completion(6, catalogRequest, 'catalog-denied'),
      marker(7, 'close'),
      marker(8, 'settled')
    ];
    const options = {
      boundary: 'denied-workspace-start',
      expectedOutcomes: [
        { semanticOutcome: 'principal-a', statusCode: 200 },
        { semanticOutcome: 'catalog-denied', statusCode: 200 }
      ],
      expectedPaths: [
        '/api/v1/users/me',
        '/api/v1/mobile/safe-route/routes'
      ],
      openPhase: 'deniedPrepare',
      phase: 'deniedStart'
    };

    assert.doesNotThrow(() => assertGuidanceStartTrafficBoundary(entries, options));
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
        completion(6, catalogRequest, 'catalog-denied'),
        marker(7, 'close'),
        marker(8, 'settled')
      ], options),
      /did not complete before the next authorization request/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        ...entries.slice(0, 5),
        marker(6, 'close'),
        completion(7, catalogRequest, 'catalog-denied'),
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
