import type { AuthSession } from "./authTypes";

export const PREVIEW_ACCESS_TOKEN = "__saferoute_preview_session__";
export const PREVIEW_SESSION_NOTICE =
  "Preview routes are local. Sign in on a production build for live sync.";

export function createPreviewAuthSession(): AuthSession {
  return {
    accessToken: PREVIEW_ACCESS_TOKEN,
    email: "preview@lunarchain.local",
    user: {
      email: "preview@lunarchain.local",
      name: "SafeRoute Preview",
    },
  };
}

export function isPreviewAccessToken(accessToken: string | null | undefined): boolean {
  return String(accessToken || "").trim() === PREVIEW_ACCESS_TOKEN;
}
