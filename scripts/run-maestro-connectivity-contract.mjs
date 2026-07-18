#!/usr/bin/env node
import {
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

import {
  CONNECTIVITY_CONTRACT_PHASES,
  CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
  CONNECTIVITY_CONTRACT_STATUSES,
  GUIDANCE_CONTRACT_API_PORT,
  GUIDANCE_CONTRACT_MODES,
  OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES,
  OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES,
  OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES,
  assertConnectivityContractEndedJourneyStayedClosed,
  assertConnectivityContractInactiveGuidanceRevocation,
  assertConnectivityContractInactiveSessionRevocation,
  assertConnectivityContractReconnectAuthorization,
  assertGuidanceContractEvidenceJournal,
  assertGuidanceContractRequestJournal,
  assertOfflineCalendarAuthBoundaryTraffic,
  assertOfflineCalendarAuthCleanupEvidence,
  assertOfflineCalendarAuthStorageFaultRequests,
  assertOfflineCalendarPrincipalChangeEvidence,
  assertOfflineCalendarPrincipalChangeTraffic,
  assertOfflineCalendarWorkspaceDenialTraffic,
  assertOfflineCalendarWorkspaceRevocationEvidence,
} from './maestro-guidance-contract-api.mjs';
import {
  assertGuidanceSourceCheckoutClean,
  verifyGuidanceContractMetroIdentity,
} from './maestro-guidance-metro-identity.mjs';
import { assertAccessibilityHierarchyElements } from './maestro-accessibility-hierarchy.mjs';
import { waitForBoundedMaestroPhase } from './maestro-phase-lifecycle.mjs';
import {
  createMaestroProcessEnv,
  resolveHeldMaestroPhaseTimeoutMs,
  resolveMaestroBinary,
} from './run-maestro.mjs';

const METRO_PORT = 8081;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';
const CALENDAR_AUTH_CLEANUP_SLICE = 'calendar-auth-cleanup';
const CALENDAR_PRINCIPAL_CHANGE_SLICE = 'calendar-principal-change';
const CALENDAR_WORKSPACE_DENIAL_SLICE = 'calendar-workspace-denial';
const connectivityContractSlice = String(
  process.env.SAFEROUTE_CONNECTIVITY_CONTRACT_SLICE || '',
).trim();
const MAESTRO_PHASE_TIMEOUT_MS = resolveHeldMaestroPhaseTimeoutMs(
  process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT,
);
const deviceId = String(process.env.SAFEROUTE_IOS_DEVICE_ID || '').trim();
const tempDirectory = mkdtempSync(join(tmpdir(), 'saferoute-connectivity-contract-'));
const controlFile = join(tempDirectory, 'control.json');
const pendingControlFile = join(tempDirectory, 'control.pending.json');
const requestLogFile = join(tempDirectory, 'requests.jsonl');
const evidenceLogFile = join(tempDirectory, 'evidence.jsonl');
const serverLogFile = join(tempDirectory, 'server.log');
const screenshotDirectory = join(tempDirectory, 'screenshots');
const accessibilityDirectory = join(tempDirectory, 'accessibility');
const serverLogFd = openSync(serverLogFile, 'a');
const startedAtMs = Date.now();
let apiProcess = null;
let activeFlow = null;
let connectivitySequence = 0;
let currentSourceRevision = '';
let maestroBinary = '';

const flows = Object.freeze({
  coldChecking: 'maestro/ios-connectivity-contract-cold-checking.yaml',
  inactiveRelaunch: 'maestro/ios-connectivity-contract-inactive-relaunch.yaml',
  inactiveSession: 'maestro/ios-connectivity-contract-inactive-session.yaml',
  calendarAuthInactiveFailure:
    'maestro/ios-connectivity-contract-calendar-auth-inactive-failure.yaml',
  calendarAuthFinalRelaunch:
    'maestro/ios-connectivity-contract-calendar-auth-final-relaunch.yaml',
  calendarAuthPreferenceSeed:
    'maestro/ios-connectivity-contract-calendar-auth-preference-seed.yaml',
  calendarAuthRelaunchFailure:
    'maestro/ios-connectivity-contract-calendar-auth-relaunch-failure.yaml',
  calendarAuthRetry:
    'maestro/ios-connectivity-contract-calendar-auth-retry.yaml',
  calendarPrincipalChange:
    'maestro/ios-connectivity-contract-calendar-principal-change.yaml',
  calendarPrincipalChangeRelaunch:
    'maestro/ios-connectivity-contract-calendar-principal-change-relaunch.yaml',
  calendarPrincipalValidationUnavailable:
    'maestro/ios-connectivity-contract-calendar-principal-validation-unavailable.yaml',
  calendarPrincipalValidationOfflineRelaunch:
    'maestro/ios-connectivity-contract-calendar-principal-validation-offline-relaunch.yaml',
  calendarWorkspaceDenial:
    'maestro/ios-connectivity-contract-calendar-workspace-denial.yaml',
  calendarWorkspaceDenialPrepare:
    'maestro/ios-connectivity-contract-calendar-workspace-denial-prepare.yaml',
  calendarWorkspaceDenialRelaunch:
    'maestro/ios-connectivity-contract-calendar-workspace-denial-relaunch.yaml',
  offlineEnd: 'maestro/ios-connectivity-contract-offline-end.yaml',
  offlineObserve: 'maestro/ios-connectivity-contract-offline-observe.yaml',
  offlineRelaunch: 'maestro/ios-connectivity-contract-offline-relaunch.yaml',
  operationsAllowCalendarSaving:
    'maestro/ios-connectivity-contract-operations-allow-saving.yaml',
  operationsDisabledOnline:
    'maestro/ios-connectivity-contract-operations-disabled-online.yaml',
  operationsRemoveCalendar:
    'maestro/ios-connectivity-contract-operations-remove-calendar.yaml',
  operationsRemovalRelaunch:
    'maestro/ios-connectivity-contract-operations-removal-relaunch.yaml',
  operationsResavedCalendarRelaunch:
    'maestro/ios-connectivity-contract-operations-resaved-relaunch.yaml',
  operationsSavingOffRelaunch:
    'maestro/ios-connectivity-contract-operations-saving-off-relaunch.yaml',
  operationsStopCalendarSaving:
    'maestro/ios-connectivity-contract-operations-stop-saving.yaml',
  operationsReturnMap: 'maestro/ios-connectivity-contract-operations-return-map.yaml',
  online: 'maestro/ios-connectivity-contract-online.yaml',
  reconnectChecking: 'maestro/ios-connectivity-contract-reconnect-checking.yaml',
  reset: 'maestro/ios-guidance-contract-reset.yaml',
  seed: 'maestro/ios-workspace-catalog-recovery-seed.yaml',
  seedJourney: 'maestro/ios-connectivity-contract-seed-journey.yaml',
});

try {
  await main();
} catch (error) {
  process.stderr.write(
    `[connectivity-contract] failed: ${error instanceof Error ? error.stack : String(error)}\n` +
      `[connectivity-contract] artifacts preserved at ${tempDirectory}\n`,
  );
  process.exitCode = 1;
} finally {
  await stopActiveFlow().catch((error) => {
    process.stderr.write(
      `[connectivity-contract] Maestro cleanup failed: ${String(error)}\n`,
    );
    process.exitCode = 1;
  });
  await stopApi().catch((error) => {
    process.stderr.write(
      `[connectivity-contract] API cleanup failed: ${String(error)}\n`,
    );
    process.exitCode = 1;
  });
  if (deviceId) {
    spawnSync('xcrun', ['simctl', 'terminate', deviceId, EXPO_GO_BUNDLE_ID], {
      stdio: 'ignore',
      timeout: 5000,
    });
  }
  closeSync(serverLogFd);
}

async function main() {
  assertCondition(
    !connectivityContractSlice ||
      [
        CALENDAR_AUTH_CLEANUP_SLICE,
        CALENDAR_PRINCIPAL_CHANGE_SLICE,
        CALENDAR_WORKSPACE_DENIAL_SLICE,
      ].includes(connectivityContractSlice),
    `Unsupported connectivity contract slice: ${connectivityContractSlice}.`,
  );
  assertCondition(deviceId, 'Set SAFEROUTE_IOS_DEVICE_ID to the booted iOS simulator UDID.');
  assertBootedSimulator(deviceId);
  assertCondition(
    await isPortListening(METRO_PORT),
    'Connectivity contract requires the no-build Metro listener on port 8081.',
  );
  assertCondition(
    !(await isPortListening(GUIDANCE_CONTRACT_API_PORT)),
    `Port ${GUIDANCE_CONTRACT_API_PORT} is already in use.`,
  );
  maestroBinary = resolveMaestroBinary() || '';
  assertCondition(
    maestroBinary,
    'Connectivity contract could not resolve the Maestro CLI.',
  );
  assertGuidanceSourceCheckoutClean(readCurrentSourceStatus());
  const sourceRevision = readCurrentSourceRevision();
  currentSourceRevision = sourceRevision;
  const metroIdentity = await verifyGuidanceContractMetroIdentity({
    expectedApiUrl: `http://127.0.0.1:${GUIDANCE_CONTRACT_API_PORT}`,
    expectedConnectivityContractEnabled: true,
    expectedProjectRoot: realpathSync(process.cwd()),
    expectedSlug: 'saferoute-mobile',
    expectedSourceRevision: sourceRevision,
    expectedStorageFaultContractEnabled:
      connectivityContractSlice === CALENDAR_AUTH_CLEANUP_SLICE,
    manifestUrl: `http://127.0.0.1:${METRO_PORT}`,
  });
  process.stdout.write(
    `[connectivity-contract] verified exact source ${metroIdentity.sourceRevision} ` +
      `on ${deviceId}\n`,
  );

  grantRuntimeLocationPermission(deviceId);
  mkdirSync(screenshotDirectory, { recursive: true });
  mkdirSync(accessibilityDirectory, { recursive: true });
  setControl(
    CONNECTIVITY_CONTRACT_PHASES.seed,
    CONNECTIVITY_CONTRACT_STATUSES.online,
  );
  await startApi();
  await runFlow(CONNECTIVITY_CONTRACT_PHASES.seed, 'reset signed-out SafeRoute state', flows.reset);
  await runFlow(CONNECTIVITY_CONTRACT_PHASES.seed, 'seed principal/workspace/Saved caches', flows.seed);
  if (
    [
      CALENDAR_AUTH_CLEANUP_SLICE,
      CALENDAR_PRINCIPAL_CHANGE_SLICE,
      CALENDAR_WORKSPACE_DENIAL_SLICE,
    ].includes(connectivityContractSlice)
  ) {
    await runFlow(
      CONNECTIVITY_CONTRACT_PHASES.seed,
      'seed a durable Support Operations Calendar-saving preference',
      flows.calendarAuthPreferenceSeed,
    );
  }
  if (connectivityContractSlice === CALENDAR_WORKSPACE_DENIAL_SLICE) {
    await waitForEvidenceType(
      'offline.calendar.workspace-lifecycle',
      CONNECTIVITY_CONTRACT_PHASES.seed,
    );
    await runCalendarWorkspaceDenialSlice(sourceRevision);
    return;
  }
  if (connectivityContractSlice === CALENDAR_PRINCIPAL_CHANGE_SLICE) {
    await waitForEvidenceType(
      'offline.calendar.principal-lifecycle',
      CONNECTIVITY_CONTRACT_PHASES.seed,
    );
    await runCalendarPrincipalChangeSlice(sourceRevision);
    return;
  }
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.seed,
    'start and pause one exact workspace journey',
    flows.seedJourney,
  );
  await waitForEvidenceType(
    'navigation.persisted',
    CONNECTIVITY_CONTRACT_PHASES.seed,
  );
  if (connectivityContractSlice === CALENDAR_AUTH_CLEANUP_SLICE) {
    await runCalendarAuthCleanupSlice(sourceRevision);
    return;
  }

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.coldChecking,
    CONNECTIVITY_CONTRACT_STATUSES.checking,
  );
  const coldRun = startFlow(
    CONNECTIVITY_CONTRACT_PHASES.coldChecking,
    'cold launch while real NetInfo reachability is held',
    flows.coldChecking,
  );
  await waitForHeldReachability(CONNECTIVITY_CONTRACT_PHASES.coldChecking);
  await finishFlow(coldRun);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.coldChecking,
  ], 1_000);

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.offline,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
  );
  await waitForReachabilityOutcome(
    CONNECTIVITY_CONTRACT_PHASES.coldChecking,
    'connectivity-offline',
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.offline,
    'expose distinct suspended status and local actions offline',
    flows.offlineObserve,
  );
  captureAccessibilityHierarchy('offline-suspended', [
    {
      id: 'safe-route-suspended-navigation-status',
      label: 'Guidance paused. Cold restart verification v1. Reconnect to verify access before guidance can resume.',
      enabled: true,
    },
    {
      id: 'safe-route-suspended-navigation-retry',
      label: 'Reconnect before retrying workspace access',
      enabled: false,
    },
    {
      id: 'safe-route-suspended-navigation-end',
      label: 'End suspended route',
      enabled: true,
    },
  ]);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.offline,
    'restore review-only data and End suspended guidance offline',
    flows.offlineEnd,
  );
  await waitForEvidenceType(
    'navigation.cleanup.settled',
    CONNECTIVITY_CONTRACT_PHASES.offline,
  );
  await waitForEvidenceType(
    'tracking.stop.settled',
    CONNECTIVITY_CONTRACT_PHASES.offline,
  );
  captureAccessibilityHierarchy('offline-saved-review', [
    {
      id: 'safe-route-offline-notice',
      label: 'Offline saved routes. This copy was cached less than one hour ago and is review only. Reconnect and verify workspace access before starting guidance.',
      enabled: true,
    },
    {
      id: 'safe-route-card-66b1b2c3d4e5f60718293b40',
      labelStartsWith: 'Cold restart verification v1. ',
      enabled: true,
    },
  ]);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.coldChecking,
    CONNECTIVITY_CONTRACT_PHASES.offline,
  ], 1_000);

  terminateExpoGo(deviceId);
  setControl(
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
    'cold relaunch the ended journey into its cached review workspace',
    flows.offlineRelaunch,
  );
  captureAccessibilityHierarchy('offline-operations-calendar', [
    {
      id: 'safe-route-operations-offline-notice',
      label: 'Offline Operations. This calendar was saved less than one hour ago and is review only. Reconnect and verify workspace access before relying on this calendar. Saved calendar labels and endpoints are stored. Full route plans, live risk and ETA, and convoy manifests are not stored offline.',
      enabled: true,
    },
    {
      id: 'safe-route-operations-route-movement-1-1',
      labelStartsWith: 'Cold restart verification v1. ',
      enabled: true,
    },
    {
      id: 'safe-route-operations-remove-calendar',
      label: 'Remove saved calendar from this device',
      enabled: true,
    },
    {
      id: 'safe-route-operations-calendar-saving-control',
      label: 'Stop future offline Calendar saves for Guidance Operations on this device',
      enabled: true,
    },
  ]);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
    'stop exact-scope offline Calendar saves after cancellation proof',
    flows.operationsStopCalendarSaving,
  );
  captureAccessibilityHierarchy('offline-operations-calendar-saving-off', [
    {
      id: 'safe-route-operations-calendar-saving-status',
      label: 'Guidance Operations. Offline Calendar saving is off. Nothing will be saved for this workspace until you allow it. Online Operations are unchanged.',
      enabled: true,
    },
    {
      id: 'safe-route-operations-calendar-saving-control',
      label: 'Allow offline Calendar saving for Guidance Operations on this device',
      enabled: true,
    },
    {
      id: 'safe-route-operations-empty-state',
      label: 'No offline Calendar is saved. Allow offline saving, then reconnect and sync to save a new Calendar.',
      enabled: true,
    },
  ]);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
  ], 1_000);

  terminateExpoGo(deviceId);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
    'cold relaunch with exact-scope offline Calendar saving still off',
    flows.operationsSavingOffRelaunch,
  );
  captureAccessibilityHierarchy(
    'offline-operations-calendar-saving-off-relaunch',
    [
      {
        id: 'safe-route-operations-calendar-saving-status',
        label: 'Guidance Operations. Offline Calendar saving is off. Nothing will be saved for this workspace until you allow it. Online Operations are unchanged.',
        enabled: true,
      },
      {
        id: 'safe-route-operations-calendar-saving-control',
        label: 'Allow offline Calendar saving for Guidance Operations on this device',
        enabled: true,
      },
      {
        id: 'safe-route-operations-empty-state',
        label: 'No offline Calendar is saved. Allow offline saving, then reconnect and sync to save a new Calendar.',
        enabled: true,
      },
    ],
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
    'return to the offline map after durable Operations saving opt-out evidence',
    flows.operationsReturnMap,
  );
  await waitForEvidenceType(
    'navigation.absence.readback',
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
  );
  await waitForEvidenceType(
    'route.cache.readback',
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
  );
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
  ], 1_000);

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.reconnectChecking,
    CONNECTIVITY_CONTRACT_STATUSES.checking,
  );
  const reconnectRun = startFlow(
    CONNECTIVITY_CONTRACT_PHASES.reconnectChecking,
    'foreground into a second held reachability check',
    flows.reconnectChecking,
  );
  await waitForHeldReachability(CONNECTIVITY_CONTRACT_PHASES.reconnectChecking);
  await finishFlow(reconnectRun);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.reconnectChecking,
  ], 1_000);

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.online,
    CONNECTIVITY_CONTRACT_STATUSES.online,
  );
  const onlineSettlement = await waitForReachabilityOutcome(
    CONNECTIVITY_CONTRACT_PHASES.reconnectChecking,
    'connectivity-online',
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.online,
    'complete exactly one fresh reconnect authorization',
    flows.online,
  );
  await waitForReconnectAuthorization(onlineSettlement.sequence);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.online,
    'prove online Operations stays live while Calendar saving remains off',
    flows.operationsDisabledOnline,
  );
  captureAccessibilityHierarchy('online-operations-calendar-saving-off', [
    {
      id: 'guest-map-workspace-selector',
      label: 'Workspace, Guidance Operations',
      enabled: true,
    },
  ]);

  terminateExpoGo(deviceId);
  setControl(
    CONNECTIVITY_CONTRACT_PHASES.disabledSyncOffline,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.disabledSyncOffline,
    'cold relaunch after a successful online sync that remained opted out',
    flows.operationsSavingOffRelaunch,
  );
  captureAccessibilityHierarchy(
    'offline-operations-calendar-disabled-sync-relaunch',
    [
      {
        id: 'safe-route-operations-calendar-saving-status',
        label: 'Guidance Operations. Offline Calendar saving is off. Nothing will be saved for this workspace until you allow it. Online Operations are unchanged.',
        enabled: true,
      },
      {
        id: 'safe-route-operations-calendar-saving-control',
        label: 'Allow offline Calendar saving for Guidance Operations on this device',
        enabled: true,
      },
      {
        id: 'safe-route-operations-empty-state',
        label: 'No offline Calendar is saved. Allow offline saving, then reconnect and sync to save a new Calendar.',
        enabled: true,
      },
    ],
  );
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.disabledSyncOffline,
  ], 1_000);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.disabledSyncOffline,
    'return to Map after proving the disabled online sync created no cache',
    flows.operationsReturnMap,
  );

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
    CONNECTIVITY_CONTRACT_STATUSES.checking,
  );
  const allowReconnectRun = startFlow(
    CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
    'foreground toward an authorized explicit Allow',
    flows.reconnectChecking,
  );
  await waitForHeldReachability(
    CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
  );
  await finishFlow(allowReconnectRun);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
  ], 1_000);

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.allowOnline,
    CONNECTIVITY_CONTRACT_STATUSES.online,
  );
  const allowOnlineSettlement = await waitForReachabilityOutcome(
    CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
    'connectivity-online',
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.allowOnline,
    'complete exact authorization before explicit offline-saving consent',
    flows.online,
  );
  await waitForReconnectAuthorization(
    allowOnlineSettlement.sequence,
    CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
    CONNECTIVITY_CONTRACT_PHASES.allowOnline,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.allowOnline,
    'explicitly allow saving and verify one fresh Calendar readback',
    flows.operationsAllowCalendarSaving,
  );
  captureAccessibilityHierarchy('online-operations-calendar-saving-allowed', [
    {
      id: 'guest-map-workspace-selector',
      label: 'Workspace, Guidance Operations',
      enabled: true,
    },
  ]);

  terminateExpoGo(deviceId);
  setControl(
    CONNECTIVITY_CONTRACT_PHASES.resaveOffline,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.resaveOffline,
    'cold relaunch offline with the newly allowed Calendar save restored',
    flows.operationsResavedCalendarRelaunch,
  );
  captureAccessibilityHierarchy('offline-operations-calendar-resaved', [
    {
      id: 'safe-route-operations-offline-notice',
      label: 'Offline Operations. This calendar was saved less than one hour ago and is review only. Reconnect and verify workspace access before relying on this calendar. Saved calendar labels and endpoints are stored. Full route plans, live risk and ETA, and convoy manifests are not stored offline.',
      enabled: true,
    },
    {
      id: 'safe-route-operations-route-movement-1-1',
      labelStartsWith: 'Cold restart verification v1. ',
      enabled: true,
    },
    {
      id: 'safe-route-operations-calendar-saving-status',
      label: 'Guidance Operations. Offline saving is on. SafeRoute securely saves a limited Calendar after a successful sync.',
      enabled: true,
    },
    {
      id: 'safe-route-operations-calendar-saving-control',
      label: 'Stop future offline Calendar saves for Guidance Operations on this device',
      enabled: true,
    },
  ]);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.resaveOffline,
    'prove one-shot Calendar removal remains independent from future-saving consent',
    flows.operationsRemoveCalendar,
  );
  captureAccessibilityHierarchy('offline-operations-calendar-removed', [
    {
      id: 'safe-route-operations-calendar-removal-status',
      label: "Saved calendar removed. This workspace's saved calendar was removed from this device. Online Operations data is unchanged. A future successful sync may save a new calendar.",
      enabled: true,
    },
    {
      id: 'safe-route-operations-calendar-saving-status',
      label: 'Guidance Operations. Offline saving is on. SafeRoute securely saves a limited Calendar after a successful sync.',
      enabled: true,
    },
  ]);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.resaveOffline,
  ], 1_000);

  terminateExpoGo(deviceId);
  setControl(
    CONNECTIVITY_CONTRACT_PHASES.removalRelaunch,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.removalRelaunch,
    'cold relaunch after one-shot removal while future saving remains allowed',
    flows.operationsRemovalRelaunch,
  );
  captureAccessibilityHierarchy('offline-operations-calendar-removal-relaunch', [
    {
      id: 'safe-route-operations-calendar-saving-status',
      label: 'Guidance Operations. Offline saving is on. SafeRoute securely saves a limited Calendar after a successful sync.',
      enabled: true,
    },
    {
      id: 'safe-route-operations-calendar-saving-control',
      label: 'Stop future offline Calendar saves for Guidance Operations on this device',
      enabled: true,
    },
    {
      id: 'safe-route-operations-empty-state',
      label: 'Calendar unavailable offline. Reconnect to load and securely save this calendar.',
      enabled: true,
    },
  ]);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.removalRelaunch,
  ], 1_000);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.removalRelaunch,
    'return to Map after durable one-shot removal evidence',
    flows.operationsReturnMap,
  );

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
    CONNECTIVITY_CONTRACT_STATUSES.checking,
  );
  const resaveReconnectRun = startFlow(
    CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
    'foreground the resaved Calendar into a held reachability check',
    flows.reconnectChecking,
  );
  await waitForHeldReachability(
    CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
  );
  await finishFlow(resaveReconnectRun);
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
  ], 1_000);

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.resaveOnline,
    CONNECTIVITY_CONTRACT_STATUSES.online,
  );
  const resaveOnlineSettlement = await waitForReachabilityOutcome(
    CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
    'connectivity-online',
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.resaveOnline,
    'complete exact authorization after the resaved offline relaunch',
    flows.online,
  );
  await waitForReconnectAuthorization(
    resaveOnlineSettlement.sequence,
    CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
    CONNECTIVITY_CONTRACT_PHASES.resaveOnline,
  );

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.inactiveSeed,
    CONNECTIVITY_CONTRACT_STATUSES.online,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.inactiveSeed,
    'persist one workspace journey before authoritative account deactivation',
    flows.seedJourney,
  );
  await waitForEvidenceType(
    'navigation.persisted',
    CONNECTIVITY_CONTRACT_PHASES.inactiveSeed,
  );

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.inactiveSession,
    CONNECTIVITY_CONTRACT_STATUSES.online,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.inactiveSession,
    'cold launch an authoritatively inactive account into safe sign-in recovery',
    flows.inactiveSession,
  );
  await waitForEvidenceType(
    'navigation.cleanup.settled',
    CONNECTIVITY_CONTRACT_PHASES.inactiveSession,
  );
  await waitForEvidenceType(
    'tracking.stop.settled',
    CONNECTIVITY_CONTRACT_PHASES.inactiveSession,
  );
  terminateExpoGo(deviceId);

  setControl(
    CONNECTIVITY_CONTRACT_PHASES.inactiveRelaunch,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
  );
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.inactiveRelaunch,
    'relaunch offline after durable inactive-account sign-out',
    flows.inactiveRelaunch,
  );
  await waitForEvidenceType(
    'navigation.absence.readback',
    CONNECTIVITY_CONTRACT_PHASES.inactiveRelaunch,
  );
  await assertProductTrafficQuiet([
    CONNECTIVITY_CONTRACT_PHASES.inactiveRelaunch,
  ], 1_000);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  terminateExpoGo(deviceId);
  await waitForAllRequestsTerminal();

  const requests = readRequestJournal();
  const evidence = readEvidenceJournal();
  assertOperationsCalendarSeed(requests);
  assertGuidanceContractRequestJournal(requests, {
    expectedModeByPhase: {
      [CONNECTIVITY_CONTRACT_PHASES.seed]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.coldChecking]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.offline]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.reconnectChecking]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.online]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.disabledSyncOffline]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.allowOnline]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.resaveOffline]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.removalRelaunch]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.resaveOnline]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.inactiveSeed]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.inactiveSession]: GUIDANCE_CONTRACT_MODES.active,
      [CONNECTIVITY_CONTRACT_PHASES.inactiveRelaunch]: GUIDANCE_CONTRACT_MODES.active,
    },
    requiredPhases: Object.values(CONNECTIVITY_CONTRACT_PHASES),
  });
  assertNoProductTrafficBeforeOnline(requests);
  assertConnectivityContractReconnectAuthorization(requests, {
    settlementSequence: onlineSettlement.sequence,
  });
  assertConnectivityContractReconnectAuthorization(requests, {
    onlinePhase: CONNECTIVITY_CONTRACT_PHASES.allowOnline,
    reconnectPhase: CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
    settlementSequence: allowOnlineSettlement.sequence,
  });
  assertConnectivityContractReconnectAuthorization(requests, {
    onlinePhase: CONNECTIVITY_CONTRACT_PHASES.resaveOnline,
    reconnectPhase: CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
    settlementSequence: resaveOnlineSettlement.sequence,
  });
  assertConnectivityContractInactiveSessionRevocation(requests);
  assertConnectivityContractInactiveGuidanceRevocation(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
  });
  assertGuidanceContractEvidenceJournal(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
    requiredTypes: [
      'navigation.persisted',
      'restore.suspended',
      'navigation.cleanup.settled',
      'navigation.absence.readback',
      'route.cache.readback',
      'tracking.stop.settled',
    ],
  });
  assertConnectivityContractEndedJourneyStayedClosed(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
  });

  process.stdout.write(
    `Connectivity contract runtime passed. Request journal: ${requestLogFile}. ` +
      `Evidence journal: ${evidenceLogFile}. Screenshots: ${screenshotDirectory}. ` +
      `Accessibility hierarchies: ${accessibilityDirectory}\n`,
  );
}

