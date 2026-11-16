import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: { baseURL:'http://127.0.0.1:4183', browserName:'chromium', screenshot:'only-on-failure', trace:'on' },
  webServer: { command:'npm run preview -- --port 4183', url:'http://127.0.0.1:4183', reuseExistingServer:false },
  reporter:'list',
});
