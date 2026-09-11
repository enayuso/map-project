/**
 * Shared color tokens — the third of three follow-ups from the engineering
 * audit you asked for ("check on kakao/naver... any area for improvement").
 * The finding this answers: zero dark-mode awareness anywhere (no
 * `useColorScheme`/`Appearance` usage in the whole app), against Naver
 * Map's own real 2026 update adding full dark mode across the entire app
 * (Light/Dark/System/time-based-automatic) — see mobile/README.md for the
 * write-up and sourcing.
 *
 * This only tokenizes the handful of colors actually reused across nearly
 * every panel in this app (card background, primary/secondary text, the
 * divider color, the danger-red accent) — confirmed by grepping every hex
 * literal across App.tsx and src/: #ffffff/#3a3226/#8a8578/#f0ede4 alone
 * account for the large majority of all color usages. Per-feature accent
 * colors (the dive-site teal, the hazard-active pink, etc.) are left as
 * direct hex values in their own components — they're already vivid,
 * intentional brand accents that read fine against either a light or dark
 * card background, and tokenizing every single one would be a much larger
 * refactor for very little visible benefit.
 *
 * Dark palette design: an inverted warm palette (near-black/dark-brown,
 * not a cold neutral gray) to stay consistent with this app's existing
 * beige/brown identity rather than switching to a generic dark theme.
 */
export type ThemeColors = {
  /** Full-screen background (map screens don't use this — the map itself
   * fills the screen — but the ErrorBoundary fallback and any other
   * full-screen state does). */
  background: string;
  /** The white (or dark-mode equivalent) card background every panel —
   * WeatherWidget, MoreMenu, OfflineMapsPanel, etc. — uses. */
  card: string;
  /** Primary text color, and the dark "pill button" background
   * (Directions/Meet Up/Measure, Share log, Try again) — these have
   * always shared one color even in light mode. */
  textPrimary: string;
  /** The color text sits on when it's rendered on a `textPrimary`-colored
   * button background (i.e. button label text). */
  onTextPrimary: string;
  /** Secondary/muted text — subtitles, hints, timestamps. */
  textSecondary: string;
  /** Row/section dividers and subtle secondary backgrounds (close-button
   * circles, unit toggles). */
  divider: string;
  /** A second, slightly stronger divider/border tone some components use
   * alongside `divider`. */
  dividerStrong: string;
  /** Error/destructive text and accents. */
  danger: string;
  /** Informational/link-style accent. */
  accent: string;
};

export const LightColors: ThemeColors = {
  background: '#f0ede4',
  card: '#ffffff',
  textPrimary: '#3a3226',
  onTextPrimary: '#ffffff',
  textSecondary: '#8a8578',
  divider: '#f0ede4',
  dividerStrong: '#e5e1d6',
  danger: '#b3261e',
  accent: '#2b6cb0',
};

export const DarkColors: ThemeColors = {
  background: '#14171a',
  card: '#232025',
  textPrimary: '#f0ede4',
  onTextPrimary: '#14171a',
  textSecondary: '#a39d8c',
  divider: '#3a3630',
  dividerStrong: '#46403a',
  danger: '#ff6b5c',
  accent: '#5b9bd5',
};
