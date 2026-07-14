#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GUIDANCE_CONTRACT_API_PORT,
  GUIDANCE_CONTRACT_MODES,
  GUIDANCE_START_BOUNDARY_PATH,
  assertGuidanceContractRequestJournal,
  assertGuidanceStartTrafficBoundary,
  isGuidanceStartProtectedTraffic
} from './maestro-guidance-contract-api.mjs';
import {
  assertGuidanceSourceCheckoutClean,
  verifyGuidanceContractMetroIdentity
} from './maestro-guidance-metro-identity.mjs';

const METRO_PORT = 8081;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';
const tempDirectory = mkdtempSync(join(tmpdir(), 'saferoute-guidance-contract-'));
const controlFile = join(tempDirectory, 'control.json');
const pendingControlFile = join(tempDirectory, 'control.pending.json');
const requestLogFile = join(tempDirectory, 'requests.jsonl');
const serverLogFile = join(tempDirectory, 'server.log');
const serverLogFd = openSync(serverLogFile, 'a');
let apiProcess = null;

const phases = {
  reset: 'maestro/ios-guidance-contract-reset.yaml',
  publicPrepare: 'maestro/ios-guidance-contract-public-prepare.yaml',
  publicStart: 'maestro/ios-guidance-contract-public-seed.yaml',
  publicStartOutcome: 'maestro/ios-guidance-contract-public-start-outcome.yaml',
  publicResume: 'maestro/ios-guidance-contract-public-resume.yaml',
  workspacePrepare: 'maestro/ios-guidance-contract-workspace-prepare.yaml',
  workspaceStart: 'maestro/ios-guidance-contract-workspace-seed.yaml',
  workspaceStartOutcome: 'maestro/ios-guidance-contract-workspace-start-outcome.yaml',
  workspaceOffline: 'maestro/ios-guidance-contract-workspace-offline.yaml',
  workspaceReconnect: 'maestro/ios-guidance-contract-workspace-reconnect.yaml',
  wrongPrincipalStart: 'maestro/ios-guidance-contract-wrong-principal-start.yaml',
  wrongPrincipalStartOutcome: 'maestro/ios-guidance-contract-wrong-principal-start-outcome.yaml',
  deniedStart: 'maestro/ios-guidance-contract-denied-start.yaml',
  deniedStartOutcome: 'maestro/ios-guidance-contract-denied-start-outcome.yaml',
  workspaceReseed: 'maestro/ios-guidance-contract-workspace-reseed.yaml',
  wrongPrincipal: 'maestro/ios-guidance-contract-wrong-principal.yaml',
  wrongPrincipalRelaunch: 'maestro/ios-guidance-contract-wrong-principal-relaunch.yaml',
  denialSeed: 'maestro/ios-guidance-contract-denial-seed.yaml',
  denied: 'maestro/ios-guidance-contract-denied.yaml',
  regained: 'maestro/ios-guidance-contract-regained.yaml'
};

const expectedModeByPhase = Object.freeze({
  reset: GUIDANCE_CONTRACT_MODES.active,
  publicPrepare: GUIDANCE_CONTRACT_MODES.active,
  publicStart: GUIDANCE_CONTRACT_MODES.active,
  publicResume: GUIDANCE_CONTRACT_MODES.offline,
  workspacePrepare: GUIDANCE_CONTRACT_MODES.active,
  workspaceStart: GUIDANCE_CONTRACT_MODES.active,
  workspaceOffline: GUIDANCE_CONTRACT_MODES.offline,
  workspaceReconnect: GUIDANCE_CONTRACT_MODES.active,
  wrongPrincipalPrepare: GUIDANCE_CONTRACT_MODES.active,
  wrongPrincipalStart: GUIDANCE_CONTRACT_MODES.wrongPrincipal,
  deniedPrepare: GUIDANCE_CONTRACT_MODES.active,
  deniedStart: GUIDANCE_CONTRACT_MODES.denied,
  workspaceReseedPrepare: GUIDANCE_CONTRACT_MODES.active,
  workspaceReseed: GUIDANCE_CONTRACT_MODES.active,
  wrongPrincipal: GUIDANCE_CONTRACT_MODES.wrongPrincipal,
  wrongPrincipalRelaunch: GUIDANCE_CONTRACT_MODES.wrongPrincipal,
  denialSeed: GUIDANCE_CONTRACT_MODES.active,
  denied: GUIDANCE_CONTRACT_MODES.denied,
  regained: GUIDANCE_CONTRACT_MODES.active
});

