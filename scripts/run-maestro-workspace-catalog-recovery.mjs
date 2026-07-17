#!/usr/bin/env node
import { existsSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GUIDANCE_CONTRACT_API_PORT,
  GUIDANCE_CONTRACT_MODES,
  GUIDANCE_CONTRACT_ROUTE_IDS,
  GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS,
  GUIDANCE_CONTRACT_WORKSPACES,
  WORKSPACE_CATALOG_RECOVERY_PHASES,
  WORKSPACE_CATALOG_RETRY_DELAY_MS,
  WORKSPACE_CATALOG_SUCCESS_DELAY_MS,
  assertGuidanceContractEvidenceJournal,
  assertGuidanceContractRequestJournal
} from './maestro-guidance-contract-api.mjs';
import {
  assertGuidanceSourceCheckoutClean,
  verifyGuidanceContractMetroIdentity
} from './maestro-guidance-metro-identity.mjs';

const METRO_PORT = 8081;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';
const COMPACT_DEVICE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation';
const REQUIRED_CONTENT_SIZE = 'accessibility-large';
const requestedSlice = String(process.env.SAFEROUTE_WORKSPACE_RECOVERY_SLICE || '').trim();
const restoreEndSliceOnly = requestedSlice === 'restore-end';
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
  foregroundBackground: 'maestro/ios-workspace-catalog-recovery-background.yaml',
  coldFailure: 'maestro/ios-workspace-catalog-recovery-cold-failure.yaml',
  foregroundJourneyChecking: 'maestro/ios-workspace-catalog-recovery-journey-foreground-checking.yaml',
  foregroundLoss: 'maestro/ios-workspace-catalog-recovery-foreground-loss.yaml',
  foregroundStartGateChecking: 'maestro/ios-workspace-catalog-recovery-start-gate-checking.yaml',
  foregroundStartGateReady: 'maestro/ios-workspace-catalog-recovery-start-gate-ready.yaml',
  journeyForegroundFailureChecking: 'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-checking.yaml',
  journeyForegroundFailureOutcome: 'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-outcome.yaml',
  journeyRestoreEndChecking: 'maestro/ios-workspace-catalog-recovery-journey-restore-end-checking.yaml',
  journeyRestoreEndOutcome: 'maestro/ios-workspace-catalog-recovery-journey-restore-end-outcome.yaml',
  journeyRestoreFailure: 'maestro/ios-workspace-catalog-recovery-journey-restore-failure.yaml',
  journeyRestoreReload: 'maestro/ios-workspace-catalog-recovery-journey-restore-reload.yaml',
  journeyPrepare: 'maestro/ios-workspace-catalog-recovery-journey-prepare.yaml',
  journeyStart: 'maestro/ios-workspace-catalog-recovery-journey-start.yaml',
  mapRetry: 'maestro/ios-workspace-catalog-recovery-map-retry.yaml',
  operationsRetry: 'maestro/ios-workspace-catalog-recovery-operations-retry.yaml',
  reset: 'maestro/ios-guidance-contract-reset.yaml',
  savedRetry: 'maestro/ios-workspace-catalog-recovery-saved-retry.yaml',
  seed: 'maestro/ios-workspace-catalog-recovery-seed.yaml',
  success: 'maestro/ios-workspace-catalog-recovery-success.yaml'
});

const FULL_EXPECTED_MODE_BY_PHASE = Object.freeze({
  [WORKSPACE_CATALOG_RECOVERY_PHASES.seed]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.initialFailure]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.mapRetryFailure]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRoutePrepare]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRouteBackground]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStart]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreReload]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestart]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyBackground]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure]: GUIDANCE_CONTRACT_MODES.active,
  [WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss]: GUIDANCE_CONTRACT_MODES.denied
});

const FULL_REQUIRED_REQUEST_PHASES = Object.freeze([
  WORKSPACE_CATALOG_RECOVERY_PHASES.seed,
  WORKSPACE_CATALOG_RECOVERY_PHASES.initialFailure,
  WORKSPACE_CATALOG_RECOVERY_PHASES.mapRetryFailure,
  WORKSPACE_CATALOG_RECOVERY_PHASES.savedRetryFailure,
  WORKSPACE_CATALOG_RECOVERY_PHASES.operationsRetryFailure,
  WORKSPACE_CATALOG_RECOVERY_PHASES.freshSuccess,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRoutePrepare,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStart,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreReload,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestart,
  WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure,
  WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss
]);

const RESTORE_END_EXPECTED_MODE_BY_PHASE = Object.freeze(
  Object.fromEntries(
    FULL_REQUIRED_REQUEST_PHASES
      .filter((phase) => ![
        WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate,
        WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreReload,
        WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestart,
        WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss
      ].includes(phase))
      .map((phase) => [phase, GUIDANCE_CONTRACT_MODES.active])
  )
);

