import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'io.github.rareluoyezhiqiu.inspiration',
  appName: '灵感清单',
  loggingBehavior: 'none',
  webDir: 'dist',
  server: { hostname: 'localhost', androidScheme: 'https' },
  android: { minWebViewVersion: 107, allowMixedContent: false, webContentsDebuggingEnabled: false },
};
export default config;
