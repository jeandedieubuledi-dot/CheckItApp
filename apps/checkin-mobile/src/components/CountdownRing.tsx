import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  strokeWidth?: number;
  durationMs?: number;
  color: string;
  trackColor: string;
  // Appelé côté JS à chaque fois que l'anneau termine un cycle (se vide
  // complètement) — sert à déclencher le rafraîchissement du QR au même
  // rythme que l'anneau, sans coupler les deux animations entre elles.
  onCycleComplete?: () => void;
  children?: React.ReactNode;
};

// Anneau de progression circulaire — se vide en `durationMs` (30s par
// défaut) puis se réinitialise instantanément, en boucle. react-native-svg
// + Reanimated (pas Skia : Skia nécessite un dev client, pas compatible
// Expo Go — voir handover).
export function CountdownRing({
  size = 224,
  strokeWidth = 8,
  durationMs = 30000,
  color,
  trackColor,
  onCycleComplete,
  children,
}: Props) {
  const progress = useSharedValue(0);
  const center = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    const handleComplete = (finished?: boolean) => {
      'worklet';
      if (finished && onCycleComplete) {
        runOnJS(onCycleComplete)();
      }
    };
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.linear }, handleComplete),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * progress.value,
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
