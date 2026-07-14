import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ROUTE_SUMMARY_DETAIL_METRIC_MAX_LENGTH,
  ROUTE_SUMMARY_DISTANCE_FALLBACK,
  ROUTE_SUMMARY_HEADLINE_MAX_LENGTH,
  createRouteSummaryDetail,
  createRouteSummaryHeadline,
  createRouteSummaryHeadlineAccessibilityLabel,
  createRouteSummaryLabel,
  createRouteSummaryPrimaryAction,
  createRouteSummaryRemainingMetric,
  createRouteSummarySafetyBadge,
  createRouteSummaryTitle,
  createSavedRouteContextDetail,
  ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH,
  ROUTE_SUMMARY_VISIBLE_RISK_NOTE_LIMIT,
  shouldShowRouteSummarySafetyBadge,
  shouldUseCompactRouteSummary,
} from "../src/features/live-map/routeSummaryPresentation";

describe("live route summary presentation", () => {
  it("shows the saved web route context needed before starting navigation", () => {
    assert.deepEqual(
      createSavedRouteContextDetail({
        convoyCallsign: "Alpha",
        operation: "Airport transfer",
        routePlanName: "City Airport transfer",
        updatedAtLabel: "Updated 4 min ago",
        waypointCount: 2,
      }),
      {
        accessibilityLabel:
          "City Airport transfer. Operation Airport transfer. Convoy Alpha. 2 stops. Updated 4 min ago.",
        primary: "Airport transfer · Alpha",
        secondary: "2 stops · Updated 4 min ago",
      },
    );
  });

  it("maps navigation lifecycle to the primary route action copy", () => {
    assert.deepEqual(createRouteSummaryPrimaryAction("stopped"), {
      label: "Start",
    });
    assert.deepEqual(createRouteSummaryPrimaryAction("navigating"), {
      label: "Pause",
    });
    assert.deepEqual(createRouteSummaryPrimaryAction("off-route"), {
      label: "Pause",
    });
    assert.deepEqual(createRouteSummaryPrimaryAction("paused"), {
      label: "Resume",
    });
    assert.deepEqual(createRouteSummaryPrimaryAction("arrived"), {
      label: "Arrived",
    });
  });

  it("keeps blocked route actions concise for compact map sheets", () => {
    assert.deepEqual(
      createRouteSummaryPrimaryAction(
        "loaded",
        "Waiting for a live location fix before guidance can start.",
      ),
      {
        label: "Location needed",
      },
    );
    assert.deepEqual(
      createRouteSummaryPrimaryAction(
        "loaded",
        "Checking foreground location access before live guidance can start.",
      ),
      {
        label: "Checking location",
      },
    );
    assert.deepEqual(
      createRouteSummaryPrimaryAction(
        "loaded",
        "Checking workspace access before starting guidance…",
      ),
      {
        label: "Checking access",
      },
    );
    assert.deepEqual(
      createRouteSummaryPrimaryAction(
        "loaded",
        "Workspace access could not be verified. Reconnect and try again.",
      ),
      {
        label: "Retry access",
      },
    );
    assert.deepEqual(
      createRouteSummaryPrimaryAction(
        "loaded",
        "Saved route geometry is incomplete. Re-sync the route before live guidance.",
      ),
      {
        label: "Re-sync route",
      },
    );
  });

  it("keeps live route sheet titles concise for small iPhone overlays", () => {
    assert.equal(createRouteSummaryTitle("loaded"), "Saved route");
    assert.equal(createRouteSummaryTitle("stopped"), "Stopped");
    assert.equal(createRouteSummaryTitle("navigating"), "Guidance");
    assert.equal(createRouteSummaryTitle("off-route"), "Off route");
    assert.equal(createRouteSummaryTitle("paused"), "Paused");
    assert.equal(createRouteSummaryTitle("arrived"), "Complete");
    assert.equal(
      createRouteSummaryLabel({
        routeContext: "guest",
        state: "navigating",
      }),
      "Preview",
    );
    assert.equal(
      createRouteSummaryLabel({
        routeContext: "saved",
        state: "paused",
      }),
      "Paused",
    );
  });

  it("compacts the bottom summary while guidance is active", () => {
    assert.equal(shouldUseCompactRouteSummary("loaded"), false);
    assert.equal(shouldUseCompactRouteSummary("stopped"), false);
    assert.equal(shouldUseCompactRouteSummary("arrived"), false);
    assert.equal(shouldUseCompactRouteSummary("paused"), true);
    assert.equal(shouldUseCompactRouteSummary("navigating"), true);
    assert.equal(shouldUseCompactRouteSummary("off-route"), true);
  });

  it("keeps summary state available to VoiceOver without visible label chrome", () => {
    assert.equal(
      createRouteSummaryHeadlineAccessibilityLabel({
        headline: "14 min",
        routeContext: "saved",
        state: "loaded",
      }),
      "Saved route. 14 min.",
    );
    assert.equal(
      createRouteSummaryHeadlineAccessibilityLabel({
        headline: "  12 min ",
        routeContext: "saved",
        state: "navigating",
      }),
      "Guidance. 12 min.",
    );
    assert.equal(
      createRouteSummaryHeadlineAccessibilityLabel({
        headline: "",
        routeContext: "guest",
        state: "navigating",
      }),
      "Preview",
    );
  });

  it("keeps route summary headline VoiceOver sentences punctuation-aware", () => {
    assert.equal(
      createRouteSummaryHeadlineAccessibilityLabel({
        headline: "Checkpoint hold ready!",
        routeContext: "saved",
        state: "loaded",
      }),
      "Saved route. Checkpoint hold ready!",
    );

    assert.equal(
      createRouteSummaryHeadlineAccessibilityLabel({
        headline: "Provider ETA locked…",
        routeContext: "guest",
        state: "navigating",
      }),
      "Preview. Provider ETA locked…",
    );
  });

  it("normalizes the visible route summary headline before falling back to state copy", () => {
    assert.deepEqual(
      createRouteSummaryHeadline({
        headline: "  14   min ",
        routeContext: "saved",
        state: "loaded",
      }),
      {
        accessibilityLabel: "Saved route. 14 min.",
        text: "14 min",
      },
    );

    assert.deepEqual(
      createRouteSummaryHeadline({
        headline: "  ",
        routeContext: "guest",
        state: "navigating",
      }),
      {
        accessibilityLabel: "Preview",
        text: "Preview",
      },
    );

    assert.deepEqual(
      createRouteSummaryHeadline({
        headline: "",
        routeContext: "saved",
        state: "paused",
      }),
      {
        accessibilityLabel: "Paused",
        text: "Paused",
      },
    );
  });

  it("bounds long route summary headlines while preserving full VoiceOver context", () => {
    const hostedHeadline =
      "Provider ETA delayed by checkpoint holding pattern near the river crossing";
    const headline = createRouteSummaryHeadline({
      headline: `  ${hostedHeadline.replace(/ /g, "   ")}  `,
      routeContext: "saved",
      state: "loaded",
    });

    assert.equal(
      headline.accessibilityLabel,
      `Saved route. ${hostedHeadline}.`,
    );
    assert.ok(headline.text.endsWith("…"));
    assert.ok(headline.text.length <= ROUTE_SUMMARY_HEADLINE_MAX_LENGTH);
  });

  it("keeps guest live-map previews free of duplicate explanatory chrome", () => {
    assert.equal(shouldShowRouteSummarySafetyBadge("guest"), false);
    assert.equal(shouldShowRouteSummarySafetyBadge("saved"), true);
  });

  it("keeps compact active guidance remaining context to one quiet line", () => {
    assert.deepEqual(createRouteSummaryRemainingMetric("  4.1   km "), {
      accessibilityLabel: "4.1 km remaining.",
      text: "4.1 km left",
    });
    assert.equal(createRouteSummaryRemainingMetric("   "), null);
    assert.equal(createRouteSummaryRemainingMetric(null), null);
  });

  it("bounds visible route summary distance metrics while preserving VoiceOver detail", () => {
    const hostedRemainingDistance =
      "Provider reported 4.123 kilometres remaining via convoy telemetry";
    const hostedRouteDistance =
      "Provider reported 12.876 kilometres total along the protected corridor";

    const remainingMetric = createRouteSummaryRemainingMetric(
      `  ${hostedRemainingDistance.replace(/ /g, "   ")}  `,
    );
    assert.ok(remainingMetric);
    assert.equal(remainingMetric.accessibilityLabel, `${hostedRemainingDistance} remaining.`);
    assert.ok(remainingMetric.text.startsWith("Provider reported 4.12"));
    assert.match(remainingMetric.text, /… left$/);
    assert.ok(
      remainingMetric.text.length <= ROUTE_SUMMARY_DETAIL_METRIC_MAX_LENGTH + " left".length,
    );

    const guestDetail = createRouteSummaryDetail({
      remainingDistance: null,
      routeContext: "guest",
      routeDistance: ` ${hostedRouteDistance.replace(/ /g, "   ")} `,
      routeIntelCount: 0,
    });
    assert.equal(
      guestDetail.accessibilityLabel,
      `${hostedRouteDistance} route distance.`,
    );
    assert.match(guestDetail.text, /…$/);
    assert.ok(guestDetail.text.length <= ROUTE_SUMMARY_DETAIL_METRIC_MAX_LENGTH);

    const savedDetail = createRouteSummaryDetail({
      remainingDistance: ` ${hostedRemainingDistance} `,
      routeContext: "saved",
      routeDescription: "Uses monitored corridors near the destination.",
      routeDistance: ` ${hostedRouteDistance} `,
      routeIntelCount: 3,
    });
    assert.equal(
      savedDetail.accessibilityLabel,
      `${hostedRemainingDistance} remaining. 3 risk notes. Route note: Uses monitored corridors near the destination.`,
    );
    assert.match(savedDetail.text, /… left · 3 risk notes$/);
    assert.ok(savedDetail.text.includes("Provider reported"));
    assert.ok(savedDetail.text.length < savedDetail.accessibilityLabel.length);
  });

  it("keeps guest preview detail to the single action-relevant distance", () => {
    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: "4.1 km",
        routeContext: "guest",
        routeDistance: " 8.6   km ",
        routeIntelCount: 0,
      }),
      {
        accessibilityLabel: "8.6 km route distance.",
        text: "8.6 km",
      },
    );

    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: "4.1 km",
        routeContext: "guest",
        routeDistance: "  ",
        routeIntelCount: 0,
      }),
      {
        accessibilityLabel: "Route distance unavailable.",
        text: ROUTE_SUMMARY_DISTANCE_FALLBACK,
      },
    );
  });

  it("uses risk-led safety badges while preserving score context for VoiceOver", () => {
    assert.deepEqual(
      createRouteSummarySafetyBadge({
        routeRiskLabel: " Guarded ",
        safeScore: 42,
      }),
      {
        accessibilityLabel: "Guarded risk. SafeRoute score 42.",
        text: "Guarded risk",
      },
    );

    assert.deepEqual(
      createRouteSummarySafetyBadge({
        routeRiskLabel: "High risk",
        safeScore: 72,
      }),
      {
        accessibilityLabel: "High risk. SafeRoute score 72.",
        text: "High risk",
      },
    );

    assert.deepEqual(
      createRouteSummarySafetyBadge({
        routeRiskLabel: " ",
        safeScore: 0,
      }),
      {
        accessibilityLabel: "Route risk. SafeRoute score 0.",
        text: "Risk",
      },
    );
  });

  it("keeps safety badge VoiceOver sentences punctuation-aware", () => {
    assert.deepEqual(
      createRouteSummarySafetyBadge({
        routeRiskLabel: "High risk!",
        safeScore: 72,
      }),
      {
        accessibilityLabel: "High risk! SafeRoute score 72.",
        text: "High risk!",
      },
    );

    assert.deepEqual(
      createRouteSummarySafetyBadge({
        routeRiskLabel: "Elevated risk…",
        safeScore: 81,
      }),
      {
        accessibilityLabel: "Elevated risk… SafeRoute score 81.",
        text: "Elevated risk…",
      },
    );
  });

  it("bounds long safety badge text while keeping full risk context accessible", () => {
    const riskLabel =
      "Elevated security posture near the destination checkpoint";
    const badge = createRouteSummarySafetyBadge({
      routeRiskLabel: `  ${riskLabel.replace(/ /g, "   ")}  `,
      safeScore: 81,
    });

    assert.equal(
      badge.accessibilityLabel,
      `${riskLabel} risk. SafeRoute score 81.`,
    );
    assert.match(badge.text, /… risk$/);
    assert.ok(badge.text.length <= ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH);
  });

  it("keeps saved-route sheet detail inline while risk lives in the badge", () => {
    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: null,
        routeContext: "saved",
        routeDistance: "12 km",
        routeIntelCount: 0,
      }),
      {
        accessibilityLabel: "12 km route distance.",
        text: "12 km",
      },
    );

    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: "",
        routeContext: "saved",
        routeDescription: " ",
        routeDistance: " ",
        routeIntelCount: 2,
      }),
      {
        accessibilityLabel: "Route distance unavailable. 2 risk notes.",
        text: `${ROUTE_SUMMARY_DISTANCE_FALLBACK} · 2 risk notes`,
      },
    );

    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: " 3.2   km ",
        routeContext: "saved",
        routeDescription: "Uses monitored corridors near the destination.",
        routeDistance: " 12   km ",
        routeIntelCount: 4,
      }),
      {
        accessibilityLabel:
          "3.2 km remaining. 4 risk notes. Route note: Uses monitored corridors near the destination.",
        text: "3.2 km left · 4 risk notes",
      },
    );
  });

  it("caps visible risk note counts while preserving exact VoiceOver context", () => {
    const detail = createRouteSummaryDetail({
      remainingDistance: null,
      routeContext: "saved",
      routeDistance: "14 km",
      routeIntelCount: ROUTE_SUMMARY_VISIBLE_RISK_NOTE_LIMIT + 7,
    });

    assert.deepEqual(detail, {
      accessibilityLabel: `14 km route distance. ${
        ROUTE_SUMMARY_VISIBLE_RISK_NOTE_LIMIT + 7
      } risk notes.`,
      text: `14 km · ${ROUTE_SUMMARY_VISIBLE_RISK_NOTE_LIMIT}+ risk notes`,
    });

    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: null,
        routeContext: "saved",
        routeDistance: "14 km",
        routeIntelCount: 1,
      }),
      {
        accessibilityLabel: "14 km route distance. 1 risk note.",
        text: "14 km · 1 risk note",
      },
    );

    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: null,
        routeContext: "saved",
        routeDistance: "14 km",
        routeIntelCount: Number.NaN,
      }),
      {
        accessibilityLabel: "14 km route distance.",
        text: "14 km",
      },
    );
  });
});
