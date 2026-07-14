#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GUIDANCE_CONTRACT_API_PORT = 18080;
export const GUIDANCE_CONTRACT_MODES = Object.freeze({
  active: 'active-a',
  denied: 'denied-a',
  offline: 'offline',
  wrongPrincipal: 'active-b'
});

export const GUIDANCE_START_BOUNDARY_PATH = '/__guidance_contract__/boundary';

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
const RESPONSE_SEMANTIC_OUTCOME = Symbol('guidanceContractSemanticOutcome');
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
  createRequestId = randomUUID,
  now = () => Date.now(),
  readControl,
  readMode = () => GUIDANCE_CONTRACT_MODES.offline,
  readPhase = () => 'unassigned',
  requestLog = () => undefined
}) {
  return async (request, response) => {
    const { mode, phase } = normalizeControlSnapshot(
      readControl ? readControl() : { mode: readMode(), phase: readPhase() }
    );
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const requestId = createRequestId();
    const startedAtMs = now();
    const requestEntry = requestLog({
      authorizationClass: classifyAuthorization(request.headers.authorization),
      authorized: hasExpectedBearerAuthorization(request.headers.authorization),
      event: 'request',
      method: request.method || 'GET',
      mode,
      path: url.pathname,
      phase,
      requestId,
      search: url.search
    });
    let completionRecorded = false;
    const recordCompletion = ({
      completed,
      semanticOutcome,
      statusCode
    }) => {
      if (completionRecorded) {
        return;
      }
      completionRecorded = true;
      requestLog({
        authorizationClass: classifyAuthorization(request.headers.authorization),
        authorized: hasExpectedBearerAuthorization(request.headers.authorization),
        completed,
        durationMs: Math.max(0, now() - startedAtMs),
        event: 'completion',
        method: request.method || 'GET',
        mode,
        path: url.pathname,
        phase,
        requestId,
        requestSequence: Number.isInteger(requestEntry?.sequence)
          ? requestEntry.sequence
          : null,
        search: url.search,
        semanticOutcome,
        statusCode
      });
    };
    response.once('finish', () => recordCompletion({
      completed: true,
      semanticOutcome: response[RESPONSE_SEMANTIC_OUTCOME] || 'unclassified',
      statusCode: response.statusCode
    }));
    response.once('close', () => {
      if (!response.writableFinished) {
        recordCompletion({
          completed: false,
          semanticOutcome: response[RESPONSE_SEMANTIC_OUTCOME] || 'connection-closed',
          statusCode: null
        });
      }
    });
    request.once('aborted', () => recordCompletion({
      completed: false,
      semanticOutcome: response[RESPONSE_SEMANTIC_OUTCOME] || 'request-aborted',
      statusCode: null
    }));

    if (url.pathname === '/__guidance_contract__/health') {
      sendJson(response, 200, { mode, status: 'ready' }, 'health-ready');
      return;
    }

    if (request.method === 'POST' && url.pathname === GUIDANCE_START_BOUNDARY_PATH) {
      const boundary = String(url.searchParams.get('boundary') || '').trim();
      const edge = String(url.searchParams.get('edge') || '').trim();
      if (
        !/^[a-z][a-z0-9-]{0,63}$/.test(boundary) ||
        !['armed', 'open', 'close', 'settled'].includes(edge)
      ) {
        sendApiError(response, 400, 'A valid boundary and edge are required.');
        return;
      }
      sendApiSuccess(response, {
        data: { boundary, edge },
        message: 'Guidance Start boundary recorded.'
      }, `boundary-${edge}`);
      return;
    }

    if (mode === GUIDANCE_CONTRACT_MODES.offline) {
      response[RESPONSE_SEMANTIC_OUTCOME] = 'connection-destroyed';
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
        },
        mode === GUIDANCE_CONTRACT_MODES.wrongPrincipal ? 'principal-b' : 'principal-a'
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
      }, denied ? 'catalog-denied' : 'catalog-active');
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
  createRequestId,
  host = '127.0.0.1',
  now,
  port = GUIDANCE_CONTRACT_API_PORT,
  readControl,
  readMode,
  readPhase,
  requestLog
}) {
  const server = createServer(createGuidanceContractHandler({
    createRequestId,
    now,
    readControl,
    readMode,
    readPhase,
    requestLog
  }));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function normalizeControlSnapshot(value) {
  return {
    mode: normalizeMode(value?.mode),
    phase: normalizePhase(value?.phase)
  };
}

function normalizeMode(value) {
  const normalized = String(value || '').trim();
  return Object.values(GUIDANCE_CONTRACT_MODES).includes(normalized)
    ? normalized
    : GUIDANCE_CONTRACT_MODES.offline;
}

function normalizePhase(value) {
  const normalized = String(value || '').trim();
  return /^[a-z][A-Za-z0-9-]{0,63}$/.test(normalized)
    ? normalized
    : 'unassigned';
}

function classifyAuthorization(value) {
  const authorization = String(value || '').trim();
  if (!authorization) {
    return 'none';
  }
  return hasExpectedBearerAuthorization(authorization)
    ? 'expected-bearer'
    : 'unexpected';
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

function sendJson(response, statusCode, body, semanticOutcome = `http-${statusCode}`) {
  response[RESPONSE_SEMANTIC_OUTCOME] = semanticOutcome;
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(serialized),
    'Content-Type': 'application/json'
  });
  response.end(serialized);
}

