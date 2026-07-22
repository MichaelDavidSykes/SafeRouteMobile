import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const loginSource = () =>
  readFileSync("src/features/auth/LoginScreen.tsx", "utf8");
const loginStyles = () =>
  readFileSync("src/features/auth/LoginScreen.styles.ts", "utf8");

describe("saved session validation retry", () => {
  it("exposes one accessible retry without enabling concurrent sign-in", () => {
    const source = loginSource();

    assert.match(source, /onRetrySavedSession\?: \(\) => void/);
    assert.match(source, /savedSessionRetrying\?: boolean/);
    assert.match(
      source,
      /const formBusy = loading \|\| resendingCode \|\| savedSessionRetrying/,
    );
    assert.match(
      source,
      /onRetrySavedSession \? \([\s\S]*accessibilityHint="Checks the saved account before any workspace, route, or Calendar data is shown\."[\s\S]*Retry saved session verification[\s\S]*busy: savedSessionRetrying[\s\S]*disabled: formBusy[\s\S]*testID=\{uiTestIds\.loginSavedSessionRetry\}[\s\S]*onPress=\{onRetrySavedSession\}/,
    );
    assert.match(
      source,
      /const primaryActionDisabled =[\s\S]*primaryActionState\.disabled \|\| resendingCode \|\| savedSessionRetrying[\s\S]*accessibilityState=\{\{ disabled: primaryActionDisabled \}\}[\s\S]*disabled=\{primaryActionDisabled\}/,
    );
  });

  it("keeps the retry compact, rounded, and at least 44 points high", () => {
    const styles = loginStyles();
    const button =
      /savedSessionRetryButton:\s*\{([\s\S]*?)\n  \},\n  savedSessionRetryButtonPressed/.exec(
        styles,
      )?.[1] || "";

    assert.match(button, /minHeight:\s*48/);
    assert.match(button, /borderRadius:\s*authRadius\.pill/);
    assert.match(button, /flexDirection:\s*'row'/);
    assert.match(styles, /savedSessionRetryButtonText:[\s\S]*maxWidth:\s*230/);
  });
});
