export type LiveRerouteStatus = "idle" | "monitoring" | "pending" | "failed";

export type OffRouteSampleClassification =
  | "off-route"
  | "on-route"
  | "uncertain"
  | "invalid";

export type OffRouteSampleReason =
  | "confirmed-deviation"
  | "confirmed-recovery"
  | "threshold-overlap"
  | "accuracy-unavailable"
  | "accuracy-too-low"
  | "invalid-timestamp"
  | "invalid-coordinate"
  | "invalid-distance"
  | "invalid-accuracy";

export interface LiveRerouteCoordinate {
  latitude: number;
  longitude: number;
}

/** A projection already calculated by the route-progress layer for a GPS fix. */
export interface LiveRerouteLocationSample {
  coordinate: LiveRerouteCoordinate;
  distanceFromRouteMeters: number;
  horizontalAccuracyMeters: number | null;
  timestampMs: number;
}

export interface LiveRerouteConfig {
  accuracyBufferMultiplier: number;
  autoRerouteCooldownMs: number;
  maxEvidenceGapMs: number;
  maxUsableAccuracyMeters: number;
  offRouteDurationMs: number;
  offRouteSampleCount: number;
  offRouteThresholdMeters: number;
  recoveryDurationMs: number;
  recoverySampleCount: number;
  recoveryThresholdMeters: number;
  manualRetryDelayMs: number;
}

export const DEFAULT_LIVE_REROUTE_CONFIG: Readonly<LiveRerouteConfig> =
  Object.freeze({
    accuracyBufferMultiplier: 1,
    autoRerouteCooldownMs: 30_000,
    maxEvidenceGapMs: 3_000,
    maxUsableAccuracyMeters: 50,
    offRouteDurationMs: 4_000,
    offRouteSampleCount: 3,
    offRouteThresholdMeters: 75,
    recoveryDurationMs: 3_000,
    recoverySampleCount: 3,
    recoveryThresholdMeters: 40,
    manualRetryDelayMs: 2_000,
  });

export interface OffRouteSampleEvaluation {
  classification: OffRouteSampleClassification;
  /** Lower edge of the GPS accuracy radius relative to the route. */
  minimumPossibleDistanceMeters: number | null;
  /** Upper edge of the GPS accuracy radius relative to the route. */
  maximumPossibleDistanceMeters: number | null;
  reason: OffRouteSampleReason;
}

export interface RerouteEvidence {
  count: number;
  firstTimestampMs: number | null;
  lastTimestampMs: number | null;
}

export type LiveRerouteTrigger = "automatic" | "manual";

/**
 * Both revisions are required when completing a request. Route revisions
 * invalidate work after a stop, recovery, or route replacement; request
 * revisions distinguish retries within the same route revision.
 */
export interface LiveRerouteRequestRevision {
  requestRevision: number;
  routeId: string;
  routeRevision: number;
}

export interface LiveRerouteRequest extends LiveRerouteRequestRevision {
  requestedAtMs: number;
  sample: LiveRerouteLocationSample;
  trigger: LiveRerouteTrigger;
}

interface LiveRerouteRevisionState {
  /** Highest request revision issued by this state-machine instance. */
  requestRevision: number;
  /** Active-route generation, incremented whenever outstanding work is invalidated. */
  routeRevision: number;
}

export interface IdleLiveRerouteState extends LiveRerouteRevisionState {
  routeId: null;
  status: "idle";
  stoppedAtMs: number | null;
}

interface ActiveLiveRerouteState extends LiveRerouteRevisionState {
  cooldownUntilMs: number;
  deviationEvidence: RerouteEvidence;
  isOffRoute: boolean;
  lastSampleAtMs: number | null;
  latestOffRouteSample: LiveRerouteLocationSample | null;
  monitoringStartedAtMs: number;
  recoveryEvidence: RerouteEvidence;
  routeId: string;
}

export interface MonitoringLiveRerouteState extends ActiveLiveRerouteState {
  status: "monitoring";
}