async function runCalendarAuthCleanupSlice(sourceRevision) {
  assertOperationsCalendarAuthCleanupSeed(readRequestJournal());
  setControl(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
    CONNECTIVITY_CONTRACT_STATUSES.online,
    [
      {
        id: 'inactive-auth-clear',
        operation: 'auth-session-tombstone-set',
        remaining: 1,
      },
    ],
  );
  terminateExpoGo(deviceId);
  await runFlow(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
    'fail the inactive-account auth tombstone after durable Calendar intent',
    flows.calendarAuthInactiveFailure,
  );
  await waitForEvidenceType(
    'offline.calendar.cleanup',
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
  );
  await waitForEvidenceType(
    'navigation.cleanup.settled',
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
  );
  await waitForEvidenceType(
    'tracking.stop.settled',
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
  );
  captureAccessibilityHierarchy('calendar-auth-inactive-failure', [
    {
      id: 'safe-route-calendar-cleanup-alert',
      label: 'Offline Calendar unavailable. SafeRoute could not finish device storage protection. Retry before offline Calendar can be used.',
      enabled: true,
    },
    {
      id: 'safe-route-calendar-cleanup-retry',
      label: 'Retry offline Calendar storage',
      enabled: true,
    },
  ]);

  terminateExpoGo(deviceId);
  setControl(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
    CONNECTIVITY_CONTRACT_STATUSES.online,
    [
      {
        id: 'relaunch-auth-clear',
        operation: 'auth-session-tombstone-set',
        remaining: 1,
      },
    ],
  );
  await runFlow(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
    'relaunch the durable terminal cleanup into one replay failure',
    flows.calendarAuthRelaunchFailure,
  );
  await waitForEvidenceType(
    'offline.calendar.cleanup',
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
  );
  captureAccessibilityHierarchy('calendar-auth-relaunch-failure', [
    {
      id: 'safe-route-calendar-cleanup-alert',
      label: 'Offline Calendar unavailable. SafeRoute could not finish device storage protection. Retry before offline Calendar can be used.',
      enabled: true,
    },
    {
      id: 'safe-route-calendar-cleanup-retry',
      label: 'Retry offline Calendar storage',
      enabled: true,
    },
  ]);
  await runFlow(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
    'retry the consumed one-shot auth fault and verify clean signed-out state',
    flows.calendarAuthRetry,
  );
  await waitForEvidenceOutcome(
    'offline.calendar.cleanup',
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
    'clean',
  );

  terminateExpoGo(deviceId);
  setControl(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
  );
  await runFlow(
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
    'cold relaunch after Retry into signed-out global Calendar absence',
    flows.calendarAuthFinalRelaunch,
  );
  await waitForEvidenceOutcome(
    'offline.calendar.cleanup',
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
    'clean',
  );
  await assertProductTrafficQuiet([
    OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
  ], 1_000);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  terminateExpoGo(deviceId);
  await waitForAllRequestsTerminal();

  const requests = readRequestJournal();
  const evidence = readEvidenceJournal();
  assertGuidanceContractRequestJournal(requests, {
    expectedModeByPhase: {
      [CONNECTIVITY_CONTRACT_PHASES.seed]: GUIDANCE_CONTRACT_MODES.active,
      [OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure]:
        GUIDANCE_CONTRACT_MODES.active,
      [OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure]:
        GUIDANCE_CONTRACT_MODES.active,
      [OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch]:
        GUIDANCE_CONTRACT_MODES.active,
    },
    requiredPhases: [
      CONNECTIVITY_CONTRACT_PHASES.seed,
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.inactiveFailure,
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.relaunchFailure,
      OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES.finalRelaunch,
    ],
  });
  assertOfflineCalendarAuthStorageFaultRequests(requests, {
    expectedSourceRevision: sourceRevision,
  });
  assertOfflineCalendarAuthBoundaryTraffic(requests);
  assertGuidanceContractEvidenceJournal(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
    requiredTypes: [
      'navigation.persisted',
      'navigation.cleanup.settled',
      'tracking.stop.settled',
      'offline.calendar.cleanup',
    ],
  });
  assertOfflineCalendarAuthCleanupEvidence(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
  });

  process.stdout.write(
    `Offline Calendar auth-cleanup runtime passed. Request journal: ${requestLogFile}. ` +
      `Evidence journal: ${evidenceLogFile}. Screenshots: ${screenshotDirectory}. ` +
      `Accessibility hierarchies: ${accessibilityDirectory}\n`,
  );
}

