import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typeScale } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";

export function ResumeNavigationButton({
  onPress,
  routeName,
}: {
  onPress: () => void;
  routeName: string;
}) {
  const insets = useSafeAreaInsets();
  const normalizedRouteName = routeName.trim() || "active route";

  return (
    <Pressable
      accessibilityHint="Returns to active SafeRoute guidance."
      accessibilityLabel={`Resume route. ${normalizedRouteName}.`}
      accessibilityRole="button"
      testID={uiTestIds.liveMapResumeAction}
      style={({ pressed }) => [
        styles.button,
        { top: insets.top + spacing.xs },
        pressed ? styles.buttonPressed : null,
      ]}
      onPress={onPress}
    >
      <Text numberOfLines={1} style={styles.text}>
        Resume route
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 100,
    minHeight: 42,
    maxWidth: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: radius.pill,
    backgroundColor: "rgba(10, 18, 30, 0.92)",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  buttonPressed: {
    backgroundColor: colors.appleBlue,
    transform: [{ scale: 0.98 }],
  },
  text: {
    maxWidth: "100%",
    color: colors.surface,
    fontSize: typeScale.sm,
    fontWeight: "900",
    textAlign: "center",
  },
});
