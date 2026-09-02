import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Shift, ShiftAssignment, ShiftOffer, Site, User } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';
import { withPressedFeedback } from '../lib/pressedStyle';

type PendingOffer = { id: string; shift: Shift; assignment: ShiftAssignment; offer: ShiftOffer };

// Un collègue a accepté une offre d'échange (status 'accepted') et
// requiresManagerApproval est vrai — le manager valide ou laisse en attente.
export function ShiftApprovalScreen() {
  const [pending, setPending] = useState<PendingOffer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [shifts, userList, siteList] = await Promise.all([
      apiClient.getShifts(),
      apiClient.getUsers(),
      apiClient.getSites(),
    ]);
    setUsers(userList);
    setSites(siteList);

    const rows: PendingOffer[] = [];
    for (const shift of shifts) {
      for (const assignment of shift.assignments ?? []) {
        for (const offer of assignment.offers ?? []) {
          if (offer.status === 'accepted' && offer.requiresManagerApproval) {
            rows.push({ id: offer.id, shift, assignment, offer });
          }
        }
      }
    }
    setPending(rows);
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

  const approve = async (offerId: string) => {
    setBusyId(offerId);
    try {
      await apiClient.approveShiftOffer(offerId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? siteId;
  const userName = (userId: string) => {
    const u = users.find((candidate) => candidate.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : userId;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Échanges à valider</Text>
      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun échange en attente de validation.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.slot}>
              {siteName(item.shift.siteId)} —{' '}
              {new Date(item.shift.startsAt).toLocaleString('fr-BE', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <Text style={styles.subtext}>
              {userName(item.offer.offeredBy)} → {userName(item.offer.acceptedBy ?? '')}
            </Text>
            <Pressable
              style={withPressedFeedback(styles.button)}
              disabled={busyId === item.id}
              onPress={() => approve(item.id)}
            >
              <Text style={styles.buttonText}>Valider l'échange</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
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
  slot: { fontSize: typography.sizes.sm, fontWeight: '600', color: colors.textPrimary },
  subtext: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  buttonText: { color: colors.surface, fontWeight: '600' },
});
