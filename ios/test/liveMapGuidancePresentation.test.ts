import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUIDANCE_DISTANCE_MAX_LENGTH,
  GUIDANCE_INSTRUCTION_MAX_LENGTH,
  createGuidanceCardPresentation,
} from "../src/features/live-map/liveMapGuidancePresentation";
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
      distanceLabel: "120 m",
      instructionLabel: "Turn right onto Market Street",
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
      distanceLabel: null,
      instructionLabel: "Continue on saved route",
      metaLabel: "ETA pending · 0 m left",
    });
  });

  it("does not repeat the remaining route distance as a maneuver distance", () => {
    const presentation = createGuidanceCardPresentation({
      guidance: {
        instruction: "Continue on route",
        distance: "13.2 km",
      },
      progress: {
        etaSeconds: 1380,
        remainingDistanceMeters: 13200,
      } as RouteProgressSnapshot,
    });

    assert.equal(presentation.distanceLabel, null);
    assert.equal(presentation.metaLabel, "23 min · 13.2 km left");
  });

  it("bounds hosted guidance chrome while preserving full VoiceOver context", () => {
    const longInstruction =
      "Continue through the north security checkpoint and prepare for a controlled convoy merge after the second barrier";
    const longDistance =
      "Provider reported 420 metres to the next restricted turn corridor";
    const presentation = createGuidanceCardPresentation({
      guidance: {
        instruction: ` ${longInstruction.replace(/ /g, "   ")} `,
        distance: ` ${longDistance.replace(/ /g, "   ")} `,
      },
      progress: {
        etaSeconds: 80,
        remainingDistanceMeters: 987,
      } as RouteProgressSnapshot,
    });

    assert.equal(
      presentation.accessibilityLabel,
      `Current instruction. ${longInstruction}. ETA 1 min. 987 m left. Next maneuver in ${longDistance}.`,
    );
    assert.match(presentation.instructionLabel, /…$/);
    assert.ok(
      presentation.instructionLabel.length <= GUIDANCE_INSTRUCTION_MAX_LENGTH,
    );
    assert.match(presentation.distanceLabel || "", /…$/);
    assert.ok(
      (presentation.distanceLabel || "").length <= GUIDANCE_DISTANCE_MAX_LENGTH,
    );
  });
});
