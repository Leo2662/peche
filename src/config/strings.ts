/**
 * Every user-facing string in the app, in one place.
 *
 * The app ships in French only — this is not an i18n framework and there is no
 * locale detection. It exists so the copy can be read and changed as a whole
 * rather than hunted through the components, and so adding a second language
 * later means adding a sibling object, not touching the UI.
 */

import type { FactorKey, ReasonKind } from '../types';

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
    a11yHint: 'Toucher pour voir pourquoi',
  },

  /**
   * One word per reason — the whole point of the detail sheet. If a label here
   * ever needs two words, the reason is not specific enough.
   *
   * The vocabulary is deliberately the one an angler uses on the dyke: vive-eau
   * rather than "grand coefficient", jusant rather than "marée descendante".
   */
  reasons: {
    flood: 'MONTANTE',
    slackHigh: 'PLEINE MER',
    ebb: 'JUSANT',

    current: 'COURANT',
    springTide: 'VIVE-EAU',
    tidalRange: 'MARNAGE',

    windW: 'OUEST',
    windNW: 'NORD-OUEST',
    windSW: 'SUD-OUEST',
    windN: 'NORD',
    breeze: 'BRISE',

    swell: 'HOULE',

    dawn: 'AUBE',
    dusk: 'CRÉPUSCULE',
    night: 'NUIT',
    overcast: 'COUVERT',

    waterTemperature: 'TEMPÉRATURE',
    stablePressure: 'STABLE',
    // `satisfies` makes the compiler, not a test, guarantee that every reason
    // the engine can emit has a word here.
  } satisfies Record<ReasonKind, string>,

  detail: {
    heading: 'POURQUOI',
    close: 'Fermer',
    back: 'RETOUR',
    /** Axis caption under the sparkline. */
    overTheDay: 'SUR LA JOURNÉE',
    a11yReasonHint: 'Toucher pour voir les mesures',
    a11yChart: (label: string) => `Courbe de ${label.toLowerCase()} sur la journée`,
  },

  /**
   * Factor names, shown above the sparkline.
   *
   * The chart plots the *factor*, not the headline reading — tapping COURANT
   * shows 0,74 m/s but a curve of biological activity. Naming the curve is what
   * keeps that honest.
   */
  factors: {
    biologicalActivity: 'ACTIVITÉ BIOLOGIQUE',
    tideWindow: 'FENÊTRE DE MARÉE',
    wind: 'VENT',
    waves: 'VAGUES',
    light: 'LUMIÈRE',
    waterTemperature: 'TEMPÉRATURE DE L’EAU',
    pressure: 'PRESSION',
  } satisfies Record<FactorKey, string>,

  /** Labels for the measured quantities behind each factor. */
  metrics: {
    currentVelocity: 'COURANT',
    tideCoefficient: 'COEFFICIENT',
    tidalRange: 'MARNAGE',
    hoursFromHighTide: 'PLEINE MER',
    beforeHighTide: 'avant',
    afterHighTide: 'après',
    windSpeed: 'VENT',
    windGusts: 'RAFALES',
    windDirection: 'DIRECTION',
    waveHeight: 'HAUTEUR',
    wavePeriod: 'PÉRIODE',
    cloudCover: 'NUAGES',
    hoursToTwilight: 'ÉCART AU CRÉPUSCULE',
    seaTemperature: 'EAU',
    pressureTrend6h: 'TENDANCE',
  },

  days: {
    /** Label for the current day in the date selector. */
    today: 'AUJ.',
    a11y: (date: string, peakScore: number) => `${date}, meilleur score ${peakScore}`,
  },

  footer: {
    offline: 'Hors ligne',
    lastUpdate: (time: string) => `dernière maj ${time}`,
    a11yHint: 'Toucher pour changer de lieu',
  },

  spotPicker: {
    heading: 'LIEU',
    placeholder: 'Chercher un spot en France',
    /** Only coastal towns are offered, so "not found" needs explaining. */
    empty: 'Aucun spot côtier trouvé',
    emptyHint: 'Seules les communes du littoral sont proposées.',
    error: 'Recherche indisponible',
    /** Distance to the shore, shown next to each result. */
    distance: (km: number) => (km < 1 ? 'bord de mer' : `${Math.round(km)} km du littoral`),
    /** Shown under a spot the scoring is not tuned for. */
    estimated: 'Réglages estimés pour ce lieu',
    reset: 'Revenir à Dunkerque',
    a11ySelect: (name: string, context: string) =>
      context ? `${name}, ${context}` : name,
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
    /** The spot is coastal but the marine model does not reach it. */
    noMarineData: 'Pas de données marines ici',
  },
} as const;
