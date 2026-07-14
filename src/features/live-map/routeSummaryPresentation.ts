import type { NavigationLifecycle } from "./liveMapUiState";

export type RouteSummaryContext = "guest" | "saved";

export const ROUTE_SUMMARY_DISTANCE_FALLBACK = "Distance unavailable";
export const ROUTE_SUMMARY_HEADLINE_MAX_LENGTH = 24;
export const ROUTE_SUMMARY_DETAIL_METRIC_MAX_LENGTH = 24;
export const ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH = 18;
export const ROUTE_SUMMARY_VISIBLE_RISK_NOTE_LIMIT = 9;

export type RouteSummaryPrimaryAction = {
  label: string;
};

export type RouteSummaryDetail = {
  accessibilityLabel: string;
  text: string;
};

export type RouteSummaryHeadline = {
  accessibilityLabel: string;
  text: string;
};

export type RouteSummaryRemainingMetric = {
  accessibilityLabel: string;
  text: string;
};

type RouteSummaryRiskNote = {
  accessibilityLabel: string;
  text: string;
};

export type RouteSummarySafetyBadge = {
  accessibilityLabel: string;
  text: string;
};

export type SavedRouteContextDetail = {
  accessibilityLabel: string;
  primary: string;
  secondary: string;
};

export function createSavedRouteContextDetail({
  convoyCallsign,
  operation,
  routePlanName,
  updatedAtLabel,
  waypointCount,
}: {
  convoyCallsign: string;
  operation: string;
  routePlanName: string;
  updatedAtLabel: string;
  waypointCount: number;
}): SavedRouteContextDetail {
  const normalizedOperation = normalizeInlineCopy(operation) || "SafeRoute plan";
  const normalizedConvoy = normalizeInlineCopy(convoyCallsign) || "Convoy";
  const normalizedUpdated = normalizeInlineCopy(updatedAtLabel) || "Update time unavailable";
  const stopCount = Math.max(0, Math.floor(waypointCount));
  const stops = `${stopCount} stop${stopCount === 1 ? "" : "s"}`;
  const name = normalizeInlineCopy(routePlanName) || "Saved route";
  return {
    accessibilityLabel: `${name}. Operation ${normalizedOperation}. Convoy ${normalizedConvoy}. ${stops}. ${normalizedUpdated}.`,
    primary: `${normalizedOperation} · ${normalizedConvoy}`,
    secondary: `${stops} · ${normalizedUpdated}`,
  };
}

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

