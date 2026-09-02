import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import { ApiError } from '@horaires/api-client';
import { apiClient } from '../services/DeviceAuthService';
import { PinPad } from '../components/PinPad';
import { ConfirmationOverlay } from '../components/ConfirmationOverlay';
import { withPressedFeedback } from '../lib/pressedStyle';

type Props = { onDone: () => void };
type Step = 'pin' | 'scan' | 'result';
type Feedback = { kind: 'success'; name: string } | { kind: 'error'; message: string };

const MIN_PIN_LENGTH = 4;
const RETURN_DELAY_MS = 2500;

// §2.8 cahier des charges — un employé identifié par son PIN lie un nouveau
// badge physique à son compte, directement au kiosk, sans passer par le
// panel manager (utile en libre-service quand un badge est perdu/cassé).
export function BadgeEnrollmentScreen({ onDone }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('pin');
  const [pin, setPin] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleScan = async ({ data }: { data: string }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const user = await apiClient.enrollBadge(pin, data);
      setFeedback({ kind: 'success', name: `${user.firstName} ${user.lastName}` });
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: err instanceof ApiError ? err.message : "Échec de l'enrôlement",
      });
    } finally {
      setStep('result');
      setTimeout(onDone, RETURN_DELAY_MS);
    }
  };

  if (step === 'result' && feedback) {
    return (
      <View style={styles.container}>
        {feedback.kind === 'success' ? (
          <ConfirmationOverlay kind="clock" type="clock_in" name={`Badge enregistré — ${feedback.name}`} style={styles.fill} />
        ) : (
          <ConfirmationOverlay kind="error" message={feedback.message} style={styles.fill} />
        )}
      </View>
    );
  }

  if (step === 'scan') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Scannez le nouveau badge</Text>
        <View style={styles.cameraWrapper}>
          {!permission?.granted ? (
            <Pressable style={withPressedFeedback(styles.submit)} onPress={requestPermission}>
              <Text style={styles.submitText}>Autoriser la caméra</Text>
            </Pressable>
          ) : (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
              onBarcodeScanned={handleScan}
            />
          )}
        </View>
        <Pressable style={withPressedFeedback()} onPress={onDone}>
          <Text style={styles.link}>Annuler</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={withPressedFeedback(styles.back)} onPress={onDone}>
        <Text style={styles.link}>Annuler</Text>
      </Pressable>

      <Text style={styles.title}>Confirmez votre PIN pour enrôler un badge</Text>

      <PinPad value={pin} onChange={setPin} />

      <Pressable
        style={withPressedFeedback(styles.submit, pin.length < MIN_PIN_LENGTH && styles.submitDisabled)}
        disabled={pin.length < MIN_PIN_LENGTH}
        onPress={() => setStep('scan')}
      >
        <Text style={styles.submitText}>Continuer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  fill: { flex: 1 },
  back: { alignSelf: 'flex-start' },
  link: { color: colors.primary, fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.md },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  cameraWrapper: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: { flex: 1, width: '100%' },
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
