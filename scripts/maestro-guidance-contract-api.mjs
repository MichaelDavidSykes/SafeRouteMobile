#!/usr/bin/env node
import { createServer } from 'node:http';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GUIDANCE_CONTRACT_API_PORT = 18080;
export const GUIDANCE_CONTRACT_MODES = Object.freeze({
  active: 'active-a',
  denied: 'denied-a',
  offline: 'offline',
  wrongPrincipal: 'active-b'
});

const ACCOUNT_EMAIL = 'driver@example.com';
const ACCOUNT_A = Object.freeze({
  _id: 'guidance-driver-a',
  email: ACCOUNT_EMAIL,
  name: 'Guidance Driver A'
});
const ACCOUNT_B = Object.freeze({
  _id: 'guidance-driver-b',
  email: ACCOUNT_EMAIL,
  name: 'Guidance Driver B'
});
const WORKSPACE = Object.freeze({ id: 'guidance-workspace', name: 'Guidance Operations' });
const ROUTE_ID = 'guidance-contract-route';
const ROUTE_COORDINATES = Object.freeze([
  { latitude: 51.5074, longitude: -0.1278 },
  { latitude: 51.5092, longitude: -0.0812 },
  { latitude: 51.5111, longitude: -0.0314 },
  { latitude: 51.5088, longitude: 0.0121 },
  { latitude: 51.5053, longitude: 0.0553 }
]);

export function createGuidanceContractAccessToken(nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    exp: nowSeconds + 24 * 60 * 60,
    iat: nowSeconds - 1,
    sub: ACCOUNT_EMAIL,
    typ: 'access'
  });
  return `${header}.${payload}.guidance-contract-signature`;
}

export function createGuidanceContractRoute() {
  return {
    checkpoints: [
      {
        caption: 'Current location',
        coordinate: ROUTE_COORDINATES[0],
        id: 'guidance-origin',
        kind: 'origin',
        label: 'Current location'
      },
      {
        caption: 'London City Airport',
        coordinate: ROUTE_COORDINATES.at(-1),
        id: 'guidance-destination',
        kind: 'destination',
        label: 'London City Airport'
      }
    ],
    client: WORKSPACE,
    client_id: WORKSPACE.id,
    client_name: WORKSPACE.name,
    convoy_callsign: 'SR-VERIFY',
    description: 'Deterministic contract geometry for cold-process authorization evidence.',
    destination: {
      coordinate: ROUTE_COORDINATES.at(-1),
      label: 'London City Airport'
    },
    id: ROUTE_ID,
    mobile_status: 'ready',
    name: 'Cold restart verification',
    operation: 'Authorization continuity',
    origin: {
      coordinate: ROUTE_COORDINATES[0],
      label: 'Current location'
    },
    risk_overlays: [],
    route: {
      color: '#30d158',
      coordinates: ROUTE_COORDINATES,
      description: 'Follow the verified road geometry to London City Airport.',
      distance_label: '8.4 mi',
      distance_meters: 13500,
      eta_label: '24 min',
      eta_seconds: 1440,
      id: `${ROUTE_ID}-geometry`,
      label: 'Authorization fixture route',
      next_distance_meters: 500,
      next_instruction: 'Continue east toward London City Airport',
      risk_level: 'low',
      risk_score: 12
    },
    status: 'active',
    updated_at: new Date(0).toISOString()
  };
}

