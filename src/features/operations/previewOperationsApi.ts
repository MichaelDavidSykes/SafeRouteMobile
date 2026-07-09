import { SAVED_ROUTE_PLANS } from "../live-map/demoRoute";
import type { SafeRouteOperationsState } from "./operationsTypes";

export const PREVIEW_OPERATIONS_CLIENT_ID = "preview-routes";

export function loadPreviewOperationsState(clientId?: string | null): SafeRouteOperationsState {
  const normalizedClientId = String(clientId || "").trim() || PREVIEW_OPERATIONS_CLIENT_ID;

  if (normalizedClientId !== PREVIEW_OPERATIONS_CLIENT_ID) {
    return {
      client_id: normalizedClientId,
      people: [],
      vehicles: [],
      trips: [],
      updated_at: ""
    };
  }

  const [airportRoute, docklandsRoute, westboundRoute] = SAVED_ROUTE_PLANS;
  const now = createPreviewMovementDate(0, 9, 30);
  const later = createPreviewMovementDate(1, 14, 15);
  const standby = createPreviewMovementDate(3, 8, 45);

  return {
    client_id: PREVIEW_OPERATIONS_CLIENT_ID,
    updated_at: createPreviewMovementDate(0, 7, 15),
    people: [
      {
        id: "person-principal",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        name: "Principal",
        callsign: "VIP 1",
        role: "principal",
        contact: null,
        notes: null,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: "person-driver-alpha",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        name: "Alpha driver",
        callsign: "Driver 1",
        role: "driver",
        contact: null,
        notes: null,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: "person-security-bravo",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        name: "Bravo security",
        callsign: "Bravo 2",
        role: "security",
        contact: null,
        notes: null,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ],
    vehicles: [
      {
        id: "vehicle-alpha-lead",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        callsign: "Alpha lead",
        make: "Range Rover",
        model: "Autobiography",
        vehicle_type: "lead",
        protection_profile: "armored",
        seat_count: 4,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: "vehicle-alpha-support",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        callsign: "Alpha support",
        make: "BMW",
        model: "X5",
        vehicle_type: "support",
        protection_profile: "standard",
        seat_count: 4,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: "vehicle-bravo-lead",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        callsign: "Bravo lead",
        make: "Mercedes",
        model: "V-Class",
        vehicle_type: "passenger",
        protection_profile: "standard",
        seat_count: 6,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ],
    trips: [
      {
        id: "trip-airport-transfer",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        name: "Airport transfer window",
        status: "ready",
        movement_date: now,
        duration_minutes: 90,
        origin: airportRoute?.origin || "Mayfair, London",
        destination: airportRoute?.destination || "London City Airport",
        route_ids: airportRoute ? [airportRoute.id] : [],
        vehicle_ids: ["vehicle-alpha-lead", "vehicle-alpha-support"],
        person_ids: ["person-principal", "person-driver-alpha"],
        route_assignments: airportRoute
          ? [
              {
                route_id: airportRoute.id,
                vehicle_ids: ["vehicle-alpha-lead", "vehicle-alpha-support"],
                person_ids: ["person-principal", "person-driver-alpha"],
                movement_date: now,
                duration_minutes: 90,
                status: "ready",
                notes: "Primary arrival movement"
              }
            ]
          : [],
        lead_vehicle_id: "vehicle-alpha-lead",
        plan_color: "#60a5fa",
        notes: null,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: "trip-docklands-low-profile",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        name: "Docklands low-profile movement",
        status: "ready",
        movement_date: later,
        duration_minutes: 75,
        origin: docklandsRoute?.origin || "King's Cross",
        destination: docklandsRoute?.destination || "Canary Wharf",
        route_ids: docklandsRoute ? [docklandsRoute.id] : [],
        vehicle_ids: ["vehicle-bravo-lead"],
        person_ids: ["person-security-bravo"],
        route_assignments: docklandsRoute
          ? [
              {
                route_id: docklandsRoute.id,
                vehicle_ids: ["vehicle-bravo-lead"],
                person_ids: ["person-security-bravo"],
                movement_date: later,
                duration_minutes: 75,
                status: "ready",
                notes: "Low-signature route"
              }
            ]
          : [],
        lead_vehicle_id: "vehicle-bravo-lead",
        plan_color: "#34d399",
        notes: null,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: "trip-westbound-standby",
        client_id: PREVIEW_OPERATIONS_CLIENT_ID,
        name: "Westbound standby",
        status: "draft",
        movement_date: null,
        duration_minutes: 120,
        origin: westboundRoute?.origin || "Westminster",
        destination: westboundRoute?.destination || "Heathrow T5",
        route_ids: westboundRoute ? [westboundRoute.id] : [],
        vehicle_ids: [],
        person_ids: [],
        route_assignments: westboundRoute
          ? [
              {
                route_id: westboundRoute.id,
                vehicle_ids: [],
                person_ids: [],
                movement_date: standby,
                duration_minutes: 120,
                status: "draft",
                notes: "Standby movement window"
              }
            ]
          : [],
        lead_vehicle_id: null,
        plan_color: "#f59e0b",
        notes: null,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ]
  };
}

function createPreviewMovementDate(daysFromToday: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}
