import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typeScale } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";

export function OfflineCalendarCleanupNotice({
  checking,
  onRetry,
}: {
  checking: boolean;
  onRetry: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const message = checking
    ? "Protecting saved offline data before review can continue."
    : "SafeRoute could not finish protecting saved offline data. Retry before offline review can continue.";

  return (
    <View
      style={[
        styles.notice,
        {
          bottom: insets.bottom + spacing.xs,
          maxHeight: Math.max(
            168,
            Math.min(320, height * 0.42),
          ),
        },
      ]}
      testID={uiTestIds.offlineCalendarCleanupNotice}
    >
      <View
        accessible
        accessibilityLabel={`Offline data unavailable. ${message}`}
        accessibilityRole="alert"
        style={styles.alertContent}
        testID={uiTestIds.offlineCalendarCleanupAlert}
      >
        <Text style={styles.title}>Offline data unavailable</Text>
        <ScrollView
          contentContainerStyle={styles.messageContent}
          style={styles.messageScroll}
        >
          <Text style={styles.message}>{message}</Text>
        </ScrollView>
      </View>
      <Pressable
        accessibilityLabel={
          checking
            ? "Protecting saved offline data"
            : "Retry offline data cleanup"
        }
        accessibilityRole="button"
        accessibilityState={{ busy: checking, disabled: checking }}
        disabled={checking}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.action,
          checking ? styles.actionDisabled : null,
          pressed && !checking ? styles.actionPressed : null,
        ]}
        testID={uiTestIds.offlineCalendarCleanupRetry}
      >
        <Text style={styles.actionText}>
          {checking ? "Securing…" : "Retry"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 121,
    alignSelf: "center",
    maxWidth: 440,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: radius.lg,
    backgroundColor: "rgba(10, 18, 30, 0.96)",
  },
  title: {
    color: colors.onAccent,
    fontSize: typeScale.lg,
    fontWeight: "900",
  },
  message: {
    color: colors.controlStrong,
    fontSize: typeScale.sm,
    lineHeight: 18,
  },
  messageContent: {
    paddingTop: spacing.xs,
  },
  messageScroll: {
    flexShrink: 1,
  },
  action: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  actionText: {
    color: colors.onAccent,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
  alertContent: {
    flexShrink: 1,
  },
});