export function createGuidanceContractHandler({
  readMode,
  requestLog = () => undefined
}) {
  return async (request, response) => {
    const mode = normalizeMode(readMode());
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    requestLog({
      authorized: hasExpectedBearerAuthorization(request.headers.authorization),
      method: request.method || 'GET',
      mode,
      path: url.pathname,
      search: url.search
    });

    if (url.pathname === '/__guidance_contract__/health') {
      sendJson(response, 200, { mode, status: 'ready' });
      return;
    }

    if (mode === GUIDANCE_CONTRACT_MODES.offline) {
      request.socket.destroy();
      return;
    }

    if (
      isProtectedPath(url.pathname) &&
      !hasExpectedBearerAuthorization(request.headers.authorization)
    ) {
      sendApiError(response, 401, 'A contract Bearer token is required.', {
        'WWW-Authenticate': 'Bearer'
      });
      return;
    }

    if (
      url.pathname === '/api/v1/intel/map/area-risk' &&
      request.headers.authorization &&
      !hasExpectedBearerAuthorization(request.headers.authorization)
    ) {
      sendApiError(response, 401, 'A contract Bearer token is required.', {
        'WWW-Authenticate': 'Bearer'
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/auth/mobile-login') {
      await readRequestBody(request);
      sendApiSuccess(response, {
        data: {
          access_token: createGuidanceContractAccessToken(),
          email: ACCOUNT_EMAIL,
          requires_two_factor: false,
          token_type: 'bearer'
        },
        message: 'Login successful.'
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/users/me') {
      sendApiSuccess(
        response,
        {
          data: mode === GUIDANCE_CONTRACT_MODES.wrongPrincipal ? ACCOUNT_B : ACCOUNT_A,
          message: 'Current user loaded.'
        }
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/mobile/safe-route/routes') {
      const denied = mode === GUIDANCE_CONTRACT_MODES.denied;
      const requestedWorkspaceId = String(url.searchParams.get('client_id') || '').trim();
      if (requestedWorkspaceId && requestedWorkspaceId !== WORKSPACE.id) {
        sendApiError(response, 404, 'Workspace was not found.');
        return;
      }
      if (denied && requestedWorkspaceId === WORKSPACE.id) {
        sendApiError(response, 403, 'Workspace membership is unavailable.');
        return;
      }
      const route = createGuidanceContractRoute();
      sendApiSuccess(response, {
        data: {
          clients: denied ? [] : [WORKSPACE],
          routes: denied ? [] : [route],
          selected_client_id: requestedWorkspaceId && !denied ? WORKSPACE.id : null
        },
        message: 'SafeRoute routes loaded.'
      });
      return;
    }

    if (
      request.method === 'GET' &&
      url.pathname === `/api/v1/mobile/safe-route/routes/${ROUTE_ID}`
    ) {
      if (mode === GUIDANCE_CONTRACT_MODES.denied) {
        sendApiError(response, 403, 'Workspace membership is unavailable.');
        return;
      }
      sendApiSuccess(response, {
        data: createGuidanceContractRoute(),
        message: 'SafeRoute route loaded.'
      });
      return;
    }

    if (
      request.method === 'POST' &&
      (url.pathname === '/api/v1/mobile/safe-route/route-preview' ||
        url.pathname === '/api/v1/convoy-routes/route-preview')
    ) {
      const body = await readJsonBody(request);
      if (url.pathname === '/api/v1/convoy-routes/route-preview') {
        const requestedWorkspaceId = String(body?.client_id || '').trim();
        if (requestedWorkspaceId !== WORKSPACE.id) {
          sendApiError(response, 404, 'Workspace was not found.');
          return;
        }
        if (mode === GUIDANCE_CONTRACT_MODES.denied) {
          sendApiError(response, 403, 'Workspace membership is unavailable.');
          return;
        }
      }
      const waypoints = Array.isArray(body?.waypoints) ? body.waypoints : [];
      const coordinates = waypoints
        .map((waypoint) => ({
          latitude: Number(waypoint?.lat),
          longitude: Number(waypoint?.lon)
        }))
        .filter(isCoordinate);
      const routeCoordinates = interpolateCoordinates(
        coordinates.length >= 2 ? coordinates : ROUTE_COORDINATES
      );
      sendApiSuccess(response, {
        data: {
          avoid_area_count: Array.isArray(body?.avoid_rectangles)
            ? body.avoid_rectangles.length
            : 0,
          coordinates: routeCoordinates,
          distance_meters: 13500,
          duration_seconds: 1440,
          provider: 'osrm',
          snapped: true
        },
        message: 'SafeRoute preview created.'
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/intel/map/area-risk') {
      const requestedWorkspaceId = String(url.searchParams.get('client_id') || '').trim();
      const authenticated = hasExpectedBearerAuthorization(request.headers.authorization);
      if (authenticated && requestedWorkspaceId && requestedWorkspaceId !== WORKSPACE.id) {
        sendApiError(response, 404, 'Workspace was not found.');
        return;
      }
      if (
        authenticated &&
        requestedWorkspaceId === WORKSPACE.id &&
        mode === GUIDANCE_CONTRACT_MODES.denied
      ) {
        sendApiError(response, 403, 'Workspace membership is unavailable.');
        return;
      }
      sendApiSuccess(response, {
        data: {
          fetched_at: new Date(0).toISOString(),
          message: 'No deterministic risk signals in this viewport.',
          provider_status: 'ready',
          zones: []
        },
        message: 'Risk viewport loaded.'
      });
      return;
    }

    sendApiError(response, 404, `No guidance contract for ${url.pathname}.`);
  };
}

export function startGuidanceContractApi({
  host = '127.0.0.1',
  port = GUIDANCE_CONTRACT_API_PORT,
  readMode,
  requestLog
}) {
  const server = createServer(createGuidanceContractHandler({ readMode, requestLog }));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function normalizeMode(value) {
  const normalized = String(value || '').trim();
  return Object.values(GUIDANCE_CONTRACT_MODES).includes(normalized)
    ? normalized
    : GUIDANCE_CONTRACT_MODES.offline;
}

function isProtectedPath(pathname) {
  return (
    pathname === '/api/v1/users/me' ||
    pathname === '/api/v1/mobile/safe-route/routes' ||
    pathname.startsWith('/api/v1/mobile/safe-route/routes/') ||
    pathname === '/api/v1/convoy-routes/route-preview'
  );
}

function hasExpectedBearerAuthorization(value) {
  const authorization = String(value || '').trim();
  if (!/^Bearer\s+\S/i.test(authorization)) {
    return false;
  }
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token.endsWith('.guidance-contract-signature')) {
    return false;
  }
  const segments = token.split('.');
  if (segments.length !== 3) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    return payload?.sub === ACCOUNT_EMAIL && payload?.typ === 'access';
  } catch {
    return false;
  }
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sendJson(response, statusCode, body) {
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(serialized),
    'Content-Type': 'application/json'
  });
  response.end(serialized);
}

function sendApiSuccess(response, body) {
  sendJson(response, 200, {
    status: 'success',
    ...body
  });
}

function sendApiError(response, statusCode, message, headers = {}) {
  const serialized = JSON.stringify({
    detail: {
      details: message,
      message
    },
    message,
    status: 'error'
  });
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(serialized),
    'Content-Type': 'application/json',
    ...headers
  });
  response.end(serialized);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 1_000_000) {
        request.destroy();
        reject(new Error('Guidance contract request exceeded one megabyte.'));
        return;
      }
      chunks.push(chunk);
    });
    request.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.once('error', reject);
  });
}

