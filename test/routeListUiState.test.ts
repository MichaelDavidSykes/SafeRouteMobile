import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SavedSafeRoutePlan } from "../src/features/live-map/liveMapTypes";
import {
  createRouteListHeaderCopy,
  createRouteListLoadingState,
  createRouteListMapReturnState,
  createRouteListSignOutState,
  createRouteListClientFilterOptions,
  createRouteListEmptyState,
  createRouteListSummaryState,
  filterSavedRoutes,
  findSelectedClient,
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
      true,
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
        accessibilityHint: "Shows saved routes for every client.",
        accessibilityLabel: "Show routes for all clients",
        id: null,
        label: "All",
        selected: false,
      },
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
        accessibilityHint: "Shows saved routes for every client.",
        accessibilityLabel: "Show routes for all clients, selected",
        id: null,
        label: "All",
        selected: true,
      },
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
          "No saved routes match airport for Acme Security. Try another search or client.",
        title: "No matches",
        copy: "No airport routes for Acme Security. Try another search or client.",
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
          "No saved routes are available for Blue Team. Switch clients or refresh after saving a plan.",
        title: "No routes for Blue Team",
        copy: "Switch clients or refresh after saving a plan.",
      },
    );

    assert.deepEqual(createRouteListEmptyState({ query: "", routeCount: 0 }), {
      accessibilityLabel:
        "No saved routes are available. Save a SafeRoute plan in LunarChain to open it on the map.",
      title: "No saved routes",
      copy: "Save a plan, then open it here.",
    });

    assert.deepEqual(createRouteListEmptyState({ query: "", routeCount: 2 }), {
      accessibilityLabel:
        "No saved routes match the current filters. Try another route, destination, or convoy.",
      title: "No matches",
      copy: "Try another filter.",
    });
  });
});
