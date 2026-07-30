import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BestWindowLabel } from '../components/BestWindowLabel';
import { ErrorState } from '../components/ErrorState';
import { ScoreDial } from '../components/ScoreDial';
import { SpotFooter } from '../components/SpotFooter';
import { DEFAULT_SPOT } from '../config/spots';
import { useFishingScore } from '../hooks/useFishingScore';
import { getVerdict, VERDICT_LABELS } from '../scoring/computeScore';
import { ACCENTS, accentForScore, backgroundGradient } from '../utils/theme';

/**
 * The whole app: one score, one window, one place name.
 *
 * Pull to refresh is the only interaction — no navigation, no menus, nothing
 * between opening the app and knowing whether to go.
 */
export function ScoreScreen() {
  const spot = DEFAULT_SPOT;
  const insets = useSafeAreaInsets();
  const { status, forecast, isStale, error, lastUpdated, refreshing, refresh } =
    useFishingScore(spot);

  const score = forecast?.now.score ?? null;
  const accent = score === null ? ACCENTS.neutral : accentForScore(score);
  const gradient = useMemo(() => backgroundGradient(accent), [accent]);

  const verdict = score === null ? 'READING CONDITIONS' : VERDICT_LABELS[getVerdict(score)];
  const showError = status === 'error' && !forecast;
  const isFirstLoad = status === 'loading' && !forecast;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={gradient} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            // Leave room for the pinned footer.
            paddingBottom: insets.bottom + 96,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
        }
      >
        {showError ? (
          <ErrorState message={error ?? 'Unable to load conditions'} onRetry={refresh} />
        ) : (
          <>
            <ScoreDial score={score} accent={accent} verdict={verdict} />

            <View style={styles.windowBlock}>
              <BestWindowLabel
                window={forecast?.bestWindow ?? null}
                timeZone={spot.timezone}
                now={forecast?.generatedAt ?? Date.now()}
              />
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 26 }]} pointerEvents="none">
        {isFirstLoad ? (
          <ActivityIndicator color={ACCENTS.neutral} />
        ) : (
          <SpotFooter
            label={spot.label}
            timeZone={spot.timezone}
            lastUpdated={lastUpdated}
            isStale={isStale}
            error={error}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#04060A',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    // Keeps the score optically centred: the hero group sits in the middle of
    // the screen, with the spot name pinned separately below.
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  windowBlock: {
    marginTop: 52,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
});
