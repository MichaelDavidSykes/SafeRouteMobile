import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useEntranceProgress } from '../../motion/SafeRouteMotion';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AUTH_ROUTE_LENGTH = 1100;

export function AuthBackdrop() {
  const routeProgress = useEntranceProgress({
    delay: 200,
    duration: 1600
  });

  return (
    <View accessible={false} pointerEvents="none" style={styles.backdrop}>
      <Svg height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 402 874" width="100%">
        <Defs>
          <RadialGradient id="auth-risk" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#E5484D" stopOpacity={0.3} />
            <Stop offset="0.6" stopColor="#E5484D" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#E5484D" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auth-vignette" cx="50%" cy="42%" r="78%">
            <Stop offset="0" stopColor="#080A0F" stopOpacity={0} />
            <Stop offset="0.48" stopColor="#080A0F" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#080A0F" stopOpacity={0.82} />
          </RadialGradient>
        </Defs>

        <Rect fill="#0A0C11" height="874" width="402" />
        <Circle cx="245" cy="470" fill="url(#auth-risk)" r="88" />
        <Circle
          cx="245"
          cy="470"
          fill="none"
          r="88"
          stroke="#E5484D"
          strokeOpacity={0.4}
          strokeWidth="1.5"
        />
        <G opacity={0.8} transform="translate(245 470)">
          <Path
            d="M0 -11 L11 9 L-11 9 Z"
            fill="none"
            stroke="#E5484D"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
          <Path d="M0 -3 V4 M0 6.5 V7" stroke="#E5484D" strokeLinecap="round" strokeWidth="2.4" />
        </G>

        <AnimatedPath
          d="M322 814 C250 724 132 662 118 500 C108 372 182 300 230 248 C272 204 298 168 310 120"
          fill="none"
          stroke="#5CA4FF"
          strokeLinecap="round"
          strokeDasharray={AUTH_ROUTE_LENGTH}
          strokeDashoffset={routeProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [AUTH_ROUTE_LENGTH, 0]
          })}
          strokeOpacity={0.22}
          strokeWidth="10"
        />
        <Path
          d="M322 814 C250 724 132 662 118 500 C108 372 182 300 230 248 C272 204 298 168 310 120"
          fill="none"
          stroke="#FFFFFF"
          strokeDasharray="1 16"
          strokeLinecap="round"
          strokeOpacity={0.5}
          strokeWidth="1.5"
        />

        <Circle cx="322" cy="814" fill="#30B85A" r="9" stroke="#0A0C11" strokeWidth="3" />
        <Circle
          cx="322"
          cy="814"
          fill="none"
          r="17"
          stroke="#30B85A"
          strokeOpacity={0.35}
          strokeWidth="1.5"
        />
        <G transform="translate(310 120)">
          <Path
            d="M0 18 C0 18 13 4 13 -6 A13 13 0 1 0 -13 -6 C-13 4 0 18 0 18 Z"
            fill="#5CA4FF"
            stroke="#0A0C11"
            strokeWidth="2.5"
          />
          <Circle cx="0" cy="-6" fill="#0A0C11" r="4.5" />
        </G>

        <Rect fill="url(#auth-vignette)" height="874" width="402" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject
  }
});
