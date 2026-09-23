import { shiftPalette } from '@horaires/ui-tokens';

// Couleur pastel stable pour un shift donné (même id -> toujours la même
// couleur, y compris après un refresh) — simple hash déterministe, pas de
// notion cryptographique ici.
export function getShiftPalette(shiftId: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < shiftId.length; i++) {
    hash = (hash * 31 + shiftId.charCodeAt(i)) | 0;
  }
  return shiftPalette[Math.abs(hash) % shiftPalette.length];
}
