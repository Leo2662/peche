import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STRINGS } from '../config/strings';
import { COLORS, TYPE } from '../utils/theme';
import { formatTime } from '../utils/time';

export interface SpotFooterProps {
  label: string;
  timeZone: string;
  lastUpdated: number | null;
  isStale: boolean;
  error: string | null;
  /** Tapping the place name opens the spot picker. */
  onPress: () => void;
}

/**
 * Spot name, plus the smallest possible honesty about data freshness.
 * Nothing here should compete with the score for attention.
 */
export function SpotFooter({
  label,
  timeZone,
  lastUpdated,
  isStale,
  error,
  onPress,
}: SpotFooterProps) {
  const status = (() => {
    if (!isStale) return null;
    const stamp = lastUpdated ? formatTime(lastUpdated, timeZone) : null;
    const reason = error ?? STRINGS.footer.offline;
    return stamp ? `${reason} · ${STRINGS.footer.lastUpdate(stamp)}` : reason;
  })();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={STRINGS.footer.a11yHint}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={styles.spot}>{label}</Text>
      </Pressable>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
  spot: {
    color: COLORS.textSecondary,
    fontSize: TYPE.footer,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  status: {
    marginTop: 6,
    color: COLORS.textTertiary,
    fontSize: 11,
    letterSpacing: 0.6,
  },
});
