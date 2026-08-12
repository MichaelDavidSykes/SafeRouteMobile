import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { resolveRiskCalloutPlacement } from "../src/features/live-map/liveMapRiskDetailPlacement";
import { createRiskZoneExpandedPresentation } from "../src/features/live-map/riskDetailPresentation";

describe("map-anchored risk detail callout", () => {
  it("labels route-alert details separately from mapped risk areas", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );
    const alertCardSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskCard.tsx"),
      "utf8",
    );

    assert.match(source, /const routeAlert = isRouteAlertZone\(zone\)/);
    assert.match(source, /routeAlert[\s\S]*"Close route alert details"/);
    assert.match(source, /routeAlert \? \([\s\S]*<CircleAlert/);
    assert.match(source, /`Route alert · \$\{zone\.category \|\| "Safety intelligence"\}`/);
    assert.match(source, /routeAlert \? "Route intelligence" : "Risk intelligence"/);
    assert.match(source, /routeAlert \? "ROUTE ALERT" : "AREA RECORD"/);
    assert.match(alertCardSource, /const routeAlert = isRouteAlertZone\(alert\.zone\)/);
    assert.match(alertCardSource, /routeAlert[\s\S]*route-alert details/);
    assert.match(alertCardSource, /routeAlert \? \([\s\S]*<CircleAlert/);
  });

  it("keeps the detail above a central marker and links back to it", () => {
    const placement = resolveRiskCalloutPlacement({
      anchorPoint: { x: 195, y: 360 },
      calloutHeight: 164,
      viewportHeight: 844,
      viewportWidth: 390,
    });

    assert.ok(placement.top < 360);
    assert.ok(placement.left >= 14);
    assert.ok(placement.connectorLength > 20);
    assert.equal(placement.width, 286);
  });

  it("moves below top-edge markers and remains inside compact phones", () => {
    const placement = resolveRiskCalloutPlacement({
      anchorPoint: { x: 20, y: 42 },
      calloutHeight: 190,
      viewportHeight: 667,
      viewportWidth: 320,
    });

    assert.ok(placement.top > 42);
    assert.equal(placement.left, 14);
    assert.ok(placement.left + placement.width <= 306);
    assert.ok(placement.connectorLength > 1);
  });

  it("presents the database-backed risk context without inventing absent fields", () => {
    const presentation = createRiskZoneExpandedPresentation({
      id: "risk-1",
      title: "Central disruption",
      description: "Elevated disruption is being monitored.",
      severity: "high",
      category: "Area Risk",
      coordinate: { latitude: 51.5, longitude: -0.1 },
      radiusMeters: 900,
      markerColor: "#d84a3f",
      strokeColor: "#d84a3f",
      fillColor: "rgba(216,74,63,0.18)",
      riskScore: 84,
      confidence: "analyst-reviewed",
      evidenceCount: 15,
      source: "Regional public intelligence",
      sourceDescription: "Verified regional reporting attached to this area.",
      sourceType: "system-generated",
      sourceUrl: "https://example.com/risk/central",
      sourceUrls: [
        "https://example.com/risk/central",
        "https://news.example.net/report/central",
      ],
      lastVerifiedAt: "2026-07-08T12:00:00Z",
      validUntil: "2026-08-08T12:00:00Z",
      recommendedActions: ["Use a parallel route"],
      escalationIndicators: [{
        label: "Road closures reported",
        evidenceCount: 4,
      }],
      linkedEntities: [{
        label: "Central Station",
        relation: "nearby",
        type: "transport-hub",
      }],
    });

    assert.deepEqual(
      presentation.facts.map(({ label, value }) => [label, value]),
      [
        ["Risk score", "84 / 100"],
        ["Confidence", "Analyst reviewed"],
        ["Evidence", "15 supporting records"],
        ["Area", "900 m radius"],
        ["Source", "Regional public intelligence"],
        ["Source type", "System generated"],
        ["Last verified", "8 Jul 2026"],
        ["Valid until", "8 Aug 2026"],
      ],
    );
    assert.deepEqual(presentation.actions, ["Use a parallel route"]);
    assert.equal(presentation.indicators[0].label, "Road closures reported");
    assert.equal("linkedEntities" in presentation, false);
    assert.deepEqual(presentation.sources, [
      {
        label: "example.com",
        description: "Verified regional reporting attached to this area.",
        url: "https://example.com/risk/central",
      },
      {
        label: "news.example.net",
        description: "Verified regional reporting attached to this area.",
        url: "https://news.example.net/report/central",
      },
    ]);
    assert.equal(
      presentation.description,
      "Elevated disruption is being monitored.",
    );
    assert.equal(presentation.context.length, 0);
  });
});
