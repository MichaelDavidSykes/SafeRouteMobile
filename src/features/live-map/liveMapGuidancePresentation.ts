import {
  formatDistance,
  formatEta,
  type RouteProgressSnapshot,
} from "./routeProgress";

export interface GuidanceCardPresentation {
  accessibilityLabel: string;
  metaLabel: string;
}

export function createGuidanceCardPresentation({
  guidance,
  progress,
}: {
  guidance: { instruction: string; distance: string };
  progress: RouteProgressSnapshot | null;
}): GuidanceCardPresentation {
  const instruction =
    normalizeGuidanceCopy(guidance.instruction) || "Continue on saved route";
  const etaLabel = formatEta(progress?.etaSeconds);
  const spokenEtaLabel = etaLabel.toLowerCase().startsWith("eta ")
    ? etaLabel
    : `ETA ${etaLabel}`;
  const remainingLabel = formatDistance(progress?.remainingDistanceMeters || 0);
  const maneuverDistance = normalizeGuidanceCopy(guidance.distance);

  return {
    accessibilityLabel: [
      "Current instruction.",
      `${instruction}.`,
      `${spokenEtaLabel}.`,
      `${remainingLabel} left.`,
      maneuverDistance ? `Next maneuver in ${maneuverDistance}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    metaLabel: `${etaLabel} · ${remainingLabel} left`,
  };
}

function normalizeGuidanceCopy(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
