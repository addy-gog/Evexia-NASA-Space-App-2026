// @ts-check
import { defineConfig, devices } from '@playwright/test';

// The e2e suite runs against the single-host production setup: Express serves the
// built client (client/dist, built by `pretest:e2e`) and /api on one port.
const PORT = 8799;
const GPU = process.env.E2E_GPU ? process.env.E2E_GPU === '1' : process.platform === 'win32';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        // Full Chromium (new headless) can use the real GPU on Windows; elsewhere
        // (e.g. Linux CI without a GPU) WebGL runs on SwiftShader and the app
        // caps its 3D frame rate automatically.
        ...(GPU ? { channel: 'chromium' } : {}),
        launchOptions: {
          args: GPU
            ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
            : ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
        },
      },
    },
  ],
  // Server lifecycle: see e2e/global-setup.js (fresh DB, no API key → offline assistant).
  globalSetup: './e2e/global-setup.js',
});