function sendApiSuccess(response, body, semanticOutcome = 'api-success') {
  sendJson(response, 200, {
    status: 'success',
    ...body
  }, semanticOutcome);
}

function sendApiError(
  response,
  statusCode,
  message,
  headers = {},
  semanticOutcome = `api-error-${statusCode}`
) {
  response[RESPONSE_SEMANTIC_OUTCOME] = semanticOutcome;
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

export function assertGuidanceContractRequestJournal(entries, {
  allowLegacyEntries = false,
  expectedModeByPhase,
  requiredPhases = []
}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Guidance contract request journal was empty.');
  }

  const phaseOrder = Object.keys(expectedModeByPhase);
  const validAuthorizationClasses = new Set([
    'expected-bearer',
    'none',
    'unexpected'
  ]);
  let previousPhaseIndex = -1;
  const requestsById = new Map();
  const completionsByRequestId = new Map();

  entries.forEach((entry, index) => {
    const event = entry.event || 'request';
    const phaseIndex = phaseOrder.indexOf(entry.phase);
    assertJournalCondition(
      entry.sequence === index + 1,
      `Guidance contract request journal sequence broke at line ${index + 1}.`
    );
    if (event === 'request') {
      assertJournalCondition(
        phaseIndex >= previousPhaseIndex && phaseIndex >= 0,
        `Guidance contract request journal phase order broke at line ${index + 1}.`
      );
      previousPhaseIndex = phaseIndex;
    }
    assertJournalCondition(
      entry.mode === expectedModeByPhase[entry.phase],
      `Guidance contract request journal phase/mode mismatch at line ${index + 1}.`
    );
    assertJournalCondition(
      typeof entry.authorized === 'boolean' &&
        validAuthorizationClasses.has(entry.authorizationClass) &&
        entry.authorized === (entry.authorizationClass === 'expected-bearer') &&
        typeof entry.method === 'string' && /^[A-Z]+$/.test(entry.method) &&
        typeof entry.path === 'string' && entry.path.startsWith('/') &&
        typeof entry.search === 'string' &&
        Number.isFinite(entry.timestampMs) &&
        ['request', 'completion'].includes(event),
      `Guidance contract request journal metadata was invalid at line ${index + 1}.`
    );
    assertJournalCondition(
      allowLegacyEntries ||
        (['request', 'completion'].includes(entry.event) &&
          typeof entry.requestId === 'string'),
      `Guidance contract request journal lifecycle metadata was missing at line ${index + 1}.`
    );
    if (entry.event) {
      assertJournalCondition(
        typeof entry.requestId === 'string' && entry.requestId.length >= 8,
        `Guidance contract request journal request identity was invalid at line ${index + 1}.`
      );
    }
    if (event === 'request' && entry.requestId) {
      assertJournalCondition(
        !requestsById.has(entry.requestId),
        `Guidance contract request journal duplicated request ${entry.requestId}.`
      );
      requestsById.set(entry.requestId, entry);
    }
    if (event === 'completion') {
      const completionList = completionsByRequestId.get(entry.requestId) || [];
      completionList.push(entry);
      completionsByRequestId.set(entry.requestId, completionList);
      assertJournalCondition(
        typeof entry.completed === 'boolean' &&
          Number.isFinite(entry.durationMs) && entry.durationMs >= 0 &&
          typeof entry.semanticOutcome === 'string' && entry.semanticOutcome.length > 0 &&
          (entry.completed
            ? Number.isInteger(entry.statusCode) && entry.statusCode >= 100 && entry.statusCode <= 599
            : entry.statusCode === null),
        `Guidance contract response outcome was invalid at line ${index + 1}.`
      );
    }
  });

  for (const [requestId, request] of requestsById) {
    const completions = completionsByRequestId.get(requestId) || [];
    assertJournalCondition(
      completions.length === 1,
      `Guidance contract request ${requestId} expected one response outcome but recorded ${completions.length}.`
    );
    const completion = completions[0];
    assertJournalCondition(
      completion.sequence > request.sequence &&
        completion.requestSequence === request.sequence &&
        completion.phase === request.phase &&
        completion.mode === request.mode &&
        completion.method === request.method &&
        completion.path === request.path &&
        completion.search === request.search &&
        completion.authorized === request.authorized &&
        completion.authorizationClass === request.authorizationClass,
      `Guidance contract response outcome did not match request ${requestId}.`
    );
  }
  for (const requestId of completionsByRequestId.keys()) {
    assertJournalCondition(
      requestsById.has(requestId),
      `Guidance contract response outcome referenced unknown request ${requestId}.`
    );
  }

  for (const phase of requiredPhases) {
    assertJournalCondition(
      entries.some((entry) => entry.phase === phase),
      `Guidance contract request journal had no evidence for ${phase}.`
    );
  }
}

