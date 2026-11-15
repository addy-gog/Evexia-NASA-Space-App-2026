import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const iconsDir = path.join(publicDir, 'icons');

fs.mkdirSync(iconsDir, { recursive: true });

const svgPath = path.join(publicDir, 'favicon.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();

  // Regular PNG icons (192 and 512)
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;">${svg}</body></html>`);
    await page.locator('svg').evaluate((node, s) => {
      node.setAttribute('width', String(s));
      node.setAttribute('height', String(s));
    }, size);
    await page.locator('svg').screenshot({
      path: path.join(iconsDir, `icon-${size}.png`),
      omitBackground: true,
    });
    console.log(`Generated icon-${size}.png`);
  }

  // Maskable icon with dark background and safe area margin
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0C10;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;"><div style="width:410px;height:410px;display:flex;">${svg}</div></body></html>`);
  await page.locator('svg').evaluate((node) => {
    node.setAttribute('width', '100%');
    node.setAttribute('height', '100%');
  });
  await page.screenshot({
    path: path.join(iconsDir, 'icon-maskable-512.png'),
  });
  console.log('Generated icon-maskable-512.png');

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
