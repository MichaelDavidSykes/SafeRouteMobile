import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SafeRouteWorkspace } from "../workspaces/activeWorkspace";
import type {
  SafeRouteOperationsState,
  SafeRoutePerson,
  SafeRouteTripPlan,
  SafeRouteTripRouteAssignment,
  SafeRouteVehicleInventoryItem
} from "./operationsTypes";
import {
  OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS,
  type OfflineOperationsCalendarEntry,
} from "./offlineOperationsCacheCore";

export type OperationsTab = "planned-routes" | "calendar" | "convoy-management";

export type OperationsOfflineReviewStatus =
  | "checking-access"
  | "checking-connection"
  | "offline"
  | "sync-unavailable";

export type OperationsOfflineReviewPresentation = {
  accessibilityLabel: string;
  visibleLabel: string;
};

export type OperationsOfflineCalendarRemovalState =
  | "idle"
  | "removed"
  | "removing"
  | "retry";

export type OperationsOfflineCalendarRemovalPresentation = {
  actionAccessibilityHint: string | null;
  actionAccessibilityLabel: string | null;
  actionLabel: string | null;
  busy: boolean;
  confirmation: {
    accessibilityLabel: string;
    copy: string;
    title: string;
  } | null;
  status: {
    accessibilityLabel: string;
    message: string;
    title: string;
    tone: "failure" | "progress" | "success";
  } | null;
};

export type OperationsOfflineCalendarSavingState =
  | "allow-retry"
  | "allowed"
  | "allowing"
  | "capacity"
  | "checking"
  | "cleanup-retry"
  | "disabled"
  | "enabled"
  | "saved"
  | "stop-retry"
  | "stopping"
  | "unavailable";

export type OperationsOfflineCalendarSavingPresentation = {
  actionAccessibilityHint: string | null;
  actionAccessibilityLabel: string | null;
  actionKind: "allow" | "check" | "stop" | null;
  actionLabel: string | null;
  busy: boolean;
  confirmation: {
    copy: string;
    title: string;
  } | null;
  message: string;
  title: string;
  tone: "failure" | "neutral" | "success";
};

export type OperationsTabOption = {
  accessibilityLabel: string;
  id: OperationsTab;
  label: string;
  selected: boolean;
};

export type OperationsWorkspaceOption = {
  accessibilityHint: string;
  accessibilityLabel: string;
  id: string;
  label: string;
  selected: boolean;
};

export type OperationsWorkspaceState = {
  accessibilityLabel: string;
  copy: string;
  loading: boolean;
  retry: boolean;
  title: string;
};

export type OperationsEmptyState = {
  accessibilityLabel: string;
  copy: string;
  title: string;
};

export type OperationsRouteRow = {
  accessibilityLabel: string;
  badgeLabel: string;
  endpointLabel: string;
  id: string;
  manifestLabel: string;
  metaLabel: string;
  routeId: string | null;
  scheduleLabel: string;
  statusLabel: string;
  title: string;
  tripId: string | null;
};

export type OperationsConvoyRouteOption = {
  durationLabel: string;
  manifestLabel: string;
  peopleLabels: string[];
  routeId: string | null;
  scheduleLabel: string;
  statusLabel: string;
  title: string;
  vehicleLabels: string[];
};

export type OperationsConvoyVehicle = {
  accessibilityLabel: string;
  callsign: string;
  detailLabel: string;
  id: string;
  lead: boolean;
  modelLabel: string;
  nextEventLabel: string;
  protectionLabel: string;
  registrationLabel: string;
  roleLabel: string;
  seatLabel: string;
  statusLabel: string;
};

export type OperationsConvoyRow = {
  accessibilityLabel: string;
  durationLabel: string;
  endpointLabel: string;
  id: string;
  leadVehicleLabel: string;
  manifestAvailable: boolean;
  manifestLabel: string;
  metaLabel: string;
  peopleLabels: string[];
  routeLabels: string[];
  routeOptions: OperationsConvoyRouteOption[];
  scheduleLabel: string;
  statusLabel: string;
  title: string;
  tripId: string | null;
  vehicleLabels: string[];
  vehicles: OperationsConvoyVehicle[];
};

export type OperationsSummaryState = {
  accessibilityLabel: string;
  metrics: Array<{
    label: string;
    value: string;
  }>;
};

export type OperationsSyncWarningState = {
  accessibilityLabel: string;
  message: string;
};

type RouteAssignmentView = {
  assignment: SafeRouteTripRouteAssignment;
  index: number;
  route: SavedSafeRoutePlan | null;
  trip: SafeRouteTripPlan;
};

const TAB_COPY: Record<OperationsTab, { label: string; accessibilityLabel: string }> = {
  "planned-routes": {
    label: "Planned",
    accessibilityLabel: "View planned routes"
  },
  calendar: {
    label: "Calendar",
    accessibilityLabel: "View operations calendar"
  },
  "convoy-management": {
    label: "Convoys",
    accessibilityLabel: "View convoy management"
  }
};

export function createOperationsOfflineReviewPresentation({
  nowMs = Date.now(),
  status,
  storedAtMs,
}: {
  nowMs?: number;
  status: OperationsOfflineReviewStatus;
  storedAtMs: number;
}): OperationsOfflineReviewPresentation | null {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(storedAtMs) ||
    storedAtMs > nowMs ||
    nowMs - storedAtMs >= OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS
  ) {
    return null;
  }

  const hourMs = 60 * 60 * 1000;
  const ageHours = Math.floor((nowMs - storedAtMs) / hourMs);
  const visibleAge = ageHours < 1 ? "<1h" : `${ageHours}h`;
  const spokenAge =
    ageHours < 1
      ? "less than one hour ago"
      : `${ageHours} ${ageHours === 1 ? "hour" : "hours"} ago`;
  const stateLabel =
    status === "offline"
      ? "Offline"
      : status === "checking-connection"
        ? "Checking connection"
        : status === "checking-access"
          ? "Checking access"
          : "Sync unavailable";
  const safetySentence =
    status === "offline"
      ? "Reconnect and verify workspace access before relying on this calendar. Saved calendar labels and endpoints are stored. Full route plans, live risk and ETA, and convoy manifests are not stored offline."
      : status === "checking-connection"
        ? "Wait for the connection check and workspace access verification before relying on this calendar. Saved calendar labels and endpoints are stored. Full route plans, live risk and ETA, and convoy manifests are not stored offline."
        : status === "checking-access"
          ? "Wait for workspace access verification before relying on this calendar. Saved calendar labels and endpoints are stored. Full route plans, live risk and ETA, and convoy manifests are not stored offline."
          : "Retry sync before relying on this calendar. Saved calendar labels and endpoints are stored. Full route plans, live risk and ETA, and convoy manifests are not stored offline.";

  return {
    accessibilityLabel:
      `${stateLabel} Operations. This calendar was saved ${spokenAge} and is review only. ${safetySentence}`,
    visibleLabel:
      `${stateLabel} · calendar saved ${visibleAge} · review only`,
  };
}