async function main() {
  if (!(await isPortListening(METRO_PORT))) {
    throw new Error(
      'SafeRoute guidance contract matrix requires the no-build Metro listener on port 8081. ' +
      'Run `npm run start:maestro:ios:guidance-contract` first.'
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
    `[guidance-contract] verified Metro ${metroIdentity.slug} at ${metroIdentity.sourceRevision}\n`
  );

  await startApi('reset');
  runPhase('reset', 'reset to a signed-out map', phases.reset);
  const publicPreviewCount = requestCount('/api/v1/mobile/safe-route/route-preview');
  runPhase('publicPrepare', 'prepare signed-out public guidance', phases.publicPrepare);
  await runStartBoundary({
    boundary: 'public-start',
    expectedPaths: [],
    file: phases.publicStart,
    label: 'start signed-out public guidance',
    openPhase: 'publicPrepare',
    outcomeFile: phases.publicStartOutcome,
    phase: 'publicStart'
  });
  assertCondition(
    requestCount('/api/v1/mobile/safe-route/route-preview') > publicPreviewCount,
    'Public guidance did not exercise the contract route-preview endpoint.'
  );

  await stopApi();
  assertCondition(
    !(await isPortListening(GUIDANCE_CONTRACT_API_PORT)),
    'Contract backend port remained bound during the public cold relaunch.'
  );
  runPhase(
    'publicResume',
    'resume public guidance with backend absent',
    phases.publicResume
  );

  await startApi('workspacePrepare');
  const protectedTrafficBaseline = {
    user: authorizedRequestCount('/api/v1/users/me'),
    catalog: authorizedRequestCount('/api/v1/mobile/safe-route/routes'),
    detail: authorizedRequestCount(
      '/api/v1/mobile/safe-route/routes/guidance-contract-route'
    )
  };
  runPhase('workspacePrepare', 'prepare principal-A workspace guidance', phases.workspacePrepare);
  await runStartBoundary({
    boundary: 'active-workspace-start',
    expectedPaths: [
      '/api/v1/users/me',
      '/api/v1/mobile/safe-route/routes'
    ],
    file: phases.workspaceStart,
    label: 'start principal-A workspace guidance',
    openPhase: 'workspacePrepare',
    outcomeFile: phases.workspaceStartOutcome,
    phase: 'workspaceStart'
  });
  assertProtectedContractTraffic(protectedTrafficBaseline);

  await stopApi();
  assertCondition(
    !(await isPortListening(GUIDANCE_CONTRACT_API_PORT)),
    'Contract backend port remained bound during the workspace cold relaunch.'
  );
  runPhase(
    'workspaceOffline',
    'suspend workspace guidance with backend absent',
    phases.workspaceOffline
  );

  const reconnectUserCount = authorizedRequestCount('/api/v1/users/me');
  const reconnectCatalogCount = requestCount(
    '/api/v1/mobile/safe-route/routes',
    ''
  );
  await startApi('workspaceReconnect');
  runPhase(
    'workspaceReconnect',
    'readmit exact-principal guidance after Retry',
    phases.workspaceReconnect
  );
  assertCondition(
    authorizedRequestCount('/api/v1/users/me') === reconnectUserCount + 1 &&
      requestCount('/api/v1/mobile/safe-route/routes', '') === reconnectCatalogCount + 1,
    'Workspace Retry did not issue one fresh principal check and one unscoped catalog request.'
  );

  runPhase(
    'wrongPrincipalPrepare',
    'prepare a fresh Start for principal A',
    phases.workspacePrepare
  );
  await runStartBoundary({
    boundary: 'wrong-principal-start',
    expectedPaths: ['/api/v1/users/me'],
    file: phases.wrongPrincipalStart,
    label: 'reject a fresh Start from a different stable principal',
    openPhase: 'wrongPrincipalPrepare',
    outcomeFile: phases.wrongPrincipalStartOutcome,
    phase: 'wrongPrincipalStart'
  });

  runPhase(
    'deniedPrepare',
    'prepare a fresh Start before workspace denial',
    phases.workspacePrepare
  );
  await runStartBoundary({
    boundary: 'denied-workspace-start',
    expectedPaths: [
      '/api/v1/users/me',
      '/api/v1/mobile/safe-route/routes'
    ],
    file: phases.deniedStart,
    label: 'reject a fresh Start after workspace membership loss',
    openPhase: 'deniedPrepare',
    outcomeFile: phases.deniedStartOutcome,
    phase: 'deniedStart'
  });

  runPhase(
    'workspaceReseedPrepare',
    'prepare another principal-A journey',
    phases.workspacePrepare
  );
  runPhase(
    'workspaceReseed',
    'persist another principal-A journey',
    phases.workspaceReseed
  );
  runPhase(
    'wrongPrincipal',
    'reject the same email with a different stable principal',
    phases.wrongPrincipal
  );
  runPhase(
    'wrongPrincipalRelaunch',
    'prove wrong-principal cleanup survives another cold launch',
    phases.wrongPrincipalRelaunch
  );

  runPhase(
    'denialSeed',
    'sign out principal B and create a fresh principal-A journey',
    phases.denialSeed
  );
  runPhase(
    'denied',
    'discard guidance after authoritative catalog denial',
    phases.denied
  );

  const regainCatalogCount = requestCount('/api/v1/mobile/safe-route/routes');
  const regainUnscopedCount = requestCount('/api/v1/mobile/safe-route/routes', '');
  const regainScopedCount = requestCount(
    '/api/v1/mobile/safe-route/routes',
    '?client_id=guidance-workspace'
  );
  runPhase(
    'regained',
    'restore workspace access without resurrecting denied guidance',
    phases.regained
  );
  assertCondition(
    requestCount('/api/v1/mobile/safe-route/routes') === regainCatalogCount + 3 &&
      requestCount('/api/v1/mobile/safe-route/routes', '') === regainUnscopedCount + 2 &&
      requestCount(
        '/api/v1/mobile/safe-route/routes',
        '?client_id=guidance-workspace'
      ) === regainScopedCount + 1,
    'Regain should cold-check once, explicitly refresh once, and then load one scoped Saved list.'
  );

  assertRequestJournalIntegrity();
  process.stdout.write(
    `SafeRoute cold guidance matrix passed. Request journal: ${requestLogFile}\n`
  );
}

async function startApi(phase) {
  setControl(phase);
  apiProcess = spawn(process.execPath, [
    'scripts/maestro-guidance-contract-api.mjs',
    '--port', String(GUIDANCE_CONTRACT_API_PORT),
    '--control-file', controlFile,
    '--request-log', requestLogFile
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
  apiProcess = null;
  if (processToStop.exitCode === null) {
    processToStop.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => processToStop.once('exit', resolve)),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('Contract backend did not stop within five seconds.')),
        5000
      ))
    ]);
  }
  await waitForPort(GUIDANCE_CONTRACT_API_PORT, false);
}

