#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const MAESTRO_PORT = 8081;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 450;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';

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
  const match = String(versionRange ?? '').match(/(\d+)(?:\.\d+)?(?:\.\d+)?/);

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
      { timeout: 4000 },
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

export function formatExpoGoMismatchMessage({ expectedSdkMajor, installedVersion }) {
  return [
    `SafeRoute Maestro preflight found Expo Go ${installedVersion}, but this workspace targets Expo SDK ${expectedSdkMajor}.`,
    `Install/open Expo Go ${expectedSdkMajor}.x on the booted iOS simulator or switch to a SafeRoute branch that targets the installed Expo Go runtime before running the no-build smoke flow.`,
    'This prevents false Maestro failures caused by Expo Go loading an incompatible SafeRoute bundle.'
  ].join('\n');
}

export async function runPreflight({ stdout = process.stdout, stderr = process.stderr } = {}) {
  const port = MAESTRO_PORT;
  const isListening = await isTcpPortListening({ port });

  if (isListening) {
    const processDetails = await findListeningProcesses(port);
    stderr.write(`${formatPortInUseMessage(port, processDetails)}\n`);
    return 1;
  }

  const expectedSdkMajor = readExpectedExpoSdkMajor();
  const expoGoVersions = await findBootedExpoGoVersions();
  const mismatchedExpoGoVersion = findExpoGoSdkMismatch(expectedSdkMajor, expoGoVersions);

  if (mismatchedExpoGoVersion) {
    stderr.write(`${formatExpoGoMismatchMessage({ expectedSdkMajor, installedVersion: mismatchedExpoGoVersion })}\n`);
    return 1;
  }

  const expoGoMessage = expectedSdkMajor && expoGoVersions.length
    ? `Expo Go ${expoGoVersions.join(', ')} matches SDK ${expectedSdkMajor}.`
    : 'No booted Expo Go install was discoverable; skipping simulator SDK check.';

  stdout.write(`SafeRoute Maestro preflight passed: port ${port} is free for Expo. ${expoGoMessage}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const exitCode = await runPreflight();
  process.exit(exitCode);
}
