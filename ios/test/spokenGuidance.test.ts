import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  SpokenGuidanceController,
  createUnavailableSpokenGuidanceAudioDriver,
  normalizeBackendManeuverBatch,
  type BackendManeuverBatch,
  type SpokenGuidanceAudioDriver,
  type SpokenGuidanceUtterance,
} from '../src/features/live-map/spoken-guidance';

class RecordingAudioDriver implements SpokenGuidanceAudioDriver {
  available = true;
  failNextSpeak = false;
  speakBarrier: Promise<void> | null = null;
  stops = 0;
  utterances: SpokenGuidanceUtterance[] = [];

  isAvailable(): boolean {
    return this.available;
  }

  async speak(utterance: SpokenGuidanceUtterance): Promise<void> {
    this.utterances.push(utterance);
    if (this.speakBarrier) {
      await this.speakBarrier;
    }
    if (this.failNextSpeak) {
      this.failNextSpeak = false;
      throw new Error('speech engine failed');
    }
  }

  async stop(): Promise<void> {
    this.stops += 1;
  }
}

function batch(
  routeRevision = 'revision-1',
  maneuvers: unknown = [
    {
      distance_along_meters: 100,
      id: 'backend-turn-1',
      instruction: 'Turn left onto Fleet Street',
    },
    {
      distance_along_meters: 420,
      id: 'backend-turn-2',
      instruction: 'Continue straight',
    },
  ],
): BackendManeuverBatch {
  const normalized = normalizeBackendManeuverBatch({
    maneuvers,
    routeId: 'route-1',
    routeRevision,
    source: 'backend',
  });
  assert.ok(normalized);
  return normalized;
}

describe('backend spoken guidance boundary', () => {
  it('accepts, sanitizes, sorts, and deduplicates backend maneuvers', () => {
    const normalized = normalizeBackendManeuverBatch({
      maneuvers: [
        {
          distanceAlongMeters: 300,
          id: 'second',
          instruction: '  Continue \n straight  ',
        },
        {
          distance_along_meters: 100,
          id: 'first',
          message: 'Turn right',
        },
        {
          distance_along_meters: 100.01,
          id: 'duplicate',
          instruction: 'turn RIGHT',
        },
      ],
      routeId: 'route-1',
      routeRevision: 7,
      source: 'backend',
    });

    assert.deepEqual(normalized, {
      maneuvers: [
        {
          distanceAlongMeters: 100,
          id: 'first',
          instruction: 'Turn right',
        },
        {
          distanceAlongMeters: 300,
          id: 'second',
          instruction: 'Continue straight',
        },
      ],
      routeId: 'route-1',
      routeRevision: '7',
      source: 'backend',
    });
  });

  it('rejects unstamped input, invalid instructions, and known client-derived fallback steps', () => {
    assert.equal(
      normalizeBackendManeuverBatch({
        maneuvers: [],
        routeId: 'route-1',
        routeRevision: '1',
        source: 'client',
      }),
      null,
    );

    const normalized = normalizeBackendManeuverBatch({
      maneuvers: [
        {
          distanceAlongMeters: 10,
          id: 'geometry-step-2',
          instruction: 'Turn left to stay on the saved route',
        },
        {
          distanceAlongMeters: 20,
          id: 'backend-empty',
          instruction: '   ',
        },
        {
          distanceAlongMeters: null,
          id: 'backend-missing-distance',
          instruction: 'Turn right',
        },
        {
          distanceAlongMeters: 30,
          id: 'backend-invalid-instruction',
          instruction: 42,
        },
      ],
      routeId: 'route-1',
      routeRevision: '1',
      source: 'backend',
    });

    assert.ok(normalized);
    assert.deepEqual(normalized.maneuvers, []);
  });
});