function createBlockedRouteActionLabel(
  disabledReason?: string | null,
): string | null {
  const reason = disabledReason?.trim().toLowerCase();
  if (!reason) {
    return null;
  }

  const workspaceAccessReason =
    reason.includes("workspace access") ||
    reason.includes("access could not be verified");
  if (workspaceAccessReason && reason.includes("checking")) {
    return "Checking access";
  }

  if (
    workspaceAccessReason &&
    (reason.includes("reconnect") || reason.includes("verified"))
  ) {
    return "Retry access";
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
  return createRouteSummaryHeadline({
    headline,
    routeContext,
    state,
  }).accessibilityLabel;
}

export function createRouteSummaryHeadline({
  headline,
  routeContext,
  state,
}: {
  headline: string;
  routeContext: RouteSummaryContext;
  state: NavigationLifecycle;
}): RouteSummaryHeadline {
  const summaryLabel = createRouteSummaryLabel({ routeContext, state });
  const normalizedHeadline = normalizeInlineCopy(headline);

  return {
    accessibilityLabel: normalizedHeadline
      ? `${createRouteSummaryAccessibilitySentence(
          summaryLabel,
        )} ${createRouteSummaryAccessibilitySentence(normalizedHeadline)}`
      : summaryLabel,
    text: normalizedHeadline
      ? createCompactInlineLabel(
          normalizedHeadline,
          ROUTE_SUMMARY_HEADLINE_MAX_LENGTH,
        )
      : summaryLabel,
  };
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
  const riskLabel = normalizeInlineCopy(routeRiskLabel) || "Risk";
  const spokenRiskLabel = createSafetyBadgeSpokenRiskLabel(riskLabel);

  return {
    accessibilityLabel: `${createRouteSummaryAccessibilitySentence(
      spokenRiskLabel,
    )} SafeRoute score ${safeScore}.`,
    text: createRouteSummaryVisibleRiskLabel(riskLabel),
  };
}

export function shouldUseCompactRouteSummary(
  state: NavigationLifecycle,
): boolean {
  return state === "navigating" || state === "off-route" || state === "paused";
}

export function createRouteSummaryRemainingMetric(
  remainingDistance?: string | null,
): RouteSummaryRemainingMetric | null {
  const distance = normalizeInlineCopy(remainingDistance);
  if (!distance) {
    return null;
  }

  return {
    accessibilityLabel: `${distance} remaining.`,
    text: `${createRouteSummaryVisibleDistanceLabel(distance)} left`,
  };
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
  const routeDistanceLabel =
    normalizeInlineCopy(routeDistance) || ROUTE_SUMMARY_DISTANCE_FALLBACK;
  const remainingDistanceLabel = normalizeInlineCopy(remainingDistance);

  if (routeContext === "guest") {
    return {
      accessibilityLabel: createRouteDistanceAccessibilityLabel(routeDistanceLabel),
      text: createRouteSummaryVisibleDistanceLabel(routeDistanceLabel),
    };
  }

  const distanceText = remainingDistanceLabel
    ? `${createRouteSummaryVisibleDistanceLabel(remainingDistanceLabel)} left`
    : createRouteSummaryVisibleDistanceLabel(routeDistanceLabel);
  const distanceAccessibilityLabel = remainingDistanceLabel
    ? `${remainingDistanceLabel} remaining.`
    : createRouteDistanceAccessibilityLabel(routeDistanceLabel);
  const riskNote = createRouteRiskNotePresentation(routeIntelCount);
  const routeNote = createRouteNoteAccessibilityText(routeDescription);
  const detailAccessibilityLabel = riskNote
    ? `${distanceAccessibilityLabel} ${riskNote.accessibilityLabel}.`
    : distanceAccessibilityLabel;

  return {
    accessibilityLabel: routeNote
      ? `${detailAccessibilityLabel} ${routeNote}`
      : detailAccessibilityLabel,
    text: riskNote ? `${distanceText} · ${riskNote.text}` : distanceText,
  };
}

function normalizeInlineCopy(value?: string | null): string {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function createRouteSummaryAccessibilitySentence(label: string): string {
  return /[.!?…]$/.test(label) ? label : `${label}.`;
}

function createRouteDistanceAccessibilityLabel(routeDistanceLabel: string): string {
  return routeDistanceLabel === ROUTE_SUMMARY_DISTANCE_FALLBACK
    ? "Route distance unavailable."
    : `${routeDistanceLabel} route distance.`;
}

function createSafetyBadgeSpokenRiskLabel(riskLabel: string): string {
  if (riskLabel === "Risk") {
    return "Route risk";
  }

  if (/\brisk\b/i.test(riskLabel)) {
    return riskLabel;
  }

  return `${riskLabel} risk`;
}

function createRouteSummaryVisibleRiskLabel(riskLabel: string): string {
  if (riskLabel === "Risk") {
    return riskLabel;
  }

  if (/\brisk\b/i.test(riskLabel)) {
    return createCompactInlineLabel(
      riskLabel,
      ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH,
    );
  }

  const riskSuffix = " risk";
  const compactRiskLabel = createCompactInlineLabel(
    riskLabel,
    ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH - riskSuffix.length,
  );

  return `${compactRiskLabel}${riskSuffix}`;
}

function createRouteSummaryVisibleDistanceLabel(label: string): string {
  return createCompactInlineLabel(label, ROUTE_SUMMARY_DETAIL_METRIC_MAX_LENGTH);
}

function createCompactInlineLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function createRouteRiskNotePresentation(
  routeIntelCount: number,
): RouteSummaryRiskNote | null {
  if (!Number.isFinite(routeIntelCount) || routeIntelCount <= 0) {
    return null;
  }

  const noteCount = Math.floor(routeIntelCount);
  if (noteCount <= 0) {
    return null;
  }

  const accessibilityNoteLabel = createRouteRiskNoteLabel(noteCount);
  const visibleNoteCount =
    noteCount > ROUTE_SUMMARY_VISIBLE_RISK_NOTE_LIMIT
      ? `${ROUTE_SUMMARY_VISIBLE_RISK_NOTE_LIMIT}+`
      : `${noteCount}`;

  return {
    accessibilityLabel: accessibilityNoteLabel,
    text: createRouteRiskNoteLabel(visibleNoteCount),
  };
}

function createRouteRiskNoteLabel(count: number | string): string {
  return `${count} risk ${count === 1 || count === "1" ? "note" : "notes"}`;
}

function createRouteNoteAccessibilityText(routeDescription?: string | null): string | null {
  const note = routeDescription?.trim().replace(/\s+/g, " ");
  if (!note) {
    return null;
  }

  return `Route note: ${note}${/[.!?]$/.test(note) ? "" : "."}`;
}
