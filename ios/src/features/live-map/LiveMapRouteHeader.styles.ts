import { Platform, StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  topStack: {
    gap: spacing.sm,
  },
  headerPanel: {
    marginHorizontal: spacing.md,
    marginTop: Platform.OS === "android" ? spacing.lg : spacing.sm,
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceGlass,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  headerPanelCompactNavigation: {
    alignSelf: "flex-start",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  headerPanelMinimalActiveNavigation: {
    alignSelf: "flex-start",
  },
  activeBackButton: {
    minWidth: 64,
    height: controlSizes.secondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass,
  },
  activeBackButtonText: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  routeListButton: {
    minHeight: controlSizes.secondary,
    maxWidth: 132,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.sm,
    borderWidth: 0,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  routeListButtonPressed: {
    backgroundColor: colors.appleBlueSoft,
  },
  routeListButtonText: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
    textAlign: "center",
  },
  routeTitle: {
    marginTop: spacing.sm,
    color: colors.ink,
    fontSize: typeScale.xl,
    fontWeight: "800",
  },
  statusPill: {
    minHeight: 30,
    maxWidth: 136,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  statusPillLive: {
    backgroundColor: colors.appleBlueSoft,
  },
  statusPillDemo: {
    backgroundColor: colors.amberSoft,
  },
  statusPillDanger: {
    backgroundColor: colors.dangerSoft,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  statusDotLive: {
    backgroundColor: colors.appleBlue,
  },
  statusDotDemo: {
    backgroundColor: colors.amber,
  },
  statusDotDanger: {
    backgroundColor: colors.danger,
  },
  statusText: {
    maxWidth: "100%",
    minWidth: 0,
    flexShrink: 1,
    fontSize: typeScale.xs,
    fontWeight: "800",
    textAlign: "center",
  },
  statusTextLive: {
    color: colors.appleBlue,
  },
  statusTextDemo: {
    color: colors.amberText,
  },
  statusTextDanger: {
    color: colors.dangerText,
  },
  routeEndpointLine: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceGlass,
  },
  routeEndpointLineExpanded: {
    minHeight: 38,
    marginTop: spacing.md,
  },
  routeEndpointText: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: typeScale.xs,
    fontWeight: "700",
  },
  permissionNotice: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.amberSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.amberSoft,
  },
  permissionNoticeCompactNavigation: {
    marginTop: spacing.xs,
    maxWidth: 180,
  },
  permissionText: {
    color: colors.amberText,
    fontSize: typeScale.sm,
    fontWeight: "600",
  }
});
