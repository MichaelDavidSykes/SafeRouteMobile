import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SafeRoutePreviewRequestCache } from '../src/features/guest-map/safeRoutePreviewRequestCache';

describe('SafeRoute preview request cache', () => {
  it('reuses only fresh completed results', async () => {
    const cache = new SafeRoutePreviewRequestCache<string>(10, 2);
    let loadCount = 0;
    const load = async () => {
      loadCount += 1;
      return `preview-${loadCount}`;
    };

    assert.equal(await cache.getOrLoad('route', { load }), 'preview-1');
    assert.equal(await cache.getOrLoad('route', { load }), 'preview-1');
    assert.equal(loadCount, 1);

    assert.equal(await cache.getOrLoad('route', {
      load,
      nowMs: Date.now() + 100,
    }), 'preview-2');
    assert.equal(loadCount, 2);
  });

  it('deduplicates an in-flight request without letting one caller cancel another', async () => {
    const cache = new SafeRoutePreviewRequestCache<string>();
    const firstController = new AbortController();
    const secondController = new AbortController();
    let loadCount = 0;
    let resolveLoad: ((value: string) => void) | undefined;
    let sharedSignal: AbortSignal | undefined;
    const load = (signal: AbortSignal) => {
      loadCount += 1;
      sharedSignal = signal;
      return new Promise<string>((resolve) => {
        resolveLoad = resolve;
      });
    };

    const first = cache.getOrLoad('route', {
      load,
      signal: firstController.signal,
    });
    const second = cache.getOrLoad('route', {
      load,
      signal: secondController.signal,
    });
    firstController.abort();

    await assert.rejects(first, { name: 'AbortError' });
    assert.equal(sharedSignal?.aborted, false);
    resolveLoad?.('verified-preview');
    assert.equal(await second, 'verified-preview');
    assert.equal(loadCount, 1);
  });

  it('aborts shared work when every subscriber has cancelled', async () => {
    const cache = new SafeRoutePreviewRequestCache<string>();
    const firstController = new AbortController();
    const secondController = new AbortController();
    let loadCount = 0;
    let sharedSignal: AbortSignal | undefined;
    const load = (signal: AbortSignal) => {
      loadCount += 1;
      sharedSignal = signal;
      return new Promise<string>(() => undefined);
    };

    const first = cache.getOrLoad('route', {
      load,
      signal: firstController.signal,
    });
    const second = cache.getOrLoad('route', {
      load,
      signal: secondController.signal,
    });
    await Promise.resolve();
    firstController.abort();
    secondController.abort();

    await assert.rejects(first, { name: 'AbortError' });
    await assert.rejects(second, { name: 'AbortError' });
    assert.equal(loadCount, 1);
    assert.equal(sharedSignal?.aborted, true);
  });

  it('supports a network-only request and never caches a rejected contract result', async () => {
    const cache = new SafeRoutePreviewRequestCache<string | null>();
    let loadCount = 0;
    const load = async () => {
      loadCount += 1;
      return loadCount === 1 ? null : `preview-${loadCount}`;
    };

    assert.equal(await cache.getOrLoad('route', {
      load,
      shouldCache: Boolean,
    }), null);
    assert.equal(await cache.getOrLoad('route', {
      load,
      shouldCache: Boolean,
    }), 'preview-2');
    assert.equal(await cache.getOrLoad('route', {
      load,
      shouldCache: Boolean,
      useCachedResult: false,
    }), 'preview-3');
    assert.equal(loadCount, 3);
  });

  it('drops an older completed result before a network-only refresh', async () => {
    const cache = new SafeRoutePreviewRequestCache<string>();
    let loadCount = 0;
    const load = async () => `preview-${++loadCount}`;

    assert.equal(await cache.getOrLoad('route', { load }), 'preview-1');
    assert.equal(await cache.getOrLoad('route', {
      load,
      useCachedResult: false,
    }), 'preview-2');
    assert.equal(await cache.getOrLoad('route', { load }), 'preview-2');
  });

  it('never publishes work invalidated by a risk mutation', async () => {
    const cache = new SafeRoutePreviewRequestCache<string>();
    let resolveLoad: ((value: string) => void) | undefined;
    const pending = cache.getOrLoad('route', {
      load: () => new Promise<string>((resolve) => {
        resolveLoad = resolve;
      }),
    });

    cache.clear({ abortInFlight: true });
    resolveLoad?.('stale-preview');

    await assert.rejects(pending, { name: 'AbortError' });
  });
});