export function assertGuidanceStartTrafficBoundary(entries, {
  boundary,
  expectedOutcomes,
  expectedPaths,
  openPhase,
  phase
}) {
  const normalizedBoundary = String(boundary || '').trim();
  const normalizedOpenPhase = String(openPhase || '').trim();
  const normalizedPhase = String(phase || '').trim();
  const expected = Array.isArray(expectedPaths) ? expectedPaths : [];
  const outcomes = Array.isArray(expectedOutcomes) ? expectedOutcomes : null;
  const markers = entries.filter((entry) => {
    if ((entry.event && entry.event !== 'request') || entry.path !== GUIDANCE_START_BOUNDARY_PATH) {
      return false;
    }
    const parameters = new URLSearchParams(entry.search);
    return parameters.get('boundary') === normalizedBoundary;
  });
  const openMarkers = markers.filter(
    (entry) => new URLSearchParams(entry.search).get('edge') === 'open'
  );
  const closeMarkers = markers.filter(
    (entry) => new URLSearchParams(entry.search).get('edge') === 'close'
  );
  const armedMarkers = markers.filter(
    (entry) => new URLSearchParams(entry.search).get('edge') === 'armed'
  );
  const settledMarkers = markers.filter(
    (entry) => new URLSearchParams(entry.search).get('edge') === 'settled'
  );

  assertJournalCondition(
    markers.length === 4 &&
      armedMarkers.length === 1 &&
      openMarkers.length === 1 &&
      closeMarkers.length === 1 &&
      settledMarkers.length === 1,
    `Guidance Start boundary ${normalizedBoundary} must have one armed, open, close, and settled marker.`
  );
  const armed = armedMarkers[0];
  const open = openMarkers[0];
  const close = closeMarkers[0];
  const settled = settledMarkers[0];
  assertJournalCondition(
    armed.sequence < open.sequence &&
      open.sequence < close.sequence &&
      close.sequence < settled.sequence,
    `Guidance Start boundary ${normalizedBoundary} markers were out of order.`
  );
  assertJournalCondition(
    armed.phase === normalizedOpenPhase &&
      open.phase === normalizedOpenPhase &&
      close.phase === normalizedPhase &&
      settled.phase === normalizedPhase &&
      armed.method === 'POST' &&
      open.method === 'POST' &&
      close.method === 'POST' &&
      settled.method === 'POST' &&
      armed.authorized === false &&
      open.authorized === false &&
      close.authorized === false &&
      settled.authorized === false &&
      armed.authorizationClass === 'none' &&
      open.authorizationClass === 'none' &&
      close.authorizationClass === 'none' &&
      settled.authorizationClass === 'none' &&
      armed.search === `?${new URLSearchParams({
        boundary: normalizedBoundary,
        edge: 'armed'
      })}` &&
      open.search === `?${new URLSearchParams({
        boundary: normalizedBoundary,
        edge: 'open'
      })}` &&
      close.search === `?${new URLSearchParams({
        boundary: normalizedBoundary,
        edge: 'close'
      })}` &&
      settled.search === `?${new URLSearchParams({
        boundary: normalizedBoundary,
        edge: 'settled'
      })}`,
    `Guidance Start boundary ${normalizedBoundary} used invalid markers.`
  );
  for (const [index, marker] of [armed, open, close, settled].entries()) {
    if (!marker.requestId) {
      continue;
    }
    const markerOutcomes = entries.filter(
      (entry) => entry.event === 'completion' && entry.requestId === marker.requestId
    );
    const nextMarker = [open, close, settled][index];
    assertJournalCondition(
      markerOutcomes.length === 1 &&
        markerOutcomes[0].completed === true &&
        markerOutcomes[0].statusCode === 200 &&
        markerOutcomes[0].semanticOutcome === `boundary-${
          new URLSearchParams(marker.search).get('edge')
        }` &&
        markerOutcomes[0].sequence > marker.sequence &&
        (!nextMarker || markerOutcomes[0].sequence < nextMarker.sequence),
      `Guidance Start boundary ${normalizedBoundary} marker did not complete successfully.`
    );
  }

  const delayedPreparationEntries = entries.filter(
    (entry) =>
      entry.sequence > armed.sequence &&
      entry.sequence < open.sequence &&
      isGuidanceStartProtectedTraffic(entry)
  );
  assertJournalCondition(
    delayedPreparationEntries.length === 0,
    `Guidance Start boundary ${normalizedBoundary} recorded protected traffic while arming.`
  );

  const protectedEntries = entries.filter(
    (entry) =>
      entry.sequence > open.sequence &&
      entry.sequence < close.sequence &&
      isGuidanceStartProtectedTraffic(entry)
  );

  assertJournalCondition(
    protectedEntries.length === expected.length,
    `Guidance Start boundary ${normalizedBoundary} expected ${expected.length} protected requests but recorded ${protectedEntries.length}.`
  );
  protectedEntries.forEach((entry, index) => {
    assertJournalCondition(
      entry.phase === normalizedPhase &&
        entry.method === 'GET' &&
        entry.path === expected[index] &&
        entry.search === '' &&
        entry.authorized === true &&
        entry.authorizationClass === 'expected-bearer',
      `Guidance Start boundary ${normalizedBoundary} request ${index + 1} did not match the exact authorization contract.`
    );
    if (outcomes) {
      const responseEntries = entries.filter(
        (candidate) =>
          candidate.event === 'completion' && candidate.requestId === entry.requestId
      );
      const expectedOutcome = outcomes[index];
      assertJournalCondition(
        expectedOutcome &&
          responseEntries.length === 1 &&
          responseEntries[0].sequence > entry.sequence &&
          responseEntries[0].sequence < close.sequence &&
          responseEntries[0].completed === true &&
          responseEntries[0].statusCode === expectedOutcome.statusCode &&
          responseEntries[0].semanticOutcome === expectedOutcome.semanticOutcome,
        `Guidance Start boundary ${normalizedBoundary} request ${index + 1} did not complete with the expected response outcome.`
      );
      const nextRequest = protectedEntries[index + 1];
      assertJournalCondition(
        !nextRequest || responseEntries[0].sequence < nextRequest.sequence,
        `Guidance Start boundary ${normalizedBoundary} request ${index + 1} did not complete before the next authorization request.`
      );
    }
  });
  if (outcomes) {
    assertJournalCondition(
      outcomes.length === expected.length,
      `Guidance Start boundary ${normalizedBoundary} response expectations did not match its request contract.`
    );
  }

  const quarantineEntries = entries.filter(
    (entry) =>
      entry.sequence > close.sequence &&
      entry.sequence < settled.sequence &&
      isGuidanceStartProtectedTraffic(entry)
  );
  assertJournalCondition(
    quarantineEntries.length === 0,
    `Guidance Start boundary ${normalizedBoundary} recorded protected traffic during post-close quarantine.`
  );

  const escapedProtectedEntries = entries.filter(
    (entry) =>
      entry.phase === normalizedPhase &&
      isGuidanceStartProtectedTraffic(entry) &&
      !(entry.sequence > open.sequence && entry.sequence < close.sequence)
  );
  assertJournalCondition(
    escapedProtectedEntries.length === 0,
    `Guidance Start boundary ${normalizedBoundary} recorded protected traffic outside its markers.`
  );
}

