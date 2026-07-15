import { ApiSessionExpiredError } from "../api/apiClientCore";
import type {
  SafeRouteOperationsState,
  SafeRoutePerson,
  SafeRoutePersonRole,
  SafeRouteProtectionProfile,
  SafeRouteTripPlan,
  SafeRouteTripRouteAssignment,
  SafeRouteTripStatus,
  SafeRouteVehicleInventoryItem,
  SafeRouteVehicleType
} from "./operationsTypes";

export type OperationsApiRequester = <T>(path: string, accessToken: string) => Promise<T>;

const MAX_TEXT_LENGTH = 160;
const MAX_LIST_SIZE = 250;
const EMPTY_CLIENT_ID = "unselected-client";

const tripStatuses = new Set<SafeRouteTripStatus>(["draft", "ready", "active", "completed", "archived"]);
const personRoles = new Set<SafeRoutePersonRole>(["principal", "driver", "security", "medic", "analyst", "support", "other"]);
const vehicleTypes = new Set<SafeRouteVehicleType>(["lead", "support", "passenger", "cargo", "medical", "armored", "other"]);
const protectionProfiles = new Set<SafeRouteProtectionProfile>(["standard", "armored", "blast-resistant", "medical", "cargo"]);

export function buildOperationsStatePath(clientId: string): string {
  const normalizedClientId = cleanText(clientId, "");

  if (!normalizedClientId) {
    throw new Error("A client id is required before loading SafeRoute operations.");
  }

  return `/mobile/safe-route/operations/client/${encodeURIComponent(normalizedClientId)}`;
}

export function createEmptyOperationsState(clientId?: string | null): SafeRouteOperationsState {
  return {
    client_id: cleanText(clientId, EMPTY_CLIENT_ID),
    people: [],
    vehicles: [],
    trips: [],
    updated_at: ""
  };
}

export async function loadOperationsState(
  request: OperationsApiRequester,
  accessToken: string,
  clientId: string
): Promise<SafeRouteOperationsState> {
  const token = requireAccessToken(accessToken);
  const path = buildOperationsStatePath(clientId);
  const payload = unwrapMaybeEnvelope(await request<unknown>(path, token));

  return normalizeOperationsState(payload, clientId);
}

export function normalizeOperationsState(payload: unknown, clientId: string): SafeRouteOperationsState {
  const record = isRecord(payload) ? payload : {};
  const normalizedClientId = cleanText(clientId, EMPTY_CLIENT_ID);

  return {
    client_id: normalizedClientId,
    people: uniqueEntitiesById(arrayOfRecords(record.people).slice(0, MAX_LIST_SIZE).map((person, index) => normalizePerson(person, normalizedClientId, index))),
    vehicles: uniqueEntitiesById(arrayOfRecords(record.vehicles).slice(0, MAX_LIST_SIZE).map((vehicle, index) => normalizeVehicle(vehicle, normalizedClientId, index))),
    trips: uniqueEntitiesById(arrayOfRecords(record.trips).slice(0, MAX_LIST_SIZE).map((trip, index) => normalizeTrip(trip, normalizedClientId, index))),
    updated_at: cleanText(record.updated_at, "")
  };
}

function normalizePerson(record: Record<string, unknown>, clientId: string, index: number): SafeRoutePerson {
  const role = cleanText(record.role, "other") as SafeRoutePersonRole;

  return {
    id: cleanText(record.id, `person-${index + 1}`),
    client_id: clientId,
    name: cleanText(record.name, "Team member"),
    callsign: cleanOptionalText(record.callsign),
    role: personRoles.has(role) ? role : "other",
    contact: cleanOptionalText(record.contact),
    notes: cleanOptionalText(record.notes),
    is_active: record.is_active !== false,
    created_at: cleanText(record.created_at, ""),
    updated_at: cleanText(record.updated_at, "")
  };
}

