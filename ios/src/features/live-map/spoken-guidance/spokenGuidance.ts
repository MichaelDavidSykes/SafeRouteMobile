import type {
  SpokenGuidanceAudioDriver,
  SpokenGuidanceUtterance,
} from './spokenGuidanceAudio';

const MAX_BACKEND_MANEUVERS = 160;
const MAX_INSTRUCTION_LENGTH = 240;
const MAX_ROUTE_KEY_LENGTH = 160;
const DEFAULT_MINIMUM_ANNOUNCEMENT_DISTANCE_METERS = 70;
const DEFAULT_MAXIMUM_ANNOUNCEMENT_DISTANCE_METERS = 350;
const DEFAULT_LOOKAHEAD_SECONDS = 12;
const DEFAULT_PASSED_MANEUVER_TOLERANCE_METERS = 15;
const DEFAULT_MAX_ANNOUNCEMENT_HISTORY = 256;
const CLIENT_DERIVED_MANEUVER_ID_PATTERN = /^geometry-step-/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;

export interface BackendManeuver {
  distanceAlongMeters: number;
  id: string;
  instruction: string;
}

export interface BackendManeuverBatch {
  maneuvers: readonly BackendManeuver[];
  routeId: string;
  routeRevision: string;
  source: 'backend';
}

export interface BackendManeuverBatchInput {
  maneuvers: unknown;
  routeId: unknown;
  routeRevision: unknown;
  source: unknown;
}

export interface SpokenGuidanceControllerOptions {
  audio: SpokenGuidanceAudioDriver;
  lookaheadSeconds?: number;
  maximumAnnouncementDistanceMeters?: number;
  maximumAnnouncementHistory?: number;
  minimumAnnouncementDistanceMeters?: number;
  onAudioError?: (error: unknown) => void;
  passedManeuverToleranceMeters?: number;
}

export interface SpokenGuidanceProgressUpdate {
  active: boolean;
  batch: BackendManeuverBatch | null | undefined;
  speedMetersPerSecond?: number | null;
  travelledDistanceMeters: number;
}

export interface SpokenGuidanceSnapshot {
  active: boolean;
  canRepeat: boolean;
  currentRouteKey: string | null;
  muted: boolean;
}

export type SpokenGuidanceSuppressionReason =
  | 'audio-error'
  | 'audio-unavailable'
  | 'disposed'
  | 'duplicate'
  | 'inactive'
  | 'muted'
  | 'no-backend-maneuver'
  | 'no-repeat'
  | 'route-changed'
  | 'too-early';

export type SpokenGuidanceResult =
  | {
      distanceToManeuverMeters: number;
      maneuver: BackendManeuver;
      status: 'announced' | 'repeated';
    }
  | {
      reason: SpokenGuidanceSuppressionReason;
      status: 'suppressed';
    };

interface NormalizedControllerOptions {
  audio: SpokenGuidanceAudioDriver;
  lookaheadSeconds: number;
  maximumAnnouncementDistanceMeters: number;
  maximumAnnouncementHistory: number;
  minimumAnnouncementDistanceMeters: number;
  onAudioError: ((error: unknown) => void) | null;
  passedManeuverToleranceMeters: number;
}

/**
 * Creates a speech-safe maneuver batch only at a backend response boundary.
 * Geometry-derived fallback steps are rejected and no instruction is created
 * when the backend omitted guidance.
 */
export function normalizeBackendManeuverBatch(
  input: BackendManeuverBatchInput | null | undefined,
): BackendManeuverBatch | null {
  if (!input || input.source !== 'backend' || !Array.isArray(input.maneuvers)) {
    return null;
  }

  const routeId = normalizeIdentifier(input.routeId, MAX_ROUTE_KEY_LENGTH);
  const routeRevision = normalizeIdentifier(
    input.routeRevision,
    MAX_ROUTE_KEY_LENGTH,
  );
  if (!routeId || !routeRevision) {
    return null;
  }

  const normalized = input.maneuvers
    .slice(0, MAX_BACKEND_MANEUVERS)
    .map(normalizeBackendManeuver)
    .filter((maneuver): maneuver is BackendManeuver => maneuver !== null)
    .sort(
      (left, right) =>
        left.distanceAlongMeters - right.distanceAlongMeters,
    );
  const signatures = new Set<string>();
  const maneuvers = normalized.filter((maneuver) => {
    const signature = createManeuverContentSignature(maneuver);
    if (signatures.has(signature)) {
      return false;
    }
    signatures.add(signature);
    return true;
  });

  return Object.freeze({
    maneuvers: Object.freeze(maneuvers),
    routeId,
    routeRevision,
    source: 'backend' as const,
  });
}

export class SpokenGuidanceController {
  private active = false;
  private announcedSignatures = new Set<string>();
  private currentBatch: BackendManeuverBatch | null = null;
  private currentRouteKey: string | null = null;
  private disposed = false;
  private generation = 0;
  private lastAnnounced: BackendManeuver | null = null;
  private muted = false;
  private pendingSignatures = new Set<string>();
  private readonly options: NormalizedControllerOptions;