const RESTORE_END_REQUIRED_REQUEST_PHASES = Object.freeze(
  Object.keys(RESTORE_END_EXPECTED_MODE_BY_PHASE)
);

async function main() {
  assertCondition(deviceId, 'Set SAFEROUTE_IOS_DEVICE_ID to the booted compact simulator UDID.');
  assertCondition(
    !requestedSlice || restoreEndSliceOnly,
    `Unsupported workspace recovery slice: ${requestedSlice}.`
  );
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
    `source ${metroIdentity.sourceRevision}, slice ${requestedSlice || 'full'}\n`
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
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRoutePrepare,
    'open the freshly authorized workspace route without starting guidance',
    flows.journeyPrepare,
    GUIDANCE_CONTRACT_MODES.active
  );
  if (!restoreEndSliceOnly) {
    runPhase(
      WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRouteBackground,
      'send the loaded workspace route to the background',
      flows.foregroundBackground,
      GUIDANCE_CONTRACT_MODES.active
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await runHeldCatalogPhase({
      checkingFlow: flows.foregroundStartGateChecking,
      checkingLabel: 'hold a fresh foreground catalog while new Start stays disabled',
      checkingScreenshot: 'workspace-catalog-foreground-start-gated',
      mode: GUIDANCE_CONTRACT_MODES.active,
      outcomeFlow: flows.foregroundStartGateReady,
      outcomeLabel: 'restore new Start only after the held catalog completes',
      phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate
    });
  }
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStart,
    'start and pause the exact current workspace journey',
    flows.journeyStart,
    GUIDANCE_CONTRACT_MODES.active
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure,
    'cold-restore the paused journey into an actionable verification failure',
    flows.journeyRestoreFailure,
    GUIDANCE_CONTRACT_MODES.active
  );
  await runRestoreEndHeldCatalogPhase();
  if (restoreEndSliceOnly) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assertRestoreEndSliceJournal(readRequestJournal(), readEvidenceJournal());
    process.stdout.write(
      `Workspace catalog suspended-journey End slice passed. Request journal: ${requestLogFile}. ` +
      `Evidence journal: ${evidenceLogFile}. Screenshots: ${screenshotDirectory}\n`
    );
    return;
  }
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreReload,
    'reload the exact route only after the End outcome has settled',
    flows.journeyRestoreReload,
    GUIDANCE_CONTRACT_MODES.active
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestart,
    'restart and pause the exact route after explicit suspended guidance cleanup',
    flows.journeyStart,
    GUIDANCE_CONTRACT_MODES.active
  );
  runPhase(
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyBackground,
    'send the paused exact current journey to the background',
    flows.foregroundBackground,
    GUIDANCE_CONTRACT_MODES.active
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  await runHeldCatalogPhase({
    checkingFlow: flows.journeyForegroundFailureChecking,
    checkingLabel: 'keep the exact journey locally available while authorization is held',
    checkingScreenshot: 'workspace-catalog-journey-foreground-failure-checking',
    expectedCatalogOutcome: 'catalog-foreground-unavailable',
    expectedCatalogStatusCode: 503,
    mode: GUIDANCE_CONTRACT_MODES.active,
    outcomeFlow: flows.journeyForegroundFailureOutcome,
    outcomeLabel: 'pause workspace updates after transient authorization failure',
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure
  });
  await runHeldCatalogPhase({
    checkingFlow: flows.foregroundJourneyChecking,
    checkingLabel: 'resume the exact journey while denied authorization is held',
    checkingScreenshot: 'workspace-catalog-journey-foreground-off-route',
    mode: GUIDANCE_CONTRACT_MODES.denied,
    outcomeFlow: flows.foregroundLoss,
    outcomeLabel: 'close the omitted journey and retain only the survivor',
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss,
    whileHeld: injectOffRouteLocationEvidence
  });

  assertFullRecoveryEvidence(readRequestJournal(), readEvidenceJournal());
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

function setControl(
  phase,
  mode = GUIDANCE_CONTRACT_MODES.active,
  { catalogReleased = true } = {}
) {
  writeFileSync(
    pendingControlFile,
    JSON.stringify({ catalogReleased, mode, phase }),
    'utf8'
  );
  renameSync(pendingControlFile, controlFile);
}

function runPhase(phase, label, file, mode = GUIDANCE_CONTRACT_MODES.active) {
  setControl(phase, mode);
  runMaestroFlow(phase, label, file);
}

async function runHeldCatalogPhase({
  checkingFlow,
  checkingLabel,
  checkingScreenshot,
  expectedCatalogOutcome = null,
  expectedCatalogStatusCode = 200,
  mode,
  outcomeFlow,
  outcomeLabel,
  phase,
  whileHeld
}) {
  setControl(phase, mode, { catalogReleased: false });
  const checkingRun = startMaestroFlow(phase, checkingLabel, checkingFlow);
  try {
    await waitForHeldCatalogPending(phase, checkingRun);
    await Promise.all([
      waitForMaestroScreenshot(checkingRun, checkingScreenshot),
      whileHeld ? whileHeld() : Promise.resolve()
    ]);
    assertHeldCatalogPending(readRequestJournal(), phase);
    setControl(phase, mode, { catalogReleased: true });
    await Promise.all([
      waitForCatalogCompletion(phase, {
        semanticOutcome: expectedCatalogOutcome,
        statusCode: expectedCatalogStatusCode
      }),
      finishMaestroFlow(checkingRun)
    ]);
  } catch (error) {
    setControl(phase, mode, { catalogReleased: true });
    await stopMaestroFlow(checkingRun);
    throw error;
  }
  runMaestroFlow(phase, outcomeLabel, outcomeFlow);
}

async function injectOffRouteLocationEvidence() {
  const fixes = [
    [51.5300, -0.0900],
    [51.5301, -0.0901],
    [51.5302, -0.0902],
    [51.5303, -0.0903]
  ];
  for (let index = 0; index < fixes.length; index += 1) {
    const [latitude, longitude] = fixes[index];
    execFileSync(
      'xcrun',
      ['simctl', 'location', deviceId, 'set', `${latitude},${longitude}`],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 5000 }
    );
    if (index < fixes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    }
  }
}

