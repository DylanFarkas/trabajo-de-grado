import '@/global.css';
import 'react-native-gesture-handler';

import {
  SNPro_400Regular,
  SNPro_500Medium,
  SNPro_600SemiBold,
  SNPro_700Bold,
  SNPro_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/sn-pro';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth';
import { HomeTabs } from '@/components/HomeTabs';
import { PlaceDetailsScreen } from '@/components/PlaceDetailsScreen';
import { ProfileScreen } from '@/components/ProfileScreen';
import { MapPanelProvider, useMapPanel } from '@/map-panel';

SplashScreen.preventAutoHideAsync();

function AppChrome() {
  const { profileOpen, placeDetails } = useMapPanel();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, animation: "none" }} />
        {placeDetails ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: "#ffffff",
              zIndex: 15,
            }}
          >
            <PlaceDetailsScreen key={placeDetails.code} target={placeDetails} />
          </View>
        ) : null}
        {profileOpen ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: "#ffffff",
              zIndex: 20,
            }}
          >
            <ProfileScreen />
          </View>
        ) : null}
      </View>
      <HomeTabs />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SNPro_400Regular,
    SNPro_500Medium,
    SNPro_600SemiBold,
    SNPro_700Bold,
    SNPro_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <MapPanelProvider>
            <AppChrome />
          </MapPanelProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