export interface PendingLiveRerouteState extends ActiveLiveRerouteState {
  isOffRoute: true;
  request: LiveRerouteRequest;
  status: "pending";
}

export interface LiveRerouteFailure {
  code: string | null;
  failedAtMs: number;
  message: string;
  retryEligibleAtMs: number;
}

export interface FailedLiveRerouteState extends ActiveLiveRerouteState {
  failure: LiveRerouteFailure;
  isOffRoute: true;
  lastRequest: LiveRerouteRequest;
  status: "failed";
}

export type LiveRerouteState =
  | IdleLiveRerouteState
  | MonitoringLiveRerouteState
  | PendingLiveRerouteState
  | FailedLiveRerouteState;

export interface StartLiveRerouteMonitoringInput {
  /** Optional automatic-request suppression inherited from a surrounding flow. */
  cooldownUntilMs?: number;
  nowMs: number;
  routeId: string;
}

export interface LiveRerouteSampleTransition {
  evaluation: OffRouteSampleEvaluation;
  ignoredReason: "inactive" | "out-of-order" | null;
  request: LiveRerouteRequest | null;
  state: LiveRerouteState;
}

export interface ResolveLiveRerouteSuccessInput
  extends LiveRerouteRequestRevision {
  nextRouteId?: string;
  receivedAtMs: number;
}

export interface ResolveLiveRerouteFailureInput
  extends LiveRerouteRequestRevision {
  code?: string | null;
  failedAtMs: number;
  message?: string | null;
  /** Absolute timestamp supplied by a provider, for example from Retry-After. */
  retryEligibleAtMs?: number | null;
}

export interface LiveRerouteResponseTransition {
  accepted: boolean;
  reason: "accepted" | "stale-response";
  state: LiveRerouteState;
}

export type ManualRerouteRetryIneligibilityReason =
  | "not-failed"
  | "retry-delay"
  | "missing-off-route-sample"
  | "invalid-time";

export type ManualRerouteRetryEligibility =
  | {
      eligible: true;
      eligibleAtMs: number;
      reason: null;
    }
  | {
      eligible: false;
      eligibleAtMs: number | null;
      reason: ManualRerouteRetryIneligibilityReason;
    };

export interface ManualRerouteRetryTransition {
  eligibility: ManualRerouteRetryEligibility;
  request: LiveRerouteRequest | null;
  state: LiveRerouteState;
}

interface AppliedEvidence {
  recoveryConfirmed: boolean;
  state: MonitoringLiveRerouteState | PendingLiveRerouteState | FailedLiveRerouteState;
}

export interface RerouteCheckpointLike {
  id: string;
  kind: "origin" | "waypoint" | "destination";
}

export interface RemainingCheckpointOptions {
  completedCheckpointIds?: readonly string[] | ReadonlySet<string>;
  /** Absolute index in the original checkpoint array, including the origin. */
  nextCheckpointIndex?: number | null;
  /** Preferred over nextCheckpointIndex when it matches an input checkpoint. */
  nextCheckpointId?: string | null;
}

export function createLiveRerouteState(): IdleLiveRerouteState {
  return {
    requestRevision: 0,
    routeId: null,
    routeRevision: 0,
    status: "idle",
    stoppedAtMs: null,
  };
}

/**
 * Starts a new monitoring generation. Calling this for a route replacement is
 * enough to make any response from the prior route stale.
 */
export function startLiveRerouteMonitoring(
  state: LiveRerouteState,
  input: StartLiveRerouteMonitoringInput,
): MonitoringLiveRerouteState {
  const routeId = cleanRequiredRouteId(input.routeId);
  const nowMs = requiredTimestamp(input.nowMs, "nowMs");

  return {
    cooldownUntilMs: finiteTimestampOr(input.cooldownUntilMs, nowMs),
    deviationEvidence: emptyEvidence(),
    isOffRoute: false,
    lastSampleAtMs: null,
    latestOffRouteSample: null,
    monitoringStartedAtMs: nowMs,
    recoveryEvidence: emptyEvidence(),
    requestRevision: state.requestRevision,
    routeId,
    routeRevision: nextRevision(state.routeRevision),
    status: "monitoring",
  };
}

