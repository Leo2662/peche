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

/** "today" / "tomorrow" / weekday name, relative to `reference`. */
export function relativeDayLabel(
  timestamp: number,
  reference: number,
  timeZone: string
): 'today' | 'tomorrow' | string {
  const dayKey = (t: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(t));

  const target = dayKey(timestamp);
  if (target === dayKey(reference)) return 'today';
  if (target === dayKey(reference + DAY)) return 'tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(new Date(timestamp));
}

/** Round a timestamp down to the nearest `step` milliseconds. */
export function floorTo(timestamp: number, step: number): number {
  return Math.floor(timestamp / step) * step;
}
