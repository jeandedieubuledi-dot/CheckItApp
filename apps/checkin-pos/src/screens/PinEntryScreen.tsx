import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { DeviceTimeEntryResult } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient } from '../services/DeviceAuthService';
import { PinPad } from '../components/PinPad';
import { ConfirmationOverlay } from '../components/ConfirmationOverlay';
import { withPressedFeedback } from '../lib/pressedStyle';

type Props = { onDone: () => void };
type Feedback = { kind: 'clock'; type: 'clock_in' | 'clock_out'; name: string } | { kind: 'error'; message: string };

const MIN_PIN_LENGTH = 4;
const RETURN_DELAY_MS = 2200;

export function PinEntryScreen({ onDone }: Props) {
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result: DeviceTimeEntryResult = await apiClient.clockInWithPin(pin);
      setFeedback({
        kind: 'clock',
        type: result.type as 'clock_in' | 'clock_out',
        name: `${result.employee.firstName} ${result.employee.lastName}`,
      });
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof ApiError ? err.message : 'PIN invalide' });
      setPin('');
    } finally {
      setIsSubmitting(false);
      setTimeout(onDone, RETURN_DELAY_MS);
    }
  };

  if (feedback) {
    return (
      <View style={styles.container}>
        {feedback.kind === 'clock' ? (
          <ConfirmationOverlay kind="clock" type={feedback.type} name={feedback.name} style={styles.fill} />
        ) : (
          <ConfirmationOverlay kind="error" message={feedback.message} style={styles.fill} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={withPressedFeedback(styles.back)} onPress={onDone}>
        <Text style={styles.link}>Annuler</Text>
      </Pressable>

      <Text style={styles.title}>Entrez votre code PIN</Text>

      <PinPad value={pin} onChange={setPin} disabled={isSubmitting} />

      <Pressable
        style={withPressedFeedback(
          styles.submit,
          (pin.length < MIN_PIN_LENGTH || isSubmitting) && styles.submitDisabled,
        )}
        disabled={pin.length < MIN_PIN_LENGTH || isSubmitting}
        onPress={handleSubmit}
      >
        <Text style={styles.submitText}>Valider</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  fill: { flex: 1 },
  back: { alignSelf: 'flex-start' },
  link: { color: colors.primary, fontSize: typography.sizes.md },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    width: 280,
    alignSelf: 'center',
    ...nativeShadow.sm,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: colors.surface, fontWeight: '600', fontSize: typography.sizes.md },
});