/** Stops monitoring and invalidates a pending response without resetting IDs. */
export function stopLiveRerouteMonitoring(
  state: LiveRerouteState,
  stoppedAtMs: number,
): IdleLiveRerouteState {
  if (state.status === "idle") {
    return state;
  }

  return {
    requestRevision: state.requestRevision,
    routeId: null,
    routeRevision: nextRevision(state.routeRevision),
    status: "idle",
    stoppedAtMs: requiredTimestamp(stoppedAtMs, "stoppedAtMs"),
  };
}

/**
 * Classifies only fixes whose entire accuracy radius is beyond the off-route
 * threshold or within the tighter recovery threshold. Overlapping fixes do
 * not count toward either hysteresis run.
 */
export function evaluateOffRouteSample(
  sample: LiveRerouteLocationSample,
  configOverrides: Partial<LiveRerouteConfig> = {},
): OffRouteSampleEvaluation {
  const config = resolveLiveRerouteConfig(configOverrides);

  if (!isFiniteTimestamp(sample.timestampMs)) {
    return invalidEvaluation("invalid-timestamp");
  }

  if (!isValidCoordinate(sample.coordinate)) {
    return invalidEvaluation("invalid-coordinate");
  }

  if (
    !Number.isFinite(sample.distanceFromRouteMeters) ||
    sample.distanceFromRouteMeters < 0
  ) {
    return invalidEvaluation("invalid-distance");
  }

  if (sample.horizontalAccuracyMeters === null) {
    return uncertainEvaluation("accuracy-unavailable");
  }

  if (
    !Number.isFinite(sample.horizontalAccuracyMeters) ||
    sample.horizontalAccuracyMeters < 0
  ) {
    return invalidEvaluation("invalid-accuracy");
  }

  const accuracyRadiusMeters =
    sample.horizontalAccuracyMeters * config.accuracyBufferMultiplier;
  const minimumPossibleDistanceMeters = Math.max(
    0,
    sample.distanceFromRouteMeters - accuracyRadiusMeters,
  );
  const maximumPossibleDistanceMeters =
    sample.distanceFromRouteMeters + accuracyRadiusMeters;

  if (sample.horizontalAccuracyMeters > config.maxUsableAccuracyMeters) {
    return {
      classification: "uncertain",
      maximumPossibleDistanceMeters,
      minimumPossibleDistanceMeters,
      reason: "accuracy-too-low",
    };
  }

  if (minimumPossibleDistanceMeters >= config.offRouteThresholdMeters) {
    return {
      classification: "off-route",
      maximumPossibleDistanceMeters,
      minimumPossibleDistanceMeters,
      reason: "confirmed-deviation",
    };
  }

  if (maximumPossibleDistanceMeters <= config.recoveryThresholdMeters) {
    return {
      classification: "on-route",
      maximumPossibleDistanceMeters,
      minimumPossibleDistanceMeters,
      reason: "confirmed-recovery",
    };
  }

  return {
    classification: "uncertain",
    maximumPossibleDistanceMeters,
    minimumPossibleDistanceMeters,
    reason: "threshold-overlap",
  };
}

