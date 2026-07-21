import { Pressable, Text, View } from "react-native";

import { createSessionNoticeState } from "../auth/sessionNoticeState";
import { uiTestIds } from "../../testing/uiTestIds";
import { routeListStyles as styles } from "./RouteListScreen.styles";
import {
  createRouteListHeaderCopy,
  createRouteListSignOutState,
} from "./routeListUiState";

const ROUTE_LIST_HEADER_ACTION_HIT_SLOP = 6;

interface RouteListHeaderProps {
  sessionNotice?: string;
  userEmail: string;
  onBackToMap: () => void;
  onSignOut: () => void;
}

export function RouteListHeader({
  onSignOut,
  sessionNotice,
  userEmail,
}: RouteListHeaderProps) {
  const headerCopy = createRouteListHeaderCopy();
  const sessionNoticeState = createSessionNoticeState(sessionNotice);
  const signOutState = createRouteListSignOutState(userEmail);

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.title}>
              {headerCopy.title}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityHint={signOutState.signOutAccessibilityHint}
              accessibilityLabel={signOutState.signOutAccessibilityLabel}
              accessibilityRole="button"
              hitSlop={ROUTE_LIST_HEADER_ACTION_HIT_SLOP}
              testID={uiTestIds.routeListSignOut}
              style={({ pressed }) => [
                styles.signOutButton,
                pressed ? styles.signOutButtonPressed : null,
              ]}
              onPress={onSignOut}
            >
              <Text numberOfLines={1} style={styles.signOutButtonText}>
                {signOutState.label}
              </Text>
            </Pressable>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.subtitle}>
          {headerCopy.subtitle}
        </Text>
      </View>

      {sessionNoticeState ? (
        <View accessibilityRole={sessionNoticeState.accessibilityRole} style={styles.noticeBox}>
          <Text
            accessibilityLabel={sessionNoticeState.accessibilityLabel || undefined}
            numberOfLines={2}
            style={styles.noticeText}
          >
            {sessionNoticeState.message}
          </Text>
        </View>
      ) : null}
    </>
  );
}
