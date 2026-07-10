import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { describe, it } from 'node:test';

type MaestroPreflightModule = {
  evaluateMaestroRuntimePreflight: (inputs: Record<string, unknown>) => {
    blockers: string[];
    checks: string[];
    ready: boolean;
  };
  findExpoGoSdkMismatch: (expectedSdkMajor: number | null, expoGoVersions: string[]) => string | null;
  formatExpoGoMismatchMessage: (options: { expectedSdkMajor: number; installedVersion: string }) => string;
  formatNodeVersionMismatchMessage: (options: { currentVersion: string; packageNodeEngine: string }) => string;
  formatPortInUseMessage: (port: number, processDetails: string) => string;
  formatRuntimeReadinessReport: (result: { blockers: string[]; checks: string[]; ready: boolean }) => string;
  isNodeVersionAtLeast: (currentVersion: string, minimumVersion: string) => boolean;
  isTcpPortListening: (options: { host?: string; port: number; timeoutMs?: number }) => Promise<boolean>;
  parseExpoGoVersionsFromListApps: (output: string) => string[];
  parseExpoSdkMajor: (versionRange: string) => number | null;
  parseMinimumNodeVersion: (engineRange: string) => { major: number; minor: number; patch: number } | null;
  parseNodeVersion: (version: string) => { major: number; minor: number; patch: number } | null;
  resolveBootedExpoGoVersions: (options?: {
    containerResolver?: () => string[];
    listAppsResolver?: () => Promise<string[]>;
  }) => Promise<string[]>;
};

const readyInputs = {
  bootedSimulatorAvailable: true,
  expoGoVersions: ['56.0.4'],
  installedExpoVersion: '56.0.15',
  installedReactNativeVersion: '0.85.3',
  maestroCliVersion: '2.6.1',
  nodeVersion: 'v22.13.1',
  packageExpoVersionRange: '~56.0.15',
  packageNodeEngine: '>=22.13.0',
  packageReactNativeVersion: '0.85.3',
  port: 8081,
  portAvailable: true,
  portProcessDetails: ''
};

const packageJson = () =>
  JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

const readme = () => readFileSync(join(process.cwd(), 'README.md'), 'utf8');

async function loadPreflightModule(): Promise<MaestroPreflightModule> {
  return import(pathToFileURL(join(process.cwd(), 'scripts/maestro-ios-preflight.mjs')).href) as Promise<MaestroPreflightModule>;
}