export function applyLiveRerouteSample(
  state: LiveRerouteState,
  sample: LiveRerouteLocationSample,
  configOverrides: Partial<LiveRerouteConfig> = {},
): LiveRerouteSampleTransition {
  const config = resolveLiveRerouteConfig(configOverrides);
  const evaluation = evaluateOffRouteSample(sample, config);

  if (state.status === "idle") {
    return {
      evaluation,
      ignoredReason: "inactive",
      request: null,
      state,
    };
  }

  if (evaluation.classification === "invalid") {
    return {
      evaluation,
      ignoredReason: null,
      request: null,
      state,
    };
  }

  if (
    state.lastSampleAtMs !== null &&
    sample.timestampMs <= state.lastSampleAtMs
  ) {
    return {
      evaluation,
      ignoredReason: "out-of-order",
      request: null,
      state,
    };
  }

  const evidenceResult = applyEvidence(state, sample, evaluation, config);
  const sampledState = evidenceResult.state;

  if (evidenceResult.recoveryConfirmed) {
    const recoveredState = recoverToMonitoring(
      sampledState,
      state.status === "pending",
    );
    return unchangedRequestTransition(recoveredState, evaluation);
  }

  if (!state.isOffRoute && sampledState.isOffRoute) {
    if (
      sampledState.status === "monitoring" &&
      sample.timestampMs >= sampledState.cooldownUntilMs
    ) {
      return createRequestTransition(
        sampledState,
        sample,
        "automatic",
        sample.timestampMs,
        evaluation,
        config,
      );
    }

    return unchangedRequestTransition(sampledState, evaluation);
  }

  if (
    sampledState.status === "monitoring" &&
    sampledState.isOffRoute &&
    evaluation.classification === "off-route" &&
    sample.timestampMs >= sampledState.cooldownUntilMs
  ) {
    return createRequestTransition(
      sampledState,
      sample,
      "automatic",
      sample.timestampMs,
      evaluation,
      config,
    );
  }

  return unchangedRequestTransition(sampledState, evaluation);
}

export function resolveLiveRerouteSuccess(
  state: LiveRerouteState,
  input: ResolveLiveRerouteSuccessInput,
  configOverrides: Partial<LiveRerouteConfig> = {},
): LiveRerouteResponseTransition {
  if (!matchesPendingRequest(state, input)) {
    return staleResponse(state);
  }

  if (!isFiniteTimestamp(input.receivedAtMs)) {
    return staleResponse(state);
  }

  const config = resolveLiveRerouteConfig(configOverrides);
  const routeId = input.nextRouteId === undefined
    ? state.routeId
    : cleanRequiredRouteId(input.nextRouteId);

  return {
    accepted: true,
    reason: "accepted",
    state: {
      cooldownUntilMs: Math.max(
        state.cooldownUntilMs,
        input.receivedAtMs + config.autoRerouteCooldownMs,
      ),
      deviationEvidence: emptyEvidence(),
      isOffRoute: false,
      lastSampleAtMs: null,
      latestOffRouteSample: null,
      monitoringStartedAtMs: input.receivedAtMs,
      recoveryEvidence: emptyEvidence(),
      requestRevision: state.requestRevision,
      routeId,
      routeRevision: nextRevision(state.routeRevision),
      status: "monitoring",
    },
  };
}

export function resolveLiveRerouteFailure(
  state: LiveRerouteState,
  input: ResolveLiveRerouteFailureInput,
  configOverrides: Partial<LiveRerouteConfig> = {},
): LiveRerouteResponseTransition {
  if (!matchesPendingRequest(state, input)) {
    return staleResponse(state);
  }

  if (!isFiniteTimestamp(input.failedAtMs)) {
    return staleResponse(state);
  }

  const config = resolveLiveRerouteConfig(configOverrides);
  const providerRetryAtMs = finiteTimestampOr(
    input.retryEligibleAtMs,
    input.failedAtMs,
  );
  const retryEligibleAtMs = Math.max(
    input.failedAtMs + config.manualRetryDelayMs,
    providerRetryAtMs,
  );

  return {
    accepted: true,
    reason: "accepted",
    state: {
      cooldownUntilMs: Math.max(
        state.cooldownUntilMs,
        input.failedAtMs + config.autoRerouteCooldownMs,
      ),
      deviationEvidence: state.deviationEvidence,
      failure: {
        code: cleanOptionalText(input.code),
        failedAtMs: input.failedAtMs,
        message:
          cleanOptionalText(input.message) ||
          "A safer route could not be calculated right now.",
        retryEligibleAtMs,
      },
      isOffRoute: true,
      lastRequest: state.request,
      lastSampleAtMs: state.lastSampleAtMs,
      latestOffRouteSample: state.latestOffRouteSample || state.request.sample,
      monitoringStartedAtMs: state.monitoringStartedAtMs,
      recoveryEvidence: state.recoveryEvidence,
      requestRevision: state.requestRevision,
      routeId: state.routeId,
      routeRevision: state.routeRevision,
      status: "failed",
    },
  };
}

