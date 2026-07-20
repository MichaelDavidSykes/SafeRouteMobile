import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = () => readFileSync("App.tsx", "utf8");

describe("Operations route preview navigation", () => {
  it("opens an owned Operations route with saved-route security context", () => {
    const source = appSource();
    const handler =
      /const handleSelectOperationsRoute = \([\s\S]*?\n  \};/.exec(source)?.[0] || "";

    assert.match(handler, /routePlan\.clientId !== activeWorkspace\.id/);
    assert.match(handler, /routeContext: 'saved'/);
    assert.match(handler, /setRoutePreviewSource\('saved'\)/);
    assert.match(handler, /setOperationsTab\(sourceTab\)/);
    assert.match(handler, /setOperationsRoutePreviewReturnTab\(sourceTab\)/);
    assert.match(handler, /setOperationsRoutePreviewReturnConvoyId\(sourceConvoyId\)/);
    assert.match(handler, /setScreen\('route-preview'\)/);
  });

  it("returns to the exact Operations tab without widening navigation storage", () => {
    const source = appSource();
    const returnHandler =
      /const returnFromRoutePreview = \(\) => \{[\s\S]*?\n  \};/.exec(source)?.[0] || "";

    assert.match(returnHandler, /if \(operationsRoutePreviewReturnTab\)/);
    assert.match(returnHandler, /setOperationsTab\(operationsRoutePreviewReturnTab\)/);
    assert.match(returnHandler, /setScreen\(authenticated \? 'operations' : 'guest-map'\)/);
    assert.match(source, /routeContext=\{routePreviewSource\}/);
    assert.doesNotMatch(source, /setRoutePreviewSource\('operations'\)/);
  });

  it("restores the same Operations feature after route-preview session expiry", () => {
    const source = appSource();

    assert.match(
      source,
      /screen === 'route-preview' && operationsRoutePreviewReturnTab[\s\S]*fullAccessFeatureForOperationsTab\(operationsRoutePreviewReturnTab\)/,
    );
    assert.match(source, /Return to \$\{[\s\S]*operationsRoutePreviewReturnTab === 'calendar'/);
    assert.match(source, /onSelectRoute=\{handleSelectOperationsRoute\}/);
    assert.match(
      source,
      /initialConvoyId=\{operationsRoutePreviewReturnConvoyId\}/,
    );
    assert.match(
      source,
      /onConvoySelectionChange=\{setOperationsRoutePreviewReturnConvoyId\}/,
    );
  });

  it("clears restored Operations context when route-preview workspace access is revoked", () => {
    const source = appSource();
    const unavailablePreviewClosures = source.match(
      /if \(previewUnavailable\) \{[\s\S]*?setSelectedRoute\(null\);[\s\S]*?setOperationsRoutePreviewReturnTab\(null\);[\s\S]*?setOperationsRoutePreviewReturnConvoyId\(null\);[\s\S]*?\}/g,
    ) || [];

    assert.match(
      source,
      /if \(previewWorkspaceRevoked\) \{[\s\S]*?setOperationsRoutePreviewReturnTab\(null\);[\s\S]*?setOperationsRoutePreviewReturnConvoyId\(null\);[\s\S]*?\}/,
    );
    assert.equal(unavailablePreviewClosures.length, 2);
  });
});
