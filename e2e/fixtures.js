import { test as base, expect } from '@playwright/test';

/**
 * Shared fixture: fails a test if the browser logs a console error or an
 * uncaught page error (no console errors on any page).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('console', (msg) => {
      // ERR_NETWORK_CHANGED is the host OS switching network adapters, not an app error.
      // A rejected sign-in (401) on the login page is expected behaviour, not an app error.
      // So is the 401 from the session check on a signed-out page, just before the client redirects to /login.
      const expected401 = /status of 401/.test(msg.text()) && (page.url().includes('/login') || /\/api\/auth\//.test(msg.location()?.url ?? ''));
      if (msg.type() === 'error' && !/ERR_NETWORK_CHANGED/.test(msg.text()) && !expected401) errors.push(`${msg.text()} @ ${msg.location()?.url ?? '?'} (page ${page.url()})`);
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  },
});

export { expect };

export const INDICATORS = ['hr', 'bp', 'glucose', 'temp', 'sleep', 'radiation'];

export const PASSWORDS = {
  okafor: 'Okafor-2026',
  marchetti: 'Marchetti-2026',
  tanaka: 'Tanaka-2026',
  rivera: 'Rivera-2026',
  nair: 'Nair-2026',
  surgeon: 'Surgeon-2026',
};

/** Sign in through the real login form. */
export async function signIn(page, username = 'okafor') {
  await page.goto('/login');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(PASSWORDS[username]);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(username === 'surgeon' ? /\/surgeon$/ : /\/$/);
}

export async function signOut(page) {
  const profile = page.getByTestId('profile-button');
  const signOutBtn = page.getByTestId('sign-out');
  // The header can remount (closing the menu) right after a client-side redirect, so reopen until it sticks.
  await expect(async () => {
    if ((await profile.count()) && !(await signOutBtn.isVisible())) await profile.click();
    await expect(signOutBtn).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await signOutBtn.click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Fill the Log Readings form (date/time default to now) and submit. Signs in first if needed. */
export async function logReadings(page, values, { spe = false, notes = '' } = {}) {
  await page.goto('/log');
  // The redirect to /login happens client-side after the session check, so wait for either outcome.
  await expect(page.getByTestId('input-hr').or(page.getByTestId('login-submit'))).toBeVisible();
  if (page.url().includes('/login')) {
    await signIn(page, 'okafor');
    await page.goto('/log');
  }
  for (const [k, v] of Object.entries(values)) {
    await page.getByTestId(`input-${k}`).fill(String(v));
  }
  if (notes) await page.getByTestId('input-notes').fill(notes);
  if (spe) await page.getByTestId('input-spe').check();
  await page.getByTestId('submit-readings').click();
  await expect(page).toHaveURL(/\/$/);
}

// Radiation is absorbed dose in mGy/day (0.4 ≈ 1.5 mSv/day in Mars transit: nominal).
export const GREEN = { hr: 70, sys: 118, dia: 76, glucose: 90, temp: 36.8, sleep: 7.5, radiation: 0.4 };
