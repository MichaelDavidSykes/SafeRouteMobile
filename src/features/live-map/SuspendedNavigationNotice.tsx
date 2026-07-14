import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typeScale } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import {
  createSuspendedNavigationPresentation,
  type SuspendedNavigationStatus,
} from "./suspendedNavigationState";

export function SuspendedNavigationNotice({
  offline,
  onEnd,
  onRetry,
  routeName,
  status,
}: {
  offline: boolean;
  onEnd: () => void;
  onRetry: () => void;
  routeName: string;
  status: SuspendedNavigationStatus;
}) {
  const insets = useSafeAreaInsets();
  const presentation = createSuspendedNavigationPresentation({ offline, status });
  const checking = status === "checking";

  return (
    <View
      accessibilityLabel={`${presentation.title}. ${routeName.trim() || "Active route"}. ${presentation.message}`}
      accessibilityRole="alert"
      style={[styles.notice, { top: insets.top + spacing.xs }]}
      testID={uiTestIds.suspendedNavigationNotice}
    >
      <Text numberOfLines={1} style={styles.eyebrow}>{presentation.title}</Text>
      <Text numberOfLines={1} style={styles.routeName}>{routeName.trim() || "Active route"}</Text>
      <Text numberOfLines={2} style={styles.message}>{presentation.message}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={checking ? "Checking workspace access" : "Retry workspace access"}
          accessibilityRole="button"
          accessibilityState={{ busy: checking, disabled: checking }}
          disabled={checking}
          onPress={onRetry}
          style={({ pressed }) => [
            styles.primaryAction,
            checking ? styles.actionDisabled : null,
            pressed && !checking ? styles.actionPressed : null,
          ]}
          testID={uiTestIds.suspendedNavigationRetry}
        >
          <Text numberOfLines={1} style={styles.primaryActionText}>{presentation.retryLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Clears this saved guidance and unlocks workspace selection."
          accessibilityLabel="End suspended route"
          accessibilityRole="button"
          onPress={onEnd}
          style={({ pressed }) => [styles.secondaryAction, pressed ? styles.actionPressed : null]}
          testID={uiTestIds.suspendedNavigationEnd}
        >
          <Text numberOfLines={1} style={styles.secondaryActionText}>End route</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 110,
    alignSelf: "center",
    maxWidth: 440,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: radius.lg,
    backgroundColor: "rgba(10, 18, 30, 0.94)",
  },
  eyebrow: {
    color: colors.surface,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
  routeName: {
    marginTop: 2,
    color: colors.surface,
    fontSize: typeScale.lg,
    fontWeight: "800",
  },
  message: {
    marginTop: spacing.xs,
    color: colors.controlStrong,
    fontSize: typeScale.sm,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryAction: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  secondaryAction: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.42)",
    borderRadius: radius.pill,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
  secondaryActionText: {
    color: colors.surface,
    fontSize: typeScale.sm,
    fontWeight: "800",
  },
});
