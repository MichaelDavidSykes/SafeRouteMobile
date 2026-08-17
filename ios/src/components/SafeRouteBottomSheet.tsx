import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  type BottomSheetProps,
} from '@gorhom/bottom-sheet';
import {
  forwardRef,
  useCallback,
  type ComponentRef,
} from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { colors, radius } from '../theme';

export type SafeRouteBottomSheetRef = ComponentRef<typeof BottomSheet>;

type SafeRouteBottomSheetProps = Omit<
  BottomSheetProps,
  | 'backdropComponent'
  | 'backgroundComponent'
  | 'backgroundStyle'
  | 'enableDynamicSizing'
  | 'enableOverDrag'
  | 'handleIndicatorStyle'
  | 'keyboardBehavior'
  | 'keyboardBlurBehavior'
> & {
  backdrop?: boolean;
  dismissOnBackdropPress?: boolean;
  surfaceColor?: ColorValue;
};

export const SafeRouteBottomSheet = forwardRef<
  SafeRouteBottomSheetRef,
  SafeRouteBottomSheetProps
>(function SafeRouteBottomSheet(
  {
    accessible = false,
    backdrop = false,
    dismissOnBackdropPress = false,
    children,
    style,
    surfaceColor = colors.surface,
    ...props
  },
  ref,
) {
  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        accessible={false}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.18}
        pressBehavior={dismissOnBackdropPress ? 'close' : 'none'}
      />
    ),
    [dismissOnBackdropPress],
  );

  return (
    <BottomSheet
      ref={ref}
      {...props}
      accessible={accessible}
      backdropComponent={backdrop ? renderBackdrop : undefined}
      backgroundComponent={SafeRouteBottomSheetBackground}
      backgroundStyle={[styles.background, { backgroundColor: surfaceColor }]}
      enableBlurKeyboardOnGesture
      enableDynamicSizing={false}
      enableOverDrag={false}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      style={[styles.sheet, style]}
    >
      {children}
    </BottomSheet>
  );
});

function SafeRouteBottomSheetBackground({
  pointerEvents,
  style,
}: BottomSheetBackgroundProps) {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents={pointerEvents}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 18,
  },
  background: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    backgroundColor: colors.mutedSoft,
    height: 5,
    width: 38,
  },
});