function setControl(phase) {
  const mode = expectedModeByPhase[phase];
  assertCondition(mode, `No contract mode is configured for ${phase}.`);
  writeFileSync(pendingControlFile, JSON.stringify({ mode, phase }), 'utf8');
  renameSync(pendingControlFile, controlFile);
}

function runPhase(phase, label, file) {
  setControl(phase);
  runMaestroPhase(phase, label, file);
}

async function runStartBoundary({
  boundary,
  expectedPaths,
  file,
  label,
  openPhase,
  outcomeFile,
  phase
}) {
  await waitForStartAuthorizationTrafficQuiet();
  await writeStartBoundaryMarker(boundary, 'open');
  setControl(phase);
  runMaestroPhase(phase, label, file);
  await waitForExpectedStartTraffic(boundary, expectedPaths);
  runMaestroPhase(phase, `${label} outcome`, outcomeFile);
  await waitForStartAuthorizationTrafficQuiet();
  await writeStartBoundaryMarker(boundary, 'close');
  assertGuidanceStartTrafficBoundary(readRequestJournal(), {
    boundary,
    expectedPaths,
    openPhase,
    phase
  });
}

function runMaestroPhase(phase, label, file) {
  process.stdout.write(`\n[guidance-contract] ${phase}: ${label}\n`);
  const result = spawnSync(process.execPath, ['scripts/run-maestro.mjs', 'test', file], {
    cwd: process.cwd(),
    env: { ...process.env, MAESTRO_RETRIES: '0' },
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Maestro phase failed (${result.status ?? 'signal'}): ${label}`);
  }
}

async function writeStartBoundaryMarker(boundary, edge) {
  const search = new URLSearchParams({ boundary, edge });
  const response = await fetch(
    `http://127.0.0.1:${GUIDANCE_CONTRACT_API_PORT}${GUIDANCE_START_BOUNDARY_PATH}?${search}`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw new Error(
      `Guidance Start boundary marker ${boundary}/${edge} failed with ${response.status}.`
    );
  }
}

