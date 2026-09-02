import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Shift, Site } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigné',
  offered: 'Proposé',
  swap_pending: "En attente d'échange",
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
};

// Lecture seule — la création/édition d'horaires est exclusive à web-manager
// (voir CLAUDE.md, décision d'architecture). Cet écran ne fait qu'afficher.
export function PlanningScreen() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Planning</Text>
      <FlatList
        data={shifts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun shift publié pour le moment.</Text>}
        renderItem={({ item }) => {
          const mine = item.assignments?.find((a) => a.userId === user?.id);
          return (
            <View style={styles.card}>
              <Text style={styles.site}>{siteName(item.siteId)}</Text>
              <Text style={styles.time}>
                {new Date(item.startsAt).toLocaleString('fr-BE', {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' → '}
                {new Date(item.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {item.roleNeeded ? <Text style={styles.role}>{item.roleNeeded}</Text> : null}
              {mine ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{STATUS_LABELS[mine.status] ?? mine.status}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...nativeShadow.sm,
  },
  site: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.textPrimary },
  time: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },
  role: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  badgeText: { color: colors.surface, fontSize: typography.sizes.xs, fontWeight: '600' },
});