async function runRestoreEndHeldCatalogPhase() {
  const phase = WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd;
  setControl(phase, GUIDANCE_CONTRACT_MODES.active, { catalogReleased: false });
  const checkingRun = startMaestroFlow(
    phase,
    'retry and end suspended guidance inside one held authorization window',
    flows.journeyRestoreEndChecking
  );
  try {
    await waitForHeldCatalogPending(phase, checkingRun);
    await Promise.all([
      waitForMaestroScreenshot(
        checkingRun,
        'workspace-catalog-journey-end-requested-during-held-retry'
      ),
      waitForRestoreEndCleanupEvidence(phase)
    ]);
    assertHeldCatalogPending(readRequestJournal(), phase);
    setControl(phase, GUIDANCE_CONTRACT_MODES.active, { catalogReleased: true });
    await Promise.all([
      waitForCatalogCompletion(phase),
      finishMaestroFlow(checkingRun)
    ]);
  } catch (error) {
    setControl(phase, GUIDANCE_CONTRACT_MODES.active, { catalogReleased: true });
    await stopMaestroFlow(checkingRun);
    throw error;
  }
  assertRestoreEndEvidenceWindow(readRequestJournal(), readEvidenceJournal());
  runMaestroFlow(
    phase,
    'keep the ended journey closed after the retry catalog settles',
    flows.journeyRestoreEndOutcome
  );
}

async function waitForHeldCatalogPending(phase, run) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const entries = readRequestJournal();
    const requests = phaseApiRequests(entries, phase);
    if (requests.length > 2) {
      throw new Error(
        `${phase} recorded protected traffic before its held catalog settled: ${requests
          .map((entry) => `${entry.method} ${entry.path}?${entry.search}`)
          .join(', ')}.`
      );
    }
    if (requests.length === 2) {
      const principalCompletions = entries.filter(
        (entry) => entry.event === 'completion' && entry.requestId === requests[0].requestId
      );
      const catalogCompletions = entries.filter(
        (entry) => entry.event === 'completion' && entry.requestId === requests[1].requestId
      );
      if (catalogCompletions.length > 0) {
        const completion = catalogCompletions[0];
        throw new Error(
          `${phase} catalog settled before release: completed=${completion.completed}, ` +
          `status=${completion.statusCode}, outcome=${completion.semanticOutcome}.`
        );
      }
      if (
        requests[0].path === '/api/v1/users/me' &&
        requests[1].path === '/api/v1/mobile/safe-route/routes' &&
        requests[1].search === '' &&
        principalCompletions.length === 1 &&
        principalCompletions[0].completed === true &&
        principalCompletions[0].statusCode === 200 &&
        principalCompletions[0].sequence < requests[1].sequence &&
        catalogCompletions.length === 0
      ) {
        return;
      }
    }
    if (run?.settled) {
      await finishMaestroFlow(run);
      throw new Error(`${phase} Maestro flow completed before its held catalog began.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${phase} did not reach a held principal/catalog authorization window.`);
}

