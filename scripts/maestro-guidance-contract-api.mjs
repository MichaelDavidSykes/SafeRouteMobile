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
  principalValidationUnavailable: 'principal-validation-unavailable',
  wrongPrincipal: 'active-b'
});
export const CONNECTIVITY_CONTRACT_REACHABILITY_PATH =
  '/__connectivity_contract__/reachability';
export const CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH =
  '/__connectivity_contract__/storage-fault';
export const CONNECTIVITY_CONTRACT_STORAGE_FAULT_OPERATIONS = Object.freeze([
  'auth-session-tombstone-set',
  'workspace-handoff-target-selection-set'
]);
export const CONNECTIVITY_CONTRACT_STATUSES = Object.freeze({
  checking: 'checking',
  offline: 'offline',
  online: 'online'
});
export const CONNECTIVITY_CONTRACT_PHASES = Object.freeze({
  allowOnline: 'connectivityAllowOnline',
  allowReconnectChecking: 'connectivityAllowReconnectChecking',
  coldChecking: 'connectivityColdChecking',
  disabledSyncOffline: 'connectivityDisabledSyncOffline',
  inactiveRelaunch: 'connectivityInactiveRelaunch',
  inactiveSeed: 'connectivityInactiveSeed',
  inactiveSession: 'connectivityInactiveSession',
  offline: 'connectivityOffline',
  offlineRelaunch: 'connectivityOfflineRelaunch',
  online: 'connectivityOnline',
  reconnectChecking: 'connectivityReconnectChecking',
  removalRelaunch: 'connectivityRemovalRelaunch',
  resaveOffline: 'connectivityResaveOffline',
  resaveOnline: 'connectivityResaveOnline',
  resaveReconnectChecking: 'connectivityResaveReconnectChecking',
  seed: 'connectivitySeed'
});
export const OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES = Object.freeze({
  finalRelaunch: 'calendarAuthFinalRelaunch',
  inactiveFailure: 'calendarAuthInactiveFailure',
  relaunchFailure: 'calendarAuthRelaunchFailure'
});
export const OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES = Object.freeze({
  change: 'calendarPrincipalChange',
  relaunch: 'calendarPrincipalChangeRelaunch',
  validationOfflineRelaunch: 'calendarPrincipalValidationOfflineRelaunch',
  validationUnavailable: 'calendarPrincipalValidationUnavailable'
});
export const OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES = Object.freeze({
  denial: 'calendarWorkspaceDenial',
  relaunch: 'calendarWorkspaceDenialRelaunch'
});
export const CONNECTIVITY_CONTRACT_HOLD_POLL_MS = 50;
export const CONNECTIVITY_CONTRACT_HOLD_TIMEOUT_MS = 60_000;

export const WORKSPACE_CATALOG_RECOVERY_PHASES = Object.freeze({
  foregroundLoss: 'catalogForegroundLoss',
  freshSuccess: 'catalogFreshSuccess',
  initialFailure: 'catalogInitialFailure',
  journeyBackground: 'catalogJourneyBackground',
  journeyForegroundFailure: 'catalogJourneyForegroundFailure',
  journeyForegroundFailureEnd: 'catalogJourneyForegroundFailureEnd',
  journeyEndedRelaunch: 'catalogJourneyEndedRelaunch',
  journeyEndedRetrySuccess: 'catalogJourneyEndedRetrySuccess',
  journeyEndedRouteReload: 'catalogJourneyEndedRouteReload',
  journeyEndedRestart: 'catalogJourneyEndedRestart',
  journeyRestart: 'catalogJourneyRestart',
  journeyRouteBackground: 'catalogJourneyRouteBackground',
  journeyRoutePrepare: 'catalogJourneyRoutePrepare',
  journeyRestoreEnd: 'catalogJourneyRestoreEnd',
  journeyRestoreFailure: 'catalogJourneyRestoreFailure',
  journeyRestoreReload: 'catalogJourneyRestoreReload',
  journeyStart: 'catalogJourneyStart',
  journeyStartGate: 'catalogJourneyStartGate',
  mapRetryFailure: 'catalogMapRetryFailure',
  operationsRetryFailure: 'catalogOperationsRetryFailure',
  savedRetryFailure: 'catalogSavedRetryFailure',
  seed: 'catalogSeed'
});
export const WORKSPACE_CATALOG_RETRY_DELAY_MS = 6_000;
export const WORKSPACE_CATALOG_SUCCESS_DELAY_MS = 6_000;
export const WORKSPACE_CATALOG_HOLD_POLL_MS = 50;
export const WORKSPACE_CATALOG_HOLD_TIMEOUT_MS = 60_000;

