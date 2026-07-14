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
export const GUIDANCE_CONTRACT_EVIDENCE_PATH = '/__guidance_contract__/evidence';
export const GUIDANCE_CONTRACT_EVIDENCE_TYPES = Object.freeze([
  'navigation.persisted',
  'restore.suspended',
  'restore.ready',
  'workspace.recovery.settled',
  'route.cache.readback',
  'navigation.cleanup.settled',
  'tracking.stop.settled'
]);
const GUIDANCE_CONTRACT_EVIDENCE_PHASES = Object.freeze({
  'navigation.persisted': new Set([
    'publicStart',
    'workspaceStart',
    'workspaceReconnect',
    'workspaceReseedStart',
    'denialSeedStart'
  ]),
  'restore.suspended': new Set(['workspaceOffline', 'workspaceReconnect']),
  'restore.ready': new Set(['workspacePrepare', 'workspaceReconnect']),
  'workspace.recovery.settled': new Set([
    'deniedStart',
    'workspaceReconnect',
    'wrongPrincipal',
    'denied',
    'regained'
  ]),
  'route.cache.readback': new Set(['regained', 'readbackEvidence']),
  'navigation.cleanup.settled': new Set([
    'wrongPrincipalStart',
    'deniedStart',
    'wrongPrincipal',
    'denied'
  ]),
  'tracking.stop.settled': new Set([
    'wrongPrincipalStart',
    'deniedStart',
    'wrongPrincipal',
    'denied'
  ])
});

const ACCOUNT_EMAIL = 'driver@example.com';
const ACCOUNT_A = Object.freeze({
  _id: '66d1b2c3d4e5f60718293d40',
  email: ACCOUNT_EMAIL,
  name: 'Guidance Driver A'
});
const ACCOUNT_B = Object.freeze({
  _id: '66d1b2c3d4e5f60718293d41',
  email: ACCOUNT_EMAIL,
  name: 'Guidance Driver B'
});
export const GUIDANCE_CONTRACT_WORKSPACES = Object.freeze({
  denied: Object.freeze({ id: '66a1b2c3d4e5f60718293a40', name: 'Guidance Operations' }),
  survivor: Object.freeze({ id: '66a1b2c3d4e5f60718293a41', name: 'Support Operations' })
});
export const GUIDANCE_CONTRACT_ROUTE_IDS = Object.freeze({
  denied: '66b1b2c3d4e5f60718293b40',
  survivor: '66b1b2c3d4e5f60718293b41'
});
export const GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS = Object.freeze({
  deniedV1: '66c1b2c3d4e5f60718293c40',
  deniedV2: '66c1b2c3d4e5f60718293c41',
  survivor: '66c1b2c3d4e5f60718293c42'
});
const RESPONSE_SEMANTIC_OUTCOME = Symbol('guidanceContractSemanticOutcome');
const ROUTE_COORDINATES = Object.freeze([
  { latitude: 51.5074, longitude: -0.1278 },
  { latitude: 51.5092, longitude: -0.0812 },
  { latitude: 51.5111, longitude: -0.0314 },
  { latitude: 51.5088, longitude: 0.0121 },
  { latitude: 51.5053, longitude: 0.0553 }
]);

function isPostRegainPhase(phase) {
  return phase === 'regained' || phase === 'readbackEvidence';
}

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

