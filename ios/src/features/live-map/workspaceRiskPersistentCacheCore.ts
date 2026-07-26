import type { RiskZone } from './liveMapTypes';
import {
  VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS,
  normalizePersistedRiskZones,
  normalizeViewportRiskCacheScopeId
} from './viewportRiskPersistentCacheCore';

export const WORKSPACE_RISK_PERSISTENT_CACHE_SCHEMA = 1;
export const WORKSPACE_RISK_PERSISTENT_MAX_CHARACTERS = 1024 * 1024;
export const WORKSPACE_RISK_PERSISTENT_MAX_ZONES = 500;

export interface WorkspaceRiskPersistentSnapshot {
  cachedAtMs: number;
  zones: RiskZone[];
}

interface WorkspaceRiskPersistentRecord extends WorkspaceRiskPersistentSnapshot {
  schema: typeof WORKSPACE_RISK_PERSISTENT_CACHE_SCHEMA;
  scopeId: string;
  workspaceId: string;
}

export function serializeWorkspaceRiskCache(
  scopeIdValue: string,
  workspaceIdValue: string,
  zonesValue: readonly RiskZone[],
  nowMs = Date.now()
): string {
  const scopeId = normalizeViewportRiskCacheScopeId(scopeIdValue);
  const workspaceId = normalizeWorkspaceId(workspaceIdValue);
  const zones = normalizePersistedRiskZones(
    zonesValue,
    WORKSPACE_RISK_PERSISTENT_MAX_ZONES
  );
  if (!scopeId || !workspaceId || !zones) {
    throw new Error('Workspace risk cache input is invalid.');
  }
  const serialized = JSON.stringify({
    cachedAtMs: nowMs,
    schema: WORKSPACE_RISK_PERSISTENT_CACHE_SCHEMA,
    scopeId,
    workspaceId,
    zones
  } satisfies WorkspaceRiskPersistentRecord);
  if (serialized.length > WORKSPACE_RISK_PERSISTENT_MAX_CHARACTERS) {
    throw new Error('Workspace risk cache storage capacity was exceeded.');
  }
  return serialized;
}

export function parseWorkspaceRiskCache(
  raw: string | null,
  expectedScopeIdValue: string,
  expectedWorkspaceIdValue: string,
  nowMs = Date.now()
): WorkspaceRiskPersistentSnapshot | null {
  const expectedScopeId = normalizeViewportRiskCacheScopeId(
    expectedScopeIdValue
  );
  const expectedWorkspaceId = normalizeWorkspaceId(
    expectedWorkspaceIdValue
  );
  if (
    !raw
    || !expectedScopeId
    || !expectedWorkspaceId
    || raw.length > WORKSPACE_RISK_PERSISTENT_MAX_CHARACTERS
  ) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<WorkspaceRiskPersistentRecord>;
    const zones = normalizePersistedRiskZones(
      value.zones,
      WORKSPACE_RISK_PERSISTENT_MAX_ZONES
    );
    if (
      value.schema !== WORKSPACE_RISK_PERSISTENT_CACHE_SCHEMA
      || normalizeViewportRiskCacheScopeId(value.scopeId) !== expectedScopeId
      || normalizeWorkspaceId(value.workspaceId) !== expectedWorkspaceId
      || !Number.isFinite(value.cachedAtMs)
      || Number(value.cachedAtMs) <= 0
      || Number(value.cachedAtMs) > nowMs
      || nowMs - Number(value.cachedAtMs)
        > VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS
      || !zones
    ) {
      return null;
    }
    return {
      cachedAtMs: Number(value.cachedAtMs),
      zones
    };
  } catch {
    return null;
  }
}

export function normalizeWorkspaceId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, 160)
    : '';
}
