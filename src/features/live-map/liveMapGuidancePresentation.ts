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

export function createGuidanceCardPresentation({
  guidance,
  progress,
  riskAdvisory,
}: {
  guidance: { instruction: string; distance: string };
  progress: RouteProgressSnapshot | null;
  riskAdvisory?: RouteRiskAdvisory | null;
}): GuidanceCardPresentation {
  const instruction =
    normalizeGuidanceCopy(guidance.instruction) || "Continue on saved route";
  const etaLabel = formatEta(progress?.etaSeconds);
  const spokenEtaLabel = etaLabel.toLowerCase().startsWith("eta ")
    ? etaLabel
    : `ETA ${etaLabel}`;
  const remainingLabel = formatDistance(progress?.remainingDistanceMeters || 0);
  const maneuverDistance = normalizeGuidanceCopy(guidance.distance);

  const presentation: GuidanceCardPresentation = {
    distanceLabel: maneuverDistance || null,
    instructionLabel: instruction,
    accessibilityLabel: [
      "Current instruction.",
      `${instruction}.`,
      `${spokenEtaLabel}.`,
      `${remainingLabel} left.`,
      maneuverDistance ? `Next maneuver in ${maneuverDistance}.` : "",
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
