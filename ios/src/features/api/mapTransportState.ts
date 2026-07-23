export type SafeRouteMapType =
  | "hybrid"
  | "mutedStandard"
  | "none"
  | "satellite"
  | "standard";

export type SafeRouteMapInterfaceStyle = "dark" | "light";

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
    return platform === "ios" ? "hybrid" : "satellite";
  }
  return platform === "ios" ? "mutedStandard" : "standard";
}

export function resolveSafeRouteMapInterfaceStyle({
  layer = "dark",
  online,
}: {
  layer?: "dark" | "satellite";
  online: boolean;
}): SafeRouteMapInterfaceStyle {
  return online && layer === "satellite" ? "light" : "dark";
}
