import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPreviewAuthSession,
  createPreviewLoginCodeChallenge,
  isPreviewAccessToken,
  PREVIEW_ACCESS_TOKEN,
  PREVIEW_SESSION_NOTICE,
} from "../src/features/auth/previewSession";

describe("SafeRoute preview session", () => {
  it("creates a non-production preview identity for authenticated UI smoke tests", () => {
    assert.deepEqual(createPreviewAuthSession(), {
      accessToken: PREVIEW_ACCESS_TOKEN,
      email: "preview@lunarchain.local",
      user: {
        email: "preview@lunarchain.local",
        name: "SafeRoute Preview",
      },
    });

    assert.match(PREVIEW_SESSION_NOTICE, /local/i);
    assert.match(PREVIEW_SESSION_NOTICE, /production build/i);
  });

  it("creates a local two-factor challenge for credential-free auth-code previews", () => {
    assert.deepEqual(createPreviewLoginCodeChallenge(), {
      challengeToken: "preview-login-code",
      email: "preview.operator@lunarchain.local",
      method: "email",
    });
  });

  it("recognizes only the trimmed preview token", () => {
    assert.equal(isPreviewAccessToken(` ${PREVIEW_ACCESS_TOKEN} `), true);
    assert.equal(isPreviewAccessToken("real-token"), false);
    assert.equal(isPreviewAccessToken(""), false);
    assert.equal(isPreviewAccessToken(null), false);
  });
});