async function waitForRestoreEndCleanupEvidence(phase) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const evidenceEntries = readEvidenceJournal();
    const cleanup = evidenceEntries.find((entry) =>
      entry.serverPhase === phase &&
      entry.type === 'navigation.cleanup.settled' &&
      entry.sourceRevision === readCurrentSourceRevision() &&
      entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
      entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
      entry.outcome === 'cleared'
    );
    const tracking = evidenceEntries.find((entry) =>
      entry.serverPhase === phase &&
      entry.type === 'tracking.stop.settled' &&
      entry.sourceRevision === readCurrentSourceRevision() &&
      entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
      entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
      entry.outcome === 'off' &&
      entry.navigationInstanceId === cleanup?.navigationInstanceId &&
      entry.appLaunchId === cleanup?.appLaunchId
    );
    if (cleanup && tracking) {
      return { cleanup, tracking };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${phase} did not record acknowledged suspended-journey cleanup evidence.`);
}

function runMaestroFlow(phase, label, file) {
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

function startMaestroFlow(phase, label, file) {
  process.stdout.write(`\n[workspace-catalog-recovery] ${phase}: ${label}\n`);
  const child = spawn(process.execPath, [
    'scripts/run-maestro.mjs',
    'test',
    `--udid=${deviceId}`,
    `--test-output-dir=${screenshotDirectory}`,
    file
  ], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, MAESTRO_RETRIES: '0' },
    stdio: 'inherit'
  });
  const run = {
    child,
    error: null,
    exitCode: null,
    label,
    settled: false,
    signal: null
  };
  run.completion = new Promise((resolve) => {
    const settle = ({ error = null, exitCode = null, signal = null }) => {
      if (run.settled) {
        return;
      }
      run.error = error;
      run.exitCode = exitCode;
      run.signal = signal;
      run.settled = true;
      resolve(run);
    };
    child.once('error', (error) => settle({ error }));
    child.once('exit', (exitCode, signal) => settle({ exitCode, signal }));
  });
  return run;
}

async function finishMaestroFlow(run) {
  await run.completion;
  if (run.error) {
    throw run.error;
  }
  if (run.exitCode !== 0) {
    throw new Error(
      `Maestro phase failed (${run.exitCode ?? run.signal ?? 'signal'}): ${run.label}`
    );
  }
}

async function stopMaestroFlow(run) {
  if (!run.settled && run.child.exitCode === null && run.child.signalCode === null) {
    signalMaestroFlow(run, 'SIGTERM');
    if (!(await waitForProcessExit(run.child, 3000))) {
      signalMaestroFlow(run, 'SIGKILL');
      if (!(await waitForProcessExit(run.child, 2000))) {
        throw new Error(`Maestro process group did not exit after SIGKILL: ${run.label}`);
      }
    }
  }
  await run.completion;
}

function signalMaestroFlow(run, signal) {
  try {
    process.kill(-run.child.pid, signal);
  } catch {
    run.child.kill(signal);
  }
}

async function waitForMaestroScreenshot(run, screenshotName) {
  const screenshotPath = join(
    screenshotDirectory,
    'screenshots',
    `${screenshotName}.png`
  );
  const deadline = Date.now() + 14_000;
  while (Date.now() < deadline) {
    if (existsSync(screenshotPath)) {
      return screenshotPath;
    }
    if (run.settled) {
      await finishMaestroFlow(run);
      throw new Error(
        `Maestro phase completed without checkpoint ${screenshotName}: ${run.label}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Maestro checkpoint did not appear before release: ${screenshotName}.`);
}

function assertHeldCatalogPending(entries, phase) {
  const requests = phaseApiRequests(entries, phase);
  assertCondition(
    requests.length === 2 &&
      requests[0].path === '/api/v1/users/me' &&
      requests[1].path === '/api/v1/mobile/safe-route/routes' &&
      requests[1].search === '',
    `${phase} did not hold exactly one principal request followed by one unscoped catalog request.`
  );
  const principalCompletion = completionFor(entries, requests[0]);
  const catalogCompletions = entries.filter(
    (entry) => entry.event === 'completion' && entry.requestId === requests[1].requestId
  );
  assertCondition(
    principalCompletion.completed === true &&
      principalCompletion.statusCode === 200 &&
      principalCompletion.sequence < requests[1].sequence &&
      catalogCompletions.length === 0,
    `${phase} catalog was not held after the completed principal check.`
  );
}

async function waitForCatalogCompletion(
  phase,
  { semanticOutcome = null, statusCode = 200 } = {}
) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const entries = readRequestJournal();
    const catalog = phaseApiRequests(entries, phase).find(
      (entry) => entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
    );
    if (catalog) {
      const completion = entries.find(
        (entry) => entry.event === 'completion' && entry.requestId === catalog.requestId
      );
      if (
        completion &&
        (
          completion.completed !== true ||
          completion.statusCode !== statusCode ||
          (semanticOutcome && completion.semanticOutcome !== semanticOutcome)
        )
      ) {
        throw new Error(
          `${phase} catalog completed unexpectedly: completed=${completion.completed}, ` +
          `status=${completion.statusCode}, outcome=${completion.semanticOutcome}.`
        );
      }
      if (
        completion?.completed === true &&
        completion.statusCode === statusCode &&
        (!semanticOutcome || completion.semanticOutcome === semanticOutcome)
      ) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${phase} catalog did not complete after release.`);
}

