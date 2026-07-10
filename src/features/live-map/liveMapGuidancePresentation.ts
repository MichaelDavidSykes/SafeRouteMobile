import {
  formatDistance,
  formatEta,
  type RouteProgressSnapshot,
} from "./routeProgress";
import type { RouteRiskAdvisory } from "./liveRouteRiskAdvisory";

export interface GuidanceCardPresentation {
  accessibilityLabel: string;
  distanceLabel: string | null;
  instructionLabel: string;
  metaLabel: string;
  riskAdvisory?: RouteRiskAdvisory | null;
}

export const GUIDANCE_INSTRUCTION_MAX_LENGTH = 72;
export const GUIDANCE_DISTANCE_MAX_LENGTH = 24;

export function createGuidanceCardPresentation({
  guidance,
  progress,
  riskAdvisory,
}: {
  guidance: { instruction: string; distance: string };
  progress: RouteProgressSnapshot | null;
  riskAdvisory?: RouteRiskAdvisory | null;
}): GuidanceCardPresentation {
  const instructionAccessibilityLabel =
    normalizeGuidanceCopy(guidance.instruction) || "Continue on saved route";
  const etaLabel = formatEta(progress?.etaSeconds);
  const spokenEtaLabel = etaLabel.toLowerCase().startsWith("eta ")
    ? etaLabel
    : `ETA ${etaLabel}`;
  const remainingLabel = formatDistance(progress?.remainingDistanceMeters || 0);
  const maneuverDistanceAccessibilityLabel = normalizeGuidanceCopy(
    guidance.distance,
  );
  const shouldShowManeuverDistance = Boolean(
    maneuverDistanceAccessibilityLabel &&
      maneuverDistanceAccessibilityLabel.toLowerCase() !==
        remainingLabel.toLowerCase(),
  );

  const presentation: GuidanceCardPresentation = {
    distanceLabel: shouldShowManeuverDistance
      ? createCompactGuidanceLabel(
          maneuverDistanceAccessibilityLabel!,
          GUIDANCE_DISTANCE_MAX_LENGTH,
        )
      : null,
    instructionLabel: createCompactGuidanceLabel(
      instructionAccessibilityLabel,
      GUIDANCE_INSTRUCTION_MAX_LENGTH,
    ),
    accessibilityLabel: [
      "Current instruction.",
      `${instructionAccessibilityLabel}.`,
      `${spokenEtaLabel}.`,
      `${remainingLabel} left.`,
      maneuverDistanceAccessibilityLabel
        ? `Next maneuver in ${maneuverDistanceAccessibilityLabel}.`
        : "",
      riskAdvisory?.accessibilityLabel,
    ]
      .filter(Boolean)
      .join(" "),
    metaLabel: `${etaLabel} · ${remainingLabel} left`,
  };

  if (riskAdvisory) {
    presentation.riskAdvisory = riskAdvisory;
  }

  return presentation;
}

function normalizeGuidanceCopy(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createCompactGuidanceLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
