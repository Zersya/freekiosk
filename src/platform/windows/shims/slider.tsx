import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

interface SliderProps {
  value?: number;
  onValueChange?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  style?: StyleProp<ViewStyle>;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  disabled?: boolean;
  testID?: string;
}

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 20;
const CONTAINER_HEIGHT = 40;

const Slider: React.FC<SliderProps> = ({
  value = 0,
  onValueChange,
  onSlidingComplete,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  style,
  minimumTrackTintColor = '#2196F3',
  maximumTrackTintColor = '#BDBDBD',
  thumbTintColor = '#2196F3',
  disabled = false,
  testID,
}) => {
  const [, setTrackWidth] = useState(0);
  const [currentValue, setCurrentValue] = useState(value);
  const trackWidthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const snap = (v: number) => {
    if (step <= 0) return v;
    const snapped = Math.round((v - minimumValue) / step) * step + minimumValue;
    return clamp(snapped, minimumValue, maximumValue);
  };

  const valueToX = (v: number) => {
    if (trackWidthRef.current <= 0) return 0;
    const ratio = (v - minimumValue) / (maximumValue - minimumValue || 1);
    return ratio * trackWidthRef.current;
  };

  const xToValue = (x: number) => {
    if (trackWidthRef.current <= 0) return minimumValue;
    const ratio = clamp(x / trackWidthRef.current, 0, 1);
    const raw = minimumValue + ratio * (maximumValue - minimumValue);
    return snap(raw);
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const v = xToValue(x);
        setCurrentValue(v);
        onValueChange?.(v);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const v = xToValue(x);
        setCurrentValue(v);
        onValueChange?.(v);
      },
      onPanResponderRelease: (e) => {
        const x = e.nativeEvent.locationX;
        const v = xToValue(x);
        setCurrentValue(v);
        onSlidingComplete?.(v);
      },
    }),
  ).current;

  const displayValue = currentValue;
  const thumbX = valueToX(displayValue);
  const fillWidth = thumbX;

  return (
    <View
      testID={testID}
      style={[styles.container, style, disabled && styles.disabled]}
      onLayout={handleLayout}
      {...(disabled ? {} : panResponder.panHandlers)}
    >
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: fillWidth, backgroundColor: minimumTrackTintColor },
          ]}
        />
        <View
          style={[
            styles.maxTrack,
            { backgroundColor: maximumTrackTintColor },
          ]}
        />
      </View>
      <View
        style={[
          styles.thumb,
          {
            left: thumbX - THUMB_SIZE / 2,
            backgroundColor: thumbTintColor,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: CONTAINER_HEIGHT,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
    position: 'relative',
  },
  maxTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: (CONTAINER_HEIGHT - THUMB_SIZE) / 2,
  },
});

export default Slider;
