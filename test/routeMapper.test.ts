import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDistance, mapRouteDtoToSavedPlan } from '../src/features/routes/routeMapper';

describe('SafeRoute mobile DTO mapper', () => {
  it('maps backend mobile route DTOs into app route plans', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-1',
      name: 'Airport transfer',
      mobile_status: 'ready',
      client_name: 'Acme',
      operation: 'Executive move',
      convoy_callsign: 'Lead 1',
      updated_at: new Date().toISOString(),
      origin: {
        label: 'Hotel',
        coordinate: { latitude: 51.5, longitude: -0.1 }
      },
      destination: {
        label: 'Airport',
        coordinate: { latitude: 51.52, longitude: -0.02 }
      },
      route: {
        id: 'variant-1',
        label: 'Primary',
        color: '#15b981',
        coordinates: [
          { latitude: 51.5, longitude: -0.1 },
          { latitude: 51.52, longitude: -0.02 }
        ],
        distance_meters: 8000,
        eta_label: '18 min',
        risk_score: 22,
        risk_level: 'low'
      },
      risk_overlays: [
        {
          id: 'risk-1',
          title: 'Crowd activity',
          severity: 'critical',
          category: 'civil-unrest',
          coordinate: { latitude: 51.51, longitude: -0.06 },
          radius_meters: 300
        }
      ]
    });

    assert.equal(plan.name, 'Airport transfer');
    assert.equal(plan.status, 'ready');
    assert.equal(plan.convoyCallsign, 'Lead 1');
    assert.equal(plan.origin, 'Hotel');
    assert.equal(plan.route.eta, '18 min');
    assert.equal(plan.route.distance, '8.0 km');
    assert.equal(plan.riskZones[0].severity, 'high');
    assert.equal(plan.checkpoints.length, 2);
  });

  it('preserves provider-snapped route geometry instead of collapsing to endpoint waypoints', () => {
    const snappedGeometry = [
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.502, longitude: -0.091 },
      { latitude: 51.507, longitude: -0.084 },
      { latitude: 51.514, longitude: -0.072 }
    ];
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-snapped',
      name: 'Snapped geometry route',
      origin: {
        label: 'Origin',
        coordinate: snappedGeometry[0]
      },
      destination: {
        label: 'Destination',
        coordinate: snappedGeometry[snappedGeometry.length - 1]
      },
      route: {
        coordinates: snappedGeometry,
        distance_meters: 2500
      }
    });

    assert.equal(plan.route.coordinates.length, snappedGeometry.length);
    assert.deepEqual(plan.route.coordinates, snappedGeometry);
  });

  it('falls back safely when route geometry is missing', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-empty',
      name: 'Sparse route',
      origin: { label: 'Origin' },
      destination: { label: 'Destination' },
      route: {}
    });

    assert.equal(plan.route.coordinates.length, 0);
    assert.equal(plan.route.eta, 'ETA pending');
    assert.equal(plan.region.latitude, 51.5072);
  });

  it('trims saved-route labels and keeps blank backend copy off route cards', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: ' route-labels ',
      name: '   ',
      description: '   ',
      client_name: '  Acme Security  ',
      operation: '   ',
      convoy_callsign: '   ',
      origin: {
        label: '  Depot  ',
        coordinate: { latitude: 51.5, longitude: -0.1 }
      },
      destination: {
        label: '   ',
        coordinate: { latitude: 51.52, longitude: -0.02 }
      },
      route: {
        id: ' primary-route ',
        label: '   ',
        eta_label: '  12 min  ',
        distance_label: '   ',
        distance_meters: 450,
        description: '   ',
        next_instruction: '   '
      },
      risk_overlays: [
        {
          id: ' risk-1 ',
          title: '   ',
          description: '   ',
          category: ' security-cordon ',
          shape: '   ',
          coordinate: { latitude: 51.51, longitude: -0.06 }
        }
      ],
      checkpoints: [
        {
          id: ' checkpoint-1 ',
          label: '  Alpha  ',
          caption: '  Start gate  ',
          coordinate: { latitude: 51.5, longitude: -0.1 },
          kind: 'origin'
        }
      ]
    });

    assert.equal(plan.id, 'route-labels');
    assert.equal(plan.name, 'SafeRoute plan');
    assert.equal(plan.operation, 'Acme Security');
    assert.equal(plan.convoyCallsign, 'Convoy');
    assert.equal(plan.origin, 'Depot');
    assert.equal(plan.destination, 'Destination');
    assert.equal(plan.route.id, 'primary-route');
    assert.equal(plan.route.label, 'Primary route');
    assert.equal(plan.route.eta, '12 min');
    assert.equal(plan.route.distance, '450 m');
    assert.equal(plan.route.description, 'Follow the saved SafeRoute geometry with live position guidance.');
    assert.equal(plan.route.nextInstruction, 'Continue on saved route');
    assert.equal(plan.riskZones[0].id, 'risk-1');
    assert.equal(plan.riskZones[0].title, 'Route risk');
    assert.equal(plan.riskZones[0].description, 'SafeRoute risk note');
    assert.equal(plan.riskZones[0].category, 'Security Cordon');
    assert.equal(plan.riskZones[0].shape, undefined);
    assert.equal(plan.checkpoints[0].id, 'checkpoint-1');
    assert.equal(plan.checkpoints[0].label, 'Alpha');
    assert.equal(plan.checkpoints[0].caption, 'Start gate');
  });

  it('maps structure sightline overlays with route segment and connector geometry', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-structure',
      name: 'Structure route',
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.1 },
          { latitude: 51.51, longitude: -0.06 }
        ]
      },
      risk_overlays: [
        {
          id: 'structure-osm-way-100',
          title: 'Tall office',
          severity: 'high',
          category: 'structure-exposure',
          shape: 'sightline',
          coordinate: { latitude: 51.511, longitude: -0.061 },
          coordinates: [
            { latitude: 51.505, longitude: -0.08 },
            { latitude: 51.51, longitude: -0.06 }
          ],
          connector_coordinates: [
            { latitude: 51.511, longitude: -0.061 },
            { latitude: 51.51, longitude: -0.06 }
          ],
          radius_meters: 640
        }
      ]
    });

    assert.equal(plan.riskZones[0].category, 'Structure Exposure');
    assert.equal(plan.riskZones[0].shape, 'sightline');
    assert.equal(plan.riskZones[0].routeSegmentCoordinates?.length, 2);
    assert.equal(plan.riskZones[0].connectorCoordinates?.length, 2);
    assert.equal(plan.riskZones[0].radiusMeters, 640);
  });

  it('maps platform polygon risk overlays as tappable risk areas rather than route lines', () => {
    const polygon = [
      { latitude: 51.501, longitude: -0.101 },
      { latitude: 51.501, longitude: -0.099 },
      { latitude: 51.503, longitude: -0.099 },
      { latitude: 51.503, longitude: -0.101 },
      { latitude: 51.501, longitude: -0.101 }
    ];
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-polygon-risk',
      name: 'Polygon risk route',
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.105 },
          { latitude: 51.5, longitude: -0.095 }
        ]
      },
      risk_overlays: [
        {
          id: 'risk-polygon-1',
          title: 'Security cordon',
          severity: 'high',
          category: 'security-cordon',
          shape: 'polygon',
          coordinate: { latitude: 51.502, longitude: -0.1 },
          coordinates: polygon
        }
      ]
    });

    assert.equal(plan.riskZones[0].shape, 'polygon');
    assert.equal(plan.riskZones[0].category, 'Security Cordon');
    assert.deepEqual(plan.riskZones[0].polygonCoordinates, polygon);
    assert.deepEqual(plan.riskZones[0].routeSegmentCoordinates, []);
  });

  it('derives a tappable marker anchor when polygon risk overlays omit a center coordinate', () => {
    const polygon = [
      { latitude: 51.501, longitude: -0.101 },
      { latitude: 51.501, longitude: -0.099 },
      { latitude: 51.503, longitude: -0.099 },
      { latitude: 51.503, longitude: -0.101 },
      { latitude: 51.501, longitude: -0.101 }
    ];
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-polygon-risk-no-anchor',
      name: 'Coordinate-free area route',
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.105 },
          { latitude: 51.5, longitude: -0.095 }
        ]
      },
      risk_overlays: [
        {
          id: 'risk-polygon-no-anchor',
          title: 'Police cordon',
          severity: 'medium',
          category: 'area-risk',
          shape: 'area',
          area_shape: 'polygon',
          coordinates: polygon
        }
      ]
    });

    assert.equal(plan.riskZones.length, 1);
    assert.deepEqual(plan.riskZones[0].polygonCoordinates, polygon);
    assertCoordinateNear(plan.riskZones[0].coordinate, {
      latitude: 51.502,
      longitude: -0.1
    });
  });

  it('supports camelCase areaShape polygon overlays from platform clients', () => {
    const polygon = [
      { latitude: 51.51, longitude: -0.06 },
      { latitude: 51.51, longitude: -0.058 },
      { latitude: 51.512, longitude: -0.058 },
      { latitude: 51.512, longitude: -0.06 }
    ];
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-camel-area-shape',
      name: 'Camel area shape route',
      risk_overlays: [
        {
          id: 'camel-area-risk',
          title: 'Managed zone',
          shape: 'area',
          area_shape: '   ',
          areaShape: 'polygon',
          coordinates: polygon
        }
      ]
    });

    assert.equal(plan.riskZones.length, 1);
    assert.equal(plan.riskZones[0].shape, 'area');
    assert.deepEqual(plan.riskZones[0].polygonCoordinates, polygon);
    assertCoordinateNear(plan.riskZones[0].coordinate, {
      latitude: 51.511,
      longitude: -0.059
    });
  });

  it('normalizes provider lat/lon route points and GeoJSON polygon risk areas', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-provider-geojson',
      name: 'Provider GeoJSON route',
      route: {
        coordinates: [
          { lat: 51.5, lon: -0.12 },
          { lat: 51.5, lon: -0.1 }
        ]
      },
      risk_overlays: [
        {
          id: 'geojson-risk-area',
          title: 'Provider risk area',
          severity: 'high',
          category: 'provider-risk',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-0.119, 51.501],
              [-0.117, 51.501],
              [-0.117, 51.503],
              [-0.119, 51.503],
              [-0.119, 51.501]
            ]]
          }
        }
      ]
    } as any);

    assert.deepEqual(plan.route.coordinates, [
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 51.5, longitude: -0.1 }
    ]);
    assert.equal(plan.riskZones.length, 1);
    assert.equal(plan.riskZones[0].shape, undefined);
    assert.equal(plan.riskZones[0].category, 'Provider Risk');
    assert.deepEqual(plan.riskZones[0].polygonCoordinates, [
      { latitude: 51.501, longitude: -0.119 },
      { latitude: 51.501, longitude: -0.117 },
      { latitude: 51.503, longitude: -0.117 },
      { latitude: 51.503, longitude: -0.119 },
      { latitude: 51.501, longitude: -0.119 }
    ]);
    assertCoordinateNear(plan.riskZones[0].coordinate, {
      latitude: 51.502,
      longitude: -0.118
    });
  });

  it('imports platform route-alert segments alongside risk overlays', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-alerts',
      name: 'Route alert route',
      route: {
        coordinates: [
          { latitude: 51.5, longitude: -0.12 },
          { latitude: 51.5, longitude: -0.1 }
        ]
      },
      route_alerts: [
        {
          id: 'road-suitability-alert',
          title: 'Road suitability',
          severity: 'medium',
          category: 'road-suitability',
          shape: 'route-alert',
          route_segment_coordinates: [
            { lat: 51.5, lon: -0.116 },
            { lat: 51.5, lon: -0.112 }
          ]
        }
      ],
      risk_overlays: [
        {
          id: 'road-suitability-alert',
          title: 'Duplicate risk overlay',
          coordinate: { latitude: 51.5, longitude: -0.114 }
        }
      ]
    } as any);

    assert.equal(plan.riskZones.length, 1);
    assert.equal(plan.riskZones[0].id, 'road-suitability-alert');
    assert.equal(plan.riskZones[0].title, 'Road suitability');
    assert.equal(plan.riskZones[0].category, 'Road Suitability');
    assert.deepEqual(plan.riskZones[0].routeSegmentCoordinates, [
      { latitude: 51.5, longitude: -0.116 },
      { latitude: 51.5, longitude: -0.112 }
    ]);
    assertCoordinateNear(plan.riskZones[0].coordinate, {
      latitude: 51.5,
      longitude: -0.114
    });
  });


  it('keeps malformed route payload collections from crashing the importer', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-malformed',
      name: 'Malformed import',
      route: {
        coordinates: 'not-an-array',
        eta_seconds: 540,
        distance_meters: '1520',
        next_distance_meters: '240',
        risk_score: '48',
        risk_level: 'unknown'
      },
      risk_overlays: 'not-an-array',
      checkpoints: 'not-an-array',
      origin: {
        label: 'Depot',
        coordinate: { latitude: '51.5', longitude: '-0.1' }
      },
      destination: {
        label: 'Embassy',
        coordinate: { latitude: 51.52, longitude: -0.02 }
      }
    } as any);

    assert.equal(plan.route.coordinates.length, 2);
    assert.equal(plan.route.eta, '9 min');
    assert.equal(plan.route.distance, '1.5 km');
    assert.equal(plan.route.nextDistance, '240 m');
    assert.equal(plan.route.safeScore, 48);
    assert.equal(plan.riskZones.length, 0);
    assert.equal(plan.checkpoints.length, 2);
  });

  it('normalizes backend enum casing and falls back from unsafe route colors', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-normalized-enums',
      name: 'Normalized route',
      mobile_status: ' IN_PROGRESS ',
      route: {
        color: 'javascript:alert(1)',
        risk_score: 82,
        risk_level: ' HIGH '
      },
      risk_overlays: [
        {
          title: 'Public order risk',
          severity: ' CRITICAL ',
          category: 'public order',
          coordinate: { latitude: 51.51, longitude: -0.06 }
        }
      ]
    });

    assert.equal(plan.status, 'in-progress');
    assert.equal(plan.route.riskLabel, 'High');
    assert.equal(plan.route.color, '#f3a32b');
    assert.equal(plan.route.mutedColor, 'rgba(243, 163, 43, 0.24)');
    assert.equal(plan.riskZones[0].severity, 'high');
  });

  it('keeps fallback overlay copy risk-first instead of internal intel jargon', () => {
    const plan = mapRouteDtoToSavedPlan({
      id: 'route-risk-copy',
      name: 'Risk copy route',
      risk_overlays: [
        {
          coordinate: { latitude: 51.51, longitude: -0.06 }
        }
      ]
    });

    assert.equal(plan.riskZones[0].title, 'Route risk');
    assert.equal(plan.riskZones[0].category, 'Risk');
    assert.equal(plan.riskZones[0].description, 'SafeRoute risk note');
  });


  it('formats distances for cards and guidance', () => {
    assert.equal(formatDistance(0), '0 m');
    assert.equal(formatDistance(420), '420 m');
    assert.equal(formatDistance(1520), '1.5 km');
  });
});

function assertCoordinateNear(
  actual: { latitude: number; longitude: number },
  expected: { latitude: number; longitude: number }
) {
  assert.ok(Math.abs(actual.latitude - expected.latitude) < 0.000001);
  assert.ok(Math.abs(actual.longitude - expected.longitude) < 0.000001);
}
