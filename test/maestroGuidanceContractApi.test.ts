import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUIDANCE_CONTRACT_MODES,
  createGuidanceContractAccessToken,
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
    const requests: Array<{ authorized: boolean; path: string }> = [];
    const server = await startGuidanceContractApi({
      port: 0,
      readMode: () => mode,
      requestLog: (entry: { authorized: boolean; path: string }) => requests.push(entry)
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
      assert.ok(requests.some((entry) => entry.authorized && entry.path.endsWith('/routes')));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
