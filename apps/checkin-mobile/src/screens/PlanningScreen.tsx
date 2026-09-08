import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@horaires/ui-tokens';
import type { Shift, Site } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { fonts } from '../theme';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigné',
  offered: 'Proposé',
  swap_pending: "En attente d'échange",
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
};

const PENDING_STATUSES = new Set(['offered', 'swap_pending']);
const DAY_LETTERS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Lecture seule — la création/édition d'horaires est exclusive à web-manager
// (voir CLAUDE.md, décision d'architecture). Cet écran ne fait qu'afficher.
export function PlanningScreen() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const load = useCallback(async () => {
    const [shiftList, siteList] = await Promise.all([apiClient.getShifts(), apiClient.getSites()]);
    setShifts(shiftList.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    setSites(siteList);
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

  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? siteId;

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => {
    const start = startOfWeek(today);
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [today, weekOffset]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart],
  );
  const weekEnd = weekDays[6];
  const weekLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTHS[weekStart.getMonth()]}`
      : `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`;

  const weekShifts = useMemo(
    () => shifts.filter((s) => weekDays.some((d) => isSameDay(d, new Date(s.startsAt)))),
    [shifts, weekDays],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Planning</Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.weekNav}>
        <Pressable style={styles.weekArrow} onPress={() => setWeekOffset((w) => w - 1)}>
          <Ionicons name="chevron-back" size={15} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <Pressable style={styles.weekArrow} onPress={() => setWeekOffset((w) => w + 1)}>
          <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.dayStrip}>
        {weekDays.map((d) => {
          const today_ = isSameDay(d, today);
          return (
            <View key={d.toISOString()} style={[styles.dayChip, today_ && styles.dayChipToday]}>
              <Text style={[styles.dayLetter, today_ && styles.dayLetterToday]}>
                {DAY_LETTERS[(d.getDay() + 6) % 7]}
              </Text>
              <Text style={[styles.dayNum, today_ && styles.dayNumToday]}>{d.getDate()}</Text>
            </View>
          );
        })}
      </View>

      <FlatList
        data={weekShifts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun shift cette semaine-là.</Text>}
        renderItem={({ item }) => {
          const mine = item.assignments?.find((a) => a.userId === user?.id);
          const pending = mine ? PENDING_STATUSES.has(mine.status) : false;
          const startDate = new Date(item.startsAt);
          const dayLabel = isSameDay(startDate, today)
            ? `Aujourd'hui — ${startDate.toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit' })}`
            : startDate.toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit', month: 'long' });
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardDay}>{dayLabel}</Text>
                {mine ? (
                  <View style={[styles.chip, pending ? styles.chipPending : styles.chipConfirmed]}>
                    <Text style={styles.chipText}>{STATUS_LABELS[mine.status] ?? mine.status}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.time}>
                {startDate.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(item.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <View style={styles.siteRow}>
                <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.site}>{siteName(item.siteId)}</Text>
                {item.roleNeeded ? <Text style={styles.role}> · {item.roleNeeded}</Text> : null}
              </View>
            </View>
          );
        }}
      />
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

  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 },
  weekLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
  weekArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayStrip: { flexDirection: 'row', gap: 6, marginTop: 14 },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipToday: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayLetter: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
  dayLetterToday: { color: 'rgba(255,255,255,0.75)' },
  dayNum: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.textPrimary },
  dayNumToday: { color: colors.surface },

  listContent: { paddingTop: 24, paddingBottom: 110, gap: 12 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 8,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDay: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  chipConfirmed: { backgroundColor: colors.successTint },
  chipPending: { backgroundColor: colors.warningTint },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  time: { fontFamily: fonts.displaySemiBold, fontSize: 21, color: colors.textPrimary, letterSpacing: -0.2 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  site: { fontSize: 13, color: colors.textSecondary },
  role: { fontSize: 13, color: colors.textSecondary },
});