async function runCalendarPrincipalChangeSlice(sourceRevision) {
  assertOperationsCalendarAuthCleanupSeed(readRequestJournal());
  terminateExpoGo(deviceId);
  setControl(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable,
    CONNECTIVITY_CONTRACT_STATUSES.online,
    [],
    GUIDANCE_CONTRACT_MODES.principalValidationUnavailable,
  );
  await runFlow(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable,
    'keep saved principal-A data dormant when online validation is unavailable',
    flows.calendarPrincipalValidationUnavailable,
  );
  captureAccessibilityHierarchy('calendar-principal-validation-unavailable', [
    {
      id: 'safe-route-login-notice',
      label: 'SafeRoute could not verify this saved session. Retry or sign in again.',
      enabled: true,
    },
    {
      id: 'safe-route-login-saved-session-retry',
      label: 'Retry saved session verification',
      enabled: true,
    },
    {
      id: 'safe-route-login-email',
      label: 'LunarChain email',
      enabled: true,
    },
  ]);

  terminateExpoGo(deviceId);
  setControl(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
    [],
    GUIDANCE_CONTRACT_MODES.principalValidationUnavailable,
  );
  await runFlow(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch,
    'cold relaunch with saved principal-A data still quarantined offline',
    flows.calendarPrincipalValidationOfflineRelaunch,
  );
  captureAccessibilityHierarchy(
    'calendar-principal-validation-offline-relaunch',
    [
      {
        id: 'safe-route-login-notice',
        label:
          'SafeRoute could not verify this saved session. Retry or sign in again.',
        enabled: true,
      },
      {
        id: 'safe-route-login-saved-session-retry',
        label: 'Retry saved session verification',
        enabled: true,
      },
    ],
  );
  await assertProductTrafficQuiet([
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch,
  ], 1_000);
  terminateExpoGo(deviceId);

  setControl(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change,
    CONNECTIVITY_CONTRACT_STATUSES.online,
    [],
    GUIDANCE_CONTRACT_MODES.wrongPrincipal,
  );
  await runFlow(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change,
    'reject a saved principal-A session when validation resolves principal B',
    flows.calendarPrincipalChange,
  );
  await waitForEvidenceType(
    'offline.calendar.principal-lifecycle',
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change,
  );
  captureAccessibilityHierarchy('calendar-principal-change', [
    {
      id: 'safe-route-login-notice',
      label: 'This saved session belongs to another account. Sign in again.',
      enabled: true,
    },
    {
      id: 'safe-route-login-email',
      label: 'LunarChain email',
      enabled: true,
    },
  ]);

  terminateExpoGo(deviceId);
  setControl(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
    [],
    GUIDANCE_CONTRACT_MODES.wrongPrincipal,
  );
  await runFlow(
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
    'cold relaunch offline through durable principal revocation to global absence',
    flows.calendarPrincipalChangeRelaunch,
  );
  await waitForEvidenceCause(
    'offline.calendar.principal-lifecycle',
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
    'principal-change-relaunch-revoked',
  );
  await waitForEvidenceCause(
    'offline.calendar.principal-lifecycle',
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
    'principal-change-relaunch',
  );
  captureAccessibilityHierarchy('calendar-principal-change-relaunch', [
    {
      id: 'guest-map-primary-action',
      label: 'Sign in to SafeRoute',
      enabled: true,
    },
  ]);
  await assertProductTrafficQuiet([
    OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
  ], 1_000);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  terminateExpoGo(deviceId);
  await waitForAllRequestsTerminal();

  const requests = readRequestJournal();
  const evidence = readEvidenceJournal();
  assertGuidanceContractRequestJournal(requests, {
    expectedModeByPhase: {
      [CONNECTIVITY_CONTRACT_PHASES.seed]: GUIDANCE_CONTRACT_MODES.active,
      [OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable]:
        GUIDANCE_CONTRACT_MODES.principalValidationUnavailable,
      [OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch]:
        GUIDANCE_CONTRACT_MODES.principalValidationUnavailable,
      [OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change]:
        GUIDANCE_CONTRACT_MODES.wrongPrincipal,
      [OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch]:
        GUIDANCE_CONTRACT_MODES.wrongPrincipal,
    },
    requiredPhases: [
      CONNECTIVITY_CONTRACT_PHASES.seed,
      OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationUnavailable,
      OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.validationOfflineRelaunch,
      OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.change,
      OFFLINE_CALENDAR_PRINCIPAL_CONTRACT_PHASES.relaunch,
    ],
  });
  assertOfflineCalendarPrincipalChangeTraffic(requests, evidence);
  assertGuidanceContractEvidenceJournal(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
    requiredTypes: ['offline.calendar.principal-lifecycle'],
  });
  assertOfflineCalendarPrincipalChangeEvidence(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
  });

  process.stdout.write(
    `Offline Calendar principal-change runtime passed. Request journal: ${requestLogFile}. ` +
      `Evidence journal: ${evidenceLogFile}. Screenshots: ${screenshotDirectory}. ` +
      `Accessibility hierarchies: ${accessibilityDirectory}\n`,
  );
}

