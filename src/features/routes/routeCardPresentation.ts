import type {
  SavedRouteStatus,
  SavedSafeRoutePlan,
} from "../live-map/liveMapTypes";
import { uiTestIds } from "../../testing/uiTestIds";

export type RouteCardPresentation = {
  accessibilityHint: string;
  accessibilityLabel: string;
  actionLabel: string;
  endpointLabel: string;
  metaLabel: string | null;
  statusLabel: string;
  summaryLabel: string;
  testID: string;
  titleLabel: string;
  updatedLabel: string;
};

export const ROUTE_CARD_TITLE_MAX_LENGTH = 72;
export const ROUTE_CARD_ENDPOINT_MAX_LENGTH = 80;
export const ROUTE_CARD_META_MAX_LENGTH = 64;
export const ROUTE_CARD_SUMMARY_METRIC_MAX_LENGTH = 24;
export const ROUTE_CARD_RISK_MAX_LENGTH = 28;

export function createRouteCardPresentation(
  route: SavedSafeRoutePlan,
  loading: boolean,
): RouteCardPresentation {
  const statusLabel = createRouteStatusLabel(route.status);
  const routeName = normalizeRouteCardMetaValue(route.name) || "Saved route";
  const metaLabel = createRouteCardMetaLabel(
    route.operation,
    route.convoyCallsign,
  );
  const routeSummary = createRouteCardAccessibilitySummary(route);
  const updatedAccessibilityLabel = normalizeRouteUpdatedLabel(
    route.updatedAtLabel,
  );

  return {
    accessibilityHint: loading
      ? "Live map is opening"
      : "Opens live map guidance for this route",
    accessibilityLabel: createRouteCardAccessibilityLabel([
      routeName,
      `${statusLabel} route`,
      createRouteCardMetaAccessibilityLabel(
        route.operation,
        route.convoyCallsign,
      ),
      createRouteCardEndpointAccessibilityLabel(route.origin, route.destination),
      routeSummary,
      updatedAccessibilityLabel,
    ]),
    actionLabel: loading ? "Opening" : "Map",
    endpointLabel: createRouteCardEndpointLabel(route.origin, route.destination),
    metaLabel,
    statusLabel,
    summaryLabel: createRouteCardSummaryLabel(route),
    testID: createRouteCardTestID(route.id),
    titleLabel: createCompactRouteCardLabel(
      routeName,
      ROUTE_CARD_TITLE_MAX_LENGTH,
    ),
    updatedLabel: createRouteUpdatedLabel(route.updatedAtLabel),
  };
}

export function createRouteCardTestID(routeId: string): string {
  return uiTestIds.savedRouteCard(routeId);
}

