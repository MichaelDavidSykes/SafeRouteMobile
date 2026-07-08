import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiSessionExpiredError } from '../src/features/api/apiClientCore';
import {
  buildRouteDetailPath,
  buildSavedRoutesPath,
  loadRouteDetail,
  loadSavedRoutes,
  type RouteApiRequester
} from '../src/features/routes/routeApiCore';

describe('SafeRoute route API core', () => {
  it('builds saved-route list paths with trimmed encoded client filters', () => {
    assert.equal(buildSavedRoutesPath(), '/mobile/safe-route/routes');
    assert.equal(buildSavedRoutesPath('  '), '/mobile/safe-route/routes');
    assert.equal(
      buildSavedRoutesPath(' client/alpha beta '),
      '/mobile/safe-route/routes?client_id=client%2Falpha+beta'
    );
  });

  it('builds detail paths with trimmed encoded route identifiers', () => {
    assert.equal(
      buildRouteDetailPath(' route/with spaces '),
      '/mobile/safe-route/routes/route%2Fwith%20spaces'
    );
  });

  it('refuses blank route detail identifiers', () => {
    assert.throws(() => buildRouteDetailPath('   '), /route id is required/i);
  });

  it('loads saved routes through an injected requester and tolerates malformed collections', async () => {
    const seenPaths: string[] = [];
    const request: RouteApiRequester = async (path, accessToken) => {
      seenPaths.push(`${accessToken}:${path}`);
      return {
        clients: 'malformed',
        routes: [
          {
            id: 'route-1',
            name: 'Morning convoy',
            origin: { label: 'Depot' },
            destination: { label: 'Embassy' },
            route: {
              eta_seconds: 600,
              distance_meters: 2500
            }
          }
        ]
      } as never;
    };

    const result = await loadSavedRoutes(request, 'token-1', 'client-1');

    assert.deepEqual(seenPaths, ['token-1:/mobile/safe-route/routes?client_id=client-1']);
    assert.deepEqual(result.clients, []);
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].route.eta, '10 min');
  });

  it('requires a non-empty access token before loading protected routes', async () => {
    let requested = false;
    const request: RouteApiRequester = async () => {
      requested = true;
      return {} as never;
    };

    await assert.rejects(
      () => loadSavedRoutes(request, '   '),
      (error) => error instanceof ApiSessionExpiredError && /sign in again/i.test(error.message)
    );
    assert.equal(requested, false);
  });

  it('loads route details through an injected requester', async () => {
    const request: RouteApiRequester = async (path, accessToken) => {
      assert.equal(accessToken, 'token-2');
      assert.equal(path, '/mobile/safe-route/routes/route%2F2');

      return {
        id: 'route-2',
        name: 'Airport escort',
        route: {
          eta_seconds: 300,
          distance_meters: 1200
        }
      } as never;
    };

    const plan = await loadRouteDetail(request, 'token-2', 'route/2');

    assert.equal(plan.id, 'route-2');
    assert.equal(plan.name, 'Airport escort');
    assert.equal(plan.route.distance, '1.2 km');
  });

  it('lets session-expired errors propagate to the route list UX', async () => {
    const request: RouteApiRequester = async () => {
      throw new ApiSessionExpiredError('Session rejected by LunarChain.');
    };

    await assert.rejects(
      () => loadSavedRoutes(request, 'expired-token'),
      (error) => error instanceof ApiSessionExpiredError && /rejected/.test(error.message)
    );
  });
});