export function createGuidanceContractRoute({
  detail = false,
  version = 'v1',
  workspace = 'denied'
} = {}) {
  const survivor = workspace === 'survivor';
  const regained = !survivor && version === 'v2';
  const routeId = survivor
    ? GUIDANCE_CONTRACT_ROUTE_IDS.survivor
    : GUIDANCE_CONTRACT_ROUTE_IDS.denied;
  const routeVariantId = survivor
    ? GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.survivor
    : regained
      ? GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2
      : GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1;
  const routeWorkspace = survivor
    ? GUIDANCE_CONTRACT_WORKSPACES.survivor
    : GUIDANCE_CONTRACT_WORKSPACES.denied;
  const routeName = survivor
    ? 'Support continuity route'
    : `Cold restart verification ${regained ? 'v2' : 'v1'}`;
  const routeCoordinates = regained
    ? ROUTE_COORDINATES.map((coordinate, index) => index < 2
      ? coordinate
      : { latitude: coordinate.latitude + 0.0004, longitude: coordinate.longitude })
    : ROUTE_COORDINATES;
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
        coordinate: routeCoordinates.at(-1),
        id: 'guidance-destination',
        kind: 'destination',
        label: 'London City Airport'
      }
    ],
    client: routeWorkspace,
    client_id: routeWorkspace.id,
    client_name: routeWorkspace.name,
    convoy_callsign: survivor ? 'SR-SUPPORT' : 'SR-VERIFY',
    description: 'Deterministic contract geometry for cold-process authorization evidence.',
    destination: {
      coordinate: routeCoordinates.at(-1),
      id: 'guidance-destination',
      label: 'London City Airport'
    },
    id: routeId,
    is_active: true,
    mobile_status: 'ready',
    name: routeName,
    operation: survivor ? 'Support continuity' : 'Authorization continuity',
    origin: {
      coordinate: ROUTE_COORDINATES[0],
      id: 'guidance-origin',
      label: 'Current location'
    },
    risk_overlays: [],
    route_alerts: [],
    route: {
      color: '#30d158',
      coordinates: routeCoordinates,
      description: 'Follow the verified road geometry to London City Airport.',
      distance_label: '8.4 mi',
      distance_meters: 13500,
      eta_label: '24 min',
      eta_seconds: 1440,
      id: routeVariantId,
      label: survivor
        ? 'Support survivor route'
        : `Authorization fixture route ${regained ? 'v2' : 'v1'}`,
      next_distance_meters: 500,
      next_instruction: regained
        ? 'Continue east on the freshly restored route'
        : survivor
          ? 'Continue east on the retained support route'
          : 'Continue east toward London City Airport',
      risk_level: 'low',
      risk_score: 12
    },
    status: 'ready',
    updated_at: regained
      ? '2026-07-14T12:00:00.000Z'
      : survivor
        ? '2026-06-15T12:00:00.000Z'
        : '2026-06-01T12:00:00.000Z',
    vehicles: [],
    ...(detail ? {
      metadata: {
        fixture: 'guidance-contract',
        route_variant_id: routeVariantId
      },
      waypoints: [
        {
          caption: 'Current location',
          coordinate: ROUTE_COORDINATES[0],
          id: 'guidance-origin',
          kind: 'origin',
          label: 'Current location'
        },
        {
          caption: 'London City Airport',
          coordinate: routeCoordinates.at(-1),
          id: 'guidance-destination',
          kind: 'destination',
          label: 'London City Airport'
        }
      ]
    } : {})
  };
}

