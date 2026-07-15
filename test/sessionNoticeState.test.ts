import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCompactSessionNoticeMessage,
  createSessionNoticeState,
  SESSION_NOTICE_MESSAGE_MAX_LENGTH,
} from "../src/features/auth/sessionNoticeState";

describe("session notice state", () => {
  it("hides blank session notices", () => {
    assert.equal(createSessionNoticeState("   \n\t  "), null);
  });

  it("normalizes concise session notices without duplicate accessibility copy", () => {
    assert.deepEqual(
      createSessionNoticeState(
        "  Preview routes are local.\nSign in on a production build for live sync.  ",
      ),
      {
        accessibilityLabel: null,
        accessibilityRole: "alert",
        message:
          "Preview routes are local. Sign in on a production build for live sync.",
      },
    );
  });

  it("keeps offline restore notices visible at the compact notice budget", () => {
    const notice =
      "Using your saved LunarChain session. Some SafeRoute data may need a network refresh.";

    assert.equal(notice.length, SESSION_NOTICE_MESSAGE_MAX_LENGTH);
    assert.deepEqual(createSessionNoticeState(notice), {
      accessibilityLabel: null,
      accessibilityRole: "alert",
      message: notice,
    });
  });

  it("bounds verbose session notices while preserving VoiceOver context", () => {
    const notice =
      "Your saved LunarChain session needs online validation before saved routes, convoy plans, and route sync can be unlocked.";
    const compactNotice = `${notice
      .slice(0, SESSION_NOTICE_MESSAGE_MAX_LENGTH - 1)
      .trimEnd()}…`;

    assert.deepEqual(createSessionNoticeState(notice), {
      accessibilityLabel: notice,
      accessibilityRole: "alert",
      message: compactNotice,
    });
    assert.equal(compactNotice.length, SESSION_NOTICE_MESSAGE_MAX_LENGTH);
  });

  it("does not repeat workspace confirmations already queued by the app", () => {
    assert.deepEqual(createSessionNoticeState("Workspace access verified."), {
      accessibilityLabel: null,
      accessibilityRole: undefined,
      message: "Workspace access verified.",
    });
    assert.deepEqual(createSessionNoticeState("Workspace access refreshed."), {
      accessibilityLabel: null,
      accessibilityRole: undefined,
      message: "Workspace access refreshed.",
    });
  });

  it("uses the shared session notice bound for direct compact helpers", () => {
    const notice = "A".repeat(SESSION_NOTICE_MESSAGE_MAX_LENGTH + 10);

    assert.equal(
      createCompactSessionNoticeMessage(notice),
      `${"A".repeat(SESSION_NOTICE_MESSAGE_MAX_LENGTH - 1)}…`,
    );
  });
});
