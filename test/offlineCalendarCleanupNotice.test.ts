import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("offline Calendar cleanup notice", () => {
  const source = readFileSync(
    "src/features/operations/OfflineCalendarCleanupNotice.tsx",
    "utf8",
  );

  it("offers an honest accessible retry without exposing account identity", () => {
    assert.match(source, /Offline data unavailable/);
    assert.match(
      source,
      /could not finish protecting saved offline data[\s\S]*Retry before offline review can continue/,
    );
    assert.match(source, /Retry offline data cleanup/);
    assert.match(source, /accessibilityRole="alert"/);
    assert.match(source, /accessibilityRole="button"/);
    assert.match(
      source,
      /<View[\s\S]*accessible[\s\S]*accessibilityRole="alert"[\s\S]*<\/View>[\s\S]*<Pressable/,
    );
    assert.match(
      source,
      /accessibilityState=\{\{ busy: checking, disabled: checking \}\}/,
    );
    assert.match(source, /minHeight: 44/);
    assert.match(source, /useWindowDimensions/);
    assert.match(source, /maxHeight:/);
    assert.match(source, /<ScrollView/);
    assert.match(source, /uiTestIds\.offlineCalendarCleanupNotice/);
    assert.match(source, /uiTestIds\.offlineCalendarCleanupAlert/);
    assert.match(source, /uiTestIds\.offlineCalendarCleanupRetry/);
    assert.doesNotMatch(source, /principalId|workspaceId|email/);
  });

  it("keeps cleanup notices single-stack in App", () => {
    const app = readFileSync("App.tsx", "utf8");
    assert.match(
      app,
      /offlineCalendarCleanupStatus !== 'idle' &&[\s\S]*navigationCleanupStatus === 'idle'[\s\S]*OfflineCalendarCleanupNotice/,
    );
  });
});
