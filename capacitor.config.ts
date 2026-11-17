import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexusnights.app',
  appName: 'NexusNight',
  webDir: 'client/dist',
  server: {
    androidScheme: 'https',
    cleartext: true, // Allows http requests in debug/local environments if needed
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0c', // ink black from NexusNight branding
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#0a0a0c',
      style: 'DARK',
    },
  },
};

export default config;
