import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { authColors } from './authDesign';

const STAR_FIELD = [
  [7, 12, 0.36],
  [17, 27, 0.18],
  [23, 8, 0.24],
  [31, 39, 0.3],
  [39, 16, 0.2],
  [47, 31, 0.32],
  [55, 7, 0.2],
  [63, 23, 0.28],
  [72, 13, 0.34],
  [81, 34, 0.2],
  [89, 9, 0.26],
  [95, 25, 0.18],
  [11, 58, 0.18],
  [27, 71, 0.22],
  [44, 61, 0.16],
  [68, 76, 0.2],
  [86, 63, 0.18],
  [94, 86, 0.16],
] as const;

export function AuthBackdrop() {
  return (
    <View accessible={false} pointerEvents="none" style={styles.backdrop}>
      <Svg height="100%" preserveAspectRatio="none" width="100%">
        <Defs>
          <RadialGradient
            id="auth-dusk"
            cx="50%"
            cy="-8%"
            fx="50%"
            fy="-8%"
            rx="92%"
            ry="78%"
          >
            <Stop offset="0" stopColor="#353955" />
            <Stop offset="0.42" stopColor={authColors.backgroundSection} />
            <Stop offset="1" stopColor={authColors.backgroundDeep} />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#auth-dusk)" height="100%" width="100%" />
        {STAR_FIELD.map(([x, y, opacity], index) => (
          <Circle
            key={`${x}-${y}`}
            cx={`${x}%`}
            cy={`${y}%`}
            fill={index % 4 === 0 ? authColors.accent : authColors.text}
            opacity={opacity}
            r={index % 3 === 0 ? 1.2 : 0.8}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
});
