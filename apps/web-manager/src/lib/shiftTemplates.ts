// Modèles de shift réutilisables ("16h-20h", "10h-18h") : un concept purement
// local à web-manager, jamais envoyé au backend tel quel — le `Shift` Prisma
// exige une date (voir CLAUDE.md). Un modèle ne devient un vrai shift qu'au
// moment où on le glisse sur une cellule de la grille (PlanningPage.placeTemplate),
// qui lui donne sa date. Persisté en local pour survivre à un rechargement,
// partagé entre sites : rien n'oblige un modèle d'horaire à un seul site.
export type ShiftTemplate = {
  id: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  roleNeeded?: string;
};

const STORAGE_KEY = 'horaires:shift-templates';

export function loadShiftTemplates(): ShiftTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveShiftTemplates(templates: ShiftTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Stockage plein ou bloqué (navigation privée) — les modèles restent
    // utilisables pour la session en cours, juste pas persistés.
  }
}