export function createOperationsOfflineCalendarRemovalPresentation(
  state: OperationsOfflineCalendarRemovalState,
): OperationsOfflineCalendarRemovalPresentation {
  const removing = state === "removing";
  const retrying = state === "retry";
  const removed = state === "removed";
  const actionLabel = removed || removing
    ? null
    : retrying
      ? "Retry removal"
      : "Remove saved calendar";

  return {
    actionAccessibilityHint: removed || removing
      ? null
      : retrying
        ? "Retries deleting this workspace's saved calendar from this device."
        : "Deletes this workspace's saved calendar. Online Operations data is not changed. A future successful sync may save a new calendar.",
    actionAccessibilityLabel: retrying
      ? "Retry removing saved calendar from this device"
      : actionLabel
        ? "Remove saved calendar from this device"
        : null,
    actionLabel,
    busy: removing,
    confirmation: {
      accessibilityLabel:
        "Remove saved calendar confirmation. This deletes this workspace's saved calendar from this device. Online Operations data is unchanged. A future successful sync may save a new calendar.",
      copy:
        "This deletes this workspace's saved calendar from this device. Online Operations data is unchanged. A future successful sync may save a new calendar.",
      title: "Remove saved calendar?",
    },
    status:
      state === "removing"
        ? {
            accessibilityLabel:
              "Removing saved calendar from this device.",
            message: "Removing saved calendar from this device.",
            title: "Removing…",
            tone: "progress",
          }
        : state === "removed"
          ? {
              accessibilityLabel:
                "Saved calendar removed. This workspace's saved calendar was removed from this device. Online Operations data is unchanged. A future successful sync may save a new calendar.",
              message:
                "This workspace's saved calendar was removed from this device. Online Operations data is unchanged. A future successful sync may save a new calendar.",
              title: "Saved calendar removed",
              tone: "success",
            }
          : state === "retry"
            ? {
                accessibilityLabel:
                  "Removal needs retry. The saved calendar is hidden, but SafeRoute could not confirm removal from this device. Retry before closing the app.",
                message:
                  "The saved calendar is hidden, but SafeRoute could not confirm removal from this device. Retry before closing the app.",
                title: "Removal needs retry",
                tone: "failure",
              }
            : null,
  };
}

