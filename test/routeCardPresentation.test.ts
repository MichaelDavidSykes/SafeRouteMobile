import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SavedSafeRoutePlan } from "../src/features/live-map/liveMapTypes";
import {
  createRouteCardEndpointLabel,
  createRouteCardMetaLabel,
  createRouteCardPresentation,
  createRouteCardSummaryLabel,
  createRouteCardTestID,
  createRouteUpdatedLabel,
  createRouteStatusLabel,
  ROUTE_CARD_ENDPOINT_MAX_LENGTH,
  ROUTE_CARD_META_MAX_LENGTH,
  ROUTE_CARD_RISK_MAX_LENGTH,
  ROUTE_CARD_SUMMARY_METRIC_MAX_LENGTH,
  ROUTE_CARD_TITLE_MAX_LENGTH,
  shouldShowRouteStatusPill,
} from "../src/features/routes/routeCardPresentation";

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

describe("route card presentation", () => {
  it("creates a voiceover-friendly route summary label", () => {
    assert.deepEqual(createRouteCardPresentation(baseRoute, false), {
      accessibilityHint: "Opens live map guidance for this route",
      accessibilityLabel:
        "Morning embassy transfer. Ready route. Diplomatic move, convoy Lead 1. From Hotel to Embassy. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
      actionLabel: "Map",
      endpointLabel: "Hotel → Embassy",
      metaLabel: "Diplomatic move • Lead 1",
      statusLabel: "Ready",
      summaryLabel: "18 min · 8.0 km · Low risk",
      testID: "safe-route-card-route-1",
      titleLabel: "Morning embassy transfer",
      updatedLabel: "Today",
    });
  });

  it("uses loading copy while route detail is opening", () => {
    assert.deepEqual(
      createRouteCardPresentation(
        {
          ...baseRoute,
          status: "in-progress",
        },
        true,
      ),
      {
        accessibilityHint: "Live map is opening",
        accessibilityLabel:
          "Morning embassy transfer. Live route. Diplomatic move, convoy Lead 1. From Hotel to Embassy. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
        actionLabel: "Opening",
        endpointLabel: "Hotel → Embassy",
        metaLabel: "Diplomatic move • Lead 1",
        statusLabel: "Live",
        summaryLabel: "18 min · 8.0 km · Low risk",
        testID: "safe-route-card-route-1",
        titleLabel: "Morning embassy transfer",
        updatedLabel: "Today",
      },
    );
  });

  it("keeps route card accessibility sentences calm when metadata includes punctuation", () => {
    const presentation = createRouteCardPresentation(
      {
        ...baseRoute,
        name: " Embassy transfer. ",
        operation: " Night Watch? ",
        convoyCallsign: " Convoy Eagle One. ",
        route: {
          ...baseRoute.route,
          riskLabel: "High risk.",
        },
        updatedAtLabel: "Updated today.",
      },
      false,
    );

    assert.equal(
      presentation.accessibilityLabel,
      "Embassy transfer. Ready route. Night Watch?, Convoy Eagle One. From Hotel to Embassy. 18 min ETA, 8.0 km distance, High risk. Updated today.",
    );
    assert.doesNotMatch(presentation.accessibilityLabel, /\.\./);
    assert.doesNotMatch(presentation.accessibilityLabel, /\?\./);
  });

  it("creates stable route card test identifiers for runtime smoke flows", () => {
    assert.equal(
      createRouteCardTestID(" SR/City Airport Alpha "),
      "safe-route-card-sr-city-airport-alpha",
    );
    assert.equal(
      createRouteCardTestID("city.airport/transfer"),
      "safe-route-card-city-airport-transfer",
    );
    assert.equal(createRouteCardTestID(""), "safe-route-card-unknown");
  });

  it("keeps visible card route context as one compact map-oriented line", () => {
    assert.equal(
      createRouteCardSummaryLabel(baseRoute),
      "18 min · 8.0 km · Low risk",
    );
    assert.equal(
      createRouteCardSummaryLabel({
        ...baseRoute,
        route: {
          ...baseRoute.route,
          riskLabel: "High risk",
        },
      }),
      "18 min · 8.0 km · High risk",
    );
  });

  it("bounds verbose visible ETA and distance copy while preserving accessibility context", () => {
    const verboseEta =
      "Estimated arrival in eighteen minutes after the diplomatic security checkpoint clears";
    const verboseDistance =
      "Eight point four kilometres via the north riverside service road detour";
    const presentation = createRouteCardPresentation(
      {
        ...baseRoute,
        route: {
          ...baseRoute.route,
          distance: verboseDistance,
          eta: verboseEta,
        },
      },
      false,
    );
    const [etaSummary, distanceSummary, riskSummary] =
      presentation.summaryLabel.split(" · ");

    assert.ok(etaSummary.endsWith("…"));
    assert.ok(distanceSummary.endsWith("…"));
    assert.ok(etaSummary.length <= ROUTE_CARD_SUMMARY_METRIC_MAX_LENGTH);
    assert.ok(distanceSummary.length <= ROUTE_CARD_SUMMARY_METRIC_MAX_LENGTH);
    assert.equal(riskSummary, "Low risk");
    assert.ok(presentation.accessibilityLabel.includes(verboseEta));
    assert.ok(presentation.accessibilityLabel.includes(verboseDistance));
  });

  it("bounds verbose visible risk copy while preserving full accessibility context", () => {
    const verboseRiskLabel =
      "High risk near diplomatic staging checkpoint with repeated overnight reports";
    const presentation = createRouteCardPresentation(
      {
        ...baseRoute,
        route: {
          ...baseRoute.route,
          riskLabel: verboseRiskLabel,
        },
      },
      false,
    );
    const summaryParts = presentation.summaryLabel.split(" · ");
    const riskSummary = summaryParts[summaryParts.length - 1];

    assert.ok(riskSummary.endsWith("…"));
    assert.ok(riskSummary.length <= ROUTE_CARD_RISK_MAX_LENGTH);
    assert.equal(
      presentation.summaryLabel,
      `18 min · 8.0 km · ${riskSummary}`,
    );
    assert.match(presentation.accessibilityLabel, new RegExp(verboseRiskLabel));
  });

  it("preserves the risk suffix when compacting advisory labels", () => {
    const advisoryLabel =
      "Elevated checkpoint security posture near the destination corridor";
    const presentation = createRouteCardPresentation(
      {
        ...baseRoute,
        route: {
          ...baseRoute.route,
          riskLabel: advisoryLabel,
        },
      },
      false,
    );
    const summaryParts = presentation.summaryLabel.split(" · ");
    const riskSummary = summaryParts[summaryParts.length - 1];

    assert.match(riskSummary, /… risk$/);
    assert.ok(riskSummary.length <= ROUTE_CARD_RISK_MAX_LENGTH);
    assert.match(
      presentation.accessibilityLabel,
      new RegExp(`${advisoryLabel} risk`),
    );
  });

  it("hides generic route metadata while keeping meaningful convoy context", () => {
    assert.equal(
      createRouteCardMetaLabel("Diplomatic move", "Lead 1"),
      "Diplomatic move • Lead 1",
    );
    assert.equal(createRouteCardMetaLabel("SafeRoute plan", "Convoy"), null);
    assert.equal(createRouteCardMetaLabel("SafeRoute plan", "Bravo 2"), "Bravo 2");
    assert.equal(createRouteCardMetaLabel("Airport transfer", "Convoy"), "Airport transfer");
    assert.equal(createRouteCardMetaLabel("  Airport   transfer ", " Airport transfer "), "Airport transfer");

    assert.deepEqual(
      createRouteCardPresentation(
        {
          ...baseRoute,
          operation: "SafeRoute plan",
          convoyCallsign: "Convoy",
        },
        false,
      ),
      {
        accessibilityHint: "Opens live map guidance for this route",
        accessibilityLabel:
          "Morning embassy transfer. Ready route. From Hotel to Embassy. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
        actionLabel: "Map",
        endpointLabel: "Hotel → Embassy",
        metaLabel: null,
        statusLabel: "Ready",
        summaryLabel: "18 min · 8.0 km · Low risk",
        testID: "safe-route-card-route-1",
        titleLabel: "Morning embassy transfer",
        updatedLabel: "Today",
      },
    );

    assert.equal(
      createRouteCardPresentation(
        {
          ...baseRoute,
          operation: "SafeRoute plan",
          convoyCallsign: "Bravo 2",
        },
        false,
      ).accessibilityLabel,
      "Morning embassy transfer. Ready route. Convoy Bravo 2. From Hotel to Embassy. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
    );

    assert.equal(
      createRouteCardPresentation(
        {
          ...baseRoute,
          operation: "SafeRoute plan",
          convoyCallsign: "Convoy 12",
        },
        false,
      ).accessibilityLabel,
      "Morning embassy transfer. Ready route. Convoy 12. From Hotel to Embassy. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
    );

    assert.equal(
      createRouteCardPresentation(
        {
          ...baseRoute,
          operation: "Diplomatic move",
          convoyCallsign: "Convoy 12",
        },
        false,
      ).accessibilityLabel,
      "Morning embassy transfer. Ready route. Diplomatic move, Convoy 12. From Hotel to Embassy. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
    );

    assert.equal(
      createRouteCardPresentation(
        {
          ...baseRoute,
          operation: "Airport transfer",
          convoyCallsign: "Airport transfer",
        },
        false,
      ).accessibilityLabel,
      "Morning embassy transfer. Ready route. Airport transfer. From Hotel to Embassy. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
    );
  });

  it("maps supported saved-route statuses to concise visible labels", () => {
    assert.equal(createRouteStatusLabel("ready"), "Ready");
    assert.equal(createRouteStatusLabel("in-progress"), "Live");
    assert.equal(createRouteStatusLabel("planned"), "Planned");
  });

  it("collapses route endpoints into one quiet map-oriented line", () => {
    assert.equal(createRouteCardEndpointLabel(" Hotel ", " Embassy "), "Hotel → Embassy");
    assert.equal(createRouteCardEndpointLabel("Hotel", ""), "Hotel");
    assert.equal(createRouteCardEndpointLabel("", "Embassy"), "Embassy");
    assert.equal(createRouteCardEndpointLabel("", ""), "Route endpoints pending");

    assert.equal(
      createRouteCardPresentation(
        {
          ...baseRoute,
          origin: " City   depot ",
          destination: " Embassy gate ",
        },
        false,
      ).accessibilityLabel,
      "Morning embassy transfer. Ready route. Diplomatic move, convoy Lead 1. From City depot to Embassy gate. 18 min ETA, 8.0 km distance, Low risk. Updated today.",
    );
  });

  it("bounds visible saved-route card copy while preserving full VoiceOver context", () => {
    const routeName =
      "Morning embassy transfer with multiple contingency waypoints and a very long VIP pickup note";
    const operation =
      "Diplomatic relocation corridor with extra staging notes for the field team";
    const convoyCallsign =
      "Lead convoy with a secondary protective detail and recovery vehicle";
    const origin =
      "Northwest logistics staging area beside the old riverside service entrance";
    const destination =
      "Embassy compound south gate reception lane with temporary checkpoint";

    const presentation = createRouteCardPresentation(
      {
        ...baseRoute,
        name: `  ${routeName}  `,
        operation,
        convoyCallsign,
        origin,
        destination,
      },
      false,
    );

    assert.ok(presentation.titleLabel.endsWith("…"));
    assert.ok(presentation.endpointLabel.endsWith("…"));
    assert.ok(presentation.metaLabel?.endsWith("…"));
    assert.ok(presentation.titleLabel.length <= ROUTE_CARD_TITLE_MAX_LENGTH);
    assert.ok(presentation.endpointLabel.length <= ROUTE_CARD_ENDPOINT_MAX_LENGTH);
    assert.ok((presentation.metaLabel?.length || 0) <= ROUTE_CARD_META_MAX_LENGTH);
    assert.match(presentation.accessibilityLabel, new RegExp(routeName));
    assert.match(presentation.accessibilityLabel, new RegExp(origin));
    assert.match(presentation.accessibilityLabel, new RegExp(destination));
  });

  it("falls back to a calm title when a saved-route name is blank", () => {
    assert.equal(
      createRouteCardPresentation({ ...baseRoute, name: "   " }, false)
        .titleLabel,
      "Saved route",
    );
    assert.match(
      createRouteCardPresentation({ ...baseRoute, name: "   " }, false)
        .accessibilityLabel,
      /^Saved route\./,
    );
  });

  it("hides the default ready status pill to keep route cards low-clutter", () => {
    assert.equal(shouldShowRouteStatusPill("ready"), false);
    assert.equal(shouldShowRouteStatusPill("in-progress"), true);
    assert.equal(shouldShowRouteStatusPill("planned"), true);
  });

  it("shortens visible update copy while preserving full accessibility context", () => {
    assert.equal(createRouteUpdatedLabel("Updated today"), "Today");
    assert.equal(createRouteUpdatedLabel(" Last updated 2h ago "), "2h ago");
    assert.equal(createRouteUpdatedLabel("yesterday"), "Yesterday");
    assert.equal(createRouteUpdatedLabel(""), "Updated");
  });

  it("replaces frozen route-update copy with cache-age safety context during offline review", () => {
    const cacheContext =
      "Saved copy is review only. Reconnect and verify workspace access before starting guidance.";
    const presentation = createRouteCardPresentation(
      baseRoute,
      false,
      cacheContext,
    );

    assert.doesNotMatch(presentation.accessibilityLabel, /Updated today/);
    assert.match(presentation.accessibilityLabel, /Saved copy is review only/);
    assert.equal(
      presentation.accessibilityHint,
      "Opens this saved route on the map for review",
    );
  });
});
