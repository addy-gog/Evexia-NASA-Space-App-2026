import AxeBuilder from '@axe-core/playwright';
import { test, expect, logReadings, signIn, signOut, mockClaude, GREEN } from './fixtures.js';

const ASTRONAUT_PAGES = [
  ['Console', '/'],
  ['Log Readings', '/log'],
  ['History', '/history'],
  ['Live Telemetry', '/telemetry'],
  ['Guidance', '/alerts'],
  ['Guide', '/guide'],
  ['Emergency', '/emergency'],
  ['NASA Data', '/data'],
  ['Body', '/body'],
  ['Settings', '/settings'],
];

async function seriousViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes[0]?.target?.join(' ')}`);
}

test.describe('Accessibility (axe): zero serious or critical violations', () => {
  test('Login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  for (const [name, path] of ASTRONAUT_PAGES) {
    test(`Astronaut · ${name}`, async ({ page }) => {
      await logReadings(page, { ...GREEN, hr: 96, glucose: 130 }); // signs in, caution + critical data present
      await page.goto(path);
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.waitForTimeout(600);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('Flight surgeon · overview, crew record (all tabs), escalations', async ({ page }) => {
    await signIn(page, 'surgeon');
    await expect(page.locator('[data-testid^="crew-card-"]')).toHaveCount(5);
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByTestId('crew-link-c2').click();
    await expect(page.getByTestId('crew-detail')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    for (const tab of ['logs', 'escalations', 'devices']) {
      await page.getByTestId(`crew-tab-${tab}`).click();
      expect(await seriousViolations(page), tab).toEqual([]);
    }
    await page.goto('/surgeon/escalations');
    await expect(page.locator('main h1')).toHaveText('Escalations');
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('High-contrast theme on Console and Guidance', async ({ page }) => {
    await signIn(page, 'okafor');
    await page.goto('/settings');
    await page.getByTestId('contrast-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await logReadings(page, { ...GREEN, glucose: 130 });
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto('/alerts');
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('Dark theme is the default; light theme from Settings persists and passes axe', async ({ page }) => {
    await signIn(page, 'okafor');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto('/settings');
    await page.getByTestId('theme-light').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // saved across reloads
    await expect(page.locator('main h1').first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto('/settings');
    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('AI assistant panel open', async ({ page }) => {
    await signIn(page, 'okafor');
    await page.getByTestId('assistant-open').click();
    await page.getByRole('button', { name: 'Why does the delay matter?' }).click();
    await expect(page.getByTestId('offline-badge')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('AI assistant with Claude cards, expanded, and an emergency banner', async ({ page }) => {
    await signIn(page, 'okafor');
    await mockClaude(page);
    await page.getByTestId('assistant-open').click();
    await page.getByLabel('Message Evexia SI').fill('I have chest pain and a red patch');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('action-report')).toBeVisible();
    await expect(page.getByTestId('assistant-emergency')).toBeVisible();
    await page.getByTestId('assistant-expand').click();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('Touch targets: header, nav, console buttons and inputs are at least 44 px', async ({ page }) => {
    await signIn(page, 'okafor');
    const targets = page.locator('header a, header button, main button, main input[type="number"], main a.btn-ghost');
    const sizes = await targets.evaluateAll((els) =>
      els.filter((e) => e.offsetParent !== null && !e.closest('.sr-only')).map((e) => ({ t: e.textContent?.trim().slice(0, 30) || e.getAttribute('aria-label'), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width })),
    );
    expect(sizes.filter((s) => s.h < 43.5 || s.w < 43.5)).toEqual([]);
  });
});

test.describe('Responsiveness and text size', () => {
  for (const width of [360, 768, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, 'okafor');
      for (const path of ['/', '/log', '/history', '/telemetry', '/alerts', '/guide', '/emergency', '/data', '/settings']) {
        await page.goto(path);
        await expect(page.locator('main h1').first()).toBeVisible();
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows by ${overflow}px at ${width}px`).toBeLessThanOrEqual(1);
      }
      await signOut(page); // the real sign-out flow, so the console stops polling before the session ends
      await signIn(page, 'surgeon');
      for (const path of ['/surgeon', '/surgeon/crew/c1', '/surgeon/escalations']) {
        await page.goto(path);
        await expect(page.locator('main h1').first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows by ${overflow}px at ${width}px`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('text-size toggle has three levels', async ({ page }) => {
    await signIn(page, 'okafor');
    const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(await size()).toBe('16px');
    await page.getByTestId('text-size-lg').click();
    expect(await size()).toBe('18px');
    await page.getByTestId('text-size-xl').click();
    expect(await size()).toBe('20px');
    await page.getByTestId('text-size-md').click();
    expect(await size()).toBe('16px');
  });
});

test.describe('Performance sanity', () => {
  test('three.js is lazy-loaded and the guide page is usable quickly', async ({ page }) => {
    await signIn(page, 'okafor');
    const scripts = [];
    page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
    // Ignore late lazy-loads from the console page signIn landed on; count only the Guide document.
    page.on('framenavigated', (f) => f === page.mainFrame() && (scripts.length = 0));
    const t0 = Date.now();
    await page.goto('/guide');
    await expect(page.locator('main h1')).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(scripts.some((u) => /AnatomyViewer-/.test(u)), 'the 3D body should not load on the Guide page').toBe(false);
  });

  test('navigating away and back does not leak WebGL canvases', async ({ page }) => {
    await signIn(page, 'okafor');
    await expect(page.getByTestId('body-3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 4; i += 1) {
      await page.locator('nav[aria-label="Main"] a[href="/history"]').click();
      await expect(page.locator('main h1')).toHaveText('History');
      await page.locator('nav[aria-label="Main"] a[href="/"]').click();
      await expect(page.getByTestId('body-3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
    }
    // One body canvas plus the AI companion canvas.
    expect(await page.locator('canvas:not([data-space-bg])').count()).toBeLessThanOrEqual(2); // the 2D starfield canvas is not WebGL
  });
});
