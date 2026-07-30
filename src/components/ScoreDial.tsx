import React, { useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useCountUp } from '../hooks/useCountUp';
import { COLORS, TYPE, withAlpha } from '../utils/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ScoreDialProps {
  /** 0–100, or null while the first fetch is in flight. */
  score: number | null;
  accent: string;
  verdict: string;
  /** Tiny line under the verdict saying what the number refers to. */
  caption?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * The hero element: a single number inside a progress ring, with the verdict
 * directly beneath it.
 *
 * Everything else on the screen is deliberately subordinate to this.
 */
export function ScoreDial({
  score,
  accent,
  verdict,
  caption,
  size = 264,
  strokeWidth = 12,
}: ScoreDialProps) {
  const { displayValue, progress, from, to } = useCountUp(score);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const dashOffset = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [circumference * (1 - from / 100), circumference * (1 - to / 100)],
      }),
    [progress, circumference, from, to]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.ring, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="ring" x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={0.72} />
              <Stop offset="1" stopColor={accent} stopOpacity={1} />
            </LinearGradient>
          </Defs>

          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={COLORS.track}
            strokeWidth={strokeWidth}
            fill="none"
          />

          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#ring)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            // Start the sweep at 12 o'clock rather than 3 o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>

        <View style={styles.centre} pointerEvents="none">
          <Text
            style={[styles.score, { textShadowColor: withAlpha(accent, 0.4) }]}
            allowFontScaling={false}
            accessibilityLabel={
              score === null ? 'Score loading' : `Sea bass score ${score} out of 100`
            }
          >
            {score === null ? '––' : displayValue}
          </Text>
        </View>
      </View>

      <Text style={[styles.verdict, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {verdict}
      </Text>

      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    color: COLORS.text,
    fontSize: TYPE.score,
    fontWeight: '200',
    letterSpacing: -4,
    lineHeight: TYPE.score * 1.02,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
    fontVariant: ['tabular-nums'],
  },
  verdict: {
    marginTop: 22,
    fontSize: TYPE.verdict,
    fontWeight: '600',
    letterSpacing: 2.6,
    textAlign: 'center',
  },
  caption: {
    marginTop: 8,
    color: COLORS.textTertiary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
  },
});
