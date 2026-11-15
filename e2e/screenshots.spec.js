// Generates README screenshots into docs/screenshots. Run with: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.js
import { test, expect, logReadings, GREEN } from './fixtures.js';

const DIR = 'docs/screenshots';
test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to regenerate README screenshots');
test.use({ viewport: { width: 1440, height: 1000 } });

async function settleBody(page) {
  await expect(page.getByTestId('body-3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(7000); // camera focus eases in and back out
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="body-container"]');
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 170);
  });
  await page.waitForTimeout(400);
}

async function pushTelemetry(page, hr = 74) {
  const now = Date.now();
  const samples = [];
  for (let i = 30; i >= 0; i -= 1) samples.push({ metric: 'hr', value: hr + Math.round(Math.sin(i / 3) * 3), ts: new Date(now - i * 20_000).toISOString() });
  samples.push({ metric: 'temp', value: 36.8, ts: new Date(now).toISOString() }, { metric: 'sys', value: 119, ts: new Date(now).toISOString() }, { metric: 'dia', value: 77, ts: new Date(now).toISOString() });
  await page.request.post('/api/telemetry', { data: { crewId: 'c1', deviceId: 'polar-h10', deviceName: 'Polar H10 chest strap', samples } });
}

test('dashboard amber and red', async ({ page }) => {
  await logReadings(page, { ...GREEN, hr: 96, sleep: 6.4, sys: 134, dia: 86, radiation: 0.47 }, { notes: 'Morning check. Heavy workload; slept badly.' });
  await settleBody(page);
  await page.screenshot({ path: `${DIR}/dashboard-amber.png` });
  await logReadings(page, { radiation: 3.2, glucose: 131 }, { spe: true, notes: 'SPE alarm: moved to storm shelter.' });
  await settleBody(page);
  await page.screenshot({ path: `${DIR}/dashboard-red.png` });
});

test('log readings', async ({ page }) => {
  await page.goto('/log');
  await page.getByTestId('input-hr').fill('96');
  await page.getByTestId('input-glucose').fill('130');
  await page.getByTestId('input-radiation').fill('0.48');
  await page.getByTestId('input-notes').fill('Fasting, before exercise. Slight headache since waking.');
  await page.screenshot({ path: `${DIR}/log-readings.png` });
});

test('history', async ({ page }) => {
  await page.goto('/history');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/history.png` });
});

test('live telemetry', async ({ page }) => {
  await page.goto('/telemetry');
  await pushTelemetry(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/telemetry.png` });
});

test('alerts on Mars transit', async ({ page }) => {
  await logReadings(page, { ...GREEN, radiation: 0.47, hr: 96, glucose: 130 });
  await page.goto('/alerts');
  await page.screenshot({ path: `${DIR}/alerts.png` });
});

test('emergency, NASA data, guide and simple view', async ({ page }) => {
  await page.goto('/emergency');
  await page.getByTestId('situation-radiation').click();
  await page.screenshot({ path: `${DIR}/emergency.png` });
  await page.goto('/data');
  await expect(page.getByTestId('sw-mode')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/nasa-data.png` });
  await page.goto('/guide');
  await page.screenshot({ path: `${DIR}/guide.png` });
  await page.goto('/');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="body-container"]').getBoundingClientRect().top + window.scrollY - 170));
  await page.screenshot({ path: `${DIR}/body-map.png` });
});