async function waitForStartAuthorizationTrafficQuiet() {
  const deadline = Date.now() + 5000;
  let fingerprint = startAuthorizationTrafficFingerprint();
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const nextFingerprint = startAuthorizationTrafficFingerprint();
    if (nextFingerprint !== fingerprint) {
      fingerprint = nextFingerprint;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= 500) {
      return;
    }
  }
  throw new Error('Guidance Start authorization traffic did not become quiet within five seconds.');
}

async function waitForExpectedStartTraffic(boundary, expectedPaths) {
  if (expectedPaths.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return;
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const entries = readRequestJournal();
    const open = entries.find((entry) => {
      if (entry.path !== GUIDANCE_START_BOUNDARY_PATH) {
        return false;
      }
      const parameters = new URLSearchParams(entry.search);
      return (
        parameters.get('boundary') === boundary &&
        parameters.get('edge') === 'open'
      );
    });
    if (open) {
      const protectedCount = entries.filter(
        (entry) =>
          entry.sequence > open.sequence &&
          isGuidanceStartProtectedTraffic(entry)
      ).length;
      if (protectedCount >= expectedPaths.length) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Guidance Start boundary ${boundary} did not record its expected authorization traffic within five seconds.`
  );
}

function startAuthorizationTrafficFingerprint() {
  return readRequestJournal()
    .filter(isGuidanceStartProtectedTraffic)
    .map((entry) => entry.sequence)
    .join(',');
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

function assertRequestJournalIntegrity() {
  assertGuidanceContractRequestJournal(readRequestJournal(), {
    expectedModeByPhase,
    requiredPhases: ['wrongPrincipal', 'denied']
  });
}

function requestCount(path, search) {
  return readRequestJournal().filter((entry) =>
    entry.path === path && (search === undefined || entry.search === search)
  ).length;
}

function authorizedRequestCount(path) {
  return readRequestJournal().filter(
    (entry) => entry.path === path && entry.authorized === true
  ).length;
}

function assertProtectedContractTraffic(baseline) {
  for (const [label, path] of Object.entries({
    user: '/api/v1/users/me',
    catalog: '/api/v1/mobile/safe-route/routes',
    detail: '/api/v1/mobile/safe-route/routes/guidance-contract-route'
  })) {
    assertCondition(
      authorizedRequestCount(path) > baseline[label],
      `Workspace guidance did not exercise authorized ${path}.`
    );
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
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
  return execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    }
  );
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
  throw new Error(
    `Port ${port} did not become ${expectedListening ? 'available' : 'closed'} within five seconds.`
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  try {
    spawnSync('xcrun', ['simctl', 'terminate', 'booted', EXPO_GO_BUNDLE_ID], {
      stdio: 'ignore',
      timeout: 8000
    });
  } catch {
    // Best effort: do not hide the matrix failure.
  }
  process.exitCode = 1;
} finally {
  await stopApi().catch(() => undefined);
  if (process.exitCode) {
    process.stderr.write(`Guidance contract server log: ${serverLogFile}\n`);
  }
}
