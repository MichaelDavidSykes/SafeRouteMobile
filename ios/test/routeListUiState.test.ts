import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SavedSafeRoutePlan } from "../src/features/live-map/liveMapTypes";
import { OFFLINE_ROUTE_CACHE_MAX_AGE_MS } from "../src/features/routes/offlineRouteCacheCore";
import {
  createRouteListHeaderCopy,
  createRouteListLoadingState,
  createRouteListOfflineReviewPresentation,
  createRouteListMapReturnState,
  createRouteListSearchQueryValue,
  createRouteListSignOutState,
  createRouteListClientFilterOptions,
  createRouteListEmptyState,
  createRouteListExpiredCacheMessage,
  createRouteListSummaryState,
  filterSavedRoutes,
  findSelectedClient,
  getRouteListOfflineReviewRefreshDelayMs,
  ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH,
  ROUTE_LIST_QUERY_DISPLAY_MAX_LENGTH,
  ROUTE_LIST_QUERY_INPUT_MAX_LENGTH,
  reconcileSelectedClientId,
  shouldShowClientFilters,
  shouldShowRouteEmptyState,
  shouldShowRouteSearch,
  shouldShowRouteSummary,
} from "../src/features/routes/routeListUiState";

const baseRoute: SavedSafeRoutePlan = {
  id: "route-1",
  name: "Morning embassy transfer",
  operation: "Diplomatic move",
  status: "ready",
  convoyCallsign: "Lead 1",
  updatedAtLabel: "Updated today",
  origin: "Hotel",
  destination: "Embassy",
  region: {
    latitude: 51.5,
    longitude: -0.1,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  },
  route: {
    id: "primary",
    color: "#15b981",
    coordinates: [],
    description: "Saved route",
    distance: "8.0 km",
    eta: "18 min",
    label: "Primary route",
    mutedColor: "rgba(21, 185, 129, 0.2)",
    nextDistance: "400 m",
    nextInstruction: "Continue",
    riskLabel: "Low",
    safeScore: 22,
    tone: "safe",
  },
  riskZones: [],
  checkpoints: [],
};

