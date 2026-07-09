import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import { loadPreviewOperationsState } from "../src/features/operations/previewOperationsApi";
import {
  createCalendarRows,
  createConvoyRows,
  createOperationsClientFilterOptions,
  createOperationsEmptyState,
  createOperationsLoadingLabel,
  createOperationsSubtitle,
  createOperationsSummaryState,
  createOperationsSyncWarningState,
  createOperationsTabOptions,
  createOperationsTitle,
  createPlannedRouteRows,
  resolveOperationsClientId,
  shouldShowOperationsClientFilters
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
    assert.match(createOperationsSubtitle("planned-routes"), /Editing stays on web/);
    assert.equal(createOperationsLoadingLabel("convoy-management"), "Loading convoys");
  });

  it("keeps operations client selection stable and concise", () => {
    const clients = [
      { id: "client-1", name: "Very Long Workspace Name That Needs Compacting" },
      { id: "client-2", name: "Bravo" }
    ];
    const options = createOperationsClientFilterOptions(clients, "client-1");

    assert.equal(resolveOperationsClientId(clients, "missing", "client-2"), "client-2");
    assert.equal(resolveOperationsClientId(clients, "client-1", "client-2"), "client-1");
    assert.equal(shouldShowOperationsClientFilters(options), true);
    assert.equal(options[0].selected, true);
    assert.ok(options[0].label.endsWith("…"));
    assert.match(options[0].accessibilityLabel, /selected/);
  });

  it("maps synced trip manifests into planned rows with schedule, route, vehicle, and person data", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const plannedRows = createPlannedRouteRows(SAVED_ROUTE_PLANS, operationsState);

    assert.equal(plannedRows.length, 3);
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

    assert.equal(calendarRows.length, 3);
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
    assert.equal(calendarRows.length, 0);
    assert.match(plannedRows[0].manifestLabel, /Manifest pending/);
    assert.ok(convoyRows.some((row) => row.title === "Alpha convoy"));
  });

  it("summarizes visible operations data without adding edit affordances", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const summary = createOperationsSummaryState(SAVED_ROUTE_PLANS, operationsState);

    assert.deepEqual(summary.metrics, [
      { label: "Trips", value: "3" },
      { label: "Scheduled", value: "3" },
      { label: "Convoys", value: "3" }
    ]);
    assert.match(summary.accessibilityLabel, /3 trips/);
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
});
