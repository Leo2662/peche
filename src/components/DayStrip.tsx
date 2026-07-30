import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DayForecast } from '../types';
import { accentForScore, COLORS, withAlpha } from '../utils/theme';
import { formatDayPill, formatFullDate } from '../utils/time';

export interface DayStripProps {
  days: DayForecast[];
  selectedKey: string;
  onSelect: (key: string) => void;
  timeZone: string;
  now: number;
}

const PILL_WIDTH = 78;
const PILL_GAP = 8;

/**
 * The date selector.
 *
 * Each day carries a dot coloured by its peak score, so the whole week can be
 * read at a glance without tapping through it — the same two-second promise as
 * the score itself, applied to the week.
 */
export function DayStrip({ days, selectedKey, onSelect, timeZone, now }: DayStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = days.findIndex((day) => day.key === selectedKey);

  // Keep the selection in view when it changes from outside (e.g. a refresh
  // that drops yesterday and shifts every index down by one).
  useEffect(() => {
    if (selectedIndex < 0) return;
    scrollRef.current?.scrollTo({
      x: Math.max(0, (selectedIndex - 1) * (PILL_WIDTH + PILL_GAP)),
      animated: true,
    });
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {days.map((day) => {
        const selected = day.key === selectedKey;
        const dotColor = day.peakScore > 0 ? accentForScore(day.peakScore) : COLORS.textTertiary;

        return (
          <Pressable
            key={day.key}
            onPress={() => onSelect(day.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${formatFullDate(day.start, timeZone)}, best score ${day.peakScore}`}
            style={({ pressed }) => [
              styles.pill,
              selected && { backgroundColor: withAlpha(dotColor, 0.14), borderColor: dotColor },
              pressed && !selected && styles.pillPressed,
            ]}
          >
            <Text
              style={[styles.label, selected && { color: COLORS.text }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {formatDayPill(day.start, now, timeZone)}
            </Text>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: PILL_GAP,
    paddingHorizontal: 24,
  },
  pill: {
    width: PILL_WIDTH,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  pillPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  dot: {
    marginTop: 7,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
