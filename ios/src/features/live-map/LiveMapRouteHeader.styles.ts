import { Platform, StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  topStack: {
    marginHorizontal: 12,
    marginTop: Platform.OS === "android" ? spacing.lg : spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backButton: {
    width: controlSizes.icon,
    height: controlSizes.icon,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  backButtonPressed: {
    backgroundColor: colors.control,
    transform: [{ scale: 0.96 }],
  },
  backButtonGlyph: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 28,
    textAlign: "center",
  },
  permissionNotice: {
    minHeight: controlSizes.compact,
    maxWidth: 190,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.amberSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  permissionNoticeCompactNavigation: {
    maxWidth: 160,
  },
  permissionText: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.amberText,
    fontSize: typeScale.xs,
    fontWeight: "700",
  },
});