describe("route list UI state helpers", () => {
  it("keeps route list copy minimal and product-led", () => {
    assert.deepEqual(createRouteListHeaderCopy(), {
      title: "Choose route",
    });
  });

  it("keeps route-picker sign-out compact while preserving accessible identity", () => {
    assert.deepEqual(createRouteListSignOutState(" operator@lunarchain.net "), {
      label: "Sign out",
      signOutAccessibilityHint:
        "Ends this LunarChain session and returns to the sign-in screen.",
      signOutAccessibilityLabel:
        "Sign out of LunarChain account operator@lunarchain.net",
    });

    assert.deepEqual(createRouteListSignOutState(""), {
      label: "Sign out",
      signOutAccessibilityHint:
        "Ends this LunarChain session and returns to the sign-in screen.",
      signOutAccessibilityLabel: "Sign out of LunarChain",
    });
  });

  it("exposes a map-first return action for the saved-route picker", () => {
    assert.deepEqual(createRouteListMapReturnState(), {
      accessibilityHint: "Returns to the map-first SafeRoute home.",
      accessibilityLabel: "Return to SafeRoute map",
      label: "Map",
    });
  });

  it("uses a calm loading state while saved routes sync", () => {
    assert.deepEqual(createRouteListLoadingState(), {
      accessibilityLabel:
        "Syncing saved SafeRoute plans. The map remains available.",
      title: "Syncing routes",
    });
  });

  it("discloses a bounded offline cache age without implying authorization", () => {
    const nowMs = 30 * 24 * 60 * 60 * 1000;

    assert.deepEqual(
      createRouteListOfflineReviewPresentation({
        nowMs,
        status: "offline",
        storedAtMs: nowMs - 59 * 60 * 1000,
      }),
      {
        accessibilityLabel:
          "Offline saved routes. This copy was cached less than one hour ago and is review only. Reconnect and verify workspace access before starting guidance.",
        cardAccessibilityLabel:
          "Saved copy is review only. Reconnect and verify workspace access before starting guidance.",
        visibleLabel: "Offline · <1h old · reconnect to start",
      },
    );

    const sixHours = createRouteListOfflineReviewPresentation({
      nowMs,
      status: "checking-connection",
      storedAtMs: nowMs - 6.9 * 60 * 60 * 1000,
    });
    assert.equal(sixHours?.visibleLabel, "Checking connection · cached 6h ago");
    assert.equal(
      sixHours?.accessibilityLabel,
      "Checking connection for saved routes. This copy was cached 6 hours ago and is review only. Wait for the connection check and workspace access verification before starting guidance.",
    );
    assert.equal(
      sixHours?.cardAccessibilityLabel,
      "Saved copy is review only. Wait for the connection check and workspace access verification before starting guidance.",
    );

    const twelveDays = createRouteListOfflineReviewPresentation({
      nowMs,
      status: "checking-access",
      storedAtMs: nowMs - 12.9 * 24 * 60 * 60 * 1000,
    });
    assert.equal(twelveDays?.visibleLabel, "Checking access · cached 12d ago");
    assert.equal(
      twelveDays?.accessibilityLabel,
      "Checking workspace access for saved routes. This copy was cached 12 days ago and is review only. Wait for workspace access verification before starting guidance.",
    );
    assert.doesNotMatch(
      [
        sixHours?.accessibilityLabel,
        twelveDays?.accessibilityLabel,
      ].join(" "),
      /\b(?:authorized|current|fresh)\b/i,
    );
  });

  it("advances cache-age copy at hour/day boundaries and expires it on time", () => {
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;

    assert.equal(
      getRouteListOfflineReviewRefreshDelayMs({
        nowMs: 30 * 60 * 1000,
        storedAtMs: 0,
      }),
      30 * 60 * 1000,
    );
    assert.equal(
      getRouteListOfflineReviewRefreshDelayMs({
        nowMs: hourMs,
        storedAtMs: 0,
      }),
      hourMs,
    );
    assert.equal(
      getRouteListOfflineReviewRefreshDelayMs({
        nowMs: dayMs,
        storedAtMs: 0,
      }),
      dayMs,
    );
    assert.equal(
      getRouteListOfflineReviewRefreshDelayMs({
        nowMs: OFFLINE_ROUTE_CACHE_MAX_AGE_MS,
        storedAtMs: 0,
      }),
      1,
    );
    assert.equal(
      getRouteListOfflineReviewRefreshDelayMs({
        nowMs: OFFLINE_ROUTE_CACHE_MAX_AGE_MS + 1,
        storedAtMs: 0,
      }),
      null,
    );
  });

  it("uses connectivity-specific guidance when a displayed copy expires", () => {
    assert.equal(
      createRouteListExpiredCacheMessage("offline"),
      "Saved route copy expired. Reconnect to refresh.",
    );
    assert.equal(
      createRouteListExpiredCacheMessage("checking-connection"),
      "Saved route copy expired. Wait for the connection check before refreshing.",
    );
    assert.equal(
      createRouteListExpiredCacheMessage("checking-access"),
      "Saved route copy expired. Wait for workspace access verification before refreshing.",
    );
  });

  it("does not present invalid or future cache ages", () => {
    assert.equal(
      createRouteListOfflineReviewPresentation({
        nowMs: 1_000,
        status: "offline",
        storedAtMs: 1_001,
      }),
      null,
    );
    assert.equal(
      createRouteListOfflineReviewPresentation({
        nowMs: Number.NaN,
        status: "offline",
        storedAtMs: 1_000,
      }),
      null,
    );
    assert.equal(
      createRouteListOfflineReviewPresentation({
        nowMs: OFFLINE_ROUTE_CACHE_MAX_AGE_MS + 1,
        status: "offline",
        storedAtMs: 0,
      }),
      null,
    );
  });

  it("keeps route search hidden until the picker needs it", () => {
    assert.equal(
      shouldShowRouteSearch({
        query: "",
        totalRouteCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSearch({
        query: "",
        totalRouteCount: 1,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSearch({
        query: "",
        totalRouteCount: 2,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSearch({
        query: "",
        totalRouteCount: 3,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSearch({
        query: "",
        totalRouteCount: 4,
      }),
      true,
    );
    assert.equal(
      shouldShowRouteSearch({
        query: " airport ",
        totalRouteCount: 1,
      }),
      true,
    );
    assert.equal(
      shouldShowRouteSearch({
        query: "",
        selectedClientName: "Acme Security",
        totalRouteCount: 1,
      }),
      false,
    );
  });

  it("bounds route search input before filtering saved routes", () => {
    const longQuery = "checkpoint ".repeat(20);

    assert.equal(
      createRouteListSearchQueryValue(" airport corridor "),
      " airport corridor ",
    );
    assert.equal(
      createRouteListSearchQueryValue(longQuery),
      longQuery.slice(0, ROUTE_LIST_QUERY_INPUT_MAX_LENGTH),
    );
    assert.equal(
      createRouteListSearchQueryValue(longQuery).length,
      ROUTE_LIST_QUERY_INPUT_MAX_LENGTH,
    );
  });

  it("keeps route summaries scoped to active filters", () => {
    assert.equal(
      shouldShowRouteSummary({
        query: "",
        totalRouteCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSummary({
        query: "",
        totalRouteCount: 1,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSummary({
        query: "",
        totalRouteCount: 2,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSummary({
        query: "",
        totalRouteCount: 4,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteSummary({
        query: " embassy ",
        totalRouteCount: 1,
      }),
      true,
    );
    assert.equal(
      shouldShowRouteSummary({
        query: "",
        selectedClientName: "Acme Security",
        totalRouteCount: 1,
      }),
      true,
    );
    assert.equal(
      shouldShowRouteSummary({
        query: "",
        selectedClientName: "Acme Security",
        totalRouteCount: 0,
      }),
      false,
    );
  });

  it("hides duplicate empty copy during an initial sync failure", () => {
    assert.equal(
      shouldShowRouteEmptyState({
        errorAction: "sync",
        filteredRouteCount: 0,
        totalRouteCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldShowRouteEmptyState({
        errorAction: null,
        filteredRouteCount: 0,
        totalRouteCount: 0,
      }),
      true,
    );
    assert.equal(
      shouldShowRouteEmptyState({
        errorAction: "detail",
        filteredRouteCount: 0,
        totalRouteCount: 0,
      }),
      true,
    );
    assert.equal(
      shouldShowRouteEmptyState({
        errorAction: "sync",
        filteredRouteCount: 0,
        totalRouteCount: 2,
      }),
      true,
    );
    assert.equal(
      shouldShowRouteEmptyState({
        filteredRouteCount: 1,
        totalRouteCount: 1,
      }),
      false,
    );
  });

  it("filters saved routes across route, convoy, endpoint, and risk text", () => {
    const routes = [
      baseRoute,
      {
        ...baseRoute,
        id: "route-2",
        name: "Airport extract",
        convoyCallsign: "Bravo 2",
        destination: "Airport",
        route: {
          ...baseRoute.route,
          riskLabel: "High",
        },
      },
    ];

    assert.deepEqual(
      filterSavedRoutes(routes, " embassy ").map((route) => route.id),
      ["route-1"],
    );
    assert.deepEqual(
      filterSavedRoutes(routes, " morning   embassy transfer ").map(
        (route) => route.id,
      ),
      ["route-1"],
    );
    assert.deepEqual(
      filterSavedRoutes(routes, "BRAVO").map((route) => route.id),
      ["route-2"],
    );
    assert.deepEqual(
      filterSavedRoutes(routes, "high").map((route) => route.id),
      ["route-2"],
    );
    assert.equal(filterSavedRoutes(routes, "").length, 2);
  });

  it("resolves selected clients only when the active id is still present", () => {
    const clients = [
      { id: "client-1", name: "Acme Security" },
      { id: "client-2", name: "Blue Team" },
    ];

    assert.deepEqual(findSelectedClient(clients, "client-2"), {
      id: "client-2",
      name: "Blue Team",
    });
    assert.equal(findSelectedClient(clients, "missing"), null);
    assert.equal(findSelectedClient(clients, null), null);
  });

  it("clears stale selected-client filters after route sync", () => {
    const clients = [
      { id: "client-1", name: "Acme Security" },
      { id: "client-2", name: "Blue Team" },
    ];

    assert.equal(reconcileSelectedClientId(clients, "client-2"), "client-2");
    assert.equal(reconcileSelectedClientId(clients, "missing"), null);
    assert.equal(reconcileSelectedClientId(clients, null), null);
    assert.equal(reconcileSelectedClientId([], "client-1"), null);
  });

  it("creates accessible client-filter options with stale selections reconciled", () => {
    const clients = [
      { id: "client-1", name: "Acme Security" },
      { id: "client-2", name: "Blue Team" },
    ];

    assert.deepEqual(createRouteListClientFilterOptions(clients, "client-2"), [
      {
        accessibilityHint: "Shows saved routes for Acme Security.",
        accessibilityLabel: "Show routes for Acme Security",
        id: "client-1",
        label: "Acme Security",
        selected: false,
      },
      {
        accessibilityHint: "Shows saved routes for Blue Team.",
        accessibilityLabel: "Show routes for Blue Team, selected",
        id: "client-2",
        label: "Blue Team",
        selected: true,
      },
    ]);

    assert.deepEqual(createRouteListClientFilterOptions(clients, "missing"), [
      {
        accessibilityHint: "Shows saved routes for Acme Security.",
        accessibilityLabel: "Show routes for Acme Security",
        id: "client-1",
        label: "Acme Security",
        selected: false,
      },
      {
        accessibilityHint: "Shows saved routes for Blue Team.",
        accessibilityLabel: "Show routes for Blue Team",
        id: "client-2",
        label: "Blue Team",
        selected: false,
      },
    ]);
  });

  it("bounds client filter chips while preserving full accessible client names", () => {
    const clientName =
      " Metropolitan Diplomatic Protection Group Northern Corridor Operations Team ";
    const option = createRouteListClientFilterOptions(
      [{ id: "client-long", name: clientName }],
      "client-long",
    )[0];

    assert.ok(
      option.label.length <= ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH,
      "Expected visible client chip copy to stay compact",
    );
    assert.match(option.label, /…$/);
    assert.equal(
      option.accessibilityHint,
      "Shows saved routes for Metropolitan Diplomatic Protection Group Northern Corridor Operations Team.",
    );
    assert.equal(
      option.accessibilityLabel,
      "Show routes for Metropolitan Diplomatic Protection Group Northern Corridor Operations Team, selected",
    );
  });

  it("hides redundant client filters unless a real filter choice is useful", () => {
    assert.equal(
      shouldShowClientFilters(createRouteListClientFilterOptions([], null)),
      false,
    );
    assert.equal(
      shouldShowClientFilters(
        createRouteListClientFilterOptions(
          [{ id: "client-1", name: "Acme Security" }],
          null,
        ),
      ),
      false,
    );
    assert.equal(
      shouldShowClientFilters(
        createRouteListClientFilterOptions(
          [{ id: "client-1", name: "Acme Security" }],
          "client-1",
        ),
      ),
      true,
    );
    assert.equal(
      shouldShowClientFilters(
        createRouteListClientFilterOptions(
          [
            { id: "client-1", name: "Acme Security" },
            { id: "client-2", name: "Blue Team" },
          ],
          null,
        ),
      ),
      true,
    );
  });

  it("creates concise route-count summaries for visible saved routes", () => {
    assert.deepEqual(
      createRouteListSummaryState({
        filteredRouteCount: 1,
        query: "",
        selectedClientName: null,
        totalRouteCount: 1,
      }),
      {
        accessibilityLabel: "1 map-ready saved route.",
        clearSearchAccessibilityLabel: null,
        clearSearchLabel: null,
        text: "1 route",
      },
    );

    assert.deepEqual(
      createRouteListSummaryState({
        filteredRouteCount: 2,
        query: "airport",
        selectedClientName: "Acme Security",
        totalRouteCount: 5,
      }),
      {
        accessibilityLabel:
          "Showing 2 of 5 saved routes for Acme Security matching airport.",
        clearSearchAccessibilityLabel: "Clear saved route search for airport",
        clearSearchLabel: "Clear",
        text: "2 of 5 routes",
      },
    );
  });

  it("creates contextual empty-state copy for search and client filters", () => {
    assert.deepEqual(
      createRouteListEmptyState({ query: " airport ", routeCount: 0 }),
      {
        accessibilityLabel:
          "No saved routes match airport. Try another route, destination, or convoy.",
        title: "No matches",
        copy: "No airport routes. Try another route or destination.",
      },
    );

    assert.deepEqual(
      createRouteListEmptyState({
        query: "airport",
        routeCount: 3,
        selectedClientName: "Acme Security",
      }),
      {
        accessibilityLabel:
          "No saved routes match airport for Acme Security. Try another search or workspace.",
        title: "No matches",
        copy: "No airport routes for Acme Security. Try another search or workspace.",
      },
    );

    assert.deepEqual(
      createRouteListEmptyState({
        query: "",
        routeCount: 0,
        selectedClientName: "Blue Team",
      }),
      {
        accessibilityLabel:
          "No saved routes are available for Blue Team. Switch workspaces or refresh after saving a plan.",
        title: "No routes",
        copy: "Switch workspaces or refresh.",
      },
    );

    assert.deepEqual(createRouteListEmptyState({ query: "", routeCount: 0 }), {
      accessibilityLabel:
        "No saved routes are available. Save a SafeRoute plan in LunarChain to open it on the map.",
      title: "No saved routes",
      copy: "Save a plan, then open it on the map.",
    });

    assert.deepEqual(createRouteListEmptyState({ query: "", routeCount: 2 }), {
      accessibilityLabel:
        "No saved routes match the current filters. Try another route, destination, or convoy.",
      title: "No matches",
      copy: "Try another filter.",
    });
  });

  it("bounds visible search and client empty-state copy without hiding VoiceOver context", () => {
    const query =
      " airport corridor with multiple checkpoint terms that should not fill the picker ";
    const selectedClientName =
      " Metropolitan Diplomatic Protection Group Northern Corridor Operations Team ";
    const emptyState = createRouteListEmptyState({
      query,
      routeCount: 4,
      selectedClientName,
    });

    assert.equal(emptyState.title, "No matches");
    assert.match(emptyState.copy, /… routes for .+…\./);
    assert.ok(
      emptyState.copy.includes(
        "airport corridor with multiple".slice(
          0,
          ROUTE_LIST_QUERY_DISPLAY_MAX_LENGTH - 1,
        ),
      ),
    );
    assert.ok(
      emptyState.copy.length < emptyState.accessibilityLabel.length,
      "Expected visible empty-state copy to be shorter than the spoken context",
    );
    assert.equal(
      emptyState.accessibilityLabel,
      "No saved routes match airport corridor with multiple checkpoint terms that should not fill the picker for Metropolitan Diplomatic Protection Group Northern Corridor Operations Team. Try another search or workspace.",
    );

    const clientOnlyState = createRouteListEmptyState({
      query: "",
      routeCount: 0,
      selectedClientName,
    });

    assert.equal(clientOnlyState.title, "No routes");
    assert.equal(clientOnlyState.copy, "Switch workspaces or refresh.");
    assert.ok(
      clientOnlyState.title.length < ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH,
      "Expected client-only empty title to avoid repeating the selected chip",
    );
    assert.equal(
      clientOnlyState.accessibilityLabel,
      "No saved routes are available for Metropolitan Diplomatic Protection Group Northern Corridor Operations Team. Switch workspaces or refresh after saving a plan.",
    );
  });
});
