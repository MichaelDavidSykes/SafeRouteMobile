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
  updatedLabel: string;
};

export function createRouteCardPresentation(
  route: SavedSafeRoutePlan,
  loading: boolean,
): RouteCardPresentation {
  const statusLabel = createRouteStatusLabel(route.status);
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
    accessibilityLabel: [
      route.name,
      `${statusLabel} route`,
      createRouteCardMetaAccessibilityLabel(
        route.operation,
        route.convoyCallsign,
      ),
      createRouteCardEndpointAccessibilityLabel(route.origin, route.destination),
      routeSummary,
      updatedAccessibilityLabel,
    ]
      .filter(Boolean)
      .join(". "),
    actionLabel: loading ? "Opening" : "Map",
    endpointLabel: createRouteCardEndpointLabel(route.origin, route.destination),
    metaLabel,
    statusLabel,
    summaryLabel: createRouteCardSummaryLabel(route),
    testID: createRouteCardTestID(route.id),
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
    normalizeRouteCardMetaValue(route.route.eta),
    normalizeRouteCardMetaValue(route.route.distance),
    createRouteCardRiskSummaryLabel(route.route.riskLabel),
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
    return `${normalizedOrigin} → ${normalizedDestination}`;
  }

  return normalizedOrigin || normalizedDestination || "Route endpoints pending";
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
    return `${operationLabel} • ${convoyLabel}`;
  }

  return operationLabel || convoyLabel || null;
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
    return `${operationLabel}, convoy ${convoyLabel}`;
  }

  if (convoyLabel) {
    return `Convoy ${convoyLabel}`;
  }

  return operationLabel || null;
}

function normalizeRouteCardMetaValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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
