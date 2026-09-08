import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@horaires/ui-tokens';
import type { Shift, ShiftAssignment, ShiftOffer, Site, User } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { fonts } from '../theme';

type OwnAssignment = { kind: 'own'; id: string; shift: Shift; assignment: ShiftAssignment };
type OpenOffer = { kind: 'offer'; id: string; shift: Shift; assignment: ShiftAssignment; offer: ShiftOffer };
type Row = OwnAssignment | OpenOffer;
type Segment = 'available' | 'mine';

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
  const [segment, setSegment] = useState<Segment>('available');
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

  const rows: Row[] = segment === 'available' ? openOffers : ownAssignments;

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
          style={styles.acceptBtn}
          disabled={busy}
          onPress={() => (isOwn ? offerShift(row.assignment.id) : acceptOffer(row.offer.id))}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Text style={styles.acceptBtnText}>{isOwn ? 'Proposer' : 'Accepter'}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.px}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Marché de shifts</Text>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle}>Proposés par vos collègues</Text>

        <View style={styles.segmented}>
          <Pressable style={[styles.seg, segment === 'available' && styles.segActive]} onPress={() => setSegment('available')}>
            <Text style={[styles.segText, segment === 'available' && styles.segTextActive]}>Disponibles</Text>
          </Pressable>
          <Pressable style={[styles.seg, segment === 'mine' && styles.segActive]} onPress={() => setSegment('mine')}>
            <Text style={[styles.segText, segment === 'mine' && styles.segTextActive]}>Mes échanges</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.sectionLabel, styles.px]}>
        {segment === 'available' ? 'Offres disponibles' : 'Vos shifts à proposer'}
      </Text>

      {rows.length === 0 ? (
        <Text style={[styles.empty, styles.px]}>
          {segment === 'available' ? 'Aucune offre ouverte actuellement.' : "Rien à proposer pour l'instant."}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hscroll}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        >
          {rows.map(renderRow)}
        </ScrollView>
      )}

      <View style={styles.navSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28 },
  px: { paddingHorizontal: 24 },

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
  subtitle: { fontSize: 13.5, color: colors.textSecondary, marginTop: 6 },

  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 4, marginTop: 20 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  segActive: { backgroundColor: colors.primary },
  segText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  segTextActive: { color: colors.surface },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: 26 },
  empty: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  hscroll: { gap: 14, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6 },

  card: {
    width: 208,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 10,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  cardDate: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
  cardTime: { fontFamily: fonts.displaySemiBold, fontSize: 19, color: colors.textPrimary, letterSpacing: -0.2 },
  cardSite: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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

  acceptBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 13,
    paddingVertical: 11,
    alignItems: 'center',
  },
  acceptBtnText: { color: colors.surface, fontWeight: '700', fontSize: 13.5 },

  navSpacer: { height: 90 },
});