async function runCalendarWorkspaceDenialSlice(sourceRevision) {
  assertOperationsCalendarAuthCleanupSeed(readRequestJournal());
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.seed,
    'keep the Guidance workspace active before an owned Operations denial',
    flows.calendarWorkspaceDenialPrepare,
  );

  setControl(
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
    CONNECTIVITY_CONTRACT_STATUSES.online,
    [],
    GUIDANCE_CONTRACT_MODES.denied,
  );
  await runFlow(
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
    'deny Guidance Operations, reconcile Support, and preserve disabled saving',
    flows.calendarWorkspaceDenial,
  );
  await waitForEvidenceType(
    'workspace.recovery.settled',
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
  );
  await waitForEvidenceType(
    'offline.calendar.workspace-lifecycle',
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
  );
  captureAccessibilityHierarchy('calendar-workspace-denial-support', [
    {
      id: 'guest-map-workspace-selector',
      label: 'Workspace, Support Operations',
      enabled: true,
    },
  ]);

  terminateExpoGo(deviceId);
  setControl(
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch,
    CONNECTIVITY_CONTRACT_STATUSES.offline,
    [],
    GUIDANCE_CONTRACT_MODES.denied,
  );
  await runFlow(
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch,
    'cold relaunch offline with Guidance revoked and Support saving still off',
    flows.calendarWorkspaceDenialRelaunch,
  );
  await waitForEvidenceType(
    'offline.calendar.workspace-lifecycle',
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch,
  );
  captureAccessibilityHierarchy('calendar-workspace-denial-relaunch', [
    {
      id: 'safe-route-operations-calendar-saving-status',
      label: 'Support Operations. Offline Calendar saving is off. Nothing will be saved for this workspace until you allow it. Online Operations are unchanged.',
      enabled: true,
    },
    {
      id: 'safe-route-operations-calendar-saving-control',
      label: 'Allow offline Calendar saving for Support Operations on this device',
      enabled: true,
    },
    {
      id: 'safe-route-operations-empty-state',
      label: 'No offline Calendar is saved. Allow offline saving, then reconnect and sync to save a new Calendar.',
      enabled: true,
    },
  ]);
  await assertProductTrafficQuiet([
    OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch,
  ], 1_000);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  terminateExpoGo(deviceId);
  await waitForAllRequestsTerminal();

  const requests = readRequestJournal();
  const evidence = readEvidenceJournal();
  assertGuidanceContractRequestJournal(requests, {
    expectedModeByPhase: {
      [CONNECTIVITY_CONTRACT_PHASES.seed]: GUIDANCE_CONTRACT_MODES.active,
      [OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial]:
        GUIDANCE_CONTRACT_MODES.denied,
      [OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch]:
        GUIDANCE_CONTRACT_MODES.denied,
    },
    requiredPhases: [
      CONNECTIVITY_CONTRACT_PHASES.seed,
      OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.denial,
      OFFLINE_CALENDAR_WORKSPACE_CONTRACT_PHASES.relaunch,
    ],
  });
  assertOfflineCalendarWorkspaceDenialTraffic(requests);
  assertGuidanceContractEvidenceJournal(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
    requiredTypes: [
      'workspace.recovery.settled',
      'offline.calendar.workspace-lifecycle',
    ],
  });
  assertOfflineCalendarWorkspaceRevocationEvidence(evidence, {
    expectedSourceRevision: sourceRevision,
    minimumOccurredAtMs: startedAtMs,
  });

  process.stdout.write(
    `Offline Calendar workspace-denial runtime passed. Request journal: ${requestLogFile}. ` +
      `Evidence journal: ${evidenceLogFile}. Screenshots: ${screenshotDirectory}. ` +
      `Accessibility hierarchies: ${accessibilityDirectory}\n`,
  );
}

