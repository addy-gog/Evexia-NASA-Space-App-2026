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
  });
});
