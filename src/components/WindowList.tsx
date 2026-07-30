import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BestWindow } from '../types';
import { STRINGS } from '../config/strings';
import { accentForScore, COLORS, TYPE, withAlpha } from '../utils/theme';
import { formatTime } from '../utils/time';

export interface WindowListProps {
  windows: BestWindow[];
  timeZone: string;
  /** True when the selected day is today, which changes the empty-state copy. */
  isToday: boolean;
  /** Tapping a window opens the "why?" sheet. */
  onSelectWindow: (window: BestWindow) => void;
}

/**
 * The fishing windows for the selected day, in chronological order.
 *
 * The best one is rendered large — it is the answer to "when do I go?" — and
 * any others sit beneath it as secondary options.
 */
export function WindowList({ windows, timeZone, isToday, onSelectWindow }: WindowListProps) {
  if (windows.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{STRINGS.windows.headingOne}</Text>
        <Text style={styles.empty}>
          {isToday ? STRINGS.windows.emptyToday : STRINGS.windows.empty}
        </Text>
      </View>
    );
  }

  const bestScore = Math.max(...windows.map((window) => window.peakScore));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {windows.length > 1 ? STRINGS.windows.headingMany : STRINGS.windows.headingOne}
      </Text>

      {windows.map((window) => {
        const isBest = window.peakScore === bestScore;
        const accent = accentForScore(window.peakScore);
        const start = formatTime(window.start, timeZone);
        const end = formatTime(window.end, timeZone);

        return (
          <Pressable
            key={window.start}
            onPress={() => onSelectWindow(window)}
            accessibilityRole="button"
            accessibilityLabel={STRINGS.windows.a11y(start, end, window.peakScore)}
            accessibilityHint={STRINGS.windows.a11yHint}
            style={({ pressed }) => [
              styles.row,
              isBest ? styles.rowBest : styles.rowSecondary,
              pressed && styles.rowPressed,
            ]}
          >
            <Text
              style={[styles.time, isBest ? styles.timeBest : styles.timeSecondary]}
              allowFontScaling={false}
            >
              {start} – {end}
            </Text>
            <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.16) }]}>
              <Text style={[styles.chipText, { color: accent }]} allowFontScaling={false}>
                {window.peakScore}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  label: {
    color: COLORS.textTertiary,
    fontSize: TYPE.label,
    fontWeight: '600',
    letterSpacing: 2.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  rowBest: {
    marginTop: 12,
  },
  rowSecondary: {
    marginTop: 8,
  },
  rowPressed: {
    opacity: 0.55,
  },
  time: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  timeBest: {
    color: COLORS.text,
    fontSize: TYPE.windowValue,
    fontWeight: '300',
  },
  timeSecondary: {
    color: COLORS.textSecondary,
    fontSize: 17,
    fontWeight: '300',
  },
  chip: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 18,
    fontWeight: '300',
  },
});
