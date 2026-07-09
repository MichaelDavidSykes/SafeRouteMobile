import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRouteSummaryDemoAction,
  createRouteSummaryDetail,
  createRouteSummaryHeadline,
  createRouteSummaryHeadlineAccessibilityLabel,
  createRouteSummaryLabel,
  createRouteSummaryPrimaryAction,
  createRouteSummaryRemainingMetric,
  createRouteSummarySafetyBadge,
  createRouteSummaryTitle,
  ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH,
  shouldInlineRouteSummaryDemoAction,
  shouldShowRouteSummarySafetyBadge,
  shouldUseCompactRouteSummary,
} from "../src/features/live-map/routeSummaryPresentation";

describe("live route summary presentation", () => {
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

  it("keeps route simulation visible copy short for compact sheets", () => {
    assert.deepEqual(createRouteSummaryDemoAction(false), {
      label: "Simulate",
    });
    assert.deepEqual(createRouteSummaryDemoAction(true), {
      label: "Simulation",
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

  it("keeps route simulation inline only on idle map summaries", () => {
    assert.equal(shouldInlineRouteSummaryDemoAction("loaded"), true);
    assert.equal(shouldInlineRouteSummaryDemoAction("stopped"), true);
    assert.equal(shouldInlineRouteSummaryDemoAction("arrived"), true);
    assert.equal(shouldInlineRouteSummaryDemoAction("navigating"), false);
    assert.equal(shouldInlineRouteSummaryDemoAction("off-route"), false);
    assert.equal(shouldInlineRouteSummaryDemoAction("paused"), false);
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

  it("keeps guest preview detail to the single action-relevant distance", () => {
    assert.deepEqual(
      createRouteSummaryDetail({
        remainingDistance: "4.1 km",
        routeContext: "guest",
        routeDistance: "8.6 km",
        routeIntelCount: 0,
      }),
      {
        accessibilityLabel: "8.6 km route distance.",
        text: "8.6 km",
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
        text: "Guarded",
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
    assert.ok(badge.text.endsWith("…"));
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
        remainingDistance: "3.2 km",
        routeContext: "saved",
        routeDescription: "Uses monitored corridors near the destination.",
        routeDistance: "12 km",
        routeIntelCount: 4,
      }),
      {
        accessibilityLabel:
          "3.2 km remaining. 4 risk notes. Route note: Uses monitored corridors near the destination.",
        text: "3.2 km left · 4 risk notes",
      },
    );
  });
});
