export type SafeRouteTripStatus = "draft" | "ready" | "active" | "completed" | "archived";
export type SafeRoutePersonRole = "principal" | "driver" | "security" | "medic" | "analyst" | "support" | "other";
export type SafeRouteVehicleType = "lead" | "support" | "passenger" | "cargo" | "medical" | "armored" | "other";
export type SafeRouteProtectionProfile = "standard" | "armored" | "blast-resistant" | "medical" | "cargo";

export interface SafeRoutePerson {
  id: string;
  client_id: string;
  name: string;
  callsign?: string | null;
  role: SafeRoutePersonRole;
  contact?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafeRouteVehicleInventoryItem {
  id: string;
  client_id: string;
  callsign: string;
  make: string;
  model: string;
  trim?: string | null;
  year?: number | null;
  registration?: string | null;
  vin?: string | null;
  vehicle_type: SafeRouteVehicleType;
  protection_profile: SafeRouteProtectionProfile;
  color?: string | null;
  fuel_type?: string | null;
  range_km?: number | null;
  seat_count: number;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafeRouteTripRouteAssignment {
  route_id: string;
  vehicle_ids: string[];
  person_ids: string[];
  movement_date?: string | null;
  duration_minutes?: number | null;
  status?: SafeRouteTripStatus | null;
  notes?: string | null;
}

export interface SafeRouteTripPlan {
  id: string;
  client_id: string;
  name: string;
  status: SafeRouteTripStatus;
  movement_date?: string | null;
  duration_minutes?: number | null;
  origin?: string | null;
  destination?: string | null;
  route_ids: string[];
  vehicle_ids: string[];
  person_ids: string[];
  route_assignments: SafeRouteTripRouteAssignment[];
  lead_vehicle_id?: string | null;
  plan_color?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafeRouteOperationsState {
  client_id: string;
  people: SafeRoutePerson[];
  vehicles: SafeRouteVehicleInventoryItem[];
  trips: SafeRouteTripPlan[];
  updated_at: string;
}
