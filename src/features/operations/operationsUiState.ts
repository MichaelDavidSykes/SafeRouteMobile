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
  scheduleLabel: string;
  title: string;
};

export type OperationsConvoyRow = {
  accessibilityLabel: string;
  id: string;
  manifestLabel: string;
  metaLabel: string;
  routeLabels: string[];
  statusLabel: string;
  title: string;
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
    return "Scheduled movements synced from SafeRoute.";
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
      scheduleLabel,
      title: entry.title,
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
      const routeLabels = assignments
        .slice(0, 4)
        .map((assignment) => routeLookup.get(assignment.route_id)?.name || assignment.route_id)
        .map((routeName) => normalizeLabel(routeName, "SafeRoute route"));
      const uniqueVehicleIds = unique([
        ...trip.vehicle_ids,
        ...assignments.flatMap((assignment) => assignment.vehicle_ids)
      ]);
      const uniquePersonIds = unique([
        ...trip.person_ids,
        ...assignments.flatMap((assignment) => assignment.person_ids)
      ]);
      const leadVehicle = trip.lead_vehicle_id ? vehiclesById.get(trip.lead_vehicle_id) : null;
      const statusLabel = toTitleLabel(trip.status);
      const metaLabel = `${assignments.length} ${pluralize("route", assignments.length)} · ${uniqueVehicleIds.length} ${pluralize("vehicle", uniqueVehicleIds.length)} · ${uniquePersonIds.length} ${uniquePersonIds.length === 1 ? "person" : "people"}`;
      const manifestLabel = createConvoyManifestLabel({
        leadVehicle,
        people: uniquePersonIds.map((personId) => peopleById.get(personId)).filter(Boolean) as SafeRoutePerson[],
        vehicles: uniqueVehicleIds.map((vehicleId) => vehiclesById.get(vehicleId)).filter(Boolean) as SafeRouteVehicleInventoryItem[]
      });

      return {
        id: trip.id || `trip-${index + 1}`,
        title: normalizeLabel(trip.name, "SafeRoute convoy"),
        statusLabel,
        metaLabel,
        manifestLabel,
        routeLabels,
        accessibilityLabel: `${normalizeLabel(trip.name, "SafeRoute convoy")}. ${statusLabel}. ${metaLabel}. ${manifestLabel}. ${routeLabels.join(", ")}. View only.`
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
    scheduleLabel,
    accessibilityLabel: `${title}. ${statusLabel}. ${endpointLabel}. ${scheduleLabel}. ${metaLabel}. ${manifestLabel}. View only.`
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

  return {
    id: route.id,
    title,
    badgeLabel,
    endpointLabel,
    metaLabel,
    manifestLabel,
    scheduleLabel,
    accessibilityLabel: `${title}. ${badgeLabel}. ${endpointLabel}. ${metaLabel}. ${scheduleLabel}. ${manifestLabel}. View only.`
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
    const metaLabel = `${routeCount} ${pluralize("route", routeCount)} · ${statusLabel}`;
    const manifestLabel = "Manifest pending";

    return {
      id: createConvoyRowId(convoy),
      title: convoy,
      statusLabel,
      metaLabel,
      manifestLabel,
      routeLabels,
      accessibilityLabel: `${convoy}. ${metaLabel}. ${manifestLabel}. ${routeLabels.join(", ")}. View only.`
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
      route: routeLookup.get(assignment.route_id) || null,
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
  return new Map(routes.map((route) => [route.id, route]));
}

function createEntityLookup<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.filter((item) => item.id).map((item) => [item.id, item]));
}

function createConvoyRowId(convoy: string): string {
  return `convoy-${convoy.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"}`;
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
