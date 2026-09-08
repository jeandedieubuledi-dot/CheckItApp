import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, nativeShadow } from '@horaires/ui-tokens';
import type { Availability } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { ConfirmationBanner } from '../components/ConfirmationBanner';
import { fonts } from '../theme';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

function currentWeekRangeLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getDate()} au ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

// Un créneau récurrent par jour de semaine — l'écran affiche les 7 jours,
// pas seulement les disponibilités déjà déclarées, pour qu'ajuster un
// créneau existant ou en créer un se fasse au même endroit en un tap.
// Les disponibilités ponctuelles (specificDate) ne sont pas gérées ici.
export function AvailabilitiesScreen() {
  const { user } = useAuth();
  const weekRangeLabel = useMemo(() => currentWeekRangeLabel(), []);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [draftStart, setDraftStart] = useState(DEFAULT_START);
  const [draftEnd, setDraftEnd] = useState(DEFAULT_END);
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

  const recordForDay = useMemo(() => {
    const map = new Map<number, Availability>();
    for (const a of availabilities) {
      if (a.dayOfWeek !== undefined && a.dayOfWeek !== null && !a.specificDate) {
        map.set(a.dayOfWeek, a);
      }
    }
    return map;
  }, [availabilities]);

  const toggleDay = async (day: number) => {
    const record = recordForDay.get(day);
    setBusyDay(day);
    setBanner(null);
    try {
      if (record) {
        await apiClient.updateAvailability(record.id, { isAvailable: !record.isAvailable });
      } else {
        await apiClient.createAvailability({ dayOfWeek: day, startTime: DEFAULT_START, endTime: DEFAULT_END });
      }
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la mise à jour' });
    } finally {
      setBusyDay(null);
    }
  };

  const startEditing = (day: number) => {
    const record = recordForDay.get(day);
    setDraftStart(record?.startTime ?? DEFAULT_START);
    setDraftEnd(record?.endTime ?? DEFAULT_END);
    setEditingDay(day);
  };

  const saveEditing = async () => {
    if (editingDay === null) return;
    setBanner(null);
    if (!TIME_PATTERN.test(draftStart) || !TIME_PATTERN.test(draftEnd)) {
      setBanner({ kind: 'error', message: 'Heures au format HH:mm' });
      return;
    }
    const record = recordForDay.get(editingDay);
    setBusyDay(editingDay);
    try {
      if (record) {
        await apiClient.updateAvailability(record.id, { startTime: draftStart, endTime: draftEnd });
      } else {
        await apiClient.createAvailability({ dayOfWeek: editingDay, startTime: draftStart, endTime: draftEnd });
      }
      setEditingDay(null);
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : "Échec de l'enregistrement" });
    } finally {
      setBusyDay(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Disponibilités</Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.subtitle}>Semaine du {weekRangeLabel}</Text>

      {banner ? <ConfirmationBanner kind={banner.kind} message={banner.message} /> : null}

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {DAYS.map((label, day) => {
          const record = recordForDay.get(day);
          const available = record?.isAvailable ?? false;
          const busy = busyDay === day;
          const editing = editingDay === day;

          return (
            <View key={label} style={[styles.dayCard, editing && styles.dayCardEditing, !available && styles.dayCardOff]}>
              <View style={styles.dayRow}>
                <View>
                  <Text style={styles.dayName}>{label}</Text>
                  <Pressable
                    style={styles.toggle}
                    disabled={busy}
                    onPress={() => toggleDay(day)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: available }}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.textSecondary} />
                    ) : (
                      <View style={[styles.toggleTrack, available && styles.toggleTrackOn]}>
                        <View style={[styles.toggleKnob, available && styles.toggleKnobOn]} />
                      </View>
                    )}
                  </Pressable>
                </View>

                {available ? (
                  <Pressable onPress={() => startEditing(day)} style={styles.timePills}>
                    <View style={styles.timePill}>
                      <Text style={styles.timePillText}>{record?.startTime}</Text>
                    </View>
                    <Text style={styles.timeSep}>–</Text>
                    <View style={styles.timePill}>
                      <Text style={styles.timePillText}>{record?.endTime}</Text>
                    </View>
                    <Ionicons name="pencil" size={13} color={colors.textSecondary} />
                  </Pressable>
                ) : (
                  <Text style={styles.offLabel}>Indisponible</Text>
                )}
              </View>

              {editing ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.timeInput}
                    value={draftStart}
                    onChangeText={setDraftStart}
                    placeholder={DEFAULT_START}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.timeSep}>–</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={draftEnd}
                    onChangeText={setDraftEnd}
                    placeholder={DEFAULT_END}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Pressable style={styles.rowSaveBtn} onPress={saveEditing}>
                    <Ionicons name="checkmark" size={16} color={colors.surface} />
                  </Pressable>
                  <Pressable style={styles.rowCancelBtn} onPress={() => setEditingDay(null)}>
                    <Ionicons name="close" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.saveBar}>
        <Pressable
          style={styles.saveBtn}
          onPress={() => {
            setEditingDay(null);
            setBanner({ kind: 'success', message: 'Disponibilités à jour' });
          }}
        >
          <Text style={styles.saveBtnText}>Enregistrer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.primary },
  subtitle: { fontSize: 13.5, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },

  list: { marginTop: 22, gap: 10, paddingBottom: 190 },
  dayCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dayCardEditing: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  dayCardOff: { opacity: 0.62 },

  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { fontFamily: fonts.displaySemiBold, fontSize: 14.5, color: colors.textPrimary, marginBottom: 8 },

  toggle: { alignSelf: 'flex-start' },
  toggleTrack: { width: 40, height: 23, borderRadius: 12, backgroundColor: colors.border, justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: colors.primary },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface, marginLeft: 2.5, ...nativeShadow.sm },
  toggleKnobOn: { marginLeft: 19.5 },

  timePills: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timePill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.sm + 4, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  timePillText: { fontFamily: fonts.displaySemiBold, fontSize: 12.5, color: colors.textPrimary },
  timeSep: { color: colors.textSecondary, fontSize: 12 },
  offLabel: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },

  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    textAlign: 'center',
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  rowSaveBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  rowCancelBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  saveBar: { position: 'absolute', left: 24, right: 24, bottom: 102 },
  saveBtn: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 6,
  },
  saveBtnText: { color: colors.surface, fontSize: 14.5, fontWeight: '700' },
});
