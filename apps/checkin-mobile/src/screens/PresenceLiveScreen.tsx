import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { Site } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';
import { SitePicker } from '../components/SitePicker';

type PresentEmployee = { id: string; firstName: string; lastName: string };

export function PresenceLiveScreen() {
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
      <Text style={styles.title}>Présence en direct</Text>
      <SitePicker sites={sites} selectedSiteId={selectedSiteId} onSelect={setSelectedSiteId} />

      <FlatList
        data={present}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Personne n'est actuellement en poste sur ce site.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.dot} />
            <Text style={styles.name}>
              {item.firstName} {item.lastName}
            </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...nativeShadow.sm,
  },
  dot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.success },
  name: { fontSize: typography.sizes.md, color: colors.textPrimary, fontWeight: '600' },
});
