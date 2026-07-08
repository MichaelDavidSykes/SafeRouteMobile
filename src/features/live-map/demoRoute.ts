import type { SavedSafeRoutePlan } from './liveMapTypes';

const cityTransferRiskZones = [
  {
    id: 'bank-congestion',
    title: 'Traffic pressure',
    description: 'Slow eastbound movement around Bank',
    severity: 'medium' as const,
    category: 'Traffic',
    coordinate: { latitude: 51.5134, longitude: -0.089 },
    radiusMeters: 420,
    markerColor: '#f3a32b',
    strokeColor: 'rgba(243, 163, 43, 0.72)',
    fillColor: 'rgba(243, 163, 43, 0.18)'
  },
  {
    id: 'tower-gathering',
    title: 'Crowd activity',
    description: 'Public gathering near Tower Hill',
    severity: 'high' as const,
    category: 'Crowd',
    coordinate: { latitude: 51.5098, longitude: -0.0766 },
    radiusMeters: 520,
    markerColor: '#d84a3f',
    strokeColor: 'rgba(216, 74, 63, 0.72)',
    fillColor: 'rgba(216, 74, 63, 0.18)'
  },
  {
    id: 'a13-roadworks',
    title: 'Roadworks',
    description: 'Lane disruption on approach corridor',
    severity: 'low' as const,
    category: 'Works',
    coordinate: { latitude: 51.5113, longitude: 0.0139 },
    radiusMeters: 460,
    markerColor: '#5c8df6',
    strokeColor: 'rgba(92, 141, 246, 0.72)',
    fillColor: 'rgba(92, 141, 246, 0.16)'
  }
];

