import { Platform } from 'react-native';

/**
 * Design tokens.
 *
 * One palette, referenced everywhere. The glass look only holds together if the
 * translucency, blur radius and border colour are the same on every surface —
 * a card at 0.08 opacity next to one at 0.14 reads as a rendering bug rather
 * than a design.
 */

export const colors = {
  // The gradient the glass floats over. Glass with nothing behind it is just a
  // grey box, so this background is load-bearing, not decoration.
  bgTop: '#0B1020',
  bgMid: '#141B3A',
  bgBottom: '#1B1035',

  // Accent gradient, used on primary buttons and progress.
  accentFrom: '#6D8BFF',
  accentTo: '#A66BFF',
  accentSoft: 'rgba(109, 139, 255, 0.18)',

  success: '#34D399',
  warning: '#FBBF24',
  danger: '#FB7185',

  text: '#F4F6FF',
  textMuted: 'rgba(244, 246, 255, 0.66)',
  textFaint: 'rgba(244, 246, 255, 0.40)',

  // Glass surfaces.
  glass: 'rgba(255, 255, 255, 0.08)',
  glassStrong: 'rgba(255, 255, 255, 0.14)',
  glassBorder: 'rgba(255, 255, 255, 0.18)',
  glassHighlight: 'rgba(255, 255, 255, 0.30)',

  overlay: 'rgba(6, 9, 20, 0.72)',
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 44 };

export const typography = {
  // System fonts, on purpose. A bundled font adds ~400kB per weight to the APK
  // and is the single most common cause of a blank first frame on slow Android
  // devices, which is a bad trade for a look nobody asked for.
  family: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
  familyMedium: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'system-ui' }),
  h1: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  small: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 11, fontWeight: '500', letterSpacing: 0.4 },
  // Codes and OTP boxes. Proportional digits make a 10-digit code genuinely
  // hard to read back over the phone.
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, monospace' }),
};

/**
 * Shadows.
 *
 * iOS and Android express elevation completely differently, and web wants a
 * CSS string. Getting this wrong shows up as a card with no depth on one
 * platform and a black smear on another.
 */
export const shadow = (level = 'md') => {
  const map = {
    sm: { radius: 8, opacity: 0.18, elevation: 2, y: 2 },
    md: { radius: 18, opacity: 0.26, elevation: 6, y: 6 },
    lg: { radius: 30, opacity: 0.34, elevation: 12, y: 12 },
  };
  const s = map[level] || map.md;

  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: s.y },
      shadowOpacity: s.opacity,
      shadowRadius: s.radius,
    },
    android: { elevation: s.elevation },
    default: { boxShadow: `0 ${s.y}px ${s.radius}px rgba(0,0,0,${s.opacity})` },
  });
};

/** Minimum touch target. 44 is Apple's floor and Google's is 48 — take 48. */
export const TAP = 48;

export const timing = {
  fast: 140,
  base: 240,
  slow: 420,
  /** One full pass of the button shimmer. */
  shimmer: 1900,
};
