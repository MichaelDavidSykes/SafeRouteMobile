#!/usr/bin/env node
import { openSync, readFileSync, realpathSync, renameSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GUIDANCE_CONTRACT_API_PORT,
  GUIDANCE_CONTRACT_MODES,
  GUIDANCE_CONTRACT_WORKSPACES,
  WORKSPACE_CATALOG_RECOVERY_PHASES,
  WORKSPACE_CATALOG_RETRY_DELAY_MS,
  WORKSPACE_CATALOG_SUCCESS_DELAY_MS
} from './maestro-guidance-contract-api.mjs';
import {
  assertGuidanceSourceCheckoutClean,
  verifyGuidanceContractMetroIdentity
} from './maestro-guidance-metro-identity.mjs';

const METRO_PORT = 8081;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';
const COMPACT_DEVICE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation';
const REQUIRED_CONTENT_SIZE = 'accessibility-large';
const deviceId = String(process.env.SAFEROUTE_IOS_DEVICE_ID || '').trim();
const tempDirectory = mkdtempSync(join(tmpdir(), 'saferoute-workspace-catalog-recovery-'));
const controlFile = join(tempDirectory, 'control.json');
const pendingControlFile = join(tempDirectory, 'control.pending.json');
const requestLogFile = join(tempDirectory, 'requests.jsonl');
const evidenceLogFile = join(tempDirectory, 'evidence.jsonl');
const serverLogFile = join(tempDirectory, 'server.log');
const screenshotDirectory = join(tempDirectory, 'screenshots');
const serverLogFd = openSync(serverLogFile, 'a');
let apiProcess = null;

const flows = Object.freeze({
  coldFailure: 'maestro/ios-workspace-catalog-recovery-cold-failure.yaml',
  foregroundLoss: 'maestro/ios-workspace-catalog-recovery-foreground-loss.yaml',
  mapRetry: 'maestro/ios-workspace-catalog-recovery-map-retry.yaml',
  operationsRetry: 'maestro/ios-workspace-catalog-recovery-operations-retry.yaml',
  reset: 'maestro/ios-guidance-contract-reset.yaml',
  savedRetry: 'maestro/ios-workspace-catalog-recovery-saved-retry.yaml',
  seed: 'maestro/ios-workspace-catalog-recovery-seed.yaml',
  success: 'maestro/ios-workspace-catalog-recovery-success.yaml'
});

async function main() {
  assertCondition(deviceId, 'Set SAFEROUTE_IOS_DEVICE_ID to the booted compact simulator UDID.');
  const simulator = assertCompactSimulator(deviceId);
  if (!(await isPortListening(METRO_PORT))) {
    throw new Error(
      'Workspace catalog recovery requires the no-build contract Metro listener on port 8081. ' +
      'Run `npm run start:maestro:ios:workspace-catalog-recovery` first.'
    );
  }
  if (await isPortListening(GUIDANCE_CONTRACT_API_PORT)) {
    throw new Error(`Port ${GUIDANCE_CONTRACT_API_PORT} is already in use.`);
  }

  assertGuidanceSourceCheckoutClean(readCurrentSourceStatus());
  const metroIdentity = await verifyGuidanceContractMetroIdentity({
    expectedApiUrl: `http://127.0.0.1:${GUIDANCE_CONTRACT_API_PORT}`,
    expectedProjectRoot: realpathSync(process.cwd()),
    expectedSlug: 'saferoute-mobile',
    expectedSourceRevision: readCurrentSourceRevision(),
    manifestUrl: `http://127.0.0.1:${METRO_PORT}`
  });
  process.stdout.write(
    `[workspace-catalog-recovery] verified ${simulator.name}, ${REQUIRED_CONTENT_SIZE}, ` +
    `source ${metroIdentity.sourceRevision}\n`
  );

  grantRuntimeLocationPermission(deviceId);
  mkdirSync(screenshotDirectory, { recursive: true });
  await startApi(WORKSPACE_CATALOG_RECOVERY_PHASES.seed);
  runPhase(WORKSPACE_CATALOG_RECOVERY_PHASES.seed, 'reset to the signed-out Map', flows.reset);
  runPhase(WORKSPACE_CATALOG_RECOVERY_PHASES.seed, 'seed stable-principal workspace caches', flows.seed);
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.initialFailure,
    'cold-restore cached Map after a fresh catalog failure',
    flows.coldFailure
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.mapRetryFailure,
    'show one disabled Map retry and its repeated failure',
    flows.mapRetry
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure,
    'show one disabled Saved retry and its repeated failure',
    flows.savedRetry
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure,
    'show one disabled Operations retry and its repeated failure',
    flows.operationsRetry
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess,
    'restore fresh access from Operations and retain all surfaces',
    flows.success
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss,
    'revalidate and close a lost workspace after returning from background',
    flows.foregroundLoss,
    GUIDANCE_CONTRACT_MODES.denied
  );

  assertRecoveryJournal(readRequestJournal());
  process.stdout.write(
    `Workspace catalog recovery runtime passed. Request journal: ${requestLogFile}. ` +
    `Screenshots: ${screenshotDirectory}\n`
  );
}

