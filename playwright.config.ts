import { defineConfig, devices } from '@playwright/test';

// Release acceptance must exercise the production build, not the dev server:
// set YULIANG_E2E_SERVER=preview to boot `vite preview` for the dist that is
// about to ship. Local runs keep the dev server on the default port.
const previewServer = process.env.YULIANG_E2E_SERVER === 'preview';
const devAppPath = '/';
// Keep in sync with the GitHub Pages project base in vite.config.ts.
const previewAppPath = '/yuliang-life-sim/';
const appPath = previewServer ? previewAppPath : devAppPath;
const port = previewServer ? 4174 : 4173;

/** Path the app is served under in the current mode; specs assert it after goto. */
export const e2eAppPath = appPath;

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: `http://127.0.0.1:${port}${appPath}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: 'chrome',
  },
  webServer: previewServer
    ? {
        command: 'npm run preview -- --host 127.0.0.1 --port 4174',
        url: `http://127.0.0.1:4174${previewAppPath}`,
        reuseExistingServer: false,
      }
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
      },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
