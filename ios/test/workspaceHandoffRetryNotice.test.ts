import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const noticeSource = () =>
  readFileSync(
    "src/features/workspaces/WorkspaceHandoffRetryNotice.tsx",
    "utf8",
  );

describe("workspace handoff retry notice", () => {
  it("keeps alert copy separate from three independently accessible actions", () => {
    const source = noticeSource();
    const alertIndex = source.indexOf(
      'accessibilityRole={busy ? "alert" : "summary"}',
    );
    const retryIndex = source.indexOf(
      "testID={uiTestIds.workspaceHandoffRetryAction}",
    );
    const keepIndex = source.indexOf(
      "testID={uiTestIds.workspaceHandoffKeepCurrentAction}",
    );
    const chooseAnotherIndex = source.indexOf(
      "testID={uiTestIds.workspaceHandoffChooseAnotherAction}",
    );

    assert.ok(alertIndex >= 0);
    assert.ok(retryIndex > alertIndex);
    assert.ok(chooseAnotherIndex > retryIndex);
    assert.ok(keepIndex > chooseAnotherIndex);
    assert.match(
      source,
      /const busy = saving \|\| checkingAccess[\s\S]*<View[\s\S]*accessible[\s\S]*accessibilityLiveRegion=\{busy \? "polite" : "none"\}[\s\S]*accessibilityRole=\{busy \? "alert" : "summary"\}/,
    );
    assert.equal(
      (source.match(/accessibilityRole="button"/g) || []).length,
      3,
    );
  });

  it("provides compact, bounded actions with safe iPhone tap targets", () => {
    const source = noticeSource();

    assert.match(source, /left: spacing\.md[\s\S]*right: spacing\.md/);
    assert.match(source, /maxWidth: 440/);
    assert.equal((source.match(/minHeight: 44/g) || []).length, 2);
    assert.equal((source.match(/numberOfLines=\{1\}/g) || []).length, 4);
    assert.match(source, /numberOfLines=\{3\}/);
  });

  it("disables Retry while access is checked but keeps both safe exits", () => {
    const source = noticeSource();

    assert.match(source, /const busy = saving \|\| checkingAccess/);
    assert.match(source, /accessibilityState=\{\{ busy, disabled: busy \}\}/);
    assert.match(source, /disabled=\{busy\}/);
    assert.match(source, /\{!saving \? \(/);
    assert.doesNotMatch(source, /\{!checkingAccess \? \(/);
    assert.match(source, /onPress=\{onChooseAnother\}/);
    assert.match(source, /onPress=\{onKeepCurrent\}/);
  });
});
