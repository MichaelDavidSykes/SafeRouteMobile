import AsyncStorage from '@react-native-async-storage/async-storage';

import { createPersistentRiskWriteQueue } from './persistentRiskWriteQueue';
import type { ViewportRiskCache } from './viewportRiskState';
import {
  mergeViewportRiskCaches,
  normalizeViewportRiskCacheScopeId,
  parseViewportRiskCache,
  serializeViewportRiskCache
} from './viewportRiskPersistentCacheCore';

const VIEWPORT_RISK_STORAGE_KEY_PREFIX = 'saferoute.viewport-risk.v1';
const memoryCaches = new Map<string, ViewportRiskCache>();
const writeQueue = createPersistentRiskWriteQueue(AsyncStorage);

function storageIdentity(scopeIdValue: string) {
  const scopeId = normalizeViewportRiskCacheScopeId(scopeIdValue);
  if (!scopeId) {
    throw new Error('Viewport risk cache scope is invalid.');
  }
  return {
    key: `${VIEWPORT_RISK_STORAGE_KEY_PREFIX}.${encodeURIComponent(scopeId)}`,
    scopeId
  };
}

export const viewportRiskPersistentCache = {
  async load(scopeIdValue: string): Promise<ViewportRiskCache> {
    const { key, scopeId } = storageIdentity(scopeIdValue);
    const memoryCache = memoryCaches.get(key);
    if (memoryCache) {
      return mergeViewportRiskCaches(new Map(), memoryCache);
    }

    await writeQueue.wait(key);
    try {
      const raw = await AsyncStorage.getItem(key);
      const cache = parseViewportRiskCache(raw, scopeId);
      if (raw && !cache) {
        await writeQueue.clear(key);
      }
      if (cache) {
        memoryCaches.set(
          key,
          mergeViewportRiskCaches(new Map(), cache)
        );
      }
      return cache || new Map();
    } catch {
      return new Map();
    }
  },

  async save(scopeIdValue: string, cache: ViewportRiskCache): Promise<void> {
    const { key, scopeId } = storageIdentity(scopeIdValue);
    const serialized = serializeViewportRiskCache(cache, scopeId);
    memoryCaches.set(
      key,
      mergeViewportRiskCaches(new Map(), cache)
    );
    await writeQueue.save(key, serialized);
  },

  async clear(scopeIdValue: string): Promise<void> {
    const { key } = storageIdentity(scopeIdValue);
    memoryCaches.delete(key);
    await writeQueue.clear(key);
  }
};
