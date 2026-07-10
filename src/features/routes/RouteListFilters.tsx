import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { colors } from "../../theme";
import { routeListStyles as styles } from "./RouteListScreen.styles";
import {
  ROUTE_LIST_QUERY_INPUT_MAX_LENGTH,
  type RouteListClientFilterOption,
  type RouteListSummaryState,
} from "./routeListUiState";

const ROUTE_FILTER_HIT_SLOP = 6;

interface RouteListFiltersProps {
  clientFilterOptions: RouteListClientFilterOption[];
  query: string;
  routeSummary: RouteListSummaryState;
  showSummary: boolean;
  showClientFilters: boolean;
  showSearch: boolean;
  onChangeQuery: (query: string) => void;
  onSelectClient: (clientId: string | null) => void;
}

export function RouteListFilters({
  clientFilterOptions,
  onChangeQuery,
  onSelectClient,
  query,
  showClientFilters,
  showSearch,
  routeSummary,
  showSummary,
}: RouteListFiltersProps) {
  return (
    <>
      {showClientFilters ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.clientTabs}
        >
          {clientFilterOptions.map((option) => (
            <ClientTab
              key={option.id || "all-clients"}
              accessibilityHint={option.accessibilityHint}
              accessibilityLabel={option.accessibilityLabel}
              label={option.label}
              active={option.selected}
              onPress={() => onSelectClient(option.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {showSearch ? (
        <View style={styles.searchBox}>
          <TextInput
            accessibilityLabel="Search saved routes"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            maxLength={ROUTE_LIST_QUERY_INPUT_MAX_LENGTH}
            placeholder="Find route"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
            onChangeText={onChangeQuery}
          />
        </View>
      ) : null}

      {showSummary ? (
        <View style={styles.listSummaryRow}>
          <Text
            accessibilityLabel={routeSummary.accessibilityLabel}
            numberOfLines={1}
            style={styles.listSummaryText}
          >
            {routeSummary.text}
          </Text>
          {routeSummary.clearSearchLabel ? (
            <Pressable
              accessibilityLabel={
                routeSummary.clearSearchAccessibilityLabel ||
                "Clear saved route search"
              }
              accessibilityRole="button"
              hitSlop={ROUTE_FILTER_HIT_SLOP}
              style={({ pressed }) => [
                styles.clearSearchButton,
                pressed ? styles.clearSearchButtonPressed : null,
              ]}
              onPress={() => onChangeQuery("")}
            >
              <Text numberOfLines={1} style={styles.clearSearchText}>
                {routeSummary.clearSearchLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function ClientTab({
  accessibilityHint,
  accessibilityLabel,
  active,
  label,
  onPress,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={ROUTE_FILTER_HIT_SLOP}
      style={({ pressed }) => [
        styles.clientTab,
        active ? styles.clientTabActive : null,
        pressed ? styles.clientTabPressed : null,
      ]}
      onPress={onPress}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.clientTabText,
          active ? styles.clientTabTextActive : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
