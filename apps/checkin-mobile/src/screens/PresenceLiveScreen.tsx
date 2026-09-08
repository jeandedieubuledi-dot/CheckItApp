import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Site } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { SitePicker } from '../components/SitePicker';
import { fonts } from '../theme';

type PresentEmployee = { id: string; firstName: string; lastName: string };

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

export function PresenceLiveScreen() {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [present, setPresent] = useState<PresentEmployee[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSites = useCallback(async () => {
    const siteList = await apiClient.getSites();
    setSites(siteList);
    setSelectedSiteId((current) => current ?? siteList[0]?.id ?? null);
  }, []);

  const loadPresence = useCallback(async (siteId: string) => {
    const list = await apiClient.getPresence(siteId);
    setPresent(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSites();
    }, [loadSites]),
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedSiteId) void loadPresence(selectedSiteId);
    }, [selectedSiteId, loadPresence]),
  );

  const refresh = async () => {
    if (!selectedSiteId) return;
    setIsRefreshing(true);
    await loadPresence(selectedSiteId).catch(() => {});
    setIsRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>Présence</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>EN DIRECT</Text>
          </View>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
      </View>

      <SitePicker sites={sites} selectedSiteId={selectedSiteId} onSelect={setSelectedSiteId} />

      <Text style={styles.count}>
        {present.length} employé{present.length > 1 ? 's' : ''} présent{present.length > 1 ? 's' : ''}
      </Text>

      {present.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
          {present.map((p) => (
            <View key={p.id} style={styles.stripAvatar}>
              <Text style={styles.stripAvatarText}>{initials(p.firstName, p.lastName)}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <FlatList
        data={present}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Personne n'est actuellement en poste sur ce site.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardAvatar}>
              <Text style={styles.cardAvatarText}>{initials(item.firstName, item.lastName)}</Text>
            </View>
            <Text style={styles.name}>
              {item.firstName} {item.lastName}
            </Text>
            <View style={styles.presentTag}>
              <View style={styles.presentDot} />
              <Text style={styles.presentTagText}>En service</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.successTint, paddingVertical: 5, paddingHorizontal: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  liveText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
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

  count: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md },
  stripContent: { gap: 10, paddingVertical: 12 },
  stripAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.success,
  },
  stripAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.primary },

  listContent: { paddingTop: spacing.sm, paddingBottom: 110, gap: spacing.sm },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...nativeShadow.sm,
  },
  cardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.primary },
  name: { flex: 1, fontSize: typography.sizes.md, color: colors.textPrimary, fontWeight: '700' },
  presentTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  presentDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  presentTagText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
});
