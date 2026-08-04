import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Spot } from '../types';
import type { PlaceSuggestion } from '../api/geocoding';
import { DEFAULT_SPOT, isCalibrated } from '../config/spots';
import { STRINGS } from '../config/strings';
import { usePlaceSearch } from '../hooks/usePlaceSearch';
import { ACCENTS, COLORS, PALETTE, withAlpha } from '../utils/theme';

/**
 * React Native Web renders a TextInput as an `<input>`, which draws the
 * browser's focus ring on top of the hairline underline. Native ignores this.
 */
const WEB_INPUT_RESET =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

export interface SpotPickerProps {
  visible: boolean;
  currentSpot: Spot;
  onSelect: (spot: Spot) => void;
  onClose: () => void;
}

/**
 * Search any place in France and make it the active spot.
 *
 * Deliberately one field and a list — no map, no favourites, no categories.
 * The keyboard is the interface.
 */
export function SpotPicker({ visible, currentSpot, onSelect, onClose }: SpotPickerProps) {
  const insets = useSafeAreaInsets();
  const { query, setQuery, results, searching, error, reset } = usePlaceSearch();

  // Never reopen showing the previous search.
  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const choose = (spot: Spot) => {
    Keyboard.dismiss();
    onSelect(spot);
    onClose();
  };

  const showEmpty =
    !searching && !error && query.trim().length >= 2 && results.length === 0;
  const onDunkerque = currentSpot.id === DEFAULT_SPOT.id;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="fullScreen"
    >
      <View style={[styles.root, { paddingTop: insets.top + 18 }]}>
        <View style={styles.header}>
          <Text style={styles.heading}>{STRINGS.spotPicker.heading}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel={STRINGS.detail.close}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={STRINGS.spotPicker.placeholder}
          placeholderTextColor={COLORS.textTertiary}
          style={[styles.input, WEB_INPUT_RESET]}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={STRINGS.spotPicker.placeholder}
        />

        <View style={styles.currentRow}>
          <Text style={styles.currentLabel} numberOfLines={1}>
            {currentSpot.label}
          </Text>
          {!onDunkerque ? (
            <Pressable
              onPress={() => choose(DEFAULT_SPOT)}
              hitSlop={10}
              accessibilityRole="button"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.resetLabel}>{STRINGS.spotPicker.reset}</Text>
            </Pressable>
          ) : null}
        </View>

        {searching ? <ActivityIndicator style={styles.spinner} color={ACCENTS.neutral} /> : null}
        {error ? <Text style={styles.notice}>{error}</Text> : null}
        {showEmpty ? <Text style={styles.notice}>{STRINGS.spotPicker.empty}</Text> : null}

        <FlatList
          data={results}
          keyExtractor={(item) => item.spot.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }: { item: PlaceSuggestion }) => (
            <Pressable
              onPress={() => choose(item.spot)}
              accessibilityRole="button"
              accessibilityLabel={STRINGS.spotPicker.a11ySelect(item.spot.name, item.context)}
              style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
            >
              <Text style={styles.resultName} numberOfLines={1}>
                {item.spot.name}
              </Text>
              {item.context ? (
                <Text style={styles.resultContext} numberOfLines={1}>
                  {item.context}
                </Text>
              ) : null}
            </Pressable>
          )}
        />

        {!isCalibrated(currentSpot) ? (
          <Text style={[styles.estimated, { paddingBottom: insets.bottom + 14 }]}>
            {STRINGS.spotPicker.estimated}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PALETTE.sheet,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2.6,
  },
  close: {
    color: COLORS.textSecondary,
    fontSize: 18,
  },
  pressed: {
    opacity: 0.5,
  },
  input: {
    marginTop: 22,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(ACCENTS.neutral, 0.5),
  },
  currentRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  currentLabel: {
    flexShrink: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  resetLabel: {
    color: ACCENTS.neutral,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  spinner: {
    marginTop: 26,
  },
  notice: {
    marginTop: 26,
    color: COLORS.textTertiary,
    fontSize: 14,
  },
  result: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  resultPressed: {
    opacity: 0.5,
  },
  resultName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '400',
  },
  resultContext: {
    marginTop: 3,
    color: COLORS.textTertiary,
    fontSize: 12,
  },
  estimated: {
    color: COLORS.textTertiary,
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.8,
  },
});
