import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

type MaestroRunnerModule = {
  createMaestroCandidates: (options?: {
    env?: Record<string, string | undefined>;
    homeDir?: string;
  }) => string[];
  createMaestroProcessEnv: (env?: Record<string, string | undefined>) => Record<string, string | undefined>;
  formatMissingMaestroMessage: () => string;
  parseMaestroRetryCount: (value: string | undefined, fallback?: number) => number;
  resolveMaestroBinary: (options?: {
    candidates?: string[];
    existsSyncImpl?: (path: string) => boolean;
    spawnSyncImpl?: (command: string, args: string[], options: unknown) => { status: number | null };
  }) => string | null;
  runMaestroCli: (args: string[], options?: {
    env?: Record<string, string | undefined>;
    existsSyncImpl?: (path: string) => boolean;
    stderr?: { write: (message: string) => void };
    spawnSyncImpl?: (command: string, args: string[], options: unknown) => {
      error?: Error;
      signal?: string | null;
      status: number | null;
    };
  }) => number;
  shouldRetryMaestroCommand: (args: string[]) => boolean;
};

async function loadMaestroRunner(): Promise<MaestroRunnerModule> {
  return import(pathToFileURL(join(process.cwd(), 'scripts/run-maestro.mjs')).href) as Promise<MaestroRunnerModule>;
}

describe('SafeRoute Maestro npm runner', () => {
  it('prefers MAESTRO_BIN, then the standard user install path, then PATH', async () => {
    const { createMaestroCandidates } = await loadMaestroRunner();

    assert.deepEqual(
      createMaestroCandidates({
        env: { MAESTRO_BIN: '/opt/maestro/bin/maestro' },
        homeDir: '/Users/tester'
      }),
      [
        '/opt/maestro/bin/maestro',
        '/Users/tester/.maestro/bin/maestro',
        'maestro'
      ]
    );
  });

  it('resolves the user Maestro install when npm PATH omits ~/.maestro/bin', async () => {
    const { resolveMaestroBinary } = await loadMaestroRunner();
    const calls: string[] = [];

    const binary = resolveMaestroBinary({
      candidates: ['/missing/maestro', '/Users/tester/.maestro/bin/maestro', 'maestro'],
      existsSyncImpl: (path) => path === '/Users/tester/.maestro/bin/maestro',
      spawnSyncImpl: (command) => {
        calls.push(command);
        return { status: command === '/Users/tester/.maestro/bin/maestro' ? 0 : 1 };
      }
    });

    assert.equal(binary, '/Users/tester/.maestro/bin/maestro');
    assert.deepEqual(calls, ['/Users/tester/.maestro/bin/maestro']);
  });

  it('falls back to PATH and returns clear setup copy when no candidate works', async () => {
    const { formatMissingMaestroMessage, resolveMaestroBinary } = await loadMaestroRunner();
    const attempted: string[] = [];
    const missing = resolveMaestroBinary({
      candidates: ['/missing/maestro', 'maestro'],
      existsSyncImpl: () => false,
      spawnSyncImpl: (command) => {
        attempted.push(command);
        return { status: 127 };
      }
    });

    assert.equal(missing, null);
    assert.deepEqual(attempted, ['maestro']);
    assert.match(formatMissingMaestroMessage(), /MAESTRO_BIN/);
    assert.match(formatMissingMaestroMessage(), /~\/\.maestro\/bin\/maestro/);
    assert.match(formatMissingMaestroMessage(), /Codex shells/);
  });

  it('retries Maestro test flows once by default for transient local XCUITest drops', async () => {
    const {
      createMaestroProcessEnv,
      parseMaestroRetryCount,
      runMaestroCli,
      shouldRetryMaestroCommand
    } = await loadMaestroRunner();
    const calls: string[] = [];
    const spawnedTimeouts: Array<string | undefined> = [];
    const stderr: string[] = [];
    const exitCode = runMaestroCli(['test', 'maestro/ios-preview-route-live-map.yaml'], {
      env: { MAESTRO_BIN: '/Users/tester/.maestro/bin/maestro' },
      existsSyncImpl: (path) => path === '/Users/tester/.maestro/bin/maestro',
      stderr: { write: (message) => stderr.push(message) },
      spawnSyncImpl: (command, args, options) => {
        calls.push(`${command} ${args.join(' ')}`);
        if (args[0] === '--version') {
          return { status: 0 };
        }

        spawnedTimeouts.push(
          (options as { env?: Record<string, string | undefined> }).env?.MAESTRO_DRIVER_STARTUP_TIMEOUT
        );
        return { status: calls.length < 3 ? 1 : 0 };
      }
    });

    assert.equal(createMaestroProcessEnv({}).MAESTRO_DRIVER_STARTUP_TIMEOUT, '180000');
    assert.equal(
      createMaestroProcessEnv({ MAESTRO_DRIVER_STARTUP_TIMEOUT: '240000' }).MAESTRO_DRIVER_STARTUP_TIMEOUT,
      '240000'
    );
    assert.equal(parseMaestroRetryCount(undefined), 1);
    assert.equal(parseMaestroRetryCount('0'), 0);
    assert.equal(shouldRetryMaestroCommand(['test', 'flow.yaml']), true);
    assert.equal(shouldRetryMaestroCommand(['--version']), false);
    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [
      '/Users/tester/.maestro/bin/maestro --version',
      '/Users/tester/.maestro/bin/maestro test maestro/ios-preview-route-live-map.yaml',
      '/Users/tester/.maestro/bin/maestro test maestro/ios-preview-route-live-map.yaml'
    ]);
    assert.deepEqual(spawnedTimeouts, ['180000', '180000']);
    assert.match(stderr.join('\n'), /retrying \(1\/1\)/);
  });
});