function assertCompactSimulator(udid) {
  const output = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000
  });
  const devices = Object.values(JSON.parse(output).devices || {}).flat();
  const simulator = devices.find((device) => device.udid === udid && device.state === 'Booted');
  assertCondition(simulator, `Simulator ${udid} is not the booted iOS simulator.`);
  assertCondition(
    simulator.deviceTypeIdentifier === COMPACT_DEVICE_TYPE,
    `Workspace recovery requires iPhone SE (3rd generation); received ${simulator.deviceTypeIdentifier || simulator.name}.`
  );
  const contentSize = execFileSync('xcrun', ['simctl', 'ui', udid, 'content_size'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000
  }).trim();
  assertCondition(
    contentSize === REQUIRED_CONTENT_SIZE,
    `Workspace recovery requires ${REQUIRED_CONTENT_SIZE}; received ${contentSize}.`
  );
  return simulator;
}

function grantRuntimeLocationPermission(udid) {
  execFileSync(
    'xcrun',
    ['simctl', 'privacy', udid, 'grant', 'location', EXPO_GO_BUNDLE_ID],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 5000
    }
  );
}

async function startApi(phase) {
  setControl(phase);
  apiProcess = spawn(process.execPath, [
    'scripts/maestro-guidance-contract-api.mjs',
    '--port', String(GUIDANCE_CONTRACT_API_PORT),
    '--control-file', controlFile,
    '--request-log', requestLogFile,
    '--evidence-log', evidenceLogFile
  ], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', serverLogFd, serverLogFd]
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
        throw new Error('Workspace catalog contract API did not stop.');
      }
    }
  }
  apiProcess = null;
  await waitForPort(GUIDANCE_CONTRACT_API_PORT, false);
}

function setControl(phase, mode = GUIDANCE_CONTRACT_MODES.active) {
  writeFileSync(
    pendingControlFile,
    JSON.stringify({ mode, phase }),
    'utf8'
  );
  renameSync(pendingControlFile, controlFile);
}

