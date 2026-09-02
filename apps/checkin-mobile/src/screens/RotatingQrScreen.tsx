import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import { ApiError } from '@horaires/api-client';
import { apiClient } from '../services/AuthService';

// Refresh avant l'expiration (le code est valide 30s côté serveur) pour
// qu'un scan tombant juste après un renouvellement ne trouve jamais un QR
// déjà expiré à l'écran.
const REFRESH_INTERVAL_MS = 25_000;

type Props = { onClose: () => void };

// Modèle "Basic-Fit" : ce QR change automatiquement toutes les 30s (TOTP,
// RFC 6238) — c'est la tablette du site qui le scanne pour pointer, jamais
// l'inverse. Voir CLAUDE.md, correction d'architecture flux QR inversé.
export function RotatingQrScreen({ onClose }: Props) {
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { payload: nextPayload } = await apiClient.getMyRotatingQr();
      setPayload(nextPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de générer le QR');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Capture d'écran interdite sur ce QR précis : une photo/capture le
    // rendrait rejouable jusqu'à expiration (30s), ce qu'on veut éviter.
    void ScreenCapture.preventScreenCaptureAsync();
    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);

  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mon QR de pointage</Text>
      <Text style={styles.subtitle}>Présentez ce code à la tablette du site</Text>

      <View style={styles.qrWrapper}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : payload ? (
          <QRCode value={payload} size={220} />
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>Le code se renouvelle automatiquement</Text>

      <Pressable style={styles.button} onPress={onClose}>
        <Text style={styles.buttonText}>Fermer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.textPrimary },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  qrWrapper: {
    width: 260,
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...nativeShadow.md,
  },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
  hint: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.md },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...nativeShadow.sm,
  },
  buttonText: { color: colors.surface, fontWeight: '600', fontSize: typography.sizes.md },
});
