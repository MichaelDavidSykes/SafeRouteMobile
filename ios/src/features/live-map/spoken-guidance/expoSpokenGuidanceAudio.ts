import * as Speech from 'expo-speech';

import type {
  SpokenGuidanceAudioDriver,
  SpokenGuidanceUtterance,
} from './spokenGuidanceAudio';

const SAFEROUTE_SPEECH_LANGUAGE = 'en-GB';
const SAFEROUTE_SPEECH_RATE = 0.94;

export function createExpoSpokenGuidanceAudioDriver(): SpokenGuidanceAudioDriver {
  return {
    async isAvailable() {
      try {
        return (await Speech.getAvailableVoicesAsync()).length > 0;
      } catch {
        return false;
      }
    },

    async speak(utterance: SpokenGuidanceUtterance) {
      if (utterance.interrupt) {
        await Speech.stop();
      }
      await new Promise<void>((resolve, reject) => {
        Speech.speak(utterance.text, {
          language: SAFEROUTE_SPEECH_LANGUAGE,
          pitch: 1,
          rate: SAFEROUTE_SPEECH_RATE,
          useApplicationAudioSession: false,
          onDone: resolve,
          onError: reject,
          onStopped: resolve,
        });
      });
    },

    stop() {
      return Speech.stop();
    },
  };
}