function runPhase(phase, label, file, mode = GUIDANCE_CONTRACT_MODES.active) {
  setControl(phase, mode);
  process.stdout.write(`\n[workspace-catalog-recovery] ${phase}: ${label}\n`);
  const result = spawnSync(process.execPath, [
    'scripts/run-maestro.mjs',
    'test',
    `--udid=${deviceId}`,
    `--test-output-dir=${screenshotDirectory}`,
    file
  ], {
    cwd: process.cwd(),
    env: { ...process.env, MAESTRO_RETRIES: '0' },
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Maestro phase failed (${result.status ?? 'signal'}): ${label}`);
  }
}

function assertRecoveryJournal(entries) {
  const requests = entries.filter((entry) => entry.event === 'request');
  for (const request of requests) {
    const completions = entries.filter(
      (entry) => entry.event === 'completion' && entry.requestId === request.requestId
    );
    assertCondition(
      completions.length === 1 && completions[0].sequence > request.sequence,
      `Request ${request.requestId} did not record exactly one later completion.`
    );
  }

  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-initial-unavailable',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 2,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.initialFailure,
    statusCode: 503
  });
  for (const phase of [
    WORKSPACE_CATALOG_RECOVERY_PHASES.mapRetryFailure,
    WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure,
    WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure
  ]) {
    assertAuthorizationAttempts(entries, {
      catalogOutcome: 'catalog-retry-unavailable',
      expectedAttemptCount: 1,
      expectedUserCountBeforeCatalog: 1,
      minimumCatalogDurationMs: WORKSPACE_CATALOG_RETRY_DELAY_MS - 250,
      phase,
      statusCode: 503
    });
  }
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-active',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: WORKSPACE_CATALOG_SUCCESS_DELAY_MS - 250,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess,
    statusCode: 200
  });
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-survivor',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss,
    statusCode: 200
  });

  const scopedRouteRequests = requests.filter((entry) =>
    [
      WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure,
      WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure
    ].includes(entry.phase) &&
    entry.path === '/api/v1/mobile/safe-route/routes' &&
    new URLSearchParams(entry.search).get('client_id') === GUIDANCE_CONTRACT_WORKSPACES.denied.id
  );
  const operationsRequests = requests.filter((entry) =>
    entry.phase === WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure &&
    entry.path === `/api/v1/mobile/safe-route/operations/client/${GUIDANCE_CONTRACT_WORKSPACES.denied.id}`
  );
  assertCondition(scopedRouteRequests.length >= 2, 'Saved and Operations did not retain scoped route reads during retry.');
  assertCondition(operationsRequests.length >= 1, 'Operations did not load its active cached workspace during retry.');
  assertSuccessfulProtectedRequests(entries, scopedRouteRequests, 'catalog-active');
  assertSuccessfulProtectedRequests(entries, operationsRequests, 'operations-active');
  const foregroundSurvivorRequests = requests.filter((entry) =>
    entry.phase === WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss &&
    entry.path === '/api/v1/mobile/safe-route/routes' &&
    new URLSearchParams(entry.search).get('client_id') === GUIDANCE_CONTRACT_WORKSPACES.survivor.id
  );
  assertCondition(
    foregroundSurvivorRequests.length >= 1,
    'Foreground membership loss did not reload Saved for the surviving workspace.'
  );
  assertSuccessfulProtectedRequests(entries, foregroundSurvivorRequests, 'catalog-survivor');
}

function assertSuccessfulProtectedRequests(entries, requests, expectedOutcome) {
  for (const request of requests) {
    const completion = completionFor(entries, request);
    assertCondition(
      request.authorized === true &&
      request.authorizationClass === 'expected-bearer' &&
      completion.sequence > request.sequence &&
      completion.completed === true &&
      completion.statusCode === 200 &&
      completion.semanticOutcome === expectedOutcome,
      `${request.phase} ${request.path} did not complete as an authorized ${expectedOutcome} request.`
    );
  }
}

function assertAuthorizationAttempts(entries, {
  catalogOutcome,
  expectedAttemptCount,
  expectedUserCountBeforeCatalog,
  minimumCatalogDurationMs,
  phase,
  statusCode
}) {
  const requests = entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === phase &&
    (
      entry.path === '/api/v1/users/me' ||
      (entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === '')
    )
  );
  const expectedRequestCount = expectedAttemptCount * (expectedUserCountBeforeCatalog + 1);
  assertCondition(
    requests.length === expectedRequestCount,
    `${phase} expected ${expectedRequestCount} principal/catalog requests, received ${requests.length}.`
  );

  for (let attempt = 0; attempt < expectedAttemptCount; attempt += 1) {
    const offset = attempt * (expectedUserCountBeforeCatalog + 1);
    const users = requests.slice(offset, offset + expectedUserCountBeforeCatalog);
    const catalog = requests[offset + expectedUserCountBeforeCatalog];
    assertCondition(
      users.every((entry) => entry.path === '/api/v1/users/me') &&
      catalog?.path === '/api/v1/mobile/safe-route/routes',
      `${phase} attempt ${attempt + 1} did not preserve principal-before-catalog ordering.`
    );
    const userCompletions = users.map((request) => completionFor(entries, request));
    const catalogCompletion = completionFor(entries, catalog);
    assertCondition(
      userCompletions.every((completion) =>
        completion.completed === true &&
        completion.statusCode === 200 &&
        completion.semanticOutcome === 'principal-a'
      ),
      `${phase} attempt ${attempt + 1} did not complete every principal check.`
    );
    assertCondition(
      userCompletions.at(-1).sequence < catalog.sequence &&
      catalogCompletion.completed === true &&
      catalogCompletion.statusCode === statusCode &&
      catalogCompletion.semanticOutcome === catalogOutcome &&
      catalogCompletion.durationMs >= minimumCatalogDurationMs,
      `${phase} attempt ${attempt + 1} did not complete the expected catalog outcome.`
    );
  }
}

function completionFor(entries, request) {
  const completions = entries.filter(
    (entry) => entry.event === 'completion' && entry.requestId === request?.requestId
  );
  assertCondition(completions.length === 1, `Request ${request?.requestId} completion is missing or duplicated.`);
  return completions[0];
}

function readRequestJournal() {
  try {
    return readFileSync(requestLogFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function readCurrentSourceRevision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000
  }).trim().toLowerCase();
}

function readCurrentSourceStatus() {
  return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000
  });
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(300, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function waitForPort(port, expectedListening) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await isPortListening(port)) === expectedListening) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Port ${port} did not become ${expectedListening ? 'available' : 'closed'}.`);
}

function waitForProcessExit(processToStop, timeoutMs) {
  if (processToStop.exitCode !== null || processToStop.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    processToStop.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  try {
    spawnSync('xcrun', ['simctl', 'terminate', deviceId || 'booted', EXPO_GO_BUNDLE_ID], {
      stdio: 'ignore',
      timeout: 8000
    });
  } catch {
    // Best effort: keep the original runtime failure.
  }
  process.exitCode = 1;
} finally {
  await stopApi().catch(() => undefined);
  if (process.exitCode) {
    process.stderr.write(`Workspace catalog server log: ${serverLogFile}\n`);
    process.stderr.write(`Workspace catalog request journal: ${requestLogFile}\n`);
    process.stderr.write(`Workspace catalog screenshots: ${screenshotDirectory}\n`);
  }
}
