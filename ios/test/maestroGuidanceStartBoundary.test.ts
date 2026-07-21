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

  it('does not arm while a protected preparation request is unfinished', async () => {
    let nowMs = 0;
    const entries: Array<Record<string, unknown>> = [
      {
        event: 'request',
        protected: true,
        requestId: 'request-preparation',
        sequence: 1
      }
    ];

    await waitForGuidanceStartTrafficQuiet({
      isProtectedTraffic,
      now: () => nowMs,
      pollMs: 100,
      quietMs: 200,
      readEntries: () => entries,
      sleep: async (delayMs: number) => {
        nowMs += delayMs;
        if (nowMs === 1000) {
          entries.push({
            completed: true,
            event: 'completion',
            protected: false,
            requestId: 'request-preparation',
            sequence: 2,
            statusCode: 200
          });
        }
      },
      timeoutMs: 2000
    });

    assert.equal(nowMs, 1200);
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

  it('waits for the expected response outcome rather than request arrival', async () => {
    let nowMs = 0;
    const entries: Array<Record<string, unknown>> = [];

    await waitForGuidanceStartTraffic({
      boundary: 'active-start',
      boundaryPath: '/__guidance_contract__/boundary',
      expectedCount: 1,
      expectedOutcomes: [
        { semanticOutcome: 'principal-a', statusCode: 200 }
      ],
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
        } else if (nowMs === 20) {
          entries.push({
            event: 'request',
            path: '/api/v1/users/me',
            protected: true,
            requestId: 'request-user-a',
            search: '',
            sequence: 2
          });
        } else if (nowMs === 40) {
          entries.push({
            completed: true,
            event: 'completion',
            path: '/api/v1/users/me',
            protected: false,
            requestId: 'request-user-a',
            semanticOutcome: 'principal-a',
            sequence: 3,
            statusCode: 200
          });
        }
      },
      timeoutMs: 100
    });

    assert.equal(nowMs, 40);
  });

  it('rejects an incomplete or semantically wrong response outcome', async () => {
    let nowMs = 0;
    const entries = [
      {
        path: '/__guidance_contract__/boundary',
        protected: false,
        search: '?boundary=denied-start&edge=open',
        sequence: 1
      },
      {
        event: 'request',
        path: '/api/v1/mobile/safe-route/routes',
        protected: true,
        requestId: 'request-denied-catalog',
        search: '',
        sequence: 2
      },
      {
        completed: true,
        event: 'completion',
        path: '/api/v1/mobile/safe-route/routes',
        protected: false,
        requestId: 'request-denied-catalog',
        semanticOutcome: 'catalog-active',
        sequence: 3,
        statusCode: 200
      }
    ];

    await assert.rejects(
      waitForGuidanceStartTraffic({
        boundary: 'denied-start',
        boundaryPath: '/__guidance_contract__/boundary',
        expectedCount: 1,
        expectedOutcomes: [
          { semanticOutcome: 'catalog-denied', statusCode: 200 }
        ],
        isProtectedTraffic,
        now: () => nowMs,
        readEntries: () => entries,
        sleep: async (delayMs: number) => {
          nowMs += delayMs;
        },
        timeoutMs: 100
      }),
      /unexpected response outcome/
    );
    await assert.rejects(
      waitForGuidanceStartTraffic({
        boundary: 'denied-start',
        boundaryPath: '/__guidance_contract__/boundary',
        expectedCount: 1,
        expectedOutcomes: [
          { semanticOutcome: 'catalog-denied', statusCode: 200 }
        ],
        isProtectedTraffic,
        now: () => nowMs,
        readEntries: () => entries.map((entry) =>
          entry.event === 'completion'
            ? {
                ...entry,
                completed: false,
                semanticOutcome: 'connection-closed',
                statusCode: null
              }
            : entry
        ),
        sleep: async (delayMs: number) => {
          nowMs += delayMs;
        },
        timeoutMs: 100
      }),
      /unexpected response outcome/
    );
  });

  it('rejects catalog authorization issued before principal completion', async () => {
    let nowMs = 0;
    const entries = [
      {
        path: '/__guidance_contract__/boundary',
        protected: false,
        search: '?boundary=active-start&edge=open',
        sequence: 1
      },
      {
        event: 'request',
        path: '/api/v1/users/me',
        protected: true,
        requestId: 'request-active-user',
        search: '',
        sequence: 2
      },
      {
        event: 'request',
        path: '/api/v1/mobile/safe-route/routes',
        protected: true,
        requestId: 'request-active-catalog',
        search: '',
        sequence: 3
      },
      {
        completed: true,
        event: 'completion',
        path: '/api/v1/users/me',
        protected: false,
        requestId: 'request-active-user',
        semanticOutcome: 'principal-a',
        sequence: 4,
        statusCode: 200
      },
      {
        completed: true,
        event: 'completion',
        path: '/api/v1/mobile/safe-route/routes',
        protected: false,
        requestId: 'request-active-catalog',
        semanticOutcome: 'catalog-active',
        sequence: 5,
        statusCode: 200
      }
    ];

    await assert.rejects(
      waitForGuidanceStartTraffic({
        boundary: 'active-start',
        boundaryPath: '/__guidance_contract__/boundary',
        expectedCount: 2,
        expectedOutcomes: [
          { semanticOutcome: 'principal-a', statusCode: 200 },
          { semanticOutcome: 'catalog-active', statusCode: 200 }
        ],
        isProtectedTraffic,
        now: () => nowMs,
        readEntries: () => entries,
        sleep: async (delayMs: number) => {
          nowMs += delayMs;
        },
        timeoutMs: 100
      }),
      /before the prior response completed/
    );
  });
});
