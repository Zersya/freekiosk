import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNavigatorFactory,
  useNavigationBuilder,
} from '@react-navigation/core';
import { StackRouter } from '@react-navigation/routers';

import KioskScreen from '../screens/KioskScreen';
import PinScreen from '../screens/PinScreen';
import { SettingsScreen } from '../screens/settings';
import BlockingOverlaysScreen from '../screens/settings/BlockingOverlaysScreen';
import InstallerScreen from '../screens/InstallerScreen';

import type { RootStackParamList } from './AppNavigator';

export type { RootStackParamList };

const StackView: React.FC<{
  id?: string;
  initialRouteName?: keyof RootStackParamList;
  children: React.ReactNode;
  screenOptions?: Record<string, unknown>;
}> = ({ id, initialRouteName, children, screenOptions }) => {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(
    StackRouter,
    {
      id,
      initialRouteName: initialRouteName as string | undefined,
      children,
      screenOptions,
    } as never,
  );

  return (
    <NavigationContent>
      <View style={StyleSheet.absoluteFill}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          return (
            <View
              key={route.key}
              style={[
                StyleSheet.absoluteFill,
                { pointerEvents: index === state.index ? 'auto' : 'none' },
              ]}
            >
              {descriptor.render()}
            </View>
          );
        })}
      </View>
    </NavigationContent>
  );
};

const createStackNavigator = createNavigatorFactory(StackView);

const Stack = createStackNavigator();

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Kiosk"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen
          name="Kiosk"
          component={KioskScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Pin"
          component={PinScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="BlockingOverlays"
          component={BlockingOverlaysScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Installer"
          component={InstallerScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
