import { test, expect, logReadings, signIn, signOut, mockClaude, GREEN, INDICATORS, PHOTO_PNG } from './fixtures.js';

const card = (page, id) => page.getByTestId(`card-${id}`);
const region = (page, r) => page.getByTestId('body-regions').locator(`li[data-region="${r}"]`);
const guidanceNav = (page) => page.locator('nav[aria-label="Main"] a[href="/alerts"]');

test.describe('Sign-in and roles', () => {
  test('signed-out visitors are sent to the login page; wrong password is rejected', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByTestId('login-username').fill('okafor');
    await page.getByTestId('login-password').fill('wrong');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Wrong username or password.');
  });

  test('each astronaut signs in to their own console; demo accounts fill the form', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('demo-tanaka').click();
    await expect(page.getByTestId('login-username')).toHaveValue('tanaka');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('greeting')).toContainText('Mei');
    await page.getByTestId('profile-button').click();
    await expect(page.getByText('Flight Engineer · TORQUE')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto('/surgeon');
    await expect(page).toHaveURL(/\/$/); // astronauts cannot open the flight-surgeon side
    await signOut(page);
  });

  test('the flight surgeon sees all five astronauts with portraits and opens a full health record', async ({ page }) => {
    await signIn(page, 'surgeon');
    await expect(page.getByRole('heading', { name: 'Welcome, Dr. Jonas' })).toBeVisible();
    const cards = page.locator('[data-testid^="crew-card-"]');
    await expect(cards).toHaveCount(5);
    for (const name of ['Cdr. Ada Okafor', 'Leo Marchetti', 'Mei Tanaka', 'Sam Rivera', 'Priya Nair']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Portrait of Priya Nair' })).toBeVisible();
    await page.getByTestId('crew-link-c5').click();
    await expect(page.getByTestId('crew-detail')).toHaveAttribute('data-crew', 'c5');
    await expect(page.getByRole('heading', { name: 'Priya Nair', level: 1 })).toBeVisible();
    await expect(page.getByTestId('crew-portrait')).toHaveAttribute('src', '/avatars/c5.svg');
    await expect(page.getByText('AB+')).toBeVisible();
    await expect(page.getByTestId('vital-temp')).toHaveAttribute('data-severity', 'amber');
    await expect(page.getByTestId('hr-dot-matrix')).toBeVisible();
    await page.getByTestId('crew-tab-logs').click();
    await expect(page.getByTestId('log-row').first()).toBeVisible();
    await expect(page.getByTestId('log-row').filter({ hasText: 'Sore throat and chills' }).first()).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/surgeon$/); // the surgeon has no astronaut console
  });
});

