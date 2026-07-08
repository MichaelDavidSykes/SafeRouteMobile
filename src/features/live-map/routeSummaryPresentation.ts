import type { NavigationLifecycle } from "./liveMapUiState";

export type RouteSummaryContext = "guest" | "saved";

export type RouteSummaryPrimaryAction = {
  label: string;
};

export type RouteSummaryDemoAction = {
  label: string;
};

export type RouteSummaryDetail = {
  accessibilityLabel: string;
  text: string;
};

export type RouteSummarySafetyBadge = {
  accessibilityLabel: string;
  text: string;
};

export function createRouteSummaryPrimaryAction(
  state: NavigationLifecycle,
  disabledReason?: string | null,
): RouteSummaryPrimaryAction {
  const blockedLabel = createBlockedRouteActionLabel(disabledReason);
  if (blockedLabel) {
    return { label: blockedLabel };
  }

  if (state === "navigating" || state === "off-route") {
    return { label: "Pause" };
  }

  if (state === "paused") {
    return { label: "Resume" };
  }

  if (state === "arrived") {
    return { label: "Arrived" };
  }

  return { label: "Start" };
}

export function createRouteSummaryDemoAction(
  enabled: boolean,
): RouteSummaryDemoAction {
  return {
    label: enabled ? "Simulation" : "Simulate",
  };
}

function createBlockedRouteActionLabel(
  disabledReason?: string | null,
): string | null {
  const reason = disabledReason?.trim().toLowerCase();
  if (!reason) {
    return null;
  }

  if (reason.includes("checking")) {
    return "Checking location";
  }

  if (reason.includes("geometry") || reason.includes("re-sync")) {
    return "Re-sync route";
  }

  if (reason.includes("location")) {
    return "Location needed";
  }

  return "Unavailable";
}

export function createRouteSummaryTitle(state: NavigationLifecycle): string {
  if (state === "arrived") {
    return "Complete";
  }

  if (state === "off-route") {
    return "Off route";
  }

  if (state === "paused") {
    return "Paused";
  }

  if (state === "stopped") {
    return "Stopped";
  }

  if (state === "navigating") {
    return "Guidance";
  }

  return "Saved route";
}

export function createRouteSummaryLabel({
  routeContext,
  state,
}: {
  routeContext: RouteSummaryContext;
  state: NavigationLifecycle;
}): string {
  if (routeContext === "guest") {
    return "Preview";
  }

  return createRouteSummaryTitle(state);
}

export function createRouteSummaryHeadlineAccessibilityLabel({
  headline,
  routeContext,
  state,
}: {
  headline: string;
  routeContext: RouteSummaryContext;
  state: NavigationLifecycle;
}): string {
  const summaryLabel = createRouteSummaryLabel({ routeContext, state });
  const trimmedHeadline = headline.trim().replace(/\s+/g, " ");

  return trimmedHeadline
    ? `${summaryLabel}. ${trimmedHeadline}.`
    : summaryLabel;
}

export function shouldShowRouteSummarySafetyBadge(
  routeContext: RouteSummaryContext,
): boolean {
  return routeContext === "saved";
}

export function createRouteSummarySafetyBadge({
  routeRiskLabel,
  safeScore,
}: {
  routeRiskLabel: string;
  safeScore: number;
}): RouteSummarySafetyBadge {
  const riskLabel = routeRiskLabel.trim() || "Risk";
  const spokenRiskLabel = riskLabel === "Risk" ? "Route risk" : `${riskLabel} risk`;

  return {
    accessibilityLabel: `${spokenRiskLabel}. SafeRoute score ${safeScore}.`,
    text: riskLabel,
  };
}

export function shouldUseCompactRouteSummary(
  state: NavigationLifecycle,
): boolean {
  return state === "navigating" || state === "off-route" || state === "paused";
}

export function shouldInlineRouteSummaryDemoAction(
  state: NavigationLifecycle,
): boolean {
  return !shouldUseCompactRouteSummary(state);
}

export function createRouteSummaryDetail({
  remainingDistance,
  routeContext,
  routeDistance,
  routeDescription,
  routeIntelCount,
}: {
  remainingDistance?: string | null;
  routeContext: RouteSummaryContext;
  routeDescription?: string | null;
  routeDistance: string;
  routeIntelCount: number;
}): RouteSummaryDetail {
  if (routeContext === "guest") {
    return {
      accessibilityLabel: `${routeDistance} route distance.`,
      text: routeDistance,
    };
  }

  const distanceText = remainingDistance ? `${remainingDistance} left` : routeDistance;
  const distanceAccessibilityLabel = remainingDistance
    ? `${remainingDistance} remaining.`
    : `${routeDistance} route distance.`;
  const riskNoteText = createRouteRiskNoteText(routeIntelCount);
  const routeNote = createRouteNoteAccessibilityText(routeDescription);
  const detailAccessibilityLabel = riskNoteText
    ? `${distanceAccessibilityLabel} ${riskNoteText}.`
    : distanceAccessibilityLabel;

  return {
    accessibilityLabel: routeNote
      ? `${detailAccessibilityLabel} ${routeNote}`
      : detailAccessibilityLabel,
    text: riskNoteText ? `${distanceText} · ${riskNoteText}` : distanceText,
  };
}

function createRouteRiskNoteText(routeIntelCount: number): string | null {
  if (routeIntelCount <= 0) {
    return null;
  }

  return `${routeIntelCount} risk ${routeIntelCount === 1 ? "note" : "notes"}`;
}

function createRouteNoteAccessibilityText(routeDescription?: string | null): string | null {
  const note = routeDescription?.trim().replace(/\s+/g, " ");
  if (!note) {
    return null;
  }

  return `Route note: ${note}${/[.!?]$/.test(note) ? "" : "."}`;
}
