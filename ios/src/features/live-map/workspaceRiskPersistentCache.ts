import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RiskZone } from './liveMapTypes';
import { createPersistentRiskWriteQueue } from './persistentRiskWriteQueue';
import {
  normalizeWorkspaceId,
  parseWorkspaceRiskCache,
  serializeWorkspaceRiskCache,
  type WorkspaceRiskPersistentSnapshot
} from './workspaceRiskPersistentCacheCore';
import {
  VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS,
  normalizeViewportRiskCacheScopeId
} from './viewportRiskPersistentCacheCore';

const WORKSPACE_RISK_STORAGE_KEY_PREFIX = 'saferoute.workspace-risk.v1';
const memorySnapshots = new Map<string, WorkspaceRiskPersistentSnapshot>();
const writeQueue = createPersistentRiskWriteQueue(AsyncStorage);

function storageIdentity(scopeIdValue: string, workspaceIdValue: string) {
  const scopeId = normalizeViewportRiskCacheScopeId(scopeIdValue);
  const workspaceId = normalizeWorkspaceId(workspaceIdValue);
  if (!scopeId || !workspaceId) {
    throw new Error('Workspace risk cache identity is invalid.');
  }
  return {
    key: `${WORKSPACE_RISK_STORAGE_KEY_PREFIX}.` +
      `${encodeURIComponent(scopeId)}.${encodeURIComponent(workspaceId)}`,
    scopeId,
    workspaceId
  };
}

export const workspaceRiskPersistentCache = {
  async load(
    scopeIdValue: string,
    workspaceIdValue: string
  ): Promise<WorkspaceRiskPersistentSnapshot | null> {
    const { key, scopeId, workspaceId } = storageIdentity(
      scopeIdValue,
      workspaceIdValue
    );
    const memorySnapshot = memorySnapshots.get(key);
    const nowMs = Date.now();
    if (
      memorySnapshot
      && memorySnapshot.cachedAtMs <= nowMs
      && nowMs - memorySnapshot.cachedAtMs
        <= VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS
    ) {
      return cloneSnapshot(memorySnapshot);
    }
    memorySnapshots.delete(key);

    await writeQueue.wait(key);
    try {
      const raw = await AsyncStorage.getItem(key);
      const snapshot = parseWorkspaceRiskCache(raw, scopeId, workspaceId);
      if (raw && !snapshot) {
        await writeQueue.clear(key);
      }
      if (snapshot) {
        memorySnapshots.set(key, cloneSnapshot(snapshot));
      }
      return snapshot;
    } catch {
      return null;
    }
  },

  async save(
    scopeIdValue: string,
    workspaceIdValue: string,
    zones: readonly RiskZone[]
  ): Promise<void> {
    const { key, scopeId, workspaceId } = storageIdentity(
      scopeIdValue,
      workspaceIdValue
    );
    const serialized = serializeWorkspaceRiskCache(
      scopeId,
      workspaceId,
      zones
    );
    const snapshot = parseWorkspaceRiskCache(
      serialized,
      scopeId,
      workspaceId
    );
    if (snapshot) {
      memorySnapshots.set(key, cloneSnapshot(snapshot));
    }
    await writeQueue.save(key, serialized);
  },

  async clear(
    scopeIdValue: string,
    workspaceIdValue: string
  ): Promise<void> {
    const { key } = storageIdentity(scopeIdValue, workspaceIdValue);
    memorySnapshots.delete(key);
    await writeQueue.clear(key);
  }
};

function cloneSnapshot(
  snapshot: WorkspaceRiskPersistentSnapshot
): WorkspaceRiskPersistentSnapshot {
  return {
    cachedAtMs: snapshot.cachedAtMs,
    zones: snapshot.zones.map((zone) => ({
      ...zone,
      coordinate: { ...zone.coordinate },
      connectorCoordinates: zone.connectorCoordinates?.map(
        (coordinate) => ({ ...coordinate })
      ),
      polygonCoordinates: zone.polygonCoordinates?.map(
        (coordinate) => ({ ...coordinate })
      ),
      routeSegmentCoordinates: zone.routeSegmentCoordinates?.map(
        (coordinate) => ({ ...coordinate })
      )
    }))
  };
}
