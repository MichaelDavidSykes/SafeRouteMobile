export interface PersistentRiskStorageWriter {
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

interface PendingSave {
  latestValue: string;
  promise: Promise<void>;
}

export function createPersistentRiskWriteQueue(
  storage: PersistentRiskStorageWriter
) {
  const pendingOperations = new Map<string, Promise<void>>();
  const pendingSaves = new Map<string, PendingSave>();

  const wait = async (key: string): Promise<void> => {
    await pendingOperations.get(key)?.catch(() => undefined);
  };

  const save = (key: string, value: string): Promise<void> => {
    const activeSave = pendingSaves.get(key);
    if (activeSave) {
      activeSave.latestValue = value;
      return activeSave.promise;
    }

    const state: PendingSave = {
      latestValue: value,
      promise: Promise.resolve()
    };
    const previous = pendingOperations.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      let writtenValue = '';
      do {
        writtenValue = state.latestValue;
        await storage.setItem(key, writtenValue);
      } while (state.latestValue !== writtenValue);
    });
    state.promise = next;
    pendingSaves.set(key, state);
    pendingOperations.set(key, next);
    void next.finally(() => {
      if (pendingSaves.get(key) === state) {
        pendingSaves.delete(key);
      }
      if (pendingOperations.get(key) === next) {
        pendingOperations.delete(key);
      }
    }).catch(() => undefined);
    return next;
  };

  const clear = (key: string): Promise<void> => {
    pendingSaves.delete(key);
    const previous = pendingOperations.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(() =>
      storage.removeItem(key)
    );
    pendingOperations.set(key, next);
    void next.finally(() => {
      if (pendingOperations.get(key) === next) {
        pendingOperations.delete(key);
      }
    }).catch(() => undefined);
    return next;
  };

  return {
    clear,
    save,
    wait
  };
}
