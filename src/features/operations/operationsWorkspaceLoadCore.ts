import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SavedRouteSyncResult } from "../routes/routeApiCore";
import { isWorkspaceUnavailableError } from "../workspaces/workspaceAccessRecovery";
import type { SafeRouteOperationsState } from "./operationsTypes";

type OperationsWorkspaceLoadOptions = {
  loadOperations: () => Promise<SafeRouteOperationsState>;
  loadRoutes: () => Promise<SavedRouteSyncResult>;
  ownsRequest: () => boolean;
  workspaceId: string;
};

export type OperationsWorkspaceLoadResult =
  | { status: "stale" }
  | { status: "workspace-unavailable" }
  | {
      operationsState: SafeRouteOperationsState;
      routes: SavedSafeRoutePlan[];
      status: "loaded";
    }
  | {
      error: unknown;
      routes: SavedSafeRoutePlan[];
      status: "operations-error";
    };

export function routesForOperationsWorkspace(
  routes: SavedSafeRoutePlan[],
  workspaceId: string,
): SavedSafeRoutePlan[] {
  return routes.filter((route) => route.clientId === workspaceId);
}

export async function loadOperationsWorkspaceData({
  loadOperations,
  loadRoutes,
  ownsRequest,
  workspaceId,
}: OperationsWorkspaceLoadOptions): Promise<OperationsWorkspaceLoadResult> {
  let routeResult: SavedRouteSyncResult;
  try {
    routeResult = await loadRoutes();
  } catch (error) {
    if (!ownsRequest()) {
      return { status: "stale" };
    }
    if (isWorkspaceUnavailableError(error)) {
      return { status: "workspace-unavailable" };
    }
    throw error;
  }
  if (!ownsRequest()) {
    return { status: "stale" };
  }

  const routes = routesForOperationsWorkspace(routeResult.routes, workspaceId);
  try {
    const operationsState = await loadOperations();
    if (!ownsRequest()) {
      return { status: "stale" };
    }

    return {
      operationsState,
      routes,
      status: "loaded",
    };
  } catch (error) {
    if (!ownsRequest()) {
      return { status: "stale" };
    }
    if (isWorkspaceUnavailableError(error)) {
      return { status: "workspace-unavailable" };
    }

    return {
      error,
      routes,
      status: "operations-error",
    };
  }
}
