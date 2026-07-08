const UNKNOWN_TEST_ID_SEGMENT = "unknown";

export const uiTestIds = {
  appRoot: "saferoute-app-root",
  guestMapPrimaryAction: "guest-map-primary-action",
  guestMapPlotAction: "guest-map-plot-action",
  guestMapOriginInput: "guest-map-origin-input",
  guestMapDestinationInput: "guest-map-destination-input",
  guestMapRoutePreview: "guest-map-route-preview",
  guestMapGateAction: (feature: string) =>
    `guest-map-gate-${normalizeTestIdSegment(feature)}`,
  routeListScreen: "safe-route-picker",
  routeListMapReturn: "route-list-map-return",
  routeListSignOut: "route-list-sign-out",
  savedRouteCard: (routeId: string) =>
    `safe-route-card-${normalizeTestIdSegment(routeId)}`,
  liveMapScreen: "safe-route-live-map",
  liveMapCanvas: "safe-route-map-view",
  liveMapReturn: "safe-route-return",
  liveMapRouteSummarySheet: "safe-route-summary-sheet",
  liveMapPrimaryAction: "safe-route-primary-action",
  liveMapStopAction: "safe-route-stop-action",
  liveMapDemoDriveAction: "safe-route-demo-action",
};

export function normalizeTestIdSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || UNKNOWN_TEST_ID_SEGMENT;
}