export function createOperationsOfflineCalendarSavingPresentation(
  state: OperationsOfflineCalendarSavingState,
  workspaceLabel = "this workspace",
): OperationsOfflineCalendarSavingPresentation {
  const normalizedWorkspaceLabel = workspaceLabel.trim() || "this workspace";
  if (state === "checking") {
    return {
      actionAccessibilityHint: null,
      actionAccessibilityLabel: null,
      actionKind: null,
      actionLabel: null,
      busy: true,
      confirmation: null,
      message: "Checking this device's setting.",
      title: "Offline Calendar",
      tone: "neutral",
    };
  }
  if (state === "stopping") {
    return {
      actionAccessibilityHint: null,
      actionAccessibilityLabel:
        `Stopping offline Calendar saves for ${normalizedWorkspaceLabel} on this device`,
      actionKind: null,
      actionLabel: "Stopping…",
      busy: true,
      confirmation: null,
      message: "Removing the saved copy and recording your choice.",
      title: "Stopping offline saves…",
      tone: "neutral",
    };
  }
  if (state === "allowing") {
    return {
      actionAccessibilityHint: null,
      actionAccessibilityLabel:
        `Allowing offline Calendar saving for ${normalizedWorkspaceLabel} on this device`,
      actionKind: null,
      actionLabel: "Allowing…",
      busy: true,
      confirmation: null,
      message: "Updating this device's setting.",
      title: "Allowing offline saves…",
      tone: "neutral",
    };
  }
  if (state === "enabled" || state === "allowed" || state === "saved") {
    return {
      actionAccessibilityHint:
        "Removes this workspace's saved Calendar and prevents future offline saves on this device until you allow them again.",
      actionAccessibilityLabel:
        `Stop future offline Calendar saves for ${normalizedWorkspaceLabel} on this device`,
      actionKind: "stop",
      actionLabel: "Stop future offline saves",
      busy: false,
      confirmation: {
        copy:
          "SafeRoute will remove this workspace's saved Calendar from this device and won't save it again until you allow offline saving. Online Operations data, Saved routes, and other workspaces are unchanged.",
        title: "Stop offline Calendar saves?",
      },
      message:
        state === "allowed"
          ? "Reconnect and sync to save a new limited Calendar on this device."
          : state === "saved"
            ? "A limited Calendar was verified on this device after the latest authorized sync."
            : "SafeRoute securely saves a limited Calendar after a successful sync.",
      title:
        state === "allowed"
          ? "Offline saving allowed"
          : state === "saved"
            ? "Offline Calendar saved"
            : "Offline saving is on",
      tone: state === "enabled" ? "neutral" : "success",
    };
  }
  if (state === "disabled") {
    return {
      actionAccessibilityHint:
        "Allows a future successful authorized sync to save this workspace's limited Calendar on this device.",
      actionAccessibilityLabel:
        `Allow offline Calendar saving for ${normalizedWorkspaceLabel} on this device`,
      actionKind: "allow",
      actionLabel: "Allow offline saving",
      busy: false,
      confirmation: null,
      message:
        "Nothing will be saved for this workspace until you allow it. Online Operations are unchanged.",
      title: "Offline Calendar saving is off",
      tone: "success",
    };
  }
  if (state === "cleanup-retry") {
    return {
      actionAccessibilityHint:
        "Retries removing any previous saved Calendar. Future offline saves remain blocked.",
      actionAccessibilityLabel:
        `Retry saved Calendar cleanup for ${normalizedWorkspaceLabel} on this device`,
      actionKind: "stop",
      actionLabel: "Retry cleanup",
      busy: false,
      confirmation: null,
      message:
        "Future saves are off and the Calendar is hidden, but SafeRoute could not confirm removal of the previous saved copy. Retry before closing the app.",
      title: "Saved copy cleanup needs retry",
      tone: "failure",
    };
  }
  if (state === "stop-retry") {
    return {
      actionAccessibilityHint:
        "Retries recording that this workspace must not save an offline Calendar on this device.",
      actionAccessibilityLabel:
        `Retry stopping offline Calendar saves for ${normalizedWorkspaceLabel} on this device`,
      actionKind: "stop",
      actionLabel: "Retry stopping saves",
      busy: false,
      confirmation: null,
      message:
        "SafeRoute could not confirm the setting. The Calendar is hidden in this session. Retry before closing the app.",
      title: "Setting needs retry",
      tone: "failure",
    };
  }
  if (state === "allow-retry") {
    return {
      actionAccessibilityHint:
        "Retries allowing future offline Calendar saves for this workspace on this device.",
      actionAccessibilityLabel:
        `Retry allowing offline Calendar saving for ${normalizedWorkspaceLabel} on this device`,
      actionKind: "allow",
      actionLabel: "Retry allowing saves",
      busy: false,
      confirmation: null,
      message:
        "Offline saving remains off because SafeRoute could not confirm the change.",
      title: "Setting needs retry",
      tone: "failure",
    };
  }
  if (state === "capacity") {
    return {
      actionAccessibilityHint: null,
      actionAccessibilityLabel: null,
      actionKind: null,
      actionLabel: null,
      busy: false,
      confirmation: null,
      message:
        "Stop did not complete. This workspace's setting is unchanged and its saved Calendar may remain on this device. Allow offline saving for another workspace, then try again.",
      title: "Stop did not complete",
      tone: "failure",
    };
  }
  return {
    actionAccessibilityHint:
      "Retries checking whether this workspace may save an offline Calendar on this device.",
    actionAccessibilityLabel:
      `Retry checking offline Calendar saving for ${normalizedWorkspaceLabel} on this device`,
    actionKind: "check",
    actionLabel: "Retry check",
    busy: false,
    confirmation: null,
    message:
      "SafeRoute cannot verify this device's setting, so Calendar reads and saves are blocked.",
    title: "Offline saving unavailable",
    tone: "failure",
  };
}

export function createOperationsExpiredCacheMessage(
  status: OperationsOfflineReviewStatus,
): string {
  if (status === "offline") {
    return "Saved calendar expired. Reconnect to refresh.";
  }
  if (status === "checking-connection") {
    return "Saved calendar expired. Wait for the connection check before refreshing.";
  }
  if (status === "sync-unavailable") {
    return "Saved calendar expired. Retry sync to refresh.";
  }
  return "Saved calendar expired. Wait for workspace access verification before refreshing.";
}

export function getOperationsOfflineReviewRefreshDelayMs({
  nowMs = Date.now(),
  storedAtMs,
}: {
  nowMs?: number;
  storedAtMs: number;
}): number | null {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(storedAtMs) ||
    storedAtMs > nowMs ||
    nowMs - storedAtMs >= OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS
  ) {
    return null;
  }

  const hourMs = 60 * 60 * 1000;
  const ageMs = nowMs - storedAtMs;
  const nextHourBoundaryMs =
    storedAtMs + (Math.floor(ageMs / hourMs) + 1) * hourMs;
  const expiryBoundaryMs =
    storedAtMs + OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS;
  return Math.max(
    1,
    Math.min(nextHourBoundaryMs - nowMs, expiryBoundaryMs - nowMs),
  );
}

const OPERATIONS_CLIENT_DISPLAY_MAX_LENGTH = 28;

export function createOperationsTabOptions(activeTab: OperationsTab): OperationsTabOption[] {
  return (Object.keys(TAB_COPY) as OperationsTab[]).map((id) => ({
    id,
    label: TAB_COPY[id].label,
    accessibilityLabel: `${TAB_COPY[id].accessibilityLabel}${id === activeTab ? ", selected" : ""}`,
    selected: id === activeTab
  }));
}

export function createOperationsWorkspaceOptions(
  workspaces: SafeRouteWorkspace[],
  activeWorkspaceId: string | null
): OperationsWorkspaceOption[] {
  return workspaces.map((workspace) => {
    const selected = workspace.id === activeWorkspaceId;
    const workspaceName = normalizeLabel(workspace.name, "Workspace");
    const label = createCompactLabel(workspaceName, OPERATIONS_CLIENT_DISPLAY_MAX_LENGTH, "Workspace");

    return {
      id: workspace.id,
      label,
      selected,
      accessibilityHint: `Uses ${workspaceName} for view-only SafeRoute operations.`,
      accessibilityLabel: `Use workspace ${workspaceName}${selected ? ", selected" : ""}`
    };
  });
}

export function shouldShowOperationsWorkspaceSelector(
  options: OperationsWorkspaceOption[]
): boolean {
  return options.length > 0;
}

