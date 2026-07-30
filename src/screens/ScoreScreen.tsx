import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayStrip } from '../components/DayStrip';
import { ErrorState } from '../components/ErrorState';
import { ScoreDial } from '../components/ScoreDial';
import { SpotFooter } from '../components/SpotFooter';
import { WindowList } from '../components/WindowList';
import { DEFAULT_SPOT } from '../config/spots';
import { STRINGS } from '../config/strings';
import { useFishingScore } from '../hooks/useFishingScore';
import { useSelectedDay } from '../hooks/useSelectedDay';
import { getVerdict, VERDICT_LABELS } from '../scoring/computeScore';
import { ACCENTS, accentForScore, backgroundGradient } from '../utils/theme';

/**
 * The whole app: pick a day, see one score, see when to go.
 *
 * Today is always selected on open, so the original two-second promise is
 * untouched — the date selector is there for planning, not for the common case.
 */
export function ScoreScreen() {
  const spot = DEFAULT_SPOT;
  const insets = useSafeAreaInsets();
  const { status, forecast, isStale, error, lastUpdated, refreshing, refresh } =
    useFishingScore(spot);

  const days = forecast?.days ?? [];
  const { selectedKey, selectedDay, selectDay, isFirstDay } = useSelectedDay(days);

  // Today shows the score right now — "should I go?". Any other day has no
  // "now", so it shows the best the day will reach.
  const showingNow = isFirstDay && forecast !== null;
  const score = showingNow ? (forecast?.now.score ?? null) : (selectedDay?.peakScore ?? null);

  const accent = score === null ? ACCENTS.neutral : accentForScore(score);
  const gradient = useMemo(() => backgroundGradient(accent), [accent]);

  const verdict = score === null ? STRINGS.score.loading : VERDICT_LABELS[getVerdict(score)];
  const caption =
    score === null
      ? undefined
      : showingNow
        ? STRINGS.score.captionNow
        : STRINGS.score.captionDayPeak;

  const showError = status === 'error' && !forecast;
  const isFirstLoad = status === 'loading' && !forecast;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={gradient} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      {days.length > 1 && selectedKey ? (
        <View style={[styles.strip, { paddingTop: insets.top + 10 }]}>
          <DayStrip
            days={days}
            selectedKey={selectedKey}
            onSelect={selectDay}
            timeZone={spot.timezone}
            now={forecast?.generatedAt ?? Date.now()}
          />
        </View>
      ) : (
        <View style={{ paddingTop: insets.top + 10 }} />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 92 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
        }
      >
        {showError ? (
          <ErrorState message={error ?? STRINGS.error.generic} onRetry={refresh} />
        ) : (
          <>
            <ScoreDial score={score} accent={accent} verdict={verdict} caption={caption} />

            <View style={styles.windowBlock}>
              <WindowList
                windows={selectedDay?.windows ?? []}
                timeZone={spot.timezone}
                isToday={isFirstDay}
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
  strip: {
    paddingBottom: 4,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  windowBlock: {
    marginTop: 40,
    alignSelf: 'stretch',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
});