function assertFullRecoveryEvidence(entries, evidenceEntries) {
  assertGuidanceContractRequestJournal(entries, {
    expectedModeByPhase: FULL_EXPECTED_MODE_BY_PHASE,
    requiredPhases: FULL_REQUIRED_REQUEST_PHASES
  });
  assertRecoveryJournal(entries);
  assertGuidanceContractEvidenceJournal(evidenceEntries, {
    expectedSourceRevision: readCurrentSourceRevision(),
    requiredTypes: [
      'navigation.persisted',
      'restore.suspended',
      'workspace.recovery.settled',
      'navigation.cleanup.settled',
      'tracking.stop.settled'
    ]
  });
  assertActiveGuidanceFailureEvidence(evidenceEntries);
  assertForegroundLossLifecycleEvidence(entries, evidenceEntries);
}

function assertActiveGuidanceFailureEvidence(evidenceEntries) {
  const currentEvidence = evidenceEntries.filter(
    (entry) =>
      entry.sourceRevision === readCurrentSourceRevision()
  );
  const phaseEvidence = currentEvidence.filter(
    (entry) =>
      entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure
  );
  const restarted = currentEvidence.filter(
    (entry) =>
      entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestart &&
      entry.type === 'navigation.persisted' &&
      entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
      entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
      entry.authorization?.catalog === 'fresh-authorized' &&
      entry.authorization?.principal === 'matching' &&
      entry.outcome === 'persisted'
  );
  const destructiveTypes = new Set([
    'navigation.cleanup.settled',
    'restore.suspended',
    'tracking.stop.settled',
    'workspace.recovery.settled'
  ]);
  assertCondition(
    restarted.length === 1 &&
      !phaseEvidence.some(
        (entry) =>
          destructiveTypes.has(entry.type) ||
          entry.authorization?.catalog === 'fresh-authorized'
      ),
    'Transient active-guidance catalog failure emitted destructive or falsely fresh evidence.'
  );
}