export function getManualRerouteRetryEligibility(
  state: LiveRerouteState,
  nowMs: number,
): ManualRerouteRetryEligibility {
  if (!isFiniteTimestamp(nowMs)) {
    return {
      eligible: false,
      eligibleAtMs: null,
      reason: "invalid-time",
    };
  }

  if (state.status !== "failed") {
    return {
      eligible: false,
      eligibleAtMs: null,
      reason: "not-failed",
    };
  }

  if (!state.latestOffRouteSample) {
    return {
      eligible: false,
      eligibleAtMs: state.failure.retryEligibleAtMs,
      reason: "missing-off-route-sample",
    };
  }

  if (nowMs < state.failure.retryEligibleAtMs) {
    return {
      eligible: false,
      eligibleAtMs: state.failure.retryEligibleAtMs,
      reason: "retry-delay",
    };
  }

  return {
    eligible: true,
    eligibleAtMs: state.failure.retryEligibleAtMs,
    reason: null,
  };
}

/** Manual retry intentionally bypasses the longer automatic cooldown. */
export function retryFailedLiveReroute(
  state: LiveRerouteState,
  nowMs: number,
  configOverrides: Partial<LiveRerouteConfig> = {},
): ManualRerouteRetryTransition {
  const eligibility = getManualRerouteRetryEligibility(state, nowMs);
  if (
    !eligibility.eligible ||
    state.status !== "failed" ||
    !state.latestOffRouteSample
  ) {
    return {
      eligibility,
      request: null,
      state,
    };
  }

  const config = resolveLiveRerouteConfig(configOverrides);
  const pendingState = beginRequest(
    state,
    state.latestOffRouteSample,
    "manual",
    nowMs,
    config,
  );

  return {
    eligibility,
    request: pendingState.request,
    state: pendingState,
  };
}

/**
 * Returns future waypoints and the destination in route order. The origin is
 * never sent to a reroute provider because the current GPS fix is the new
 * origin. Returned checkpoint objects retain their original type and data.
 */
export function extractRemainingCheckpoints<T extends RerouteCheckpointLike>(
  checkpoints: readonly T[],
  options: RemainingCheckpointOptions = {},
): T[] {
  const completedIds = normalizedIdSet(options.completedCheckpointIds);
  const nextId = cleanOptionalText(options.nextCheckpointId);
  const nextIdIndex = nextId
    ? checkpoints.findIndex((checkpoint) => normalizedId(checkpoint.id) === nextId)
    : -1;
  const explicitIndex = finiteCheckpointIndex(options.nextCheckpointIndex);
  const furthestCompletedIndex = checkpoints.reduce((furthest, checkpoint, index) => {
    return completedIds.has(normalizedId(checkpoint.id))
      ? Math.max(furthest, index)
      : furthest;
  }, -1);
  const firstRemainingIndex = nextIdIndex >= 0
    ? nextIdIndex
    : explicitIndex !== null
      ? Math.min(explicitIndex, checkpoints.length)
      : furthestCompletedIndex + 1;
  const emittedIds = new Set<string>();

  return checkpoints.filter((checkpoint, index) => {
    const id = normalizedId(checkpoint.id);
    const isRerouteTarget =
      checkpoint.kind === "waypoint" || checkpoint.kind === "destination";

    if (
      index < firstRemainingIndex ||
      !isRerouteTarget ||
      !id ||
      completedIds.has(id) ||
      emittedIds.has(id)
    ) {
      return false;
    }

    emittedIds.add(id);
    return true;
  });
}