export const SAVED_ROUTE_PLANS: SavedSafeRoutePlan[] = [
  {
    id: 'sr-city-airport-alpha',
    name: 'City Airport transfer',
    operation: 'Executive movement',
    status: 'ready',
    convoyCallsign: 'Alpha convoy',
    updatedAtLabel: 'Updated 4 min ago',
    origin: 'Mayfair, London',
    destination: 'London City Airport',
    region: {
      latitude: 51.512,
      longitude: -0.044,
      latitudeDelta: 0.085,
      longitudeDelta: 0.13
    },
    route: {
      id: 'route-city-airport-safe',
      label: 'Safe corridor',
      eta: '38 min',
      distance: '15.8 km',
      safeScore: 91,
      riskLabel: 'Low',
      tone: 'safe',
      color: '#15b981',
      mutedColor: 'rgba(21, 185, 129, 0.24)',
      description: 'Avoids crowd activity and keeps the final approach on monitored corridors.',
      nextInstruction: 'Keep right toward A13 secure corridor',
      nextDistance: '1.2 km',
      coordinates: [
        { latitude: 51.5099, longitude: -0.1479 },
        { latitude: 51.5117, longitude: -0.1277 },
        { latitude: 51.5139, longitude: -0.1001 },
        { latitude: 51.5148, longitude: -0.0732 },
        { latitude: 51.5142, longitude: -0.0413 },
        { latitude: 51.5137, longitude: 0.0087 },
        { latitude: 51.5053, longitude: 0.0553 }
      ]
    },
    riskZones: cityTransferRiskZones,
    checkpoints: [
      {
        id: 'origin',
        label: 'A',
        caption: 'Origin',
        coordinate: { latitude: 51.5099, longitude: -0.1479 },
        kind: 'origin'
      },
      {
        id: 'destination',
        label: 'B',
        caption: 'Destination',
        coordinate: { latitude: 51.5053, longitude: 0.0553 },
        kind: 'destination'
      }
    ]
  },
  {
    id: 'sr-docklands-low-profile',
    name: 'Docklands low-profile route',
    operation: 'Low signature movement',
    status: 'planned',
    convoyCallsign: 'Bravo convoy',
    updatedAtLabel: 'Updated 22 min ago',
    origin: "King's Cross",
    destination: 'Canary Wharf',
    region: {
      latitude: 51.518,
      longitude: -0.055,
      latitudeDelta: 0.075,
      longitudeDelta: 0.115
    },
    route: {
      id: 'route-docklands-profile',
      label: 'Low profile',
      eta: '29 min',
      distance: '10.9 km',
      safeScore: 84,
      riskLabel: 'Guarded',
      tone: 'blue',
      color: '#5c8df6',
      mutedColor: 'rgba(92, 141, 246, 0.22)',
      description: 'Minimizes exposed stops and keeps reroute options close through east London.',
      nextInstruction: 'Hold eastbound through Old Street',
      nextDistance: '800 m',
      coordinates: [
        { latitude: 51.5308, longitude: -0.1238 },
        { latitude: 51.5268, longitude: -0.0999 },
        { latitude: 51.525, longitude: -0.0745 },
        { latitude: 51.5203, longitude: -0.0513 },
        { latitude: 51.5134, longitude: -0.026 },
        { latitude: 51.5055, longitude: -0.0195 }
      ]
    },
    riskZones: [
      {
        id: 'old-street-works',
        title: 'Lane restriction',
        description: 'Possible slowing near Old Street',
        severity: 'medium',
        category: 'Works',
        coordinate: { latitude: 51.525, longitude: -0.087 },
        radiusMeters: 390,
        markerColor: '#f3a32b',
        strokeColor: 'rgba(243, 163, 43, 0.72)',
        fillColor: 'rgba(243, 163, 43, 0.18)'
      }
    ],
    checkpoints: [
      {
        id: 'origin',
        label: 'A',
        caption: 'Origin',
        coordinate: { latitude: 51.5308, longitude: -0.1238 },
        kind: 'origin'
      },
      {
        id: 'destination',
        label: 'B',
        caption: 'Destination',
        coordinate: { latitude: 51.5055, longitude: -0.0195 },
        kind: 'destination'
      }
    ]
  },
  {
    id: 'sr-westbound-heathrow',
    name: 'Westbound airport route',
    operation: 'Airport transfer',
    status: 'ready',
    convoyCallsign: 'Charlie convoy',
    updatedAtLabel: 'Updated 1 hr ago',
    origin: 'Westminster',
    destination: 'Heathrow T5',
    region: {
      latitude: 51.492,
      longitude: -0.265,
      latitudeDelta: 0.13,
      longitudeDelta: 0.28
    },
    route: {
      id: 'route-heathrow-ready',
      label: 'Primary westbound',
      eta: '44 min',
      distance: '27.2 km',
      safeScore: 78,
      riskLabel: 'Moderate',
      tone: 'amber',
      color: '#f3a32b',
      mutedColor: 'rgba(243, 163, 43, 0.22)',
      description: 'Uses a faster westbound corridor while monitoring congestion and overpass exposure.',
      nextInstruction: 'Continue west toward Hammersmith',
      nextDistance: '2.1 km',
      coordinates: [
        { latitude: 51.4995, longitude: -0.1248 },
        { latitude: 51.4934, longitude: -0.1672 },
        { latitude: 51.4927, longitude: -0.2241 },
        { latitude: 51.4892, longitude: -0.289 },
        { latitude: 51.4817, longitude: -0.3724 },
        { latitude: 51.4706, longitude: -0.4874 }
      ]
    },
    riskZones: [
      {
        id: 'hammersmith-pressure',
        title: 'Congestion risk',
        description: 'Heavy traffic forecast at Hammersmith',
        severity: 'medium',
        category: 'Traffic',
        coordinate: { latitude: 51.4927, longitude: -0.2241 },
        radiusMeters: 680,
        markerColor: '#f3a32b',
        strokeColor: 'rgba(243, 163, 43, 0.72)',
        fillColor: 'rgba(243, 163, 43, 0.18)'
      }
    ],
    checkpoints: [
      {
        id: 'origin',
        label: 'A',
        caption: 'Origin',
        coordinate: { latitude: 51.4995, longitude: -0.1248 },
        kind: 'origin'
      },
      {
        id: 'destination',
        label: 'B',
        caption: 'Destination',
        coordinate: { latitude: 51.4706, longitude: -0.4874 },
        kind: 'destination'
      }
    ]
  }
];

export function getSavedRoutePlan(routeId: string): SavedSafeRoutePlan | undefined {
  return SAVED_ROUTE_PLANS.find((route) => route.id === routeId);
}
