const UNKNOWN_TEST_ID_SEGMENT = "unknown";

export const uiTestIds = {
  appRoot: "saferoute-app-root",
  appTabBar: "safe-route-tab-bar",
  appNavigationMenuToggle: "safe-route-navigation-menu-toggle",
  appTab: (tabId: string) =>
    `safe-route-tab-${normalizeTestIdSegment(tabId)}`,
  guestMapCanvas: "guest-map-canvas",
  guestMapCurrentLocation: "guest-map-current-location",
  guestMapLayerToggle: "guest-map-layer-toggle",
  guestMapCurrentLocationMarker: "guest-map-current-location-marker",
  guestMapNetworkStatus: "guest-map-network-status",
  guestMapPrimaryAction: "guest-map-primary-action",
  guestMapPlotAction: "guest-map-plot-action",
  guestMapOriginInput: "guest-map-origin-input",
  guestMapDestinationInput: "guest-map-destination-input",
  guestMapTravelModeSelector: "guest-map-travel-mode-selector",
  guestMapTravelMode: (mode: string) =>
    `guest-map-travel-mode-${normalizeTestIdSegment(mode)}`,
  guestMapRouteOptions: "guest-map-route-options",
  guestMapRoutePreference: (preference: string) =>
    `guest-map-route-preference-${normalizeTestIdSegment(preference)}`,
  guestMapWaypointInput: (waypointId: string) =>
    `guest-map-waypoint-${normalizeTestIdSegment(waypointId)}`,
  guestMapAddWaypoint: "guest-map-add-waypoint",
  guestMapSheetGrabber: "guest-map-sheet-grabber",
  guestMapSheetClose: "guest-map-sheet-close",
  guestMapCollapsedSheet: "guest-map-collapsed-sheet",
  guestMapCollapsedRouteStatus: "guest-map-collapsed-route-status",
  guestMapCollapsedStartRoute: "guest-map-collapsed-start-route",
  guestMapLongPressMenu: "guest-map-long-press-menu",
  guestMapLongPressAddWaypoint: "guest-map-long-press-add-waypoint",
  guestMapLongPressAddRisk: "guest-map-long-press-add-risk",
  guestMapRiskLoadingStatus: "guest-map-risk-loading-status",
  guestMapRiskResearch: "guest-map-risk-research",
  workspaceAccessRefresh: "workspace-access-refresh",
  workspaceSelectionScreen: "safe-route-workspace-selection",
  workspaceSelectionState: "safe-route-workspace-selection-state",
  workspaceSelectionContinue: "safe-route-workspace-selection-continue",
  workspaceSelectionRetry: "safe-route-workspace-selection-retry",
  workspaceSelectionSignOut: "safe-route-workspace-selection-sign-out",
  workspaceSelectionOption: (workspaceId: string) =>
    `safe-route-workspace-selection-${normalizeTestIdSegment(workspaceId)}`,
  guestMapWorkspaceSelector: "guest-map-workspace-selector",
  guestMapWorkspaceOption: (workspaceId: string) =>
    `guest-map-workspace-${normalizeTestIdSegment(workspaceId)}`,
  guestMapSearchResults: "guest-map-search-results",
  guestMapSearchResult: (resultId: string) =>
    `guest-map-search-${normalizeTestIdSegment(resultId)}`,
  guestMapManagePlace: (resultId: string) =>
    `guest-map-manage-place-${normalizeTestIdSegment(resultId)}`,
  guestMapRoutePreview: "guest-map-route-preview",
  guestMapRouteAlternative: (index: number) =>
    `guest-map-route-alternative-${Math.max(1, Math.floor(index))}`,
  guestMapGateAction: (feature: string) =>
    `guest-map-gate-${normalizeTestIdSegment(feature)}`,
  loginScreen: "safe-route-login",
  loginEmail: "safe-route-login-email",
  loginPassword: "safe-route-login-password",
  loginCode: "safe-route-login-code",
  loginResendCode: "safe-route-login-resend-code",
  loginPrimaryAction: "safe-route-login-primary-action",
  loginSavedSessionRetry: "safe-route-login-saved-session-retry",
  loginSecondaryAction: "safe-route-login-secondary-action",
  loginMapReturn: "safe-route-login-map-return",
  loginNotice: "safe-route-login-notice",
  loginCreateAccount: "safe-route-login-create-account",
  authBack: "safe-route-auth-back",
  accountCreateScreen: "safe-route-account-create",
  accountCreateForm: "safe-route-account-create-form",
  accountCreateBack: "safe-route-account-create-back",
  accountCreateFirstName: "safe-route-account-create-first-name",
  accountCreateLastName: "safe-route-account-create-last-name",
  accountCreateEmail: "safe-route-account-create-email",
  accountCreatePassword: "safe-route-account-create-password",
  accountCreatePasswordToggle: "safe-route-account-create-password-toggle",
  accountCreateRequirementLength: "safe-route-account-create-requirement-length",
  accountCreateRequirementLetterNumber:
    "safe-route-account-create-requirement-letter-number",
  accountCreateRequirementSpecial: "safe-route-account-create-requirement-special",
  accountCreateSubmit: "safe-route-account-create-submit",
  accountCreateSignIn: "safe-route-account-create-sign-in",
  accountVerifyScreen: "safe-route-account-verify",
  accountVerifyCode: "safe-route-account-verify-code",
  accountVerifySubmit: "safe-route-account-verify-submit",
  passwordResetOpen: "safe-route-password-reset-open",
  passwordResetRequest: "safe-route-password-reset-request",
  passwordResetEmail: "safe-route-password-reset-email",
  passwordResetSend: "safe-route-password-reset-send",
  passwordResetForm: "safe-route-password-reset-form",
  passwordResetCode: "safe-route-password-reset-code",
  passwordResetNewPassword: "safe-route-password-reset-new-password",
  passwordResetConfirmPassword: "safe-route-password-reset-confirm-password",
  passwordResetSubmit: "safe-route-password-reset-submit",
  passwordResetSuccess: "safe-route-password-reset-success",
  passwordResetDone: "safe-route-password-reset-done",
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
  operationsLoading: "safe-route-operations-loading",
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
  operationsCalendarDetail: "safe-route-operations-calendar-detail",
  operationsCalendarDetailDone: "safe-route-operations-calendar-detail-done",
  operationsCalendarDetailMap: "safe-route-operations-calendar-detail-map",
  operationsConvoyDetail: "safe-route-operations-convoy-detail",
  operationsConvoyDetailBack: "safe-route-operations-convoy-detail-back",
  operationsConvoyRoute: (routeId: string) =>
    `safe-route-operations-convoy-route-${normalizeTestIdSegment(routeId)}`,
  operationsVehicleCard: (vehicleId: string) =>
    `safe-route-operations-vehicle-${normalizeTestIdSegment(vehicleId)}`,
  operationsVehicleDetail: "safe-route-operations-vehicle-detail",
  operationsVehicleDetailDone: "safe-route-operations-vehicle-detail-done",
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
  workspaceHandoffRetryNotice: "safe-route-workspace-handoff-retry",
  workspaceHandoffRetryAction: "safe-route-workspace-handoff-retry-action",
  workspaceHandoffChooseAnotherAction:
    "safe-route-workspace-handoff-choose-another",
  workspaceHandoffKeepCurrentAction:
    "safe-route-workspace-handoff-keep-current",
  offlineCalendarCleanupNotice: "safe-route-calendar-cleanup",
  offlineCalendarCleanupAlert: "safe-route-calendar-cleanup-alert",
  offlineCalendarCleanupRetry: "safe-route-calendar-cleanup-retry",
  liveMapReturn: "safe-route-return",
  liveMapRouteSummarySheet: "safe-route-summary-sheet",
  liveMapJourney: (routeId: string) =>
    `safe-route-journey-${normalizeTestIdSegment(routeId)}`,
  liveMapSavedRouteDetails: "safe-route-saved-details",
  liveMapShareRoute: "safe-route-share-route",
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
  liveMapRiskDetailExpanded: "safe-route-risk-detail-expanded",
  liveMapRiskDetailDismiss: "safe-route-risk-detail-dismiss",
  liveMapRiskZoneArea: (riskZoneId: string) =>
    `safe-route-risk-area-${normalizeTestIdSegment(riskZoneId)}`,
  liveMapRouteRiskSegment: (riskZoneId: string) =>
    `safe-route-risk-segment-${normalizeTestIdSegment(riskZoneId)}`,
  liveMapRiskZone: (riskZoneId: string) =>
    `safe-route-risk-zone-${normalizeTestIdSegment(riskZoneId)}`,
  supportFacility: (facilityId: string) =>
    `safe-route-support-${normalizeTestIdSegment(facilityId)}`,
};

export function normalizeTestIdSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || UNKNOWN_TEST_ID_SEGMENT;
}
