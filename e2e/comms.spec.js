// @ts-check
import { test, expect } from '@playwright/test';
import { signIn, signOut } from './fixtures.js';

// The e2e API runs the Earth link at instant speed (LINK_TIME_SCALE=0), so "arrived" follows
// "link up" straight away; the delay itself is covered by server/tests/link.test.js.
test.describe('Earth link and store-and-forward comms', () => {
  test.afterEach(async ({ page }) => {
    // Leave the shared link up for the next test.
    await page.request.put('/api/link', { data: { mode: 'up' } }).catch(() => {});
  });

  test('header pill opens Earth link; blackout and link up show in both places', async ({ page }) => {
    await signIn(page, 'okafor');
    await page.getByTestId('earth-link').click();
    await expect(page).toHaveURL(/\/comms/);
    await page.getByTestId('link-blackout').click();
    await expect(page.getByTestId('link-panel')).toHaveAttribute('data-mode', 'blackout');
    await expect(page.getByTestId('earth-link')).toHaveAttribute('data-mode', 'blackout');
    await expect(page.getByTestId('earth-link')).toContainText('link down');
    await page.getByTestId('link-up').click();
    await expect(page.getByTestId('earth-link')).toHaveAttribute('data-mode', 'up');
  });

  test('in a blackout a report waits on board; when the link is up it arrives and the surgeon replies', async ({ page }) => {
    test.slow();
    await signIn(page, 'okafor');
    await page.goto('/comms');
    await page.getByTestId('link-blackout').click();
    await expect(page.getByTestId('link-panel')).toHaveAttribute('data-mode', 'blackout');

    await page.getByTestId('comms-new-report').click();
    await page.getByTestId('send-report').click();
    await expect(page.getByTestId('escalation-status')).toContainText('The Earth link is down');
    await page.getByRole('button', { name: 'Close escalation dialog' }).click();

    const journey = page.getByTestId('journey-list').locator('li[data-step]').first();
    await expect(journey).toHaveAttribute('data-step', 'waiting');
    await expect(page.getByTestId('earth-link')).toContainText('1 waiting');

    await page.getByTestId('link-up').click();
    await expect(journey).toHaveAttribute('data-step', 'arrived');
    const id = (await journey.getAttribute('data-testid'))?.replace('journey-', '');

    // The flight surgeon now has it and replies; the reply reaches the crew.
    await signOut(page);
    await signIn(page, 'surgeon');
    await page.goto('/surgeon/escalations');
    const item = page.getByTestId(`esc-${id}`);
    await expect(item.getByTestId('esc-journey')).toContainText('Written on board');
    await item.getByRole('textbox', { name: 'Reply to the crew' }).fill('Rest, fluids, and recheck in 2 hours.');
    await item.getByRole('button', { name: 'Send reply' }).click();
    await page.getByRole('button', { name: 'All' }).click();
    await expect(page.getByTestId(`esc-${id}`).getByTestId('reply-step')).toHaveAttribute('data-step', 'delivered');

    await signOut(page);
    await signIn(page, 'okafor');
    await page.goto('/comms');
    await expect(page.getByTestId(`journey-${id}`)).toHaveAttribute('data-step', 'replied');
    await expect(page.getByTestId(`reply-${id}`)).toContainText('Rest, fluids, and recheck in 2 hours.');
  });

  test('if the onboard server is unreachable, the report is kept on the device and sent when it is back', async ({ page }) => {
    test.slow();
    await signIn(page, 'okafor');
    await page.goto('/comms');
    const before = await page.getByTestId('journey-list').locator('li[data-step]').count().catch(() => 0);

    await page.route('**/api/escalations', (route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue()));
    await page.getByTestId('comms-new-report').click();
    await page.getByTestId('send-report').click();
    await expect(page.getByTestId('escalation-status')).toContainText('saved on this device');
    await page.getByRole('button', { name: 'Close escalation dialog' }).click();

    // Server back: the app notices on its next health check ("online" triggers one) and sends the outbox.
    await page.unroute('**/api/escalations');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('journey-list').locator('li[data-step]')).toHaveCount(before + 1, { timeout: 20_000 });
  });
});
