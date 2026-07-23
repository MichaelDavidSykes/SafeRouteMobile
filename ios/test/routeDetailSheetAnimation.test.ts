import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("saved route detail animation", () => {
  const sheetSource = readFileSync(
    join(process.cwd(), "src/features/routes/RouteDetailSheet.tsx"),
    "utf8",
  );
  const stylesSource = readFileSync(
    join(process.cwd(), "src/features/routes/RouteDetailSheet.styles.ts"),
    "utf8",
  );

  it("animates only the sheet instead of sliding the full-screen modal", () => {
    assert.match(sheetSource, /animationType="none"/);
    assert.match(sheetSource, /Animated\.spring\(sheetTranslateY/);
    assert.match(
      sheetSource,
      /<AnimatedSafeAreaView[\s\S]*transform: \[\{ translateY: sheetTranslateY \}\]/,
    );
    assert.doesNotMatch(sheetSource, /animationType="slide"/);
  });

  it("keeps the outside-tap dismissal layer transparent and stationary", () => {
    assert.match(
      stylesSource,
      /scrim:\s*\{[\s\S]*backgroundColor: "transparent"/,
    );
    assert.match(
      sheetSource,
      /<AnimatedPressable[\s\S]*style=\{\[styles\.scrim, \{ opacity: scrimOpacity \}\]\}[\s\S]*onPress=\{dismissSheet\}[\s\S]*<AnimatedSafeAreaView/,
    );
    assert.doesNotMatch(
      sheetSource,
      /styles\.scrim[\s\S]{0,100}transform:/,
    );
  });

  it("makes the visible handle dismiss the sheet with a downward gesture", () => {
    assert.match(sheetSource, /PanResponder\.create/);
    assert.match(sheetSource, /shouldStartRiskDetailDismissGesture/);
    assert.match(sheetSource, /shouldDismissRiskDetailGesture/);
    assert.match(sheetSource, /\.\.\.dragResponder\.panHandlers/);
    assert.match(sheetSource, /Animated\.timing\(sheetTranslateY/);
  });
});
