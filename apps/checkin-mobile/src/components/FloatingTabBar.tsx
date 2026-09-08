import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, spacing, radius, nativeShadow } from '@horaires/ui-tokens';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  ClockIn: 'qr-code-outline',
  Planning: 'calendar-outline',
  ShiftMarketplace: 'swap-horizontal-outline',
  Availabilities: 'checkmark-circle-outline',
  PresenceLive: 'people-outline',
  ShiftApproval: 'shield-checkmark-outline',
};

const TAB_LABELS: Record<string, string> = {
  ClockIn: 'Pointer',
  Planning: 'Planning',
  ShiftMarketplace: 'Shifts',
  Availabilities: 'Dispos',
  PresenceLive: 'Présence',
  ShiftApproval: 'Échanges',
};

// Barre de nav flottante, avec le bouton "Pointer" mis en avant au centre
// (élément le plus visible de l'app — voir CLAUDE.md / brief design). Gère
// un nombre variable d'onglets (staff: 4 · manager: +Présence +Échanges)
// en réservant toujours un emplacement central pour le FAB, quel que soit
// le nombre d'onglets secondaires.
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const fabIndex = state.routes.findIndex((r) => r.name === 'ClockIn');
  const sideRoutes = state.routes.filter((r) => r.name !== 'ClockIn');
  const mid = Math.ceil(sideRoutes.length / 2);
  const left = sideRoutes.slice(0, mid);
  const right = sideRoutes.slice(mid);

  const renderItem = (route: (typeof state.routes)[number]) => {
    const index = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === index;
    const options = descriptors[route.key].options;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable key={route.key} onPress={onPress} style={styles.item} accessibilityRole="button" accessibilityState={isFocused ? { selected: true } : {}} accessibilityLabel={options.title ?? route.name}>
        <Ionicons name={TAB_ICONS[route.name] ?? 'ellipse-outline'} size={21} color={isFocused ? colors.primary : colors.textSecondary} />
        <Text style={[styles.label, isFocused && styles.labelActive]}>{TAB_LABELS[route.name] ?? route.name}</Text>
      </Pressable>
    );
  };

  const fabRoute = fabIndex >= 0 ? state.routes[fabIndex] : null;

  return (
    <View style={styles.bar}>
      {left.map(renderItem)}
      <View style={styles.spacer} />
      {right.map(renderItem)}

      {fabRoute ? (
        <Pressable
          onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: fabRoute.key, canPreventDefault: true });
            if (state.index !== fabIndex && !event.defaultPrevented) {
              navigation.navigate(fabRoute.name);
            }
          }}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Pointer"
        >
          <Ionicons name="qr-code-outline" size={26} color={colors.surface} />
        </Pressable>
      ) : null}
      <Text style={styles.fabLabel}>Pointer</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    height: 66,
    backgroundColor: colors.surface,
    borderRadius: radius.xl + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xs,
    ...nativeShadow.lg,
  },
  item: { alignItems: 'center', gap: 4, width: 58 },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary },
  labelActive: { color: colors.primary },
  spacer: { width: 58 },
  fab: {
    position: 'absolute',
    left: '50%',
    top: -22,
    marginLeft: -31,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...nativeShadow.lg,
  },
  fabLabel: {
    position: 'absolute',
    top: 44,
    left: '50%',
    marginLeft: -29,
    width: 58,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primary,
  },
});
