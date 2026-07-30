/** Time helpers. All internal timestamps are epoch milliseconds (UTC). */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Open-Meteo returns local wall-clock strings ("2026-07-30T19:00") when
 * `timezone` is set. `Date.parse` would read those as the *device's* local
 * time, which is wrong whenever the phone is not in the spot's timezone.
 * We therefore always request `timezone=UTC` and parse explicitly as UTC.
 */
export function parseUtcIso(value: string): number {
  const normalised = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return Date.parse(normalised);
}

/** "19:10" in the given IANA timezone. */
export function formatTime(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(timestamp));
}

/**
 * Calendar day of a timestamp *in the spot's timezone*, as "2026-07-30".
 *
 * Grouping by this key is how the app splits the timeline into days without
 * ever computing a midnight boundary — which would otherwise have to cope with
 * DST transitions and with a phone set to a different timezone than the spot.
 */
export function zonedDayKey(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

/** "today" / "tomorrow" / weekday name, relative to `reference`. */
export function relativeDayLabel(
  timestamp: number,
  reference: number,
  timeZone: string
): 'today' | 'tomorrow' | string {
  const target = zonedDayKey(timestamp, timeZone);
  if (target === zonedDayKey(reference, timeZone)) return 'today';
  if (target === zonedDayKey(reference + DAY, timeZone)) return 'tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(new Date(timestamp));
}

/** Compact label for the day selector: "TODAY", "THU 31", "FRI 1". */
export function formatDayPill(timestamp: number, reference: number, timeZone: string): string {
  if (zonedDayKey(timestamp, timeZone) === zonedDayKey(reference, timeZone)) return 'TODAY';

  const date = new Date(timestamp);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(date);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric' }).format(date);
  return `${weekday.toUpperCase()} ${day}`;
}

/** "Thursday 31 July", for the accessible label on a day pill. */
export function formatFullDate(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(timestamp));
}

/** Round a timestamp down to the nearest `step` milliseconds. */
export function floorTo(timestamp: number, step: number): number {
  return Math.floor(timestamp / step) * step;
}
