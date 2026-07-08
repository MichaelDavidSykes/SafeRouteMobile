import type { LatLng } from "react-native-maps";

import type { RiskSeverity, RiskZone } from "./liveMapTypes";
import {
  formatDistance,
  projectCoordinateToRoute,
  type RouteProgressSnapshot,
} from "./routeProgress";
import { LIVE_RISK_LATERAL_BUFFER_METERS } from "./routeRisk";

export type RouteRiskAdvisoryTone = "danger" | "warning" | "info";

export interface RouteRiskAdvisory {
  accessibilityLabel: string;
  distanceAheadMeters: number;
  severity: RiskSeverity;
  title: string;
  tone: RouteRiskAdvisoryTone;
  visibleLabel: string;
}

interface RouteRiskAdvisoryOptions {
  lookaheadMeters?: number;
}

interface CandidateRouteRiskAdvisory extends RouteRiskAdvisory {
  priorityBucket: number;
}

const DEFAULT_RISK_LOOKAHEAD_METERS = 900;
const CURRENT_RISK_BUFFER_METERS = 80;
const IMMEDIATE_RISK_AHEAD_METERS = 250;

const SEVERITY_PRIORITY: Record<RiskSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function createRouteRiskAdvisory({
  progress,
  riskZones,
  routeCoordinates,
  lookaheadMeters = DEFAULT_RISK_LOOKAHEAD_METERS,
}: {
  progress: RouteProgressSnapshot | null;
  riskZones: RiskZone[];
  routeCoordinates: LatLng[];
} & RouteRiskAdvisoryOptions): RouteRiskAdvisory | null {
  if (
    !progress ||
    progress.isArrived ||
    progress.isOffRoute ||
    routeCoordinates.length < 2 ||
    riskZones.length === 0 ||
    lookaheadMeters <= 0
  ) {
    return null;
  }

  const candidates = riskZones
    .map((zone) =>
      createRiskCandidate({
        progress,
        routeCoordinates,
        zone,
        lookaheadMeters,
      }),
    )
    .filter((candidate): candidate is CandidateRouteRiskAdvisory =>
      Boolean(candidate),
    )
    .sort(compareRiskCandidates);

  const [bestCandidate] = candidates;
  if (!bestCandidate) {
    return null;
  }

  const { priorityBucket: _priorityBucket, ...advisory } = bestCandidate;
  return advisory;
}

function createRiskCandidate({
  progress,
  routeCoordinates,
  zone,
  lookaheadMeters,
}: {
  progress: RouteProgressSnapshot;
  routeCoordinates: LatLng[];
  zone: RiskZone;
  lookaheadMeters: number;
}): CandidateRouteRiskAdvisory | null {
  const projection = projectCoordinateToRoute(routeCoordinates, zone.coordinate);
  if (!projection) {
    return null;
  }

  const routeAlertCorridorMeters =
    Math.max(0, zone.radiusMeters || 0) + LIVE_RISK_LATERAL_BUFFER_METERS;
  if (projection.distanceMeters > routeAlertCorridorMeters) {
    return null;
  }

  const rawDistanceAheadMeters =
    projection.distanceAlongMeters - progress.travelledDistanceMeters;
  const currentRiskBufferMeters = Math.max(
    zone.radiusMeters || 0,
    CURRENT_RISK_BUFFER_METERS,
  );

  if (rawDistanceAheadMeters < -currentRiskBufferMeters) {
    return null;
  }

  const distanceAheadMeters = Math.max(0, rawDistanceAheadMeters);
  if (distanceAheadMeters > lookaheadMeters) {
    return null;
  }

  const title = normalizeRiskCopy(zone.title, "Route risk");
  const description = normalizeRiskCopy(zone.description, "");
  const distanceLabel = createRiskDistanceLabel(distanceAheadMeters);
  const severityLabel = createSeverityVisibleLabel(zone.severity);

  return {
    accessibilityLabel: [
      distanceAheadMeters <= 0
        ? `${severityLabel} on the route now.`
        : `${severityLabel} ahead in ${distanceLabel}.`,
      title ? `${title}.` : "",
      description && description !== title ? description : "",
    ]
      .filter(Boolean)
      .join(" "),
    distanceAheadMeters,
    priorityBucket: resolvePriorityBucket(distanceAheadMeters),
    severity: zone.severity,
    title,
    tone: createAdvisoryTone(zone.severity),
    visibleLabel:
      distanceAheadMeters <= 0
        ? `${severityLabel} here`
        : `${severityLabel} ahead · ${distanceLabel}`,
  };
}

function compareRiskCandidates(
  first: CandidateRouteRiskAdvisory,
  second: CandidateRouteRiskAdvisory,
): number {
  return (
    first.priorityBucket - second.priorityBucket ||
    SEVERITY_PRIORITY[second.severity] - SEVERITY_PRIORITY[first.severity] ||
    first.distanceAheadMeters - second.distanceAheadMeters ||
    first.title.localeCompare(second.title)
  );
}

function resolvePriorityBucket(distanceAheadMeters: number): number {
  if (distanceAheadMeters <= 0) {
    return 0;
  }

  if (distanceAheadMeters <= IMMEDIATE_RISK_AHEAD_METERS) {
    return 1;
  }

  return 2;
}

function createRiskDistanceLabel(distanceAheadMeters: number): string {
  return formatDistance(Math.max(0, distanceAheadMeters));
}

function createSeverityVisibleLabel(severity: RiskSeverity): string {
  if (severity === "high") {
    return "High risk";
  }

  if (severity === "medium") {
    return "Risk";
  }

  return "Risk note";
}

function createAdvisoryTone(severity: RiskSeverity): RouteRiskAdvisoryTone {
  if (severity === "high") {
    return "danger";
  }

  if (severity === "medium") {
    return "warning";
  }

  return "info";
}

function normalizeRiskCopy(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}
