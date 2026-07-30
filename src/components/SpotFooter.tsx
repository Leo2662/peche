import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { STRINGS } from '../config/strings';
import { COLORS, TYPE } from '../utils/theme';
import { formatTime } from '../utils/time';

export interface SpotFooterProps {
  label: string;
  timeZone: string;
  lastUpdated: number | null;
  isStale: boolean;
  error: string | null;
}

/**
 * Spot name, plus the smallest possible honesty about data freshness.
 * Nothing here should compete with the score for attention.
 */
export function SpotFooter({ label, timeZone, lastUpdated, isStale, error }: SpotFooterProps) {
  const status = (() => {
    if (!isStale) return null;
    const stamp = lastUpdated ? formatTime(lastUpdated, timeZone) : null;
    const reason = error ?? STRINGS.footer.offline;
    return stamp ? `${reason} · ${STRINGS.footer.lastUpdate(stamp)}` : reason;
  })();

  return (
    <View style={styles.container}>
      <Text style={styles.spot}>{label}</Text>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
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
