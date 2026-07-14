#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GUIDANCE_CONTRACT_API_PORT,
  GUIDANCE_CONTRACT_MODES
} from './maestro-guidance-contract-api.mjs';

const METRO_PORT = 8081;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';
const tempDirectory = mkdtempSync(join(tmpdir(), 'saferoute-guidance-contract-'));
const stateFile = join(tempDirectory, 'mode.txt');
const requestLogFile = join(tempDirectory, 'requests.jsonl');
const serverLogFile = join(tempDirectory, 'server.log');
const serverLogFd = openSync(serverLogFile, 'a');
let apiProcess = null;

const phases = {
  reset: 'maestro/ios-guidance-contract-reset.yaml',
  publicSeed: 'maestro/ios-guidance-contract-public-seed.yaml',
  publicResume: 'maestro/ios-guidance-contract-public-resume.yaml',
  workspaceSeed: 'maestro/ios-guidance-contract-workspace-seed.yaml',
  workspaceOffline: 'maestro/ios-guidance-contract-workspace-offline.yaml',
  workspaceReconnect: 'maestro/ios-guidance-contract-workspace-reconnect.yaml',
  workspaceReseed: 'maestro/ios-guidance-contract-workspace-reseed.yaml',
  wrongPrincipal: 'maestro/ios-guidance-contract-wrong-principal.yaml',
  wrongPrincipalRelaunch: 'maestro/ios-guidance-contract-wrong-principal-relaunch.yaml',
  denialSeed: 'maestro/ios-guidance-contract-denial-seed.yaml',
  denied: 'maestro/ios-guidance-contract-denied.yaml',
  regained: 'maestro/ios-guidance-contract-regained.yaml'
};

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

  await startApi(GUIDANCE_CONTRACT_MODES.active);
  runPhase('reset to a signed-out map', phases.reset);
  const publicPreviewCount = requestCount('/api/v1/mobile/safe-route/route-preview');
  runPhase('create signed-out public guidance', phases.publicSeed);
  assertCondition(
    requestCount('/api/v1/mobile/safe-route/route-preview') > publicPreviewCount,
    'Public guidance did not exercise the contract route-preview endpoint.'
  );

  await stopApi();
  assertCondition(
    !(await isPortListening(GUIDANCE_CONTRACT_API_PORT)),
    'Contract backend port remained bound during the public cold relaunch.'
  );
  runPhase('resume public guidance with backend absent', phases.publicResume);

  await startApi(GUIDANCE_CONTRACT_MODES.active);
  const protectedTrafficBaseline = {
    user: authorizedRequestCount('/api/v1/users/me'),
    catalog: authorizedRequestCount('/api/v1/mobile/safe-route/routes'),
    detail: authorizedRequestCount(
      '/api/v1/mobile/safe-route/routes/guidance-contract-route'
    )
  };
  runPhase('create principal-A workspace guidance', phases.workspaceSeed);
  assertProtectedContractTraffic(protectedTrafficBaseline);

  await stopApi();
  assertCondition(
    !(await isPortListening(GUIDANCE_CONTRACT_API_PORT)),
    'Contract backend port remained bound during the workspace cold relaunch.'
  );
  runPhase('suspend workspace guidance with backend absent', phases.workspaceOffline);

  const reconnectUserCount = authorizedRequestCount('/api/v1/users/me');
  const reconnectCatalogCount = requestCount(
    '/api/v1/mobile/safe-route/routes',
    ''
  );
  await startApi(GUIDANCE_CONTRACT_MODES.active);
  runPhase('readmit exact-principal guidance after Retry', phases.workspaceReconnect);
  assertCondition(
    authorizedRequestCount('/api/v1/users/me') === reconnectUserCount + 1 &&
      requestCount('/api/v1/mobile/safe-route/routes', '') === reconnectCatalogCount + 1,
    'Workspace Retry did not issue one fresh principal check and one unscoped catalog request.'
  );

  runPhase('persist another principal-A journey', phases.workspaceReseed);
  setMode(GUIDANCE_CONTRACT_MODES.wrongPrincipal);
  runPhase('reject the same email with a different stable principal', phases.wrongPrincipal);
  runPhase('prove wrong-principal cleanup survives another cold launch', phases.wrongPrincipalRelaunch);

  setMode(GUIDANCE_CONTRACT_MODES.active);
  runPhase('sign out principal B and create a fresh principal-A journey', phases.denialSeed);
  setMode(GUIDANCE_CONTRACT_MODES.denied);
  runPhase('discard guidance after authoritative catalog denial', phases.denied);

  setMode(GUIDANCE_CONTRACT_MODES.active);
  const regainCatalogCount = requestCount('/api/v1/mobile/safe-route/routes');
  const regainUnscopedCount = requestCount('/api/v1/mobile/safe-route/routes', '');
  const regainScopedCount = requestCount(
    '/api/v1/mobile/safe-route/routes',
    '?client_id=guidance-workspace'
  );
  runPhase('restore workspace access without resurrecting denied guidance', phases.regained);
  assertCondition(
    requestCount('/api/v1/mobile/safe-route/routes') === regainCatalogCount + 3 &&
      requestCount('/api/v1/mobile/safe-route/routes', '') === regainUnscopedCount + 2 &&
      requestCount(
        '/api/v1/mobile/safe-route/routes',
        '?client_id=guidance-workspace'
      ) === regainScopedCount + 1,
    'Regain should cold-check once, explicitly refresh once, and then load one scoped Saved list.'
  );

  process.stdout.write(
    `SafeRoute cold guidance matrix passed. Request journal: ${requestLogFile}\n`
  );
}

async function startApi(mode) {
  setMode(mode);
  apiProcess = spawn(process.execPath, [
    'scripts/maestro-guidance-contract-api.mjs',
    '--port', String(GUIDANCE_CONTRACT_API_PORT),
    '--state-file', stateFile,
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

function setMode(mode) {
  writeFileSync(stateFile, `${mode}\n`, 'utf8');
}

function runPhase(label, file) {
  process.stdout.write(`\n[guidance-contract] ${label}\n`);
  const result = spawnSync(process.execPath, ['scripts/run-maestro.mjs', 'test', file], {
    cwd: process.cwd(),
    env: { ...process.env, MAESTRO_RETRIES: '0' },
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Maestro phase failed (${result.status ?? 'signal'}): ${label}`);
  }
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
