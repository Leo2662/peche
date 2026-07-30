import type { MetricKey } from '../scoring/factorMetrics';
import { LOCALE, STRINGS } from '../config/strings';

export interface FormattedMetric {
  /** Short uppercase label, e.g. "COURANT". */
  label: string;
  /** The number as text, e.g. "0,82". */
  value: string;
  /** Unit or qualifier, e.g. "m/s" or "avant PM". Empty when there is none. */
  unit: string;
}

function decimal(value: number, digits: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** "1 h 12" from 1.2 hours. Minutes only below the hour. */
function duration(hours: number): string {
  const total = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Meteorological bearing → French compass point ("SO", "NO"). */
export function compassPoint(degrees: number): string {
  const normalised = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(normalised / 45) % 8];
}

/**
 * A raw measurement rendered for the detail view.
 *
 * Kept out of the scoring engine on purpose: the engine reports numbers, this
 * decides how many decimals and which words go around them.
 */
export function formatMetric(key: MetricKey, value: number): FormattedMetric {
  const labels = STRINGS.metrics;

  switch (key) {
    case 'currentVelocity':
      return { label: labels.currentVelocity, value: decimal(value, 2), unit: 'm/s' };

    case 'tideCoefficient':
      return { label: labels.tideCoefficient, value: String(Math.round(value)), unit: '' };

    case 'tidalRange':
      return { label: labels.tidalRange, value: decimal(value, 1), unit: 'm' };

    case 'hoursFromHighTide':
      return {
        label: labels.hoursFromHighTide,
        value: duration(value),
        // Negative is before high water; the sign would read as a temperature.
        unit: value < 0 ? STRINGS.metrics.beforeHighTide : STRINGS.metrics.afterHighTide,
      };

    case 'windSpeed':
      return { label: labels.windSpeed, value: String(Math.round(value)), unit: 'km/h' };

    case 'windGusts':
      return { label: labels.windGusts, value: String(Math.round(value)), unit: 'km/h' };

    case 'windDirection':
      return {
        label: labels.windDirection,
        value: compassPoint(value),
        unit: `${Math.round(value)}°`,
      };

    case 'waveHeight':
      return { label: labels.waveHeight, value: decimal(value, 1), unit: 'm' };

    case 'wavePeriod':
      return { label: labels.wavePeriod, value: String(Math.round(value)), unit: 's' };

    case 'cloudCover':
      return { label: labels.cloudCover, value: String(Math.round(value)), unit: '%' };

    case 'hoursToTwilight':
      return { label: labels.hoursToTwilight, value: duration(value), unit: '' };

    case 'seaTemperature':
      return { label: labels.seaTemperature, value: decimal(value, 1), unit: '°C' };

    case 'pressureTrend6h': {
      // The sign is the whole point here — a rising front reads differently
      // from a falling one — so it is kept explicitly.
      const sign = value > 0 ? '+' : value < 0 ? '−' : '';
      return {
        label: labels.pressureTrend6h,
        value: `${sign}${decimal(Math.abs(value), 1)}`,
        unit: 'hPa / 6 h',
      };
    }
  }
}