export function createGuidanceContractHandler({
  createRequestId = randomUUID,
  evidenceLog = () => 'recorded',
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

    if (request.method === 'POST' && url.pathname === GUIDANCE_CONTRACT_EVIDENCE_PATH) {
      if (request.headers['x-saferoute-guidance-contract-evidence'] !== '1') {
        sendApiError(
          response,
          403,
          'Guidance contract evidence header is required.',
          {},
          'evidence-header-rejected'
        );
        return;
      }
      const evidence = normalizeGuidanceContractEvidence(await readJsonBody(request));
      if (!evidence) {
        sendApiError(
          response,
          400,
          'Guidance contract evidence was invalid.',
          {},
          'evidence-invalid'
        );
        return;
      }
      const result = evidenceLog(evidence, { mode, phase });
      if (result === 'conflict') {
        sendApiError(
          response,
          409,
          'Guidance contract evidence event ID was reused with different content.',
          {},
          'evidence-conflict'
        );
        return;
      }
      sendApiSuccess(response, {
        data: { event_id: evidence.eventId, result },
        message: result === 'duplicate'
          ? 'Guidance contract evidence was already recorded.'
          : 'Guidance contract evidence recorded.'
      }, result === 'duplicate' ? 'evidence-duplicate' : `evidence-${evidence.type}`);
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
      const regained = isPostRegainPhase(phase);
      const requestedWorkspaceId = String(url.searchParams.get('client_id') || '').trim();
      const requestedWorkspace = Object.values(GUIDANCE_CONTRACT_WORKSPACES)
        .find((workspace) => workspace.id === requestedWorkspaceId);
      if (requestedWorkspaceId && !requestedWorkspace) {
        sendApiError(response, 404, 'Workspace was not found.');
        return;
      }
      if (
        denied &&
        requestedWorkspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id
      ) {
        sendApiError(response, 403, 'Workspace membership is unavailable.');
        return;
      }
      const deniedRoute = createGuidanceContractRoute({
        version: regained ? 'v2' : 'v1',
        workspace: 'denied'
      });
      const survivorRoute = createGuidanceContractRoute({ workspace: 'survivor' });
      const clients = denied
        ? [GUIDANCE_CONTRACT_WORKSPACES.survivor]
        : Object.values(GUIDANCE_CONTRACT_WORKSPACES);
      const routes = denied
        ? [survivorRoute]
        : [deniedRoute, survivorRoute];
      sendApiSuccess(response, {
        data: {
          clients: requestedWorkspace ? [requestedWorkspace] : clients,
          routes: requestedWorkspace
            ? routes.filter((route) => route.client_id === requestedWorkspace.id)
            : routes,
          selected_client_id: requestedWorkspace?.id || null
        },
        message: 'SafeRoute routes loaded.'
      }, denied ? 'catalog-survivor' : regained ? 'catalog-regained' : 'catalog-active');
      return;
    }

    const routeDetailMatch = url.pathname.match(
      /^\/api\/v1\/mobile\/safe-route\/routes\/([0-9a-f]{24})$/i
    );
    if (request.method === 'GET' && routeDetailMatch) {
      const requestedRouteId = routeDetailMatch[1];
      const requestedWorkspace = requestedRouteId === GUIDANCE_CONTRACT_ROUTE_IDS.denied
        ? 'denied'
        : requestedRouteId === GUIDANCE_CONTRACT_ROUTE_IDS.survivor
          ? 'survivor'
          : null;
      if (!requestedWorkspace) {
        sendApiError(response, 404, 'SafeRoute route was not found.');
        return;
      }
      if (
        mode === GUIDANCE_CONTRACT_MODES.denied &&
        requestedWorkspace === 'denied'
      ) {
        sendApiError(response, 403, 'Workspace membership is unavailable.');
        return;
      }
      sendApiSuccess(response, {
        data: createGuidanceContractRoute({
          detail: true,
          version: isPostRegainPhase(phase) ? 'v2' : 'v1',
          workspace: requestedWorkspace
        }),
        message: 'SafeRoute route loaded.'
      }, requestedWorkspace === 'denied' && isPostRegainPhase(phase)
        ? 'route-detail-regained'
        : 'route-detail-active');
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
        if (!Object.values(GUIDANCE_CONTRACT_WORKSPACES)
          .some((workspace) => workspace.id === requestedWorkspaceId)) {
          sendApiError(response, 404, 'Workspace was not found.');
          return;
        }
        if (
          mode === GUIDANCE_CONTRACT_MODES.denied &&
          requestedWorkspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id
        ) {
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
      if (
        authenticated &&
        requestedWorkspaceId &&
        !Object.values(GUIDANCE_CONTRACT_WORKSPACES)
          .some((workspace) => workspace.id === requestedWorkspaceId)
      ) {
        sendApiError(response, 404, 'Workspace was not found.');
        return;
      }
      if (
        authenticated &&
        requestedWorkspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
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
  evidenceLog,
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
    evidenceLog,
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

export function normalizeGuidanceContractEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 1) {
    return null;
  }
  const eventId = normalizeEvidenceString(value.eventId, 128);
  const appLaunchId = normalizeEvidenceString(value.appLaunchId, 128);
  const sourceRevision = normalizeEvidenceString(value.sourceRevision, 40).toLowerCase();
  const type = normalizeEvidenceString(value.type, 64);
  const cause = normalizeEvidenceString(value.cause, 96);
  const outcome = normalizeEvidenceString(value.outcome, 96);
  const occurredAtMs = Number(value.occurredAtMs);
  if (
    !/^[A-Za-z0-9._:-]{8,128}$/.test(eventId) ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(appLaunchId) ||
    !/^[0-9a-f]{40}$/.test(sourceRevision) ||
    !GUIDANCE_CONTRACT_EVIDENCE_TYPES.includes(type) ||
    !cause ||
    !outcome ||
    !Number.isFinite(occurredAtMs) ||
    occurredAtMs <= 0
  ) {
    return null;
  }
  const navigationInstanceId = normalizeOptionalEvidenceString(value.navigationInstanceId);
  const routeId = normalizeOptionalEvidenceString(value.routeId);
  const workspaceId = normalizeOptionalEvidenceString(value.workspaceId);
  if (
    navigationInstanceId === undefined ||
    routeId === undefined ||
    workspaceId === undefined
  ) {
    return null;
  }
  const unavailableWorkspaceIds = Array.isArray(value.unavailableWorkspaceIds)
    ? Array.from(new Set(value.unavailableWorkspaceIds
        .map((workspace) => normalizeEvidenceString(workspace, 160))
        .filter(Boolean)))
        .slice(0, 20)
    : [];
  return {
    appLaunchId,
    authorization: normalizeEvidenceRecord(value.authorization, {
      catalog: ['fresh-authorized', 'fresh-denied', 'not-checked', 'unavailable'],
      principal: ['matching', 'mismatched', 'none', 'unknown']
    }),
    cause,
    durability: normalizeEvidenceRecord(value.durability, {
      activeNavigation: ['absent', 'present', 'revoked', 'unknown'],
      nativeTracking: ['active', 'not-started', 'stopped', 'unknown', 'unsupported'],
      persistedPermit: ['present', 'revoked', 'unknown'],
      routeCache: ['failed', 'present', 'purged', 'unknown'],
      runtimePermit: ['active', 'none', 'pending', 'unknown'],
      workspaceContext: ['failed', 'persisted', 'revoked', 'unknown']
    }),
    eventId,
    navigationInstanceId,
    occurredAtMs,
    outcome,
    routeId,
    schema: 1,
    sourceRevision,
    type,
    unavailableWorkspaceIds,
    workspaceId
  };
}

export function createGuidanceContractEvidenceJournal({
  evidenceLogFile,
  now = () => Date.now()
}) {
  const existing = readJsonLines(evidenceLogFile);
  const recordedEvents = new Map(existing.flatMap((entry) => {
    const normalized = normalizeGuidanceContractEvidence(entry);
    return normalized ? [[normalized.eventId, JSON.stringify(normalized)]] : [];
  }));
  let sequence = existing.length;
  return (evidence, { mode, phase }) => {
    const fingerprint = JSON.stringify(evidence);
    const existingFingerprint = recordedEvents.get(evidence.eventId);
    if (existingFingerprint) {
      return existingFingerprint === fingerprint ? 'duplicate' : 'conflict';
    }
    recordedEvents.set(evidence.eventId, fingerprint);
    sequence += 1;
    appendFileSync(evidenceLogFile, `${JSON.stringify({
      ...evidence,
      receivedAtMs: now(),
      sequence,
      serverMode: mode,
      serverPhase: phase
    })}\n`);
    return 'recorded';
  };
}

export function assertGuidanceContractEvidenceJournal(entries, {
  expectedSourceRevision,
  minimumOccurredAtMs = 0,
  requiredTypes = []
}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Guidance contract device evidence journal was empty.');
  }
  const eventIds = new Set();
  const normalizedEntries = [];
  entries.forEach((entry, index) => {
    const normalized = normalizeGuidanceContractEvidence(entry);
    assertJournalCondition(
      normalized &&
        normalized.sourceRevision === expectedSourceRevision &&
        entry.sequence === index + 1 &&
        Number.isFinite(entry.receivedAtMs) &&
        entry.receivedAtMs >= normalized.occurredAtMs &&
        typeof entry.serverPhase === 'string' &&
        typeof entry.serverMode === 'string' &&
        !eventIds.has(normalized.eventId),
      `Guidance contract device evidence was invalid at line ${index + 1}.`
    );
    eventIds.add(normalized.eventId);
    normalizedEntries.push(normalized);
  });
  const evidenceWindowEntries = normalizedEntries.flatMap((event, index) =>
    event.occurredAtMs >= minimumOccurredAtMs
      ? [{ event, index, journal: entries[index] }]
      : []
  );
  for (const type of requiredTypes) {
    assertJournalCondition(
      evidenceWindowEntries.some(({ event, journal }) =>
        event.type === type && isSuccessfulGuidanceContractEvidence(event, journal)
      ),
      `Guidance contract device evidence had no successful ${type} event.`
    );
  }
  const persistedByNavigation = new Map();
  evidenceWindowEntries.forEach(({ event, index, journal }) => {
    if (
      event.type === 'navigation.persisted' &&
      isSuccessfulGuidanceContractEvidence(event, journal) &&
      !persistedByNavigation.has(event.navigationInstanceId)
    ) {
      persistedByNavigation.set(event.navigationInstanceId, { entry: event, index });
    }
  });
  assertJournalCondition(
    !requiredTypes.includes('navigation.persisted') || persistedByNavigation.size > 0,
    'Guidance contract device evidence had no durable correlated navigation persistence.'
  );
  for (const type of ['restore.suspended', 'restore.ready', 'navigation.cleanup.settled', 'tracking.stop.settled']) {
    if (!requiredTypes.includes(type)) {
      continue;
    }
    const correlated = evidenceWindowEntries.some(({ event, index, journal }) => {
      if (
        event.type !== type ||
        !isSuccessfulGuidanceContractEvidence(event, journal)
      ) {
        return false;
      }
      const persisted = persistedByNavigation.get(event.navigationInstanceId);
      return Boolean(
        persisted &&
        persisted.index < index &&
        persisted.entry.routeId === event.routeId &&
        persisted.entry.workspaceId === event.workspaceId
      );
    });
    assertJournalCondition(
      correlated,
      `Guidance contract device evidence had no persisted-navigation correlation for ${type}.`
    );
  }
  if (requiredTypes.includes('restore.suspended') && requiredTypes.includes('restore.ready')) {
    const completeRestore = evidenceWindowEntries.some(({ event: ready, index: readyIndex, journal }) => {
      if (
        ready.type !== 'restore.ready' ||
        !isSuccessfulGuidanceContractEvidence(ready, journal)
      ) {
        return false;
      }
      return evidenceWindowEntries.some(({ event: suspended, index: suspendedIndex, journal: suspendedJournal }) => {
        if (
          suspended.type !== 'restore.suspended' ||
          suspendedIndex >= readyIndex ||
          !isSuccessfulGuidanceContractEvidence(suspended, suspendedJournal) ||
          suspended.navigationInstanceId !== ready.navigationInstanceId ||
          suspended.routeId !== ready.routeId ||
          suspended.workspaceId !== ready.workspaceId
        ) {
          return false;
        }
        const persisted = persistedByNavigation.get(ready.navigationInstanceId);
        return Boolean(persisted && persisted.index < suspendedIndex);
      });
    });
    assertJournalCondition(
      completeRestore,
      'Guidance contract device evidence had no complete persisted, suspended, and ready workspace lifecycle.'
    );
  }
  if (
    requiredTypes.includes('navigation.cleanup.settled') &&
    requiredTypes.includes('tracking.stop.settled')
  ) {
    const completeCleanup = evidenceWindowEntries.some(({ event: cleanup, index: cleanupIndex, journal }) => {
      if (
        cleanup.type !== 'navigation.cleanup.settled' ||
        !isSuccessfulGuidanceContractEvidence(cleanup, journal)
      ) {
        return false;
      }
      const persisted = persistedByNavigation.get(cleanup.navigationInstanceId);
      if (
        !persisted ||
        persisted.index >= cleanupIndex ||
        persisted.entry.routeId !== cleanup.routeId ||
        persisted.entry.workspaceId !== cleanup.workspaceId
      ) {
        return false;
      }
      return evidenceWindowEntries.some(({ event: tracking, index: trackingIndex, journal: trackingJournal }) =>
        tracking.type === 'tracking.stop.settled' &&
        trackingIndex > cleanupIndex &&
        isSuccessfulGuidanceContractEvidence(tracking, trackingJournal) &&
        tracking.navigationInstanceId === cleanup.navigationInstanceId &&
        tracking.routeId === cleanup.routeId &&
        tracking.workspaceId === cleanup.workspaceId
      );
    });
    assertJournalCondition(
      completeCleanup,
      'Guidance contract device evidence had no correlated navigation cleanup and tracking stop.'
    );
  }
  if (requiredTypes.includes('workspace.recovery.settled')) {
    assertJournalCondition(
      evidenceWindowEntries.some(({ event, journal }) =>
        event.type === 'workspace.recovery.settled' &&
        isSuccessfulGuidanceContractEvidence(event, journal)
      ),
      'Guidance contract device evidence had no durable workspace recovery result.'
    );
  }
}

export function assertGuidanceContractRouteCacheReadbackEvidence(entries, {
  expectedSourceRevision,
  minimumOccurredAtMs = 0
}) {
  const evidenceWindowEntries = Array.isArray(entries) ? entries.filter((entry) =>
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs >= minimumOccurredAtMs
  ) : [];
  const currentEntries = evidenceWindowEntries.filter(
    (entry) => entry.type === 'route.cache.readback'
  );
  const deniedRecoveryIndex = evidenceWindowEntries.findIndex((entry) =>
    entry.type === 'workspace.recovery.settled' &&
    entry.serverPhase === 'denied' &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.unavailableWorkspaceIds?.includes(GUIDANCE_CONTRACT_WORKSPACES.denied.id) &&
    !entry.unavailableWorkspaceIds?.includes(GUIDANCE_CONTRACT_WORKSPACES.survivor.id) &&
    entry.authorization?.catalog === 'fresh-denied' &&
    entry.authorization?.principal === 'matching' &&
    entry.outcome === 'persisted' &&
    entry.durability?.routeCache === 'purged' &&
    entry.durability?.workspaceContext === 'persisted'
  );
  const survivorReadbackIndex = evidenceWindowEntries.findIndex((entry) =>
    entry.type === 'route.cache.readback' &&
    entry.serverPhase === 'regained' &&
    entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.survivor &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.survivor.id
  );
  assertJournalCondition(
    deniedRecoveryIndex >= 0 && survivorReadbackIndex > deniedRecoveryIndex,
    'Survivor readback was not correlated with an earlier exact denied-workspace purge.'
  );
  for (const expectation of [
    {
      phase: 'regained',
      routeId: GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.survivor,
      workspaceId: GUIDANCE_CONTRACT_WORKSPACES.survivor.id
    },
    {
      phase: 'readbackEvidence',
      routeId: GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV2,
      workspaceId: GUIDANCE_CONTRACT_WORKSPACES.denied.id
    }
  ]) {
    const matching = currentEntries.filter((entry) =>
      entry.serverPhase === expectation.phase &&
      entry.routeId === expectation.routeId &&
      entry.workspaceId === expectation.workspaceId &&
      entry.outcome === 'readable' &&
      entry.durability?.routeCache === 'present'
    );
    const causes = new Set(matching.map((entry) => entry.cause));
    const launches = new Set(matching.map((entry) => entry.appLaunchId));
    assertJournalCondition(
      causes.has('saved-list-readback') &&
        causes.has('saved-detail-readback') &&
        launches.size === 1 &&
        matching.every(
          (entry) => evidenceWindowEntries.indexOf(entry) > deniedRecoveryIndex
        ),
      `Route cache readback did not prove one-launch list/detail durability for ${expectation.workspaceId}.`
    );
  }
  assertJournalCondition(
    !currentEntries.some((entry) =>
      entry.serverPhase === 'readbackEvidence' &&
      entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1
    ),
    'Regained cache readback accepted the stale pre-denial route variant.'
  );
}

function isSuccessfulGuidanceContractEvidence(event, journal) {
  if (!GUIDANCE_CONTRACT_EVIDENCE_PHASES[event.type]?.has(journal.serverPhase)) {
    return false;
  }
  const workspaceLifecycle = Boolean(
    event.navigationInstanceId &&
    event.routeId &&
    event.workspaceId
  );
  if (event.type === 'navigation.persisted') {
    return workspaceLifecycle &&
      event.authorization.catalog === 'fresh-authorized' &&
      event.authorization.principal === 'matching' &&
      event.outcome === 'persisted' &&
      event.durability.activeNavigation === 'present';
  }
  if (event.type === 'restore.suspended') {
    return workspaceLifecycle &&
      event.authorization.catalog === 'unavailable' &&
      event.authorization.principal === 'matching' &&
      event.outcome === 'suspended' &&
      event.durability.activeNavigation === 'present' &&
      ['not-started', 'stopped', 'unsupported'].includes(event.durability.nativeTracking) &&
      event.durability.runtimePermit === 'none';
  }
  if (event.type === 'restore.ready') {
    return workspaceLifecycle &&
      event.authorization.catalog === 'fresh-authorized' &&
      event.authorization.principal === 'matching' &&
      event.outcome === 'ready' &&
      event.durability.activeNavigation === 'present';
  }
  if (event.type === 'workspace.recovery.settled') {
    return Boolean(
      event.workspaceId &&
      event.unavailableWorkspaceIds.includes(event.workspaceId) &&
      event.authorization.catalog === 'fresh-denied' &&
      event.authorization.principal === 'matching' &&
      event.outcome === 'persisted' &&
      event.durability.routeCache === 'purged' &&
      event.durability.workspaceContext === 'persisted'
    );
  }
  if (event.type === 'route.cache.readback') {
    return Boolean(
      event.routeId &&
      event.workspaceId &&
      event.authorization.catalog === 'unavailable' &&
      event.authorization.principal === 'matching' &&
      event.outcome === 'readable' &&
      event.durability.routeCache === 'present'
    );
  }
  if (event.type === 'navigation.cleanup.settled') {
    return workspaceLifecycle &&
      event.authorization.catalog === 'not-checked' &&
      event.authorization.principal === 'matching' &&
      event.outcome === 'cleared' &&
      event.durability.activeNavigation === 'revoked' &&
      event.durability.persistedPermit === 'revoked';
  }
  return event.type === 'tracking.stop.settled' &&
    workspaceLifecycle &&
    event.authorization.catalog === 'not-checked' &&
    event.authorization.principal === 'matching' &&
    event.outcome === 'off' &&
    ['not-started', 'stopped', 'unsupported'].includes(event.durability.nativeTracking) &&
    event.durability.runtimePermit === 'none' &&
    event.durability.persistedPermit === 'revoked';
}

function normalizeControlSnapshot(value) {
  return {
    mode: normalizeMode(value?.mode),
    phase: normalizePhase(value?.phase)
  };
}

function normalizeEvidenceString(value, maxLength) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length <= maxLength && /^[A-Za-z0-9._:/ -]*$/.test(normalized)
    ? normalized
    : '';
}

function normalizeOptionalEvidenceString(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = normalizeEvidenceString(value, 160);
  return normalized || undefined;
}

function normalizeEvidenceRecord(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(fields).flatMap(([field, allowed]) =>
    allowed.includes(value[field]) ? [[field, value[field]]] : []
  ));
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

function readJsonLines(file) {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function parseCliArguments(argumentsList) {
  const parsed = {
    controlFile: '',
    evidenceLogFile: '',
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
    } else if (argument === '--evidence-log') {
      parsed.evidenceLogFile = String(argumentsList[index + 1] || '').trim();
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
  if (!parsed.evidenceLogFile) {
    throw new Error('Guidance contract API requires --evidence-log.');
  }
  return parsed;
}

async function runCli() {
  const { controlFile, evidenceLogFile, port, requestLogFile } = parseCliArguments(
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
  const appendEvidence = createGuidanceContractEvidenceJournal({ evidenceLogFile });
  const server = await startGuidanceContractApi({
    evidenceLog: appendEvidence,
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
