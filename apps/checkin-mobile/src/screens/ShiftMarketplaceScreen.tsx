import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Shift, ShiftAssignment, ShiftOffer, Site, User } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { fonts } from '../theme';

type OwnAssignment = { kind: 'own'; id: string; shift: Shift; assignment: ShiftAssignment };
type OpenOffer = { kind: 'offer'; id: string; shift: Shift; assignment: ShiftAssignment; offer: ShiftOffer };
type Row = OwnAssignment | OpenOffer;

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Marché de shifts : un employé propose un shift qui lui est assigné, un
// collègue l'accepte (validation manager ensuite si requise). Pas de
// création d'horaires ici — uniquement le cycle offer/accept.
export function ShiftMarketplaceScreen() {
  const { user } = useAuth();
  const [ownAssignments, setOwnAssignments] = useState<OwnAssignment[]>([]);
  const [openOffers, setOpenOffers] = useState<OpenOffer[]>([]);
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

    const mine: OwnAssignment[] = [];
    const open: OpenOffer[] = [];
    for (const shift of shifts) {
      for (const assignment of shift.assignments ?? []) {
        if (assignment.userId === user?.id && assignment.status === 'assigned') {
          mine.push({ kind: 'own', id: assignment.id, shift, assignment });
        }
        for (const offer of assignment.offers ?? []) {
          if (offer.status === 'open' && offer.offeredBy !== user?.id) {
            open.push({ kind: 'offer', id: offer.id, shift, assignment, offer });
          }
        }
      }
    }
    setOwnAssignments(mine);
    setOpenOffers(open);
  }, [user?.id]);

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

  const offerShift = async (assignmentId: string) => {
    setBusyId(assignmentId);
    try {
      await apiClient.offerShiftAssignment(assignmentId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const acceptOffer = async (offerId: string) => {
    setBusyId(offerId);
    try {
      await apiClient.acceptShiftOffer(offerId);
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

  const dateLabel = (shift: Shift) =>
    new Date(shift.startsAt).toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const timeLabel = (shift: Shift) =>
    `${new Date(shift.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })} – ${new Date(
      shift.endsAt,
    ).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`;

  const renderRow = (row: Row) => {
    const isOwn = row.kind === 'own';
    const busy = busyId === row.id;
    return (
      <View key={row.id} style={styles.card}>
        <Text style={styles.cardDate}>{dateLabel(row.shift)}</Text>
        <Text style={styles.cardTime}>{timeLabel(row.shift)}</Text>
        <View style={styles.cardSite}>
          <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
          <Text style={styles.cardSiteText}>{siteName(row.shift.siteId)}</Text>
        </View>

        {!isOwn ? (
          <View style={styles.byRow}>
            <View style={styles.miniAvatar}>
              <Text style={styles.miniAvatarText}>{initials(userName(row.offer.offeredBy))}</Text>
            </View>
            <Text style={styles.byName}>Proposé par {userName(row.offer.offeredBy)}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.actionBtn, isOwn && styles.actionBtnOutline]}
          disabled={busy}
          onPress={() => (isOwn ? offerShift(row.assignment.id) : acceptOffer(row.offer.id))}
        >
          {busy ? (
            <ActivityIndicator color={isOwn ? colors.primary : colors.surface} size="small" />
          ) : (
            <Text style={[styles.actionBtnText, isOwn && styles.actionBtnTextOutline]}>
              {isOwn ? 'Proposer' : 'Accepter'}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      <Text style={styles.title}>Marché de shifts</Text>
      <Text style={styles.subtitle}>Proposez vos shifts, reprenez ceux de vos collègues</Text>

      <Text style={styles.sectionLabel}>Offres disponibles</Text>
      {openOffers.length === 0 ? (
        <Text style={styles.empty}>Aucune offre ouverte actuellement.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
          {openOffers.map(renderRow)}
        </ScrollView>
      )}

      <Text style={styles.sectionLabel}>Vos shifts à proposer</Text>
      {ownAssignments.length === 0 ? (
        <Text style={styles.empty}>Rien à proposer pour l'instant.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
          {ownAssignments.map(renderRow)}
        </ScrollView>
      )}

      <View style={styles.navSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: typography.sizes.xl, color: colors.textPrimary },
  subtitle: { fontSize: 13.5, color: colors.textSecondary, marginTop: 4 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: { color: colors.textSecondary, fontSize: 13 },
  hscroll: { gap: 14, paddingRight: spacing.lg, paddingBottom: 4 },

  card: {
    width: 208,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 8,
    ...nativeShadow.sm,
  },
  cardDate: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
  cardTime: { fontFamily: fonts.displaySemiBold, fontSize: 19, color: colors.textPrimary, letterSpacing: -0.2 },
  cardSite: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardSiteText: { fontSize: 12.5, color: colors.textSecondary },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 10, color: colors.primary },
  byName: { fontSize: 12, color: colors.textSecondary },

  actionBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actionBtnOutline: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary },
  actionBtnText: { color: colors.surface, fontWeight: '700', fontSize: 13.5 },
  actionBtnTextOutline: { color: colors.primary },

  navSpacer: { height: 90 },
});
