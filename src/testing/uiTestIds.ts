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
  liveMapControl: (control: string) =>
    `safe-route-control-${normalizeTestIdSegment(control)}`,
  liveMapPrimaryAction: "safe-route-primary-action",
  liveMapStopAction: "safe-route-stop-action",
  liveMapDemoDriveAction: "safe-route-demo-action",
  liveMapRiskAlert: "safe-route-risk-alert",
  liveMapRiskDetail: "safe-route-risk-detail",
  liveMapRiskDetailDismiss: "safe-route-risk-detail-dismiss",
  liveMapRiskZoneArea: (riskZoneId: string) =>
    `safe-route-risk-area-${normalizeTestIdSegment(riskZoneId)}`,
  liveMapRouteRiskSegment: (riskZoneId: string) =>
    `safe-route-risk-segment-${normalizeTestIdSegment(riskZoneId)}`,
  liveMapRiskZone: (riskZoneId: string) =>
    `safe-route-risk-zone-${normalizeTestIdSegment(riskZoneId)}`,
};

export function normalizeTestIdSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || UNKNOWN_TEST_ID_SEGMENT;
}
