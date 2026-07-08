import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGuidanceCardPresentation } from "../src/features/live-map/liveMapGuidancePresentation";
import type { RouteProgressSnapshot } from "../src/features/live-map/routeProgress";

describe("live map guidance card presentation", () => {
  it("uses one quiet ETA and distance line while preserving VoiceOver context", () => {
    const presentation = createGuidanceCardPresentation({
      guidance: {
        instruction: "  Turn right onto Market Street  ",
        distance: "  120 m  ",
      },
      progress: {
        etaSeconds: 245,
        remainingDistanceMeters: 1234,
      } as RouteProgressSnapshot,
    });

    assert.deepEqual(presentation, {
      accessibilityLabel:
        "Current instruction. Turn right onto Market Street. ETA 4 min. 1.2 km left. Next maneuver in 120 m.",
      metaLabel: "4 min · 1.2 km left",
    });
  });

  it("falls back cleanly when progress or instruction copy is unavailable", () => {
    const presentation = createGuidanceCardPresentation({
      guidance: {
        instruction: "   ",
        distance: " ",
      },
      progress: null,
    });

    assert.deepEqual(presentation, {
      accessibilityLabel:
        "Current instruction. Continue on saved route. ETA pending. 0 m left.",
      metaLabel: "ETA pending · 0 m left",
    });
  });
});
