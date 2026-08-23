import { StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const routeDetailSheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  sheetContent: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  modalHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerIconTile: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 15,
    backgroundColor: colors.surface,
  },
  headerCopy: {
    minWidth: 0,
    flex: 1,
  },
  headerMetaRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  title: {
    minWidth: 0,
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 26,
  },
  updatedLabel: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  statusPill: {
    maxWidth: 88,
    minHeight: 26,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  statusReady: {
    backgroundColor: colors.safeSoft,
  },
  statusLive: {
    backgroundColor: colors.appleBlueSoft,
  },
  statusPlanned: {
    backgroundColor: colors.infoSoft,
  },
  statusText: {
    fontSize: typeScale.xs,
    fontWeight: "800",
    textAlign: "center",
  },
  statusTextReady: {
    color: colors.safeText,
  },
  statusTextLive: {
    color: colors.appleBlue,
  },
  statusTextPlanned: {
    color: colors.infoText,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  statusDotReady: {
    backgroundColor: colors.safe,
  },
  statusDotLive: {
    backgroundColor: colors.appleBlue,
  },
  statusDotPlanned: {
    backgroundColor: colors.info,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.controlStrong,
  },
  closeButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  endpointGroup: {
    marginTop: spacing.lg,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  endpointMarker: {
    width: 10,
    height: 10,
    flexShrink: 0,
    borderRadius: radius.pill,
  },
  endpointMarkerOrigin: {
    backgroundColor: colors.safe,
  },
  endpointMarkerDestination: {
    borderRadius: 3,
    backgroundColor: colors.appleBlue,
  },
  endpointCopy: {
    minWidth: 0,
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: "700",
    lineHeight: 20,
  },
  divider: {
    height: 1,
    marginLeft: spacing.md,
    backgroundColor: colors.borderSoft,
  },
  statsRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: spacing.sm,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  stat: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  statDivider: {
    width: 1,
    marginVertical: spacing.sm,
    backgroundColor: colors.borderSoft,
  },
  statLabel: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    textAlign: "center",
  },
  statValue: {
    color: colors.ink,
    fontSize: typeScale.xl,
    fontWeight: "800",
    lineHeight: 26,
    textAlign: "center",
  },
  assignment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  assignmentIconTile: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 11,
    backgroundColor: colors.quiet,
  },
  assignmentCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  assignmentValue: {
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: "700",
    lineHeight: 20,
  },
  doneButton: {
    minHeight: controlSizes.primary,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: 14,
    backgroundColor: colors.appleBlue,
  },
  doneButtonPressed: {
    backgroundColor: colors.appleBluePressed,
    transform: [{ scale: 0.99 }],
  },
  doneButtonText: {
    color: colors.onAccent,
    fontSize: typeScale.md,
    fontWeight: "800",
  },
});
