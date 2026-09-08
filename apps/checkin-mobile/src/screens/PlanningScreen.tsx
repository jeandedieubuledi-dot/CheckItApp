import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
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
  const [selectedDate, setSelectedDate] = useState(() => new Date());

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
  const weekDays = useMemo(() => {
    const start = startOfWeek(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [today]);

  const dayShifts = useMemo(
    () => shifts.filter((s) => isSameDay(new Date(s.startsAt), selectedDate)),
    [shifts, selectedDate],
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

      <View style={styles.dayStrip}>
        {weekDays.map((d) => {
          const selected = isSameDay(d, selectedDate);
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => setSelectedDate(d)}
              style={[styles.dayChip, selected && styles.dayChipSelected]}
            >
              <Text style={[styles.dayLetter, selected && styles.dayLetterSelected]}>
                {DAY_LETTERS[(d.getDay() + 6) % 7]}
              </Text>
              <Text style={[styles.dayNum, selected && styles.dayNumSelected]}>{d.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={dayShifts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun shift ce jour-là.</Text>}
        renderItem={({ item }) => {
          const mine = item.assignments?.find((a) => a.userId === user?.id);
          const pending = mine ? PENDING_STATUSES.has(mine.status) : false;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardDay}>
                  {new Date(item.startsAt).toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit', month: 'long' })}
                </Text>
                {mine ? (
                  <View style={[styles.chip, pending ? styles.chipPending : styles.chipConfirmed]}>
                    <Text style={styles.chipText}>{STATUS_LABELS[mine.status] ?? mine.status}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.time}>
                {new Date(item.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
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
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display, fontSize: typography.sizes.xl, color: colors.textPrimary },
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

  dayStrip: { flexDirection: 'row', gap: 6, marginTop: spacing.lg },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayLetter: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
  dayLetterSelected: { color: 'rgba(255,255,255,0.75)' },
  dayNum: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.textPrimary },
  dayNumSelected: { color: colors.surface },

  listContent: { paddingTop: spacing.lg, paddingBottom: 110, gap: spacing.sm },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 8,
    ...nativeShadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDay: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full },
  chipConfirmed: { backgroundColor: colors.successTint },
  chipPending: { backgroundColor: colors.warningTint },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  time: { fontFamily: fonts.displaySemiBold, fontSize: 21, color: colors.textPrimary, letterSpacing: -0.2 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  site: { fontSize: 13, color: colors.textSecondary },
  role: { fontSize: 13, color: colors.textSecondary },
});
