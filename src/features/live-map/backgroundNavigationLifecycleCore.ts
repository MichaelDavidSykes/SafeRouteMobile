export interface BackgroundNavigationLifecycleCoordinator<Authorization> {
  requestStart<Result>(
    authorization: Authorization,
    operation: () => Promise<Result>,
    staleCleanup: () => Promise<Result>,
  ): Promise<Result>;
  requestStop(
    expectedAuthorization: Authorization | null,
    operation: () => Promise<void>,
    onAccepted?: () => void,
  ): Promise<boolean>;
}

export function createBackgroundNavigationLifecycleCoordinator<Authorization>(
  authorizationsMatch: (left: Authorization, right: Authorization) => boolean,
): BackgroundNavigationLifecycleCoordinator<Authorization> {
  let desiredAuthorization: Authorization | null = null;
  let lifecycleQueue: Promise<void> = Promise.resolve();

  const enqueue = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = lifecycleQueue.then(operation, operation);
    lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const isCurrent = (authorization: Authorization) =>
    desiredAuthorization !== null &&
    authorizationsMatch(authorization, desiredAuthorization);

  return {
    requestStart(authorization, operation, staleCleanup) {
      desiredAuthorization = authorization;
      return enqueue(async () => {
        if (!isCurrent(authorization)) {
          return staleCleanup();
        }
        const result = await operation();
        return isCurrent(authorization) ? result : staleCleanup();
      });
    },
    requestStop(expectedAuthorization, operation, onAccepted) {
      if (
        expectedAuthorization &&
        desiredAuthorization &&
        !authorizationsMatch(expectedAuthorization, desiredAuthorization)
      ) {
        return Promise.resolve(false);
      }
      desiredAuthorization = null;
      onAccepted?.();
      return enqueue(async () => {
        await operation();
        return true;
      });
    },
  };
}
