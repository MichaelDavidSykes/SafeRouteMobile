import {
  Image,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, radius } from "../theme";

// Use the opaque app artwork here rather than the alpha-only logo mask. The
// latter can decode as an empty image in Expo Go on iOS, leaving only the
// black frame visible on the sign-in screen.
const safeRouteLogoMark = require("../../assets/icon.png");

interface SafeRouteLogoProps {
  accessibilityLabel?: string;
  accessible?: boolean;
  imageSize?: number;
  imageStyle?: StyleProp<ImageStyle>;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function SafeRouteLogo({
  accessibilityLabel = "SafeRoute icon",
  accessible = false,
  imageSize,
  imageStyle,
  size = 44,
  style,
}: SafeRouteLogoProps) {
  const resolvedImageSize = imageSize ?? Math.round(size * 0.76);

  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      style={[
        styles.logoFrame,
        {
          borderRadius: Math.max(radius.sm, size / 2),
          height: size,
          width: size,
        },
        style,
      ]}
    >
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        resizeMode="contain"
        source={safeRouteLogoMark}
        style={[
          {
            borderRadius: Math.max(radius.sm, resolvedImageSize / 2),
            height: resolvedImageSize,
            width: resolvedImageSize,
          },
          imageStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
});
