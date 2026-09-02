import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { Shift, User } from '@horaires/shared-types';
import { ShiftCard } from './ShiftCard';

type Props = {
  date: Date;
  shifts: Shift[];
  employees: User[];
  userName: (id: string) => string;
  onDeleteShift: (id: string) => void;
  onDuplicateShift: (shift: Shift) => void;
  onAssign: (shiftId: string, userId: string) => void;
  onEditShift: (shift: Shift) => void;
  busyId: string | null;
};

const WEEKDAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function DayColumn({
  date,
  shifts,
  employees,
  userName,
  onDeleteShift,
  onDuplicateShift,
  onAssign,
  onEditShift,
  busyId,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${date.toISOString()}`,
    data: { type: 'day', date: date.toISOString() },
  });

  const isToday = new Date().toDateString() === date.toDateString();

  return (
    <div style={styles.column}>
      <div style={{ ...styles.header, ...(isToday ? styles.headerToday : {}) }}>
        <span style={styles.weekday}>{WEEKDAY_LABELS[date.getDay()]}</span>
        <span style={styles.dayNumber}>{date.getDate()}</span>
      </div>
      <div
        ref={setNodeRef}
        style={{ ...styles.body, backgroundColor: isOver ? colors.primaryTint : 'transparent' }}
      >
        {shifts.length === 0 ? <div style={styles.empty}>—</div> : null}
        {shifts.map((shift) => (
          <ShiftCard
            key={shift.id}
            shift={shift}
            employees={employees}
            userName={userName}
            onDelete={onDeleteShift}
            onDuplicate={onDuplicateShift}
            onAssign={onAssign}
            onEdit={onEditShift}
            busy={busyId === shift.id}
          />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  column: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottom: `1px solid ${colors.border}`,
  },
  headerToday: { backgroundColor: colors.primaryTint },
  weekday: { fontSize: typography.sizes.xs, color: colors.textSecondary, textTransform: 'uppercase' },
  dayNumber: { fontSize: typography.sizes.lg, fontWeight: 700, color: colors.textPrimary, fontFamily: "'Sora', sans-serif" },
  body: { flex: 1, padding: spacing.sm, minHeight: 200, transition: 'background-color 0.15s ease' },
  empty: { color: colors.border, textAlign: 'center', marginTop: spacing.lg, fontSize: typography.sizes.sm },
};
