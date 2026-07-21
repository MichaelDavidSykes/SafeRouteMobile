export interface WorkspaceAccessAnnouncementFinishedEvent {
  announcement: string;
  success: boolean;
}

interface WorkspaceAccessFocusHandoffDependencies<TTarget> {
  announce: (announcement: string) => void;
  focus: (target: TTarget) => void;
  isScreenReaderEnabled: () => Promise<boolean>;
  scheduleFallback: (callback: () => void, delayMs: number) => () => void;
  subscribeToAnnouncementFinished: (
    listener: (event: WorkspaceAccessAnnouncementFinishedEvent) => void,
  ) => () => void;
}

export interface WorkspaceAccessFocusHandoff<TTarget> {
  cancel: () => void;
  request: (
    announcement: string,
    getTarget: () => TTarget | null,
  ) => Promise<void>;
}

export const WORKSPACE_ACCESS_FOCUS_FALLBACK_MS = 2500;

export function createWorkspaceAccessFocusHandoff<TTarget>(
  dependencies: WorkspaceAccessFocusHandoffDependencies<TTarget>,
): WorkspaceAccessFocusHandoff<TTarget> {
  let requestRevision = 0;
  let cancelActiveRequest: () => void = () => undefined;

  const clearActiveRequest = () => {
    const cancel = cancelActiveRequest;
    cancelActiveRequest = () => undefined;
    cancel();
  };

  return {
    cancel() {
      requestRevision += 1;
      clearActiveRequest();
    },
    async request(announcement, getTarget) {
      clearActiveRequest();
      const revision = requestRevision + 1;
      requestRevision = revision;

      let screenReaderEnabled = false;
      try {
        screenReaderEnabled = await dependencies.isScreenReaderEnabled();
      } catch {
        if (revision === requestRevision) {
          dependencies.announce(announcement);
        }
        return;
      }

      if (revision !== requestRevision) {
        return;
      }
      if (!screenReaderEnabled) {
        dependencies.announce(announcement);
        return;
      }

      let settled = false;
      let removeAnnouncementListener: () => void = () => undefined;
      let cancelFallback: () => void = () => undefined;

      const cleanup = () => {
        removeAnnouncementListener();
        cancelFallback();
        removeAnnouncementListener = () => undefined;
        cancelFallback = () => undefined;
      };
      const finish = (
        shouldFocus: boolean,
        waitForTargetUntilFallback = false,
      ) => {
        if (settled || revision !== requestRevision) {
          return;
        }
        const target = shouldFocus ? getTarget() : null;
        if (shouldFocus && !target && waitForTargetUntilFallback) {
          return;
        }
        settled = true;
        cleanup();
        cancelActiveRequest = () => undefined;
        if (target) {
          dependencies.focus(target);
        }
      };
      const cancelRequest = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
      };

      cancelActiveRequest = cancelRequest;
      removeAnnouncementListener = dependencies.subscribeToAnnouncementFinished(
        (event) => {
          if (event.announcement !== announcement) {
            return;
          }
          finish(event.success, event.success);
        },
      );
      cancelFallback = dependencies.scheduleFallback(
        () => finish(true),
        WORKSPACE_ACCESS_FOCUS_FALLBACK_MS,
      );
      dependencies.announce(announcement);
    },
  };
}
