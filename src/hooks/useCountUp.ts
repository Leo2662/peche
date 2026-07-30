import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

export interface CountUp {
  /** Integer value to render, ticking towards the target. */
  displayValue: number;
  /** 0 → 1 driver, shared with the progress ring so both land together. */
  progress: Animated.Value;
  /** Value the current tween started from. */
  from: number;
  /** Value the current tween is heading to. */
  to: number;
}

const INTRO_DURATION = 1400;
const UPDATE_DURATION = 600;

/**
 * Drives the opening animation: the score counts up from 0 while the ring
 * sweeps round, both on the same eased curve.
 *
 * `strokeDashoffset` is not supported by the native driver, so this runs on the
 * JS driver — a single eased tween is cheap enough for that.
 */
export function useCountUp(target: number | null): CountUp {
  const progress = useRef(new Animated.Value(0)).current;
  const previousTarget = useRef<number | null>(null);

  const [displayValue, setDisplayValue] = useState(0);
  const [span, setSpan] = useState({ from: 0, to: 0 });

  useEffect(() => {
    if (target === null) return;

    const previous = previousTarget.current;
    if (previous === target) return;

    // First reveal counts from zero; later refreshes tween from the old score
    // so a routine 30-minute update does not replay the whole intro.
    const from = previous ?? 0;
    const isIntro = previous === null;
    previousTarget.current = target;

    setSpan({ from, to: target });
    setDisplayValue(from);
    progress.setValue(0);

    const listener = progress.addListener(({ value }) => {
      setDisplayValue(Math.round(from + (target - from) * value));
    });

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: isIntro ? INTRO_DURATION : UPDATE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) setDisplayValue(target);
    });

    return () => {
      animation.stop();
      progress.removeListener(listener);
    };
  }, [target, progress]);

  return { displayValue, progress, from: span.from, to: span.to };
}
