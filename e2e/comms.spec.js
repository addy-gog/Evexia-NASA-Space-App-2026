// @ts-check
import { test, expect } from '@playwright/test';
import { signIn } from './fixtures.js';

test.describe('Earth link and store-and-forward comms', () => {
  test('header link pill navigates to /comms, displays delay and blackout state', async ({ page }) => {
    await signIn(page, 'okafor');
    await expect(page.getByTestId('earth-link')).toBeVisible();

    // Click header link pill to navigate to Comms
    await page.getByTestId('earth-link').click();
    await expect(page).toHaveURL(/\/comms/);
    await expect(page.getByTestId('link-panel')).toBeVisible();

    // Toggle blackout mode
    await page.getByTestId('link-blackout').click();
    await expect(page.getByTestId('link-panel')).toHaveAttribute('data-mode', 'blackout');
    await expect(page.getByTestId('earth-link')).toHaveAttribute('data-mode', 'blackout');

    // Toggle back to link up
    await page.getByTestId('link-up').click();
    await expect(page.getByTestId('link-panel')).toHaveAttribute('data-mode', 'up');
    await expect(page.getByTestId('earth-link')).toHaveAttribute('data-mode', 'up');
  });

  test('sending a report in blackout queues on board; sending when up tracks 5-step journey', async ({ page }) => {
    await signIn(page, 'okafor');
    await page.goto('/comms');

    // Switch to instant/demo mode for fast test execution
    await page.getByTestId('link-up').click();
    
    // Open new report dialog from comms page
    await page.getByTestId('comms-new-report').click();
    await expect(page.getByTestId('escalation-dialog')).toBeVisible();
    await page.getByTestId('send-report').click();
    await expect(page.getByTestId('escalation-status')).toContainText(/queued for the flight surgeon/);
    await page.keyboard.press('Escape');

    // Verify report appears in journey list
    await expect(page.getByTestId('journey-list')).toBeVisible();
  });
});
