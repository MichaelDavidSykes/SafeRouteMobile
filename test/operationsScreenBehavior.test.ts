import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const screenSource = () => readFileSync("src/features/operations/OperationsScreen.tsx", "utf8");
const uiStateSource = () => readFileSync("src/features/operations/operationsUiState.ts", "utf8");

describe("operations screen behavior", () => {
  it("loads synced routes plus SafeRoute operations manifests into view-only tabs", () => {
    const text = screenSource();

    assert.match(text, /fetchSavedRoutes\(accessToken, clientId \|\| undefined\)/);
    assert.match(text, /resolveOperationsClientId\(/);
    assert.match(text, /fetchOperationsState\(accessToken, nextClientId\)/);
    assert.match(text, /createPlannedRouteRows\(routes, operationsState\)/);
    assert.match(text, /createCalendarRows\(routes, operationsState\)/);
    assert.match(text, /createConvoyRows\(routes, operationsState\)/);
    assert.match(text, /createOperationsSummaryState\(routes, operationsState\)/);
    assert.match(text, /accessibilityRole="tab"/);
    assert.match(text, /testID=\{uiTestIds\.operationsScreen\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsRouteCard\(row\.id\)\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsConvoyCard\(row\.id\)\}/);
    assert.match(text, />View only</);
    assert.match(text, /revision !== loadRevisionRef\.current/);
    assert.match(text, /void loadOperations\(\{ clientId: client\.id \}\)/);
    assert.doesNotMatch(text, /onEdit|Edit route|Save changes|Delete route|Create convoy|saveSelected|upsert|deleteTrip/);
  });

  it("keeps manifest sync failure non-blocking while preserving session expiry safety", () => {
    const text = `${screenSource()}\n${uiStateSource()}`;

    assert.match(text, /operationsError instanceof ApiSessionExpiredError/);
    assert.match(text, /createOperationsSyncWarningState\(operationsError\)/);
    assert.match(text, /setOperationsState\(null\)/);
    assert.match(text, /Showing saved routes only/);
  });
});
