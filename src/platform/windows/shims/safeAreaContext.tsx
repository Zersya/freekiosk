import React from 'react';
import { View } from 'react-native';
import type { EdgeInsets, Metrics } from 'react-native-safe-area-context';

export type { EdgeInsets, Metrics };

const zeroInsets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const SafeAreaInsetsContext = React.createContext<EdgeInsets>(zeroInsets);
export const SafeAreaFrameContext = React.createContext<Metrics>({
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: zeroInsets,
});

export const SafeAreaView = React.forwardRef<View, React.ComponentProps<typeof View>>(
  (props, ref) => <View ref={ref} {...props} />,
);

export const SafeAreaProvider = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

export const useSafeAreaInsets = (): EdgeInsets => zeroInsets;
export const useSafeAreaFrame = (): Metrics => ({
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: zeroInsets,
});
export const initialWindowMetrics = null;