function normalizeVehicle(record: Record<string, unknown>, clientId: string, index: number): SafeRouteVehicleInventoryItem {
  const vehicleType = cleanText(record.vehicle_type, "passenger") as SafeRouteVehicleType;
  const protectionProfile = cleanText(record.protection_profile, "standard") as SafeRouteProtectionProfile;

  return {
    id: cleanText(record.id, `vehicle-${index + 1}`),
    client_id: clientId,
    callsign: cleanText(record.callsign, "Vehicle"),
    make: cleanText(record.make, "Vehicle"),
    model: cleanText(record.model, ""),
    trim: cleanOptionalText(record.trim),
    year: normalizeBoundedOptionalInteger(record.year, 1900, 2100),
    registration: cleanOptionalText(record.registration),
    vin: cleanOptionalText(record.vin),
    vehicle_type: vehicleTypes.has(vehicleType) ? vehicleType : "passenger",
    protection_profile: protectionProfiles.has(protectionProfile) ? protectionProfile : "standard",
    color: cleanOptionalText(record.color),
    fuel_type: cleanOptionalText(record.fuel_type),
    range_km: normalizeBoundedOptionalInteger(record.range_km, 0, 2500),
    seat_count: normalizeBoundedInteger(record.seat_count, 1, 12, 1),
    notes: cleanOptionalText(record.notes),
    is_active: record.is_active !== false,
    created_at: cleanText(record.created_at, ""),
    updated_at: cleanText(record.updated_at, "")
  };
}

function normalizeTrip(record: Record<string, unknown>, clientId: string, index: number): SafeRouteTripPlan {
  const status = cleanText(record.status, "draft") as SafeRouteTripStatus;
  const routeIds = uniqueTextList(record.route_ids, 80);
  const assignments = arrayOfRecords(record.route_assignments)
    .slice(0, MAX_LIST_SIZE)
    .map((assignment, assignmentIndex) => normalizeRouteAssignment(assignment, routeIds, assignmentIndex));

  return {
    id: cleanText(record.id, `trip-${index + 1}`),
    client_id: clientId,
    name: cleanText(record.name, "SafeRoute trip"),
    status: tripStatuses.has(status) ? status : "draft",
    movement_date: cleanOptionalText(record.movement_date),
    duration_minutes: normalizeBoundedOptionalInteger(record.duration_minutes, 1, 10080),
    origin: cleanOptionalText(record.origin),
    destination: cleanOptionalText(record.destination),
    route_ids: uniqueTextList([...routeIds, ...assignments.map((assignment) => assignment.route_id)], 80),
    vehicle_ids: uniqueTextList(record.vehicle_ids, 120),
    person_ids: uniqueTextList(record.person_ids, 200),
    route_assignments: assignments,
    lead_vehicle_id: cleanOptionalText(record.lead_vehicle_id),
    plan_color: normalizePlanColor(record.plan_color),
    notes: cleanOptionalText(record.notes),
    is_active: record.is_active !== false,
    created_at: cleanText(record.created_at, ""),
    updated_at: cleanText(record.updated_at, "")
  };
}

function normalizeRouteAssignment(
  record: Record<string, unknown>,
  fallbackRouteIds: string[],
  index: number
): SafeRouteTripRouteAssignment {
  const status = cleanOptionalText(record.status) as SafeRouteTripStatus | null;

  return {
    route_id: cleanText(record.route_id, fallbackRouteIds[index] || `route-${index + 1}`),
    vehicle_ids: uniqueTextList(record.vehicle_ids, 120),
    person_ids: uniqueTextList(record.person_ids, 200),
    movement_date: cleanOptionalText(record.movement_date),
    duration_minutes: normalizeBoundedOptionalInteger(record.duration_minutes, 1, 10080),
    status: status && tripStatuses.has(status) ? status : null,
    notes: cleanOptionalText(record.notes)
  };
}

function requireAccessToken(accessToken: string): string {
  const normalizedAccessToken = String(accessToken ?? "").trim();

  if (!normalizedAccessToken) {
    throw new ApiSessionExpiredError("Sign in again before loading SafeRoute operations.");
  }

  return normalizedAccessToken;
}

function unwrapMaybeEnvelope(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  return "data" in payload ? payload.data : payload;
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function uniqueTextList(value: unknown, limit: number): string[] {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    const text = cleanText(entry, "");
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function normalizeBoundedOptionalInteger(
  value: unknown,
  minimum: number,
  maximum: number
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= minimum && numericValue <= maximum
    ? Math.round(numericValue)
    : null;
}

function normalizeBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= minimum && numericValue <= maximum
    ? Math.round(numericValue)
    : fallback;
}

function normalizePlanColor(value: unknown): string | null {
  const color = cleanOptionalText(value);
  return color && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color) ? color : null;
}

function uniqueEntitiesById<T extends { id: string }>(entities: T[]): T[] {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    if (seen.has(entity.id)) {
      return false;
    }
    seen.add(entity.id);
    return true;
  });
}

function cleanOptionalText(value: unknown): string | null {
  const text = cleanText(value, "");
  return text || null;
}

function cleanText(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  const normalized = text || fallback;

  return normalized.length <= MAX_TEXT_LENGTH ? normalized : `${normalized.slice(0, MAX_TEXT_LENGTH - 1).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
