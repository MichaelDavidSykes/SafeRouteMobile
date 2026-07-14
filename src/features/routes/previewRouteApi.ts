import { getSavedRoutePlan, SAVED_ROUTE_PLANS } from "../live-map/demoRoute";
import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SavedRouteSyncResult } from "./routeApiCore";
import type { MobileSafeRouteClient } from "./routeMapper";

type PreviewSavedRoutesOptions = {
  empty?: boolean;
};

export const PREVIEW_CLIENTS: MobileSafeRouteClient[] = [
  {
    id: "preview-routes",
    name: "Central Operations",
  },
  {
    id: "preview-west",
    name: "West Corridor",
  },
];

function previewWorkspaceIdForRoute(routeId: string): string {
  return routeId === "sr-westbound-heathrow" ? "preview-west" : "preview-routes";
}

function withPreviewWorkspace(route: SavedSafeRoutePlan): SavedSafeRoutePlan {
  return {
    ...route,
    clientId: previewWorkspaceIdForRoute(route.id),
  };
}

export function loadPreviewSavedRoutes(
  clientId?: string,
  options: PreviewSavedRoutesOptions = {},
): SavedRouteSyncResult {
  if (options.empty) {
    return {
      clients: [PREVIEW_CLIENTS[0]],
      routes: [],
      selectedClientId: PREVIEW_CLIENTS[0].id,
    };
  }

  const normalizedClientId = String(clientId || "").trim();
  const selectedClient = normalizedClientId
    ? PREVIEW_CLIENTS.find((client) => client.id === normalizedClientId) || null
    : null;
  const routes = SAVED_ROUTE_PLANS
    .map(withPreviewWorkspace)
    .filter((route) => !selectedClient || route.clientId === selectedClient.id);

  return {
    clients: selectedClient ? [selectedClient] : PREVIEW_CLIENTS,
    routes: normalizedClientId && !selectedClient ? [] : routes,
    selectedClientId: selectedClient?.id || (normalizedClientId ? null : PREVIEW_CLIENTS[0].id),
  };
}

export function loadPreviewRouteDetail(routeId: string): SavedSafeRoutePlan {
  const route = getSavedRoutePlan(String(routeId || "").trim());

  if (!route) {
    throw new Error("Preview route unavailable. Return to Saved and choose another route.");
  }

  return withPreviewWorkspace(route);
}
