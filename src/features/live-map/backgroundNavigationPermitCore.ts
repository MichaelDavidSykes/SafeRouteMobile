import type { ActiveNavigationAccessScope } from "./activeNavigationSessionCore";

export const BACKGROUND_NAVIGATION_PERMIT_VERSION = 2;

export interface BackgroundNavigationPermit {
  accessScope: ActiveNavigationAccessScope;
  grantedAtMs: number;
  navigationInstanceId: string;
  routeId: string;
  version: typeof BACKGROUND_NAVIGATION_PERMIT_VERSION;
}

export interface BackgroundNavigationRuntimePermitStore {
  activate(permitValue: unknown): boolean;
  beginGrant(): number;
  commitGrant(grantRevision: number, permitValue: unknown): boolean;
  hasActivePermit(): boolean;
  status(): "active" | "none" | "pending";
  matches(permitValue: unknown): boolean;
  revoke(): void;
}

export function createBackgroundNavigationRuntimePermitStore(): BackgroundNavigationRuntimePermitStore {
  let activePermit: BackgroundNavigationPermit | null = null;
  let permitStatus: "active" | "none" | "pending" = "none";
  let revision = 0;

  return {
    activate(permitValue) {
      const permit = normalizeBackgroundNavigationPermit(permitValue);
      if (
        permitStatus !== "pending" ||
        !activePermit ||
        !permit ||
        !permitsMatch(activePermit, permit)
      ) {
        return false;
      }
      permitStatus = "active";
      return true;
    },
    beginGrant() {
      return revision;
    },
    commitGrant(grantRevision, permitValue) {
      const permit = normalizeBackgroundNavigationPermit(permitValue);
      if (grantRevision !== revision || !permit) {
        return false;
      }
      activePermit = permit;
      permitStatus = "pending";
      return true;
    },
    hasActivePermit() {
      return permitStatus === "active" && activePermit !== null;
    },
    status() {
      return permitStatus;
    },
    matches(permitValue) {
      const permit = normalizeBackgroundNavigationPermit(permitValue);
      return Boolean(
        permitStatus === "active" &&
          activePermit &&
          permit &&
          permitsMatch(activePermit, permit),
      );
    },
    revoke() {
      revision += 1;
      activePermit = null;
      permitStatus = "none";
    },
  };
}

function permitsMatch(
  left: BackgroundNavigationPermit,
  right: BackgroundNavigationPermit,
): boolean {
  return (
    left.routeId === right.routeId &&
    left.grantedAtMs === right.grantedAtMs &&
    left.navigationInstanceId === right.navigationInstanceId &&
    backgroundNavigationScopesMatch(left.accessScope, right.accessScope)
  );
}

export function createBackgroundNavigationPermit(
  routeIdValue: string,
  accessScopeValue: ActiveNavigationAccessScope,
  navigationInstanceIdValue: string,
  grantedAtMsValue = Date.now(),
): BackgroundNavigationPermit | null {
  const routeId = routeIdValue.trim();
  const navigationInstanceId = navigationInstanceIdValue.trim();
  const accessScope = normalizeBackgroundNavigationAccessScope(accessScopeValue);
  const grantedAtMs = Number(grantedAtMsValue);
  if (
    !routeId ||
    !accessScope ||
    !isValidNavigationInstanceId(navigationInstanceId) ||
    !Number.isFinite(grantedAtMs) ||
    grantedAtMs <= 0
  ) {
    return null;
  }

  return {
    accessScope,
    grantedAtMs,
    navigationInstanceId,
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
      typeof parsed.navigationInstanceId === "string"
        ? parsed.navigationInstanceId
        : "",
      Number(parsed.grantedAtMs),
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
  navigationInstanceIdValue,
  permitValue,
  routeIdValue,
  sessionAccessScope,
  sessionNavigationInstanceIdValue,
  sessionRouteIdValue,
}: {
  navigationInstanceIdValue: string;
  permitValue: unknown;
  routeIdValue: string;
  sessionAccessScope: unknown;
  sessionNavigationInstanceIdValue: string;
  sessionRouteIdValue: string;
}): boolean {
  const permit = normalizeBackgroundNavigationPermit(permitValue);
  const navigationInstanceId = navigationInstanceIdValue.trim();
  const routeId = routeIdValue.trim();
  const sessionRouteId = sessionRouteIdValue.trim();
  const sessionNavigationInstanceId = sessionNavigationInstanceIdValue.trim();
  return Boolean(
    permit &&
      navigationInstanceId &&
      permit.navigationInstanceId === navigationInstanceId &&
      sessionNavigationInstanceId === navigationInstanceId &&
      routeId &&
      permit.routeId === routeId &&
      sessionRouteId === routeId &&
      backgroundNavigationScopesMatch(permit.accessScope, sessionAccessScope),
  );
}

export function isBackgroundNavigationSampleCurrent(
  permitValue: unknown,
  sampleTimestampMsValue: number,
): boolean {
  const permit = normalizeBackgroundNavigationPermit(permitValue);
  const sampleTimestampMs = Number(sampleTimestampMsValue);
  return Boolean(
    permit &&
      Number.isFinite(sampleTimestampMs) &&
      sampleTimestampMs >= permit.grantedAtMs,
  );
}

function isValidNavigationInstanceId(value: string): boolean {
  return value.length >= 8 && value.length <= 160;
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