export function createOperationsWorkspaceState({
  activeWorkspaceId,
  availableWorkspaceCount,
  errorMessage,
  loading
}: {
  activeWorkspaceId: string | null;
  availableWorkspaceCount: number;
  errorMessage: string;
  loading: boolean;
}): OperationsWorkspaceState | null {
  if (activeWorkspaceId) {
    return null;
  }

  if (loading && availableWorkspaceCount === 0) {
    return {
      accessibilityLabel: "Loading SafeRoute workspaces.",
      copy: "Checking the workspaces available to this account.",
      loading: true,
      retry: false,
      title: "Loading workspaces"
    };
  }

  if (availableWorkspaceCount > 0) {
    return {
      accessibilityLabel: errorMessage
        ? "Choose a cached workspace to review its operations."
        : "Choose a workspace to show its operations.",
      copy: errorMessage
        ? "Choose a saved workspace. Verify current access before relying on operations."
        : "Choose the workspace whose operations you need.",
      loading: false,
      retry: false,
      title: "Choose workspace"
    };
  }

  if (errorMessage) {
    return {
      accessibilityLabel: "Workspaces unavailable. Retry loading your SafeRoute workspaces.",
      copy: errorMessage,
      loading: false,
      retry: true,
      title: "Workspaces unavailable"
    };
  }

  return {
    accessibilityLabel: "No SafeRoute workspace access is available for this account.",
    copy: "Ask an administrator to add this account to a SafeRoute workspace.",
    loading: false,
    retry: false,
    title: "No workspace access"
  };
}

export function createOperationsTitle(tab: OperationsTab): string {
  if (tab === "calendar") {
    return "Calendar";
  }

  if (tab === "convoy-management") {
    return "Convoys";
  }

  return "Planned routes";
}

export function createOperationsSubtitle(tab: OperationsTab): string {
  if (tab === "calendar") {
    return "Planned movements";
  }

  if (tab === "convoy-management") {
    return "Vehicles, people, and route manifests.";
  }

  return "Upcoming routes synced from SafeRoute.";
}

export function createOperationsLoadingLabel(tab: OperationsTab): string {
  return `Loading ${TAB_COPY[tab].label.toLowerCase()}`;
}

export function createOperationsEmptyState(tab: OperationsTab): OperationsEmptyState {
  if (tab === "calendar") {
    return {
      title: "No scheduled movements",
      copy: "Trip route windows from SafeRoute will appear here.",
      accessibilityLabel: "No scheduled movements. Trip route windows from SafeRoute will appear here."
    };
  }

  if (tab === "convoy-management") {
    return {
      title: "No convoy manifests",
      copy: "Vehicles, people, and assigned routes will appear here once synced.",
      accessibilityLabel: "No convoy manifests. Vehicles, people, and assigned routes will appear here once synced."
    };
  }

  return {
    title: "No planned routes",
    copy: "Upcoming SafeRoute plans will appear here.",
    accessibilityLabel: "No planned routes. Upcoming SafeRoute plans will appear here."
  };
}

export function createOperationsOfflineEmptyState(
  tab: OperationsTab,
  calendarWasSaved: boolean,
  status: OperationsOfflineReviewStatus = "offline",
): OperationsEmptyState {
  if (status === "checking-connection") {
    return {
      title: "Checking connection",
      copy:
        "Looking for securely saved Operations data while the connection check finishes.",
      accessibilityLabel:
        "Checking connection. Looking for securely saved Operations data while the connection check finishes.",
    };
  }
  if (status === "checking-access") {
    return {
      title: "Checking workspace access",
      copy: "Waiting to verify current access before loading Operations.",
      accessibilityLabel:
        "Checking workspace access. Waiting to verify current access before loading Operations.",
    };
  }
  if (tab === "calendar") {
    if (calendarWasSaved) {
      return {
        title: "No saved movements",
        copy: "No scheduled movements were in the last saved calendar.",
        accessibilityLabel:
          "No saved movements. No scheduled movements were in the last saved calendar. Review only.",
      };
    }
    return {
      title: "Calendar unavailable offline",
      copy: "Reconnect to load and securely save this calendar.",
      accessibilityLabel:
        "Calendar unavailable offline. Reconnect to load and securely save this calendar.",
    };
  }

  if (tab === "convoy-management") {
    return {
      title: "Convoys unavailable offline",
      copy: "Convoy manifests aren't stored offline. Reconnect and verify access.",
      accessibilityLabel:
        "Convoys unavailable offline. Convoy manifests are not stored offline. Reconnect and verify workspace access.",
    };
  }

  return {
    title: "Planned details unavailable offline",
    copy:
      "Full planned-route details aren't available in this tab. Reconnect and verify access.",
    accessibilityLabel:
      "Full planned route details unavailable offline. Saved calendar labels and endpoints remain in Calendar. Reconnect and verify workspace access.",
  };
}

export function createOperationsOfflineSavingEmptyState(
  state: OperationsOfflineCalendarSavingState,
): OperationsEmptyState | null {
  if (
    state === "disabled" ||
    state === "allow-retry"
  ) {
    return {
      accessibilityLabel:
        "No offline Calendar is saved. Allow offline saving, then reconnect and sync to save a new Calendar.",
      copy:
        "Allow offline saving, then reconnect and sync to save a new Calendar.",
      title: "No offline Calendar saved",
    };
  }
  if (state === "allowed") {
    return {
      accessibilityLabel:
        "No offline Calendar is saved yet. Reconnect and sync to save a new Calendar.",
      copy: "Reconnect and sync to save a new Calendar.",
      title: "Offline saving allowed",
    };
  }
  if (state === "cleanup-retry") {
    return {
      accessibilityLabel:
        "Saved Calendar hidden. Cleanup needs retry before closing the app.",
      copy: "The previous saved copy is hidden. Retry cleanup before closing.",
      title: "Saved Calendar hidden",
    };
  }
  if (state === "stop-retry") {
    return {
      accessibilityLabel:
        "Saved Calendar hidden in this session. Retry the privacy setting before closing the app.",
      copy:
        "The Calendar is hidden in this session. Retry the setting before closing.",
      title: "Saved Calendar hidden",
    };
  }
  if (state === "capacity") {
    return {
      accessibilityLabel:
        "Stop did not complete. This Calendar may still be saved on this device.",
      copy:
        "This Calendar may still be saved. Allow offline saving for another workspace, then try again.",
      title: "Stop did not complete",
    };
  }
  if (state === "unavailable") {
    return {
      accessibilityLabel:
        "Offline Calendar unavailable. SafeRoute cannot verify this device's saving setting.",
      copy:
        "SafeRoute cannot verify this device's setting, so no saved Calendar is shown.",
      title: "Offline Calendar unavailable",
    };
  }
  return null;
}

