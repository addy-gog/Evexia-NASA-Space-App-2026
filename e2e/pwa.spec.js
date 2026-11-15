// @ts-check
import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/login');
  await page.getByTestId('login-username').fill('okafor');
  await page.getByTestId('login-password').fill('Okafor-2026');
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('Progressive Web App (PWA) and offline capabilities', () => {
  test('serves web app manifest with valid name, icons and standalone display mode', async ({ page, request }) => {
    await page.goto('/login');

    // Verify manifest link tag in HTML head
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    const href = await manifestLink.getAttribute('href');
    expect(href).toBeTruthy();

    // Fetch and validate the manifest JSON
    const res = await request.get(href);
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();

    expect(manifest.name).toContain('Evexia');
    expect(manifest.short_name).toBe('Evexia');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toBeInstanceOf(Array);
    expect(manifest.icons.length).toBeGreaterThan(0);

    // Verify Chrome PWA criteria: PNG icons with 192x192 and 512x512 sizes
    const icon192 = manifest.icons.find((i) => i.sizes === '192x192' && i.type === 'image/png');
    const icon512 = manifest.icons.find((i) => i.sizes === '512x512' && i.type === 'image/png');
    expect(icon192).toBeTruthy();
    expect(icon512).toBeTruthy();

    // Verify icons can be fetched
    const res192 = await request.get(icon192.src);
    expect(res192.ok()).toBeTruthy();
    expect(res192.headers()['content-type']).toContain('image/png');

    const res512 = await request.get(icon512.src);
    expect(res512.ok()).toBeTruthy();
    expect(res512.headers()['content-type']).toContain('image/png');
  });

  test('surfaces in-app install flow via profile menu and install prompt event', async ({ page }) => {
    await login(page);

    // Check account menu has Install option
    await page.getByTestId('profile-button').click();
    const menuInstall = page.getByTestId('menu-install-app');
    await expect(menuInstall).toBeVisible();

    // Clicking menu option without native prompt opens installation guide dialog
    await menuInstall.click();
    await expect(page.getByRole('dialog', { name: 'Install Evexia' })).toBeVisible();
    await expect(page.getByText('Desktop (Chrome, Edge, Brave)')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByRole('dialog', { name: 'Install Evexia' })).not.toBeVisible();

    // Simulate beforeinstallprompt event from browser
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      // @ts-ignore
      event.prompt = () => Promise.resolve();
      // @ts-ignore
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });

    // Header install pill should now appear
    const headerInstall = page.getByTestId('header-install-app');
    await expect(headerInstall).toBeVisible();
    await headerInstall.click();
  });

  test('displays floating install prompt banner at top corner after initial visit', async ({ page }) => {
    await page.goto('/login');

    // Banner appears in top corner after delay
    const banner = page.getByTestId('pwa-install-banner');
    await expect(banner).toBeVisible({ timeout: 6000 });
    await expect(banner.getByText('Install Evexia App')).toBeVisible();

    // Clicking "Not now" or dismiss button dismisses it
    await page.getByTestId('pwa-dismiss-banner').click();
    await expect(banner).not.toBeVisible();
  });

  test('generates service worker script for offline caching', async ({ request }) => {
    const swRes = await request.get('/sw.js');
    expect(swRes.ok()).toBeTruthy();
    const text = await swRes.text();
    expect(text).toContain('workbox');
    // The 3D bodies (4-8 MB each) are saved when first viewed, never pre-downloaded on the first visit.
    expect(text).not.toMatch(/models\/[a-z-]+\.glb/);
  });

  test('with the network switched off, the app still opens', async ({ page, context }) => {
    await page.goto('/login');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // from now on the service worker serves this page
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
