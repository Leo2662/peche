import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BestWindow } from '../types';
import { STRINGS } from '../config/strings';
import { accentForScore, COLORS } from '../utils/theme';
import { formatTime } from '../utils/time';

export interface WindowDetailSheetProps {
  window: BestWindow | null;
  timeZone: string;
  onClose: () => void;
}

/**
 * Why this window is the one.
 *
 * One word per reason, strongest first, and nothing else — no numbers, no
 * units, no bars. A strength indicator was tried and cut: every reason that
 * clears the bar to be listed sits near 1.0, so the bars were all the same
 * length and only added weight to the screen.
 *
 * Tapping anywhere dismisses it.
 */
export function WindowDetailSheet({ window, timeZone, onClose }: WindowDetailSheetProps) {
  const accent = window ? accentForScore(window.peakScore) : COLORS.text;

  return (
    <Modal
      visible={window !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={STRINGS.detail.close}
      >
        {window ? (
          <View style={styles.card}>
            <Text style={styles.heading}>{STRINGS.detail.heading}</Text>

            <Text style={styles.time} allowFontScaling={false}>
              {formatTime(window.start, timeZone)} – {formatTime(window.end, timeZone)}
            </Text>

            <View style={styles.reasons}>
              {window.reasons.map((reason) => (
                <View key={reason.kind} style={styles.reasonRow}>
                  <View style={[styles.dot, { backgroundColor: accent }]} />
                  <Text style={styles.word} numberOfLines={1} allowFontScaling={false}>
                    {STRINGS.reasons[reason.kind]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // Fully opaque. Translucency was tried at 0.86 and 0.975 and both left the
    // ring and the window times ghosting behind the words — on a screen whose
    // whole point is one word per line, that is noise.
    backgroundColor: '#04060A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    alignItems: 'center',
  },
  heading: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2.6,
  },
  time: {
    marginTop: 12,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  reasons: {
    marginTop: 44,
    gap: 22,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  word: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '400',
    letterSpacing: 3,
  },
});