function assertOperationsCalendarSeed(entries) {
  const path =
    '/api/v1/mobile/safe-route/operations/client/66a1b2c3d4e5f60718293a40';
  const requests = entries.filter(
    (entry) =>
      entry.event === 'request' &&
      entry.phase === CONNECTIVITY_CONTRACT_PHASES.seed &&
      entry.method === 'GET' &&
      entry.path === path,
  );
  assertCondition(
    requests.length === 1,
    `Connectivity seed expected one Guidance Operations request, received ${requests.length}.`,
  );
  const completions = entries.filter(
    (entry) =>
      entry.event === 'completion' &&
      entry.requestId === requests[0].requestId,
  );
  assertCondition(
    completions.length === 1 &&
      completions[0].completed === true &&
      completions[0].semanticOutcome === 'operations-active' &&
      completions[0].statusCode === 200,
    'Connectivity seed Operations request did not complete as operations-active.',
  );
}

function assertOperationsCalendarAuthCleanupSeed(entries) {
  const guidancePath =
    '/api/v1/mobile/safe-route/operations/client/66a1b2c3d4e5f60718293a40';
  const supportPath =
    '/api/v1/mobile/safe-route/operations/client/66a1b2c3d4e5f60718293a41';
  const requestsFor = (path) => entries.filter(
    (entry) =>
      entry.event === 'request' &&
      entry.phase === CONNECTIVITY_CONTRACT_PHASES.seed &&
      entry.method === 'GET' &&
      entry.path === path,
  );
  const completedActive = (request) => entries.some(
    (entry) =>
      entry.event === 'completion' &&
      entry.requestId === request.requestId &&
      entry.completed === true &&
      entry.semanticOutcome === 'operations-active' &&
      entry.statusCode === 200,
  );
  const guidanceRequests = requestsFor(guidancePath);
  const supportRequests = requestsFor(supportPath);
  assertCondition(
    guidanceRequests.length >= 2 &&
      supportRequests.length === 1 &&
      guidanceRequests.every(completedActive) &&
      supportRequests.every(completedActive) &&
      supportRequests[0].sequence < guidanceRequests.at(-1).sequence,
    'Calendar auth cleanup seed did not preserve disabled Support consent before reseeding Guidance Operations.',
  );
}