export function resolveLiveRerouteConfig(
  overrides: Partial<LiveRerouteConfig> = {},
): LiveRerouteConfig {
  const offRouteThresholdMeters = positiveNumberOr(
    overrides.offRouteThresholdMeters,
    DEFAULT_LIVE_REROUTE_CONFIG.offRouteThresholdMeters,
  );
  const recoveryThresholdMeters = Math.min(
    nonNegativeNumberOr(
      overrides.recoveryThresholdMeters,
      DEFAULT_LIVE_REROUTE_CONFIG.recoveryThresholdMeters,
    ),
    offRouteThresholdMeters,
  );

  return {
    accuracyBufferMultiplier: nonNegativeNumberOr(
      overrides.accuracyBufferMultiplier,
      DEFAULT_LIVE_REROUTE_CONFIG.accuracyBufferMultiplier,
    ),
    autoRerouteCooldownMs: nonNegativeNumberOr(
      overrides.autoRerouteCooldownMs,
      DEFAULT_LIVE_REROUTE_CONFIG.autoRerouteCooldownMs,
    ),
    maxEvidenceGapMs: positiveNumberOr(
      overrides.maxEvidenceGapMs,
      DEFAULT_LIVE_REROUTE_CONFIG.maxEvidenceGapMs,
    ),
    maxUsableAccuracyMeters: nonNegativeNumberOr(
      overrides.maxUsableAccuracyMeters,
      DEFAULT_LIVE_REROUTE_CONFIG.maxUsableAccuracyMeters,
    ),
    offRouteDurationMs: nonNegativeNumberOr(
      overrides.offRouteDurationMs,
      DEFAULT_LIVE_REROUTE_CONFIG.offRouteDurationMs,
    ),
    offRouteSampleCount: positiveIntegerOr(
      overrides.offRouteSampleCount,
      DEFAULT_LIVE_REROUTE_CONFIG.offRouteSampleCount,
    ),
    offRouteThresholdMeters,
    recoveryDurationMs: nonNegativeNumberOr(
      overrides.recoveryDurationMs,
      DEFAULT_LIVE_REROUTE_CONFIG.recoveryDurationMs,
    ),
    recoverySampleCount: positiveIntegerOr(
      overrides.recoverySampleCount,
      DEFAULT_LIVE_REROUTE_CONFIG.recoverySampleCount,
    ),
    recoveryThresholdMeters,
    manualRetryDelayMs: nonNegativeNumberOr(
      overrides.manualRetryDelayMs,
      DEFAULT_LIVE_REROUTE_CONFIG.manualRetryDelayMs,
    ),
  };
}

function applyEvidence(
  state: Exclude<LiveRerouteState, IdleLiveRerouteState>,
  sample: LiveRerouteLocationSample,
  evaluation: OffRouteSampleEvaluation,
  config: LiveRerouteConfig,
): AppliedEvidence {
  const base = {
    ...state,
    lastSampleAtMs: sample.timestampMs,
  };

  if (state.isOffRoute) {
    if (evaluation.classification !== "on-route") {
      return {
        recoveryConfirmed: false,
        state: {
          ...base,
          latestOffRouteSample:
            evaluation.classification === "off-route"
              ? copySample(sample)
              : state.latestOffRouteSample,
          recoveryEvidence: emptyEvidence(),
        },
      };
    }

    const recoveryEvidence = appendEvidence(
      state.recoveryEvidence,
      sample.timestampMs,
      config.maxEvidenceGapMs,
    );
    const recovered = evidenceSatisfied(
      recoveryEvidence,
      config.recoverySampleCount,
      config.recoveryDurationMs,
    );

    return {
      recoveryConfirmed: recovered,
      state: {
        ...base,
        recoveryEvidence,
      },
    };
  }

  // Pending and failed states are defined as off-route, so only monitoring can
  // reach deviation accumulation. Keep the runtime guard for untyped callers.
  if (state.status !== "monitoring") {
    return {
      recoveryConfirmed: false,
      state,
    };
  }

  const monitoringBase = {
    ...state,
    lastSampleAtMs: sample.timestampMs,
  };

  if (evaluation.classification !== "off-route") {
    return {
      recoveryConfirmed: false,
      state: {
        ...monitoringBase,
        deviationEvidence: emptyEvidence(),
        recoveryEvidence: emptyEvidence(),
      },
    };
  }

  const deviationEvidence = appendEvidence(
    state.deviationEvidence,
    sample.timestampMs,
    config.maxEvidenceGapMs,
  );
  const offRoute = evidenceSatisfied(
    deviationEvidence,
    config.offRouteSampleCount,
    config.offRouteDurationMs,
  );

  return {
    recoveryConfirmed: false,
    state: {
      ...monitoringBase,
      deviationEvidence,
      isOffRoute: offRoute,
      latestOffRouteSample: copySample(sample),
      recoveryEvidence: emptyEvidence(),
    },
  };
}

