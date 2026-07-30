import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { BestWindow, FactorSeries, Reason } from '../types';
import { STRINGS } from '../config/strings';
import { metricsForFactor } from '../scoring/factorMetrics';
import { formatMetric } from '../utils/format';
import { accentForScore, COLORS } from '../utils/theme';
import { formatTime } from '../utils/time';
import { FactorChart } from './FactorChart';

export interface ReasonDetailProps {
  reason: Reason;
  window: BestWindow;
  series: FactorSeries | null;
  timeZone: string;
  onBack: () => void;
}

/** Index of a timestamp inside the hourly series. */
function seriesIndex(series: FactorSeries, time: number): number {
  return Math.round((time - series.start) / series.step);
}

/**
 * One reason, with its numbers and its shape across the day.
 *
 * The headline is the single figure that best explains the factor; anything
 * else sits underneath in small type. The chart says *when* — which is what
 * turns "COURANT" into "the current builds through your window".
 */
export function ReasonDetail({ reason, window, series, timeZone, onBack }: ReasonDetailProps) {
  const { width } = useWindowDimensions();
  const accent = accentForScore(window.peakScore);

  const metrics = window.peak ? metricsForFactor(window.peak, reason.key) : [];
  const [headline, ...rest] = metrics.map((metric) => formatMetric(metric.key, metric.value));

  const values = series?.values[reason.key] ?? [];
  const chartWidth = Math.min(width - 64, 320);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        hitSlop={16}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Text style={styles.backLabel}>‹ {STRINGS.detail.back}</Text>
      </Pressable>

      <Text style={[styles.word, { color: accent }]} allowFontScaling={false}>
        {STRINGS.reasons[reason.kind]}
      </Text>

      {headline ? (
        <View style={styles.headline}>
          <Text style={styles.headlineValue} allowFontScaling={false}>
            {headline.value}
          </Text>
          {headline.unit ? <Text style={styles.headlineUnit}>{headline.unit}</Text> : null}
        </View>
      ) : null}

      {values.length > 0 ? (
        <View style={styles.chart}>
          {/* Naming the curve matters: the headline above is a raw reading
              (0,74 m/s) while the chart plots the 0–1 factor it feeds. */}
          <Text style={styles.chartTitle}>{STRINGS.factors[reason.key]}</Text>
          <FactorChart
            values={values}
            highlightFrom={seriesIndex(series!, window.start)}
            highlightTo={seriesIndex(series!, window.end)}
            peakIndex={seriesIndex(series!, window.peakTime)}
            accent={accent}
            width={chartWidth}
            accessibilityLabel={STRINGS.detail.a11yChart(STRINGS.reasons[reason.kind])}
          />
          <View style={[styles.axis, { width: chartWidth }]}>
            <Text style={styles.axisLabel}>{formatTime(series!.start, timeZone)}</Text>
            <Text style={styles.axisLabel}>{STRINGS.detail.overTheDay}</Text>
            <Text style={styles.axisLabel}>
              {formatTime(series!.start + (values.length - 1) * series!.step, timeZone)}
            </Text>
          </View>
        </View>
      ) : null}

      {rest.length > 0 ? (
        <View style={styles.metrics}>
          {rest.map((metric) => (
            <View key={metric.label} style={styles.metricRow}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue} allowFontScaling={false}>
                {metric.value}
                {metric.unit ? <Text style={styles.metricUnit}> {metric.unit}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backPressed: {
    opacity: 0.5,
  },
  backLabel: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
  },
  word: {
    marginTop: 26,
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 3,
  },
  headline: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  headlineValue: {
    color: COLORS.text,
    fontSize: 52,
    fontWeight: '200',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  headlineUnit: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '400',
    paddingBottom: 10,
  },
  chart: {
    marginTop: 30,
    alignItems: 'center',
  },
  chartTitle: {
    marginBottom: 10,
    color: COLORS.textTertiary,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.8,
  },
  axis: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    color: COLORS.textTertiary,
    fontSize: 9,
    letterSpacing: 1.4,
    fontVariant: ['tabular-nums'],
  },
  metrics: {
    marginTop: 30,
    alignSelf: 'stretch',
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.6,
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
});
