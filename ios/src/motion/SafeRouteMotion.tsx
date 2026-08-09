import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  LayoutAnimation,
  Platform,
  type KeyboardEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';

export const safeRouteMotion = {
  authDurationMs: 500,
  chromeDurationMs: 500,
  disclosureDurationMs: 320,
  keyboardDurationMs: 250,
  sceneDurationMs: 440,
  scrimDurationMs: 260,
  sheetDurationMs: 300,
  sheetExitDurationMs: 220,
  tabDurationMs: 320,
} as const;

const settledCurve = Easing.bezier(0.2, 0.7, 0.2, 1);
const exitCurve = Easing.bezier(0.4, 0, 1, 1);
const keyboardCurve = Easing.bezier(0.2, 0.8, 0.2, 1);

export const safeRouteEasing = {
  exit: exitCurve,
  keyboard: keyboardCurve,
  settled: settledCurve,
} as const;

export const safeRouteSpring = {
  damping: 22,
  isInteraction: false,
  mass: 0.7,
  overshootClamping: true,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
  stiffness: 240,
} as const;

export function configureNextSafeRouteLayoutAnimation(
  duration: number = safeRouteMotion.scrimDurationMs,
  {
    animateCreate = true,
    animateDelete = true,
  }: {
    animateCreate?: boolean;
    animateDelete?: boolean;
  } = {},
): void {
  LayoutAnimation.configureNext({
    duration,
    ...(animateCreate
      ? {
          create: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
        }
      : {}),
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    ...(animateDelete
      ? {
          delete: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
        }
      : {}),
  });
}

type EntranceVariant =
  | 'auth'
  | 'chrome'
  | 'disclosure'
  | 'list'
  | 'scene'
  | 'scrim'
  | 'sheet';

type MotionEntranceProps = PropsWithChildren<
  ViewProps & {
    delay?: number;
    duration?: number;
    replayKey?: string | number | null;
    style?: StyleProp<ViewStyle>;
    variant?: EntranceVariant;
  }
>;

type EntranceSpec = {
  duration: number;
  translateY: number;
};

const entranceSpecs: Record<EntranceVariant, EntranceSpec> = {
  auth: {
    duration: safeRouteMotion.authDurationMs,
    translateY: 12,
  },
  chrome: {
    duration: safeRouteMotion.chromeDurationMs,
    translateY: -6,
  },
  disclosure: {
    duration: safeRouteMotion.disclosureDurationMs,
    translateY: -8,
  },
  list: {
    duration: 280,
    translateY: 8,
  },
  scene: {
    duration: safeRouteMotion.sceneDurationMs,
    translateY: 12,
  },
  scrim: {
    duration: safeRouteMotion.scrimDurationMs,
    translateY: 0,
  },
  sheet: {
    duration: safeRouteMotion.sheetDurationMs,
    translateY: 24,
  },
};

type ReduceMotionListener = () => void;

const reduceMotionListeners = new Set<ReduceMotionListener>();
let reduceMotionSnapshot = false;
let reduceMotionSubscription:
  | ReturnType<typeof AccessibilityInfo.addEventListener>
  | null = null;
let reduceMotionRequestRevision = 0;

function publishReduceMotionSnapshot(enabled: boolean): void {
  if (reduceMotionSnapshot === enabled) {
    return;
  }
  reduceMotionSnapshot = enabled;
  reduceMotionListeners.forEach((listener) => listener());
}

function startReduceMotionObservation(): void {
  if (reduceMotionSubscription) {
    return;
  }
  const requestRevision = reduceMotionRequestRevision + 1;
  reduceMotionRequestRevision = requestRevision;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      if (
        reduceMotionRequestRevision === requestRevision
        && reduceMotionListeners.size > 0
      ) {
        publishReduceMotionSnapshot(enabled);
      }
    })
    .catch(() => undefined);
  reduceMotionSubscription = AccessibilityInfo.addEventListener(
    'reduceMotionChanged',
    publishReduceMotionSnapshot,
  );
}

function subscribeToReduceMotion(listener: ReduceMotionListener): () => void {
  reduceMotionListeners.add(listener);
  startReduceMotionObservation();
  return () => {
    reduceMotionListeners.delete(listener);
    if (reduceMotionListeners.size > 0) {
      return;
    }
    reduceMotionRequestRevision += 1;
    reduceMotionSubscription?.remove();
    reduceMotionSubscription = null;
  };
}

function getReduceMotionSnapshot(): boolean {
  return reduceMotionSnapshot;
}

