import type { RiskZone } from "../live-map/liveMapTypes";
import { isRouteAlertZone } from "../live-map/riskOverlayPresentation";

export type GuestMapRiskSummary = {
  accessibilityLabel: string;
  riskAreaCount: number;
  riskAreaLabel: string;
  routeAlertCount: number;
  routeAlertLabel: string;
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function createGuestMapRiskSummary(
  zones: RiskZone[],
): GuestMapRiskSummary {
  const routeAlertCount = zones.filter(isRouteAlertZone).length;
  const riskAreaCount = zones.length - routeAlertCount;
  const riskAreaLabel = countLabel(riskAreaCount, "risk area", "risk areas");
  const routeAlertLabel = countLabel(
    routeAlertCount,
    "route alert",
    "route alerts",
  );

  return {
    accessibilityLabel: `${riskAreaLabel} and ${routeAlertLabel}`,
    riskAreaCount,
    riskAreaLabel,
    routeAlertCount,
    routeAlertLabel,
  };
}
