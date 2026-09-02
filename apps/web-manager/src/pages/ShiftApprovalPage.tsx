import React, { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Shift, ShiftAssignment, ShiftOffer, Site, User } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';

type PendingOffer = { id: string; shift: Shift; assignment: ShiftAssignment; offer: ShiftOffer };

export function ShiftApprovalPage() {
  const [pending, setPending] = useState<PendingOffer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div>
      <h1 style={styles.title}>Échanges à valider</h1>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : pending.length === 0 ? (
        <p style={styles.muted}>Aucun échange en attente de validation.</p>
      ) : (
        <div style={styles.tableWrap}>
        <table className="data-table" style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Shift</th>
              <th style={styles.th}>De</th>
              <th style={styles.th}>Vers</th>
              <th style={styles.th} />
            </tr>
          </thead>
          <tbody>
            {pending.map((row) => (
              <tr key={row.id}>
                <td style={styles.td}>
                  {siteName(row.shift.siteId)} —{' '}
                  {new Date(row.shift.startsAt).toLocaleString('fr-BE', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td style={styles.td}>{userName(row.offer.offeredBy)}</td>
                <td style={styles.td}>{userName(row.offer.acceptedBy ?? '')}</td>
                <td style={styles.td}>
                  <button
                    className="btn"
                    style={styles.button}
                    disabled={busyId === row.id}
                    onClick={() => approve(row.id)}
                  >
                    <Check size={14} strokeWidth={2.5} />
                    Valider
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, marginBottom: spacing.lg },
  muted: { color: colors.textSecondary },
  tableWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    overflowX: 'auto',
    boxShadow: shadows.sm,
  },
  table: { width: '100%', minWidth: 480, borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: spacing.sm,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  td: { padding: spacing.sm, borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.xs}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
