const UNKNOWN_TEST_ID_SEGMENT = "unknown";

export const uiTestIds = {
  appRoot: "saferoute-app-root",
  guestMapCanvas: "guest-map-canvas",
  guestMapNetworkStatus: "guest-map-network-status",
  guestMapPrimaryAction: "guest-map-primary-action",
  guestMapPlotAction: "guest-map-plot-action",
  guestMapOriginInput: "guest-map-origin-input",
  guestMapDestinationInput: "guest-map-destination-input",
  guestMapWaypointInput: (waypointId: string) =>
    `guest-map-waypoint-${normalizeTestIdSegment(waypointId)}`,
  guestMapAddWaypoint: "guest-map-add-waypoint",
  guestMapSheetGrabber: "guest-map-sheet-grabber",
  guestMapCollapsedSheet: "guest-map-collapsed-sheet",
  guestMapLongPressMenu: "guest-map-long-press-menu",
  guestMapLongPressAddWaypoint: "guest-map-long-press-add-waypoint",
  guestMapLongPressAddRisk: "guest-map-long-press-add-risk",
  guestMapRiskLoadingStatus: "guest-map-risk-loading-status",
  guestMapRiskResearch: "guest-map-risk-research",
  workspaceAccessRefresh: "workspace-access-refresh",
  guestMapWorkspaceSelector: "guest-map-workspace-selector",
  guestMapWorkspaceOption: (workspaceId: string) =>
    `guest-map-workspace-${normalizeTestIdSegment(workspaceId)}`,
  guestMapSearchResults: "guest-map-search-results",
  guestMapSearchResult: (resultId: string) =>
    `guest-map-search-${normalizeTestIdSegment(resultId)}`,
  guestMapRoutePreview: "guest-map-route-preview",
  guestMapGateAction: (feature: string) =>
    `guest-map-gate-${normalizeTestIdSegment(feature)}`,
  loginScreen: "safe-route-login",
  loginEmail: "safe-route-login-email",
  loginPassword: "safe-route-login-password",
  loginCode: "safe-route-login-code",
  loginPrimaryAction: "safe-route-login-primary-action",
  loginSecondaryAction: "safe-route-login-secondary-action",
  loginMapReturn: "safe-route-login-map-return",
  routeListScreen: "safe-route-picker",
  routeListMapReturn: "route-list-map-return",
  routeListSignOut: "route-list-sign-out",
  routeListEmptyState: "safe-route-empty-state",
  routeListWorkspaceSelector: "safe-route-workspace-selector",
  routeListWorkspaceState: "safe-route-workspace-state",
  routeListOfflineNotice: "safe-route-offline-notice",
  routeListWorkspaceOption: (workspaceId: string) =>
    `safe-route-workspace-${normalizeTestIdSegment(workspaceId)}`,
  operationsScreen: "safe-route-operations",
  operationsMapReturn: "safe-route-operations-map-return",
  operationsSignOut: "safe-route-operations-sign-out",
  operationsWorkspaceSelector: "safe-route-operations-workspace-selector",
  operationsWorkspaceState: "safe-route-operations-workspace-state",
  operationsWorkspaceRetry: "safe-route-operations-workspace-retry",
  operationsErrorState: "safe-route-operations-error-state",
  operationsRetry: "safe-route-operations-retry",
  operationsSyncWarning: "safe-route-operations-sync-warning",
  operationsOfflineNotice: "safe-route-operations-offline-notice",
  operationsRemoveSavedCalendar: "safe-route-operations-remove-calendar",
  operationsCalendarRemovalStatus:
    "safe-route-operations-calendar-removal-status",
  operationsCalendarRemovalRetry:
    "safe-route-operations-calendar-removal-retry",
  operationsCalendarSavingControl:
    "safe-route-operations-calendar-saving-control",
  operationsCalendarSavingStatus:
    "safe-route-operations-calendar-saving-status",
  operationsEmptyState: "safe-route-operations-empty-state",
  operationsTab: (tabId: string) =>
    `safe-route-operations-tab-${normalizeTestIdSegment(tabId)}`,
  operationsRouteCard: (routeId: string) =>
    `safe-route-operations-route-${normalizeTestIdSegment(routeId)}`,
  operationsWorkspaceOption: (workspaceId: string) =>
    `safe-route-operations-workspace-${normalizeTestIdSegment(workspaceId)}`,
  operationsConvoyCard: (convoyId: string) =>
    `safe-route-operations-convoy-${normalizeTestIdSegment(convoyId)}`,
  savedRouteCard: (routeId: string) =>
    `safe-route-card-${normalizeTestIdSegment(routeId)}`,
  liveMapScreen: "safe-route-live-map",
  liveMapCanvas: "safe-route-map-view",
  liveMapBackgroundNavigationAction: "safe-route-background-navigation-action",
  liveMapResumeAction: "safe-route-resume-action",
  suspendedNavigationNotice: "safe-route-suspended-navigation",
  suspendedNavigationStatus: "safe-route-suspended-navigation-status",
  suspendedNavigationRetry: "safe-route-suspended-navigation-retry",
  suspendedNavigationEnd: "safe-route-suspended-navigation-end",
  navigationCleanupNotice: "safe-route-navigation-cleanup",
  navigationCleanupRetry: "safe-route-navigation-cleanup-retry",
  liveMapReturn: "safe-route-return",
  liveMapRouteSummarySheet: "safe-route-summary-sheet",
  liveMapJourney: (routeId: string) =>
    `safe-route-journey-${normalizeTestIdSegment(routeId)}`,
  liveMapSavedRouteDetails: "safe-route-saved-details",
  liveMapRemainingMetrics: "safe-route-remaining-metrics",
  liveMapGuidanceState: (state: string) =>
    `safe-route-guidance-${normalizeTestIdSegment(state)}`,
  liveMapControl: (control: string) =>
    `safe-route-control-${normalizeTestIdSegment(control)}`,
  liveMapPrimaryAction: "safe-route-primary-action",
  liveMapStopAction: "safe-route-stop-action",
  liveMapRerouteRetry: "safe-route-reroute-retry",
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