describe('Maestro iOS runtime preflight', () => {
  it('runs before the no-build Expo listener command', () => {
    const scripts = packageJson().scripts;

    assert.equal(
      scripts['prestart:maestro:ios'],
      'node scripts/maestro-ios-preflight.mjs'
    );
    assert.equal(
      scripts['start:maestro:ios'],
      'NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081'
    );
    assert.equal(
      scripts['prestart:maestro:ios:preview'],
      'node scripts/maestro-ios-preflight.mjs'
    );
    assert.equal(
      scripts['start:maestro:ios:preview'],
      'SAFEROUTE_ENABLE_PREVIEW_MODE=true NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081'
    );
    assert.equal(
      scripts['test:maestro:ios'],
      'node scripts/run-maestro.mjs test maestro/ios-preview-route-live-map.yaml'
    );
  });

  it('documents the full Expo Go smoke preflight', () => {
    const source = readme();

    assert.match(source, /no-build iOS Maestro smoke path/);
    assert.match(source, /SDK 56 dependency install/);
    assert.match(source, /Maestro CLI/);
    assert.match(source, /matching Expo Go SDK family/);
    assert.match(source, /Node 22\.13\+/);
    assert.match(source, /port `8081`/);
    assert.match(source, /stale SafeRoute bundle/);
  });

  it('passes when Node, SDK, simulator, Expo Go, Maestro, dependencies, and port line up', async () => {
    const {
      evaluateMaestroRuntimePreflight,
      formatRuntimeReadinessReport,
      isNodeVersionAtLeast,
      parseExpoSdkMajor,
      parseMinimumNodeVersion,
      parseNodeVersion
    } = await loadPreflightModule();
    const result = evaluateMaestroRuntimePreflight(readyInputs);

    assert.equal(parseExpoSdkMajor('~56.0.15'), 56);
    assert.equal(parseExpoSdkMajor('56.0.4'), 56);
    assert.equal(parseExpoSdkMajor('^55.0.0'), 55);
    assert.equal(parseExpoSdkMajor('latest'), null);
    assert.deepEqual(parseNodeVersion('v22.13.1'), { major: 22, minor: 13, patch: 1 });
    assert.deepEqual(parseMinimumNodeVersion('>=22.13.0'), { major: 22, minor: 13, patch: 0 });
    assert.equal(isNodeVersionAtLeast('v22.13.1', '>=22.13.0'), true);
    assert.equal(isNodeVersionAtLeast('v22.12.9', '>=22.13.0'), false);
    assert.equal(result.ready, true);
    assert.deepEqual(result.blockers, []);
    assert.ok(result.checks.some((check) => check.includes('Node 22.13.1 satisfies >=22.13.0')));
    assert.ok(result.checks.some((check) => check.includes('Expo Go 56.0.4 matches SDK 56')));
    assert.match(formatRuntimeReadinessReport(result), /SafeRoute Maestro preflight passed/);
  });

  it('blocks mismatched Node, Expo Go, incomplete dependencies, missing simulator, and a busy port', async () => {
    const { evaluateMaestroRuntimePreflight, formatRuntimeReadinessReport } = await loadPreflightModule();
    const result = evaluateMaestroRuntimePreflight({
      ...readyInputs,
      bootedSimulatorAvailable: false,
      expoGoVersions: ['54.0.2'],
      installedReactNativeVersion: null,
      nodeVersion: 'v18.15.0',
      portAvailable: false,
      portProcessDetails: 'node 1234 TCP *:8081 (LISTEN)'
    });
    const report = formatRuntimeReadinessReport(result);

    assert.equal(result.ready, false);
    assert.match(report, /Node 18\.15\.0/);
    assert.match(report, /requires Node >=22\.13\.0/);
    assert.match(report, /nvm use/);
    assert.match(report, /required node_modules packages are missing/);
    assert.match(report, /Boot an iOS simulator/);
    assert.match(report, /Expo Go 54\.0\.2/);
    assert.match(report, /targets Expo SDK 56/);
    assert.match(report, /port 8081 already in use/);
    assert.match(report, /node 1234/);
  });

  it('parses the booted simulator Expo Go version from simctl listapps output', async () => {
    const { parseExpoGoVersionsFromListApps } = await loadPreflightModule();
    const output = `
      "com.apple.Preferences" = {
        CFBundleVersion = "1";
      };
      "host.exp.Exponent" = {
        CFBundleDisplayName = "Expo Go";
        CFBundleIdentifier = "host.exp.Exponent";
        CFBundleVersion = "56.0.4";
      };
    `;

    assert.deepEqual(parseExpoGoVersionsFromListApps(output), ['56.0.4']);
    assert.deepEqual(parseExpoGoVersionsFromListApps('"other.app" = { CFBundleVersion = "56.0.4"; };'), []);
  });

  it('prefers bounded simctl listapps lookup before Expo Go container fallback', async () => {
    const { resolveBootedExpoGoVersions } = await loadPreflightModule();
    let containerCalled = false;

    assert.deepEqual(
      await resolveBootedExpoGoVersions({
        listAppsResolver: async () => {
          return ['56.0.4'];
        },
        containerResolver: () => {
          containerCalled = true;
          return ['54.0.7'];
        }
      }),
      ['56.0.4']
    );
    assert.equal(containerCalled, false);

    containerCalled = false;
    assert.deepEqual(
      await resolveBootedExpoGoVersions({
        listAppsResolver: async () => {
          return [];
        },
        containerResolver: () => {
          containerCalled = true;
          return ['56.0.4'];
        }
      }),
      ['56.0.4']
    );
    assert.equal(containerCalled, true);
  });

  it('keeps simctl and Maestro process probes time-bounded for local preflight reliability', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/maestro-ios-preflight.mjs'), 'utf8');

    assert.match(source, /SIMCTL_COMMAND_TIMEOUT_MS = 8000/);
    assert.match(source, /timeout: timeoutMs/);
    assert.match(source, /timeout: SIMCTL_COMMAND_TIMEOUT_MS/);
    assert.match(source, /MAESTRO_VERSION_TIMEOUT_MS = 20000/);
    assert.match(source, /timeout: MAESTRO_VERSION_TIMEOUT_MS/);
    assert.match(source, /await resolveBootedExpoGoVersions\(\)/);
  });

  it('fails fast when the shell Node runtime is too old for Expo SDK 56', async () => {
    const { formatNodeVersionMismatchMessage } = await loadPreflightModule();
    const message = formatNodeVersionMismatchMessage({
      currentVersion: 'v18.15.0',
      packageNodeEngine: '>=22.13.0'
    });

    assert.match(message, /Node 18\.15\.0/);
    assert.match(message, /requires Node >=22\.13\.0/);
    assert.match(message, /nvm use/);
    assert.match(message, /Expo\/Metro/);
  });

  it('fails fast when a booted Expo Go runtime cannot load the workspace SDK family', async () => {
    const { findExpoGoSdkMismatch, formatExpoGoMismatchMessage } = await loadPreflightModule();

    assert.equal(findExpoGoSdkMismatch(56, ['56.0.4']), null);
    assert.equal(findExpoGoSdkMismatch(56, []), null);
    assert.equal(findExpoGoSdkMismatch(56, ['54.0.2']), '54.0.2');

    const message = formatExpoGoMismatchMessage({
      expectedSdkMajor: 56,
      installedVersion: '54.0.2'
    });

    assert.match(message, /Expo Go 54\.0\.2/);
    assert.match(message, /targets Expo SDK 56/);
    assert.match(message, /no-build smoke flow/);
    assert.match(message, /false Maestro failures/);
  });

  it('explains how to avoid stale Expo Go bundles when the port is busy', async () => {
    const { formatPortInUseMessage } = await loadPreflightModule();
    const message = formatPortInUseMessage(8081, 'node 1234 TCP *:8081 (LISTEN)');

    assert.match(message, /port 8081 already in use/);
    assert.match(message, /npm run start:maestro:ios/);
    assert.match(message, /npm run test:maestro:ios/);
    assert.match(message, /stale or wrong SafeRoute bundle/);
    assert.match(message, /node 1234/);
  });

  it('detects whether a localhost TCP port is listening', async () => {
    const { isTcpPortListening } = await loadPreflightModule();
    const server = net.createServer();

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');

    try {
      assert.equal(
        await isTcpPortListening({ host: '127.0.0.1', port: address.port, timeoutMs: 250 }),
        true
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    assert.equal(
      await isTcpPortListening({ host: '127.0.0.1', port: address.port, timeoutMs: 250 }),
      false
    );
  });
});