describe('spoken guidance controller', () => {
  it('announces only the exact eligible backend instruction', async () => {
    const audio = new RecordingAudioDriver();
    const controller = new SpokenGuidanceController({ audio });

    const tooEarly = await controller.update({
      active: true,
      batch: batch(),
      speedMetersPerSecond: 2,
      travelledDistanceMeters: 0,
    });
    assert.deepEqual(tooEarly, { reason: 'too-early', status: 'suppressed' });

    const announced = await controller.update({
      active: true,
      batch: batch(),
      speedMetersPerSecond: 2,
      travelledDistanceMeters: 35,
    });
    assert.equal(announced.status, 'announced');
    assert.deepEqual(audio.utterances.map((item) => item.text), [
      'Turn left onto Fleet Street',
    ]);
    assert.equal(audio.utterances[0].interrupt, true);
  });

  it('stays silent without backend maneuvers or while navigation is inactive', async () => {
    const audio = new RecordingAudioDriver();
    const controller = new SpokenGuidanceController({ audio });

    assert.deepEqual(
      await controller.update({
        active: true,
        batch: null,
        travelledDistanceMeters: 0,
      }),
      { reason: 'no-backend-maneuver', status: 'suppressed' },
    );
    assert.deepEqual(
      await controller.update({
        active: false,
        batch: batch(),
        travelledDistanceMeters: 90,
      }),
      { reason: 'inactive', status: 'suppressed' },
    );
    assert.equal(audio.utterances.length, 0);
  });

  it('deduplicates repeated and concurrent progress updates', async () => {
    const audio = new RecordingAudioDriver();
    let releaseSpeak: (() => void) | null = null;
    audio.speakBarrier = new Promise<void>((resolve) => {
      releaseSpeak = resolve;
    });
    const controller = new SpokenGuidanceController({ audio });
    const progressUpdate = {
      active: true,
      batch: batch(),
      speedMetersPerSecond: 5,
      travelledDistanceMeters: 40,
    };

    const first = controller.update(progressUpdate);
    while (audio.utterances.length === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const concurrent = await controller.update(progressUpdate);
    assert.deepEqual(concurrent, {
      reason: 'duplicate',
      status: 'suppressed',
    });
    releaseSpeak?.();
    assert.equal((await first).status, 'announced');

    const repeatedProgress = await controller.update(progressUpdate);
    assert.deepEqual(repeatedProgress, {
      reason: 'duplicate',
      status: 'suppressed',
    });
    assert.equal(audio.utterances.length, 1);
  });

  it('mutes immediately, remains silent, and resumes only for an unannounced maneuver', async () => {
    const audio = new RecordingAudioDriver();
    const controller = new SpokenGuidanceController({ audio });
    await controller.update({
      active: true,
      batch: batch(),
      travelledDistanceMeters: 40,
    });

    const muted = await controller.setMuted(true);
    assert.equal(muted.muted, true);
    assert.equal(audio.stops, 1);
    assert.deepEqual(await controller.repeat(), {
      reason: 'muted',
      status: 'suppressed',
    });
    assert.deepEqual(
      await controller.update({
        active: true,
        batch: batch(),
        travelledDistanceMeters: 410,
      }),
      { reason: 'muted', status: 'suppressed' },
    );

    await controller.setMuted(false);
    const next = await controller.update({
      active: true,
      batch: batch(),
      travelledDistanceMeters: 410,
    });
    assert.equal(next.status, 'announced');
    assert.deepEqual(audio.utterances.map((item) => item.text), [
      'Turn left onto Fleet Street',
      'Continue straight',
    ]);
  });

  it('repeats the last backend maneuver intentionally without clearing deduplication', async () => {
    const audio = new RecordingAudioDriver();
    const controller = new SpokenGuidanceController({ audio });
    await controller.update({
      active: true,
      batch: batch(),
      travelledDistanceMeters: 40,
    });

    const repeated = await controller.repeat();
    assert.equal(repeated.status, 'repeated');
    assert.deepEqual(audio.utterances.map((item) => item.text), [
      'Turn left onto Fleet Street',
      'Turn left onto Fleet Street',
    ]);

    assert.deepEqual(
      await controller.update({
        active: true,
        batch: batch(),
        travelledDistanceMeters: 40,
      }),
      { reason: 'duplicate', status: 'suppressed' },
    );
  });

  it('resets announcement state across backend route revisions', async () => {
    const audio = new RecordingAudioDriver();
    const controller = new SpokenGuidanceController({ audio });
    await controller.update({
      active: true,
      batch: batch('revision-1'),
      travelledDistanceMeters: 40,
    });
    await controller.update({
      active: true,
      batch: batch('revision-2'),
      travelledDistanceMeters: 40,
    });

    assert.equal(audio.utterances.length, 2);
    assert.equal(controller.getSnapshot().currentRouteKey, 'route-1|revision-2');
  });

  it('recovers after audio failure and reports it without breaking navigation', async () => {
    const audio = new RecordingAudioDriver();
    audio.failNextSpeak = true;
    const errors: unknown[] = [];
    const controller = new SpokenGuidanceController({
      audio,
      onAudioError: (error) => errors.push(error),
    });
    const progressUpdate = {
      active: true,
      batch: batch(),
      travelledDistanceMeters: 40,
    };

    assert.deepEqual(await controller.update(progressUpdate), {
      reason: 'audio-error',
      status: 'suppressed',
    });
    assert.equal(errors.length, 1);
    assert.equal((await controller.update(progressUpdate)).status, 'announced');
  });

  it('handles unavailable audio and disposal safely', async () => {
    const controller = new SpokenGuidanceController({
      audio: createUnavailableSpokenGuidanceAudioDriver(),
    });
    assert.deepEqual(
      await controller.update({
        active: true,
        batch: batch(),
        travelledDistanceMeters: 40,
      }),
      { reason: 'audio-unavailable', status: 'suppressed' },
    );

    await controller.dispose();
    assert.deepEqual(await controller.repeat(), {
      reason: 'disposed',
      status: 'suppressed',
    });
  });
});

describe('spoken guidance architecture', () => {
  it('does not import route, geometry, risk, or rerouting calculation modules', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/features/live-map/spoken-guidance/spokenGuidance.ts',
      ),
      'utf8',
    );

    assert.doesNotMatch(
      source,
      /from ['"][^'"]*(routeProgress|routeGeometry|routeRisk|liveReroute|areaRisk)/,
    );
    assert.doesNotMatch(
      source,
      /deriveRouteNavigationSteps|calculateRouteProgress|riskZones|avoidRectangles/,
    );
  });

  it('uses native Expo speech and exposes mute and repeat controls', () => {
    const driverSource = readFileSync(
      join(
        process.cwd(),
        'src/features/live-map/spoken-guidance/expoSpokenGuidanceAudio.ts',
      ),
      'utf8',
    );
    const liveMapSource = readFileSync(
      join(process.cwd(), 'src/features/live-map/LiveMapScreen.tsx'),
      'utf8',
    );
    const guidanceCardSource = readFileSync(
      join(process.cwd(), 'src/features/live-map/LiveMapGuidanceCard.tsx'),
      'utf8',
    );

    assert.match(driverSource, /from 'expo-speech'/);
    assert.match(liveMapSource, /navigationStepSource/);
    assert.match(liveMapSource, /normalizeBackendManeuverBatch/);
    assert.match(guidanceCardSource, /liveMapControl\("voice"\)/);
    assert.match(guidanceCardSource, /liveMapControl\("repeat-voice"\)/);
  });
});
