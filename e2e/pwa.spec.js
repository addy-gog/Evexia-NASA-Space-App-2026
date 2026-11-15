// @ts-check
import { test, expect } from '@playwright/test';

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
