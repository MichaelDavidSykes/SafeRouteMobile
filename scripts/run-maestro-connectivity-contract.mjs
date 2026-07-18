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
  assertConnectivityContractEndedJourneyStayedClosed,
  assertConnectivityContractInactiveGuidanceRevocation,
  assertConnectivityContractInactiveSessionRevocation,
  assertConnectivityContractReconnectAuthorization,
  assertGuidanceContractEvidenceJournal,
  assertGuidanceContractRequestJournal,
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
  offlineEnd: 'maestro/ios-connectivity-contract-offline-end.yaml',
  offlineObserve: 'maestro/ios-connectivity-contract-offline-observe.yaml',
  offlineRelaunch: 'maestro/ios-connectivity-contract-offline-relaunch.yaml',
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
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.seed,
    'start and pause one exact workspace journey',
    flows.seedJourney,
  );
  await waitForEvidenceType(
    'navigation.persisted',
    CONNECTIVITY_CONTRACT_PHASES.seed,
  );

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
  ]);
  await runFlow(
    CONNECTIVITY_CONTRACT_PHASES.offlineRelaunch,
    'return to the offline map after Operations cache evidence',
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

function setControl(phase, connectivity) {
  connectivitySequence += 1;
  writeFileSync(
    pendingControlFile,
    JSON.stringify({
      catalogReleased: true,
      connectivity,
      connectivitySequence,
      mode: GUIDANCE_CONTRACT_MODES.active,
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

async function waitForReconnectAuthorization(settlementSequence) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const requests = readRequestJournal();
    const phaseRequests = apiRequests(
      requests,
      CONNECTIVITY_CONTRACT_PHASES.online,
    );
    if (
      phaseRequests.some((entry) => entry.path === '/api/v1/users/me') &&
      phaseRequests.some((entry) =>
        entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
      )
    ) {
      assertConnectivityContractReconnectAuthorization(requests, {
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
