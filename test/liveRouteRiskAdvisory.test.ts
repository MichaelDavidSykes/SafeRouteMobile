import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LatLng } from "react-native-maps";
import type { RiskSeverity, RiskZone } from "../src/features/live-map/liveMapTypes";
import { createRouteRiskAdvisory } from "../src/features/live-map/liveRouteRiskAdvisory";
import { calculateRouteProgress } from "../src/features/live-map/routeProgress";

describe("live route risk advisory", () => {
  const routeCoordinates: LatLng[] = [
    { latitude: 51.5, longitude: -0.12 },
    { latitude: 51.5, longitude: -0.1 },
  ];

  it("surfaces the highest-priority risk close ahead without expanding map chrome", () => {
    const progress = calculateRouteProgress(routeCoordinates, routeCoordinates[0]);
    const advisory = createRouteRiskAdvisory({
      progress,
      routeCoordinates,
      riskZones: [
        createRiskZone({
          id: "low-near",
          longitude: -0.119,
          severity: "low",
          title: "Minor congestion",
        }),
        createRiskZone({
          id: "high-near",
          longitude: -0.118,
          severity: "high",
          title: "Checkpoint delay",
          description: "Expect slow traffic at the checkpoint.",
        }),
      ],
    });

    assert.ok(advisory);
    assert.equal(advisory.severity, "high");
    assert.equal(advisory.tone, "danger");
    assert.match(advisory.visibleLabel, /^High risk ahead · \d+ m$/);
    assert.match(
      advisory.accessibilityLabel,
      /^High risk ahead in \d+ m\. Checkpoint delay\. Expect slow traffic at the checkpoint\.$/,
    );
  });

  it("prefers an immediate route note over a distant higher-severity alert", () => {
    const progress = calculateRouteProgress(routeCoordinates, routeCoordinates[0]);
    const advisory = createRouteRiskAdvisory({
      progress,
      routeCoordinates,
      riskZones: [
        createRiskZone({
          id: "low-immediate",
          longitude: -0.119,
          severity: "low",
          title: "School traffic",
        }),
        createRiskZone({
          id: "high-distant",
          longitude: -0.11,
          severity: "high",
          title: "Major incident",
        }),
      ],
    });

    assert.ok(advisory);
    assert.equal(advisory.severity, "low");
    assert.equal(advisory.tone, "info");
    assert.match(advisory.visibleLabel, /^Risk note ahead · \d+ m$/);
  });

  it("announces current route risk and ignores stale risk already behind the convoy", () => {
    const currentProgress = calculateRouteProgress(routeCoordinates, {
      latitude: 51.5,
      longitude: -0.1185,
    });
    const currentAdvisory = createRouteRiskAdvisory({
      progress: currentProgress,
      routeCoordinates,
      riskZones: [
        createRiskZone({
          id: "current-risk",
          longitude: -0.1185,
          radiusMeters: 120,
          severity: "medium",
          title: "Narrow carriageway",
        }),
      ],
    });

    assert.ok(currentAdvisory);
    assert.equal(currentAdvisory.visibleLabel, "Risk here");

    const finishedProgress = calculateRouteProgress(routeCoordinates, routeCoordinates[1]);
    const staleAdvisory = createRouteRiskAdvisory({
      progress: finishedProgress,
      routeCoordinates,
      riskZones: [
        createRiskZone({
          id: "behind-risk",
          longitude: -0.119,
          severity: "high",
          title: "Old checkpoint",
        }),
      ],
    });

    assert.equal(staleAdvisory, null);
  });

  it("stays quiet while off route, after arrival, or with no nearby risk notes", () => {
    const offRouteProgress = calculateRouteProgress(routeCoordinates, {
      latitude: 51.51,
      longitude: -0.12,
    });
    assert.ok(offRouteProgress?.isOffRoute);
    assert.equal(
      createRouteRiskAdvisory({
        progress: offRouteProgress,
        routeCoordinates,
        riskZones: [
          createRiskZone({
            id: "near-start",
            longitude: -0.119,
            severity: "high",
            title: "Near start",
          }),
        ],
      }),
      null,
    );

    const arrivedProgress = calculateRouteProgress(routeCoordinates, routeCoordinates[1]);
    assert.ok(arrivedProgress?.isArrived);
    assert.equal(
      createRouteRiskAdvisory({
        progress: arrivedProgress,
        routeCoordinates,
        riskZones: [
          createRiskZone({
            id: "destination-risk",
            longitude: -0.1,
            severity: "high",
            title: "At destination",
          }),
        ],
      }),
      null,
    );

    const clearProgress = calculateRouteProgress(routeCoordinates, routeCoordinates[0]);
    assert.equal(
      createRouteRiskAdvisory({
        progress: clearProgress,
        routeCoordinates,
        riskZones: [
          createRiskZone({
            id: "too-far",
            longitude: -0.11,
            severity: "high",
            title: "Distant incident",
          }),
        ],
        lookaheadMeters: 200,
      }),
      null,
    );
  });

  it("ignores risk zones that are ahead but outside the route alert corridor", () => {
    const progress = calculateRouteProgress(routeCoordinates, routeCoordinates[0]);
    const advisory = createRouteRiskAdvisory({
      progress,
      routeCoordinates,
      riskZones: [
        {
          ...createRiskZone({
            id: "far-lateral-risk",
            longitude: -0.118,
            radiusMeters: 50,
            severity: "high",
            title: "Far lateral risk",
          }),
          coordinate: { latitude: 51.51, longitude: -0.118 },
        },
      ],
      lookaheadMeters: 900,
    });

    assert.equal(advisory, null);
  });
});

function createRiskZone({
  description = "",
  id,
  longitude,
  radiusMeters = 50,
  severity,
  title,
}: {
  description?: string;
  id: string;
  longitude: number;
  radiusMeters?: number;
  severity: RiskSeverity;
  title: string;
}): RiskZone {
  return {
    id,
    title,
    description,
    severity,
    category: "test",
    coordinate: { latitude: 51.5, longitude },
    radiusMeters,
    markerColor: "#FF9F0A",
    strokeColor: "#FF9F0A",
    fillColor: "rgba(255, 159, 10, 0.18)",
  };
}
