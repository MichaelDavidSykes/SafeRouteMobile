import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  createCalendarRows,
  createConvoyRows,
  createOperationsEmptyState,
  createOperationsLoadingLabel,
  createOperationsSubtitle,
  createOperationsTabOptions,
  createOperationsTitle,
  createPlannedRouteRows
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
        accessibilityLabel: "View operations calendar",
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

  it("maps synced routes into view-only planned and calendar rows", () => {
    const plannedRows = createPlannedRouteRows(SAVED_ROUTE_PLANS);
    const calendarRows = createCalendarRows(SAVED_ROUTE_PLANS);

    assert.equal(plannedRows.some((row) => row.badgeLabel === "Planned"), true);
    assert.equal(plannedRows.every((row) => /View only/.test(row.accessibilityLabel)), true);
    assert.equal(calendarRows.length, SAVED_ROUTE_PLANS.length);
    assert.match(calendarRows[0].scheduleLabel, /Today|Tomorrow|This week/);
    assert.match(calendarRows[0].endpointLabel, /→/);
  });

  it("groups routes into view-only convoy assignments", () => {
    const convoyRows = createConvoyRows(SAVED_ROUTE_PLANS);
    const bravo = convoyRows.find((row) => row.title === "Bravo convoy");

    assert.ok(bravo);
    assert.match(bravo.metaLabel, /planned|Ready|live/);
    assert.equal(bravo.routeLabels.length >= 1, true);
    assert.match(bravo.accessibilityLabel, /View only/);
  });

  it("keeps empty-state copy specific to the active operations view", () => {
    assert.deepEqual(createOperationsEmptyState("calendar"), {
      title: "No calendar items",
      copy: "Synced route windows will appear here.",
      accessibilityLabel: "No calendar items. Synced route windows will appear here."
    });
    assert.deepEqual(createOperationsEmptyState("convoy-management"), {
      title: "No convoys",
      copy: "Convoy assignments will appear here once synced.",
      accessibilityLabel: "No convoys. Convoy assignments will appear here once synced."
    });
  });
});