function appendEvidence(
  evidence: RerouteEvidence,
  timestampMs: number,
  maxEvidenceGapMs: number,
): RerouteEvidence {
  if (
    evidence.lastTimestampMs === null ||
    timestampMs - evidence.lastTimestampMs > maxEvidenceGapMs
  ) {
    return {
      count: 1,
      firstTimestampMs: timestampMs,
      lastTimestampMs: timestampMs,
    };
  }

  return {
    count: evidence.count + 1,
    firstTimestampMs: evidence.firstTimestampMs ?? timestampMs,
    lastTimestampMs: timestampMs,
  };
}

function evidenceSatisfied(
  evidence: RerouteEvidence,
  requiredCount: number,
  requiredDurationMs: number,
): boolean {
  if (
    evidence.count < requiredCount ||
    evidence.firstTimestampMs === null ||
    evidence.lastTimestampMs === null
  ) {
    return false;
  }

  return evidence.lastTimestampMs - evidence.firstTimestampMs >= requiredDurationMs;
}

function createRequestTransition(
  state: MonitoringLiveRerouteState,
  sample: LiveRerouteLocationSample,
  trigger: LiveRerouteTrigger,
  requestedAtMs: number,
  evaluation: OffRouteSampleEvaluation,
  config: LiveRerouteConfig,
): LiveRerouteSampleTransition {
  const pendingState = beginRequest(
    state,
    sample,
    trigger,
    requestedAtMs,
    config,
  );

  return {
    evaluation,
    ignoredReason: null,
    request: pendingState.request,
    state: pendingState,
  };
}

function beginRequest(
  state: MonitoringLiveRerouteState | FailedLiveRerouteState,
  sample: LiveRerouteLocationSample,
  trigger: LiveRerouteTrigger,
  requestedAtMs: number,
  config: LiveRerouteConfig,
): PendingLiveRerouteState {
  const requestRevision = nextRevision(state.requestRevision);
  const request: LiveRerouteRequest = {
    requestRevision,
    requestedAtMs,
    routeId: state.routeId,
    routeRevision: state.routeRevision,
    sample: copySample(sample),
    trigger,
  };

  return {
    cooldownUntilMs: Math.max(
      state.cooldownUntilMs,
      requestedAtMs + config.autoRerouteCooldownMs,
    ),
    deviationEvidence: state.deviationEvidence,
    isOffRoute: true,
    lastSampleAtMs: state.lastSampleAtMs,
    latestOffRouteSample: copySample(sample),
    monitoringStartedAtMs: state.monitoringStartedAtMs,
    recoveryEvidence: state.recoveryEvidence,
    request,
    requestRevision,
    routeId: state.routeId,
    routeRevision: state.routeRevision,
    status: "pending",
  };
}

function recoverToMonitoring(
  state: Exclude<LiveRerouteState, IdleLiveRerouteState>,
  invalidatePendingRequest: boolean,
): MonitoringLiveRerouteState {
  return {
    cooldownUntilMs: state.cooldownUntilMs,
    deviationEvidence: emptyEvidence(),
    isOffRoute: false,
    lastSampleAtMs: state.lastSampleAtMs,
    latestOffRouteSample: null,
    monitoringStartedAtMs: state.monitoringStartedAtMs,
    recoveryEvidence: emptyEvidence(),
    requestRevision: state.requestRevision,
    routeId: state.routeId,
    routeRevision: invalidatePendingRequest
      ? nextRevision(state.routeRevision)
      : state.routeRevision,
    status: "monitoring",
  };
}

