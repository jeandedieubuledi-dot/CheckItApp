import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Availability } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';
import { ConfirmationBanner } from '../components/ConfirmationBanner';
import { withPressedFeedback } from '../lib/pressedStyle';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function AvailabilitiesScreen() {
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    const list = await apiClient.getAvailabilities();
    setAvailabilities(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setIsRefreshing(true);
    await load().catch(() => {});
    setIsRefreshing(false);
  };

  const submit = async () => {
    setBanner(null);
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      setBanner({ kind: 'error', message: 'Heures au format HH:mm' });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.createAvailability({ dayOfWeek, startTime, endTime });
      setBanner({ kind: 'success', message: 'Disponibilité enregistrée' });
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de l\'enregistrement' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mes disponibilités</Text>

      {banner ? <ConfirmationBanner kind={banner.kind} message={banner.message} /> : null}

      <View style={styles.form}>
        <View style={styles.dayRow}>
          {DAYS.map((label, index) => (
            <Pressable
              key={label}
              style={withPressedFeedback(styles.dayChip, dayOfWeek === index && styles.dayChipSelected)}
              onPress={() => setDayOfWeek(index)}
            >
              <Text style={[styles.dayText, dayOfWeek === index && styles.dayTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.timeRow}>
          <TextInput
            style={styles.timeInput}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="09:00"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={styles.arrow}>→</Text>
          <TextInput
            style={styles.timeInput}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="17:00"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
        <Pressable style={withPressedFeedback(styles.button)} disabled={isSubmitting} onPress={submit}>
          <Text style={styles.buttonText}>Ajouter</Text>
        </Pressable>
      </View>

      <FlatList
        data={availabilities}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucune disponibilité déclarée.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {item.specificDate
                ? new Date(item.specificDate).toLocaleDateString('fr-BE')
                : DAYS[item.dayOfWeek ?? 0]}
            </Text>
            <Text style={styles.cardTime}>
              {item.startTime} → {item.endTime} {item.isAvailable ? '' : '(indisponible)'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...nativeShadow.sm,
  },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  dayChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dayChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.textPrimary, fontSize: typography.sizes.sm },
  dayTextSelected: { color: colors.surface, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  arrow: { color: colors.textSecondary },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  buttonText: { color: colors.surface, fontWeight: '600' },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...nativeShadow.sm,
  },
  cardTitle: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.textPrimary },
  cardTime: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },
});
