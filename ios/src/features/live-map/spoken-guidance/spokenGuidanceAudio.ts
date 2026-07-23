export interface SpokenGuidanceUtterance {
  id: string;
  interrupt: boolean;
  text: string;
}

export interface SpokenGuidanceAudioDriver {
  isAvailable(): boolean | Promise<boolean>;
  speak(utterance: SpokenGuidanceUtterance): void | Promise<void>;
  stop(): void | Promise<void>;
}

const unavailableSpokenGuidanceAudioDriver: SpokenGuidanceAudioDriver =
  Object.freeze({
    isAvailable: () => false,
    speak: async () => undefined,
    stop: async () => undefined,
  });

/**
 * Keeps spoken guidance safely disabled when no native TTS implementation has
 * been registered. This is preferable to substituting accessibility
 * announcements, which are not a general-purpose navigation audio channel.
 */
export function createUnavailableSpokenGuidanceAudioDriver(): SpokenGuidanceAudioDriver {
  return unavailableSpokenGuidanceAudioDriver;
}

