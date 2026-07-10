import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { MobileSafeRouteClient } from "../routes/routeMapper";
import type {
  SafeRouteOperationsState,
  SafeRoutePerson,
  SafeRouteTripPlan,
  SafeRouteTripRouteAssignment,
  SafeRouteVehicleInventoryItem
} from "./operationsTypes";

export type OperationsTab = "planned-routes" | "calendar" | "convoy-management";

export type OperationsTabOption = {
  accessibilityLabel: string;
  id: OperationsTab;
  label: string;
  selected: boolean;
};

export type OperationsClientFilterOption = {
  accessibilityHint: string;
  accessibilityLabel: string;
  id: string;
  label: string;
  selected: boolean;
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

const OPERATIONS_CLIENT_DISPLAY_MAX_LENGTH = 28;

export function createOperationsTabOptions(activeTab: OperationsTab): OperationsTabOption[] {
  return (Object.keys(TAB_COPY) as OperationsTab[]).map((id) => ({
    id,
    label: TAB_COPY[id].label,
    accessibilityLabel: `${TAB_COPY[id].accessibilityLabel}${id === activeTab ? ", selected" : ""}`,
    selected: id === activeTab
  }));
}

export function createOperationsClientFilterOptions(
  clients: MobileSafeRouteClient[],
  selectedClientId: string | null
): OperationsClientFilterOption[] {
  return clients.map((client) => {
    const selected = client.id === selectedClientId;
    const clientName = normalizeLabel(client.name, "Workspace");
    const label = createCompactLabel(clientName, OPERATIONS_CLIENT_DISPLAY_MAX_LENGTH, "Workspace");

    return {
      id: client.id,
      label,
      selected,
      accessibilityHint: `Shows view-only SafeRoute operations for ${clientName}.`,
      accessibilityLabel: `Show SafeRoute operations for ${clientName}${selected ? ", selected" : ""}`
    };
  });
}

export function resolveOperationsClientId(
  clients: MobileSafeRouteClient[],
  selectedClientId: string | null,
  preferredClientId?: string | null
): string | null {
  const selected = normalizeLabel(selectedClientId || "", "");
  const preferred = normalizeLabel(preferredClientId || "", "");

  if (selected && clients.some((client) => client.id === selected)) {
    return selected;
  }

  if (preferred && clients.some((client) => client.id === preferred)) {
    return preferred;
  }

  return clients[0]?.id || null;
}

export function shouldShowOperationsClientFilters(options: OperationsClientFilterOption[]): boolean {
  return options.length > 1;
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
    return "Vehicles, people, and route manifests. View only.";
  }

  return "Upcoming SafeRoute plans. Editing stays on web for now.";
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

function createRouteRowFromSavedRoute(route: SavedSafeRoutePlan, badgeLabel: string): OperationsRouteRow {
  const title = normalizeLabel(route.name, "SafeRoute plan");
  const operation = normalizeLabel(route.operation, "Operation");
  const convoy = normalizeLabel(route.convoyCallsign, "Convoy");
  const endpointLabel = `${normalizeLabel(route.origin, "Origin")} → ${normalizeLabel(route.destination, "Destination")}`;
  const metaLabel = `${operation} · ${convoy} · ${route.route.eta} · ${route.route.distance}`;
  const scheduleLabel = route.status === "planned" ? "Schedule pending" : route.updatedAtLabel;
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