function assertForegroundLossLifecycleEvidence(entries, evidenceEntries) {
  const currentRevision = readCurrentSourceRevision();
  const currentEvidence = evidenceEntries.filter(
    (entry) => entry.sourceRevision === currentRevision
  );
  const restarted = currentEvidence.filter((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestart &&
    entry.type === 'navigation.persisted' &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
    entry.authorization?.catalog === 'fresh-authorized' &&
    entry.authorization?.principal === 'matching' &&
    entry.durability?.activeNavigation === 'present' &&
    entry.outcome === 'persisted'
  );
  const cleanup = currentEvidence.filter((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss &&
    entry.type === 'navigation.cleanup.settled' &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
    entry.navigationInstanceId === restarted[0]?.navigationInstanceId &&
    entry.authorization?.catalog === 'not-checked' &&
    entry.authorization?.principal === 'matching' &&
    entry.durability?.activeNavigation === 'revoked' &&
    entry.durability?.persistedPermit === 'revoked' &&
    entry.unavailableWorkspaceIds?.includes(GUIDANCE_CONTRACT_WORKSPACES.denied.id) &&
    entry.outcome === 'cleared'
  );
  const tracking = currentEvidence.filter((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss &&
    entry.type === 'tracking.stop.settled' &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
    entry.navigationInstanceId === restarted[0]?.navigationInstanceId &&
    entry.appLaunchId === cleanup[0]?.appLaunchId &&
    entry.authorization?.catalog === 'not-checked' &&
    entry.authorization?.principal === 'matching' &&
    ['not-started', 'stopped', 'unsupported'].includes(entry.durability?.nativeTracking) &&
    entry.durability?.runtimePermit === 'none' &&
    entry.durability?.persistedPermit === 'revoked' &&
    entry.unavailableWorkspaceIds?.includes(GUIDANCE_CONTRACT_WORKSPACES.denied.id) &&
    entry.outcome === 'off'
  );
  const recovery = currentEvidence.filter((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss &&
    entry.type === 'workspace.recovery.settled' &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.unavailableWorkspaceIds?.includes(GUIDANCE_CONTRACT_WORKSPACES.denied.id) &&
    !entry.unavailableWorkspaceIds?.includes(GUIDANCE_CONTRACT_WORKSPACES.survivor.id) &&
    entry.authorization?.catalog === 'fresh-denied' &&
    entry.authorization?.principal === 'matching' &&
    entry.outcome === 'persisted' &&
    entry.durability?.routeCache === 'purged' &&
    entry.durability?.workspaceContext === 'persisted'
  );
  const catalog = phaseApiRequests(
    entries,
    WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss
  ).find((entry) =>
    entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
  );
  const catalogCompletion = completionFor(entries, catalog);
  assertCondition(
    restarted.length === 1 &&
      cleanup.length === 1 &&
      tracking.length === 1 &&
      recovery.length === 1 &&
      restarted[0].appLaunchId === cleanup[0].appLaunchId &&
      restarted[0].receivedAtMs < catalog.timestampMs &&
      cleanup[0].receivedAtMs >= catalogCompletion.timestampMs &&
      recovery[0].receivedAtMs >= catalogCompletion.timestampMs &&
      cleanup[0].receivedAtMs <= tracking[0].receivedAtMs,
    'Foreground omission did not durably correlate the restarted journey, denied purge, cleanup, and tracking stop.'
  );
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
    catalogOutcome: 'catalog-foreground-unavailable',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure,
    statusCode: 503
  });
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-active',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate,
    statusCode: 200
  });
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-active',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStart,
    statusCode: 200
  });
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-restore-unavailable',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 2,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure,
    statusCode: 503
  });
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-active',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd,
    statusCode: 200
  });
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-active',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestart,
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
  assertNoProtectedBackgroundTraffic(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRouteBackground);
  assertNoProtectedBackgroundTraffic(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.journeyBackground);
  assertHeldAuthorizationWindow(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStartGate);
  assertHeldAuthorizationWindow(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd);
  assertHeldAuthorizationWindow(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure);
  assertHeldAuthorizationWindow(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss);
  assertActiveGuidanceFailureTraffic(entries);
  assertRestoreEndSettledWithoutTraffic(entries);
  assertEndedJourneyReloadTraffic(entries);
  assertNoUnsafeForegroundCatalogTraffic(entries);
}

function assertActiveGuidanceFailureTraffic(entries) {
  const phase = WORKSPACE_CATALOG_RECOVERY_PHASES.journeyForegroundFailure;
  const requests = phaseApiRequests(entries, phase);
  const catalog = requests.find((entry) =>
    entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
  );
  const catalogCompletion = completionFor(entries, catalog);
  assertCondition(
    requests.length === 2 &&
      requests[0].path === '/api/v1/users/me' &&
      requests[1].requestId === catalog.requestId &&
      catalogCompletion.completed === true &&
      catalogCompletion.statusCode === 503 &&
      catalogCompletion.semanticOutcome === 'catalog-foreground-unavailable',
    `${phase} emitted protected workspace traffic or did not settle with the exact transient 503.`
  );
}

