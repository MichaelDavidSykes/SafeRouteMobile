import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { MobileSafeRouteClient } from "./routeMapper";

export type RouteListEmptyState = {
  accessibilityLabel: string;
  title: string;
  copy: string;
};

export type RouteListLoadingState = {
  accessibilityLabel: string;
  title: string;
};

export type RouteListSummaryState = {
  accessibilityLabel: string;
  clearSearchAccessibilityLabel: string | null;
  clearSearchLabel: string | null;
  text: string;
};

export type RouteListClientFilterOption = {
  accessibilityHint: string;
  accessibilityLabel: string;
  id: string | null;
  label: string;
  selected: boolean;
};

export type RouteListHeaderCopy = {
  title: string;
};

export type RouteListMapReturnState = {
  accessibilityHint: string;
  accessibilityLabel: string;
  label: string;
};

export type RouteListSignOutState = {
  label: string;
  signOutAccessibilityHint: string;
  signOutAccessibilityLabel: string;
};

export type RouteListSearchVisibilityInput = {
  query: string;
  selectedClientName?: string | null;
  totalRouteCount: number;
};

export type RouteListEmptyVisibilityInput = {
  errorAction?: "sync" | "detail" | null;
  filteredRouteCount: number;
  totalRouteCount: number;
};

// Keep the saved-route picker lightweight for tiny route sets; the cards are
// quicker to scan than an always-visible search field.
const ROUTE_SEARCH_MINIMUM_COUNT = 4;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function createRouteListHeaderCopy(): RouteListHeaderCopy {
  return {
    title: "Choose route",
  };
}

export function createRouteListMapReturnState(): RouteListMapReturnState {
  return {
    accessibilityHint: "Returns to the map-first SafeRoute home.",
    accessibilityLabel: "Return to SafeRoute map",
    label: "Map",
  };
}

export function createRouteListLoadingState(): RouteListLoadingState {
  return {
    accessibilityLabel:
      "Syncing saved SafeRoute plans. The map remains available.",
    title: "Syncing routes",
  };
}

export function createRouteListSignOutState(
  userEmail: string,
): RouteListSignOutState {
  const trimmedEmail = userEmail.trim();

  return {
    label: "Sign out",
    signOutAccessibilityHint:
      "Ends this LunarChain session and returns to the sign-in screen.",
    signOutAccessibilityLabel: trimmedEmail
      ? `Sign out of LunarChain account ${trimmedEmail}`
      : "Sign out of LunarChain",
  };
}

export function shouldShowRouteSearch({
  query,
  totalRouteCount,
}: RouteListSearchVisibilityInput): boolean {
  return (
    normalizeQuery(query).length > 0 ||
    totalRouteCount >= ROUTE_SEARCH_MINIMUM_COUNT
  );
}

export function shouldShowRouteSummary({
  query,
  selectedClientName,
}: RouteListSearchVisibilityInput): boolean {
  return normalizeQuery(query).length > 0 || Boolean(selectedClientName);
}

export function shouldShowRouteEmptyState({
  errorAction,
  filteredRouteCount,
  totalRouteCount,
}: RouteListEmptyVisibilityInput): boolean {
  if (filteredRouteCount > 0) {
    return false;
  }

  if (errorAction === "sync" && totalRouteCount === 0) {
    return false;
  }

  return true;
}

export function findSelectedClient(
  clients: MobileSafeRouteClient[],
  selectedClientId: string | null,
): MobileSafeRouteClient | null {
  if (!selectedClientId) {
    return null;
  }

  return clients.find((client) => client.id === selectedClientId) || null;
}

export function reconcileSelectedClientId(
  clients: MobileSafeRouteClient[],
  selectedClientId: string | null,
): string | null {
  if (!selectedClientId) {
    return null;
  }

  return clients.some((client) => client.id === selectedClientId)
    ? selectedClientId
    : null;
}

