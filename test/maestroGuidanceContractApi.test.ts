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
      method: string;
      mode: string;
      path: string;
      phase: string;
      search: string;
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
        expectedModeByPhase,
        requiredPhases: ['wrongPrincipal', 'denied']
      })
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        entry({ mode: GUIDANCE_CONTRACT_MODES.denied })
      ], { expectedModeByPhase }),
      /phase\/mode mismatch/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([
        entry({ authorizationClass: 'none', authorized: true })
      ], { expectedModeByPhase }),
      /metadata was invalid/
    );
    assert.throws(
      () => assertGuidanceContractRequestJournal([entry()], {
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
      edge: 'open' | 'close',
      phase = edge === 'open' ? 'workspacePrepare' : 'workspaceStart',
    ) =>
      entry({
        authorizationClass: 'none',
        authorized: false,
        method: 'POST',
        path: GUIDANCE_START_BOUNDARY_PATH,
        phase,
        search: `?boundary=active-start&edge=${edge}`,
        sequence
      });
    const activeEntries = [
      marker(1, 'open'),
      entry({ path: '/api/v1/users/me', sequence: 2 }),
      entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 3 }),
      marker(4, 'close')
    ];

    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary(activeEntries, {
        boundary: 'active-start',
        expectedPaths: [
          '/api/v1/users/me',
          '/api/v1/mobile/safe-route/routes'
        ],
        openPhase: 'workspacePrepare',
        phase: 'workspaceStart'
      })
    );
    for (const invalidOpenMarker of [
      { ...marker(1, 'open'), phase: 'workspaceStart' },
      {
        ...marker(1, 'open'),
        authorizationClass: 'expected-bearer',
        authorized: true
      },
      {
        ...marker(1, 'open'),
        search: '?boundary=active-start&edge=open&extra=unexpected'
      }
    ]) {
      assert.throws(
        () => assertGuidanceStartTrafficBoundary([
          invalidOpenMarker,
          entry({ path: '/api/v1/users/me', sequence: 2 }),
          entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 3 }),
          marker(4, 'close')
        ], {
          boundary: 'active-start',
          expectedPaths: [
            '/api/v1/users/me',
            '/api/v1/mobile/safe-route/routes'
          ],
          openPhase: 'workspacePrepare',
          phase: 'workspaceStart'
        }),
        /used invalid markers/
      );
    }
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'open'),
        entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 2 }),
        entry({ path: '/api/v1/users/me', sequence: 3 }),
        marker(4, 'close')
      ], {
        boundary: 'active-start',
        expectedPaths: [
          '/api/v1/users/me',
          '/api/v1/mobile/safe-route/routes'
        ],
        openPhase: 'workspacePrepare',
        phase: 'workspaceStart'
      }),
      /exact authorization contract/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'open'),
        entry({ method: 'POST', path: '/api/v1/users/me', sequence: 2 }),
        entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 3 }),
        marker(4, 'close')
      ], {
        boundary: 'active-start',
        expectedPaths: [
          '/api/v1/users/me',
          '/api/v1/mobile/safe-route/routes'
        ],
        openPhase: 'workspacePrepare',
        phase: 'workspaceStart'
      }),
      /exact authorization contract/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'open'),
        entry({
          authorizationClass: 'none',
          authorized: false,
          path: '/api/v1/users/me',
          sequence: 2
        }),
        entry({ path: '/api/v1/mobile/safe-route/routes', sequence: 3 }),
        marker(4, 'close')
      ], {
        boundary: 'active-start',
        expectedPaths: [
          '/api/v1/users/me',
          '/api/v1/mobile/safe-route/routes'
        ],
        openPhase: 'workspacePrepare',
        phase: 'workspaceStart'
      }),
      /exact authorization contract/
    );
    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary([
        marker(1, 'open'),
        marker(2, 'close')
      ], {
        boundary: 'active-start',
        expectedPaths: [],
        openPhase: 'workspacePrepare',
        phase: 'workspaceStart'
      })
    );
    const wrongPrincipalMarker = (sequence: number, edge: 'open' | 'close') =>
      entry({
        authorizationClass: 'none',
        authorized: false,
        method: 'POST',
        path: GUIDANCE_START_BOUNDARY_PATH,
        phase: edge === 'open' ? 'wrongPrincipalPrepare' : 'wrongPrincipalStart',
        search: `?boundary=wrong-principal-start&edge=${edge}`,
        sequence
      });
    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary([
        wrongPrincipalMarker(1, 'open'),
        entry({
          path: '/api/v1/users/me',
          phase: 'wrongPrincipalStart',
          sequence: 2
        }),
        wrongPrincipalMarker(3, 'close')
      ], {
        boundary: 'wrong-principal-start',
        expectedPaths: ['/api/v1/users/me'],
        openPhase: 'wrongPrincipalPrepare',
        phase: 'wrongPrincipalStart'
      })
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        wrongPrincipalMarker(1, 'open'),
        entry({
          path: '/api/v1/users/me',
          phase: 'wrongPrincipalStart',
          sequence: 2
        }),
        entry({
          path: '/api/v1/mobile/safe-route/routes',
          phase: 'wrongPrincipalStart',
          sequence: 3
        }),
        wrongPrincipalMarker(4, 'close')
      ], {
        boundary: 'wrong-principal-start',
        expectedPaths: ['/api/v1/users/me'],
        openPhase: 'wrongPrincipalPrepare',
        phase: 'wrongPrincipalStart'
      }),
      /expected 1 protected requests but recorded 2/
    );
    const deniedMarker = (sequence: number, edge: 'open' | 'close') =>
      entry({
        authorizationClass: 'none',
        authorized: false,
        method: 'POST',
        path: GUIDANCE_START_BOUNDARY_PATH,
        phase: edge === 'open' ? 'deniedPrepare' : 'deniedStart',
        search: `?boundary=denied-workspace-start&edge=${edge}`,
        sequence
      });
    assert.doesNotThrow(() =>
      assertGuidanceStartTrafficBoundary([
        deniedMarker(1, 'open'),
        entry({ path: '/api/v1/users/me', phase: 'deniedStart', sequence: 2 }),
        entry({
          path: '/api/v1/mobile/safe-route/routes',
          phase: 'deniedStart',
          sequence: 3
        }),
        deniedMarker(4, 'close')
      ], {
        boundary: 'denied-workspace-start',
        expectedPaths: [
          '/api/v1/users/me',
          '/api/v1/mobile/safe-route/routes'
        ],
        openPhase: 'deniedPrepare',
        phase: 'deniedStart'
      })
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'open'),
        entry({ path: '/api/v1/users/me', sequence: 2 }),
        entry({
          path: '/api/v1/mobile/safe-route/routes',
          search: '?client_id=guidance-workspace',
          sequence: 3
        }),
        marker(4, 'close')
      ], {
        boundary: 'active-start',
        expectedPaths: [
          '/api/v1/users/me',
          '/api/v1/mobile/safe-route/routes'
        ],
        openPhase: 'workspacePrepare',
        phase: 'workspaceStart'
      }),
      /exact authorization contract/
    );
    assert.throws(
      () => assertGuidanceStartTrafficBoundary([
        marker(1, 'open'),
        entry({ path: '/api/v1/mobile/safe-route/routes/guidance-contract-route', sequence: 2 }),
        marker(3, 'close')
      ], {
        boundary: 'active-start',
        expectedPaths: [],
        openPhase: 'workspacePrepare',
        phase: 'workspaceStart'
      }),
      /expected 0 protected requests but recorded 1/
    );
  });
});
