import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import Svg, {Circle, Path, Rect} from 'react-native-svg';

import {colors} from '../app/theme';
import {CameraSettingsScreen} from '../screens/CameraSettingsScreen';
import {CloudProvidersScreen} from '../screens/CloudProvidersScreen';
import {DashboardScreen} from '../screens/DashboardScreen';
import {DiagnosticsScreen} from '../screens/DiagnosticsScreen';
import {LibraryScreen} from '../screens/LibraryScreen';
import {PlaybackScreen} from '../screens/PlaybackScreen';
import {PrivacySettingsScreen} from '../screens/PrivacySettingsScreen';
import {RecordingScreen} from '../screens/RecordingScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {StorageScreen} from '../screens/StorageScreen';
import {TripsScreen} from '../screens/TripsScreen';
import type {RootStackParamList, TabParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const tabLabels: Record<keyof TabParamList, string> = {
  Home: 'Home',
  Record: 'Record',
  Videos: 'Videos',
  Trips: 'Trips',
  Settings: 'Settings',
};

function renderTabIcon(routeName: keyof TabParamList, color: string, size: number) {
  const iconProps = {
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
  };

  switch (routeName) {
    case 'Home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...iconProps} d="m3 10 9-7 9 7" />
          <Path {...iconProps} d="M5 9v12h14V9M9 21v-7h6v7" />
        </Svg>
      );
    case 'Record':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle {...iconProps} cx="12" cy="12" r="9" />
          <Circle {...iconProps} cx="12" cy="12" r="3" />
        </Svg>
      );
    case 'Videos':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect {...iconProps} x="3" y="5" width="18" height="14" rx="2" />
          <Path {...iconProps} d="m10 9 5 3-5 3z" />
        </Svg>
      );
    case 'Trips':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...iconProps} d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
          <Path {...iconProps} d="M9 3v15m6-12v15" />
          <Circle {...iconProps} cx="15" cy="9" r="2" />
          <Path {...iconProps} d="m13.5 10.5-2 2.5" />
        </Svg>
      );
    case 'Settings':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle {...iconProps} cx="12" cy="12" r="3" />
          <Path
            {...iconProps}
            d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4L5.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1L9 7.4h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2z"
          />
        </Svg>
      );
  }
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarIcon: ({color, size}) => renderTabIcon(route.name, color, size),
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {fontSize: 10, fontWeight: '600'},
        tabBarAccessibilityLabel: tabLabels[route.name],
      })}>
      <Tabs.Screen name="Home" component={DashboardScreen} />
      <Tabs.Screen name="Record" component={RecordingScreen} />
      <Tabs.Screen name="Videos" component={LibraryScreen} />
      <Tabs.Screen name="Trips" component={TripsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {backgroundColor: colors.background},
          headerTintColor: colors.text,
          headerTitleStyle: {fontWeight: '700'},
          contentStyle: {backgroundColor: colors.background},
          headerShadowVisible: false,
        }}>
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{headerShown: false}}
        />
        <Stack.Screen name="VideoPlayback" component={PlaybackScreen} options={{title: 'Clip'}} />
        <Stack.Screen name="StorageManager" component={StorageScreen} options={{title: 'Storage'}} />
        <Stack.Screen name="CloudProviders" component={CloudProvidersScreen} options={{title: 'Backups'}} />
        <Stack.Screen name="CameraSettings" component={CameraSettingsScreen} options={{title: 'Camera'}} />
        <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} options={{title: 'Privacy'}} />
        <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} options={{title: 'Diagnostics'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
