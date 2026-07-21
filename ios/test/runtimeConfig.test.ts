import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  engines?: {
    node?: string;
    npm?: string;
  };
};

const readText = (path: string) => readFileSync(path, 'utf8');

describe('local runtime configuration', () => {
  it('keeps nvm on the Node 22 line used for SafeRoute Mobile checks', () => {
    assert.equal(readText('.nvmrc').trim(), '22');
    assert.match(packageJson.engines?.node ?? '', />=\s*22\.13\.0/);
    assert.match(packageJson.engines?.npm ?? '', />=\s*10/);
  });

  it('documents the no-build Node setup path for local iOS readiness checks', () => {
    const readme = readText('README.md');

    assert.match(readme, /Use the Node `22` runtime from `\.nvmrc`/);
    assert.match(readme, /The package engine requires Node `22\.13\.0` or newer/);
    assert.match(readme, /nvm use/);
  });
});