  constructor(options: SpokenGuidanceControllerOptions) {
    this.options = normalizeControllerOptions(options);
  }

  getSnapshot(): SpokenGuidanceSnapshot {
    return {
      active: this.active,
      canRepeat:
        !this.disposed &&
        this.active &&
        !this.muted &&
        Boolean(this.currentRouteKey && this.lastAnnounced),
      currentRouteKey: this.currentRouteKey,
      muted: this.muted,
    };
  }

  async update(
    update: SpokenGuidanceProgressUpdate,
  ): Promise<SpokenGuidanceResult> {
    if (this.disposed) {
      return suppressed('disposed');
    }

    this.active = update.active;
    await this.synchronizeBatch(update.batch);

    if (!this.active) {
      return suppressed('inactive');
    }
    if (this.muted) {
      return suppressed('muted');
    }
    if (!this.currentBatch || !this.currentBatch.maneuvers.length) {
      return suppressed('no-backend-maneuver');
    }

    const travelledDistanceMeters = normalizeNonNegativeNumber(
      update.travelledDistanceMeters,
    );
    const maneuver = this.currentBatch.maneuvers.find(
      (candidate) =>
        candidate.distanceAlongMeters >=
        travelledDistanceMeters -
          this.options.passedManeuverToleranceMeters,
    );
    if (!maneuver) {
      return suppressed('no-backend-maneuver');
    }

    const distanceToManeuverMeters = Math.max(
      0,
      maneuver.distanceAlongMeters - travelledDistanceMeters,
    );
    const announcementDistanceMeters = resolveAnnouncementDistanceMeters({
      lookaheadSeconds: this.options.lookaheadSeconds,
      maximumDistanceMeters:
        this.options.maximumAnnouncementDistanceMeters,
      minimumDistanceMeters:
        this.options.minimumAnnouncementDistanceMeters,
      speedMetersPerSecond: update.speedMetersPerSecond,
    });
    if (distanceToManeuverMeters > announcementDistanceMeters) {
      return suppressed('too-early');
    }

    return this.announce(maneuver, distanceToManeuverMeters, false);
  }

  async setMuted(muted: boolean): Promise<SpokenGuidanceSnapshot> {
    if (this.disposed || muted === this.muted) {
      return this.getSnapshot();
    }

    this.muted = muted;
    if (muted) {
      this.generation += 1;
      this.pendingSignatures.clear();
      await this.stopAudioSafely();
    }
    return this.getSnapshot();
  }

  async repeat(): Promise<SpokenGuidanceResult> {
    if (this.disposed) {
      return suppressed('disposed');
    }
    if (!this.active) {
      return suppressed('inactive');
    }
    if (this.muted) {
      return suppressed('muted');
    }
    if (!this.currentRouteKey || !this.lastAnnounced) {
      return suppressed('no-repeat');
    }

    return this.announce(this.lastAnnounced, 0, true);
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.active = false;
    this.generation += 1;
    this.pendingSignatures.clear();
    await this.stopAudioSafely();
    this.currentBatch = null;
    this.currentRouteKey = null;
    this.lastAnnounced = null;
    this.announcedSignatures.clear();
  }

  private async synchronizeBatch(
    batch: BackendManeuverBatch | null | undefined,
  ): Promise<void> {
    const nextBatch = batch
      ? normalizeBackendManeuverBatch(batch)
      : null;
    const nextRouteKey = nextBatch
      ? createRouteKey(nextBatch.routeId, nextBatch.routeRevision)
      : null;
    if (nextRouteKey === this.currentRouteKey) {
      this.currentBatch = nextBatch;
      return;
    }

    const previousRouteKey = this.currentRouteKey;
    this.generation += 1;
    this.pendingSignatures.clear();
    this.announcedSignatures.clear();
    this.lastAnnounced = null;
    this.currentBatch = nextBatch;
    this.currentRouteKey = nextRouteKey;
    if (previousRouteKey) {
      await this.stopAudioSafely();
    }
  }

  private async announce(
    maneuver: BackendManeuver,
    distanceToManeuverMeters: number,
    repeat: boolean,
  ): Promise<SpokenGuidanceResult> {
    const routeKey = this.currentRouteKey;
    if (!routeKey) {
      return suppressed('no-backend-maneuver');
    }
    const maneuverSignature = `${routeKey}|${createManeuverContentSignature(
      maneuver,
    )}`;
    const pendingSignature = repeat
      ? `repeat|${maneuverSignature}`
      : maneuverSignature;
    if (
      this.pendingSignatures.has(pendingSignature) ||
      (!repeat && this.announcedSignatures.has(maneuverSignature))
    ) {
      return suppressed('duplicate');
    }

    this.pendingSignatures.add(pendingSignature);
    const generation = this.generation;
    try {
      const available = await this.options.audio.isAvailable();
      if (!available) {
        return suppressed('audio-unavailable');
      }
      if (
        this.disposed ||
        this.muted ||
        generation !== this.generation ||
        routeKey !== this.currentRouteKey
      ) {
        return suppressed(
          this.disposed
            ? 'disposed'
            : this.muted
              ? 'muted'
              : 'route-changed',
        );
      }

      const utterance: SpokenGuidanceUtterance = {
        id: pendingSignature,
        interrupt: true,
        text: maneuver.instruction,
      };
      await this.options.audio.speak(utterance);
      if (
        this.disposed ||
        generation !== this.generation ||
        routeKey !== this.currentRouteKey
      ) {
        return suppressed(this.disposed ? 'disposed' : 'route-changed');
      }

      if (!repeat) {
        this.rememberAnnouncement(maneuverSignature);
        this.lastAnnounced = maneuver;
      }
      return {
        distanceToManeuverMeters,
        maneuver,
        status: repeat ? 'repeated' : 'announced',
      };
    } catch (error) {
      this.options.onAudioError?.(error);
      return suppressed('audio-error');
    } finally {
      this.pendingSignatures.delete(pendingSignature);
    }
  }

