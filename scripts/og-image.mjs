// Renders the link-preview image (apps/frontend/public/og.png): the homepage as a visitor sees
// it, from the header down to the prompt box and its example chips, scaled to the 1200 x 630 size
// link previews use.
//
//   npm start                      # in another terminal
//   node scripts/og-image.mjs [http://localhost:4317]

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:4317';
const out = fileURLToPath(new URL('../apps/frontend/public/og.png', import.meta.url));

// The page from the top to just below the example chips (which end at 908px at every desktop
// width), in a frame of the preview's 1.905:1 shape, shrunk to 1200px wide as it is captured.
const FRAME = { width: 1776, height: 932 };
const SCALE = 1200 / FRAME.width;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: FRAME, deviceScaleFactor: SCALE, colorScheme: 'light' });
  // Always the first scene (Yosemite), so the image doesn't change from one run to the next.
  await page.addInitScript(() => localStorage.setItem('triptinker:scene-visit', '-1'));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000); // let the hero's entrance and the sample button's icon settle
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
