/**
 * Every user-facing string in the app, in one place.
 *
 * The app ships in French only — this is not an i18n framework and there is no
 * locale detection. It exists so the copy can be read and changed as a whole
 * rather than hunted through the components, and so adding a second language
 * later means adding a sibling object, not touching the UI.
 */

export const LOCALE = 'fr-FR';

export const STRINGS = {
  verdict: {
    EXCELLENT: 'CONDITIONS EXCELLENTES',
    GOOD: 'BONNES CONDITIONS',
    AVERAGE: 'CONDITIONS MOYENNES',
    POOR: 'MAUVAISES CONDITIONS',
  },

  score: {
    /** Shown in the ring before the first fetch lands. */
    loading: 'LECTURE DES CONDITIONS',
    /** Caption under the verdict: what the number refers to. */
    captionNow: 'MAINTENANT',
    captionDayPeak: 'MEILLEUR DE LA JOURNÉE',
    a11yLoading: 'Score en cours de chargement',
    a11yScore: (score: number) => `Score bar ${score} sur 100`,
  },

  windows: {
    headingOne: 'MEILLEUR CRÉNEAU',
    headingMany: 'MEILLEURS CRÉNEAUX',
    emptyToday: 'Plus rien aujourd’hui',
    empty: 'Aucun créneau intéressant',
    a11y: (start: string, end: string, score: number) =>
      `De ${start} à ${end}, score ${score}`,
  },

  days: {
    /** Label for the current day in the date selector. */
    today: 'AUJ.',
    a11y: (date: string, peakScore: number) => `${date}, meilleur score ${peakScore}`,
  },

  footer: {
    offline: 'Hors ligne',
    lastUpdate: (time: string) => `dernière maj ${time}`,
  },

  error: {
    title: 'Aucune donnée',
    retry: 'RÉESSAYER',
    /** Shown when the request never reached the network. */
    network: 'Pas de connexion',
    /**
     * Everything else. Deliberately generic: the underlying exception messages
     * are developer-facing, stay in English, and go to the console instead.
     */
    generic: 'Conditions indisponibles',
  },
} as const;