function setControl(
  phase,
  connectivity,
  calendarAuthFaults = [],
  mode = GUIDANCE_CONTRACT_MODES.active,
) {
  connectivitySequence += 1;
  writeFileSync(
    pendingControlFile,
    JSON.stringify({
      calendarAuthFaults,
      catalogReleased: true,
      connectivity,
      connectivitySequence,
      mode,
      phase,
      sourceRevision: currentSourceRevision,
    }),
    'utf8',
  );
  renameSync(pendingControlFile, controlFile);
}

async function startApi() {
  apiProcess = spawn(process.execPath, [
    'scripts/maestro-guidance-contract-api.mjs',
    '--port',
    String(GUIDANCE_CONTRACT_API_PORT),
    '--control-file',
    controlFile,
    '--request-log',
    requestLogFile,
    '--evidence-log',
    evidenceLogFile,
  ], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', serverLogFd, serverLogFd],
  });
  await waitForPort(GUIDANCE_CONTRACT_API_PORT, true);
}

async function stopApi() {
  if (!apiProcess) {
    return;
  }
  const processToStop = apiProcess;
  if (processToStop.exitCode === null && processToStop.signalCode === null) {
    processToStop.kill('SIGTERM');
    if (!(await waitForProcessExit(processToStop, 5000))) {
      processToStop.kill('SIGKILL');
      if (!(await waitForProcessExit(processToStop, 2000))) {
        throw new Error('Connectivity contract API did not stop.');
      }
    }
  }
  apiProcess = null;
  await waitForPort(GUIDANCE_CONTRACT_API_PORT, false);
}