export function createRouteCardSummaryLabel(
  route: SavedSafeRoutePlan,
): string {
  return [
    createRouteCardVisibleMetricLabel(route.route.eta),
    createRouteCardVisibleMetricLabel(route.route.distance),
    createRouteCardVisibleRiskSummaryLabel(route.route.riskLabel),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function createRouteCardEndpointLabel(
  origin: string,
  destination: string,
): string {
  const normalizedOrigin = normalizeRouteCardMetaValue(origin);
  const normalizedDestination = normalizeRouteCardMetaValue(destination);

  if (normalizedOrigin && normalizedDestination) {
    return createCompactRouteCardLabel(
      `${normalizedOrigin} → ${normalizedDestination}`,
      ROUTE_CARD_ENDPOINT_MAX_LENGTH,
    );
  }

  return createCompactRouteCardLabel(
    normalizedOrigin || normalizedDestination || "Route endpoints pending",
    ROUTE_CARD_ENDPOINT_MAX_LENGTH,
  );
}

function createRouteCardEndpointAccessibilityLabel(
  origin: string,
  destination: string,
): string {
  const normalizedOrigin = normalizeRouteCardMetaValue(origin);
  const normalizedDestination = normalizeRouteCardMetaValue(destination);

  if (normalizedOrigin && normalizedDestination) {
    return `From ${normalizedOrigin} to ${normalizedDestination}`;
  }

  if (normalizedOrigin) {
    return `Starts at ${normalizedOrigin}`;
  }

  if (normalizedDestination) {
    return `Ends at ${normalizedDestination}`;
  }

  return "Route endpoints pending";
}

function createRouteCardAccessibilitySummary(
  route: SavedSafeRoutePlan,
): string {
  const eta = normalizeRouteCardMetaValue(route.route.eta);
  const distance = normalizeRouteCardMetaValue(route.route.distance);
  const riskLabel = createRouteCardRiskSummaryLabel(route.route.riskLabel);

  return [
    eta ? `${eta} ETA` : null,
    distance ? `${distance} distance` : null,
    riskLabel,
  ]
    .filter(Boolean)
    .join(", ");
}

function createRouteCardVisibleMetricLabel(value: string): string {
  const normalizedValue = normalizeRouteCardMetaValue(value);

  return normalizedValue
    ? createCompactRouteCardLabel(
        normalizedValue,
        ROUTE_CARD_SUMMARY_METRIC_MAX_LENGTH,
      )
    : "";
}

function createRouteCardRiskSummaryLabel(riskLabel: string): string {
  const normalizedRiskLabel = normalizeRouteCardMetaValue(riskLabel);

  if (!normalizedRiskLabel) {
    return "Risk";
  }

  if (/\brisk\b/i.test(normalizedRiskLabel)) {
    return normalizedRiskLabel;
  }

  return `${normalizedRiskLabel} risk`;
}

function createRouteCardVisibleRiskSummaryLabel(riskLabel: string): string {
  const normalizedRiskLabel = normalizeRouteCardMetaValue(riskLabel);

  if (!normalizedRiskLabel) {
    return "Risk";
  }

  if (/\brisk\b/i.test(normalizedRiskLabel)) {
    return createCompactRouteCardLabel(
      normalizedRiskLabel,
      ROUTE_CARD_RISK_MAX_LENGTH,
    );
  }

  const riskSuffix = " risk";
  const compactRiskLabel = createCompactRouteCardLabel(
    normalizedRiskLabel,
    ROUTE_CARD_RISK_MAX_LENGTH - riskSuffix.length,
  );

  return `${compactRiskLabel}${riskSuffix}`;
}

export function createRouteCardMetaLabel(
  operation: string,
  convoyCallsign: string,
): string | null {
  const normalizedOperation = normalizeRouteCardMetaValue(operation);
  const normalizedConvoy = normalizeRouteCardMetaValue(convoyCallsign);
  const operationLabel = isGenericRouteOperation(normalizedOperation)
    ? ""
    : normalizedOperation;
  const convoyLabel = isGenericConvoyCallsign(normalizedConvoy)
    ? ""
    : normalizedConvoy;

  if (operationLabel && convoyLabel && operationLabel !== convoyLabel) {
    return createCompactRouteCardLabel(
      `${operationLabel} • ${convoyLabel}`,
      ROUTE_CARD_META_MAX_LENGTH,
    );
  }

  const label = operationLabel || convoyLabel;

  return label
    ? createCompactRouteCardLabel(label, ROUTE_CARD_META_MAX_LENGTH)
    : null;
}

function createRouteCardMetaAccessibilityLabel(
  operation: string,
  convoyCallsign: string,
): string | null {
  const normalizedOperation = normalizeRouteCardMetaValue(operation);
  const normalizedConvoy = normalizeRouteCardMetaValue(convoyCallsign);
  const operationLabel = isGenericRouteOperation(normalizedOperation)
    ? ""
    : normalizedOperation;
  const convoyLabel = isGenericConvoyCallsign(normalizedConvoy)
    ? ""
    : normalizedConvoy;

  if (operationLabel && convoyLabel) {
    if (operationLabel === convoyLabel) {
      return operationLabel;
    }

    return `${operationLabel}, ${createInlineConvoyAccessibilityLabel(convoyLabel)}`;
  }

  if (operationLabel) {
    return operationLabel;
  }

  if (convoyLabel) {
    return createStandaloneConvoyAccessibilityLabel(convoyLabel);
  }

  return null;
}

function createInlineConvoyAccessibilityLabel(convoyLabel: string): string {
  return startsWithConvoyLabel(convoyLabel) ? convoyLabel : `convoy ${convoyLabel}`;
}

function createStandaloneConvoyAccessibilityLabel(convoyLabel: string): string {
  return startsWithConvoyLabel(convoyLabel) ? convoyLabel : `Convoy ${convoyLabel}`;
}

function startsWithConvoyLabel(value: string): boolean {
  return /^convoy\b/i.test(value.trim());
}

function normalizeRouteCardMetaValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createRouteCardAccessibilityLabel(
  phrases: Array<string | null>,
): string {
  const normalizedPhrases = phrases
    .map((phrase) => phrase?.trim().replace(/\s+/g, " ") || "")
    .filter(Boolean);

  return normalizedPhrases
    .map((phrase, index) => {
      const isLastPhrase = index === normalizedPhrases.length - 1;

      if (isLastPhrase || /[.!?…]$/.test(phrase)) {
        return phrase;
      }

      return `${phrase}.`;
    })
    .join(" ");
}

function createCompactRouteCardLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isGenericRouteOperation(operation: string): boolean {
  return operation.toLowerCase() === "saferoute plan";
}

function isGenericConvoyCallsign(convoyCallsign: string): boolean {
  return convoyCallsign.toLowerCase() === "convoy";
}

export function createRouteStatusLabel(status: SavedRouteStatus): string {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "in-progress") {
    return "Live";
  }

  return "Planned";
}

export function shouldShowRouteStatusPill(status: SavedRouteStatus): boolean {
  return status !== "ready";
}

export function createRouteUpdatedLabel(updatedAtLabel: string): string {
  const normalizedLabel = normalizeRouteUpdatedLabel(updatedAtLabel);
  if (!normalizedLabel) {
    return "Updated";
  }

  const compactLabel = normalizedLabel
    .replace(/^last updated\s+/i, "")
    .replace(/^updated\s+/i, "")
    .trim();

  return sentenceCase(compactLabel || normalizedLabel);
}

function normalizeRouteUpdatedLabel(updatedAtLabel: string): string {
  return updatedAtLabel.trim().replace(/\s+/g, " ");
}

function sentenceCase(label: string): string {
  return label.replace(/^([a-z])/, (match) => match.toUpperCase());
}
