import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";

export type OperationsTab = "planned-routes" | "calendar" | "convoy-management";

export type OperationsTabOption = {
  accessibilityLabel: string;
  id: OperationsTab;
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
  metaLabel: string;
  scheduleLabel: string;
  title: string;
};

export type OperationsConvoyRow = {
  accessibilityLabel: string;
  id: string;
  metaLabel: string;
  routeLabels: string[];
  statusLabel: string;
  title: string;
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

const SCHEDULE_SLOTS = [
  "Today · 09:30",
  "Today · 14:10",
  "Tomorrow · 08:45",
  "Tomorrow · 16:20",
  "This week · 11:15"
];

export function createOperationsTabOptions(activeTab: OperationsTab): OperationsTabOption[] {
  return (Object.keys(TAB_COPY) as OperationsTab[]).map((id) => ({
    id,
    label: TAB_COPY[id].label,
    accessibilityLabel: TAB_COPY[id].accessibilityLabel,
    selected: id === activeTab
  }));
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
    return "View-only upcoming route windows.";
  }

  if (tab === "convoy-management") {
    return "View-only convoy assignments.";
  }

  return "Upcoming SafeRoute plans. Editing stays on web for now.";
}

export function createOperationsLoadingLabel(tab: OperationsTab): string {
  return `Loading ${TAB_COPY[tab].label.toLowerCase()}`;
}

export function createOperationsEmptyState(tab: OperationsTab): OperationsEmptyState {
  if (tab === "calendar") {
    return {
      title: "No calendar items",
      copy: "Synced route windows will appear here.",
      accessibilityLabel: "No calendar items. Synced route windows will appear here."
    };
  }

  if (tab === "convoy-management") {
    return {
      title: "No convoys",
      copy: "Convoy assignments will appear here once synced.",
      accessibilityLabel: "No convoys. Convoy assignments will appear here once synced."
    };
  }

  return {
    title: "No planned routes",
    copy: "Upcoming SafeRoute plans will appear here.",
    accessibilityLabel: "No planned routes. Upcoming SafeRoute plans will appear here."
  };
}

export function createPlannedRouteRows(routes: SavedSafeRoutePlan[]): OperationsRouteRow[] {
  return routes
    .filter((route) => route.status !== "in-progress")
    .map((route, index) => createRouteRow(route, index, route.status === "planned" ? "Planned" : "Ready"));
}

export function createCalendarRows(routes: SavedSafeRoutePlan[]): OperationsRouteRow[] {
  return routes.map((route, index) => createRouteRow(route, index, SCHEDULE_SLOTS[index % SCHEDULE_SLOTS.length]));
}

export function createConvoyRows(routes: SavedSafeRoutePlan[]): OperationsConvoyRow[] {
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
      .slice(0, 3)
      .map((route) => normalizeLabel(route.name, "SafeRoute plan"));
    const metaLabel = `${routeCount} ${routeCount === 1 ? "route" : "routes"} · ${statusLabel}`;

    return {
      id: createConvoyRowId(convoy),
      title: convoy,
      statusLabel,
      metaLabel,
      routeLabels,
      accessibilityLabel: `${convoy}. ${metaLabel}. ${routeLabels.join(", ")}. View only.`
    };
  });
}

function createRouteRow(
  route: SavedSafeRoutePlan,
  index: number,
  badgeLabel: string
): OperationsRouteRow {
  const title = normalizeLabel(route.name, "SafeRoute plan");
  const operation = normalizeLabel(route.operation, "Operation");
  const convoy = normalizeLabel(route.convoyCallsign, "Convoy");
  const endpointLabel = `${normalizeLabel(route.origin, "Origin")} → ${normalizeLabel(route.destination, "Destination")}`;
  const metaLabel = `${operation} · ${convoy} · ${route.route.eta} · ${route.route.distance}`;
  const scheduleLabel = SCHEDULE_SLOTS[index % SCHEDULE_SLOTS.length];

  return {
    id: route.id,
    title,
    badgeLabel,
    endpointLabel,
    metaLabel,
    scheduleLabel,
    accessibilityLabel: `${title}. ${badgeLabel}. ${endpointLabel}. ${metaLabel}. ${scheduleLabel}. View only.`
  };
}

function createConvoyRowId(convoy: string): string {
  return `convoy-${convoy.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"}`;
}

function normalizeLabel(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, " ") || fallback;
}