function runFlow(phase, label, file) {
  const run = startFlow(phase, label, file);
  return finishFlow(run);
}

function startFlow(phase, label, file) {
  process.stdout.write(`\n[connectivity-contract] ${phase}: ${label}\n`);
  const child = spawn(process.execPath, [
    'scripts/run-maestro.mjs',
    'test',
    `--udid=${deviceId}`,
    `--test-output-dir=${screenshotDirectory}`,
    file,
  ], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, MAESTRO_RETRIES: '0' },
    stdio: 'inherit',
  });
  const settled = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  activeFlow = { child, label, phase, settled };
  return activeFlow;
}

async function finishFlow(run) {
  try {
    await waitForBoundedMaestroPhase({
      label: run.label,
      settled: run.settled,
      stop: () => stopFlow(run),
      timeoutMs: MAESTRO_PHASE_TIMEOUT_MS,
    });
  } finally {
    if (activeFlow === run) {
      activeFlow = null;
    }
  }
}

async function stopActiveFlow() {
  const run = activeFlow;
  if (!run) {
    return;
  }
  activeFlow = null;
  await stopFlow(run);
}

async function stopFlow(run) {
  if (run.child.exitCode !== null || run.child.signalCode !== null) {
    return;
  }
  if (!Number.isInteger(run.child.pid)) {
    return;
  }
  try {
    process.kill(-run.child.pid, 'SIGTERM');
  } catch {
    return;
  }
  if (await waitForProcessExit(run.child, 3000)) {
    return;
  }
  process.kill(-run.child.pid, 'SIGKILL');
  if (!(await waitForProcessExit(run.child, 2000))) {
    throw new Error(`Maestro phase did not exit: ${run.label}`);
  }
}

