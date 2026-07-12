import type { RiskZone } from "./liveMapTypes";

export const MAX_VISIBLE_RISK_RADIUS_METERS = 10_000;

export function isRouteAlertZone(zone: RiskZone): boolean {
  const shape = String(zone.shape || "").trim().toLowerCase();
  return Boolean(
    shape === "route-alert" ||
      (zone.routeSegmentCoordinates &&
        zone.routeSegmentCoordinates.length > 1 &&
        (!zone.polygonCoordinates || zone.polygonCoordinates.length < 3)),
  );
}

export function shouldRenderRiskCoverage(zone: RiskZone): boolean {
  return !isRouteAlertZone(zone);
}

export function visibleRiskRadiusMeters(zone: RiskZone): number {
  const radius = Number(zone.radiusMeters);
  if (!Number.isFinite(radius)) return 250;
  return Math.max(25, Math.min(MAX_VISIBLE_RISK_RADIUS_METERS, radius));
}
