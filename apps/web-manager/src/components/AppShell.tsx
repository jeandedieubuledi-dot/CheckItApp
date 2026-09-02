import React from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, Radio, ArrowLeftRight, Users, LogOut, CalendarClock } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import { useAuth } from '../services/AuthService';

const NAV_ITEMS = [
  { to: '/planning', label: 'Planning', icon: CalendarDays },
  { to: '/presence', label: 'Présence', icon: Radio },
  { to: '/approvals', label: 'Échanges', icon: ArrowLeftRight },
  { to: '/team', label: 'Équipe', icon: Users },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell" style={styles.root}>
      <aside className="app-sidebar" style={styles.sidebar}>
        <div style={styles.brandRow}>
          <div style={styles.brandMark}>
            <CalendarClock size={18} color={colors.surface} strokeWidth={2.5} />
          </div>
          <span className="gradient-text" style={styles.brand}>
            Horaires
          </span>
        </div>
        <nav className="app-sidebar-nav" style={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="nav-link"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              <item.icon size={18} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-sidebar-footer" style={styles.footer}>
          <div className="app-sidebar-footer-name" style={styles.userName}>
            {user?.firstName} {user?.lastName}
          </div>
          <button className="btn" style={styles.logoutButton} onClick={logout}>
            <LogOut size={16} strokeWidth={2} />
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="page-padding" style={styles.main}>
        {children}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', backgroundColor: colors.background },
  sidebar: {
    width: 220,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    padding: spacing.lg,
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    background: 'linear-gradient(135deg, #4F46E5 0%, #9333EA 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brand: {
    fontFamily: "'Sora', sans-serif",
    fontSize: typography.sizes.xl,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: spacing.xs, flex: 1 },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    color: colors.textSecondary,
    textDecoration: 'none',
    fontSize: typography.sizes.md,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  navLinkActive: { backgroundColor: colors.primary, color: colors.surface, fontWeight: 600, boxShadow: shadows.sm },
  footer: { borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md },
  userName: { fontSize: typography.sizes.sm, color: colors.textPrimary, marginBottom: spacing.sm, whiteSpace: 'nowrap' },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%',
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    whiteSpace: 'nowrap',
  },
  main: { flex: 1, padding: spacing.xl, overflowY: 'auto', minWidth: 0 },
};
