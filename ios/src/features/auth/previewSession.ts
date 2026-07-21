import type { AuthSession, TwoFactorChallenge } from "./authTypes";
import { createActiveNavigationSession } from "../live-map/activeNavigationSessionCore";
import { SAVED_ROUTE_PLANS } from "../live-map/demoRoute";

export const PREVIEW_ACCESS_TOKEN = "__saferoute_preview_session__";
export const PREVIEW_PRINCIPAL_ID = "preview-user";
export const PREVIEW_SESSION_NOTICE =
  "Preview routes are local. Sign in on a production build for live sync.";
export const PREVIEW_EXPIRED_SESSION_NOTICE =
  "Your LunarChain session expired. Sign in again.";

export function createPreviewAuthSession(): AuthSession {
  return {
    accessToken: PREVIEW_ACCESS_TOKEN,
    email: "preview@lunarchain.local",
    principalId: PREVIEW_PRINCIPAL_ID,
    user: {
      email: "preview@lunarchain.local",
      id: PREVIEW_PRINCIPAL_ID,
      name: "SafeRoute Preview",
    },
  };
}

export function createPreviewLoginCodeChallenge(): TwoFactorChallenge {
  return {
    challengeToken: "preview-login-code",
    email: "preview.operator@lunarchain.local",
    method: "email",
  };
}

export function createPreviewSuspendedNavigationSession() {
  return createActiveNavigationSession({
    backgroundTrackingEnabled: true,
    followModeEnabled: true,
    navigationState: "navigating",
    principalId: PREVIEW_PRINCIPAL_ID,
    progressFloorMeters: 0,
    routeContext: "saved",
    routePlan: {
      ...SAVED_ROUTE_PLANS[0],
      clientId: "preview-routes",
    },
  });
}

export function isPreviewAccessToken(accessToken: string | null | undefined): boolean {
  return String(accessToken || "").trim() === PREVIEW_ACCESS_TOKEN;
}
