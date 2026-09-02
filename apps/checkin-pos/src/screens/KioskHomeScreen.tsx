import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { DeviceTimeEntryResult } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient, useDeviceAuth } from '../services/DeviceAuthService';
import { ConfirmationOverlay } from '../components/ConfirmationOverlay';
import { withPressedFeedback } from '../lib/pressedStyle';

type Props = {
  onNavigatePin: () => void;
  onNavigateEnrollBadge: () => void;
};

type Feedback = { kind: 'clock'; type: 'clock_in' | 'clock_out'; name: string } | { kind: 'error'; message: string };

const FEEDBACK_DURATION_MS = 2500;

// Le QR rotatif du téléphone encode { userId, code } (voir RotatingQrScreen
// côté checkin-mobile) — un badge physique scanné donne juste une chaîne
// brute. Cette distinction décide quel endpoint appeler, sans jamais faire
// confiance à son contenu : userId/code sont revérifiés côté serveur.
function isRotatingQrPayload(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return typeof parsed?.userId === 'string' && typeof parsed?.code === 'string';
  } catch {
    return false;
  }
}

// Écran d'accueil en boucle : scan (badge physique OU QR rotatif du
// téléphone, qr_scan_own_phone) et bouton PIN en secours. Jamais d'état
// "connecté" persistant pour un employé en particulier.
export function KioskHomeScreen({ onNavigatePin, onNavigateEnrollBadge }: Props) {
  const { session } = useDeviceAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const isProcessing = useRef(false);

  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try {
      const result: DeviceTimeEntryResult = isRotatingQrPayload(data)
        ? await apiClient.scanRotatingQr(data)
        : await apiClient.clockInWithBadge(data);
      setFeedback({
        kind: 'clock',
        type: result.type as 'clock_in' | 'clock_out',
        name: `${result.employee.firstName} ${result.employee.lastName}`,
      });
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof ApiError ? err.message : 'Code non reconnu' });
    } finally {
      setTimeout(() => {
        setFeedback(null);
        isProcessing.current = false;
      }, FEEDBACK_DURATION_MS);
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.deviceLabel}>{session?.deviceLabel ?? 'Terminal'}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Scannez votre badge ou le QR de votre téléphone</Text>
          <View style={styles.cameraWrapper}>
            {!permission?.granted ? (
              <Pressable style={withPressedFeedback(styles.button)} onPress={requestPermission}>
                <Text style={styles.buttonText}>Autoriser la caméra</Text>
              </Pressable>
            ) : (
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
                onBarcodeScanned={handleBarcodeScanned}
              />
            )}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable style={withPressedFeedback(styles.pinButton)} onPress={onNavigatePin}>
          <Text style={styles.pinButtonText}>Code PIN</Text>
        </Pressable>
        <Pressable style={withPressedFeedback()} onPress={onNavigateEnrollBadge}>
          <Text style={styles.link}>Enrôler un badge</Text>
        </Pressable>
      </View>

      {feedback ? (
        <View style={styles.overlay}>
          {feedback.kind === 'clock' ? (
            <ConfirmationOverlay kind="clock" type={feedback.type} name={feedback.name} style={styles.fill} />
          ) : (
            <ConfirmationOverlay kind="error" message={feedback.message} style={styles.fill} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.md },
  deviceLabel: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.textPrimary },
  body: { flex: 1, flexDirection: 'row', gap: spacing.lg },
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    ...nativeShadow.md,
  },
  panelTitle: { fontSize: typography.sizes.md, color: colors.textSecondary, textAlign: 'center' },
  cameraWrapper: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: { flex: 1, width: '100%' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonText: { color: colors.surface, fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm },
  pinButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    width: 220,
    alignItems: 'center',
    ...nativeShadow.sm,
  },
  pinButtonText: { color: colors.surface, fontWeight: '700', fontSize: typography.sizes.md },
  link: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  overlay: { ...StyleSheet.absoluteFillObject, padding: spacing.xl },
  fill: { flex: 1 },
});