test.describe('Console', () => {
  test.beforeEach(async ({ page }) => signIn(page, 'okafor'));

  test('1. green set of readings: all cards nominal, Mission ready, body nominal', async ({ page }) => {
    await logReadings(page, GREEN);
    for (const id of INDICATORS) await expect(card(page, id)).toHaveAttribute('data-severity', 'green');
    await expect(page.getByTestId('score-band')).toHaveText('Mission ready');
    // All green scores 85–100 by how centred each reading is (IITT/ABCDE, lib/triage.js); no triage cap.
    const score = Number(await page.getByTestId('score-gauge').getAttribute('data-score'));
    expect(score).toBeGreaterThanOrEqual(85);
    expect(score).toBeLessThanOrEqual(100);
    await expect(page.getByTestId('triage-tier')).toHaveAttribute('data-tier', 'green');
    await expect(page.getByTestId('score-cap')).toHaveCount(0);
    for (const li of await page.getByTestId('body-regions').locator('li').all()) await expect(li).toHaveAttribute('data-severity', 'green');
    await expect(page.getByTestId('all-nominal')).toBeVisible();
    await expect(page.getByTestId('measured-hr')).toContainText('just now');
  });

  test('2. high heart rate: caution card, 3D hotspot and alert; 108 is critical', async ({ page }) => {
    // Per the threshold table 91–100 bpm is caution; 108 bpm is above 100 → critical.
    await logReadings(page, { ...GREEN, hr: 96 });
    await expect(card(page, 'hr')).toHaveAttribute('data-severity', 'amber');
    await expect(card(page, 'hr')).toContainText('Caution');
    await expect(region(page, 'heart')).toHaveAttribute('data-severity', 'amber');
    await expect(page.getByTestId('body-container')).toHaveAttribute('data-view', '3d');
    await expect(page.getByRole('button', { name: 'Heart rate: 96 bpm, Caution. Show details.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('body-3d').locator('[data-region="hr"]')).toHaveAttribute('data-severity', 'amber');
    await expect(page.getByTestId('latest-alerts-list').getByTestId('alert-hr')).toBeVisible();
    await logReadings(page, { hr: 108 });
    await expect(card(page, 'hr')).toHaveAttribute('data-severity', 'red');
  });

  test('3. editing a card previews live, then saves as a timestamped log entry', async ({ page }) => {
    await logReadings(page, GREEN);
    await page.getByTestId('console-input-glucose').fill('130');
    await expect(page.getByTestId('draft-bar')).toBeVisible();
    await expect(card(page, 'glucose')).toHaveAttribute('data-severity', 'red');
    await expect(page.getByTestId('score-band')).toHaveText('Act now');
    await expect(page.getByTestId('emergency-prompt')).toBeVisible();
    await page.getByTestId('console-slider-hr').fill('95');
    await expect(page.getByTestId('console-input-hr')).toHaveValue('95');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('toast')).toContainText('Saved to your log');
    await expect(page.getByTestId('draft-bar')).toHaveCount(0);
    await expect(page.getByTestId('value-glucose')).toHaveText('130');
    await expect(page.getByTestId('log-row').first()).toContainText('Logged from the console.');
  });

  test('4. selecting a reading focuses its body marker and detail; personal baseline shows deltas', async ({ page }) => {
    await logReadings(page, { ...GREEN, radiation: 0.48 });
    await page.getByRole('button', { name: /^Radiation: 0\.48 mGy\/day, Nominal\. Show details\.$/ }).click();
    await expect(page.getByTestId('reading-detail')).toHaveAttribute('data-indicator', 'radiation');
    await expect(page.getByTestId('reading-reason')).toContainText('0.48 mGy/day measured ≈ 1.824 mSv/day');
    await expect(page.getByTestId('trend-panel')).toHaveAttribute('data-metric', 'radiation');
    await page.getByTestId('baseline-switch').click();
    await expect(page.getByTestId('baseline-switch')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('delta-hr')).toHaveText('+8 vs your pre-flight 62');
  });

  test('5. Mars transit vs station: delay, Autonomy mode, radiation estimate, self-care first', async ({ page }) => {
    await page.getByTestId('envseg-station').click();
    await expect(page.getByTestId('earth-link')).toContainText('real-time');
    await expect(page.getByTestId('link-mode')).toHaveText('Ground-linked');
    await page.goto('/log');
    await page.getByTestId('input-radiation').fill('0.48');
    await expect(page.getByTestId('radiation-estimate')).toContainText('≈ 0.96 mSv/day');
    await page.goto('/');
    await page.getByTestId('envseg-marsTransit').click();
    await expect(page.getByTestId('earth-link')).toContainText('≈12 min one-way');
    await expect(page.getByTestId('link-mode')).toHaveText('Autonomy mode');
    await expect(page.getByTestId('hrp-distance')).toHaveAttribute('data-severity', 'amber');
    await logReadings(page, { ...GREEN, glucose: 130 });
    await guidanceNav(page).click();
    await expect(page.getByTestId('autonomy-panel')).toHaveAttribute('data-selfcare-first', 'true');
    const grid = page.getByTestId('alert-glucose').locator('[data-order]');
    await expect(grid).toHaveAttribute('data-order', 'selfcare-first');
    await expect(page.getByTestId('comms-glucose')).toContainText('Message will arrive in 12 min');
  });

  test('6. escalation from the Earth link card produces a structured report and a confirmation', async ({ page }) => {
    await logReadings(page, { ...GREEN, glucose: 130 });
    await expect(page.getByTestId('send-report-card')).toHaveText('Escalate now');
    await page.getByTestId('send-report-card').click();
    await expect(page.getByTestId('report-preview')).toContainText('EVEXIA FLIGHT SURGEON ESCALATION REPORT');
    await expect(page.getByTestId('report-preview')).toContainText(/Fasting blood glucose: 130 mg\/dL {2}\[CRITICAL \(act now\)\] {2}\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
    await page.getByTestId('send-report').click();
    await expect(page.getByTestId('escalation-status')).toContainText(/queued for the flight surgeon/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('report-sent')).toContainText('It will arrive in about 12 min');
  });

  test('7. every log entry has a date, time and details, and appears in History', async ({ page }) => {
    const y = new Date(Date.now() - 86_400_000);
    const date = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    await page.goto('/log');
    await page.getByTestId('input-date').fill(date);
    await page.getByTestId('input-time').fill('06:45');
    await expect(page.getByTestId('log-when')).toContainText('mission day');
    await page.getByTestId('input-hr').fill('66');
    await page.getByTestId('input-notes').fill('E2E check: fasting, felt rested.');
    await page.getByTestId('submit-readings').click();
    await expect(page.getByTestId('toast')).toContainText('06:45');
    await page.goto('/history');
    const row = page.getByTestId('log-row').filter({ hasText: 'E2E check: fasting, felt rested.' });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('log-time')).toHaveText('06:45');
  });

  test('8. history: weekly trends with bands and range selector', async ({ page }) => {
    await page.goto('/history');
    for (const id of ['score', 'spo2', 'hr', 'bp', 'glucose', 'temp', 'sleep', 'radiation']) await expect(page.getByTestId(`trend-${id}`)).toBeVisible();
    const twoWeeks = Number(await page.getByTestId('trend-hr').getAttribute('data-points'));
    await page.getByTestId('range-1w').click();
    const oneWeek = Number(await page.getByTestId('trend-hr').getAttribute('data-points'));
    expect(oneWeek).toBeGreaterThan(0);
    expect(twoWeeks).toBeGreaterThan(oneWeek);
    await expect(page.getByTestId('weekly-table').locator('tbody tr')).not.toHaveCount(0);
  });

  test('9. wearable samples stream in live and sync to the log and console', async ({ page }) => {
    await page.goto('/telemetry');
    await expect(page.getByTestId('stream-status')).toHaveAttribute('data-stream', 'live');
    const ts = new Date().toISOString();
    const res = await page.request.post('/api/telemetry', {
      data: { crewId: 'c1', deviceId: 'e2e-watch', deviceName: 'E2E smartwatch', samples: [{ metric: 'hr', value: 97, ts }, { metric: 'hr', value: 99, ts: new Date(Date.now() - 60_000).toISOString() }, { metric: 'hr', value: 98, ts: new Date(Date.now() - 120_000).toISOString() }] },
    });
    expect(res.status()).toBe(202);
    await expect(page.getByTestId('live-value-hr')).toHaveText('97');
    await expect(page.getByTestId('device-list')).toContainText('E2E smartwatch');
    await page.getByTestId('sync-now').click();
    await expect(page.getByTestId('toast')).toContainText('Synced to log');
    await page.locator('nav[aria-label="Main"] a[href="/"]').click();
    await expect(page.getByTestId('value-hr')).toHaveText('98');
    await expect(page.getByTestId('measured-hr')).toContainText('E2E smartwatch');
  });

  test('10. AI dock: offline guidance, chips, and the offline toggle', async ({ page }) => {
    await logReadings(page, { ...GREEN, hr: 96 });
    await expect(page.getByTestId('assistant-open')).toHaveAttribute('aria-label', /1 item to review/);
    await page.getByTestId('assistant-open').click();
    await expect(page.getByTestId('assistant-messages')).toContainText('Heart rate (caution) needs attention');
    await page.getByRole('button', { name: 'What should I do first?' }).click();
    await expect(page.getByTestId('offline-badge')).toHaveText('Offline guidance mode');
    await expect(page.getByTestId('assistant-messages')).toContainText('Start with heart rate (caution)');
    await page.getByTestId('online-toggle').click();
    await page.getByLabel('Message Evexia SI').fill('Why is my heart rate amber?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('assistant-messages')).toContainText('Resting heart rate is CAUTION');
  });

  test('11. emergency mode sends a priority report that the flight surgeon sees first', async ({ page }) => {
    await page.getByTestId('emergency-button').click();
    await expect(page.getByTestId('emergency-delay')).toContainText('12 min');
    await page.getByTestId('situation-hypoglycaemia').click();
    await page.getByLabel('Take 15 g of fast-acting sugar now (glucose gel or juice).').check();
    await page.getByTestId('emergency-report').click();
    await expect(page.getByTestId('report-preview')).toContainText('*** EMERGENCY ***');
    await page.getByTestId('send-report').click();
    await expect(page.getByTestId('escalation-status')).toContainText(/queued/);
    await page.keyboard.press('Escape');
    await signOut(page);
    await signIn(page, 'surgeon');
    const first = page.getByTestId('inbox').locator('[data-testid^="esc-"]').first();
    await expect(first).toHaveAttribute('data-priority', 'emergency');
    await expect(first).toContainText('Cdr. Ada Okafor');
    await first.getByRole('textbox').fill('Glucose gel taken; re-test in 15 min.');
    await first.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(page.getByTestId('toast')).toContainText('marked reviewed');
  });

  test('12. NASA data, guide, Demo mode gone', async ({ page }) => {
    await page.goto('/data');
    await expect(page.getByTestId('radlab-storm')).toContainText('69.34 µGy/h');
    await expect(page.getByTestId('limits-table')).toContainText('250 mSv');
    await page.goto('/guide');
    await expect(page.locator('[data-testid^="guide-"]')).toHaveCount(7);
    await page.goto('/trends');
    await expect(page.locator('main h1')).toHaveText('Page not found');
    await expect(page.getByText('Demo mode')).toHaveCount(0);
  });

  test('13. 3D body only (no 2D switch on the Console or in Settings) and reduced motion', async ({ page }) => {
    await expect(page.getByTestId('body-container')).toHaveAttribute('data-view', '3d');
    await expect(page.getByRole('button', { name: 'Simple view' })).toHaveCount(0);
    await page.goto('/settings');
    await expect(page.getByTestId('simple-toggle')).toHaveCount(0);
    await page.getByTestId('motion-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  });

  test('14. keyboard-only navigation reaches every primary action', async ({ page }) => {
    await page.goto('/'); // fresh page load: focus starts at the top
    await expect(page.getByTestId('greeting')).toBeVisible(); // wait for the session check to render the console
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Skip to main content');
    const seen = new Set();
    for (let i = 0; i < 130; i += 1) {
      await page.keyboard.press('Tab');
      seen.add(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute('data-testid') || el?.getAttribute('aria-label') || el?.innerText?.replace(/\s*\d+(\s*active)?$/, '').trim().slice(0, 40);
        }),
      );
    }
    for (const want of ['Console', 'Log Readings', 'History', 'Guidance', 'Body', 'emergency-button', 'profile-button', 'envseg-marsTransit', 'baseline-switch', 'console-input-hr', 'hotspot-hr', 'send-report-card', 'assistant-open']) {
      expect([...seen], `focus order should include ${want}`).toContain(want);
    }
    await page.getByRole('link', { name: 'Log Readings', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/log$/);
    await page.getByTestId('input-hr').focus();
    await page.keyboard.type('72');
    await page.getByTestId('submit-readings').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('value-hr')).toHaveText('72');
  });

  test('16. AI photo and confirm cards: nothing is saved or sent until the astronaut taps', async ({ page }) => {
    const sent = await mockClaude(page);
    await page.getByTestId('assistant-open').click();
    await page.getByTestId('photo-input').setInputFiles({ name: 'monitor.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    await expect(page.getByTestId('photo-preview')).toBeVisible();
    await page.getByLabel('Message Evexia SI').fill('Log this, and I have a red patch on my arm');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('ai-badge')).toBeVisible();
    // The photo was resized to JPEG in the browser and sent with the message.
    expect(sent[0].image.mediaType).toBe('image/jpeg');
    expect(sent[0].image.data.length).toBeGreaterThan(50);
    await expect(page.getByAltText('Photo you sent')).toBeVisible();
    await expect(page.getByTestId('gap-recorded')).toBeVisible();

    // Readings card → log entry, only after Save.
    const readings = page.getByTestId('action-readings');
    await expect(readings).toContainText('128/82');
    await page.getByTestId('action-readings-confirm').click();
    await expect(readings).toHaveAttribute('data-status', 'saved');
    await expect(card(page, 'bp')).toContainText('128');

    // Symptom note → recheck reminder in Today's routine.
    await page.getByTestId('action-symptom_note-confirm').click();
    await expect(page.getByTestId('action-symptom_note')).toHaveAttribute('data-status', 'saved');
    await page.getByRole('button', { name: 'Close assistant' }).click();
    await expect(page.getByTestId('rechecks')).toContainText('Red itchy patch, left forearm');

    // Report card → opens the report with Claude's note; it is not sent by itself.
    await page.getByTestId('assistant-open').click();
    await page.getByTestId('action-report-confirm').click();
    const dialog = page.getByTestId('escalation-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox')).toHaveValue('Red itchy patch on the left forearm since yesterday.');
    await page.getByRole('button', { name: 'Close escalation dialog' }).click();
    await expect(dialog).toBeHidden();

    // The follow-up message carries the earlier turns as history.
    await page.getByLabel('Message Evexia SI').fill('It started yesterday');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1].history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(sent[1].history[0].text).toMatch(/\[photo attached\]$/);
    expect(sent[1].image).toBeUndefined();
  });

  test('17. safety screen: danger signs lead to emergency mode, even offline; photos need Claude', async ({ page }) => {
    await page.getByTestId('assistant-open').click();
    await page.getByTestId('online-toggle').click();
    await page.getByLabel('Message Evexia SI').fill('I have chest pain');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const alert = page.getByTestId('assistant-emergency');
    await expect(alert).toContainText('Possible danger sign: chest pain or pressure');
    await expect(page.getByTestId('assistant-messages')).toContainText('open emergency mode and alert the crew medical officer');
    // The + menu: opens with focus on its first item, Escape closes it and returns focus to +.
    const plus = page.getByTestId('attach-button');
    await plus.click();
    await expect(plus).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitem', { name: 'Upload a photo' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Take a photo' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('attach-menu')).toBeHidden();
    await expect(plus).toBeFocused();
    // Offline, choosing a photo explains that photos need Claude.
    await plus.click();
    await page.getByRole('menuitem', { name: 'Upload a photo' }).click();
    await expect(page.getByTestId('assistant-notice')).toContainText('Photos need Claude');
    await alert.getByRole('link', { name: 'Open emergency mode' }).click();
    await expect(page).toHaveURL(/\/emergency$/);
  });

  test('15. every astronaut page loads with the disclaimer and no console errors', async ({ page }) => {
    for (const path of ['/', '/log', '/history', '/telemetry', '/alerts', '/guide', '/emergency', '/data', '/settings', '/credits']) {
      await page.goto(path);
      await expect(page.getByTestId('disclaimer')).toContainText('not a medical device');
      await expect(page.locator('main h1').first()).toBeVisible();
    }
  });
});
