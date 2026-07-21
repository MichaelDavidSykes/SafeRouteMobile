import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyReliableLocationSample,
  canAcceptLocationSource,
  createLocationSignalState,
  isReliableLocationSampleRecent,
  normalizeReliableLocationSample,
  type ReliableLocationSample,
} from "../src/features/live-map/locationSignal";

function sample(
  overrides: Partial<ReliableLocationSample> = {},
): ReliableLocationSample {
  return {
    accuracyMeters: 8,
    headingDegrees: 90,
    latitude: 51.5074,
    longitude: -0.1278,
    speedMetersPerSecond: 8,
    timestampMs: 1_000,
    ...overrides,
  };
}

describe("reliable live-location signal", () => {
  it("normalizes valid samples and rejects unsafe coordinates", () => {
    assert.deepEqual(normalizeReliableLocationSample(sample()), sample());
    assert.equal(
      normalizeReliableLocationSample(sample({ latitude: 120 })),
      null,
    );
    assert.equal(normalizeReliableLocationSample(null), null);
  });

  it("accepts simulator-provided locations only in development runtimes", () => {
    assert.equal(canAcceptLocationSource(false, false), true);
    assert.equal(canAcceptLocationSource(undefined, false), true);
    assert.equal(canAcceptLocationSource(true, false), false);
    assert.equal(canAcceptLocationSource(true, true), true);
  });

  it("rejects stale samples without moving the accepted position", () => {
    const initial = createLocationSignalState(sample({ timestampMs: 2_000 }));
    const transition = applyReliableLocationSample(
      initial,
      sample({ latitude: 51.6, timestampMs: 1_900 }),
      { navigationActive: true },
    );

    assert.equal(transition.accepted, false);
    assert.equal(transition.reason, "stale");
    assert.deepEqual(transition.state.sample, initial.sample);
  });

  it("rejects a transient low-accuracy fix during active navigation", () => {
    const initial = createLocationSignalState(sample());
    const transition = applyReliableLocationSample(
      initial,
      sample({ accuracyMeters: 280, timestampMs: 2_000 }),
      { navigationActive: true },
    );

    assert.equal(transition.accepted, false);
    assert.equal(transition.reason, "poor-accuracy");
    assert.equal(transition.quality, "degraded");

    const prolongedPoorFix = applyReliableLocationSample(
      initial,
      sample({ accuracyMeters: 280, timestampMs: 62_000 }),
      { navigationActive: true },
    );
    assert.equal(prolongedPoorFix.reason, "poor-accuracy");
  });

  it("does not accept an unusably inaccurate first fix", () => {
    const transition = applyReliableLocationSample(
      createLocationSignalState(),
      sample({ accuracyMeters: 400 }),
      { navigationActive: false },
    );

    assert.equal(transition.accepted, false);
    assert.equal(transition.reason, "poor-accuracy");
    assert.equal(transition.state.sample, null);
  });

  it("rejects wall-clock stale and future fixes when runtime time is supplied", () => {
    assert.equal(
      applyReliableLocationSample(
        createLocationSignalState(),
        sample({ timestampMs: 1_000 }),
        { nowMs: 200_000 },
      ).reason,
      "stale",
    );
    assert.equal(
      applyReliableLocationSample(
        createLocationSignalState(),
        sample({ timestampMs: 250_000 }),
        { nowMs: 200_000 },
      ).reason,
      "stale",
    );
    assert.equal(
      isReliableLocationSampleRecent(sample({ timestampMs: 190_000 }), 200_000),
      true,
    );
  });

  it("rejects impossible GPS teleports while allowing normal driving movement", () => {
    const initial = createLocationSignalState(sample());
    const teleport = applyReliableLocationSample(
      initial,
      sample({ latitude: 51.6, longitude: -0.3, timestampMs: 2_000 }),
      { navigationActive: true },
    );
    const movement = applyReliableLocationSample(
      initial,
      sample({ latitude: 51.50748, timestampMs: 2_000 }),
      { navigationActive: true },
    );

    assert.equal(teleport.reason, "implausible-jump");
    assert.equal(movement.accepted, true);
  });

  it("recovers after two consistent fixes confirm that the previous position was wrong", () => {
    const initial = createLocationSignalState(sample());
    const firstTrueFix = applyReliableLocationSample(
      initial,
      sample({ latitude: 51.6, longitude: -0.3, timestampMs: 2_000 }),
      { navigationActive: true },
    );
    const confirmedTrueFix = applyReliableLocationSample(
      firstTrueFix.state,
      sample({ latitude: 51.60005, longitude: -0.30005, timestampMs: 3_000 }),
      { navigationActive: true },
    );

    assert.equal(firstTrueFix.reason, "implausible-jump");
    assert.equal(confirmedTrueFix.accepted, true);
    assert.equal(confirmedTrueFix.state.sample?.latitude, 51.60005);
    assert.equal(confirmedTrueFix.state.jumpCandidate, null);
  });

  it("smooths nearby coordinates without freezing meaningful movement", () => {
    const initialSample = sample({ speedMetersPerSecond: 2 });
    const transition = applyReliableLocationSample(
      createLocationSignalState(initialSample),
      sample({
        latitude: 51.5075,
        speedMetersPerSecond: 2,
        timestampMs: 2_000,
      }),
      { navigationActive: true },
    );

    assert.equal(transition.accepted, true);
    assert.ok(
      (transition.state.sample?.latitude || 0) > initialSample.latitude,
    );
    assert.ok((transition.state.sample?.latitude || 0) < 51.5075);
  });

  it("smooths headings correctly across north", () => {
    const transition = applyReliableLocationSample(
      createLocationSignalState(sample({ headingDegrees: 358 })),
      sample({
        headingDegrees: 2,
        latitude: 51.50741,
        timestampMs: 2_000,
      }),
      { navigationActive: true },
    );
    const heading = transition.state.sample?.headingDegrees;

    assert.notEqual(heading, null);
    assert.ok((heading || 0) > 350 || (heading || 0) < 10);
  });

  it("smooths coordinates across the date line without crossing the globe", () => {
    const transition = applyReliableLocationSample(
      createLocationSignalState(
        sample({ latitude: 0, longitude: 179.9999 }),
      ),
      sample({
        latitude: 0,
        longitude: -179.9999,
        timestampMs: 2_000,
      }),
      { navigationActive: true },
    );

    assert.equal(transition.accepted, true);
    assert.ok(Math.abs(transition.state.sample?.longitude || 0) > 179);
  });

  it("retains the last stable heading while effectively stationary", () => {
    const transition = applyReliableLocationSample(
      createLocationSignalState(sample({ headingDegrees: 80 })),
      sample({
        headingDegrees: 220,
        speedMetersPerSecond: 0.2,
        timestampMs: 2_000,
      }),
      { navigationActive: true },
    );

    assert.equal(transition.state.sample?.headingDegrees, 80);
  });
});