export function createOfflineCalendarRows(
  entries: OfflineOperationsCalendarEntry[],
): OperationsRouteRow[] {
  return entries.map((entry) => {
    const scheduleLabel = formatMovementDate(entry.movementIso);
    const statusLabel = toTitleLabel(entry.status);
    const durationLabel = formatDuration(entry.durationMinutes);
    const metaLabel = durationLabel
      ? `${statusLabel} · ${durationLabel}`
      : statusLabel;
    const endpointLabel = `${entry.origin} → ${entry.destination}`;
    const manifestLabel = "Manifest not stored offline";
    return {
      accessibilityLabel:
        `${entry.title}. ${scheduleLabel}. ${endpointLabel}. ${metaLabel}. ${manifestLabel}. Saved calendar, review only.`,
      badgeLabel: scheduleLabel,
      endpointLabel,
      id: entry.id,
      manifestLabel,
      metaLabel,
      routeId: null,
      scheduleLabel,
      statusLabel,
      title: entry.title,
      tripId: null,
    };
  });
}

export function createOperationsSyncWarningState(error: unknown): OperationsSyncWarningState {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "Trip and convoy manifests could not sync.";

  const sentence = message.endsWith(".") ? message : `${message}.`;

  return {
    message: `${sentence} Showing saved routes only.`,
    accessibilityLabel: `${sentence} Showing saved routes only.`
  };
}

export function createOperationsSummaryState(
  routes: SavedSafeRoutePlan[],
  operationsState: SafeRouteOperationsState | null
): OperationsSummaryState {
  const plannedRows = createPlannedRouteRows(routes, operationsState);
  const calendarRows = createCalendarRows(routes, operationsState);
  const convoyRows = createConvoyRows(routes, operationsState);
  const activeTripCount = getActiveTrips(operationsState).length;

  const metrics = [
    { label: "Trips", value: String(activeTripCount || plannedRows.length) },
    { label: "Scheduled", value: String(calendarRows.length) },
    { label: "Convoys", value: String(convoyRows.length) }
  ];

  return {
    metrics,
    accessibilityLabel: metrics.map((metric) => `${metric.value} ${metric.label.toLowerCase()}`).join(", ")
  };
}

export function createPlannedRouteRows(
  routes: SavedSafeRoutePlan[],
  operationsState: SafeRouteOperationsState | null = null
): OperationsRouteRow[] {
  const assignmentViews = createAssignmentViews(routes, operationsState);

  if (operationsState) {
    return assignmentViews
      .sort(compareAssignmentViews)
      .map((view) => createRouteRowFromAssignment(view, operationsState));
  }

  return routes
    .filter((route) => route.status !== "in-progress")
    .map((route) => createRouteRowFromSavedRoute(route, route.status === "planned" ? "Planned" : "Ready"));
}

export function createCalendarRows(
  routes: SavedSafeRoutePlan[],
  operationsState: SafeRouteOperationsState | null = null
): OperationsRouteRow[] {
  if (!operationsState) {
    return routes
      .filter((route) => route.status !== "in-progress")
      .map((route) => createRouteRowFromSavedRoute(route, "Schedule pending", "Schedule pending"));
  }

  return createAssignmentViews(routes, operationsState)
    .filter((view) => Boolean(resolveMovementDate(view.trip, view.assignment)))
    .sort(compareAssignmentViews)
    .map((view) => createRouteRowFromAssignment(view, operationsState, { calendar: true }));
}

