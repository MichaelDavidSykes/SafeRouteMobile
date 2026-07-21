import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import { OFFLINE_ROUTE_CACHE_MAX_AGE_MS } from "./offlineRouteCacheCore";
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

export type RouteListOfflineReviewPresentation = {
  accessibilityLabel: string;
  cardAccessibilityLabel: string;
  visibleLabel: string;
};

export type RouteListOfflineReviewStatus =
  | "checking-access"
  | "checking-connection"
  | "offline";

const ROUTE_LIST_CACHE_AGE_TIMER_MAX_DELAY_MS = 2_147_483_647;

// Keep the saved-route picker lightweight for tiny route sets; the cards are
// quicker to scan than an always-visible search field.
const ROUTE_SEARCH_MINIMUM_COUNT = 4;
export const ROUTE_LIST_QUERY_INPUT_MAX_LENGTH = 96;
export const ROUTE_LIST_QUERY_DISPLAY_MAX_LENGTH = 32;
export const ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH = 28;

function normalizeQuery(query: string): string {
  return normalizeRouteListLabel(query).toLowerCase();
}

function normalizeRouteListLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createCompactRouteListLabel(
  value: string,
  maxLength: number,
  fallback = "",
): string {
  const normalizedValue = normalizeRouteListLabel(value);
  const normalizedFallback = normalizeRouteListLabel(fallback);
  const label = normalizedValue || normalizedFallback;

  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function createRouteListSearchQueryValue(query: string): string {
  return query.slice(0, ROUTE_LIST_QUERY_INPUT_MAX_LENGTH);
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

export function createRouteListOfflineReviewPresentation({
  nowMs = Date.now(),
  status,
  storedAtMs,
}: {
  nowMs?: number;
  status: RouteListOfflineReviewStatus;
  storedAtMs: number;
}): RouteListOfflineReviewPresentation | null {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(storedAtMs) ||
    storedAtMs > nowMs ||
    nowMs - storedAtMs > OFFLINE_ROUTE_CACHE_MAX_AGE_MS
  ) {
    return null;
  }

  const age = createRouteListCacheAge(nowMs - storedAtMs);
  const safetySentence =
    status === "offline"
      ? "Reconnect and verify workspace access before starting guidance."
      : status === "checking-connection"
        ? "Wait for the connection check and workspace access verification before starting guidance."
        : "Wait for workspace access verification before starting guidance.";
  const accessibilityPrefix =
    status === "offline"
      ? "Offline saved routes."
      : status === "checking-connection"
        ? "Checking connection for saved routes."
        : "Checking workspace access for saved routes.";
  const visibleLabel =
    status === "offline"
      ? `Offline · ${age.visibleOld} · reconnect to start`
      : status === "checking-connection"
        ? `Checking connection · cached ${age.visibleAgo}`
        : `Checking access · cached ${age.visibleAgo}`;

  return {
    accessibilityLabel:
      `${accessibilityPrefix} This copy was cached ${age.spokenAgo} and is review only. ${safetySentence}`,
    cardAccessibilityLabel:
      `Saved copy is review only. ${safetySentence}`,
    visibleLabel,
  };
}

export function createRouteListExpiredCacheMessage(
  status: RouteListOfflineReviewStatus,
): string {
  if (status === "offline") {
    return "Saved route copy expired. Reconnect to refresh.";
  }
  if (status === "checking-connection") {
    return "Saved route copy expired. Wait for the connection check before refreshing.";
  }
  return "Saved route copy expired. Wait for workspace access verification before refreshing.";
}

export function getRouteListOfflineReviewRefreshDelayMs({
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
    nowMs - storedAtMs > OFFLINE_ROUTE_CACHE_MAX_AGE_MS
  ) {
    return null;
  }

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const ageMs = nowMs - storedAtMs;
  const bucketMs = ageMs < dayMs ? hourMs : dayMs;
  const nextAgeBoundaryMs =
    storedAtMs + (Math.floor(ageMs / bucketMs) + 1) * bucketMs;
  const expiryBoundaryMs =
    storedAtMs + OFFLINE_ROUTE_CACHE_MAX_AGE_MS + 1;

  return Math.max(
    1,
    Math.min(
      ROUTE_LIST_CACHE_AGE_TIMER_MAX_DELAY_MS,
      nextAgeBoundaryMs - nowMs,
      expiryBoundaryMs - nowMs,
    ),
  );
}

function createRouteListCacheAge(ageMs: number): {
  spokenAgo: string;
  visibleAgo: string;
  visibleOld: string;
} {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;

  if (ageMs < hourMs) {
    return {
      spokenAgo: "less than one hour ago",
      visibleAgo: "<1h ago",
      visibleOld: "<1h old",
    };
  }

  if (ageMs < dayMs) {
    const hours = Math.floor(ageMs / hourMs);
    return {
      spokenAgo: `${hours} ${hours === 1 ? "hour" : "hours"} ago`,
      visibleAgo: `${hours}h ago`,
      visibleOld: `${hours}h old`,
    };
  }

  const days = Math.floor(ageMs / dayMs);
  return {
    spokenAgo: `${days} ${days === 1 ? "day" : "days"} ago`,
    visibleAgo: `${days}d ago`,
    visibleOld: `${days}d old`,
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
  totalRouteCount,
}: RouteListSearchVisibilityInput): boolean {
  return (
    normalizeQuery(query).length > 0 ||
    (totalRouteCount > 0 &&
      normalizeRouteListLabel(selectedClientName || "").length > 0)
  );
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

  return clients.map((client) => {
      const selected = activeClientId === client.id;
      const clientName = normalizeRouteListLabel(client.name) || "Workspace";
      const displayName = createCompactRouteListLabel(
        clientName,
        ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH,
        "Workspace",
      );

      return {
        accessibilityHint: `Shows saved routes for ${clientName}.`,
        accessibilityLabel: `Show routes for ${clientName}${
          selected ? ", selected" : ""
        }`,
        id: client.id,
        label: displayName,
        selected,
      };
    });
}

export function shouldShowClientFilters(
  clientFilterOptions: RouteListClientFilterOption[],
): boolean {
  return clientFilterOptions.length > 1 ||
    clientFilterOptions.some((option) => option.selected);
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
    const haystack = normalizeQuery(
      [
        route.name,
        route.operation,
        route.convoyCallsign,
        route.origin,
        route.destination,
        route.route.label,
        route.route.riskLabel,
      ].join(" "),
    );

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
  const trimmedQuery = normalizeRouteListLabel(query);
  const clientName = normalizeRouteListLabel(selectedClientName || "");
  const queryLabel = createCompactRouteListLabel(
    trimmedQuery,
    ROUTE_LIST_QUERY_DISPLAY_MAX_LENGTH,
  );
  const clientLabel = createCompactRouteListLabel(
    clientName,
    ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH,
  );

  if (trimmedQuery) {
    const accessibilityLabel = clientName
      ? `No saved routes match ${trimmedQuery} for ${clientName}. Try another search or workspace.`
      : `No saved routes match ${trimmedQuery}. Try another route, destination, or convoy.`;

    return {
      accessibilityLabel,
      title: "No matches",
      copy: clientName
        ? `No ${queryLabel} routes for ${clientLabel}. Try another search or workspace.`
        : `No ${queryLabel} routes. Try another route or destination.`,
    };
  }

  if (clientName) {
    return {
      accessibilityLabel: `No saved routes are available for ${clientName}. Switch workspaces or refresh after saving a plan.`,
      title: "No routes",
      copy: "Switch workspaces or refresh.",
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
    copy: "Save a plan, then open it on the map.",
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
  const trimmedQuery = normalizeRouteListLabel(query);
  const routeLabel = pluralizeRoute(filteredRouteCount);
  const clientName = normalizeRouteListLabel(selectedClientName || "");
  const clientSuffix = clientName ? ` for ${clientName}` : "";

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
