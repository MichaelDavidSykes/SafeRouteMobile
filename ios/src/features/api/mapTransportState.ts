export type SafeRouteMapType = "mutedStandard" | "none" | "standard";

export function resolveSafeRouteMapType({
  online,
  platform,
}: {
  online: boolean;
  platform: string;
}): SafeRouteMapType {
  if (!online) {
    return "none";
  }
  return platform === "ios" ? "mutedStandard" : "standard";
}
