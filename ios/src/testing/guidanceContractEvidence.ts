import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  LUNARCHAIN_API_URL,
  SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED,
  SAFEROUTE_SOURCE_REVISION,
} from "../config/env";
import {
  appendGuidanceContractEvidenceEvents,
  createGuidanceContractEvidenceEvent,
  isGuidanceContractEvidenceAcknowledged,
  parseGuidanceContractEvidenceSpool,
  type CreateGuidanceContractEvidenceInput,
  type GuidanceContractEvidenceEvent,
} from "./guidanceContractEvidenceCore";

const EVIDENCE_STORAGE_KEY = "@saferoute/guidance-contract-evidence-v1";
const EVIDENCE_PATH = "/__guidance_contract__/evidence";
const APP_LAUNCH_ID = createAppLaunchId();
let evidenceMutationQueue: Promise<void> = Promise.resolve();

export type GuidanceContractEvidenceInput = Omit<
  CreateGuidanceContractEvidenceInput,
  "appLaunchId" | "sourceRevision"
>;

export async function recordGuidanceContractEvidence(
  input: GuidanceContractEvidenceInput,
): Promise<boolean> {
  if (!SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED) {
    return false;
  }
  const event = createGuidanceContractEvidenceEvent({
    ...input,
    appLaunchId: APP_LAUNCH_ID,
    sourceRevision: SAFEROUTE_SOURCE_REVISION,
  });
  if (!event) {
    return false;
  }

  return enqueueEvidenceMutation(async () => {
    try {
      let current = currentRevisionEvents(parseGuidanceContractEvidenceSpool(
        await AsyncStorage.getItem(EVIDENCE_STORAGE_KEY),
      ));
      let next = appendGuidanceContractEvidenceEvents(current, [event]);
      if (!next.some((candidate) => candidate.eventId === event.eventId)) {
        await flushEvidenceEvents(current);
        current = currentRevisionEvents(parseGuidanceContractEvidenceSpool(
          await AsyncStorage.getItem(EVIDENCE_STORAGE_KEY),
        ));
        next = appendGuidanceContractEvidenceEvents(current, [event]);
        if (!next.some((candidate) => candidate.eventId === event.eventId)) {
          return false;
        }
      }
      await AsyncStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(next));
      await flushEvidenceEvents(next);
      return true;
    } catch {
      return false;
    }
  });
}

function createAppLaunchId(): string {
  return `launch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function flushGuidanceContractEvidence(): Promise<boolean> {
  if (!SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED) {
    return false;
  }
  return enqueueEvidenceMutation(async () => {
    try {
      const events = currentRevisionEvents(parseGuidanceContractEvidenceSpool(
        await AsyncStorage.getItem(EVIDENCE_STORAGE_KEY),
      ));
      await flushEvidenceEvents(events);
      return true;
    } catch {
      return false;
    }
  });
}

function currentRevisionEvents(
  events: GuidanceContractEvidenceEvent[],
): GuidanceContractEvidenceEvent[] {
  return events.filter((event) => event.sourceRevision === SAFEROUTE_SOURCE_REVISION);
}

async function flushEvidenceEvents(
  events: GuidanceContractEvidenceEvent[],
): Promise<void> {
  let delivered = 0;
  for (const event of events) {
    try {
      const response = await fetch(`${LUNARCHAIN_API_URL}${EVIDENCE_PATH}`, {
        body: JSON.stringify(event),
        headers: {
          "Content-Type": "application/json",
          "X-SafeRoute-Guidance-Contract-Evidence": "1",
        },
        method: "POST",
      });
      if (!response.ok) {
        break;
      }
      const acknowledgement = await response.json();
      if (!isGuidanceContractEvidenceAcknowledged(acknowledgement, event.eventId)) {
        break;
      }
      delivered += 1;
    } catch {
      break;
    }
  }

  const remaining = events.slice(delivered);
  if (remaining.length) {
    await AsyncStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(remaining));
  } else {
    await AsyncStorage.removeItem(EVIDENCE_STORAGE_KEY);
  }
}

function enqueueEvidenceMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = evidenceMutationQueue.then(mutation, mutation);
  evidenceMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