export function isGuidanceStartProtectedTraffic(entry) {
  return Boolean(
    entry &&
      (!entry.event || entry.event === 'request') &&
      (isProtectedPath(entry.path) || entry.authorizationClass !== 'none')
  );
}

function assertJournalCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function createGuidanceContractRequestJournal({
  now = () => Date.now(),
  requestLogFile
}) {
  let sequence = readExistingJournalLength(requestLogFile);
  return (entry) => {
    const journalEntry = {
      ...entry,
      sequence: sequence + 1,
      timestampMs: now()
    };
    sequence += 1;
    appendFileSync(requestLogFile, `${JSON.stringify(journalEntry)}\n`);
    return journalEntry;
  };
}

function readExistingJournalLength(requestLogFile) {
  try {
    return readFileSync(requestLogFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .length;
  } catch {
    return 0;
  }
}

function parseCliArguments(argumentsList) {
  const parsed = {
    controlFile: '',
    port: GUIDANCE_CONTRACT_API_PORT,
    requestLogFile: ''
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--port') {
      parsed.port = Number(argumentsList[index + 1]);
      index += 1;
    } else if (argument === '--control-file') {
      parsed.controlFile = String(argumentsList[index + 1] || '').trim();
      index += 1;
    } else if (argument === '--request-log') {
      parsed.requestLogFile = String(argumentsList[index + 1] || '').trim();
      index += 1;
    }
  }
  if (!Number.isInteger(parsed.port) || parsed.port <= 0 || parsed.port > 65535) {
    throw new Error('Guidance contract API port must be a valid TCP port.');
  }
  if (!parsed.controlFile) {
    throw new Error('Guidance contract API requires --control-file.');
  }
  if (!parsed.requestLogFile) {
    throw new Error('Guidance contract API requires --request-log.');
  }
  return parsed;
}

async function runCli() {
  const { controlFile, port, requestLogFile } = parseCliArguments(
    process.argv.slice(2)
  );
  const readControl = () => {
    try {
      return JSON.parse(readFileSync(controlFile, 'utf8'));
    } catch {
      return { mode: GUIDANCE_CONTRACT_MODES.offline, phase: 'unassigned' };
    }
  };
  const appendRequest = createGuidanceContractRequestJournal({ requestLogFile });
  const server = await startGuidanceContractApi({
    port,
    readControl,
    requestLog: (entry) => {
      const journalEntry = appendRequest(entry);
      process.stdout.write(
        `[guidance-contract-api] #${journalEntry.sequence} ${entry.event} ${entry.phase} ${entry.mode} ${entry.method} ${entry.path}${entry.event === 'completion' ? ` ${entry.completed ? entry.statusCode : entry.semanticOutcome}` : ''}\n`
      );
      return journalEntry;
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
