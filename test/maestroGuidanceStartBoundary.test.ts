import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertGuidanceStartTrafficRemainsQuiet,
  waitForGuidanceStartTraffic,
  waitForGuidanceStartTrafficQuiet
} from '../scripts/maestro-guidance-start-boundary.mjs';

const isProtectedTraffic = (entry: { protected?: boolean }) =>
  entry.protected === true;

describe('Maestro guidance Start boundary observation', () => {
  it('resets the quiet interval when delayed preparation traffic arrives', async () => {
    let nowMs = 0;
    const entries: Array<{ protected: boolean; sequence: number }> = [];

    await waitForGuidanceStartTrafficQuiet({
      isProtectedTraffic,
      now: () => nowMs,
      pollMs: 100,
      quietMs: 750,
      readEntries: () => entries,
      sleep: async (delayMs: number) => {
        nowMs += delayMs;
        if (nowMs === 300) {
          entries.push({ protected: true, sequence: 1 });
        }
      },
      timeoutMs: 2000
    });

    assert.equal(nowMs, 1100);
  });

  it('times out rather than treating continuously changing traffic as quiet', async () => {
    let nowMs = 0;
    const entries: Array<{ protected: boolean; sequence: number }> = [];

    await assert.rejects(
      waitForGuidanceStartTrafficQuiet({
        isProtectedTraffic,
        now: () => nowMs,
        pollMs: 100,
        quietMs: 200,
        readEntries: () => entries,
        sleep: async (delayMs: number) => {
          nowMs += delayMs;
          entries.push({ protected: true, sequence: entries.length + 1 });
        },
        timeoutMs: 500
      }),
      /did not become quiet/
    );
  });

  it('rejects any protected traffic appended during quarantine', async () => {
    let nowMs = 0;
    const entries: Array<{ protected: boolean; sequence: number }> = [];

    await assert.rejects(
      assertGuidanceStartTrafficRemainsQuiet({
        isProtectedTraffic,
        now: () => nowMs,
        observationMs: 500,
        pollMs: 100,
        readEntries: () => entries,
        sleep: async (delayMs: number) => {
          nowMs += delayMs;
          if (nowMs === 300) {
            entries.push({ protected: true, sequence: 1 });
          }
        }
      }),
      /escaped its observation window/
    );
  });

  it('waits for the exact Start boundary to record its protected traffic', async () => {
    let nowMs = 0;
    const entries: Array<{
      path: string;
      protected: boolean;
      search: string;
      sequence: number;
    }> = [];

    await waitForGuidanceStartTraffic({
      boundary: 'active-start',
      boundaryPath: '/__guidance_contract__/boundary',
      expectedCount: 2,
      isProtectedTraffic,
      now: () => nowMs,
      pollMs: 10,
      readEntries: () => entries,
      sleep: async (delayMs: number) => {
        nowMs += delayMs;
        if (nowMs === 10) {
          entries.push({
            path: '/__guidance_contract__/boundary',
            protected: false,
            search: '?boundary=active-start&edge=open',
            sequence: 1
          });
        } else if (nowMs === 20 || nowMs === 30) {
          entries.push({
            path: nowMs === 20 ? '/api/v1/users/me' : '/api/v1/mobile/safe-route/routes',
            protected: true,
            search: '',
            sequence: entries.length + 1
          });
        }
      },
      timeoutMs: 100
    });

    assert.equal(nowMs, 30);
  });
});
