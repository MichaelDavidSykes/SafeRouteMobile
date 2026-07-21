import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPreviewAuthSession,
  createPreviewLoginCodeChallenge,
  createPreviewSuspendedNavigationSession,
  isPreviewAccessToken,
  PREVIEW_ACCESS_TOKEN,
  PREVIEW_EXPIRED_SESSION_NOTICE,
  PREVIEW_SESSION_NOTICE,
} from "../src/features/auth/previewSession";

describe("SafeRoute preview session", () => {
  it("creates a non-production preview identity for authenticated UI smoke tests", () => {
    assert.deepEqual(createPreviewAuthSession(), {
      accessToken: PREVIEW_ACCESS_TOKEN,
      email: "preview@lunarchain.local",
      principalId: "preview-user",
      user: {
        email: "preview@lunarchain.local",
        id: "preview-user",
        name: "SafeRoute Preview",
      },
    });

    assert.match(PREVIEW_SESSION_NOTICE, /local/i);
    assert.match(PREVIEW_SESSION_NOTICE, /production build/i);
  });

  it("provides concise expired-session recovery copy for auth previews", () => {
    assert.equal(
      PREVIEW_EXPIRED_SESSION_NOTICE,
      "Your LunarChain session expired. Sign in again.",
    );
  });

  it("creates a local two-factor challenge for credential-free auth-code previews", () => {
    assert.deepEqual(createPreviewLoginCodeChallenge(), {
      challengeToken: "preview-login-code",
      email: "preview.operator@lunarchain.local",
      method: "email",
    });
  });

  it("creates principal-bound workspace guidance for the suspended-access preview", () => {
    const session = createPreviewSuspendedNavigationSession();

    assert.deepEqual(session.accessScope, {
      clientId: "preview-routes",
      kind: "workspace",
      principalId: "preview-user",
    });
    assert.equal(session.routePlan.clientId, "preview-routes");
    assert.equal(session.navigationState, "navigating");
  });

  it("recognizes only the trimmed preview token", () => {
    assert.equal(isPreviewAccessToken(` ${PREVIEW_ACCESS_TOKEN} `), true);
    assert.equal(isPreviewAccessToken("real-token"), false);
    assert.equal(isPreviewAccessToken(""), false);
    assert.equal(isPreviewAccessToken(null), false);
  });
});