export function createRouteListClientFilterOptions(
  clients: MobileSafeRouteClient[],
  selectedClientId: string | null,
): RouteListClientFilterOption[] {
  const activeClientId = reconcileSelectedClientId(clients, selectedClientId);

  return [
    {
      accessibilityHint: "Shows saved routes for every client.",
      accessibilityLabel: `Show routes for all clients${
        activeClientId ? "" : ", selected"
      }`,
      id: null,
      label: "All",
      selected: !activeClientId,
    },
    ...clients.map((client) => {
      const selected = activeClientId === client.id;

      return {
        accessibilityHint: `Shows saved routes for ${client.name}.`,
        accessibilityLabel: `Show routes for ${client.name}${
          selected ? ", selected" : ""
        }`,
        id: client.id,
        label: client.name,
        selected,
      };
    }),
  ];
}

export function shouldShowClientFilters(
  clientFilterOptions: RouteListClientFilterOption[],
): boolean {
  const clientOptions = clientFilterOptions.filter((option) => option.id);

  return (
    clientOptions.length > 1 ||
    clientOptions.some((option) => option.selected)
  );
}

export function filterSavedRoutes(
  routes: SavedSafeRoutePlan[],
  query: string,
): SavedSafeRoutePlan[] {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return routes;
  }

  return routes.filter((route) => {
    const haystack = [
      route.name,
      route.operation,
      route.convoyCallsign,
      route.origin,
      route.destination,
      route.route.label,
      route.route.riskLabel,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function createRouteListEmptyState({
  query,
  routeCount,
  selectedClientName,
}: {
  query: string;
  routeCount: number;
  selectedClientName?: string | null;
}): RouteListEmptyState {
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    const accessibilityLabel = selectedClientName
      ? `No saved routes match ${trimmedQuery} for ${selectedClientName}. Try another search or client.`
      : `No saved routes match ${trimmedQuery}. Try another route, destination, or convoy.`;

    return {
      accessibilityLabel,
      title: "No matches",
      copy: selectedClientName
        ? `No ${trimmedQuery} routes for ${selectedClientName}. Try another search or client.`
        : `No ${trimmedQuery} routes. Try another route or destination.`,
    };
  }

  if (selectedClientName) {
    return {
      accessibilityLabel: `No saved routes are available for ${selectedClientName}. Switch clients or refresh after saving a plan.`,
      title: `No routes for ${selectedClientName}`,
      copy: "Switch clients or refresh after saving a plan.",
    };
  }

  if (routeCount > 0) {
    return {
      accessibilityLabel:
        "No saved routes match the current filters. Try another route, destination, or convoy.",
      title: "No matches",
      copy: "Try another filter.",
    };
  }

  return {
    accessibilityLabel:
      "No saved routes are available. Save a SafeRoute plan in LunarChain to open it on the map.",
    title: "No saved routes",
    copy: "Save a plan, then open it here.",
  };
}

export function createRouteListSummaryState({
  filteredRouteCount,
  query,
  selectedClientName,
  totalRouteCount,
}: {
  filteredRouteCount: number;
  query: string;
  selectedClientName?: string | null;
  totalRouteCount: number;
}): RouteListSummaryState {
  const trimmedQuery = query.trim();
  const routeLabel = pluralizeRoute(filteredRouteCount);
  const clientSuffix = selectedClientName ? ` for ${selectedClientName}` : "";

  if (trimmedQuery) {
    const totalRouteLabel = pluralizeRoute(totalRouteCount);
    return {
      accessibilityLabel: `Showing ${filteredRouteCount} of ${totalRouteCount} saved ${totalRouteLabel}${clientSuffix} matching ${trimmedQuery}.`,
      clearSearchAccessibilityLabel: `Clear saved route search for ${trimmedQuery}`,
      clearSearchLabel: "Clear",
      text: `${filteredRouteCount} of ${totalRouteCount} ${totalRouteLabel}`,
    };
  }

  return {
    accessibilityLabel: `${filteredRouteCount} map-ready saved ${routeLabel}${clientSuffix}.`,
    clearSearchAccessibilityLabel: null,
    clearSearchLabel: null,
    text: `${filteredRouteCount} ${routeLabel}`,
  };
}

function pluralizeRoute(count: number): string {
  return count === 1 ? "route" : "routes";
}
