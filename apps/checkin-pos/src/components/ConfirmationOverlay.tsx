import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, spacing, typography, radius } from '@horaires/ui-tokens';

type Props =
  | { kind: 'clock'; type: 'clock_in' | 'clock_out'; name: string; style?: StyleProp<ViewStyle> }
  | { kind: 'error'; message: string; style?: StyleProp<ViewStyle> };

export function ConfirmationOverlay(props: Props) {
  return (
    <View style={[styles.container, props.kind === 'error' ? styles.error : styles.success, props.style]}>
      {props.kind === 'clock' ? (
        <>
          <Text style={styles.title}>{props.type === 'clock_in' ? 'Bienvenue' : 'Au revoir'}</Text>
          <Text style={styles.subtitle}>{props.name}</Text>
        </>
      ) : (
        <Text style={styles.title}>{props.message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  success: { backgroundColor: colors.success },
  error: { backgroundColor: colors.danger },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.surface,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.lg,
    color: colors.surface,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
