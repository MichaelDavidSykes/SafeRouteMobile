import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { describe, it } from 'node:test';

type MaestroPreflightModule = {
  formatPortInUseMessage: (port: number, processDetails: string) => string;
  isTcpPortListening: (options: { host?: string; port: number; timeoutMs?: number }) => Promise<boolean>;
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
      scripts['test:maestro:ios'],
      'maestro test maestro/ios-preview-route-live-map.yaml'
    );
  });

  it('documents the port discipline for the Expo Go smoke path', () => {
    const source = readme();

    assert.match(source, /no-build iOS Maestro smoke path/);
    assert.match(source, /port `8081` is free/);
    assert.match(source, /stale SafeRoute bundle/);
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
