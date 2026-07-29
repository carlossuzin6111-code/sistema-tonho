import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.fitlifesync.app',
  appName: 'FitLife Sync',
  webDir: 'frontend',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
};

export default config;
