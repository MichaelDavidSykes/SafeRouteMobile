import { getSavedRoutePlan, SAVED_ROUTE_PLANS } from "../live-map/demoRoute";
import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SavedRouteSyncResult } from "./routeApiCore";
import type { MobileSafeRouteClient } from "./routeMapper";

const PREVIEW_CLIENT: MobileSafeRouteClient = {
  id: "preview-routes",
  name: "Preview routes",
};

export function loadPreviewSavedRoutes(clientId?: string): SavedRouteSyncResult {
  const normalizedClientId = String(clientId || "").trim();
  const routes =
    normalizedClientId && normalizedClientId !== PREVIEW_CLIENT.id
      ? []
      : SAVED_ROUTE_PLANS;

  return {
    clients: [PREVIEW_CLIENT],
    routes,
    selectedClientId: PREVIEW_CLIENT.id,
  };
}

export function loadPreviewRouteDetail(routeId: string): SavedSafeRoutePlan {
  const route = getSavedRoutePlan(String(routeId || "").trim());

  if (!route) {
    throw new Error("Preview route unavailable. Return to Saved and choose another route.");
  }

  return route;
}
