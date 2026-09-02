import React, { useEffect, useState } from 'react';
import { UserPlus, RefreshCw, KeyRound } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { User, UserRole } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employé',
};

export function TeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [isInviting, setIsInviting] = useState(false);

  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const list = await apiClient.getUsers();
      setUsers(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsInviting(true);
    try {
      await apiClient.inviteUser({ email: email.trim(), firstName, lastName, role });
      setEmail('');
      setFirstName('');
      setLastName('');
      setRole('employee');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const changeRole = async (userId: string, newRole: UserRole) => {
    setBusyUserId(userId);
    try {
      await apiClient.updateUserRole(userId, newRole);
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  const regenerateBadge = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await apiClient.regenerateBadge(userId);
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  const setPin = async (userId: string) => {
    const pin = pinDrafts[userId];
    if (!pin || pin.length < 4) return;
    setBusyUserId(userId);
    try {
      await apiClient.setUserPin(userId, pin);
      setPinDrafts((prev) => ({ ...prev, [userId]: '' }));
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Équipe</h1>

      <form style={styles.inviteForm} onSubmit={invite}>
        <h2 style={styles.sectionTitle}>Inviter un employé</h2>
        <div style={styles.inviteRow}>
          <input
            style={styles.input}
            placeholder="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select style={styles.input} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="employee">Employé</option>
            <option value="manager">Manager</option>
          </select>
          <button
            className="btn btn-gradient"
            style={styles.button}
            type="submit"
            disabled={isInviting || !email || !firstName || !lastName}
          >
            <UserPlus size={16} strokeWidth={2.25} />
            Inviter
          </button>
        </div>
        {error ? <p style={styles.error}>{error}</p> : null}
      </form>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : (
        <div style={styles.tableWrap}>
        <table className="data-table" style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nom</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Rôle</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}>Badge</th>
              <th style={styles.th}>PIN</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={styles.td}>
                  {u.firstName} {u.lastName}
                </td>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}>
                  <select
                    style={styles.inlineSelect}
                    value={u.role}
                    disabled={busyUserId === u.id}
                    onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                  >
                    <option value="employee">{ROLE_LABELS.employee}</option>
                    <option value="manager">{ROLE_LABELS.manager}</option>
                    <option value="admin">{ROLE_LABELS.admin}</option>
                  </select>
                </td>
                <td style={styles.td}>{u.status}</td>
                <td style={styles.td}>
                  <button
                    className="btn"
                    style={styles.smallButton}
                    disabled={busyUserId === u.id}
                    onClick={() => regenerateBadge(u.id)}
                  >
                    <RefreshCw size={12} strokeWidth={2.25} />
                    Régénérer
                  </button>
                </td>
                <td style={styles.td}>
                  <div style={styles.pinRow}>
                    <input
                      style={styles.pinInput}
                      placeholder="1234"
                      maxLength={6}
                      value={pinDrafts[u.id] ?? ''}
                      onChange={(e) =>
                        setPinDrafts((prev) => ({ ...prev, [u.id]: e.target.value.replace(/\D/g, '') }))
                      }
                    />
                    <button
                      className="btn"
                      style={styles.smallButton}
                      disabled={busyUserId === u.id || (pinDrafts[u.id]?.length ?? 0) < 4}
                      onClick={() => setPin(u.id)}
                    >
                      <KeyRound size={12} strokeWidth={2.25} />
                      Définir
                    </button>
                  </div>
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
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, margin: 0, marginBottom: spacing.sm },
  inviteForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    marginBottom: spacing.xl,
    boxShadow: shadows.sm,
  },
  inviteRow: { display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  input: {
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.sm,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  muted: { color: colors.textSecondary },
  tableWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    overflowX: 'auto',
    boxShadow: shadows.sm,
  },
  table: { width: '100%', minWidth: 640, borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: spacing.sm,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  td: { padding: spacing.sm, borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary },
  inlineSelect: { padding: spacing.xs, borderRadius: radius.sm, border: `1px solid ${colors.border}` },
  smallButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    cursor: 'pointer',
    fontSize: typography.sizes.xs,
  },
  pinRow: { display: 'flex', gap: spacing.xs },
  pinInput: {
    width: 60,
    padding: spacing.xs,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
  },
};
