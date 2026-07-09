#!/usr/bin/env node
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAESTRO_PORT = 8081;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 450;
const SIMCTL_COMMAND_TIMEOUT_MS = 8000;
const MAESTRO_VERSION_TIMEOUT_MS = 20000;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';

function readJsonText(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function runText(command, args, { timeoutMs = SIMCTL_COMMAND_TIMEOUT_MS } = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs
    }).trim();
  } catch {
    return null;
  }
}

function normalizePackageVersion(value) {
  const normalized = String(value ?? '').trim().replace(/^[~^]/, '');
  return normalized || null;
}

export function parseNodeVersion(value) {
  const match = String(value ?? '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
}

export function parseMinimumNodeVersion(engineRange) {
  const match = String(engineRange ?? '').trim().match(/>=\s*v?(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
}

function formatNodeVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function isNodeVersionAtLeast(currentVersion, minimumVersion) {
  const current = typeof currentVersion === 'string' ? parseNodeVersion(currentVersion) : currentVersion;
  const minimum = typeof minimumVersion === 'string' ? parseMinimumNodeVersion(minimumVersion) : minimumVersion;

  if (!current || !minimum) {
    return false;
  }

  if (current.major !== minimum.major) {
    return current.major > minimum.major;
  }

  if (current.minor !== minimum.minor) {
    return current.minor > minimum.minor;
  }

  return current.patch >= minimum.patch;
}

export function formatNodeVersionMismatchMessage({ currentVersion, packageNodeEngine }) {
  const current = parseNodeVersion(currentVersion);
  const minimum = parseMinimumNodeVersion(packageNodeEngine);
  const currentLabel = current ? formatNodeVersion(current) : String(currentVersion || 'unknown');
  const minimumLabel = minimum ? formatNodeVersion(minimum) : String(packageNodeEngine || 'the declared engine');

  return [
    `SafeRoute Maestro preflight found Node ${currentLabel}, but this workspace requires Node ${packageNodeEngine}.`,
    `Run \`nvm use\` from SafeRouteMobile or launch the no-build iOS smoke with Node ${minimumLabel}+ before starting Expo.`,
    'This prevents Expo/Metro from opening a stale or incompatible SafeRoute bundle during Maestro validation.'
  ].join('\n');
}

function readPackageVersion(packageName) {
  const packageJsonPath = join(process.cwd(), 'node_modules', packageName, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);

  return packageJson?.version?.trim() || null;
}

export function isTcpPortListening({ host = DEFAULT_HOST, port, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (isListening) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(isListening);
    };

    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export function findListeningProcesses(port) {
  return new Promise((resolve) => {
    execFile(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { timeout: 1000 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve('No listener details were available from lsof.');
          return;
        }

        resolve(stdout.trim());
      }
    );
  });
}

export function formatPortInUseMessage(port, processDetails) {
  return [
    `SafeRoute Maestro preflight found port ${port} already in use.`,
    'Stop the existing Metro/Expo process before running `npm run start:maestro:ios`, or reuse that already-running server and run `npm run test:maestro:ios` only.',
    'This prevents Expo Go from opening a stale or wrong SafeRoute bundle during the no-build iOS smoke flow.',
    '',
    processDetails
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseExpoSdkMajor(versionRange) {
  const match = normalizePackageVersion(versionRange)?.match(/^(\d+)/);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

export function readExpectedExpoSdkMajor(packageJsonPath = new URL('../package.json', import.meta.url)) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return parseExpoSdkMajor(packageJson.dependencies?.expo);
}

export function parseExpoGoVersionsFromListApps(output) {
  const versions = [];
  const appBlocks = String(output ?? '').split(new RegExp(`"${EXPO_GO_BUNDLE_ID}"\\s*=`, 'g')).slice(1);

  for (const block of appBlocks) {
    const versionMatch = block.match(/CFBundleVersion\s*=\s*"?([0-9]+(?:\.[0-9]+){0,2})"?;/);

    if (versionMatch) {
      versions.push(versionMatch[1]);
    }
  }

  return versions;
}

export function findExpoGoSdkMismatch(expectedSdkMajor, expoGoVersions) {
  if (!expectedSdkMajor || !expoGoVersions.length) {
    return null;
  }

  return expoGoVersions.find((version) => parseExpoSdkMajor(version) !== expectedSdkMajor) ?? null;
}

export function findBootedExpoGoVersions({ execFileImpl = execFile } = {}) {
  return new Promise((resolve) => {
    execFileImpl(
      'xcrun',
      ['simctl', 'listapps', 'booted'],
      { timeout: SIMCTL_COMMAND_TIMEOUT_MS },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }

        resolve(parseExpoGoVersionsFromListApps(stdout));
      }
    );
  });
}


function resolveBootedExpoGoVersionsFromContainer() {
  const expoGoPath = runText('xcrun', [
    'simctl',
    'get_app_container',
    'booted',
    EXPO_GO_BUNDLE_ID,
    'app'
  ]);

  if (!expoGoPath) {
    return [];
  }

  const infoPlistPath = join(expoGoPath, 'Info.plist');
  const shortVersion = runText('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    infoPlistPath
  ]);
  const bundleVersion = runText('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleVersion',
    infoPlistPath
  ]);
  const version = shortVersion || bundleVersion;

  return version ? [version] : [];
}

export async function resolveBootedExpoGoVersions({
  containerResolver = resolveBootedExpoGoVersionsFromContainer,
  listAppsResolver = findBootedExpoGoVersions
} = {}) {
  const containerVersions = containerResolver();

  if (containerVersions.length) {
    return containerVersions;
  }

  return listAppsResolver();
}

export function formatExpoGoMismatchMessage({ expectedSdkMajor, installedVersion }) {
  return [
    `SafeRoute Maestro preflight found Expo Go ${installedVersion}, but this workspace targets Expo SDK ${expectedSdkMajor}.`,
    `Install/open Expo Go ${expectedSdkMajor}.x on the booted iOS simulator or switch to a SafeRoute branch that targets the installed Expo Go runtime before running the no-build smoke flow.`,
    'This prevents false Maestro failures caused by Expo Go loading an incompatible SafeRoute bundle.'
  ].join('\n');
}

export function evaluateMaestroRuntimePreflight(inputs) {
  const blockers = [];
  const checks = [];
  const expectedExpoSdkMajor = parseExpoSdkMajor(inputs.packageExpoVersionRange);
  const expectedExpoVersion = normalizePackageVersion(inputs.packageExpoVersionRange);
  const expectedReactNativeVersion = normalizePackageVersion(inputs.packageReactNativeVersion);
  const installedExpoVersion = normalizePackageVersion(inputs.installedExpoVersion);
  const installedExpoMajor = parseExpoSdkMajor(inputs.installedExpoVersion);
  const mismatchedExpoGoVersion = findExpoGoSdkMismatch(expectedExpoSdkMajor, inputs.expoGoVersions || []);

  if (!expectedExpoSdkMajor || !expectedExpoVersion) {
    blockers.push('package.json must declare an Expo SDK dependency before running the no-build iOS smoke.');
  } else {
    checks.push(`package.json targets Expo SDK ${expectedExpoSdkMajor} (${inputs.packageExpoVersionRange}).`);
  }

  const minimumNodeVersion = parseMinimumNodeVersion(inputs.packageNodeEngine);
  const currentNodeVersion = parseNodeVersion(inputs.nodeVersion);

  if (!minimumNodeVersion) {
    blockers.push('package.json must declare a minimum Node engine before running the no-build iOS smoke.');
  } else if (!currentNodeVersion || !isNodeVersionAtLeast(currentNodeVersion, minimumNodeVersion)) {
    blockers.push(formatNodeVersionMismatchMessage({
      currentVersion: inputs.nodeVersion,
      packageNodeEngine: inputs.packageNodeEngine
    }));
  } else {
    checks.push(`Node ${formatNodeVersion(currentNodeVersion)} satisfies ${inputs.packageNodeEngine}.`);
  }

  if (!inputs.installedExpoVersion || !inputs.installedReactNativeVersion) {
    blockers.push('Run npm install before the Maestro smoke; required node_modules packages are missing.');
  } else if (
    installedExpoMajor !== expectedExpoSdkMajor ||
    installedExpoVersion !== expectedExpoVersion ||
    (expectedReactNativeVersion && inputs.installedReactNativeVersion !== expectedReactNativeVersion)
  ) {
    blockers.push(
      `Run npm install before the Maestro smoke; node_modules has Expo ${inputs.installedExpoVersion} / React Native ${inputs.installedReactNativeVersion}, but package.json expects Expo ${inputs.packageExpoVersionRange} / React Native ${inputs.packageReactNativeVersion}.`
    );
  } else {
    checks.push(`node_modules includes Expo ${inputs.installedExpoVersion} and React Native ${inputs.installedReactNativeVersion}.`);
  }

  if (!inputs.maestroCliVersion) {
    blockers.push('Install or expose the Maestro CLI before running the iOS UI smoke.');
  } else {
    checks.push(`Maestro CLI ${inputs.maestroCliVersion} is available.`);
  }

  if (!inputs.bootedSimulatorAvailable) {
    blockers.push('Boot an iOS simulator before running the Expo Go Maestro smoke.');
  } else {
    checks.push('an iOS simulator is booted for the Expo Go smoke.');
  }

  if (!inputs.expoGoVersions?.length) {
    blockers.push('Install or open Expo Go on the booted iOS simulator before running the no-build smoke.');
  } else if (mismatchedExpoGoVersion) {
    blockers.push(formatExpoGoMismatchMessage({
      expectedSdkMajor: expectedExpoSdkMajor,
      installedVersion: mismatchedExpoGoVersion
    }));
  } else {
    checks.push(`Expo Go ${inputs.expoGoVersions.join(', ')} matches SDK ${expectedExpoSdkMajor}.`);
  }

  if (!inputs.portAvailable) {
    blockers.push(formatPortInUseMessage(inputs.port || MAESTRO_PORT, inputs.portProcessDetails));
  } else {
    checks.push(`port ${inputs.port || MAESTRO_PORT} is free for Expo.`);
  }

  return {
    blockers,
    checks,
    ready: blockers.length === 0
  };
}

export function formatRuntimeReadinessReport(result) {
  const lines = [result.ready ? 'SafeRoute Maestro preflight passed.' : 'SafeRoute Maestro preflight blocked.'];

  for (const check of result.checks) {
    lines.push(`✓ ${check}`);
  }

  for (const blocker of result.blockers) {
    lines.push(`✗ ${blocker}`);
  }

  return `${lines.join('\n')}\n`;
}

function resolveMaestroVersion() {
  const candidates = [
    process.env.MAESTRO_BIN,
    join(homedir(), '.maestro/bin/maestro'),
    'maestro'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes('/') && !existsSync(candidate)) {
      continue;
    }

    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: MAESTRO_VERSION_TIMEOUT_MS
    });

    if (result.status === 0) {
      return result.stdout.trim() || null;
    }
  }

  return null;
}

