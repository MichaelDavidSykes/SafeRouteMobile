#!/usr/bin/env node
import { execFile } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const MAESTRO_PORT = 8081;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 450;

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

export async function runPreflight({ stdout = process.stdout, stderr = process.stderr } = {}) {
  const port = MAESTRO_PORT;
  const isListening = await isTcpPortListening({ port });

  if (!isListening) {
    stdout.write(`SafeRoute Maestro preflight passed: port ${port} is free for Expo.\n`);
    return 0;
  }

  const processDetails = await findListeningProcesses(port);
  stderr.write(`${formatPortInUseMessage(port, processDetails)}\n`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const exitCode = await runPreflight();
  process.exit(exitCode);
}
