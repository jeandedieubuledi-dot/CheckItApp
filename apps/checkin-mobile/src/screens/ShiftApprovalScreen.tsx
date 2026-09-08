import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Shift, ShiftAssignment, ShiftOffer, Site, User } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { fonts } from '../theme';

type PendingOffer = { id: string; shift: Shift; assignment: ShiftAssignment; offer: ShiftOffer };

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Un collègue a accepté une offre d'échange (status 'accepted') et
// requiresManagerApproval est vrai — le manager valide. Pas de "refuser" :
// l'API n'expose pas ce endpoint aujourd'hui (voir packages/api-client).
export function ShiftApprovalScreen() {
  const { user } = useAuth();
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
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>Validations</Text>
          {pending.length > 0 ? (
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>{pending.length} en attente</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.subtitle}>Échanges de shifts à approuver</Text>

      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun échange en attente de validation.</Text>}
        renderItem={({ item }) => {
          const fromName = userName(item.offer.offeredBy);
          const toName = userName(item.offer.acceptedBy ?? '');
          const busy = busyId === item.id;
          return (
            <View style={styles.card}>
              <View style={styles.swapRow}>
                <View style={styles.swapAvatar}>
                  <Text style={styles.swapAvatarText}>{initials(fromName)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={15} color={colors.textSecondary} />
                <View style={styles.swapAvatar}>
                  <Text style={styles.swapAvatarText}>{initials(toName)}</Text>
                </View>
                <Text style={styles.swapNames} numberOfLines={1}>
                  <Text style={styles.swapNamesBold}>{fromName}</Text> cède à{' '}
                  <Text style={styles.swapNamesBold}>{toName}</Text>
                </Text>
              </View>

              <View style={styles.details}>
                <View>
                  <Text style={styles.detailsTime}>
                    {new Date(item.shift.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {new Date(item.shift.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.detailsSite}>{siteName(item.shift.siteId)}</Text>
                </View>
                <Text style={styles.detailsDate}>
                  {new Date(item.shift.startsAt).toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </Text>
              </View>

              <Pressable style={styles.approveBtn} disabled={busy} onPress={() => approve(item.id)}>
                {busy ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color={colors.surface} />
                    <Text style={styles.approveBtnText}>Approuver</Text>
                  </>
                )}
              </Pressable>
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
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary },
  countChip: { backgroundColor: colors.warningTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  countChipText: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
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
  subtitle: { fontSize: 13.5, color: colors.textSecondary, marginTop: 4 },

  listContent: { paddingTop: spacing.lg, paddingBottom: 110, gap: spacing.md },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    ...nativeShadow.sm,
  },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swapAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 11.5, color: colors.primary },
  swapNames: { flex: 1, fontSize: 13, color: colors.textPrimary },
  swapNamesBold: { fontWeight: '700' },

  details: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: radius.md, padding: 11 },
  detailsTime: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.textPrimary },
  detailsSite: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  detailsDate: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary, textTransform: 'capitalize' },

  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  approveBtnText: { color: colors.surface, fontWeight: '700', fontSize: 13.5 },
});