function isIosSimulatorBooted() {
  const simctlOutput = runText('xcrun', ['simctl', 'list', 'devices', 'booted', '--json']);

  if (!simctlOutput) {
    return false;
  }

  const bootedDevices = readJsonText(simctlOutput);

  return Object.entries(bootedDevices?.devices || {}).some(([runtime, devices]) => {
    return runtime.includes('.iOS-') && devices.some((device) => device.state === 'Booted' && device.udid);
  });
}

async function resolvePortState(port) {
  const processDetails = await findListeningProcesses(port);
  const hasLsofListener = !processDetails.startsWith('No listener details');
  const hasTcpListener = await isTcpPortListening({ port });

  return {
    available: !hasLsofListener && !hasTcpListener,
    processDetails: hasLsofListener ? processDetails : 'A TCP listener responded, but lsof did not return process details.'
  };
}

export async function runPreflight({ stdout = process.stdout, stderr = process.stderr } = {}) {
  const port = MAESTRO_PORT;
  const packageJson = readJsonFile(join(process.cwd(), 'package.json'));
  const portState = await resolvePortState(port);
  const expoGoVersions = await resolveBootedExpoGoVersions();
  const result = evaluateMaestroRuntimePreflight({
    bootedSimulatorAvailable: isIosSimulatorBooted(),
    expoGoVersions,
    installedExpoVersion: readPackageVersion('expo'),
    installedReactNativeVersion: readPackageVersion('react-native'),
    maestroCliVersion: resolveMaestroVersion(),
    nodeVersion: process.version,
    packageExpoVersionRange: packageJson?.dependencies?.expo,
    packageNodeEngine: packageJson?.engines?.node,
    packageReactNativeVersion: packageJson?.dependencies?.['react-native'],
    port,
    portAvailable: portState.available,
    portProcessDetails: portState.processDetails
  });
  const output = formatRuntimeReadinessReport(result);

  if (result.ready) {
    stdout.write(output);
    return 0;
  }

  stderr.write(output);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const exitCode = await runPreflight();
  process.exit(exitCode);
}
