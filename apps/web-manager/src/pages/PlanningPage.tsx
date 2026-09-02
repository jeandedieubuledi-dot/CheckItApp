import React, { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Shift, Site, User } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient } from '../services/AuthService';
import { SiteSelect } from '../components/SiteSelect';
import { DayColumn } from '../components/DayColumn';
import { EmployeeChip } from '../components/EmployeeChip';
import { Dialog } from '../components/Dialog';
import { MonthCalendar } from '../components/MonthCalendar';
import { EditShiftDialog } from '../components/EditShiftDialog';
import { startOfWeek, addDays, startOfMonth, addMonths, toLocalInputValue } from '../lib/date';

type ViewMode = 'week' | 'month';

type DragPayload =
  | { type: 'employee'; userId: string }
  | { type: 'shift'; shiftId: string; startsAt: string; endsAt: string };

type DropPayload = { type: 'shift'; shiftId: string } | { type: 'day'; date: string };

// SEUL endroit de tout le produit où on peut créer/éditer des horaires
// (voir CLAUDE.md — choix produit, pas une restriction API).
export function PlanningPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(addDays(startOfWeek(new Date()), 1)));
  const [endsAt, setEndsAt] = useState('');
  const [roleNeeded, setRoleNeeded] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    apiClient.getSites().then((list) => {
      setSites(list);
      setSelectedSiteId((current) => current ?? list[0]?.id ?? null);
    });
    apiClient.getUsers().then(setUsers);
  }, []);

  const load = useCallback(async () => {
    if (!selectedSiteId) return;
    setIsLoading(true);
    try {
      // La grille mois affiche aussi les jours de padding du mois précédent/
      // suivant — on couvre toute la grille visible (6 semaines), pas
      // seulement le mois calendaire, sinon ces cases paraîtraient vides à tort.
      const rangeStart = viewMode === 'week' ? weekStart : startOfWeek(monthAnchor);
      const rangeEnd = viewMode === 'week' ? addDays(weekStart, 7) : addDays(rangeStart, 42);
      const list = await apiClient.getShifts({
        siteId: selectedSiteId,
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
      });
      setShifts(list);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSiteId, weekStart, viewMode, monthAnchor]);

  useEffect(() => {
    void load();
  }, [load]);

  const createShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSiteId || !startsAt || !endsAt) return;
    setError(null);
    setIsCreating(true);
    try {
      await apiClient.createShift({
        siteId: selectedSiteId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        roleNeeded: roleNeeded || undefined,
        status: 'published',
      });
      setEndsAt('');
      setRoleNeeded('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteShift = (shiftId: string) => {
    setDeleteTarget(shiftId);
  };

  const confirmDeleteShift = async () => {
    if (!deleteTarget) return;
    const shiftId = deleteTarget;
    setDeleteTarget(null);
    setBusyId(shiftId);
    try {
      await apiClient.deleteShift(shiftId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const duplicateShift = async (shift: Shift) => {
    // Copie non assignée, même créneau/site/rôle — pratique pour ouvrir un
    // second poste sur le même horaire, ou comme point de départ avant de
    // glisser la copie vers un autre jour.
    setBusyId(shift.id);
    try {
      await apiClient.createShift({
        siteId: shift.siteId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        roleNeeded: shift.roleNeeded,
        status: shift.status,
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const updateShiftDetails = async (
    shiftId: string,
    payload: { siteId: string; startsAt: string; endsAt: string; roleNeeded?: string; status: Shift['status'] },
  ) => {
    await apiClient.updateShift(shiftId, payload);
    await load();
  };

  const assignEmployee = async (shiftId: string, userId: string) => {
    setBusyId(shiftId);
    try {
      await apiClient.assignShift(shiftId, userId);
      await load();
    } catch (err) {
      // Le backend refuse un employé déjà sur un shift qui chevauche celui-ci
      // dans le temps (409) — même message affiché, qu'on arrive ici par
      // glisser-déposer ou via le menu déroulant.
      setConflictMessage(
        err instanceof ApiError ? err.message : "Impossible d'assigner cet employé à ce shift",
      );
    } finally {
      setBusyId(null);
    }
  };

  const rescheduleShift = async (shiftId: string, oldStartsAt: string, oldEndsAt: string, targetDateISO: string) => {
    const oldStart = new Date(oldStartsAt);
    const oldEnd = new Date(oldEndsAt);
    const targetDate = new Date(targetDateISO);

    // Delta en jours calendaires entre l'ancienne et la nouvelle date, heure
    // du shift conservée (on déplace le jour, pas l'horaire).
    const oldDay = new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate());
    const newDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const diff = Math.round((newDay.getTime() - oldDay.getTime()) / 86400000);
    if (diff === 0) return;

    setBusyId(shiftId);
    try {
      await apiClient.updateShift(shiftId, {
        startsAt: addDays(oldStart, diff).toISOString(),
        endsAt: addDays(oldEnd, diff).toISOString(),
      });
      await load();
    } catch (err) {
      setConflictMessage(
        err instanceof ApiError ? err.message : 'Impossible de déplacer ce shift',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDrag(event.active.data.current as DragPayload);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as DragPayload;
    const overData = over.data.current as DropPayload;

    if (activeData.type === 'employee' && overData.type === 'shift') {
      void assignEmployee(overData.shiftId, activeData.userId);
    } else if (activeData.type === 'shift' && overData.type === 'day') {
      void rescheduleShift(activeData.shiftId, activeData.startsAt, activeData.endsAt, overData.date);
    }
  };

  const userName = (userId: string) => {
    const u = users.find((candidate) => candidate.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : userId;
  };

  // Vue mois = aperçu ; cliquer un shift bascule sur la semaine correspondante,
  // qui reste le seul écran interactif (créer/assigner/déplacer/supprimer).
  const jumpToShiftWeek = (shift: Shift) => {
    setWeekStart(startOfWeek(new Date(shift.startsAt)));
    setViewMode('week');
  };

  const employees = users.filter((u) => u.role === 'employee');
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={styles.header}>
        <h1 style={styles.title}>Planning</h1>
        <div style={styles.headerRight}>
          <div style={styles.viewToggle}>
            <button
              className="btn"
              style={{ ...styles.viewToggleButton, ...(viewMode === 'week' ? styles.viewToggleButtonActive : {}) }}
              onClick={() => setViewMode('week')}
            >
              Semaine
            </button>
            <button
              className="btn"
              style={{ ...styles.viewToggleButton, ...(viewMode === 'month' ? styles.viewToggleButtonActive : {}) }}
              onClick={() => setViewMode('month')}
            >
              Mois
            </button>
          </div>
          <SiteSelect sites={sites} value={selectedSiteId} onChange={setSelectedSiteId} />
        </div>
      </div>

      {viewMode === 'week' ? (
        <div style={styles.weekNav}>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={styles.weekLabel}>
            {weekStart.toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' })} —{' '}
            {addDays(weekStart, 6).toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' })}
          </span>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div style={styles.weekNav}>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={styles.weekLabel}>
            {monthAnchor.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' })}
          </span>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <form style={styles.createForm} onSubmit={createShift}>
        <h2 style={styles.sectionTitle}>Nouveau shift</h2>
        <div className="create-shift-row" style={styles.createRow}>
          <label style={styles.label}>
            Début
            <input
              style={styles.input}
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </label>
          <label style={styles.label}>
            Fin
            <input
              style={styles.input}
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
            />
          </label>
          <label style={styles.label}>
            Rôle (optionnel)
            <input
              style={styles.input}
              placeholder="ex: Caissier"
              value={roleNeeded}
              onChange={(e) => setRoleNeeded(e.target.value)}
            />
          </label>
          <button className="btn btn-gradient" style={styles.button} type="submit" disabled={isCreating || !selectedSiteId}>
            <Plus size={16} strokeWidth={2.5} />
            Créer
          </button>
        </div>
        {error ? <p style={styles.error}>{error}</p> : null}
      </form>

      {viewMode === 'week' ? (
        <div className="planning-board" style={styles.board}>
          <aside className="planning-sidebar" style={styles.sidebar}>
            <h2 style={styles.sectionTitle}>Équipe</h2>
            <p style={styles.hint}>Glissez un employé sur un shift pour l'assigner.</p>
            {employees.map((u) => (
              <EmployeeChip key={u.id} user={u} />
            ))}
          </aside>

          {isLoading ? (
            <p style={styles.muted}>Chargement…</p>
          ) : (
            <div className="planning-grid" style={styles.grid}>
              {days.map((date) => (
                <DayColumn
                  key={date.toISOString()}
                  date={date}
                  shifts={shifts
                    .filter((s) => new Date(s.startsAt).toDateString() === date.toDateString())
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))}
                  employees={employees}
                  userName={userName}
                  onDeleteShift={deleteShift}
                  onDuplicateShift={duplicateShift}
                  onAssign={assignEmployee}
                  onEditShift={setEditingShift}
                  busyId={busyId}
                />
              ))}
            </div>
          )}
        </div>
      ) : isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : (
        <MonthCalendar monthAnchor={monthAnchor} shifts={shifts} onSelectShift={jumpToShiftWeek} />
      )}

      <DragOverlay>
        {activeDrag?.type === 'employee' ? (
          <div style={styles.overlayChip}>{userName(activeDrag.userId)}</div>
        ) : activeDrag?.type === 'shift' ? (
          <div style={styles.overlayChip}>
            {new Date(activeDrag.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        ) : null}
      </DragOverlay>

      <Dialog
        open={conflictMessage !== null}
        variant="warning"
        title="Assignation impossible"
        message={conflictMessage ?? ''}
        cancelLabel="Compris"
        onClose={() => setConflictMessage(null)}
      />

      <Dialog
        open={deleteTarget !== null}
        variant="danger"
        title="Supprimer ce shift ?"
        message="Cette action est définitive et retire aussi toute assignation liée à ce shift."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={confirmDeleteShift}
        onClose={() => setDeleteTarget(null)}
      />

      <EditShiftDialog
        shift={editingShift}
        sites={sites}
        onClose={() => setEditingShift(null)}
        onSave={updateShiftDetails}
      />
    </DndContext>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: 0, fontFamily: "'Sora', sans-serif" },
  headerRight: { display: 'flex', alignItems: 'center', gap: spacing.md },
  viewToggle: {
    display: 'flex',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 2,
    border: `1px solid ${colors.border}`,
  },
  viewToggleButton: {
    padding: `${spacing.xs}px ${spacing.md}px`,
    borderRadius: radius.sm,
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: 600,
    cursor: 'pointer',
  },
  viewToggleButtonActive: { backgroundColor: colors.surface, color: colors.primary, boxShadow: shadows.sm },
  weekNav: { display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  navButton: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    cursor: 'pointer',
  },
  weekLabel: { fontWeight: 600, color: colors.textPrimary },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, margin: 0, marginBottom: spacing.sm },
  createForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    marginBottom: spacing.xl,
  },
  createRow: { display: 'flex', gap: spacing.md, flexWrap: 'wrap', alignItems: 'flex-end' },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: typography.sizes.xs, color: colors.textSecondary },
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
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  muted: { color: colors.textSecondary },
  board: { display: 'flex', gap: spacing.lg, alignItems: 'flex-start' },
  sidebar: {
    width: 220,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    padding: spacing.md,
  },
  hint: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 0, marginBottom: spacing.md },
  grid: { flex: 1, display: 'flex', gap: spacing.sm, minWidth: 0 },
  overlayChip: {
    backgroundColor: colors.primary,
    color: colors.surface,
    borderRadius: radius.md,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: typography.sizes.sm,
    fontWeight: 600,
    boxShadow: shadows.lg,
  },
};