async function readJsonBody(request) {
  const body = await readRequestBody(request);
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

function isCoordinate(value) {
  return (
    Number.isFinite(value?.latitude) &&
    Number.isFinite(value?.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

function interpolateCoordinates(coordinates) {
  const interpolated = [];
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    interpolated.push(start);
    for (let step = 1; step <= 3; step += 1) {
      const ratio = step / 4;
      interpolated.push({
        latitude: Number((start.latitude + (end.latitude - start.latitude) * ratio).toFixed(6)),
        longitude: Number((start.longitude + (end.longitude - start.longitude) * ratio).toFixed(6))
      });
    }
  }
  interpolated.push(coordinates.at(-1));
  return interpolated;
}

function parseCliArguments(argumentsList) {
  const parsed = { port: GUIDANCE_CONTRACT_API_PORT, requestLogFile: '', stateFile: '' };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--port') {
      parsed.port = Number(argumentsList[index + 1]);
      index += 1;
    } else if (argument === '--state-file') {
      parsed.stateFile = String(argumentsList[index + 1] || '').trim();
      index += 1;
    } else if (argument === '--request-log') {
      parsed.requestLogFile = String(argumentsList[index + 1] || '').trim();
      index += 1;
    }
  }
  if (!Number.isInteger(parsed.port) || parsed.port <= 0 || parsed.port > 65535) {
    throw new Error('Guidance contract API port must be a valid TCP port.');
  }
  if (!parsed.stateFile) {
    throw new Error('Guidance contract API requires --state-file.');
  }
  return parsed;
}

async function runCli() {
  const { port, requestLogFile, stateFile } = parseCliArguments(process.argv.slice(2));
  const readMode = () => {
    try {
      return readFileSync(stateFile, 'utf8');
    } catch {
      return GUIDANCE_CONTRACT_MODES.offline;
    }
  };
  const server = await startGuidanceContractApi({
    port,
    readMode,
    requestLog: (entry) => {
      process.stdout.write(`[guidance-contract-api] ${entry.mode} ${entry.method} ${entry.path}\n`);
      if (requestLogFile) {
        appendFileSync(requestLogFile, `${JSON.stringify({
          ...entry,
          timestampMs: Date.now()
        })}\n`);
      }
    }
  });
  process.stdout.write(`[guidance-contract-api] listening on 127.0.0.1:${port}\n`);

  const close = () => server.close(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