  private rememberAnnouncement(signature: string): void {
    this.announcedSignatures.add(signature);
    while (
      this.announcedSignatures.size >
      this.options.maximumAnnouncementHistory
    ) {
      const oldest = this.announcedSignatures.values().next().value;
      if (typeof oldest !== 'string') {
        break;
      }
      this.announcedSignatures.delete(oldest);
    }
  }

  private async stopAudioSafely(): Promise<void> {
    try {
      await this.options.audio.stop();
    } catch (error) {
      this.options.onAudioError?.(error);
    }
  }
}

function normalizeBackendManeuver(
  value: unknown,
  index: number,
): BackendManeuver | null {
  if (!isRecord(value)) {
    return null;
  }
  const instruction = normalizeInstruction(
    value.instruction ?? value.message,
  );
  const distanceAlongMeters = normalizeOptionalNonNegativeNumber(
    value.distance_along_meters ??
      value.distanceAlongMeters ??
      value.routeOffsetInMeters,
  );
  const backendId = normalizeIdentifier(value.id, 80);
  if (
    !instruction ||
    distanceAlongMeters === null ||
    CLIENT_DERIVED_MANEUVER_ID_PATTERN.test(backendId)
  ) {
    return null;
  }

  return Object.freeze({
    distanceAlongMeters,
    id: backendId || `backend-maneuver-${index + 1}`,
    instruction,
  });
}

function normalizeControllerOptions(
  options: SpokenGuidanceControllerOptions,
): NormalizedControllerOptions {
  const minimumAnnouncementDistanceMeters = positiveNumberOr(
    options.minimumAnnouncementDistanceMeters,
    DEFAULT_MINIMUM_ANNOUNCEMENT_DISTANCE_METERS,
  );
  const maximumAnnouncementDistanceMeters = Math.max(
    minimumAnnouncementDistanceMeters,
    positiveNumberOr(
      options.maximumAnnouncementDistanceMeters,
      DEFAULT_MAXIMUM_ANNOUNCEMENT_DISTANCE_METERS,
    ),
  );
  return {
    audio: options.audio,
    lookaheadSeconds: positiveNumberOr(
      options.lookaheadSeconds,
      DEFAULT_LOOKAHEAD_SECONDS,
    ),
    maximumAnnouncementDistanceMeters,
    maximumAnnouncementHistory: Math.max(
      1,
      Math.floor(
        positiveNumberOr(
          options.maximumAnnouncementHistory,
          DEFAULT_MAX_ANNOUNCEMENT_HISTORY,
        ),
      ),
    ),
    minimumAnnouncementDistanceMeters,
    onAudioError: options.onAudioError ?? null,
    passedManeuverToleranceMeters: positiveNumberOr(
      options.passedManeuverToleranceMeters,
      DEFAULT_PASSED_MANEUVER_TOLERANCE_METERS,
    ),
  };
}

function resolveAnnouncementDistanceMeters({
  lookaheadSeconds,
  maximumDistanceMeters,
  minimumDistanceMeters,
  speedMetersPerSecond,
}: {
  lookaheadSeconds: number;
  maximumDistanceMeters: number;
  minimumDistanceMeters: number;
  speedMetersPerSecond: number | null | undefined;
}): number {
  const speed = normalizeNonNegativeNumber(speedMetersPerSecond);
  return Math.min(
    maximumDistanceMeters,
    Math.max(minimumDistanceMeters, speed * lookaheadSeconds),
  );
}

function createRouteKey(routeId: string, routeRevision: string): string {
  return `${routeId}|${routeRevision}`;
}

function createManeuverContentSignature(
  maneuver: BackendManeuver,
): string {
  return `${maneuver.instruction.toLocaleLowerCase('en-US')}|${maneuver.distanceAlongMeters.toFixed(
    1,
  )}`;
}

function normalizeInstruction(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(CONTROL_CHARACTER_PATTERN, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_INSTRUCTION_LENGTH);
}

function normalizeIdentifier(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(CONTROL_CHARACTER_PATTERN, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeNonNegativeNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

function normalizeOptionalNonNegativeNumber(
  value: unknown,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function positiveNumberOr(value: unknown, fallback: number): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0
    ? normalized
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function suppressed(
  reason: SpokenGuidanceSuppressionReason,
): SpokenGuidanceResult {
  return { reason, status: 'suppressed' };
}