export function useReduceMotionEnabled(): boolean {
  return useSyncExternalStore(
    subscribeToReduceMotion,
    getReduceMotionSnapshot,
    getReduceMotionSnapshot,
  );
}

export function useKeyboardTranslateY({
  enabled = true,
  reduceMotionEnabled,
  viewportHeight,
}: {
  enabled?: boolean;
  reduceMotionEnabled: boolean;
  viewportHeight: number;
}): Animated.Value {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios') {
      translateY.stopAnimation();
      translateY.setValue(0);
      return;
    }

    const animateToFrame = (event: KeyboardEvent) => {
      const keyboardOverlap = resolveKeyboardOverlap(
        viewportHeight,
        event.endCoordinates.screenY,
      );
      const duration = Number.isFinite(event.duration)
        ? Math.max(0, event.duration)
        : safeRouteMotion.keyboardDurationMs;
      translateY.stopAnimation();
      if (reduceMotionEnabled || duration === 0) {
        translateY.setValue(-keyboardOverlap);
        return;
      }
      Animated.timing(translateY, {
        duration,
        easing: safeRouteEasing.keyboard,
        isInteraction: false,
        toValue: -keyboardOverlap,
        useNativeDriver: true,
      }).start();
    };

    const metrics = Keyboard.metrics();
    translateY.setValue(
      -resolveKeyboardOverlap(viewportHeight, metrics?.screenY),
    );
    const frameSubscription = Keyboard.addListener(
      'keyboardWillChangeFrame',
      animateToFrame,
    );

    return () => {
      frameSubscription.remove();
      translateY.stopAnimation();
    };
  }, [enabled, reduceMotionEnabled, translateY, viewportHeight]);

  return translateY;
}

export function resolveKeyboardOverlap(
  viewportHeight: number,
  keyboardScreenY: number | undefined,
): number {
  if (
    !Number.isFinite(viewportHeight)
    || viewportHeight <= 0
    || !Number.isFinite(keyboardScreenY)
  ) {
    return 0;
  }
  return Math.max(0, viewportHeight - Number(keyboardScreenY));
}

export function useEntranceProgress({
  delay = 0,
  duration,
  replayKey = null,
}: {
  delay?: number;
  duration: number;
  replayKey?: string | number | null;
}): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotionEnabled = useReduceMotionEnabled();

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotionEnabled) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      delay,
      duration,
      easing: safeRouteEasing.settled,
      isInteraction: false,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [delay, duration, progress, reduceMotionEnabled, replayKey]);

  return progress;
}

export function MotionEntrance({
  children,
  delay = 0,
  duration,
  replayKey = null,
  style,
  variant = 'scene',
  ...viewProps
}: MotionEntranceProps) {
  const spec = entranceSpecs[variant];
  const progress = useEntranceProgress({
    delay,
    duration: duration ?? spec.duration,
    replayKey,
  });
  const animatedStyle = useMemo(
    () => ({
      opacity: progress,
      transform: spec.translateY
        ? [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [spec.translateY, 0],
              }),
            },
          ]
        : undefined,
    }),
    [progress, spec.translateY],
  );

  return (
    <Animated.View {...viewProps} style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export function useLoopingPulse({
  duration = 2600,
  enabled = true,
}: {
  duration?: number;
  enabled?: boolean;
} = {}): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotionEnabled = useReduceMotionEnabled();

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!enabled || reduceMotionEnabled) {
      return;
    }

    const animation = Animated.loop(
      Animated.timing(progress, {
        duration,
        easing: Easing.out(Easing.ease),
        isInteraction: false,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();

    return () => animation.stop();
  }, [duration, enabled, progress, reduceMotionEnabled]);

  return progress;
}

export function useMotionValue(
  value: number,
  {
    duration = safeRouteMotion.tabDurationMs,
    spring = false,
  }: {
    duration?: number;
    spring?: boolean;
  } = {},
): Animated.Value {
  const animatedValue = useRef(new Animated.Value(value)).current;
  const reduceMotionEnabled = useReduceMotionEnabled();

  useEffect(() => {
    animatedValue.stopAnimation();
    if (reduceMotionEnabled) {
      animatedValue.setValue(value);
      return;
    }

    const animation = spring
      ? Animated.spring(animatedValue, {
          ...safeRouteSpring,
          isInteraction: false,
          toValue: value,
          useNativeDriver: true,
        })
      : Animated.timing(animatedValue, {
          duration,
          easing: safeRouteEasing.settled,
          isInteraction: false,
          toValue: value,
          useNativeDriver: true,
        });
    animation.start();

    return () => animation.stop();
  }, [animatedValue, duration, reduceMotionEnabled, spring, value]);

  return animatedValue;
}
