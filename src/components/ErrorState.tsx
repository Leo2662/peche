import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STRINGS } from '../config/strings';
import { ACCENTS, COLORS, withAlpha } from '../utils/theme';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

/** Shown only when there is no cached score to fall back on. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{STRINGS.error.title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>{STRINGS.error.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  message: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    marginTop: 28,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(ACCENTS.neutral, 0.6),
  },
  buttonPressed: {
    backgroundColor: withAlpha(ACCENTS.neutral, 0.16),
  },
  buttonLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
});
