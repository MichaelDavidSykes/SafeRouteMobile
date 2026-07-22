import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import { loadPreviewOperationsState } from "../src/features/operations/previewOperationsApi";
import {
  createCalendarRows,
  createConvoyRows,
  createOfflineCalendarRows,
  createOperationsEmptyState,
  createOperationsOfflineCalendarRemovalPresentation,
  createOperationsOfflineCalendarSavingPresentation,
  createOperationsOfflineSavingEmptyState,
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
    assert.equal(plannedRows[0].routeId, SAVED_ROUTE_PLANS[0].id);
    assert.ok(plannedRows[0].tripId);
    assert.match(plannedRows[0].accessibilityLabel, /Opens route map and details/);
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

  it("maps convoy management into complete read-only trip manifests", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const convoyRows = createConvoyRows(SAVED_ROUTE_PLANS, operationsState);
    const alpha = convoyRows.find((row) => row.title === "Airport transfer window");

    assert.ok(alpha);
    assert.equal(alpha.statusLabel, "Ready");
    assert.match(alpha.metaLabel, /1 route · 2 vehicles · 2 people/);
    assert.match(alpha.manifestLabel, /Lead Alpha lead/);
    assert.match(alpha.routeLabels.join(" "), /City Airport transfer/);
    assert.equal(alpha.routeOptions[0].routeId, SAVED_ROUTE_PLANS[0].id);
    assert.match(alpha.leadVehicleLabel, /Alpha lead/);
    assert.match(alpha.endpointLabel, /Mayfair/);
    assert.match(alpha.durationLabel, /window/);
    assert.equal(alpha.vehicleLabels.length, 2);
    assert.equal(alpha.vehicles.length, 2);
    assert.equal(alpha.vehicles[0].lead, true);
    assert.match(alpha.vehicles[0].modelLabel, /Land Rover|Range Rover|Toyota|Mercedes|BMW/i);
    assert.match(alpha.vehicles[0].nextEventLabel, /City Airport transfer/);
    assert.equal(alpha.peopleLabels.length, 2);
    assert.match(alpha.accessibilityLabel, /Opens convoy details/);
  });

  it("resolves legacy route-name assignments to canonical route identifiers", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const route = SAVED_ROUTE_PLANS[0];
    const stateWithNameReference = {
      ...operationsState,
      trips: operationsState.trips.map((trip, index) =>
        index === 0
          ? {
              ...trip,
              route_assignments: trip.route_assignments.map((assignment) => ({
                ...assignment,
                route_id: `  ${route.name.toUpperCase().replace(/ /g, "   ")}  `,
              })),
            }
          : trip,
      ),
    };

    const plannedRows = createPlannedRouteRows(
      SAVED_ROUTE_PLANS,
      stateWithNameReference,
    );
    assert.equal(plannedRows[0].routeId, route.id);

    const unresolvedRows = createPlannedRouteRows(SAVED_ROUTE_PLANS, {
      ...stateWithNameReference,
      trips: stateWithNameReference.trips.slice(0, 1).map((trip) => ({
        ...trip,
        route_assignments: trip.route_assignments.map((assignment) => ({
          ...assignment,
          route_id: "Retired route reference",
        })),
      })),
    });
    assert.equal(unresolvedRows[0].routeId, null);
    assert.match(unresolvedRows[0].accessibilityLabel, /map unavailable/i);
  });

  it("keeps every convoy route and its assignment-specific review data", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const firstTrip = operationsState.trips[0];
    const additionalRoute = SAVED_ROUTE_PLANS[1];
    const multiRouteState = {
      ...operationsState,
      trips: [
        {
          ...firstTrip,
          route_ids: [firstTrip.route_assignments[0].route_id, additionalRoute.id],
        },
      ],
    };

    const [convoy] = createConvoyRows(SAVED_ROUTE_PLANS, multiRouteState);
    assert.equal(convoy.routeOptions.length, 2);
    assert.equal(convoy.routeOptions[1].routeId, additionalRoute.id);
    assert.match(convoy.routeOptions[0].scheduleLabel, /·/);
    assert.match(convoy.routeOptions[0].durationLabel, /window/);
    assert.match(convoy.routeOptions[0].manifestLabel, /vehicles/);
    assert.ok(convoy.routeOptions[0].vehicleLabels.length > 0);
    assert.ok(convoy.routeOptions[0].peopleLabels.length > 0);
  });

  it("shows each vehicle only the routes assigned to it", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const firstTrip = operationsState.trips[0];
    const firstAssignment = firstTrip.route_assignments[0];
    const [firstVehicleId, secondVehicleId] = firstTrip.vehicle_ids;
    const secondRoute = SAVED_ROUTE_PLANS[1];
    assert.ok(firstVehicleId);
    assert.ok(secondVehicleId);

    const [convoy] = createConvoyRows(SAVED_ROUTE_PLANS, {
      ...operationsState,
      trips: [{
        ...firstTrip,
        route_ids: [firstAssignment.route_id, secondRoute.id],
        route_assignments: [
          {
            ...firstAssignment,
            vehicle_ids: [firstVehicleId],
            movement_date: "2026-08-02T09:00:00.000Z",
          },
          {
            ...firstAssignment,
            route_id: secondRoute.id,
            vehicle_ids: [secondVehicleId],
            movement_date: "2026-08-01T09:00:00.000Z",
          },
        ],
      }],
    });

    assert.deepEqual(convoy.routeOptions[0].vehicleIds, [firstVehicleId]);
    assert.deepEqual(convoy.routeOptions[1].vehicleIds, [secondVehicleId]);
    assert.match(
      convoy.vehicles.find((vehicle) => vehicle.id === firstVehicleId)?.nextEventLabel || "",
      new RegExp(SAVED_ROUTE_PLANS[0].name),
    );
    assert.match(
      convoy.vehicles.find((vehicle) => vehicle.id === secondVehicleId)?.nextEventLabel || "",
      new RegExp(secondRoute.name),
    );
  });

  it("summarizes differing assignment schedules and durations without inventing a convoy-wide value", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const firstTrip = operationsState.trips[0];
    const [firstAssignment] = firstTrip.route_assignments;
    const secondRoute = SAVED_ROUTE_PLANS[1];
    const [convoy] = createConvoyRows(SAVED_ROUTE_PLANS, {
      ...operationsState,
      trips: [{
        ...firstTrip,
        movement_date: null,
        duration_minutes: null,
        route_ids: [firstAssignment.route_id, secondRoute.id],
        route_assignments: [
          {
            ...firstAssignment,
            movement_date: "2026-08-02T09:00:00.000Z",
            duration_minutes: 45,
          },
          {
            ...firstAssignment,
            route_id: secondRoute.id,
            movement_date: "2026-08-03T14:00:00.000Z",
            duration_minutes: 90,
          },
        ],
      }],
    });

    assert.equal(convoy.scheduleLabel, "Schedules vary by route");
    assert.equal(convoy.durationLabel, "Durations vary by route");
    assert.notEqual(
      convoy.routeOptions[0].scheduleLabel,
      convoy.routeOptions[1].scheduleLabel,
    );
    assert.notEqual(
      convoy.routeOptions[0].durationLabel,
      convoy.routeOptions[1].durationLabel,
    );
  });

  it("does not present one assignment's timing as convoy-wide when another route is pending", () => {
    const operationsState = loadPreviewOperationsState("preview-routes");
    const firstTrip = operationsState.trips[0];
    const [firstAssignment] = firstTrip.route_assignments;
    const secondRoute = SAVED_ROUTE_PLANS[1];
    const [convoy] = createConvoyRows(SAVED_ROUTE_PLANS, {
      ...operationsState,
      trips: [{
        ...firstTrip,
        movement_date: null,
        duration_minutes: null,
        route_ids: [firstAssignment.route_id, secondRoute.id],
        route_assignments: [
          {
            ...firstAssignment,
            movement_date: "2026-08-02T09:00:00.000Z",
            duration_minutes: 45,
          },
          {
            ...firstAssignment,
            route_id: secondRoute.id,
            movement_date: null,
            duration_minutes: null,
          },
        ],
      }],
    });

    assert.equal(convoy.scheduleLabel, "Schedules vary by route");
    assert.equal(convoy.durationLabel, "Durations vary by route");
    assert.equal(convoy.routeOptions[1].scheduleLabel, "Unscheduled");
    assert.equal(convoy.routeOptions[1].durationLabel, "Duration pending");
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
    assert.equal(convoyRows.every((row) => row.manifestAvailable === false), true);
  });

  it("keeps fallback convoy identifiers unique when callsign slugs collide", () => {
    const rows = createConvoyRows([
      { ...SAVED_ROUTE_PLANS[0], id: "route-one", convoyCallsign: "A/B" },
      { ...SAVED_ROUTE_PLANS[1], id: "route-two", convoyCallsign: "A B" },
    ], null);

    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].id, rows[1].id);
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
    assert.equal(rows[0].routeId, null);
    assert.equal(rows[0].tripId, null);
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

  it("presents honest, accessible saved-calendar removal states", () => {
    const idle = createOperationsOfflineCalendarRemovalPresentation("idle");
    assert.equal(idle.actionLabel, "Remove saved calendar");
    assert.equal(
      idle.actionAccessibilityLabel,
      "Remove saved calendar from this device",
    );
    assert.match(
      idle.actionAccessibilityHint || "",
      /future successful sync may save a new calendar/i,
    );
    assert.equal(idle.busy, false);
    assert.equal(idle.status, null);
    assert.equal(idle.confirmation?.title, "Remove saved calendar?");
    assert.match(idle.confirmation?.copy || "", /Online Operations data is unchanged/);

    const removing =
      createOperationsOfflineCalendarRemovalPresentation("removing");
    assert.equal(removing.busy, true);
    assert.equal(removing.actionLabel, null);
    assert.equal(removing.status?.tone, "progress");
    assert.equal(removing.status?.title, "Removing…");

    const removed =
      createOperationsOfflineCalendarRemovalPresentation("removed");
    assert.equal(removed.actionLabel, null);
    assert.equal(removed.status?.tone, "success");
    assert.equal(removed.status?.title, "Saved calendar removed");
    assert.match(
      removed.status?.message || "",
      /future successful sync may save a new calendar/i,
    );

    const retry = createOperationsOfflineCalendarRemovalPresentation("retry");
    assert.equal(retry.actionLabel, "Retry removal");
    assert.equal(retry.status?.tone, "failure");
    assert.equal(retry.status?.title, "Removal needs retry");
    assert.match(retry.status?.message || "", /hidden/);
    assert.match(retry.status?.message || "", /could not confirm removal/);
  });

  it("distinguishes durable offline saving consent from one-shot removal", () => {
    const enabled =
      createOperationsOfflineCalendarSavingPresentation("enabled");
    assert.equal(enabled.actionKind, "stop");
    assert.equal(enabled.actionLabel, "Stop future offline saves");
    assert.match(enabled.confirmation?.copy || "", /won't save it again/i);
    assert.match(enabled.confirmation?.copy || "", /other workspaces are unchanged/i);

    const disabled =
      createOperationsOfflineCalendarSavingPresentation(
        "disabled",
        "Guidance Operations",
      );
    assert.equal(disabled.actionKind, "allow");
    assert.equal(disabled.actionLabel, "Allow offline saving");
    assert.match(disabled.message, /Nothing will be saved/i);
    assert.match(
      disabled.actionAccessibilityLabel || "",
      /Guidance Operations/,
    );

    const cleanup =
      createOperationsOfflineCalendarSavingPresentation("cleanup-retry");
    assert.equal(cleanup.tone, "failure");
    assert.equal(cleanup.actionLabel, "Retry cleanup");
    assert.match(cleanup.message, /Future saves are off/i);

    const unavailable =
      createOperationsOfflineCalendarSavingPresentation("unavailable");
    assert.equal(unavailable.actionKind, "check");
    assert.match(unavailable.message, /reads and saves are blocked/i);

    assert.equal(
      createOperationsOfflineCalendarSavingPresentation("stopping").busy,
      true,
    );
    assert.equal(
      createOperationsOfflineCalendarSavingPresentation("allow-retry")
        .actionLabel,
      "Retry allowing saves",
    );
    assert.equal(
      createOperationsOfflineCalendarSavingPresentation("stopping")
        .actionLabel,
      "Stopping…",
    );
    assert.match(
      createOperationsOfflineSavingEmptyState("disabled")?.copy || "",
      /Allow offline saving, then reconnect/,
    );
    assert.match(
      createOperationsOfflineSavingEmptyState("cleanup-retry")?.copy || "",
      /Retry cleanup/,
    );
    assert.match(
      createOperationsOfflineSavingEmptyState("unavailable")?.copy || "",
      /no saved Calendar is shown/,
    );
    assert.match(
      createOperationsOfflineCalendarSavingPresentation("capacity").message,
      /setting is unchanged[\s\S]*may remain on this device/i,
    );
    assert.match(
      createOperationsOfflineSavingEmptyState("capacity")?.copy || "",
      /may still be saved/i,
    );
    assert.equal(
      createOperationsOfflineCalendarSavingPresentation("saved").tone,
      "success",
    );
  });
});
