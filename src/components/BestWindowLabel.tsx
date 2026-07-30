import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BestWindow } from '../types';
import { formatTime, relativeDayLabel } from '../utils/time';
import { COLORS, TYPE } from '../utils/theme';

export interface BestWindowLabelProps {
  window: BestWindow | null;
  timeZone: string;
  now: number;
}

/**
 * The one piece of information worth showing under the score: when to go.
 */
export function BestWindowLabel({ window, timeZone, now }: BestWindowLabelProps) {
  if (!window) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>BEST WINDOW</Text>
        <Text style={styles.empty}>No good window today</Text>
      </View>
    );
  }

  const day = relativeDayLabel(window.start, now, timeZone);
  const start = formatTime(window.start, timeZone);
  const end = formatTime(window.end, timeZone);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>BEST WINDOW{day === 'today' ? '' : ` · ${day.toUpperCase()}`}</Text>
      <Text
        style={styles.value}
        allowFontScaling={false}
        accessibilityLabel={`Best window from ${start} to ${end} ${day}`}
      >
        {start} – {end}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    color: COLORS.textTertiary,
    fontSize: TYPE.label,
    fontWeight: '600',
    letterSpacing: 2.2,
  },
  value: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: TYPE.windowValue,
    fontWeight: '300',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 18,
    fontWeight: '300',
  },
});
