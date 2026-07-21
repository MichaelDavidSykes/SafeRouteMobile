import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isSessionRestoreAttemptCurrent,
  requireCurrentSessionRestoreAttempt,
} from '../src/features/auth/sessionRestoreAttempt';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

describe('saved-session restore attempt generation', () => {
  it('drops principal A validation when fresh principal B authentication starts first', async () => {
    let currentGeneration = 1;
    const principalAValidation = deferred();
    let principalAInstalled = false;

    const restorePrincipalA = (async () => {
      await principalAValidation.promise;
      if (!isSessionRestoreAttemptCurrent(currentGeneration, 1, true)) {
        return;
      }
      principalAInstalled = true;
    })();

    currentGeneration += 1;
    const principalBInstalled = true;
    principalAValidation.resolve();
    await restorePrincipalA;

    assert.equal(principalBInstalled, true);
    assert.equal(principalAInstalled, false);
  });

  it('accepts only a mounted restore with its unchanged generation', () => {
    assert.equal(isSessionRestoreAttemptCurrent(3, 3, true), true);
    assert.equal(isSessionRestoreAttemptCurrent(4, 3, true), false);
    assert.equal(isSessionRestoreAttemptCurrent(3, 3, false), false);
    assert.doesNotThrow(() =>
      requireCurrentSessionRestoreAttempt(3, 3, true),
    );
    assert.throws(
      () => requireCurrentSessionRestoreAttempt(4, 3, true),
      /restore attempt is stale/,
    );
  });
});
