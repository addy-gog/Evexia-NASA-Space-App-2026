import { test, expect, signIn, logReadings, GREEN } from './fixtures.js';

// The 3D models are several MB each; give loading a generous window on a busy laptop.
const MODEL_TIMEOUT = 45_000;

/** Chrome guesses connection speed (it reported "3g" even on localhost), so tests set it. */
async function connection(page, effectiveType) {
  await page.addInitScript((type) => {
    Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ effectiveType: type, saveData: false, downlink: type === '4g' ? 10 : 0.4 }) });
  }, effectiveType);
}

test.describe('Body page', () => {
  test.beforeEach(async ({ page }, info) => {
    test.setTimeout(150_000); // two model downloads plus the scan, on a busy laptop
    if (!/slow connection/.test(info.title)) await connection(page, '4g');
  });

  test('on a slow connection it asks before downloading, then remembers the answer', async ({ page }) => {
    await connection(page, '2g');
    await signIn(page, 'okafor');
    await page.goto('/body');
    await expect(page.getByTestId('body-stage')).toHaveAttribute('data-mode', '2d');
    await expect(page.getByTestId('body-ask-first')).toContainText('6.2 MB');
    await page.getByTestId('body-load-3d').click();
    await expect(page.getByTestId('body-stage')).toHaveAttribute('data-mode', '3d');
    await page.reload();
    await expect(page.getByTestId('body-stage')).toHaveAttribute('data-mode', '3d');
    await expect(page.getByTestId('body-ask-first')).toHaveCount(0);
  });

  test('Body replaces NASA in the main nav; NASA Data moves to the profile menu', async ({ page }) => {
    await signIn(page, 'okafor');
    const nav = page.locator('nav[aria-label="Main"]');
    await expect(nav.getByRole('link', { name: 'Body', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'NASA Data' })).toHaveCount(0);
    await page.getByTestId('profile-button').click();
    await page.getByRole('link', { name: 'NASA Data' }).click();
    await expect(page).toHaveURL(/\/data$/);
  });

  test('a woman astronaut gets the female bodies; markers, views, scan and details work', async ({ page }) => {
    await logReadings(page, { ...GREEN, glucose: 130 }); // signs in as Okafor; glucose red
    await page.goto('/body');
    await expect(page.getByTestId('body-stage')).toHaveAttribute('data-mode', '3d');
    await expect(page.getByTestId('anatomy-viewer')).toHaveAttribute('data-kind', 'female');
    await expect(page.getByTestId('body-marker-glucose')).toBeVisible({ timeout: MODEL_TIMEOUT });
    await expect(page.getByTestId('body-loading')).toBeHidden({ timeout: MODEL_TIMEOUT });

    // The most urgent reading is selected first; its marker carries the status.
    await expect(page.getByTestId('reading-detail')).toHaveAttribute('data-indicator', 'glucose');
    await expect(page.locator('[data-marker="glucose"]')).toHaveAttribute('data-severity', 'red');

    // Going inside downloads the anatomy once, then the view switches.
    await page.getByTestId('body-view-organs').click();
    await expect(page.getByTestId('body-view-organs')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('anatomy-viewer')).toHaveAttribute('data-view', 'organs');
    await expect(page.getByTestId('body-loading')).toBeHidden({ timeout: MODEL_TIMEOUT });

    // Exploded shows the spread slider; other views do not.
    await expect(page.getByTestId('body-spread')).toHaveCount(0);
    await page.getByTestId('body-view-exploded').click();
    await expect(page.getByTestId('body-spread')).toBeVisible();
    await page.getByTestId('body-spread').fill('90');

    // Tapping a marker or a list row selects that reading and updates the URL.
    await page.getByTestId('body-marker-hr').click();
    await expect(page).toHaveURL(/reading=hr/);
    await expect(page.getByTestId('reading-detail')).toHaveAttribute('data-indicator', 'hr');
    await page.getByTestId('body-reading-sleep').click();
    await expect(page.getByTestId('reading-detail')).toHaveAttribute('data-indicator', 'sleep');

    // Turning buttons and back outside do not break anything.
    await page.getByTestId('body-turn-back').click();
    await page.getByTestId('body-view-outside').click();
    await expect(page.getByTestId('anatomy-viewer')).toHaveAttribute('data-view', 'outside');

    // Simple view swaps to the 2D map and back.
    await page.getByTestId('body-simple-toggle').click();
    await expect(page.getByTestId('body-stage')).toHaveAttribute('data-mode', '2d');
    await page.getByTestId('body-simple-toggle').click();
    await expect(page.getByTestId('body-stage')).toHaveAttribute('data-mode', '3d');
  });

  test('a man astronaut gets the male bodies; the console link opens the page on its reading', async ({ page }) => {
    await signIn(page, 'marchetti');
    await page.getByTestId('open-body-page').click();
    await expect(page).toHaveURL(/\/body\?reading=/);
    await expect(page.getByTestId('anatomy-viewer')).toHaveAttribute('data-kind', 'male');
    await expect(page.getByTestId('body-marker-hr')).toBeVisible({ timeout: MODEL_TIMEOUT });
  });

  test('with no 3D available, the page shows the 2D map and still lists every reading', async ({ page }) => {
    const crashes = [];
    page.on('pageerror', (e) => crashes.push(e.message));
    await page.addInitScript(() => {
      // Like a browser without WebGL: 3D contexts fail, ordinary 2D canvas still works.
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
        return /webgl/i.test(type) ? null : original.call(this, type, ...rest);
      };
    });
    await signIn(page, 'okafor');
    await page.goto('/body');
    await page.waitForTimeout(3000); // give lazy 3D pieces (e.g. the assistant's companion) time to try
    expect(crashes, 'no uncaught errors without WebGL').toEqual([]);
    await expect(page.getByTestId('body-stage')).toHaveAttribute('data-mode', '2d');
    await expect(page.getByText('3D is not available in this browser')).toBeVisible();
    await expect(page.getByTestId('body-regions').locator('li')).toHaveCount(6);
  });

  test('credits name every bundled model and its licence', async ({ page }) => {
    await signIn(page, 'okafor');
    await page.goto('/credits');
    const credits = page.getByTestId('model-credits');
    await expect(credits).toContainText('StormierTunic16');
    await expect(credits).toContainText('AhRabbi');
    await expect(credits).toContainText('Open Anatomy 3D');
    await expect(credits).toContainText('CC BY 4.0');
  });
});
