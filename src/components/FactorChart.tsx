import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Circle } from 'react-native-svg';

import { COLORS, withAlpha } from '../utils/theme';

export interface FactorChartProps {
  /** 0–1 factor values, one per hour across the day. */
  values: number[];
  /** Index range to highlight — the window this reason belongs to. */
  highlightFrom: number;
  highlightTo: number;
  /** Index of the peak, marked with a dot. */
  peakIndex: number;
  accent: string;
  width: number;
  height?: number;
  accessibilityLabel?: string;
}

/**
 * How a factor moves across the day, with the fishing window marked.
 *
 * The y axis is deliberately fixed to 0–1 rather than scaled to the data: a
 * flat-but-excellent factor must look flat and high, not be stretched to fill
 * the box and suggest variation that is not there.
 */
export function FactorChart({
  values,
  highlightFrom,
  highlightTo,
  peakIndex,
  accent,
  width,
  height = 96,
  accessibilityLabel,
}: FactorChartProps) {
  const padding = 6;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const x = (index: number) =>
    padding + (values.length <= 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth);
  const y = (value: number) => padding + (1 - Math.max(0, Math.min(1, value))) * innerHeight;

  const { line, area } = useMemo(() => {
    if (values.length === 0) return { line: '', area: '' };
    const points = values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`);
    const linePath = `M${points.join(' L')}`;
    const areaPath = `${linePath} L${x(values.length - 1).toFixed(1)},${(height - padding).toFixed(
      1
    )} L${x(0).toFixed(1)},${(height - padding).toFixed(1)} Z`;
    return { line: linePath, area: areaPath };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, width, height]);

  if (values.length === 0) return <View style={{ width, height }} />;

  const bandLeft = x(Math.max(0, highlightFrom));
  const bandRight = x(Math.min(values.length - 1, highlightTo));

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="factorArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={0.22} />
            <Stop offset="1" stopColor={accent} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* The window, behind everything else. */}
        <Rect
          x={bandLeft}
          y={padding}
          width={Math.max(2, bandRight - bandLeft)}
          height={innerHeight}
          fill={withAlpha(accent, 0.14)}
          rx={4}
        />

        <Path d={area} fill="url(#factorArea)" />
        <Path d={line} stroke={accent} strokeWidth={2} fill="none" strokeLinejoin="round" />

        {/* Baseline, so a value of 0 is visibly at the floor. */}
        <Path
          d={`M${padding},${height - padding} L${width - padding},${height - padding}`}
          stroke={COLORS.track}
          strokeWidth={1}
        />

        <Circle cx={x(peakIndex)} cy={y(values[peakIndex] ?? 0)} r={3.5} fill={accent} />
      </Svg>
    </View>
  );
}
