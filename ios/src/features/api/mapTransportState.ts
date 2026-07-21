export type SafeRouteMapType = "mutedStandard" | "none" | "satellite" | "standard";

export function resolveSafeRouteMapType({
  layer = "dark",
  online,
  platform,
}: {
  layer?: "dark" | "satellite";
  online: boolean;
  platform: string;
}): SafeRouteMapType {
  if (!online) {
    return "none";
  }
  if (layer === "satellite") {
    return "satellite";
  }
  return platform === "ios" ? "mutedStandard" : "standard";
}
