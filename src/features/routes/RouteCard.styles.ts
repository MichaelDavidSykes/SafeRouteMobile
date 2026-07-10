import { StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardPressed: {
    borderColor: colors.glassBorder,
    backgroundColor: colors.appleBlueSoft,
    transform: [{ scale: 0.985 }],
  },
  cardLoading: {
    opacity: 0.72,
  },
  cardCopy: {
    minWidth: 0,
  },
  routeTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  statusPill: {
    marginTop: 1,
    maxWidth: 76,
    minHeight: 22,
    flexShrink: 0,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  statusReady: {
    backgroundColor: colors.safeSoft,
  },
  statusLive: {
    backgroundColor: colors.dangerSoft,
  },
  statusPlanned: {
    backgroundColor: colors.infoSoft,
  },
  statusText: {
    maxWidth: 68,
    fontSize: typeScale.xs,
    fontWeight: "800",
    textAlign: "center",
  },
  statusTextReady: {
    color: colors.safeText,
  },
  statusTextLive: {
    color: colors.dangerText,
  },
  statusTextPlanned: {
    color: colors.infoText,
  },
  routeName: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "800",
    lineHeight: 21,
  },
  routeEndpoint: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
  },
  routeSummary: {
    marginTop: spacing.xs,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  openButton: {
    maxWidth: 96,
    minWidth: 56,
    minHeight: controlSizes.compact,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlueSoft,
  },
  openButtonText: {
    maxWidth: 72,
    flexShrink: 1,
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "800",
    textAlign: "center",
  },
});
