import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Site, TimeEntry, TimeEntryType } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';
import { SitePicker } from '../components/SitePicker';
import { ConfirmationBanner } from '../components/ConfirmationBanner';
import { withPressedFeedback } from '../lib/pressedStyle';

const ACTIONS: { type: TimeEntryType; label: string }[] = [
  { type: 'clock_in', label: 'Arrivée' },
  { type: 'break_start', label: 'Début pause' },
  { type: 'break_end', label: 'Fin pause' },
  { type: 'clock_out', label: 'Départ' },
];

const TYPE_LABELS: Record<TimeEntryType, string> = {
  clock_in: 'Arrivée',
  clock_out: 'Départ',
  break_start: 'Début de pause',
  break_end: 'Fin de pause',
};

export function ClockInScreen() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [lastEntry, setLastEntry] = useState<TimeEntry | null>(null);
  const [selectedType, setSelectedType] = useState<TimeEntryType | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const loadData = useCallback(async () => {
    try {
      const [siteList, entries] = await Promise.all([
        apiClient.getSites(),
        apiClient.getMyTimeEntries(),
      ]);
      setSites(siteList);
      setSelectedSiteId((current) => current ?? siteList[0]?.id ?? null);
      setLastEntry(entries[0] ?? null);
    } catch {
      // Silencieux — l'écran reste utilisable, juste sans statut affiché.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const submit = async (via: 'gps' | 'qr', deviceId?: string) => {
    if (!selectedType) return;
    setIsSubmitting(true);
    setBanner(null);
    try {
      let entry: TimeEntry;
      if (via === 'qr' && deviceId) {
        entry = await apiClient.clockInWithQrScan(deviceId, selectedType);
      } else {
        if (!selectedSiteId) throw new Error('Sélectionnez un site');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Autorisation de localisation refusée');
        }
        const position = await Location.getCurrentPositionAsync({});
        entry = await apiClient.clockInWithGps(
          selectedSiteId,
          selectedType,
          position.coords.latitude,
          position.coords.longitude,
        );
      }
      setBanner({ kind: 'success', message: `${TYPE_LABELS[entry.type]} enregistrée` });
      setLastEntry(entry);
      setSelectedType(null);
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec du pointage' });
    } finally {
      setIsSubmitting(false);
      setIsScanning(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (isSubmitting) return;
    try {
      const parsed = JSON.parse(data);
      if (!parsed.deviceId) throw new Error();
      void submit('qr', parsed.deviceId);
    } catch {
      setBanner({ kind: 'error', message: 'QR non reconnu' });
      setIsScanning(false);
    }
  };

  if (isScanning) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Scannez le QR du terminal</Text>
        <View style={styles.cameraWrapper}>
          {!permission?.granted ? (
            <Pressable style={withPressedFeedback(styles.button)} onPress={requestPermission}>
              <Text style={styles.buttonText}>Autoriser la caméra</Text>
            </Pressable>
          ) : (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
          )}
        </View>
        <Pressable onPress={() => setIsScanning(false)}>
          <Text style={styles.link}>Annuler</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pointage</Text>

      {lastEntry ? (
        <Text style={styles.status}>
          Dernier pointage : {TYPE_LABELS[lastEntry.type]} à{' '}
          {new Date(lastEntry.timestamp).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      ) : null}

      {banner ? <ConfirmationBanner kind={banner.kind} message={banner.message} /> : null}

      <SitePicker sites={sites} selectedSiteId={selectedSiteId} onSelect={setSelectedSiteId} />

      <View style={styles.actions}>
        {ACTIONS.map((action) => (
          <Pressable
            key={action.type}
            style={withPressedFeedback(
              styles.actionButton,
              selectedType === action.type && styles.actionButtonSelected,
            )}
            onPress={() => setSelectedType(action.type)}
          >
            <Text
              style={[styles.actionText, selectedType === action.type && styles.actionTextSelected]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {selectedType ? (
        <View style={styles.methods}>
          <Pressable
            style={withPressedFeedback(styles.button, isSubmitting && styles.buttonDisabled)}
            disabled={isSubmitting}
            onPress={() => submit('gps')}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonText}>Confirmer via GPS</Text>
            )}
          </Pressable>
          <Pressable style={withPressedFeedback(styles.secondaryButton)} onPress={() => setIsScanning(true)}>
            <Text style={styles.secondaryButtonText}>Scanner le QR du terminal</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  status: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  actionButton: {
    flexBasis: '47%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  actionButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { color: colors.textPrimary, fontWeight: '600' },
  actionTextSelected: { color: colors.surface },
  methods: { gap: spacing.sm },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...nativeShadow.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.surface, fontWeight: '600', fontSize: typography.sizes.md },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: { color: colors.primary, fontWeight: '600' },
  cameraWrapper: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: spacing.md,
  },
  camera: { flex: 1, width: '100%' },
  link: { color: colors.primary, textAlign: 'center', fontSize: typography.sizes.sm },
});
