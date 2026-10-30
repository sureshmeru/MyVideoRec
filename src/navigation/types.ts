import type {NavigatorScreenParams} from '@react-navigation/native';
import type {CompositeNavigationProp} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Record: undefined;
  Videos: undefined;
  Trips: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  VideoPlayback: {recordingId: string};
  StorageManager: undefined;
  CloudProviders: undefined;
  CameraSettings: undefined;
  PrivacySettings: undefined;
  Diagnostics: undefined;
};

export type AppTabNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;