function matchesPendingRequest(
  state: LiveRerouteState,
  revision: LiveRerouteRequestRevision,
): state is PendingLiveRerouteState {
  return Boolean(
    state.status === "pending" &&
      state.routeId === revision.routeId &&
      state.routeRevision === revision.routeRevision &&
      state.requestRevision === revision.requestRevision &&
      state.request.routeId === revision.routeId &&
      state.request.routeRevision === revision.routeRevision &&
      state.request.requestRevision === revision.requestRevision,
  );
}

function unchangedRequestTransition(
  state: LiveRerouteState,
  evaluation: OffRouteSampleEvaluation,
): LiveRerouteSampleTransition {
  return {
    evaluation,
    ignoredReason: null,
    request: null,
    state,
  };
}

function staleResponse(state: LiveRerouteState): LiveRerouteResponseTransition {
  return {
    accepted: false,
    reason: "stale-response",
    state,
  };
}

function emptyEvidence(): RerouteEvidence {
  return {
    count: 0,
    firstTimestampMs: null,
    lastTimestampMs: null,
  };
}

function copySample(sample: LiveRerouteLocationSample): LiveRerouteLocationSample {
  return {
    coordinate: { ...sample.coordinate },
    distanceFromRouteMeters: sample.distanceFromRouteMeters,
    horizontalAccuracyMeters: sample.horizontalAccuracyMeters,
    timestampMs: sample.timestampMs,
  };
}

function invalidEvaluation(reason: OffRouteSampleReason): OffRouteSampleEvaluation {
  return {
    classification: "invalid",
    maximumPossibleDistanceMeters: null,
    minimumPossibleDistanceMeters: null,
    reason,
  };
}

function uncertainEvaluation(reason: OffRouteSampleReason): OffRouteSampleEvaluation {
  return {
    classification: "uncertain",
    maximumPossibleDistanceMeters: null,
    minimumPossibleDistanceMeters: null,
    reason,
  };
}

function isValidCoordinate(coordinate: LiveRerouteCoordinate): boolean {
  return Boolean(
    coordinate &&
      Number.isFinite(coordinate.latitude) &&
      coordinate.latitude >= -90 &&
      coordinate.latitude <= 90 &&
      Number.isFinite(coordinate.longitude) &&
      coordinate.longitude >= -180 &&
      coordinate.longitude <= 180,
  );
}

function isFiniteTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function requiredTimestamp(value: number, label: string): number {
  if (!isFiniteTimestamp(value)) {
    throw new RangeError(`${label} must be a finite, non-negative timestamp.`);
  }

  return value;
}

function finiteTimestampOr(
  value: number | null | undefined,
  fallback: number,
): number {
  return typeof value === "number" && isFiniteTimestamp(value) ? value : fallback;
}

function cleanRequiredRouteId(value: string): string {
  const routeId = cleanOptionalText(value);
  if (!routeId) {
    throw new TypeError("routeId must be a non-empty string.");
  }

  return routeId;
}

function cleanOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || null;
}

function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new RangeError("Reroute revisions must be non-negative safe integers.");
  }

  if (current === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Reroute revision space is exhausted.");
  }

  return current + 1;
}

function normalizedId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedIdSet(
  values: readonly string[] | ReadonlySet<string> | undefined,
): Set<string> {
  const normalized = new Set<string>();
  if (!values) {
    return normalized;
  }

  values.forEach((value) => {
    const id = normalizedId(value);
    if (id) {
      normalized.add(id);
    }
  });
  return normalized;
}

function finiteCheckpointIndex(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function positiveNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function nonNegativeNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function positiveIntegerOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}
