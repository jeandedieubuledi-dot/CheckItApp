import React, { useCallback, useEffect, useState } from 'react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Site } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';
import { SiteSelect } from '../components/SiteSelect';

type PresentEmployee = { id: string; firstName: string; lastName: string };

export function PresenceLivePage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [present, setPresent] = useState<PresentEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient.getSites().then((list) => {
      setSites(list);
      setSelectedSiteId((current) => current ?? list[0]?.id ?? null);
    });
  }, []);

  const loadPresence = useCallback(async (siteId: string) => {
    setIsLoading(true);
    try {
      const list = await apiClient.getPresence(siteId);
      setPresent(list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSiteId) void loadPresence(selectedSiteId);
  }, [selectedSiteId, loadPresence]);

  // Rafraîchit automatiquement — vue "en direct" pensée pour rester ouverte.
  useEffect(() => {
    if (!selectedSiteId) return;
    const interval = setInterval(() => loadPresence(selectedSiteId), 30_000);
    return () => clearInterval(interval);
  }, [selectedSiteId, loadPresence]);

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Présence en direct</h1>
        <SiteSelect sites={sites} value={selectedSiteId} onChange={setSelectedSiteId} />
      </div>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : present.length === 0 ? (
        <p style={styles.muted}>Personne n'est actuellement en poste sur ce site.</p>
      ) : (
        <div style={styles.grid}>
          {present.map((employee) => (
            <div key={employee.id} className="card-hover" style={styles.card}>
              <span style={styles.dot} className="live-dot" />
              <span style={styles.name}>
                {employee.firstName} {employee.lastName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: 0 },
  muted: { color: colors.textSecondary },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: spacing.md },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.sm,
  },
  dot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.success, display: 'inline-block' },
  name: { fontWeight: 600, color: colors.textPrimary },
};
