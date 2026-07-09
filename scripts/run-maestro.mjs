#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DRIVER_STARTUP_TIMEOUT_MS = '180000';

function isPathLike(value) {
  return String(value || '').includes('/');
}

export function createMaestroCandidates({
  env = process.env,
  homeDir = homedir()
} = {}) {
  return [
    env.MAESTRO_BIN,
    join(homeDir, '.maestro/bin/maestro'),
    'maestro'
  ]
    .map((candidate) => String(candidate || '').trim())
    .filter(Boolean);
}

export function resolveMaestroBinary({
  candidates = createMaestroCandidates(),
  existsSyncImpl = existsSync,
  spawnSyncImpl = spawnSync
} = {}) {
  for (const candidate of candidates) {
    if (isPathLike(candidate) && !existsSyncImpl(candidate)) {
      continue;
    }

    const result = spawnSyncImpl(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
}

export function formatMissingMaestroMessage() {
  return [
    'SafeRoute Maestro runner could not find the Maestro CLI.',
    'Install Maestro, set MAESTRO_BIN to the executable, or ensure ~/.maestro/bin/maestro or maestro on PATH is runnable.',
    'This wrapper lets npm scripts work from Codex shells that do not automatically include ~/.maestro/bin in PATH.'
  ].join('\n');
}

export function parseMaestroRetryCount(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export function shouldRetryMaestroCommand(args) {
  return args[0] === 'test';
}

export function createMaestroProcessEnv(env = process.env) {
  return {
    ...env,
    MAESTRO_DRIVER_STARTUP_TIMEOUT:
      env.MAESTRO_DRIVER_STARTUP_TIMEOUT || DEFAULT_DRIVER_STARTUP_TIMEOUT_MS
  };
}

export function runMaestroCli(args, {
  env = process.env,
  existsSyncImpl = existsSync,
  stderr = process.stderr,
  spawnSyncImpl = spawnSync
} = {}) {
  const maestroBinary = resolveMaestroBinary({
    candidates: createMaestroCandidates({ env }),
    existsSyncImpl,
    spawnSyncImpl
  });

  if (!maestroBinary) {
    stderr.write(`${formatMissingMaestroMessage()}\n`);
    return 127;
  }

  const retryCount = shouldRetryMaestroCommand(args)
    ? parseMaestroRetryCount(env.MAESTRO_RETRIES, 1)
    : 0;
  const maestroEnv = createMaestroProcessEnv(env);
  let lastExitCode = 1;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const result = spawnSyncImpl(maestroBinary, args, {
      env: maestroEnv,
      stdio: 'inherit'
    });

    if (result.error) {
      stderr.write(`SafeRoute Maestro runner failed to start Maestro: ${result.error.message}\n`);
      return 1;
    }

    lastExitCode = typeof result.status === 'number'
      ? result.status
      : result.signal
        ? 1
        : 0;

    if (lastExitCode === 0) {
      return 0;
    }

    if (attempt < retryCount) {
      stderr.write(`SafeRoute Maestro run failed with exit ${lastExitCode}; retrying (${attempt + 1}/${retryCount}) to recover transient local XCUITest driver drops.\n`);
    }
  }

  return lastExitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runMaestroCli(process.argv.slice(2)));
}
