import type { ActiveNavigationAccessScope } from "./activeNavigationSessionCore";

export const BACKGROUND_NAVIGATION_PERMIT_VERSION = 1;

export interface BackgroundNavigationPermit {
  accessScope: ActiveNavigationAccessScope;
  routeId: string;
  version: typeof BACKGROUND_NAVIGATION_PERMIT_VERSION;
}

export function createBackgroundNavigationPermit(
  routeIdValue: string,
  accessScopeValue: ActiveNavigationAccessScope,
): BackgroundNavigationPermit | null {
  const routeId = routeIdValue.trim();
  const accessScope = normalizeBackgroundNavigationAccessScope(accessScopeValue);
  if (!routeId || !accessScope) {
    return null;
  }

  return {
    accessScope,
    routeId,
    version: BACKGROUND_NAVIGATION_PERMIT_VERSION,
  };
}

export function normalizeBackgroundNavigationPermit(
  value: unknown,
): BackgroundNavigationPermit | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!isRecord(parsed) || parsed.version !== BACKGROUND_NAVIGATION_PERMIT_VERSION) {
      return null;
    }
    return createBackgroundNavigationPermit(
      typeof parsed.routeId === "string" ? parsed.routeId : "",
      parsed.accessScope as ActiveNavigationAccessScope,
    );
  } catch {
    return null;
  }
}

export function backgroundNavigationScopesMatch(
  leftValue: unknown,
  rightValue: unknown,
): boolean {
  const left = normalizeBackgroundNavigationAccessScope(leftValue);
  const right = normalizeBackgroundNavigationAccessScope(rightValue);
  if (!left || !right || left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "public" && right.kind === "public") {
    return true;
  }
  return (
    left.kind === "workspace" &&
    right.kind === "workspace" &&
    left.clientId === right.clientId &&
    left.principalId === right.principalId
  );
}

export function isBackgroundNavigationWriteAuthorized({
  permitValue,
  routeIdValue,
  sessionAccessScope,
  sessionRouteIdValue,
}: {
  permitValue: unknown;
  routeIdValue: string;
  sessionAccessScope: unknown;
  sessionRouteIdValue: string;
}): boolean {
  const permit = normalizeBackgroundNavigationPermit(permitValue);
  const routeId = routeIdValue.trim();
  const sessionRouteId = sessionRouteIdValue.trim();
  return Boolean(
    permit &&
      routeId &&
      permit.routeId === routeId &&
      sessionRouteId === routeId &&
      backgroundNavigationScopesMatch(permit.accessScope, sessionAccessScope),
  );
}

function normalizeBackgroundNavigationAccessScope(
  value: unknown,
): ActiveNavigationAccessScope | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind === "public") {
    return typeof value.clientId !== "string" && typeof value.principalId !== "string"
      ? { kind: "public" }
      : null;
  }
  if (value.kind !== "workspace") {
    return null;
  }
  const clientId = typeof value.clientId === "string" ? value.clientId.trim() : "";
  const principalId =
    typeof value.principalId === "string" ? value.principalId.trim() : "";
  return clientId && principalId
    ? { clientId, kind: "workspace", principalId }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
