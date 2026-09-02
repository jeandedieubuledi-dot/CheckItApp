import React, { useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Copy, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Shift, User } from '@horaires/shared-types';
import { DRAG_CURSOR, DRAG_CURSOR_ACTIVE } from '../lib/cursors';

type Props = {
  shift: Shift;
  employees: User[];
  userName: (id: string) => string;
  onDelete: (id: string) => void;
  onDuplicate: (shift: Shift) => void;
  onAssign: (shiftId: string, userId: string) => void;
  onEdit: (shift: Shift) => void;
  busy: boolean;
};

// Glissable (poignée = l'horaire) pour déplacer le shift vers un autre jour,
// et zone de dépôt (toute la carte) pour y assigner un employé glissé depuis
// la colonne Équipe. Un select reste disponible pour l'assignation au clavier.
// Un shift = un seul employé assigné : dès qu'il y en a un, la carte
// n'accepte plus de dépôt et le select disparaît (voir ShiftsService.assign).
export function ShiftCard({ shift, employees, userName, onDelete, onDuplicate, onAssign, onEdit, busy }: Props) {
  const hasAssignment = (shift.assignments ?? []).length > 0;
  const [isPressed, setIsPressed] = useState(false);

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `shift-${shift.id}`,
    data: { type: 'shift', shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `shift-drop-${shift.id}`,
    data: { type: 'shift', shiftId: shift.id },
    disabled: hasAssignment,
  });

  const setRefs = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  // Un clic ouvre l'édition, mais seulement s'il n'y a pas eu de glisser
  // entre-temps (le double-clic est réservé au geste de glisser-déposer,
  // pas de conflit à créer entre les deux).
  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  const squeezed = isPressed || isDragging;
  const translate = transform ? CSS.Translate.toString(transform) : '';

  return (
    <div
      ref={setRefs}
      style={{
        ...styles.card,
        transform: `${translate} scale(${squeezed ? 0.96 : 1})`.trim(),
        transition: isDragging ? undefined : 'transform 0.15s ease',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isOver ? `0 0 0 2px ${colors.primary}` : shadows.sm,
        backgroundColor: isOver ? colors.primaryTint : colors.surface,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        onPointerDown={(e) => {
          setIsPressed(true);
          draggedRef.current = false;
          listeners?.onPointerDown?.(e);
        }}
        onPointerUp={() => {
          setIsPressed(false);
          if (!draggedRef.current) {
            onEdit(shift);
          }
        }}
        onPointerCancel={() => setIsPressed(false)}
        style={{ ...styles.dragHandle, cursor: squeezed ? DRAG_CURSOR_ACTIVE : DRAG_CURSOR }}
        title="Cliquer pour modifier, glisser pour déplacer"
      >
        <span style={styles.time}>
          {new Date(shift.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
          {' – '}
          {new Date(shift.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {shift.roleNeeded ? <span style={styles.role}>{shift.roleNeeded}</span> : null}
      </div>

      <div style={styles.assignments}>
        {!hasAssignment ? (
          <span style={styles.emptyAssign}>Non assigné — glissez un employé ici</span>
        ) : (
          (shift.assignments ?? []).map((a) => (
            <span key={a.id} style={styles.assignChip}>
              {userName(a.userId)}
            </span>
          ))
        )}
      </div>

      {!hasAssignment && employees.length > 0 ? (
        <select
          style={styles.assignSelect}
          disabled={busy}
          value=""
          onChange={(e) => e.target.value && onAssign(shift.id, e.target.value)}
        >
          <option value="">+ Assigner…</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </select>
      ) : null}

      <div style={styles.cardActions}>
        <button
          className="btn btn-icon"
          style={styles.iconButton}
          disabled={busy}
          onClick={() => onDuplicate(shift)}
          title="Dupliquer ce shift"
        >
          <Copy size={12} strokeWidth={2} />
        </button>
        <button
          className="btn btn-icon"
          style={styles.iconButton}
          disabled={busy}
          onClick={() => onDelete(shift.id)}
          title="Supprimer ce shift"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: 'relative',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    border: `1px solid ${colors.border}`,
  },
  dragHandle: { touchAction: 'none', paddingRight: spacing.lg },
  time: { fontSize: typography.sizes.sm, fontWeight: 700, color: colors.textPrimary, display: 'block' },
  role: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  assignments: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  assignChip: {
    fontSize: typography.sizes.xs,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    padding: '2px 8px',
    color: colors.textPrimary,
  },
  emptyAssign: { fontSize: typography.sizes.xs, color: colors.textSecondary, fontStyle: 'italic' },
  assignSelect: {
    marginTop: spacing.xs,
    width: '100%',
    fontSize: typography.sizes.xs,
    padding: 4,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
  },
  cardActions: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    display: 'flex',
    gap: 2,
  },
  iconButton: {
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderRadius: radius.full,
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
    fontSize: typography.sizes.xs,
  },
};
