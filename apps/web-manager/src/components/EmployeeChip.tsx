import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { User } from '@horaires/shared-types';
import { DRAG_CURSOR, DRAG_CURSOR_ACTIVE } from '../lib/cursors';

// Glissez une carte employé sur un shift pour l'y assigner.
export function EmployeeChip({ user }: { user: User }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `employee-${user.id}`,
    data: { type: 'employee', userId: user.id },
  });
  const [isPressed, setIsPressed] = useState(false);

  const squeezed = isPressed || isDragging;
  const translate = transform ? CSS.Translate.toString(transform) : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        setIsPressed(true);
        listeners?.onPointerDown?.(e);
      }}
      onPointerUp={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      style={{
        ...styles.chip,
        cursor: squeezed ? DRAG_CURSOR_ACTIVE : DRAG_CURSOR,
        transform: `${translate} scale(${squeezed ? 0.92 : 1})`.trim(),
        transition: isDragging ? undefined : 'transform 0.15s ease',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isDragging ? shadows.lg : shadows.sm,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <span style={styles.avatar}>
        {user.firstName[0]}
        {user.lastName[0]}
      </span>
      <span style={styles.name}>
        {user.firstName} {user.lastName}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.full,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    marginBottom: spacing.xs,
    userSelect: 'none',
    touchAction: 'none',
  },
  avatar: {
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    color: colors.primary,
    fontSize: typography.sizes.xs,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: typography.sizes.sm, color: colors.textPrimary, fontWeight: 500 },
};
