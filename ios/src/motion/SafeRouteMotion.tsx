import {
  AccessibilityInfo,
  Animated,
  Easing,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

export const safeRouteMotion = {
  authDurationMs: 500,
  chromeDurationMs: 500,
  disclosureDurationMs: 320,
  sceneDurationMs: 440,
  scrimDurationMs: 260,
  sheetDurationMs: 300,
  tabDurationMs: 320,
} as const;

const settledCurve = Easing.bezier(0.2, 0.7, 0.2, 1);

type EntranceVariant =
  | 'auth'
  | 'chrome'
  | 'disclosure'
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

export function useReduceMotionEnabled(): boolean {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setReduceMotionEnabled(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
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
      easing: settledCurve,
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
          damping: 15,
          mass: 0.8,
          stiffness: 210,
          toValue: value,
          useNativeDriver: true,
        })
      : Animated.timing(animatedValue, {
          duration,
          easing: settledCurve,
          toValue: value,
          useNativeDriver: true,
        });
    animation.start();

    return () => animation.stop();
  }, [animatedValue, duration, reduceMotionEnabled, spring, value]);

  return animatedValue;
}