function assertRestoreEndSliceJournal(entries, evidenceEntries) {
  assertGuidanceContractRequestJournal(entries, {
    expectedModeByPhase: RESTORE_END_EXPECTED_MODE_BY_PHASE,
    requiredPhases: RESTORE_END_REQUIRED_REQUEST_PHASES
  });
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
    catalogOutcome: 'catalog-active',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStart,
    statusCode: 200
  });
  assertHeldAuthorizationWindow(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStart);
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-restore-unavailable',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 2,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure,
    statusCode: 503
  });
  assertAuthorizationAttempts(entries, {
    catalogOutcome: 'catalog-active',
    expectedAttemptCount: 1,
    expectedUserCountBeforeCatalog: 1,
    minimumCatalogDurationMs: 0,
    phase: WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd,
    statusCode: 200
  });
  assertHeldAuthorizationWindow(entries, WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd);
  assertRestoreEndSettledWithoutTraffic(entries);
  const preparedRouteRequests = phaseApiRequests(
    entries,
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRoutePrepare
  ).filter((entry) =>
    entry.path === `/api/v1/mobile/safe-route/routes/${GUIDANCE_CONTRACT_ROUTE_IDS.denied}`
  );
  assertCondition(
    preparedRouteRequests.length === 1,
    'Suspended journey End slice did not prepare the exact workspace route.'
  );
  assertSuccessfulProtectedRequests(entries, preparedRouteRequests, 'route-detail-active');

  const lifecycleEvidence = evidenceEntries.filter((entry) =>
    entry.sourceRevision === readCurrentSourceRevision() &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1
  );
  const persisted = lifecycleEvidence.find((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyStart &&
    entry.type === 'navigation.persisted' &&
    entry.outcome === 'persisted'
  );
  const suspended = lifecycleEvidence.find((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreFailure &&
    entry.type === 'restore.suspended' &&
    entry.outcome === 'suspended' &&
    entry.navigationInstanceId === persisted?.navigationInstanceId
  );
  const cleanup = lifecycleEvidence.find((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd &&
    entry.type === 'navigation.cleanup.settled' &&
    entry.outcome === 'cleared' &&
    entry.navigationInstanceId === persisted?.navigationInstanceId
  );
  const tracking = lifecycleEvidence.find((entry) =>
    entry.serverPhase === WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd &&
    entry.type === 'tracking.stop.settled' &&
    entry.outcome === 'off' &&
    entry.navigationInstanceId === persisted?.navigationInstanceId &&
    entry.appLaunchId === cleanup?.appLaunchId
  );
  assertCondition(
    persisted &&
      suspended &&
      cleanup &&
      tracking &&
      persisted.receivedAtMs < suspended.receivedAtMs &&
      suspended.receivedAtMs < cleanup.receivedAtMs &&
      cleanup.receivedAtMs <= tracking.receivedAtMs,
    'Suspended journey End slice did not preserve one correlated persisted-to-cleanup lifecycle.'
  );
}

function assertRestoreEndEvidenceWindow(entries, evidenceEntries) {
  const phase = WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd;
  const requests = phaseApiRequests(entries, phase);
  const catalog = requests.find((entry) =>
    entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
  );
  const catalogCompletion = completionFor(entries, catalog);
  const cleanupEntries = evidenceEntries.filter((entry) =>
    entry.serverPhase === phase &&
    entry.type === 'navigation.cleanup.settled' &&
    entry.sourceRevision === readCurrentSourceRevision() &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
    entry.outcome === 'cleared'
  );
  const trackingEntries = evidenceEntries.filter((entry) =>
    entry.serverPhase === phase &&
    entry.type === 'tracking.stop.settled' &&
    entry.sourceRevision === readCurrentSourceRevision() &&
    entry.workspaceId === GUIDANCE_CONTRACT_WORKSPACES.denied.id &&
    entry.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1 &&
    entry.outcome === 'off' &&
    entry.navigationInstanceId === cleanupEntries[0]?.navigationInstanceId &&
    entry.appLaunchId === cleanupEntries[0]?.appLaunchId
  );
  assertCondition(
    cleanupEntries.length === 1 &&
      trackingEntries.length === 1 &&
      cleanupEntries[0].receivedAtMs >= catalog.timestampMs &&
      cleanupEntries[0].receivedAtMs <= trackingEntries[0].receivedAtMs &&
      trackingEntries[0].receivedAtMs <= catalogCompletion.timestampMs,
    'Suspended journey cleanup was not acknowledged inside the held catalog window.'
  );
}

function phaseApiRequests(entries, phase) {
  return entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === phase &&
    entry.path.startsWith('/api/v1/')
  );
}

function assertNoProtectedBackgroundTraffic(entries, phase) {
  const requests = phaseApiRequests(entries, phase);
  assertCondition(
    requests.length === 0,
    `${phase} recorded protected traffic across its background edge: ${requests
      .map((entry) => `${entry.method} ${entry.path}?${entry.search}`)
      .join(', ')}.`
  );
}

function assertHeldAuthorizationWindow(entries, phase) {
  const requests = phaseApiRequests(entries, phase);
  const catalog = requests.find((entry) =>
    entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
  );
  const catalogCompletion = completionFor(entries, catalog);
  const windowRequests = requests.filter(
    (entry) => entry.sequence <= catalogCompletion.sequence
  );
  assertCondition(
    windowRequests.length === 2 &&
      windowRequests[0].path === '/api/v1/users/me' &&
      windowRequests[1].requestId === catalog.requestId,
    `${phase} recorded extra Start, viewport, reroute, or workspace traffic before authorization completed: ${windowRequests
      .map((entry) => `${entry.method} ${entry.path}?${entry.search}`)
      .join(', ')}.`
  );
}

function assertEndedJourneyReloadTraffic(entries) {
  const requests = phaseApiRequests(
    entries,
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreReload
  );
  const reloadRequests = requests.filter((entry) =>
    (
      (
        entry.path === '/api/v1/mobile/safe-route/routes' &&
        new URLSearchParams(entry.search).get('client_id') ===
          GUIDANCE_CONTRACT_WORKSPACES.denied.id
      ) ||
      entry.path ===
        `/api/v1/mobile/safe-route/routes/${GUIDANCE_CONTRACT_ROUTE_IDS.denied}`
    )
  );
  const viewportRiskRequests = requests.filter((entry) =>
    entry.path === '/api/v1/intel/map/area-risk' &&
    new URLSearchParams(entry.search).get('client_id') ===
      GUIDANCE_CONTRACT_WORKSPACES.denied.id
  );
  assertCondition(
    reloadRequests.length === 2 &&
      requests.length === reloadRequests.length + viewportRiskRequests.length &&
      reloadRequests.some((entry) => entry.path === '/api/v1/mobile/safe-route/routes') &&
      reloadRequests.some((entry) => entry.path.endsWith(GUIDANCE_CONTRACT_ROUTE_IDS.denied)),
    'Ended suspended guidance did not unlock an authorized reload of the exact route.'
  );
  for (const request of reloadRequests) {
    const completion = completionFor(entries, request);
    const expectedOutcome = request.path === '/api/v1/mobile/safe-route/routes'
      ? 'catalog-active'
      : 'route-detail-active';
    assertCondition(
      request.authorized === true &&
        request.authorizationClass === 'expected-bearer' &&
        completion.completed === true &&
        completion.statusCode === 200 &&
        completion.semanticOutcome === expectedOutcome,
      `Ended journey reload was not authorized: ${request.path}?${request.search}.`
    );
  }
  for (const request of viewportRiskRequests) {
    const completion = completionFor(entries, request);
    assertCondition(
      request.authorized === true &&
        request.authorizationClass === 'expected-bearer' &&
        completion.completed === true &&
        completion.statusCode === 200 &&
        completion.semanticOutcome === 'api-success',
      `Ended journey reload emitted unsafe viewport risk traffic: ${request.path}?${request.search}.`
    );
  }
}

function assertRestoreEndSettledWithoutTraffic(entries) {
  const requests = phaseApiRequests(
    entries,
    WORKSPACE_CATALOG_RECOVERY_PHASES.journeyRestoreEnd
  );
  const catalog = requests.find((entry) =>
    entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
  );
  const catalogCompletion = completionFor(entries, catalog);
  const postCatalogRequests = requests.filter(
    (entry) => entry.sequence > catalogCompletion.sequence
  );
  assertCondition(
    requests.length === 2 && postCatalogRequests.length === 0,
    `Ended suspended guidance emitted API traffic before manual route reload: ${postCatalogRequests
      .map((entry) => `${entry.method} ${entry.path}?${entry.search}`)
      .join(', ')}.`
  );
}

function assertNoUnsafeForegroundCatalogTraffic(entries) {
  const foregroundRequests = entries.filter((entry) =>
    entry.event === 'request' &&
    entry.phase === WORKSPACE_CATALOG_RECOVERY_PHASES.foregroundLoss
  );
  const catalogRequest = foregroundRequests.find((entry) =>
    entry.path === '/api/v1/mobile/safe-route/routes' && entry.search === ''
  );
  const catalogCompletion = completionFor(entries, catalogRequest);
  const unsafeIdentifiers = [
    GUIDANCE_CONTRACT_WORKSPACES.denied.id,
    GUIDANCE_CONTRACT_ROUTE_IDS.denied,
    GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS.deniedV1
  ];
  const protectedRequests = foregroundRequests.filter((entry) =>
    entry.sequence > catalogCompletion.sequence &&
    entry.path.startsWith('/api/v1/') &&
    entry.path !== '/api/v1/users/me'
  );
  const protectedRequestsDuringCatalog = foregroundRequests.filter((entry) =>
    entry.sequence > catalogRequest.sequence &&
    entry.sequence < catalogCompletion.sequence &&
    entry.path.startsWith('/api/v1/') &&
    entry.path !== '/api/v1/users/me'
  );

  assertCondition(
    protectedRequestsDuringCatalog.length === 0,
    `Protected workspace traffic ran before foreground authorization completed: ${protectedRequestsDuringCatalog
      .map((entry) => `${entry.method} ${entry.path}?${entry.search}`)
      .join(', ')}.`
  );

  for (const request of protectedRequests) {
    const completion = completionFor(entries, request);
    const requestTarget = `${request.path}?${request.search}`;
    assertCondition(
      request.authorized === true &&
      request.authorizationClass === 'expected-bearer' &&
      completion.statusCode >= 200 &&
      completion.statusCode < 300 &&
      unsafeIdentifiers.every((identifier) => !requestTarget.includes(identifier)),
      `Unsafe protected traffic followed the foreground survivor catalog: ${requestTarget}.`
    );
  }
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

function readEvidenceJournal() {
  try {
    return readFileSync(evidenceLogFile, 'utf8')
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