async function waitForHeldReachability(phase) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const entries = readRequestJournal();
    const held = entries.find((entry) =>
      entry.event === 'request' &&
      entry.phase === phase &&
      entry.method === 'HEAD' &&
      entry.path === CONNECTIVITY_CONTRACT_REACHABILITY_PATH &&
      !entries.some((candidate) =>
        candidate.event === 'completion' &&
        candidate.requestId === entry.requestId
      )
    );
    if (held) {
      assertNoProductTraffic(entries, [phase]);
      return held;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${phase} did not hold a real NetInfo reachability request.`);
}

async function waitForReachabilityOutcome(phase, outcome) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const completion = readRequestJournal().find((entry) =>
      entry.event === 'completion' &&
      entry.phase === phase &&
      entry.path === CONNECTIVITY_CONTRACT_REACHABILITY_PATH &&
      entry.semanticOutcome === outcome
    );
    if (completion) {
      return completion;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${phase} did not settle reachability as ${outcome}.`);
}

async function waitForEvidenceType(type, serverPhase) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const entry = readEvidenceJournal().find(
      (candidate) =>
        candidate.type === type && candidate.serverPhase === serverPhase,
    );
    if (entry) {
      return entry;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Device evidence did not record ${type} in ${serverPhase}.`);
}

async function waitForEvidenceOutcome(type, serverPhase, outcome) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const entry = readEvidenceJournal().find(
      (candidate) =>
        candidate.type === type &&
        candidate.serverPhase === serverPhase &&
        candidate.outcome === outcome,
    );
    if (entry) {
      return entry;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Device evidence did not record ${type}/${outcome} in ${serverPhase}.`,
  );
}

async function waitForEvidenceCause(type, serverPhase, cause) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const entry = readEvidenceJournal().find(
      (candidate) =>
        candidate.type === type &&
        candidate.serverPhase === serverPhase &&
        candidate.cause === cause,
    );
    if (entry) {
      return entry;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Device evidence did not record ${type}/${cause} in ${serverPhase}.`,
  );
}

async function waitForReconnectAuthorization(
  settlementSequence,
  reconnectPhase = CONNECTIVITY_CONTRACT_PHASES.reconnectChecking,
  onlinePhase = CONNECTIVITY_CONTRACT_PHASES.online,
) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const requests = readRequestJournal();
    const phaseRequests = apiRequests(
      requests,
      onlinePhase,
    );
    if (
      phaseRequests.some((entry) => entry.path === '/api/v1/users/me') &&
      phaseRequests.some((entry) =>
        entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
      )
    ) {
      assertConnectivityContractReconnectAuthorization(requests, {
        onlinePhase,
        reconnectPhase,
        settlementSequence,
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Online reconnect did not complete principal/catalog authorization.');
}

async function assertProductTrafficQuiet(phases, observationMs) {
  assertNoProductTraffic(readRequestJournal(), phases);
  await new Promise((resolve) => setTimeout(resolve, observationMs));
  assertNoProductTraffic(readRequestJournal(), phases);
}

function assertNoProductTrafficBeforeOnline(entries) {
  assertNoProductTraffic(entries, [
    CONNECTIVITY_CONTRACT_PHASES.coldChecking,
    CONNECTIVITY_CONTRACT_PHASES.offline,
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
    CONNECTIVITY_CONTRACT_PHASES.reconnectChecking,
    CONNECTIVITY_CONTRACT_PHASES.disabledSyncOffline,
    CONNECTIVITY_CONTRACT_PHASES.allowReconnectChecking,
    CONNECTIVITY_CONTRACT_PHASES.resaveOffline,
    CONNECTIVITY_CONTRACT_PHASES.removalRelaunch,
    CONNECTIVITY_CONTRACT_PHASES.resaveReconnectChecking,
  ]);
}

function captureAccessibilityHierarchy(name, expectations) {
  const result = spawnSync(
    maestroBinary,
    [
      `--udid=${deviceId}`,
      'hierarchy',
      '--compact',
      '--no-ansi',
      '--no-reinstall-driver',
    ],
    {
      encoding: 'utf8',
      env: createMaestroProcessEnv(process.env),
      timeout: MAESTRO_PHASE_TIMEOUT_MS,
    },
  );
  assertCondition(
    !result.error && result.status === 0,
    `Accessibility hierarchy capture failed for ${name}: ${result.stderr || result.error || result.status}.`,
  );
  const hierarchy = String(result.stdout || '');
  writeFileSync(join(accessibilityDirectory, `${name}.csv`), hierarchy);
  try {
    assertAccessibilityHierarchyElements(hierarchy, expectations);
  } catch (error) {
    throw new Error(
      `Accessibility hierarchy assertion failed for ${name}: ${String(error)}`,
    );
  }
}

function assertNoProductTraffic(entries, phases) {
  const escaped = entries.filter((entry) =>
    entry.event === 'request' &&
    phases.includes(entry.phase) &&
    entry.path.startsWith('/api/')
  );
  assertCondition(
    escaped.length === 0,
    `Product API traffic escaped before online settlement: ${escaped
      .map((entry) => `${entry.phase} ${entry.method} ${entry.path}${entry.search}`)
      .join(', ')}.`,
  );
}

async function waitForAllRequestsTerminal() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const entries = readRequestJournal();
    const requestIds = entries
      .filter((entry) => entry.event === 'request')
      .map((entry) => entry.requestId);
    if (
      requestIds.length > 0 &&
      requestIds.every((requestId) =>
        entries.filter(
          (entry) =>
            entry.event === 'completion' && entry.requestId === requestId,
        ).length === 1
      )
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Connectivity contract request journal did not drain after app termination.');
}

function terminateExpoGo(udid) {
  const result = spawnSync(
    'xcrun',
    ['simctl', 'terminate', udid, EXPO_GO_BUNDLE_ID],
    {
    stdio: 'ignore',
    timeout: 5000,
    },
  );
  assertCondition(
    !result.error && result.status === 0,
    'Expo Go could not be terminated before final journal validation.',
  );
}

function apiRequests(entries, phase) {
  return entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === phase &&
    entry.path.startsWith('/api/')
  );
}

function readRequestJournal() {
  return readJsonLines(requestLogFile);
}

function readEvidenceJournal() {
  return readJsonLines(evidenceLogFile);
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

function readCurrentSourceRevision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim().toLowerCase();
}

function readCurrentSourceStatus() {
  return execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function assertBootedSimulator(udid) {
  const output = execFileSync(
    'xcrun',
    ['simctl', 'list', 'devices', 'booted', '-j'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    },
  );
  const devices = Object.values(JSON.parse(output).devices || {}).flat();
  assertCondition(
    devices.some((device) => device.udid === udid && device.state === 'Booted'),
    `Simulator ${udid} is not booted.`,
  );
}

function grantRuntimeLocationPermission(udid) {
  execFileSync(
    'xcrun',
    ['simctl', 'privacy', udid, 'grant', 'location', EXPO_GO_BUNDLE_ID],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 5000 },
  );
}

async function waitForPort(port, expectedListening) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await isPortListening(port)) === expectedListening) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Port ${port} did not become ${expectedListening ? 'ready' : 'free'}.`,
  );
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
