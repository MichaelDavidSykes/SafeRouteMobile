import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import { loadPreviewOperationsState } from "../src/features/operations/previewOperationsApi";
import {
  createCalendarRows,
  createConvoyRows,
  createOfflineCalendarRows,
  createOperationsEmptyState,
  createOperationsOfflineEmptyState,
  createOperationsOfflineReviewPresentation,
  createOperationsLoadingLabel,
  createOperationsSubtitle,
  createOperationsSummaryState,
  createOperationsSyncWarningState,
  createOperationsTabOptions,
  createOperationsTitle,
  createOperationsWorkspaceOptions,
  createOperationsWorkspaceState,
  createPlannedRouteRows,
  shouldShowOperationsWorkspaceSelector
} from "../src/features/operations/operationsUiState";

describe("view-only operations UI state", () => {
  it("creates clean tab copy for planned routes, calendar, and convoy management", () => {
    assert.deepEqual(createOperationsTabOptions("calendar"), [
      {
        id: "planned-routes",
        label: "Planned",
        accessibilityLabel: "View planned routes",
        selected: false
      },
      {
        id: "calendar",
        label: "Calendar",
        accessibilityLabel: "View operations calendar, selected",
        selected: true
      },
      {
        id: "convoy-management",
        label: "Convoys",
        accessibilityLabel: "View convoy management",
        selected: false
      }
    ]);
    assert.equal(createOperationsTitle("planned-routes"), "Planned routes");
    assert.equal(createOperationsTitle("calendar"), "Calendar");
    assert.equal(createOperationsTitle("convoy-management"), "Convoys");
    assert.match(createOperationsSubtitle("planned-routes"), /synced from SafeRoute/);
    assert.equal(createOperationsLoadingLabel("convoy-management"), "Loading convoys");
  });

  it("keeps the controlled workspace visible, selected, and concise", () => {
    const workspaces = [
      { id: "client-1", name: "Very Long Workspace Name That Needs Compacting" },
      { id: "client-2", name: "Bravo" }
    ];
    const options = createOperationsWorkspaceOptions(workspaces, "client-1");

    assert.equal(shouldShowOperationsWorkspaceSelector(options), true);
    assert.equal(
      shouldShowOperationsWorkspaceSelector(createOperationsWorkspaceOptions([workspaces[0]], "client-1")),
      true,
    );
    assert.equal(options[0].selected, true);
    assert.ok(options[0].label.endsWith("…"));
    assert.match(options[0].accessibilityLabel, /selected/);
  });

  it("describes loading, required-choice, unavailable, and no-access workspace states", () => {
    assert.equal(createOperationsWorkspaceState({
      activeWorkspaceId: "workspace-a",
      availableWorkspaceCount: 2,
      errorMessage: "",
      loading: false,
    }), null);
    assert.deepEqual(createOperationsWorkspaceState({
      activeWorkspaceId: null,
      availableWorkspaceCount: 0,
      errorMessage: "",
      loading: true,
    }), {
      accessibilityLabel: "Loading SafeRoute workspaces.",
      copy: "Checking the workspaces available to this account.",
      loading: true,
      retry: false,
      title: "Loading workspaces",
    });
    assert.equal(createOperationsWorkspaceState({
      activeWorkspaceId: null,
      availableWorkspaceCount: 2,
      errorMessage: "",
      loading: false,
    })?.title, "Choose workspace");
    assert.deepEqual(createOperationsWorkspaceState({
      activeWorkspaceId: null,
      availableWorkspaceCount: 0,
      errorMessage: "Workspaces could not be loaded. Retry.",
      loading: false,
    })?.retry, true);
    assert.equal(createOperationsWorkspaceState({
      activeWorkspaceId: null,
      availableWorkspaceCount: 0,
      errorMessage: "",
      loading: false,
    })?.title, "No workspace access");
  });

  it("maps synced trip manifests into planned rows with schedule, route, vehicle, and person data", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const plannedRows = createPlannedRouteRows(SAVED_ROUTE_PLANS, operationsState);

    assert.equal(plannedRows.length, 2);
    assert.match(plannedRows[0].title, /Airport transfer window/);
    assert.match(plannedRows[0].endpointLabel, /Mayfair, London → London City Airport/);
    assert.match(plannedRows[0].metaLabel, /window/);
    assert.match(plannedRows[0].manifestLabel, /2 vehicles · 2 people/);
    assert.match(plannedRows[0].manifestLabel, /Alpha lead/);
    assert.match(plannedRows[0].accessibilityLabel, /View only/);
  });

  it("maps scheduled trip route assignments into calendar rows sorted by movement time", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const calendarRows = createCalendarRows(SAVED_ROUTE_PLANS, operationsState);

    assert.equal(calendarRows.length, 2);
    assert.match(calendarRows[0].badgeLabel, /·/);
    assert.match(calendarRows[0].scheduleLabel, /·/);
    assert.match(calendarRows[0].endpointLabel, /→/);
    assert.equal(calendarRows.every((row) => !/Unscheduled/.test(row.scheduleLabel)), true);
  });

  it("maps convoy management into view-only trip manifests", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const convoyRows = createConvoyRows(SAVED_ROUTE_PLANS, operationsState);
    const alpha = convoyRows.find((row) => row.title === "Airport transfer window");

    assert.ok(alpha);
    assert.equal(alpha.statusLabel, "Ready");
    assert.match(alpha.metaLabel, /1 route · 2 vehicles · 2 people/);
    assert.match(alpha.manifestLabel, /Lead Alpha lead/);
    assert.match(alpha.routeLabels.join(" "), /City Airport transfer/);
    assert.match(alpha.accessibilityLabel, /View only/);
  });

  it("falls back to saved route rows when operations manifests are unavailable", () => {
    const plannedRows = createPlannedRouteRows(SAVED_ROUTE_PLANS, null);
    const calendarRows = createCalendarRows(SAVED_ROUTE_PLANS, null);
    const convoyRows = createConvoyRows(SAVED_ROUTE_PLANS, null);

    assert.equal(plannedRows.length, 3);
    assert.equal(calendarRows.length, 3);
    assert.equal(calendarRows.every((row) => row.scheduleLabel === "Schedule pending"), true);
    assert.match(plannedRows[0].manifestLabel, /Manifest pending/);
    assert.ok(convoyRows.some((row) => row.title === "Alpha convoy"));
  });

  it("does not mislabel saved routes as planned when a real workspace has no trip plans", () => {
    const emptyOperationsState = loadPreviewOperationsState("empty-client");

    assert.deepEqual(createPlannedRouteRows(SAVED_ROUTE_PLANS, emptyOperationsState), []);
    assert.deepEqual(createCalendarRows(SAVED_ROUTE_PLANS, emptyOperationsState), []);
    assert.deepEqual(createConvoyRows(SAVED_ROUTE_PLANS, emptyOperationsState), []);
  });

  it("summarizes visible operations data without adding edit affordances", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const summary = createOperationsSummaryState(SAVED_ROUTE_PLANS, operationsState);

    assert.deepEqual(summary.metrics, [
      { label: "Trips", value: "2" },
      { label: "Scheduled", value: "2" },
      { label: "Convoys", value: "2" }
    ]);
    assert.match(summary.accessibilityLabel, /2 trips/);
  });

  it("keeps empty and warning copy specific to the active operations view", () => {
    assert.deepEqual(createOperationsEmptyState("calendar"), {
      title: "No scheduled movements",
      copy: "Trip route windows from SafeRoute will appear here.",
      accessibilityLabel: "No scheduled movements. Trip route windows from SafeRoute will appear here."
    });
    assert.deepEqual(createOperationsEmptyState("convoy-management"), {
      title: "No convoy manifests",
      copy: "Vehicles, people, and assigned routes will appear here once synced.",
      accessibilityLabel: "No convoy manifests. Vehicles, people, and assigned routes will appear here once synced."
    });
    assert.deepEqual(createOperationsSyncWarningState(new Error("Operations offline")), {
      message: "Operations offline. Showing saved routes only.",
      accessibilityLabel: "Operations offline. Showing saved routes only."
    });
  });

  it("renders redacted saved calendar rows without implying a cached manifest", () => {
    const rows = createOfflineCalendarRows([
      {
        destination: "London City Airport",
        durationMinutes: 45,
        id: "movement-1",
        movementIso: "2026-07-18T10:30:00.000Z",
        origin: "Mayfair",
        status: "ready",
        title: "Airport transfer",
      },
    ]);

    assert.equal(rows.length, 1);
    assert.match(rows[0].endpointLabel, /Mayfair → London City Airport/);
    assert.match(rows[0].metaLabel, /45 min window/);
    assert.equal(rows[0].manifestLabel, "Manifest not stored offline");
    assert.match(rows[0].accessibilityLabel, /review only/i);
  });

  it("discloses independent calendar age and honest offline tab availability", () => {
    const storedAtMs = new Date("2026-07-18T09:00:00.000Z").getTime();
    const presentation = createOperationsOfflineReviewPresentation({
      nowMs: storedAtMs + 61 * 60 * 1000,
      status: "offline",
      storedAtMs,
    });

    assert.equal(
      presentation?.visibleLabel,
      "Offline · calendar saved 1h · review only",
    );
    assert.match(presentation?.accessibilityLabel || "", /convoy manifests are not stored offline/i);
    assert.equal(
      createOperationsOfflineReviewPresentation({
        nowMs: storedAtMs + 24 * 60 * 60 * 1000,
        status: "offline",
        storedAtMs,
      }),
      null,
    );
    assert.match(
      createOperationsOfflineEmptyState("convoy-management", true).copy,
      /aren't stored offline/,
    );
    assert.match(
      createOperationsOfflineEmptyState("calendar", false).copy,
      /securely save/,
    );
    assert.equal(
      createOperationsOfflineEmptyState(
        "calendar",
        false,
        "checking-connection",
      ).title,
      "Checking connection",
    );
    assert.equal(
      createOperationsOfflineEmptyState(
        "convoy-management",
        false,
        "checking-access",
      ).title,
      "Checking workspace access",
    );
    assert.match(
      createOperationsOfflineEmptyState("planned-routes", true).copy,
      /Full planned-route details/,
    );
  });
});