export function createConvoyRows(
  routes: SavedSafeRoutePlan[],
  operationsState: SafeRouteOperationsState | null = null
): OperationsConvoyRow[] {
  const trips = getActiveTrips(operationsState);
  const routeLookup = createRouteLookup(routes);

  if (trips.length > 0) {
    const vehiclesById = createEntityLookup(operationsState?.vehicles || []);
    const peopleById = createEntityLookup(operationsState?.people || []);

    return trips.map((trip, index) => {
      const assignments = ensureTripAssignments(trip);
      const optionAssignments = [...assignments];
      const optionKeys = new Set(
        assignments.map((assignment) => {
          const route = routeLookup.get(
            normalizeRouteReference(assignment.route_id),
          );
          return route?.id || `reference:${normalizeRouteReference(assignment.route_id)}`;
        }),
      );
      trip.route_ids.forEach((routeReference) => {
        const route = routeLookup.get(normalizeRouteReference(routeReference));
        const optionKey =
          route?.id || `reference:${normalizeRouteReference(routeReference)}`;
        if (optionKeys.has(optionKey)) {
          return;
        }
        optionKeys.add(optionKey);
        optionAssignments.push({
          route_id: routeReference,
          vehicle_ids: trip.vehicle_ids,
          person_ids: trip.person_ids,
          movement_date: trip.movement_date,
          duration_minutes: trip.duration_minutes,
          status: trip.status,
          notes: null,
        });
      });
      const routeOptions = optionAssignments.map((assignment) => {
        const route = routeLookup.get(normalizeRouteReference(assignment.route_id)) || null;
        const vehicleIds = assignment.vehicle_ids.length
          ? assignment.vehicle_ids
          : trip.vehicle_ids;
        const personIds = assignment.person_ids.length
          ? assignment.person_ids
          : trip.person_ids;
        const vehicleLabels = unique(vehicleIds).map((vehicleId) => {
          const vehicle = vehiclesById.get(vehicleId);
          return vehicle
            ? `${vehicle.callsign} · ${formatVehicleDescription(vehicle)}`
            : "Assigned vehicle · details unavailable";
        });
        const peopleLabels = unique(personIds).map((personId) => {
          const person = peopleById.get(personId);
          return person
            ? `${person.callsign || person.name} · ${toTitleLabel(person.role)}`
            : "Assigned person · details unavailable";
        });
        return {
          durationLabel:
            formatDuration(assignment.duration_minutes ?? trip.duration_minutes) ||
            "Duration pending",
          manifestLabel: createManifestLabel({
            personIds: unique(personIds),
            vehicleIds: unique(vehicleIds),
          }),
          peopleLabels,
          routeId: route?.id || null,
          scheduleLabel: formatMovementDate(
            resolveMovementDate(trip, assignment),
          ),
          statusLabel: toTitleLabel(assignment.status || trip.status),
          title: normalizeLabel(route?.name || assignment.route_id, "SafeRoute route"),
          vehicleLabels,
        };
      });
      const routeLabels = routeOptions
        .slice(0, 4)
        .map((option) => option.title);
      const uniqueVehicleIds = unique([
        ...trip.vehicle_ids,
        ...assignments.flatMap((assignment) => assignment.vehicle_ids)
      ]);
      const uniquePersonIds = unique([
        ...trip.person_ids,
        ...assignments.flatMap((assignment) => assignment.person_ids)
      ]);
      const leadVehicle = trip.lead_vehicle_id ? vehiclesById.get(trip.lead_vehicle_id) : null;
      const vehicles = uniqueVehicleIds
        .map((vehicleId) => vehiclesById.get(vehicleId))
        .filter(Boolean) as SafeRouteVehicleInventoryItem[];
      const people = uniquePersonIds
        .map((personId) => peopleById.get(personId))
        .filter(Boolean) as SafeRoutePerson[];
      const statusLabel = toTitleLabel(trip.status);
      const metaLabel = `${routeOptions.length} ${pluralize("route", routeOptions.length)} · ${uniqueVehicleIds.length} ${pluralize("vehicle", uniqueVehicleIds.length)} · ${uniquePersonIds.length} ${uniquePersonIds.length === 1 ? "person" : "people"}`;
      const manifestLabel = createConvoyManifestLabel({
        leadVehicle,
        people,
        vehicles,
      });
      const assignmentScheduleLabels = unique(
        optionAssignments
          .map((assignment) => formatMovementDate(assignment.movement_date || null)),
      );
      const assignmentDurationLabels = unique(
        optionAssignments
          .map((assignment) =>
            formatDuration(assignment.duration_minutes) || "Duration pending"
          ),
      );
      const scheduleLabel = trip.movement_date
        ? formatMovementDate(trip.movement_date)
        : assignmentScheduleLabels.length > 1
          ? "Schedules vary by route"
          : assignmentScheduleLabels[0] || "Unscheduled";
      const tripDurationLabel = formatDuration(trip.duration_minutes);
      const durationLabel = tripDurationLabel || (
        assignmentDurationLabels.length > 1
          ? "Durations vary by route"
          : assignmentDurationLabels[0] || "Duration pending"
      );
      const endpointLabel = `${normalizeLabel(trip.origin, "Origin pending")} → ${normalizeLabel(trip.destination, "Destination pending")}`;
      const leadVehicleLabel = leadVehicle
        ? `${leadVehicle.callsign} · ${formatVehicleDescription(leadVehicle)}`
        : "No lead vehicle assigned";
      const vehicleLabels = vehicles.map(
        (vehicle) => `${vehicle.callsign} · ${formatVehicleDescription(vehicle)}`,
      );
      const peopleLabels = people.map(
        (person) => `${person.callsign || person.name} · ${toTitleLabel(person.role)}`,
      );
      const convoyVehicles = vehicles
        .map((vehicle) => {
          const detailLabel = [
            vehicle.year ? String(vehicle.year) : null,
            vehicle.color,
            vehicle.trim,
          ].filter(Boolean).join(" · ") || "Vehicle details pending";
          const modelLabel = [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
            "Assigned vehicle";
          const registrationLabel = vehicle.registration || "Registration pending";
          const roleLabel = toTitleLabel(vehicle.vehicle_type);
          const protectionLabel = toTitleLabel(vehicle.protection_profile);
          const seatLabel = `${vehicle.seat_count} ${pluralize("seat", vehicle.seat_count)}`;
          const vehicleStatusLabel = vehicle.is_active ? "Ready" : "Standby";
          const lead = vehicle.id === trip.lead_vehicle_id;
          const nextEventLabel = `${scheduleLabel} · ${normalizeLabel(trip.name, "SafeRoute trip")}`;

          return {
            accessibilityLabel: `${vehicle.callsign}. ${modelLabel}. ${detailLabel}. ${roleLabel}. ${protectionLabel}. ${seatLabel}. ${registrationLabel}. ${vehicleStatusLabel}. Opens vehicle details.`,
            callsign: vehicle.callsign,
            detailLabel,
            id: vehicle.id,
            lead,
            modelLabel,
            nextEventLabel,
            protectionLabel,
            registrationLabel,
            roleLabel,
            seatLabel,
            statusLabel: vehicleStatusLabel,
          };
        })
        .sort((left, right) => Number(right.lead) - Number(left.lead));

      return {
        id: trip.id || `trip-${index + 1}`,
        durationLabel,
        endpointLabel,
        title: normalizeLabel(trip.name, "SafeRoute convoy"),
        statusLabel,
        metaLabel,
        manifestLabel,
        leadVehicleLabel,
        manifestAvailable: true,
        peopleLabels,
        routeLabels,
        routeOptions,
        scheduleLabel,
        tripId: trip.id || null,
        vehicleLabels,
        vehicles: convoyVehicles,
        accessibilityLabel: `${normalizeLabel(trip.name, "SafeRoute convoy")}. ${statusLabel}. ${scheduleLabel}. ${endpointLabel}. ${durationLabel}. ${metaLabel}. ${manifestLabel}. ${routeLabels.join(", ")}. Opens convoy details.`
      };
    });
  }

  return operationsState ? [] : createFallbackConvoyRows(routes);
}

function createRouteRowFromAssignment(
  { assignment, index, route, trip }: RouteAssignmentView,
  operationsState: SafeRouteOperationsState | null,
  options: { calendar?: boolean } = {}
): OperationsRouteRow {
  const vehiclesById = createEntityLookup(operationsState?.vehicles || []);
  const peopleById = createEntityLookup(operationsState?.people || []);
  const routeName = normalizeLabel(route?.name, normalizeLabel(trip.name, "SafeRoute plan"));
  const title = options.calendar ? routeName : normalizeLabel(trip.name, routeName);
  const statusLabel = toTitleLabel(assignment.status || trip.status);
  const scheduleLabel = formatMovementDate(resolveMovementDate(trip, assignment));
  const endpointLabel = createEndpointLabel({ route, trip });
  const manifest = createManifestCounts({
    personIds: assignment.person_ids.length ? assignment.person_ids : trip.person_ids,
    vehicleIds: assignment.vehicle_ids.length ? assignment.vehicle_ids : trip.vehicle_ids
  });
  const manifestLabel = createManifestLabel(manifest);
  const routeMetrics = route ? `${route.route.eta} · ${route.route.distance} · ${route.route.riskLabel} risk` : "Route details pending";
  const durationLabel = formatDuration(assignment.duration_minutes ?? trip.duration_minutes);
  const metaLabel = durationLabel ? `${routeMetrics} · ${durationLabel}` : routeMetrics;
  const knownVehicleNames = manifest.vehicleIds
    .map((vehicleId) => vehiclesById.get(vehicleId)?.callsign)
    .filter((label): label is string => Boolean(label));
  const knownPeopleNames = manifest.personIds
    .map((personId) => peopleById.get(personId)?.name)
    .filter((label): label is string => Boolean(label));
  const knownManifestNames = [...knownVehicleNames.slice(0, 2), ...knownPeopleNames.slice(0, 2)].join(", ");

  return {
    id: `${trip.id || "trip"}-${assignment.route_id || index}-${index}`,
    title,
    badgeLabel: options.calendar ? scheduleLabel : statusLabel,
    endpointLabel,
    metaLabel,
    manifestLabel: knownManifestNames ? `${manifestLabel} · ${knownManifestNames}` : manifestLabel,
    routeId: route?.id || null,
    scheduleLabel,
    statusLabel,
    tripId: trip.id || null,
    accessibilityLabel: `${title}. ${statusLabel}. ${endpointLabel}. ${scheduleLabel}. ${metaLabel}. ${manifestLabel}. ${route ? "Opens route map and details." : "Route map unavailable until this route reference is resolved."}`
  };
}

function createRouteRowFromSavedRoute(
  route: SavedSafeRoutePlan,
  badgeLabel: string,
  fallbackScheduleLabel?: string
): OperationsRouteRow {
  const title = normalizeLabel(route.name, "SafeRoute plan");
  const operation = normalizeLabel(route.operation, "Operation");
  const convoy = normalizeLabel(route.convoyCallsign, "Convoy");
  const endpointLabel = `${normalizeLabel(route.origin, "Origin")} → ${normalizeLabel(route.destination, "Destination")}`;
  const metaLabel = `${operation} · ${convoy} · ${route.route.eta} · ${route.route.distance}`;
  const scheduleLabel = fallbackScheduleLabel || (route.status === "planned" ? "Schedule pending" : route.updatedAtLabel);
  const manifestLabel = "Manifest pending";
  const statusLabel = toTitleLabel(route.status);

  return {
    id: route.id,
    title,
    badgeLabel,
    endpointLabel,
    metaLabel,
    manifestLabel,
    routeId: route.id,
    scheduleLabel,
    statusLabel,
    tripId: null,
    accessibilityLabel: `${title}. ${badgeLabel}. ${endpointLabel}. ${metaLabel}. ${scheduleLabel}. ${manifestLabel}. Opens route map and details.`
  };
}

function createFallbackConvoyRows(routes: SavedSafeRoutePlan[]): OperationsConvoyRow[] {
  const convoyMap = new Map<string, SavedSafeRoutePlan[]>();

  routes.forEach((route) => {
    const convoy = normalizeLabel(route.convoyCallsign, "Unassigned convoy");
    convoyMap.set(convoy, [...(convoyMap.get(convoy) || []), route]);
  });

  return Array.from(convoyMap.entries()).map(([convoy, convoyRoutes]) => {
    const routeCount = convoyRoutes.length;
    const liveCount = convoyRoutes.filter((route) => route.status === "in-progress").length;
    const plannedCount = convoyRoutes.filter((route) => route.status === "planned").length;
    const statusLabel = liveCount > 0
      ? `${liveCount} live`
      : plannedCount > 0
        ? `${plannedCount} planned`
        : "Ready";
    const routeLabels = convoyRoutes
      .slice(0, 4)
      .map((route) => normalizeLabel(route.name, "SafeRoute plan"));
    const routeOptions = convoyRoutes.map((route) => ({
      durationLabel: route.route.eta,
      manifestLabel: "Manifest unavailable until Operations syncs",
      peopleLabels: [],
      routeId: route.id,
      scheduleLabel: route.updatedAtLabel,
      statusLabel: toTitleLabel(route.status),
      title: normalizeLabel(route.name, "SafeRoute plan"),
      vehicleLabels: [],
    }));
    const metaLabel = `${routeCount} ${pluralize("route", routeCount)} · ${statusLabel}`;
    const manifestLabel = "Manifest pending";

    return {
      id: createConvoyRowId(convoy, convoyRoutes[0]?.id || "route"),
      durationLabel: "Duration varies by route",
      endpointLabel: "See assigned routes for endpoints",
      title: convoy,
      statusLabel,
      metaLabel,
      manifestLabel,
      leadVehicleLabel: "Lead vehicle details pending",
      manifestAvailable: false,
      peopleLabels: [],
      routeLabels,
      routeOptions,
      scheduleLabel: "Schedule pending",
      tripId: null,
      vehicleLabels: [],
      vehicles: [],
      accessibilityLabel: `${convoy}. ${metaLabel}. ${manifestLabel}. ${routeLabels.join(", ")}. Opens convoy details.`
    };
  });
}

function createAssignmentViews(
  routes: SavedSafeRoutePlan[],
  operationsState: SafeRouteOperationsState | null
): RouteAssignmentView[] {
  const routeLookup = createRouteLookup(routes);

  return getActiveTrips(operationsState).flatMap((trip) =>
    ensureTripAssignments(trip).map((assignment, index) => ({
      assignment,
      index,
      route:
        routeLookup.get(normalizeRouteReference(assignment.route_id)) || null,
      trip
    }))
  );
}

function ensureTripAssignments(trip: SafeRouteTripPlan): SafeRouteTripRouteAssignment[] {
  if (trip.route_assignments.length > 0) {
    return trip.route_assignments;
  }

  return trip.route_ids.map((routeId) => ({
    route_id: routeId,
    vehicle_ids: trip.vehicle_ids,
    person_ids: trip.person_ids,
    movement_date: trip.movement_date,
    duration_minutes: trip.duration_minutes,
    status: trip.status,
    notes: null
  }));
}

function getActiveTrips(operationsState: SafeRouteOperationsState | null): SafeRouteTripPlan[] {
  return (operationsState?.trips || []).filter((trip) => trip.is_active !== false && trip.status !== "archived");
}

function compareAssignmentViews(left: RouteAssignmentView, right: RouteAssignmentView): number {
  const leftTime = movementDateTime(resolveMovementDate(left.trip, left.assignment));
  const rightTime = movementDateTime(resolveMovementDate(right.trip, right.assignment));

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return normalizeLabel(left.trip.name, "").localeCompare(normalizeLabel(right.trip.name, ""));
}

function resolveMovementDate(
  trip: SafeRouteTripPlan,
  assignment: SafeRouteTripRouteAssignment
): string | null {
  return normalizeLabel(assignment.movement_date || trip.movement_date || "", "") || null;
}

function movementDateTime(value: string | null): number {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function createEndpointLabel({
  route,
  trip
}: {
  route: SavedSafeRoutePlan | null;
  trip: SafeRouteTripPlan;
}): string {
  const origin = normalizeLabel(route?.origin || trip.origin, "Origin pending");
  const destination = normalizeLabel(route?.destination || trip.destination, "Destination pending");

  return `${origin} → ${destination}`;
}

function createManifestCounts({
  personIds,
  vehicleIds
}: {
  personIds: string[];
  vehicleIds: string[];
}): { personIds: string[]; vehicleIds: string[] } {
  return {
    personIds: unique(personIds),
    vehicleIds: unique(vehicleIds)
  };
}

function createManifestLabel({ personIds, vehicleIds }: { personIds: string[]; vehicleIds: string[] }): string {
  return `${vehicleIds.length} ${pluralize("vehicle", vehicleIds.length)} · ${personIds.length} ${personIds.length === 1 ? "person" : "people"}`;
}

function createConvoyManifestLabel({
  leadVehicle,
  people,
  vehicles
}: {
  leadVehicle: SafeRouteVehicleInventoryItem | null | undefined;
  people: SafeRoutePerson[];
  vehicles: SafeRouteVehicleInventoryItem[];
}): string {
  const leadLabel = leadVehicle?.callsign ? `Lead ${leadVehicle.callsign}` : "No lead vehicle";
  const vehicleLabel = vehicles.length > 0
    ? vehicles.slice(0, 2).map((vehicle) => vehicle.callsign).join(", ")
    : "No vehicles assigned";
  const peopleLabel = people.length > 0
    ? people.slice(0, 2).map((person) => person.callsign || person.name).join(", ")
    : "No people assigned";

  return `${leadLabel} · ${vehicleLabel} · ${peopleLabel}`;
}

function createRouteLookup(routes: SavedSafeRoutePlan[]): Map<string, SavedSafeRoutePlan> {
  const lookup = new Map<string, SavedSafeRoutePlan>();
  routes.forEach((route) => {
    const idKey = normalizeRouteReference(route.id);
    const nameKey = normalizeRouteReference(route.name);
    if (idKey) {
      lookup.set(idKey, route);
    }
    if (nameKey && !lookup.has(nameKey)) {
      lookup.set(nameKey, route);
    }
  });
  return lookup;
}

function normalizeRouteReference(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatVehicleDescription(vehicle: SafeRouteVehicleInventoryItem): string {
  const vehicleName = [vehicle.make, vehicle.model]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return `${vehicleName || toTitleLabel(vehicle.vehicle_type)} · ${toTitleLabel(vehicle.protection_profile)}`;
}

function createEntityLookup<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.filter((item) => item.id).map((item) => [item.id, item]));
}

function createConvoyRowId(convoy: string, discriminator: string): string {
  const convoySlug = convoy
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
  const discriminatorSlug = discriminator
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "route";
  return `convoy-${convoySlug}-${discriminatorSlug}`;
}

function formatMovementDate(value: string | null): string {
  if (!value) {
    return "Unscheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Schedule pending";
  }

  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return `${weekday}, ${day} · ${time}`;
}

function formatDuration(minutes: number | null | undefined): string | null {
  const parsed = Number(minutes);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const rounded = Math.max(1, Math.round(parsed));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;

  if (!hours) {
    return `${remainder} min window`;
  }

  if (!remainder) {
    return `${hours} hr window`;
  }

  return `${hours} hr ${remainder} min window`;
}

function toTitleLabel(value: string | null | undefined): string {
  return normalizeLabel(value || "", "Ready")
    .split("-")
    .join(" ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function normalizeLabel(value: unknown, fallback: string): string {
  return String(value || "").trim().replace(/\s+/g, " ") || fallback;
}

function createCompactLabel(value: string, maxLength: number, fallback: string): string {
  const label = normalizeLabel(value, fallback);

  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
