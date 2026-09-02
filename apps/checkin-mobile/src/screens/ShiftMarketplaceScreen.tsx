import React, { useCallback, useState } from 'react';
import { View, Text, SectionList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Shift, ShiftAssignment, ShiftOffer, Site, User } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { withPressedFeedback } from '../lib/pressedStyle';

type OwnAssignment = { kind: 'own'; id: string; shift: Shift; assignment: ShiftAssignment };
type OpenOffer = { kind: 'offer'; id: string; shift: Shift; assignment: ShiftAssignment; offer: ShiftOffer };
type Row = OwnAssignment | OpenOffer;

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

  const formatSlot = (shift: Shift) =>
    `${siteName(shift.siteId)} — ${new Date(shift.startsAt).toLocaleString('fr-BE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Marché de shifts</Text>
      <SectionList<Row>
        sections={[
          { title: 'Mes shifts à proposer', data: ownAssignments },
          { title: 'Offres disponibles', data: openOffers },
        ]}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <Text style={styles.empty}>
              {section.title === 'Mes shifts à proposer'
                ? "Rien à proposer pour l'instant."
                : 'Aucune offre ouverte actuellement.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'own' ? (
            <View style={styles.card}>
              <Text style={styles.slot}>{formatSlot(item.shift)}</Text>
              <Pressable
                style={withPressedFeedback(styles.button)}
                disabled={busyId === item.id}
                onPress={() => offerShift(item.assignment.id)}
              >
                <Text style={styles.buttonText}>Proposer ce shift</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.slot}>{formatSlot(item.shift)}</Text>
              <Text style={styles.subtext}>Proposé par {userName(item.offer.offeredBy)}</Text>
              <Pressable
                style={withPressedFeedback(styles.button)}
                disabled={busyId === item.id}
                onPress={() => acceptOffer(item.offer.id)}
              >
                <Text style={styles.buttonText}>Accepter</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  empty: { color: colors.textSecondary, marginBottom: spacing.md },
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
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: { color: colors.surface, fontWeight: '600' },
});
