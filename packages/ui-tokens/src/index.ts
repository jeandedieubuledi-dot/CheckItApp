// Design tokens partagés entre checkin-mobile, checkin-pos et web-manager,
// pour garder une cohérence visuelle malgré des stacks UI différentes
// (React Native vs React web).

// Palette indigo/violet — plus de caractère qu'un bleu générique, cohérente
// avec les tons "slate" pour le texte/fond (référence Tailwind/shadcn).
export const colors = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryTint: '#EEF2FF', // fond léger pour zones actives/survolées (drop targets, sélection)
  accent: '#9333EA', // second point du dégradé (voir gradients ci-dessous)
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
};

// Format CSS (web uniquement) — dégradé de marque, utilisé avec parcimonie
// (logo, CTA principal, accents) pour ne pas surcharger l'interface.
export const gradients = {
  brand: 'linear-gradient(135deg, #4F46E5 0%, #9333EA 100%)',
  brandHover: 'linear-gradient(135deg, #4338CA 0%, #7E22CE 100%)',
};

// Format CSS (web uniquement — React Native ignore ces propriétés).
export const shadows = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0 4px 12px rgba(16, 24, 40, 0.08)',
  lg: '0 16px 32px rgba(16, 24, 40, 0.14)',
};

// Équivalent React Native (checkin-mobile, checkin-pos) — shadowColor/Offset/
// Opacity/Radius pour iOS, elevation pour Android, dans un seul objet
// directement spreadable dans un style RN.
export const nativeShadow = {
  sm: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
};

export const typography = {
  fontFamily: 'System', // React Native — nécessiterait expo-font pour du custom
  // Web (web-manager) uniquement — chargées via Google Fonts dans index.html.
  // Sora pour les titres (plus de caractère), Inter pour le texte courant.
  fontFamilyDisplay: "'Sora', 'Segoe UI', system-ui, sans-serif",
  fontFamilyBody: "'Inter', 'Segoe UI', system-ui, sans-serif",
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28,
    '2xl': 36,
  },
};
