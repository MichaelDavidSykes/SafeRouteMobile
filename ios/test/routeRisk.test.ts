import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGuestRoutePlan } from "../src/features/guest-map/guestRoutePlanner";
import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import { DEFAULT_ROUTE_INTELLIGENCE_VISIBLE } from "../src/features/live-map/liveMapUiState";
import {
  auditRouteRiskAvoidance,
  buildRouteRiskAlertSegment,
  calculateRiskZoneRouteProximity,
  createLiveRouteRiskAlertPresentation,
  createRiskZoneDetailPresentation,
  LIVE_RISK_VISIBLE_BODY_MAX_LENGTH,
  LIVE_RISK_VISIBLE_CATEGORY_MAX_LENGTH,
  LIVE_RISK_VISIBLE_TITLE_MAX_LENGTH,
  resolveLiveRouteRiskAlert,
  resolveVisibleRiskZones,
  routeRiskStartBlockedReason,
  ROUTE_RISK_AVOIDANCE_CLEARANCE_METERS,
} from "../src/features/live-map/routeRisk";
import { calculateRouteProgress } from "../src/features/live-map/routeProgress";
import { mapRouteDtoToSavedPlan } from "../src/features/routes/routeMapper";

describe("SafeRoute risk-aware route behavior", () => {
  it("keeps saved and guest routes outside mapped risk areas", () => {
    const routePlans = [
      ...SAVED_ROUTE_PLANS,
      createGuestRoutePlan({
        origin: "HQ",
        destination: "London City Airport",
      }),
    ];

    for (const routePlan of routePlans) {
      const audit = auditRouteRiskAvoidance(routePlan);
      assert.deepEqual(
        audit.violations.map((proximity) => ({
          clearanceMeters: Math.round(proximity.clearanceMeters),
          routeId: routePlan.id,
          zoneId: proximity.zone.id,
        })),
        [],
        `${routePlan.id} should avoid every visible risk area by at least ${ROUTE_RISK_AVOIDANCE_CLEARANCE_METERS} m`,
      );
    }
  });

  it("uses route projection to prove snapping and risk avoidance are measured from the route line", () => {
    const routePlan = SAVED_ROUTE_PLANS[0];
    const riskZone = routePlan.riskZones.find((zone) => zone.id === "bank-congestion");

    assert.ok(riskZone);

    const proximity = calculateRiskZoneRouteProximity(
      routePlan.route.coordinates,
      riskZone,
    );

    assert.ok(proximity);
    assert.equal(proximity.zone.id, "bank-congestion");
    assert.ok(proximity.routeDistanceAlongMeters > 3800);
    assert.ok(proximity.routeDistanceAlongMeters < 4400);
    assert.ok(proximity.clearanceMeters > 300);
  });

  it("shows live route risk alerts while traveling near the SafeRoute risk corridor", () => {
    const routePlan = createGuestRoutePlan({
      origin: "HQ",
      destination: "London City Airport",
    });
    const progress = calculateRouteProgress(
      routePlan.route.coordinates,
      routePlan.route.coordinates[0],
    );
    const alert = resolveLiveRouteRiskAlert({
      navigationState: "navigating",
      progress,
      routePlan,
    });

    assert.ok(alert);
    assert.equal(alert.zone.id, "guest-event-traffic");
    assert.ok(
      alert.status === "nearby" || alert.status === "approaching",
      `unexpected alert status: ${alert.status}`,
    );

    const presentation = createLiveRouteRiskAlertPresentation(alert);
    assert.match(presentation.accessibilityLabel, /Event traffic/);
    assert.match(presentation.accessibilityLabel, /Route clears by/);
    assert.ok(presentation.detailLabel.length > 0);
  });

  it("normalizes sparse risk alert titles before they reach the live overlay", () => {
    const baseRoutePlan = createGuestRoutePlan({
      origin: "HQ",
      destination: "London City Airport",
    });
    const routePlan = {
      ...baseRoutePlan,
      riskZones: [
        {
          ...baseRoutePlan.riskZones[0],
          title: " \n\t ",
          category: "   ",
          description: "   ",
        },
      ],
    };
    const progress = calculateRouteProgress(
      routePlan.route.coordinates,
      routePlan.route.coordinates[0],
    );
    const alert = resolveLiveRouteRiskAlert({
      navigationState: "navigating",
      progress,
      routePlan,
    });

    assert.ok(alert);
    const alertPresentation = createLiveRouteRiskAlertPresentation(alert);
    assert.equal(alertPresentation.zoneTitle, "Route risk");
    assert.equal(alertPresentation.metaLabel, "Medium risk · Route risk");
    assert.doesNotMatch(alertPresentation.accessibilityLabel, /\.\s+\./);

    const detailPresentation = createRiskZoneDetailPresentation({
      proximity: alert.proximity,
      zone: alert.zone,
    });
    assert.equal(detailPresentation.title, "Route risk");
    assert.match(detailPresentation.accessibilityLabel, /^Risk area\. Route risk\./);
  });

  it("bounds verbose live risk card copy while preserving full risk context for VoiceOver", () => {
    const verboseTitle =
      "Temporary controlled checkpoint with extended inspection delays";
    const verboseCategory = "Operational checkpoint advisory";
    const verboseDescription =
      "Expect intermittent closures and queueing near the checkpoint while SafeRoute keeps the route outside the mapped area.";
    const baseRoutePlan = createGuestRoutePlan({
      origin: "HQ",
      destination: "London City Airport",
    });
    const routePlan = {
      ...baseRoutePlan,
      riskZones: [
        {
          ...baseRoutePlan.riskZones[0],
          title: `  ${verboseTitle}  `,
          category: `  ${verboseCategory}  `,
          description: `  ${verboseDescription}  `,
        },
      ],
    };
    const progress = calculateRouteProgress(
      routePlan.route.coordinates,
      routePlan.route.coordinates[0],
    );
    const alert = resolveLiveRouteRiskAlert({
      navigationState: "navigating",
      progress,
      routePlan,
    });

    assert.ok(alert);
    const alertPresentation = createLiveRouteRiskAlertPresentation(alert);
    assert.ok(alertPresentation.zoneTitle.length <= LIVE_RISK_VISIBLE_TITLE_MAX_LENGTH);
    assert.ok(alertPresentation.zoneTitle.endsWith("…"));
    assert.ok(alertPresentation.metaLabel.includes("Operational checkpoint…"));
    assert.ok(alertPresentation.metaLabel.length <= (
      "Medium risk · ".length + LIVE_RISK_VISIBLE_CATEGORY_MAX_LENGTH
    ));
    assert.ok(alertPresentation.accessibilityLabel.includes(verboseTitle));
    assert.ok(!alertPresentation.accessibilityLabel.includes(alertPresentation.zoneTitle));

    const detailPresentation = createRiskZoneDetailPresentation({
      proximity: alert.proximity,
      zone: alert.zone,
    });

    assert.ok(detailPresentation.title.length <= LIVE_RISK_VISIBLE_TITLE_MAX_LENGTH);
    assert.ok(detailPresentation.title.endsWith("…"));
    assert.ok(detailPresentation.body.length <= LIVE_RISK_VISIBLE_BODY_MAX_LENGTH);
    assert.ok(detailPresentation.body.endsWith("…"));
    assert.ok(detailPresentation.metaLabel.includes("Operational checkpoint…"));
    assert.ok(detailPresentation.accessibilityLabel.includes(verboseTitle));
    assert.ok(detailPresentation.accessibilityLabel.includes(verboseCategory));
    assert.ok(detailPresentation.accessibilityLabel.includes(verboseDescription));
  });

  it("keeps the live overlay minimal by showing only active risk unless the user expands all risks", () => {
    const routePlan = createGuestRoutePlan({
      origin: "HQ",
      destination: "London City Airport",
    });
    const progress = calculateRouteProgress(
      routePlan.route.coordinates,
      routePlan.route.coordinates[0],
    );
    const alert = resolveLiveRouteRiskAlert({
      navigationState: "navigating",
      progress,
      routePlan,
    });

    assert.ok(alert);

    assert.deepEqual(
      resolveVisibleRiskZones({
        alertsVisible: false,
        liveRiskAlert: alert,
        navigationState: "navigating",
        riskZones: routePlan.riskZones,
      }).map((zone) => zone.id),
      [alert.zone.id],
    );

    assert.deepEqual(
      resolveVisibleRiskZones({
        alertsVisible: true,
        liveRiskAlert: alert,
        navigationState: "navigating",
        riskZones: routePlan.riskZones,
      }).map((zone) => zone.id),
      routePlan.riskZones.map((zone) => zone.id),
    );

    assert.deepEqual(
      resolveVisibleRiskZones({
        alertsVisible: false,
        liveRiskAlert: alert,
        navigationState: "loaded",
        riskZones: routePlan.riskZones,
      }),
      [],
    );
  });

  it("shows every risk area and route alert by default", () => {
    const routePlan = createGuestRoutePlan({
      origin: "HQ",
      destination: "London City Airport",
    });

    assert.deepEqual(
      resolveVisibleRiskZones({
        alertsVisible: DEFAULT_ROUTE_INTELLIGENCE_VISIBLE,
        liveRiskAlert: null,
        navigationState: "loaded",
        riskZones: routePlan.riskZones,
      }).map((zone) => zone.id),
      routePlan.riskZones.map((zone) => zone.id),
    );
  });

  it("creates tappable risk-detail copy with route-clearance context", () => {
    const routePlan = createGuestRoutePlan({
      origin: "HQ",
      destination: "London City Airport",
    });
    const zone = routePlan.riskZones[0];
    const proximity = calculateRiskZoneRouteProximity(
      routePlan.route.coordinates,
      zone,
    );
    const presentation = createRiskZoneDetailPresentation({ proximity, zone });

    assert.equal(presentation.title, "Event traffic");
    assert.match(presentation.metaLabel, /Medium risk · Traffic · \d+ m radius/);
    assert.match(presentation.clearanceLabel, /Route clears by/);
    assert.match(presentation.accessibilityLabel, /Risk area\. Event traffic\./);
  });

  it("audits polygon risk areas from the SafeRoute platform, not just circular overlays", () => {
    const clearPlan = mapRouteDtoToSavedPlan({
      id: "polygon-clear-route",
      name: "Polygon clear route",
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.105 },
          { latitude: 51.5, longitude: -0.095 },
        ],
      },
      risk_overlays: [
        {
          id: "security-cordon",
          title: "Security cordon",
          severity: "high",
          category: "security-cordon",
          shape: "polygon",
          coordinate: { latitude: 51.502, longitude: -0.1 },
          coordinates: [
            { latitude: 51.501, longitude: -0.101 },
            { latitude: 51.501, longitude: -0.099 },
            { latitude: 51.503, longitude: -0.099 },
            { latitude: 51.503, longitude: -0.101 },
            { latitude: 51.501, longitude: -0.101 },
          ],
        },
      ],
    });
    const crossingPlan = mapRouteDtoToSavedPlan({
      id: "polygon-crossing-route",
      name: "Polygon crossing route",
      route: {
        coordinates: [
          { latitude: 51.502, longitude: -0.105 },
          { latitude: 51.502, longitude: -0.095 },
        ],
      },
      risk_overlays: [
        {
          id: "security-cordon",
          title: "Security cordon",
          severity: "high",
          category: "security-cordon",
          shape: "polygon",
          coordinate: { latitude: 51.502, longitude: -0.1 },
          coordinates: [
            { latitude: 51.501, longitude: -0.101 },
            { latitude: 51.501, longitude: -0.099 },
            { latitude: 51.503, longitude: -0.099 },
            { latitude: 51.503, longitude: -0.101 },
            { latitude: 51.501, longitude: -0.101 },
          ],
        },
      ],
    });

    const clearProximity = calculateRiskZoneRouteProximity(
      clearPlan.route.coordinates,
      clearPlan.riskZones[0],
    );
    assert.ok(clearProximity);
    assert.equal(clearProximity.areaShape, "polygon");
    assert.ok(clearProximity.clearanceMeters > ROUTE_RISK_AVOIDANCE_CLEARANCE_METERS);
    assert.equal(routeRiskStartBlockedReason(clearPlan), null);

    const crossingAudit = auditRouteRiskAvoidance(crossingPlan);
    assert.equal(crossingAudit.violations.length, 1);
    assert.match(
      routeRiskStartBlockedReason(crossingPlan) || "",
      /Route intersects Security cordon\. Re-sync route in SafeRoute planner/,
    );
    const advisoryPlan = {
      ...crossingPlan,
      riskZones: crossingPlan.riskZones.map((zone) => ({
        ...zone,
        severity: "medium" as const,
      })),
    };
    assert.equal(auditRouteRiskAvoidance(advisoryPlan).violations.length, 1);
    assert.equal(routeRiskStartBlockedReason(advisoryPlan), null);
  });

  it("keeps blocked-start risk copy punctuation-clean for VoiceOver", () => {
    const crossingRoute = {
      coordinates: [
        { latitude: 51.502, longitude: -0.105 },
        { latitude: 51.502, longitude: -0.095 },
      ],
    };
    const crossingPolygon = [
      { latitude: 51.501, longitude: -0.101 },
      { latitude: 51.501, longitude: -0.099 },
      { latitude: 51.503, longitude: -0.099 },
      { latitude: 51.503, longitude: -0.101 },
      { latitude: 51.501, longitude: -0.101 },
    ];
    const punctuatedPlan = mapRouteDtoToSavedPlan({
      id: "punctuated-risk-route",
      name: "Punctuated risk route",
      route: crossingRoute,
      risk_overlays: [
        {
          id: "punctuated-risk-area",
          title: "  Security cordon.  ",
          severity: "high",
          category: "security-cordon",
          shape: "polygon",
          coordinate: { latitude: 51.502, longitude: -0.1 },
          coordinates: crossingPolygon,
        },
      ],
    });
    const punctuationOnlyPlan = mapRouteDtoToSavedPlan({
      id: "fallback-risk-route",
      name: "Fallback risk route",
      route: crossingRoute,
      risk_overlays: [
        {
          id: "fallback-risk-area",
          title: " !!! ",
          severity: "high",
          category: "security-cordon",
          shape: "polygon",
          coordinate: { latitude: 51.502, longitude: -0.1 },
          coordinates: crossingPolygon,
        },
      ],
    });

    assert.equal(
      routeRiskStartBlockedReason(punctuatedPlan),
      "Route intersects Security cordon. Re-sync route in SafeRoute planner before starting guidance.",
    );
    assert.equal(
      routeRiskStartBlockedReason(punctuationOnlyPlan),
      "Route intersects a mapped risk area. Re-sync route in SafeRoute planner before starting guidance.",
    );
  });

  it("keeps polygon risk alerts live as the convoy approaches mapped platform areas", () => {
    const routePlan = mapRouteDtoToSavedPlan({
      id: "polygon-alert-route",
      name: "Polygon alert route",
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.105 },
          { latitude: 51.5, longitude: -0.095 },
        ],
      },
      risk_overlays: [
        {
          id: "platform-risk-area",
          title: "Platform risk area",
          severity: "medium",
          category: "public-order",
          shape: "polygon",
          coordinate: { latitude: 51.5008, longitude: -0.1 },
          coordinates: [
            { latitude: 51.5007, longitude: -0.101 },
            { latitude: 51.5007, longitude: -0.099 },
            { latitude: 51.502, longitude: -0.099 },
            { latitude: 51.502, longitude: -0.101 },
          ],
        },
      ],
    });
    const progress = calculateRouteProgress(
      routePlan.route.coordinates,
      routePlan.route.coordinates[0],
    );
    const alert = resolveLiveRouteRiskAlert({
      navigationState: "navigating",
      progress,
      routePlan,
    });

    assert.ok(alert);
    assert.equal(alert.proximity.areaShape, "polygon");
    assert.equal(alert.zone.id, "platform-risk-area");
    assert.match(
      createLiveRouteRiskAlertPresentation(alert).accessibilityLabel,
      /mapped area/,
    );
  });

  it("draws route-alert segments on the route line for nearby SafeRoute risks", () => {
    const routePlan = createGuestRoutePlan({
      origin: "HQ",
      destination: "London City Airport",
    });
    const nearSegment = buildRouteRiskAlertSegment(
      routePlan.route.coordinates,
      routePlan.riskZones[0],
    );
    const distantSegment = buildRouteRiskAlertSegment(
      routePlan.route.coordinates,
      {
        ...routePlan.riskZones[0],
        id: "distant-risk",
        coordinate: { latitude: 51.56, longitude: -0.1433 },
      },
    );

    assert.ok(nearSegment.length > 1);
    assert.deepEqual(distantSegment, []);
  });

  it("keeps platform route-alert segments advisory instead of blocking route start", () => {
    const routePlan = mapRouteDtoToSavedPlan({
      id: "route-segment-alert-route",
      name: "Route segment alert route",
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.12 },
          { latitude: 51.5, longitude: -0.1 },
        ],
      },
      route_alerts: [
        {
          id: "provider-road-alert",
          title: "Road suitability",
          severity: "medium",
          category: "road-suitability",
          shape: "route-alert",
          route_segment_coordinates: [
            { lat: 51.5, lon: -0.116 },
            { lat: 51.5, lon: -0.112 },
          ],
        },
      ],
    } as any);
    const zone = routePlan.riskZones[0];
    const proximity = calculateRiskZoneRouteProximity(
      routePlan.route.coordinates,
      zone,
    );

    assert.equal(routeRiskStartBlockedReason(routePlan), null);
    assert.ok(proximity);
    assert.equal(proximity.radiusMeters, 0);

    const detail = createRiskZoneDetailPresentation({ proximity, zone });
    assert.match(detail.metaLabel, /route segment/);
    assert.equal(detail.clearanceLabel, "Route alert on saved line");
  });

  it("uses the raw live vehicle coordinate for risk alerts when off the snapped route", () => {
    const routePlan = mapRouteDtoToSavedPlan({
      id: "off-route-risk-route",
      name: "Off route risk route",
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.12 },
          { latitude: 51.5, longitude: -0.1 },
        ],
      },
      risk_overlays: [
        {
          id: "off-route-risk",
          title: "Off-route incident",
          severity: "high",
          category: "incident",
          coordinate: { latitude: 51.506, longitude: -0.12 },
          radius_meters: 120,
        },
      ],
    });
    const rawVehicleCoordinate = { latitude: 51.506, longitude: -0.12 };
    const progress = calculateRouteProgress(
      routePlan.route.coordinates,
      rawVehicleCoordinate,
    );

    assert.ok(progress?.isOffRoute);
    assert.equal(
      resolveLiveRouteRiskAlert({
        navigationState: "off-route",
        progress,
        routePlan,
      }),
      null,
    );

    const alert = resolveLiveRouteRiskAlert({
      navigationState: "off-route",
      progress,
      routePlan,
      vehicleCoordinate: rawVehicleCoordinate,
    });

    assert.ok(alert);
    assert.equal(alert.status, "inside");
    assert.equal(alert.vehicleInsideRiskArea, true);
  });

  it("treats polygon boundaries as active risk area contact during live guidance", () => {
    const routePlan = mapRouteDtoToSavedPlan({
      id: "polygon-boundary-route",
      name: "Polygon boundary route",
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.12 },
          { latitude: 51.5, longitude: -0.1 },
        ],
      },
      risk_overlays: [
        {
          id: "boundary-area",
          title: "Boundary area",
          severity: "medium",
          category: "area-risk",
          shape: "polygon",
          coordinates: [
            { latitude: 51.5, longitude: -0.116 },
            { latitude: 51.501, longitude: -0.116 },
            { latitude: 51.501, longitude: -0.114 },
            { latitude: 51.5, longitude: -0.114 },
          ],
        },
      ],
    });
    const boundaryCoordinate = { latitude: 51.5, longitude: -0.115 };
    const progress = calculateRouteProgress(
      routePlan.route.coordinates,
      boundaryCoordinate,
    );
    const alert = resolveLiveRouteRiskAlert({
      navigationState: "navigating",
      progress,
      routePlan,
      vehicleCoordinate: boundaryCoordinate,
    });

    assert.ok(alert);
    assert.equal(alert.status, "inside");
    assert.equal(
      routeRiskStartBlockedReason(routePlan),
      null,
      "medium-severity boundary contact should remain a live advisory rather than blocking navigation",
    );
  });
});
