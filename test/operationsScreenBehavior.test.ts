import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = () => readFileSync("src/features/operations/OperationsScreen.tsx", "utf8");

describe("operations screen behavior", () => {
  it("loads synced SafeRoute plans into planned, calendar, and convoy tabs without edit actions", () => {
    const text = source();

    assert.match(text, /fetchSavedRoutes\(accessToken\)/);
    assert.match(text, /createPlannedRouteRows\(routes\)/);
    assert.match(text, /createCalendarRows\(routes\)/);
    assert.match(text, /createConvoyRows\(routes\)/);
    assert.match(text, /accessibilityRole="tab"/);
    assert.match(text, /testID=\{uiTestIds\.operationsScreen\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsRouteCard\(row\.id\)\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsConvoyCard\(row\.id\)\}/);
    assert.match(text, />View only</);
    assert.doesNotMatch(text, /onEdit|Edit route|Save changes|Delete route|Create convoy/);
  });
});