export const GUIDANCE_START_BOUNDARY_PATH = '/__guidance_contract__/boundary';
export const GUIDANCE_CONTRACT_EVIDENCE_PATH = '/__guidance_contract__/evidence';
export const GUIDANCE_CONTRACT_EVIDENCE_TYPES = Object.freeze([
  'navigation.persisted',
  'restore.suspended',
  'restore.ready',
  'workspace.recovery.settled',
  'route.cache.readback',
  'navigation.cleanup.settled',
  'tracking.stop.settled',
  'navigation.absence.readback',
  'navigation.prestart.readback',
  'offline.calendar.cleanup',
  'offline.calendar.principal-lifecycle',
  'offline.calendar.workspace-lifecycle'
]);
const GUIDANCE_CONTRACT_EVIDENCE_PHASES = Object.freeze({
  'navigation.persisted': new Set([
    'connectivityInactiveSeed',
    'connectivitySeed',
    'catalogJourneyStart',
    'catalogJourneyRestart',
    'catalogJourneyEndedRestart',
    'publicStart',
    'workspaceStart',
    'workspaceReconnect',
    'workspaceReseedStart',
    'denialSeedStart'
  ]),
  'restore.suspended': new Set([
    'connectivityOffline',
    'catalogJourneyRestoreFailure',
    'workspaceOffline',
    'workspaceReconnect'
  ]),
  'restore.ready': new Set(['workspacePrepare', 'workspaceReconnect']),
  'workspace.recovery.settled': new Set([
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
    'catalogForegroundLoss',
    'deniedStart',
    'workspaceReconnect',
    'wrongPrincipal',
    'denied',
    'regained'
  ]),
  'route.cache.readback': new Set([
    'connectivityDisabledSyncOffline',
    'connectivityOffline',
    'connectivityOfflineRelaunch',
    'connectivityRemovalRelaunch',
    'connectivityResaveOffline',
    'regained',
    'readbackEvidence',
  ]),
  'navigation.cleanup.settled': new Set([
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
    'connectivityInactiveSession',
    'connectivityOffline',
    'catalogForegroundLoss',
    'catalogJourneyForegroundFailureEnd',
    'catalogJourneyRestoreEnd',
    'wrongPrincipalStart',
    'deniedStart',
    'wrongPrincipal',
    'denied'
  ]),
  'tracking.stop.settled': new Set([
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
    'connectivityInactiveSession',
    'connectivityOffline',
    'catalogForegroundLoss',
    'catalogJourneyForegroundFailureEnd',
    'catalogJourneyRestoreEnd',
    'wrongPrincipalStart',
    'deniedStart',
    'wrongPrincipal',
    'denied'
  ]),
  'navigation.absence.readback': new Set([
    'catalogJourneyEndedRelaunch',
    'connectivityDisabledSyncOffline',
    'connectivityInactiveRelaunch',
    'connectivityOfflineRelaunch',
    'connectivityRemovalRelaunch',
    'connectivityResaveOffline',
  ]),
  'navigation.prestart.readback': new Set(['catalogJourneyEndedRouteReload']),
  'offline.calendar.cleanup': new Set([
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure
  ]),
  'offline.calendar.principal-lifecycle': new Set([
    CONNECTIVITY_CONTRACT_PHASES.seed,
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable,
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch,
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change,
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch
  ]),
  'offline.calendar.workspace-lifecycle': new Set([
    CONNECTIVITY_CONTRACT_PHASES.seed,
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch
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
export const GUIDANCE_CONTRACT_TRIP_IDS = Object.freeze({
  denied: '66e1b2c3d4e5f60718293e40',
  survivor: '66e1b2c3d4e5f60718293e41'
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

export function createGuidanceContractOperations(
  workspace = 'denied',
  nowMs = Date.now()
) {
  const survivor = workspace === 'survivor';
  const routeWorkspace = survivor
    ? GUIDANCE_CONTRACT_WORKSPACES.survivor
    : GUIDANCE_CONTRACT_WORKSPACES.denied;
  const routeId = survivor
    ? GUIDANCE_CONTRACT_ROUTE_IDS.survivor
    : GUIDANCE_CONTRACT_ROUTE_IDS.denied;
  const tripId = survivor
    ? GUIDANCE_CONTRACT_TRIP_IDS.survivor
    : GUIDANCE_CONTRACT_TRIP_IDS.denied;
  const movementDate = new Date(
    nowMs + (survivor ? 3 : 2) * 24 * 60 * 60 * 1000
  ).toISOString();
  return {
    client_id: routeWorkspace.id,
    people: [],
    trips: [
      {
        client_id: routeWorkspace.id,
        created_at: new Date(nowMs).toISOString(),
        destination: survivor ? 'Canary Wharf' : 'London City Airport',
        duration_minutes: survivor ? 60 : 45,
        id: tripId,
        is_active: true,
        lead_vehicle_id: null,
        movement_date: movementDate,
        name: survivor
          ? 'Support continuity movement'
          : 'Guidance airport movement',
        origin: survivor ? 'Paddington' : 'Mayfair',
        person_ids: [],
        route_assignments: [
          {
            duration_minutes: survivor ? 60 : 45,
            movement_date: movementDate,
            person_ids: [],
            route_id: routeId,
            status: 'ready',
            vehicle_ids: []
          }
        ],
        route_ids: [routeId],
        status: 'ready',
        updated_at: '2026-07-18T08:30:00.000Z',
        vehicle_ids: []
      }
    ],
    updated_at: '2026-07-18T08:30:00.000Z',
    vehicles: []
  };
}

export function createGuidanceContractHandler({
  createRequestId = randomUUID,
  evidenceLog = () => 'recorded',
  now = () => Date.now(),
  readControl,
  readMode = () => GUIDANCE_CONTRACT_MODES.offline,
  readPhase = () => 'unassigned',
  requestLog = () => undefined,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
}) {
  const claimedStorageFaults = new Set();
  return async (request, response) => {
    const {
      connectivity,
      connectivitySequence,
      mode,
      phase,
      sourceRevision,
      storageFaults
    } = normalizeControlSnapshot(
      readControl ? readControl() : { mode: readMode(), phase: readPhase() }
    );
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const requestSourceRevision = String(
      url.searchParams.get('source_revision') || ''
    ).trim().toLowerCase();
    const requestId = createRequestId();
    const startedAtMs = now();
    const requestEntry = requestLog({
      authorizationClass: classifyAuthorization(request.headers.authorization),
      authorized: hasExpectedBearerAuthorization(request.headers.authorization),
      connectivity,
      connectivitySequence,
      event: 'request',
      method: request.method || 'GET',
      mode,
      path: url.pathname,
      phase,
      requestId,
      requestSourceRevision,
      search: url.search,
      sourceRevision
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
        connectivity,
        connectivitySequence,
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
        requestSourceRevision,
        search: url.search,
        semanticOutcome,
        sourceRevision,
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

    if (
      request.method === 'HEAD' &&
      url.pathname === CONNECTIVITY_CONTRACT_REACHABILITY_PATH
    ) {
      if (
        request.headers['x-saferoute-connectivity-contract'] !== '1' ||
        request.headers['x-saferoute-source-revision'] !==
          requestSourceRevision ||
        !/^[0-9a-f]{40}$/.test(requestSourceRevision) ||
        requestSourceRevision !== sourceRevision
      ) {
        sendApiError(
          response,
          403,
          'Exact connectivity contract source headers are required.',
          {},
          'connectivity-header-rejected'
        );
        return;
      }
      const settledConnectivity = connectivity === CONNECTIVITY_CONTRACT_STATUSES.checking
        ? await waitForConnectivityRelease({
            connectivitySequence,
            expectedSourceRevision: sourceRevision,
            readControl,
            sleep
          })
        : connectivity;
      if (!settledConnectivity) {
        sendEmpty(response, 504, 'connectivity-hold-timeout');
        return;
      }
      sendEmpty(
        response,
        settledConnectivity === CONNECTIVITY_CONTRACT_STATUSES.online
          ? 204
          : 503,
        `connectivity-${settledConnectivity}`
      );
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname.startsWith(`${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}/`)
    ) {
      const operation = url.pathname.slice(
        CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH.length + 1
      );
      if (
        request.headers['x-saferoute-connectivity-contract'] !== '1' ||
        request.headers['x-saferoute-source-revision'] !==
          requestSourceRevision ||
        request.headers.authorization ||
        (
          request.headers['content-length'] &&
          request.headers['content-length'] !== '0'
        ) ||
        request.headers['transfer-encoding'] ||
        !/^[0-9a-f]{40}$/.test(requestSourceRevision) ||
        requestSourceRevision !== sourceRevision ||
        url.search !== `?source_revision=${sourceRevision}` ||
        !CONNECTIVITY_CONTRACT_STORAGE_FAULT_OPERATIONS.includes(operation)
      ) {
        sendEmpty(response, 403, 'storage-fault-source-rejected');
        return;
      }
      const armedFault = storageFaults.find(
        (fault) => fault.operation === operation
      );
      const claimKey = armedFault
        ? [
            sourceRevision,
            connectivitySequence,
            armedFault.id,
            operation
          ].join(':')
        : '';
      if (armedFault && !claimedStorageFaults.has(claimKey)) {
        claimedStorageFaults.add(claimKey);
        sendEmpty(response, 503, 'storage-fault-injected');
        return;
      }
      sendEmpty(response, 204, 'storage-fault-not-armed');
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
      (
        url.pathname === '/api/v1/intel/map/area-risk' ||
        url.pathname === '/api/v1/intel/map/area-risk/research'
      ) &&
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
      if (
        phase === CONNECTIVITY_CONTRACT_PHASES.inactiveSession ||
        phase === OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure
      ) {
        sendInactiveAccountError(response);
        return;
      }
      if (mode === GUIDANCE_CONTRACT_MODES.principalValidationUnavailable) {
        sendApiError(
          response,
          503,
          'Saved-session verification is temporarily unavailable.',
          {},
          'principal-validation-unavailable'
        );
        return;
      }
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
      const retryFailure = [
        WORKSPACE_CATALOG_RECOVERY_PHASES.mapRetryFailure,
        WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure,
        WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure
      ].includes(phase);
      const restoreFailure =
        phase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure;
      const foregroundFailure =
        !requestedWorkspaceId &&
        phase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure;
      const endedJourneyRelaunchFailure =
        !requestedWorkspaceId &&
        phase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRelaunch;
      if (foregroundFailure) {
        const released = await waitForWorkspaceCatalogRelease({
          phase,
          readControl,
          sleep
        });
        if (!released) {
          sendApiError(
            response,
            504,
            'Workspace catalog hold timed out.',
            {},
            'catalog-hold-timeout'
          );
          return;
        }
        sendApiError(
          response,
          503,
          'Workspace catalog verification is temporarily unavailable.',
          {},
          'catalog-foreground-unavailable'
        );
        return;
      }
      const catalogFailure = !requestedWorkspaceId && (
        phase === WORKSPACE_CATALOG_RECOVERY_PHASES.initialFailure ||
        endedJourneyRelaunchFailure ||
        retryFailure ||
        restoreFailure
      );
      if (catalogFailure) {
        if (retryFailure) {
          await sleep(WORKSPACE_CATALOG_RETRY_DELAY_MS);
        }
        sendApiError(
          response,
          503,
          'Workspace catalog verification is temporarily unavailable.',
          {},
          retryFailure
            ? 'catalog-retry-unavailable'
            : endedJourneyRelaunchFailure
              ? 'catalog-ended-relaunch-unavailable'
            : restoreFailure
              ? 'catalog-restore-unavailable'
              : 'catalog-initial-unavailable'
        );
        return;
      }
      if (
        !requestedWorkspaceId &&
        [
          WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess,
          WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRetrySuccess
        ].includes(phase)
      ) {
        await sleep(WORKSPACE_CATALOG_SUCCESS_DELAY_MS);
      }
      if (
        !requestedWorkspaceId &&
        [
          WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss,
          WORKSPACE_CATALOG_RECOVERY_PHASES.journeyEndedRestart,
          WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd,
          WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate
        ].includes(phase)
      ) {
        const released = await waitForWorkspaceCatalogRelease({
          phase,
          readControl,
          sleep
        });
        if (!released) {
          sendApiError(
            response,
            504,
            'Workspace catalog hold timed out.',
            {},
            'catalog-hold-timeout'
          );
          return;
        }
      }
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

    const operationsMatch = url.pathname.match(
      /^\/api\/v1\/mobile\/safe-route\/operations\/client\/([0-9a-f]{24})$/i
    );
    if (request.method === 'GET' && operationsMatch) {
      const requestedWorkspaceId = operationsMatch[1];
      const requestedWorkspace = Object.values(GUIDANCE_CONTRACT_WORKSPACES)
        .find((workspace) => workspace.id === requestedWorkspaceId);
      if (!requestedWorkspace) {
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
      sendApiSuccess(response, {
        data: createGuidanceContractOperations(
          requestedWorkspaceId === GUIDANCE_CONTRACT_WORKSPACES.survivor.id
            ? 'survivor'
            : 'denied'
        ),
        message: 'SafeRoute operations loaded.'
      }, 'operations-active');
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
      if (
        url.searchParams.get('refresh') !== 'false' ||
        url.searchParams.get('read_only') !== 'true'
      ) {
        sendApiError(
          response,
          400,
          'Area-risk coverage reads must be strict and non-mutating.'
        );
        return;
      }
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
      const bbox = String(url.searchParams.get('bbox') || '').split(',').map(Number);
      const bounds = bbox.length === 4 && bbox.every(Number.isFinite)
        ? {
            minLat: bbox[0],
            minLon: bbox[1],
            maxLat: bbox[2],
            maxLon: bbox[3]
          }
        : undefined;
      sendApiSuccess(response, {
        data: {
          bounds,
          fetchedAt: new Date(0).toISOString(),
          hasMore: false,
          items: [],
          message: 'No deterministic risk signals in this viewport.',
          nextCursor: null,
          providerStatus: 'empty',
          seedStatus: requestedWorkspaceId ? 'completed' : 'not-requested'
        },
        message: 'Risk viewport loaded.'
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/intel/map/area-risk/research') {
      const body = await readJsonBody(request);
      const requestedWorkspaceId = String(body?.client_id || '').trim();
      const authenticated = hasExpectedBearerAuthorization(request.headers.authorization);
      if (!authenticated) {
        sendApiError(response, 401, 'A contract Bearer token is required.', {
          'WWW-Authenticate': 'Bearer'
        });
        return;
      }
      if (!requestedWorkspaceId) {
        sendApiError(response, 422, 'client_id is required.');
        return;
      }
      if (!isValidAreaRiskResearchPayload(body)) {
        sendApiError(response, 422, 'Area-risk research payload is invalid.');
        return;
      }
      if (
        !Object.values(GUIDANCE_CONTRACT_WORKSPACES)
          .some((workspace) => workspace.id === requestedWorkspaceId)
      ) {
        sendApiError(response, 404, 'Workspace was not found.');
        return;
      }
      if (
        requestedWorkspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
        mode === GUIDANCE_CONTRACT_MODES.denied
      ) {
        sendApiError(response, 403, 'Workspace membership is unavailable.');
        return;
      }
      sendApiSuccess(response, {
        data: {
          accepted: true,
          bounds: {
            minLat: body.bounds.min_lat,
            maxLat: body.bounds.max_lat,
            minLon: body.bounds.min_lon,
            maxLon: body.bounds.max_lon
          },
          coalesced: false,
          coverageStatus: 'current-empty',
          pending: false,
          queued: false,
          retryAfterSeconds: null,
          seedId: 'guidance-contract-area-risk-seed',
          seedStatus: 'completed',
          status: 'current-empty'
        },
        message: 'Area-risk research request evaluated successfully.'
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
  requestLog,
  sleep
}) {
  const server = createServer(createGuidanceContractHandler({
    createRequestId,
    evidenceLog,
    now,
    readControl,
    readMode,
    readPhase,
    requestLog,
    sleep
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
      authSession: ['present', 'signed-out', 'unavailable', 'unknown'],
      nativeTracking: ['active', 'not-started', 'stopped', 'unknown', 'unsupported'],
      offlineCalendarCleanup: ['absent', 'durable', 'nondurable', 'unreadable', 'unknown'],
      offlineCalendarPayload: ['absent', 'present', 'unknown'],
      offlineCalendarPreference: ['cleanup-pending', 'disabled', 'enabled', 'unavailable', 'unverified', 'unknown'],
      offlineCalendarSlot: ['empty', 'payload', 'principal-revoked', 'unreadable', 'unknown', 'workspace-revoked'],
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

export function assertOfflineCalendarAuthCleanupEvidence(entries, {
  expectedSourceRevision,
  minimumOccurredAtMs = 0
}) {
  const contractPhases = new Set([
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch
  ]);
  const relevant = Array.isArray(entries) ? entries.filter((entry) =>
    entry.type === 'offline.calendar.cleanup' &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs >= minimumOccurredAtMs &&
    contractPhases.has(entry.serverPhase)
  ) : [];
  const initialPendingMatches = relevant.filter((entry) =>
    entry.serverPhase ===
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure &&
    entry.cause === 'inactive-account' &&
    entry.outcome === 'retry-required' &&
    entry.durability.offlineCalendarPreference === 'disabled' &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const relaunchPendingMatches = relevant.filter((entry) =>
    entry.serverPhase ===
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure &&
    entry.cause === 'startup-terminal-replay' &&
    entry.outcome === 'retry-required' &&
    entry.durability.offlineCalendarPreference === 'disabled' &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const settledMatches = relevant.filter((entry) =>
    entry.serverPhase ===
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure &&
    entry.cause === 'cleanup-retry' &&
    entry.outcome === 'clean' &&
    entry.durability.offlineCalendarPreference === 'disabled' &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const finalAbsenceMatches = relevant.filter((entry) =>
    entry.serverPhase ===
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch &&
    entry.cause === 'signed-out-boot' &&
    entry.outcome === 'clean' &&
    entry.durability.offlineCalendarPreference === 'disabled' &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const [initialPending] = initialPendingMatches;
  const [relaunchPending] = relaunchPendingMatches;
  const [settled] = settledMatches;
  const [finalAbsence] = finalAbsenceMatches;
  assertJournalCondition(
    relevant.length === 4 &&
      initialPendingMatches.length === 1 &&
      relaunchPendingMatches.length === 1 &&
      settledMatches.length === 1 &&
      finalAbsenceMatches.length === 1 &&
      initialPending &&
      relaunchPending &&
      settled &&
      finalAbsence &&
      initialPending.sequence < relaunchPending.sequence &&
      relaunchPending.sequence < settled.sequence &&
      settled.sequence < finalAbsence.sequence &&
      initialPending.appLaunchId !== relaunchPending.appLaunchId &&
      relaunchPending.appLaunchId === settled.appLaunchId &&
      settled.appLaunchId !== finalAbsence.appLaunchId,
    'Offline Calendar auth cleanup evidence did not prove pending, relaunched Retry, and final absence across distinct launches.'
  );
}

export function assertOfflineCalendarWorkspaceRevocationEvidence(entries, {
  expectedSourceRevision,
  minimumOccurredAtMs = 0
}) {
  const relevant = Array.isArray(entries) ? entries.filter((entry) =>
    entry.type === 'offline.calendar.workspace-lifecycle' &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs >= minimumOccurredAtMs &&
    [
      OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
      OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch
    ].includes(entry.serverPhase)
  ) : [];
  const seed = (Array.isArray(entries) ? entries : []).filter((entry) =>
    entry.type === 'offline.calendar.workspace-lifecycle' &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs >= minimumOccurredAtMs &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.seed &&
    entry.cause === 'workspace-denial-seed' &&
    entry.authorization?.catalog === 'fresh-authorized' &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const recovery = relevant.filter((entry) =>
    entry.serverPhase === OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial &&
    entry.cause === 'workspace-denial' &&
    entry.authorization?.catalog === 'fresh-denied' &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const relaunch = relevant.filter((entry) =>
    entry.serverPhase === OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch &&
    entry.cause === 'workspace-denial-relaunch' &&
    entry.authorization?.catalog === 'not-checked' &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  assertJournalCondition(
    seed.length === 1 &&
      relevant.length === 2 &&
      recovery.length === 1 &&
      relaunch.length === 1 &&
      seed[0].appLaunchId !== recovery[0].appLaunchId &&
      recovery[0].appLaunchId !== relaunch[0].appLaunchId &&
      seed[0].receivedAtMs < recovery[0].receivedAtMs &&
      recovery[0].receivedAtMs < relaunch[0].receivedAtMs,
    'Offline Calendar workspace-denial evidence did not prove a real seed, one persisted revocation, and one distinct-process absence readback.'
  );
}

export function assertOfflineCalendarPrincipalChangeEvidence(entries, {
  expectedSourceRevision,
  minimumOccurredAtMs = 0
}) {
  const relevant = Array.isArray(entries) ? entries.filter((entry) =>
    entry.type === 'offline.calendar.principal-lifecycle' &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs >= minimumOccurredAtMs
  ) : [];
  const one = (phase, cause) => relevant.filter((entry) =>
    entry.serverPhase === phase &&
    entry.cause === cause &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const seed = one(
    CONNECTIVITY_CONTRACT_PHASES.seed,
    'principal-change-seed'
  );
  const changed = one(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change,
    'principal-change'
  );
  const validationUnavailable = one(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable,
    'principal-change-validation-unavailable'
  );
  const validationOfflineRelaunch = one(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch,
    'principal-change-validation-offline-relaunch'
  );
  const revoked = one(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
    'principal-change-relaunch-revoked'
  );
  const removed = one(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
    'principal-change-relaunch'
  );
  assertJournalCondition(
    relevant.length === 6 &&
      seed.length === 1 &&
      validationUnavailable.length === 1 &&
      validationOfflineRelaunch.length === 1 &&
      changed.length === 1 &&
      revoked.length === 1 &&
      removed.length === 1 &&
      seed[0].durability?.workspaceContext === 'persisted' &&
      seed[0].durability?.routeCache === 'present' &&
      seed[0].authorization?.principal === 'matching' &&
      validationUnavailable[0].durability?.workspaceContext === 'persisted' &&
      validationUnavailable[0].durability?.routeCache === 'present' &&
      validationUnavailable[0].authorization?.principal === 'unknown' &&
      validationOfflineRelaunch[0].durability?.workspaceContext === 'persisted' &&
      validationOfflineRelaunch[0].durability?.routeCache === 'present' &&
      validationOfflineRelaunch[0].authorization?.principal === 'unknown' &&
      changed[0].durability?.workspaceContext === 'revoked' &&
      changed[0].durability?.routeCache === 'purged' &&
      changed[0].authorization?.principal === 'mismatched' &&
      revoked[0].durability?.workspaceContext === 'revoked' &&
      revoked[0].durability?.routeCache === 'purged' &&
      revoked[0].authorization?.principal === 'none' &&
      removed[0].durability?.workspaceContext === 'revoked' &&
      removed[0].durability?.routeCache === 'purged' &&
      removed[0].authorization?.principal === 'none' &&
      seed[0].appLaunchId !== validationUnavailable[0].appLaunchId &&
      validationUnavailable[0].appLaunchId !==
        validationOfflineRelaunch[0].appLaunchId &&
      validationOfflineRelaunch[0].appLaunchId !== changed[0].appLaunchId &&
      changed[0].appLaunchId !== revoked[0].appLaunchId &&
      revoked[0].appLaunchId === removed[0].appLaunchId &&
      seed[0].receivedAtMs < validationUnavailable[0].receivedAtMs &&
      validationUnavailable[0].receivedAtMs <
        validationOfflineRelaunch[0].receivedAtMs &&
      validationOfflineRelaunch[0].receivedAtMs < changed[0].receivedAtMs &&
      changed[0].receivedAtMs < revoked[0].receivedAtMs &&
      revoked[0].receivedAtMs < removed[0].receivedAtMs,
    'Offline Calendar principal-change evidence did not prove exact seeded caches, retained quarantine through two launches, terminal workspace/route revocation, and distinct-process revoked-to-empty readback.'
  );
}

export function assertOfflineCalendarProtectedCacheSeedTraffic(entries) {
  const seedRequests = Array.isArray(entries) ? entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === CONNECTIVITY_CONTRACT_PHASES.seed &&
    entry.path.startsWith('/api/')
  ) : [];
  const guidanceWorkspaceId = GUIDANCE_CONTRACT_WORKSPACES.denied.id;
  const supportWorkspaceId = GUIDANCE_CONTRACT_WORKSPACES.survivor.id;
  const guidanceRouteId = GUIDANCE_CONTRACT_ROUTE_IDS.denied;
  const routesPath = '/api/v1/mobile/safe-route/routes';
  const guidanceOperationsPath =
    `/api/v1/mobile/safe-route/operations/client/${guidanceWorkspaceId}`;
  const supportOperationsPath =
    `/api/v1/mobile/safe-route/operations/client/${supportWorkspaceId}`;
  const exactBearerGet = (entry, path, search = '') =>
    entry.method === 'GET' &&
    entry.path === path &&
    entry.search === search &&
    entry.authorized === true &&
    entry.authorizationClass === 'expected-bearer';
  const validAreaRisk = (entry) => {
    if (entry.method !== 'GET' || entry.path !== '/api/v1/intel/map/area-risk') {
      return false;
    }
    const params = new URLSearchParams(String(entry.search || '').replace(/^\?/, ''));
    const allowedKeys = new Set([
      '_read_nonce',
      'bbox',
      'client_id',
      'countries',
      'cursor',
      'max_records',
      'page_size',
      'read_only',
      'refresh',
      'scope',
      'zoom'
    ]);
    const actualKeys = Array.from(params.keys());
    const clientId = String(params.get('client_id') || '').trim();
    const bbox = String(params.get('bbox') || '').split(',').map(Number);
    const authenticated =
      entry.authorized === true &&
      entry.authorizationClass === 'expected-bearer';
    return (
      actualKeys.length === new Set(actualKeys).size &&
      actualKeys.every((key) => allowedKeys.has(key)) &&
      params.get('refresh') === 'false' &&
      params.get('read_only') === 'true' &&
      Number.isInteger(Number(params.get('max_records'))) &&
      Number(params.get('max_records')) > 0 &&
      Number.isInteger(Number(params.get('page_size'))) &&
      Number(params.get('page_size')) > 0 &&
      ['detail', 'regional'].includes(params.get('scope')) &&
      Number.isFinite(Number(params.get('zoom'))) &&
      bbox.length === 4 &&
      bbox.every(Number.isFinite) &&
      (
        authenticated
          ? !clientId || clientId === guidanceWorkspaceId
          : entry.authorized === false &&
            entry.authorizationClass === 'none' &&
            !clientId
      )
    );
  };
  const allowedRequest = (entry) =>
    (
      entry.method === 'POST' &&
      entry.path === '/api/v1/auth/mobile-login' &&
      entry.search === '' &&
      entry.authorized === false &&
      entry.authorizationClass === 'none'
    ) ||
    exactBearerGet(entry, '/api/v1/users/me') ||
    exactBearerGet(entry, routesPath) ||
    exactBearerGet(
      entry,
      routesPath,
      `?client_id=${guidanceWorkspaceId}`
    ) ||
    exactBearerGet(
      entry,
      `${routesPath}/${guidanceRouteId}`
    ) ||
    exactBearerGet(entry, guidanceOperationsPath) ||
    exactBearerGet(entry, supportOperationsPath) ||
    validAreaRisk(entry);
  const requestsFor = (path, search = '') => seedRequests.filter((entry) =>
    entry.path === path && entry.search === search
  );
  const loginRequests = requestsFor('/api/v1/auth/mobile-login');
  const principalRequests = requestsFor('/api/v1/users/me');
  const catalogRequests = requestsFor(routesPath);
  const guidanceRouteListRequests = requestsFor(
    routesPath,
    `?client_id=${guidanceWorkspaceId}`
  );
  const guidanceRouteDetailRequests = requestsFor(
    `${routesPath}/${guidanceRouteId}`
  );
  const guidanceOperationsRequests = requestsFor(guidanceOperationsPath);
  const supportOperationsRequests = requestsFor(supportOperationsPath);
  const completionFor = (request, semanticOutcome) => entries.filter((entry) =>
    entry.event === 'completion' &&
    entry.requestId === request?.requestId &&
    entry.completed === true &&
    entry.statusCode === 200 &&
    entry.semanticOutcome === semanticOutcome
  );
  assertJournalCondition(
    seedRequests.length > 0 &&
      seedRequests.every(allowedRequest) &&
      loginRequests.length === 1 &&
      principalRequests.length >= 1 &&
      catalogRequests.length >= 1 &&
      guidanceRouteListRequests.length === 1 &&
      guidanceRouteDetailRequests.length === 1 &&
      guidanceOperationsRequests.length === 2 &&
      supportOperationsRequests.length === 1 &&
      guidanceOperationsRequests.every(
        (request) => completionFor(request, 'operations-active').length === 1
      ) &&
      supportOperationsRequests.every(
        (request) => completionFor(request, 'operations-active').length === 1
      ) &&
      completionFor(
        guidanceRouteListRequests[0],
        'catalog-active'
      ).length === 1 &&
      completionFor(
        guidanceRouteDetailRequests[0],
        'route-detail-active'
      ).length === 1 &&
      guidanceRouteListRequests[0].sequence <
        guidanceRouteDetailRequests[0].sequence &&
      supportOperationsRequests[0].sequence <
        guidanceOperationsRequests.at(-1).sequence,
    'Calendar protected-cache seed traffic was not the exact authorized Guidance route list/detail and Guidance/Support Operations multiset.'
  );
}

export function assertOfflineCalendarPrincipalChangeTraffic(
  entries,
  evidenceEntries = []
) {
  const validationPhase =
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable;
  const validationOfflineRelaunchPhase =
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch;
  const changePhase = OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change;
  const relaunchPhase = OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch;
  const phaseProductRequests = (phase) => entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === phase &&
    entry.path.startsWith('/api/')
  );
  const completionFor = (request) => entries.filter((entry) =>
    entry.event === 'completion' &&
    entry.requestId === request?.requestId
  );
  const validationRequests = phaseProductRequests(validationPhase);
  const validationRequest = validationRequests[0];
  const validationCompletions = completionFor(validationRequest);
  const changeRequests = phaseProductRequests(changePhase);
  const principalRequest = changeRequests[0];
  const principalCompletions = completionFor(principalRequest);
  const terminalEvidence = evidenceEntries.filter((entry) =>
    entry.type === 'offline.calendar.principal-lifecycle' &&
    entry.serverPhase === changePhase &&
    entry.cause === 'principal-change'
  );
  const validationEvidence = evidenceEntries.filter((entry) =>
    entry.type === 'offline.calendar.principal-lifecycle' &&
    entry.serverPhase === validationPhase &&
    entry.cause === 'principal-change-validation-unavailable'
  );
  const validationOfflineEvidence = evidenceEntries.filter((entry) =>
    entry.type === 'offline.calendar.principal-lifecycle' &&
    entry.serverPhase === validationOfflineRelaunchPhase &&
    entry.cause === 'principal-change-validation-offline-relaunch'
  );
  const relaunchProductTraffic = entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === relaunchPhase &&
    entry.path.startsWith('/api/')
  );
  const validationOfflineProductTraffic = phaseProductRequests(
    validationOfflineRelaunchPhase,
  );
  assertJournalCondition(
    validationRequests.length === 1 &&
      validationRequest?.method === 'GET' &&
      validationRequest.path === '/api/v1/users/me' &&
      validationRequest.authorized === true &&
      validationRequest.authorizationClass === 'expected-bearer' &&
      validationCompletions.length === 1 &&
      validationCompletions[0].completed === true &&
      validationCompletions[0].statusCode === 503 &&
      validationCompletions[0].semanticOutcome ===
        'principal-validation-unavailable' &&
      changeRequests.length === 1 &&
      principalRequest?.method === 'GET' &&
      principalRequest.path === '/api/v1/users/me' &&
      principalRequest.authorized === true &&
      principalRequest.authorizationClass === 'expected-bearer' &&
      principalCompletions.length === 1 &&
      principalCompletions[0].completed === true &&
      principalCompletions[0].statusCode === 200 &&
      principalCompletions[0].semanticOutcome === 'principal-b' &&
      validationEvidence.length === 1 &&
      validationOfflineEvidence.length === 1 &&
      terminalEvidence.length === 1 &&
      validationRequest.sequence < validationCompletions[0].sequence &&
      validationCompletions[0].timestampMs <=
        validationEvidence[0].receivedAtMs &&
      validationEvidence[0].receivedAtMs <
        validationOfflineEvidence[0].receivedAtMs &&
      validationOfflineEvidence[0].receivedAtMs <
        principalRequest.timestampMs &&
      validationCompletions[0].sequence < principalRequest.sequence &&
      principalRequest.sequence < principalCompletions[0].sequence &&
      principalCompletions[0].timestampMs <= terminalEvidence[0].receivedAtMs &&
      validationOfflineProductTraffic.length === 0 &&
      relaunchProductTraffic.length === 0,
    'Offline Calendar principal change did not durably quarantine one unavailable validation through a quiet offline relaunch, complete exactly one principal-B validation before terminal evidence, and keep the signed-out relaunch quiet.'
  );
}

export function assertOfflineCalendarWorkspaceDenialTraffic(entries) {
  const denialPhase = OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial;
  const relaunchPhase = OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch;
  const supportOperationsPath =
    `/api/v1/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}`;
  const routesPath = '/api/v1/mobile/safe-route/routes';
  const denialRequests = entries.filter((entry) =>
    entry.phase === denialPhase &&
    entry.event === 'request' &&
    entry.path.startsWith('/api/')
  );
  const denialCompletions = entries.filter((entry) =>
    entry.phase === denialPhase &&
    entry.event === 'completion' &&
    entry.completed === true
  );
  const scopedDenialRequests = denialRequests.filter((entry) =>
    entry.path === routesPath &&
    entry.search.includes(
      `client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
    )
  );
  const scopedDenials = denialCompletions.filter((entry) =>
    entry.path === routesPath &&
    entry.search.includes(
      `client_id=${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
    ) &&
    entry.statusCode === 403 &&
    entry.semanticOutcome === 'api-error-403'
  );
  const principalRequests = denialRequests.filter((entry) =>
    entry.path === '/api/v1/users/me'
  );
  const principal = denialCompletions.filter((entry) =>
    entry.path === '/api/v1/users/me' &&
    entry.statusCode === 200 &&
    entry.semanticOutcome === 'principal-a'
  );
  const catalogRequests = denialRequests.filter((entry) =>
    entry.path === routesPath &&
    entry.search === ''
  );
  const catalog = denialCompletions.filter((entry) =>
    entry.path === routesPath &&
    entry.search === '' &&
    entry.statusCode === 200 &&
    entry.semanticOutcome === 'catalog-survivor'
  );
  const support = denialCompletions.filter((entry) =>
    entry.path === supportOperationsPath &&
    entry.statusCode === 200 &&
    entry.semanticOutcome === 'operations-active'
  );
  const supportRoutes = denialCompletions.filter((entry) =>
    entry.path === routesPath &&
    entry.search.includes(
      `client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}`
    ) &&
    entry.statusCode === 200 &&
    entry.semanticOutcome === 'catalog-survivor'
  );
  const relaunchProductTraffic = entries.filter((entry) =>
    entry.phase === relaunchPhase &&
    entry.event === 'request' &&
    entry.path.startsWith('/api/')
  );
  const catalogCompletionSequence = catalog[0]?.sequence ?? Number.MAX_SAFE_INTEGER;
  const supportTrafficRequests = denialRequests.filter((entry) =>
    entry.path === supportOperationsPath ||
    entry.search.includes(GUIDANCE_CONTRACT_WORKSPACES.survivor.id)
  );
  const allDeniedTraffic = denialRequests.filter((entry) =>
    entry.path ===
      `/api/v1/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.denied.id}` ||
    entry.search.includes(GUIDANCE_CONTRACT_WORKSPACES.denied.id)
  );
  const laterDeniedTraffic = denialRequests.filter((entry) =>
    entry.sequence > catalogCompletionSequence &&
    (
      entry.path ===
        `/api/v1/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.denied.id}` ||
      entry.search.includes(GUIDANCE_CONTRACT_WORKSPACES.denied.id)
    )
  );
  const deniedOperationsTraffic = denialRequests.filter((entry) =>
    entry.path ===
      `/api/v1/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
  );
  const completionFor = (request, completions) =>
    completions.filter((entry) => entry.requestId === request?.requestId);
  const firstDenialRequestSequence = Math.min(
    ...denialRequests.map((entry) => entry.sequence)
  );
  const scopedDenialCompletions = completionFor(
    scopedDenialRequests[0],
    scopedDenials
  );
  const principalCompletions = completionFor(
    principalRequests[0],
    principal
  );
  const catalogCompletions = completionFor(catalogRequests[0], catalog);
  const supportRouteRequests = denialRequests.filter((entry) =>
    entry.path === routesPath &&
    entry.search.includes(
      `client_id=${GUIDANCE_CONTRACT_WORKSPACES.survivor.id}`
    )
  );
  const supportOperationsRequests = denialRequests.filter((entry) =>
    entry.path === supportOperationsPath
  );
  const firstSupportRouteCompletion = completionFor(
    supportRouteRequests[0],
    supportRoutes
  )[0];
  const firstSupportOperationsCompletion = completionFor(
    supportOperationsRequests[0],
    support
  )[0];
  assertJournalCondition(
    scopedDenialRequests.length === 1 &&
      scopedDenialCompletions.length === 1 &&
      scopedDenials.length === 1 &&
      deniedOperationsTraffic.length === 0 &&
      allDeniedTraffic.length === 1 &&
      scopedDenialRequests[0].sequence === firstDenialRequestSequence &&
      denialRequests.every((entry) =>
        entry.authorized === true &&
        entry.authorizationClass === 'expected-bearer'
      ) &&
      principalRequests.length === 1 &&
      principalCompletions.length === 1 &&
      principal.length === 1 &&
      catalogRequests.length === 1 &&
      catalogCompletions.length === 1 &&
      catalog.length === 1 &&
      supportRouteRequests.length >= 1 &&
      supportOperationsRequests.length >= 1 &&
      supportRoutes.length >= 1 &&
      support.length >= 1 &&
      scopedDenialRequests[0].sequence < scopedDenialCompletions[0].sequence &&
      scopedDenialCompletions[0].sequence < principalRequests[0].sequence &&
      principalRequests[0].sequence < principalCompletions[0].sequence &&
      principalCompletions[0].sequence < catalogRequests[0].sequence &&
      catalogRequests[0].sequence < catalogCompletions[0].sequence &&
      catalogCompletions[0].sequence < supportRouteRequests[0].sequence &&
      supportRouteRequests[0].sequence < firstSupportRouteCompletion?.sequence &&
      firstSupportRouteCompletion?.sequence <
        supportOperationsRequests[0].sequence &&
      supportOperationsRequests[0].sequence <
        firstSupportOperationsCompletion?.sequence &&
      supportTrafficRequests.every(
        (entry) => entry.sequence > catalogCompletionSequence
      ) &&
      laterDeniedTraffic.length === 0 &&
      relaunchProductTraffic.length === 0,
    'Offline Calendar workspace denial did not preserve the exact scoped-403, survivor reconciliation, and cold-relaunch traffic boundary.'
  );
}

export function assertOfflineCalendarAuthStorageFaultRequests(entries, {
  expectedSourceRevision
}) {
  const faultPath =
    `${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}/auth-session-tombstone-set`;
  const requestsForPhase = (phase) => entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === phase &&
    entry.path === faultPath
  );
  const completionFor = (request) => entries.find((entry) =>
    entry.event === 'completion' &&
    entry.requestId === request?.requestId
  );
  const exactRequest = (request) =>
    request?.method === 'POST' &&
    request.authorizationClass === 'none' &&
    request.authorized === false &&
    request.requestSourceRevision === expectedSourceRevision &&
    request.sourceRevision === expectedSourceRevision &&
    request.search === `?source_revision=${expectedSourceRevision}`;
  const injectedCompletion = (completion) =>
    completion?.completed === true &&
    completion.statusCode === 503 &&
    completion.semanticOutcome === 'storage-fault-injected';
  const consumedCompletion = (completion) =>
    completion?.completed === true &&
    completion.statusCode === 204 &&
    completion.semanticOutcome === 'storage-fault-not-armed';
  const inactiveRequests = requestsForPhase(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure
  );
  const inactiveCompletion = completionFor(inactiveRequests[0]);
  assertJournalCondition(
    inactiveRequests.length === 1 &&
      exactRequest(inactiveRequests[0]) &&
      injectedCompletion(inactiveCompletion),
    'Offline Calendar inactive cleanup did not issue exactly one injected auth tombstone fault.'
  );
  const relaunchRequests = requestsForPhase(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure
  );
  const relaunchInjected = completionFor(relaunchRequests[0]);
  const relaunchConsumed = completionFor(relaunchRequests[1]);
  assertJournalCondition(
    relaunchRequests.length === 2 &&
      relaunchRequests.every(exactRequest) &&
      injectedCompletion(relaunchInjected) &&
      consumedCompletion(relaunchConsumed) &&
      relaunchRequests[0].sequence < relaunchInjected.sequence &&
      relaunchInjected.sequence < relaunchRequests[1].sequence &&
      relaunchRequests[1].sequence < relaunchConsumed.sequence,
    'Offline Calendar relaunch did not issue exactly one injected fault followed by one consumed Retry.'
  );
}

export function assertOfflineCalendarAuthBoundaryTraffic(entries) {
  const productRequests = (phase) => entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === phase &&
    entry.path.startsWith('/api/')
  );
  const inactiveProductRequests = productRequests(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure
  );
  const principal = inactiveProductRequests[0];
  const principalCompletion = entries.find((entry) =>
    entry.event === 'completion' &&
    entry.requestId === principal?.requestId
  );
  const inactiveFault = entries.find((entry) =>
    entry.event === 'request' &&
    entry.phase === OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure &&
    entry.path ===
      `${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}/auth-session-tombstone-set`
  );
  assertJournalCondition(
    inactiveProductRequests.length === 1 &&
      principal?.method === 'GET' &&
      principal.path === '/api/v1/users/me' &&
      principal.authorized === true &&
      principalCompletion?.completed === true &&
      principalCompletion.statusCode === 400 &&
      principalCompletion.semanticOutcome === 'principal-inactive' &&
      principalCompletion.sequence < inactiveFault?.sequence,
    'Offline Calendar inactive boundary did not complete one principal rejection before auth cleanup.'
  );
  for (const phase of [
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch
  ]) {
    assertJournalCondition(
      productRequests(phase).length === 0,
      `Offline Calendar ${phase} issued product API traffic after the terminal boundary.`
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
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.survivor.id &&
    isSuccessfulGuidanceContractEvidence(entry, { serverPhase: entry.serverPhase })
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
      isSuccessfulGuidanceContractEvidence(entry, { serverPhase: entry.serverPhase })
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

export function isSuccessfulGuidanceContractEvidence(event, journal) {
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
  if (event.type === 'navigation.absence.readback') {
    return !workspaceLifecycle &&
      event.authorization.catalog === 'not-checked' &&
      event.authorization.principal === 'unknown' &&
      event.outcome === 'absent' &&
      event.durability.activeNavigation === 'absent' &&
      ['not-started', 'stopped', 'unsupported'].includes(event.durability.nativeTracking) &&
      event.durability.runtimePermit === 'none';
  }
  if (event.type === 'navigation.prestart.readback') {
    return Boolean(
      !event.navigationInstanceId &&
      event.routeId &&
      event.workspaceId &&
      event.authorization.catalog === 'fresh-authorized' &&
      event.authorization.principal === 'matching' &&
      event.outcome === 'ready' &&
      event.durability.activeNavigation === 'absent' &&
      ['not-started', 'stopped', 'unsupported'].includes(event.durability.nativeTracking) &&
      event.durability.runtimePermit === 'none'
    );
  }
  if (event.type === 'offline.calendar.cleanup') {
    const preferencePreserved = ['disabled', 'enabled'].includes(
      event.durability.offlineCalendarPreference
    );
    if (event.outcome === 'retry-required') {
      return Boolean(
        !workspaceLifecycle &&
        event.navigationInstanceId === null &&
        event.routeId === null &&
        event.workspaceId === null &&
        event.unavailableWorkspaceIds.length === 0 &&
        event.authorization.catalog === 'not-checked' &&
        event.authorization.principal === 'matching' &&
        event.durability.authSession === 'present' &&
        event.durability.offlineCalendarCleanup === 'durable' &&
        event.durability.offlineCalendarPayload === 'present' &&
        event.durability.offlineCalendarSlot === 'payload' &&
        preferencePreserved
      );
    }
    return Boolean(
      event.outcome === 'clean' &&
      !workspaceLifecycle &&
      event.navigationInstanceId === null &&
      event.routeId === null &&
      event.workspaceId === null &&
      event.unavailableWorkspaceIds.length === 0 &&
      event.authorization.catalog === 'not-checked' &&
      event.authorization.principal === 'none' &&
      event.durability.authSession === 'signed-out' &&
      event.durability.offlineCalendarCleanup === 'absent' &&
      event.durability.offlineCalendarPayload === 'absent' &&
      event.durability.offlineCalendarSlot === 'empty' &&
      preferencePreserved
    );
  }
  if (event.type === 'offline.calendar.principal-lifecycle') {
    const common =
      !workspaceLifecycle &&
      event.navigationInstanceId === null &&
      event.routeId === GUIDANCE_CONTRACT_ROUTE_IDS.denied &&
      event.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
      event.unavailableWorkspaceIds.length === 0 &&
      event.durability.offlineCalendarCleanup === 'absent' &&
      event.durability.offlineCalendarPreference === 'disabled';
    if (event.cause === 'principal-change-seed') {
      return Boolean(
        common &&
        event.authorization.catalog === 'fresh-authorized' &&
        event.authorization.principal === 'matching' &&
        event.outcome === 'seeded' &&
        event.durability.authSession === 'present' &&
        event.durability.offlineCalendarPayload === 'present' &&
        event.durability.offlineCalendarSlot === 'payload'
      );
    }
    const quarantined =
      event.cause === 'principal-change-validation-unavailable' ||
      event.cause === 'principal-change-validation-offline-relaunch';
    if (quarantined) {
      return Boolean(
        common &&
        event.authorization.catalog === 'not-checked' &&
        event.authorization.principal === 'unknown' &&
        event.outcome === 'quarantined' &&
        event.durability.authSession === 'present' &&
        event.durability.offlineCalendarPayload === 'present' &&
        event.durability.offlineCalendarSlot === 'payload' &&
        event.durability.workspaceContext === 'persisted' &&
        event.durability.routeCache === 'present'
      );
    }
    const relaunch =
      event.cause === 'principal-change-relaunch' ||
      event.cause === 'principal-change-relaunch-revoked';
    return Boolean(
      common &&
      event.authorization.catalog === 'not-checked' &&
      event.authorization.principal ===
        (event.cause === 'principal-change' ? 'mismatched' : 'none') &&
      event.outcome === 'clean' &&
      event.durability.authSession === 'signed-out' &&
      event.durability.offlineCalendarPayload === 'absent' &&
      event.durability.offlineCalendarSlot ===
        (event.cause === 'principal-change-relaunch'
          ? 'empty'
          : 'principal-revoked') &&
      (event.cause === 'principal-change' || relaunch)
    );
  }
  if (event.type === 'offline.calendar.workspace-lifecycle') {
    if (event.cause === 'workspace-denial-seed') {
      return Boolean(
        !workspaceLifecycle &&
        event.navigationInstanceId === null &&
        event.routeId === null &&
        event.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
        event.unavailableWorkspaceIds.length === 0 &&
        event.authorization.catalog === 'fresh-authorized' &&
        event.authorization.principal === 'matching' &&
        event.outcome === 'seeded' &&
        event.durability.authSession === 'present' &&
        event.durability.offlineCalendarCleanup === 'absent' &&
        event.durability.offlineCalendarPayload === 'present' &&
        event.durability.offlineCalendarPreference === 'disabled' &&
        event.durability.offlineCalendarSlot === 'payload'
      );
    }
    return Boolean(
      !workspaceLifecycle &&
      event.navigationInstanceId === null &&
      event.routeId === null &&
      event.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
      event.unavailableWorkspaceIds.includes(
        GUIDANCE_CONTRACT_WORKSPACES.denied.id
      ) &&
      !event.unavailableWorkspaceIds.includes(
        GUIDANCE_CONTRACT_WORKSPACES.survivor.id
      ) &&
      event.authorization.principal === 'matching' &&
      ['fresh-denied', 'not-checked'].includes(
        event.authorization.catalog
      ) &&
      event.outcome === 'clean' &&
      event.durability.authSession === 'present' &&
      event.durability.offlineCalendarCleanup === 'absent' &&
      event.durability.offlineCalendarPayload === 'absent' &&
      event.durability.offlineCalendarPreference === 'disabled' &&
      event.durability.offlineCalendarSlot === 'workspace-revoked' &&
      event.durability.workspaceContext === 'persisted'
    );
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
    connectivity: normalizeConnectivityStatus(value?.connectivity),
    connectivitySequence: normalizeConnectivitySequence(
      value?.connectivitySequence
    ),
    mode: normalizeMode(value?.mode),
    phase: normalizePhase(value?.phase),
    sourceRevision: normalizeControlSourceRevision(value?.sourceRevision),
    storageFaults: normalizeStorageFaults(
      value?.storageFaults ?? value?.calendarAuthFaults
    )
  };
}

function normalizeStorageFaults(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  return value.flatMap((candidate) => {
    const id = String(candidate?.id || '').trim();
    const operation = String(candidate?.operation || '').trim();
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(id) ||
      !CONNECTIVITY_CONTRACT_STORAGE_FAULT_OPERATIONS.includes(operation) ||
      candidate?.remaining !== 1
    ) {
      return [];
    }
    const key = `${id}:${operation}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{ id, operation, remaining: 1 }];
  });
}

async function waitForWorkspaceCatalogRelease({ phase, readControl, sleep }) {
  if (typeof readControl !== 'function') {
    return false;
  }
  const maximumPolls = Math.ceil(
    WORKSPACE_CATALOG_HOLD_TIMEOUT_MS / WORKSPACE_CATALOG_HOLD_POLL_MS
  );
  for (let poll = 0; poll < maximumPolls; poll += 1) {
    const control = readControl();
    if (
      normalizePhase(control?.phase) === phase &&
      control?.catalogReleased === true
    ) {
      return true;
    }
    await sleep(WORKSPACE_CATALOG_HOLD_POLL_MS);
  }
  return false;
}

async function waitForConnectivityRelease({
  connectivitySequence,
  expectedSourceRevision,
  readControl,
  sleep
}) {
  if (typeof readControl !== 'function') {
    return null;
  }
  const maximumPolls = Math.ceil(
    CONNECTIVITY_CONTRACT_HOLD_TIMEOUT_MS /
      CONNECTIVITY_CONTRACT_HOLD_POLL_MS
  );
  for (let poll = 0; poll < maximumPolls; poll += 1) {
    const control = normalizeControlSnapshot(readControl());
    if (
      control.connectivitySequence > connectivitySequence &&
      control.sourceRevision === expectedSourceRevision &&
      control.connectivity !== CONNECTIVITY_CONTRACT_STATUSES.checking
    ) {
      return control.connectivity;
    }
    await sleep(CONNECTIVITY_CONTRACT_HOLD_POLL_MS);
  }
  return null;
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

function normalizeConnectivityStatus(value) {
  const normalized = String(value || '').trim();
  return Object.values(CONNECTIVITY_CONTRACT_STATUSES).includes(normalized)
    ? normalized
    : CONNECTIVITY_CONTRACT_STATUSES.online;
}

function normalizeConnectivitySequence(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : 0;
}

function normalizeControlSourceRevision(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : '';
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
    pathname.startsWith('/api/v1/mobile/safe-route/operations/client/') ||
    pathname === '/api/v1/convoy-routes/route-preview' ||
    pathname === '/api/v1/intel/map/area-risk/research'
  );
}

function isValidAreaRiskResearchPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  const expectedKeys = [
    'bounds',
    'client_id',
    'country_hints',
    'scope',
    'zoom'
  ];
  if (
    Object.keys(body).sort().join('|') !== expectedKeys.sort().join('|') ||
    !['detail', 'regional'].includes(body.scope) ||
    !Number.isFinite(body.zoom) ||
    body.zoom < 0 ||
    body.zoom > 24 ||
    !Array.isArray(body.country_hints) ||
    body.country_hints.some((value) => typeof value !== 'string')
  ) {
    return false;
  }
  const bounds = body.bounds;
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) {
    return false;
  }
  const expectedBoundKeys = ['max_lat', 'max_lon', 'min_lat', 'min_lon'];
  if (Object.keys(bounds).sort().join('|') !== expectedBoundKeys.sort().join('|')) {
    return false;
  }
  return expectedBoundKeys.every((key) => Number.isFinite(bounds[key]))
    && bounds.max_lat > bounds.min_lat
    && bounds.max_lon > bounds.min_lon
    && bounds.min_lat >= -90
    && bounds.max_lat <= 90
    && bounds.min_lon >= -180
    && bounds.max_lon <= 180;
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

function sendEmpty(response, statusCode, semanticOutcome = `http-${statusCode}`) {
  response[RESPONSE_SEMANTIC_OUTCOME] = semanticOutcome;
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': '0'
  });
  response.end();
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

function sendInactiveAccountError(response) {
  sendJson(
    response,
    400,
    {
      detail: {
        details: 'This account has been deactivated',
        message: 'Inactive user'
      }
    },
    'principal-inactive'
  );
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

export function assertConnectivityContractReconnectAuthorization(entries, {
  onlinePhase = CONNECTIVITY_CONTRACT_PHASES.online,
  reconnectPhase = CONNECTIVITY_CONTRACT_PHASES.reconnectChecking,
  settlementSequence
}) {
  const settlement = entries.find((entry) =>
    entry.event === 'completion' &&
    entry.sequence === settlementSequence &&
    entry.phase === reconnectPhase &&
    entry.path === CONNECTIVITY_CONTRACT_REACHABILITY_PATH &&
    entry.completed === true &&
    entry.statusCode === 204 &&
    entry.semanticOutcome === 'connectivity-online'
  );
  assertJournalCondition(
    settlement,
    'Connectivity reconnect journal had no exact successful online settlement boundary.'
  );

  const prematureProductRequests = entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === onlinePhase &&
    entry.path.startsWith('/api/') &&
    entry.sequence <= settlementSequence
  );
  assertJournalCondition(
    prematureProductRequests.length === 0,
    'Connectivity reconnect journal recorded product traffic before online settlement.'
  );

  const requests = entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === onlinePhase &&
    entry.path.startsWith('/api/')
  );
  const principal = requests.filter((entry) => entry.path === '/api/v1/users/me');
  const catalog = requests.filter((entry) =>
    entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
  );
  assertJournalCondition(
    principal.length === 1 && catalog.length === 1,
    `Connectivity reconnect expected one principal/catalog pair but recorded ` +
      `${principal.length}/${catalog.length}.`
  );
  const principalCompletion = entries.find((entry) =>
    entry.event === 'completion' &&
    entry.requestId === principal[0].requestId
  );
  const catalogCompletion = entries.find((entry) =>
    entry.event === 'completion' &&
    entry.requestId === catalog[0].requestId
  );
  assertJournalCondition(
    principal[0].authorized === true &&
      catalog[0].authorized === true &&
      settlement.sequence < principal[0].sequence &&
      principal[0].sequence < principalCompletion?.sequence &&
      principalCompletion?.completed === true &&
      principalCompletion.statusCode === 200 &&
      principalCompletion.semanticOutcome === 'principal-a' &&
      principalCompletion.sequence < catalog[0].sequence &&
      catalog[0].sequence < catalogCompletion?.sequence &&
      catalogCompletion?.completed === true &&
      catalogCompletion.statusCode === 200 &&
      catalogCompletion.semanticOutcome === 'catalog-active',
    'Connectivity reconnect principal/catalog pair did not complete after settlement in exact authorized order.'
  );
  return {
    catalog: catalog[0],
    catalogCompletion,
    principal: principal[0],
    principalCompletion,
    settlement
  };
}

export function assertConnectivityContractInactiveSessionRevocation(entries, {
  inactivePhase = CONNECTIVITY_CONTRACT_PHASES.inactiveSession,
  relaunchPhase = CONNECTIVITY_CONTRACT_PHASES.inactiveRelaunch
} = {}) {
  const inactiveRequests = entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === inactivePhase &&
    entry.path.startsWith('/api/')
  );
  const principal = inactiveRequests.filter(
    (entry) => entry.path === '/api/v1/users/me'
  );
  const principalCompletion = entries.find((entry) =>
    entry.event === 'completion' &&
    entry.requestId === principal[0]?.requestId
  );
  assertJournalCondition(
    inactiveRequests.length === 1 &&
      principal.length === 1 &&
      principal[0].authorized === true &&
      principalCompletion?.completed === true &&
      principalCompletion.statusCode === 400 &&
      principalCompletion.semanticOutcome === 'principal-inactive',
    'Inactive-session phase did not stop after one exact authorized principal rejection.'
  );

  const relaunchProtectedRequests = entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === relaunchPhase &&
    isProtectedPath(entry.path)
  );
  assertJournalCondition(
    relaunchProtectedRequests.length === 0,
    'Inactive-session relaunch issued protected requests after durable sign-out.'
  );

  return { principal: principal[0], principalCompletion };
}

export function assertConnectivityContractInactiveGuidanceRevocation(entries, {
  expectedSourceRevision,
  minimumOccurredAtMs
}) {
  const persistedIndex = entries.findIndex((entry) =>
    entry.type === 'navigation.persisted' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.inactiveSeed &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs >= minimumOccurredAtMs &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  assertJournalCondition(
    persistedIndex >= 0,
    'Inactive-account contract seeded navigation persistence was absent.'
  );
  const persisted = entries[persistedIndex];
  const cleanupIndex = entries.findIndex((entry, index) =>
    index > persistedIndex &&
    entry.type === 'navigation.cleanup.settled' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.inactiveSession &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.navigationInstanceId === persisted.navigationInstanceId &&
    entry.routeId === persisted.routeId &&
    entry.workspaceId === persisted.workspaceId &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  assertJournalCondition(
    cleanupIndex >= 0,
    'Inactive-account cleanup was not durably correlated to the seeded navigation.'
  );
  const cleanup = entries[cleanupIndex];
  const trackingIndex = entries.findIndex((entry, index) =>
    index > cleanupIndex &&
    entry.type === 'tracking.stop.settled' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.inactiveSession &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.appLaunchId === cleanup.appLaunchId &&
    entry.navigationInstanceId === cleanup.navigationInstanceId &&
    entry.routeId === cleanup.routeId &&
    entry.workspaceId === cleanup.workspaceId &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  assertJournalCondition(
    trackingIndex >= 0,
    'Inactive-account cleanup did not prove a correlated tracking stop.'
  );
  const tracking = entries[trackingIndex];
  const absence = entries.find((entry, index) =>
    index > trackingIndex &&
    entry.type === 'navigation.absence.readback' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.inactiveRelaunch &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs > tracking.occurredAtMs &&
    entry.appLaunchId !== cleanup.appLaunchId &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const reopened = entries.find((entry, index) =>
    index > cleanupIndex &&
    entry.type === 'restore.ready' &&
    entry.navigationInstanceId === cleanup.navigationInstanceId
  );
  assertJournalCondition(
    absence && !reopened,
    'Inactive-account navigation was not absent after process relaunch or reopened after revocation.'
  );
  return { absence, cleanup, persisted, tracking };
}

export function assertConnectivityContractEndedJourneyStayedClosed(entries, {
  expectedSourceRevision,
  minimumOccurredAtMs
}) {
  const suspendedIndex = entries.findIndex((entry) =>
    entry.type === 'restore.suspended' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.offline &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs >= minimumOccurredAtMs &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  assertJournalCondition(
    suspendedIndex >= 0,
    'Connectivity contract offline suspended restore evidence was absent.'
  );
  const suspended = entries[suspendedIndex];
  const cleanupIndex = entries.findIndex((entry, index) =>
    index > suspendedIndex &&
    entry.type === 'navigation.cleanup.settled' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.offline &&
    entry.appLaunchId === suspended.appLaunchId &&
    entry.navigationInstanceId === suspended.navigationInstanceId &&
    entry.routeId === suspended.routeId &&
    entry.workspaceId === suspended.workspaceId &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  assertJournalCondition(
    cleanupIndex >= 0,
    'Connectivity contract offline End cleanup was not correlated to suspended restore.'
  );
  const cleanup = entries[cleanupIndex];
  const tracking = entries.find((entry, index) =>
    index > cleanupIndex &&
    entry.type === 'tracking.stop.settled' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.offline &&
    entry.appLaunchId === cleanup.appLaunchId &&
    entry.navigationInstanceId === cleanup.navigationInstanceId &&
    entry.routeId === cleanup.routeId &&
    entry.workspaceId === cleanup.workspaceId &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const reopened = entries.find((entry, index) =>
    index > cleanupIndex &&
    entry.type === 'restore.ready' &&
    entry.navigationInstanceId === cleanup.navigationInstanceId
  );
  const absenceIndex = entries.findIndex((entry, index) =>
    index > cleanupIndex &&
    entry.type === 'navigation.absence.readback' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.occurredAtMs > tracking?.occurredAtMs &&
    entry.appLaunchId !== cleanup.appLaunchId &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  const absence = entries[absenceIndex];
  const cacheReadback = entries.find((entry, index) =>
    index > absenceIndex &&
    entry.type === 'route.cache.readback' &&
    entry.serverPhase === CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch &&
    entry.sourceRevision === expectedSourceRevision &&
    entry.appLaunchId === absence?.appLaunchId &&
    entry.routeId === cleanup.routeId &&
    entry.workspaceId === cleanup.workspaceId &&
    isSuccessfulGuidanceContractEvidence(entry, entry)
  );
  assertJournalCondition(
    tracking && absence && cacheReadback && !reopened,
    'Connectivity contract ended offline journey was not durably stopped, absent after process relaunch, reviewable from cache, or stayed closed.'
  );
  return { absence, cacheReadback, cleanup, suspended, tracking };
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
  expectedPostAuthorizationRequests,
  openPhase,
  phase
}) {
  const normalizedBoundary = String(boundary || '').trim();
  const normalizedOpenPhase = String(openPhase || '').trim();
  const normalizedPhase = String(phase || '').trim();
  const expected = Array.isArray(expectedPaths) ? expectedPaths : [];
  const outcomes = Array.isArray(expectedOutcomes) ? expectedOutcomes : null;
  const expectedPostAuthorization = Array.isArray(expectedPostAuthorizationRequests)
    ? expectedPostAuthorizationRequests
    : [];
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
    protectedEntries.length === expected.length + expectedPostAuthorization.length,
    `Guidance Start boundary ${normalizedBoundary} expected ${
      expected.length + expectedPostAuthorization.length
    } protected requests but recorded ${protectedEntries.length}.`
  );
  const authorizationEntries = protectedEntries.slice(0, expected.length);
  const authorizationCompletions = [];
  authorizationEntries.forEach((entry, index) => {
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
      authorizationCompletions.push(responseEntries[0]);
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

  const postAuthorizationEntries = protectedEntries.slice(expected.length);
  postAuthorizationEntries.forEach((entry, index) => {
    const expectedRequest = expectedPostAuthorization[index];
    const searchParameters = new URLSearchParams(entry.search);
    const clientIds = searchParameters.getAll('client_id');
    const hasStrictAreaRiskReadContract =
      expectedRequest?.path !== '/api/v1/intel/map/area-risk' ||
      (
        searchParameters.get('refresh') === 'false' &&
        searchParameters.get('read_only') === 'true'
      );
    const finalAuthorizationCompletion = authorizationCompletions.at(-1);
    assertJournalCondition(
      expectedRequest &&
        finalAuthorizationCompletion &&
        entry.sequence > finalAuthorizationCompletion.sequence &&
        entry.phase === normalizedPhase &&
        entry.method === 'GET' &&
        entry.path === expectedRequest.path &&
        clientIds.length === 1 &&
        clientIds[0] === expectedRequest.clientId &&
        hasStrictAreaRiskReadContract &&
        entry.authorized === true &&
        entry.authorizationClass === 'expected-bearer',
      `Guidance Start boundary ${normalizedBoundary} post-authorization request ${
        index + 1
      } did not match the exact survivor contract.`
    );
    const responseEntries = entries.filter(
      (candidate) =>
        candidate.event === 'completion' && candidate.requestId === entry.requestId
    );
    assertJournalCondition(
      responseEntries.length === 1 &&
        responseEntries[0].sequence > entry.sequence &&
        responseEntries[0].sequence < close.sequence &&
        responseEntries[0].completed === true &&
        responseEntries[0].statusCode === expectedRequest.statusCode &&
        responseEntries[0].semanticOutcome === expectedRequest.semanticOutcome,
      `Guidance Start boundary ${normalizedBoundary} post-authorization request ${
        index + 1
      } did not complete with the expected response outcome.`
    );
  });

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
  const clientScopedAreaRisk =
    entry?.path === '/api/v1/intel/map/area-risk' &&
    new URLSearchParams(entry.search || '').has('client_id');
  return Boolean(
    entry &&
      (!entry.event || entry.event === 'request') &&
      (isProtectedPath(entry.path) ||
        clientScopedAreaRisk ||
        entry.authorizationClass !== 'none')
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
