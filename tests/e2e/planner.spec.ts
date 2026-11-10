import { expect, test, type Page } from '@playwright/test';

const BRIEF = 'Three days in Lisbon with trams, tiles and seafood.';

async function useLab(page: Page, scenario: RegExp) {
  await page.getByRole('button', { name: /Test mode/ }).click();
  await page.getByRole('radio', { name: scenario }).click();
  await page.keyboard.press('Escape');
}

async function plan(page: Page, brief = BRIEF) {
  await page.getByLabel('Describe your trip').fill(brief);
  await page.getByRole('button', { name: 'Plan this trip' }).click();
}

const tripTitle = (page: Page) => page.getByRole('heading', { level: 2, name: 'Three slow days in Lisbon' });

/**
 * Select a stop row. On desktop its details appear in the side window; on mobile the row
 * expands in place. The row button comes before its drag handle, so `.first()` is the row.
 */
async function openStop(page: Page, title: string) {
  await page
    .getByRole('list', { name: /^Stops for/ })
    .getByRole('button', { name: new RegExp(title) })
    .first()
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('sample trip: inspect, remove with undo, reorder, save and reload', async ({ page }) => {
  await page.getByRole('button', { name: 'View sample' }).click();
  await expect(tripTitle(page)).toBeVisible();
  await expect(page.getByText('Sample', { exact: true })).toBeVisible();

  await openStop(page, 'Castelo de São Jorge');
  await expect(page.getByText('Walk the ramparts clockwise').first()).toBeVisible();

  await page.getByRole('button', { name: 'Remove Castelo de São Jorge' }).click();
  const list = page.getByRole('list', { name: 'Stops for Alfama and the river' });
  await expect(list.getByText('Castelo de São Jorge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(list.getByText('Castelo de São Jorge')).toBeVisible();

  // Move the first stop later; its time slot stays where it was.
  await openStop(page, 'Tram 28 from Martim Moniz');
  await page.getByRole('button', { name: 'Move later' }).first().click();
  const first = list.locator(':scope > li').first();
  await expect(first).toContainText('Miradouro da Senhora do Monte');
  await expect(first).toContainText('8:30 AM');

  await page.getByRole('button', { name: 'Save trip' }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

  await page.reload();
  await expect(tripTitle(page)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Stops for Alfama and the river' }).locator(':scope > li').first()).toContainText('Miradouro da Senhora do Monte');
});

test('repeated stop arrows move the same attraction through the day, with undo and redo', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: 'View sample' }).click();
  const list = page.getByRole('list', { name: 'Stops for Alfama and the river' });
  const rows = list.locator(':scope > li');
  const title = 'Tram 28 from Martim Moniz';
  const undo = page.locator('#trip').getByRole('button', { name: 'Undo', exact: true });
  const redo = page.locator('#trip').getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  // Desktop starts with an implicit selection. Do not click a row before using its arrows.
  if (isMobile) await openStop(page, title);
  const times = await rows.locator(':scope > div > button > span:first-child > span:first-child').allTextContents();
  for (let index = 1; index < 7; index++) {
    await page.getByRole('button', { name: 'Move later', exact: true }).filter({ visible: true }).click();
    await expect(rows.nth(index)).toContainText(title);
    await expect(rows.locator(':scope > div > button > span:first-child > span:first-child')).toHaveText(times);
    if (!isMobile) await expect(page.getByRole('region', { name: 'Stop details', exact: true }).getByRole('heading')).toHaveText(title);
  }
  await expect(page.getByRole('button', { name: 'Move later', exact: true }).filter({ visible: true })).toBeDisabled();
  if (!isMobile) {
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(list.locator('[aria-current="true"]')).toBeInViewport();
  }
  await undo.click();
  await expect(rows.nth(5)).toContainText(title);
  await redo.click();
  await expect(rows.nth(6)).toContainText(title);
  for (let index = 5; index >= 0; index--) {
    await page.getByRole('button', { name: 'Move earlier', exact: true }).filter({ visible: true }).click();
    await expect(rows.nth(index)).toContainText(title);
  }
  await expect(page.getByRole('button', { name: 'Move earlier', exact: true }).filter({ visible: true })).toBeDisabled();
});

test('wheel scrolling continues into the page at the edges of the stop list and details', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'mouse wheel scrolling is desktop-only');
  await page.getByRole('button', { name: 'View sample' }).click();
  const list = page.getByRole('list', { name: 'Stops for Alfama and the river' });
  await list.scrollIntoViewIfNeeded();
  await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await list.hover();
  let before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  const detail = page.getByRole('region', { name: 'Stop details', exact: true });
  await detail.scrollIntoViewIfNeeded();
  await detail.getByRole('heading').hover();
  before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test('hero preload matches React and neighboring scenes are loaded before navigation', async ({ page }) => {
  const hero = page.locator('#scene img').first();
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const visit = await page.evaluate(() => Number(document.documentElement.dataset.sceneVisit));
  await expect(hero).toHaveAttribute('src', `/scenes/scene-${visit + 1}-1920.webp`);
  expect(await page.evaluate(() => localStorage.getItem('triptinker:scene-visit'))).toBe(String(visit));
  const preload = page.locator('link[rel="preload"][as="image"]');
  await expect(preload).toHaveAttribute('imagesrcset', (await hero.getAttribute('srcset'))!);
  await expect(preload).toHaveAttribute('imagesizes', (await hero.getAttribute('sizes'))!);
  const nextId = (visit + 1) % 10 + 1;
  const requestsForNext = () => page.evaluate((id) => performance.getEntriesByType('resource').filter((entry) => entry.name.includes(`/scenes/scene-${id}-`)).length, nextId);
  await expect.poll(requestsForNext).toBe(1);
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(hero).toHaveAttribute('src', `/scenes/scene-${nextId}-1920.webp`);
  expect(await requestsForNext()).toBe(1);
  await page.reload();
  await expect(hero).toHaveAttribute('src', `/scenes/scene-${nextId}-1920.webp`);
  expect(await page.evaluate(() => localStorage.getItem('triptinker:scene-visit'))).toBe(String((visit + 1) % 10));
});

test('reduced motion switches decoded scenes without a canvas dissolve', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const hero = page.locator('#scene img').first();
  const visit = await page.evaluate(() => Number(document.documentElement.dataset.sceneVisit));
  const canvas = page.locator('#scene canvas').first();
  const initialWidth = await canvas.evaluate((el: HTMLCanvasElement) => el.width);
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(hero).toHaveAttribute('src', `/scenes/scene-${(visit + 1) % 10 + 1}-1920.webp`);
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await canvas.evaluate((el: HTMLCanvasElement) => el.width)).toBe(initialWidth);
});

test('arrow keys browse the scenes, except while typing or using other arrow-key controls', async ({ page }) => {
  const caption = page.locator('#scene p[aria-live="polite"]');
  await page.locator('#scene').scrollIntoViewIfNeeded();
  await expect(caption).toContainText('Yosemite Valley');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(caption).toContainText('Eiffel Tower');
  await page.keyboard.press('ArrowLeft');
  await expect(caption).toContainText('Yosemite Valley');
  await expect(page.getByRole('button', { name: 'Next scene', exact: true })).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');

  // Typing: the arrow moves the caret, not the scene.
  await page.getByLabel('Describe your trip').fill('Lisbon');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);
  await expect(caption).toContainText('Yosemite Valley');

  // The day tabs own ← and → for switching days, even with the scene in view.
  await page.getByRole('button', { name: 'View sample' }).click();
  await expect(tripTitle(page)).toBeVisible();
  await page.waitForTimeout(800); // let the smooth scroll to the trip finish
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const firstDay = page.getByRole('tablist', { name: 'Days' }).getByRole('tab').first();
  await firstDay.evaluate((tab: HTMLElement) => tab.focus({ preventScroll: true }));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);
  await expect(caption).toContainText('Yosemite Valley');
  // …and from the page itself, at the same scroll position, the keys still browse.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(caption).toContainText('Eiffel Tower');
});

test('a slow scene response cannot override a newer navigation back to the painted scene', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('triptinker:scene-visit', '-1'));
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/scenes/scene-2-*.webp', async (route) => {
    await held;
    await route.continue();
  });
  await page.reload();
  const hero = page.locator('#scene img').first();
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  // The caption follows the picture, so it cannot name a scene whose image has not arrived.
  await page.waitForTimeout(300);
  await expect(page.locator('#scene p[aria-live="polite"]')).toContainText('Yosemite Valley');
  await page.getByRole('button', { name: 'Previous scene', exact: true }).click();
  const response = page.waitForResponse(/\/scenes\/scene-2-/);
  release();
  await response;
  await page.waitForTimeout(1300); // Let the obsolete load's delayed dissolve finish if cancellation is broken.
  await expect(hero).toHaveAttribute('src', '/scenes/scene-1-1920.webp');
  await expect(page.locator('#scene p[aria-live="polite"]')).toContainText('Yosemite Valley');
});

test('previews the plan as it streams, then renders only the validated plan', async ({ page }) => {
  test.setTimeout(90_000);
  await useLab(page, /Slow model/);
  await plan(page);
  await expect(page.getByRole('button', { name: 'Hide thinking steps' })).toBeVisible();
  await expect(page.getByText('Live plan', { exact: true })).toBeVisible();
  // The preview fills in from the partial JSON: the title shows up before the run is done.
  const panel = page.getByRole('region', { name: 'Generation progress' });
  await expect(panel.getByText('Three slow days in Lisbon')).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole('list', { name: 'Stages' }).getByRole('listitem')).toHaveCount(4);
  await panel.getByRole('button', { name: 'Hide trip tasks' }).click();
  await expect(panel.getByRole('list', { name: 'Stages' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Show trip tasks' }).click();
  await expect(panel.getByRole('list', { name: 'Stages' }).getByRole('listitem')).toHaveCount(4);
  await panel.getByRole('tab', { name: 'JSON' }).click();
  await expect(panel.locator('pre').getByText('"status"')).toBeVisible();
  await expect(tripTitle(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Grounded in')).toBeVisible();
  // The plan was grounded in a web search, and its sources are listed as plain links.
  await expect(page.getByRole('link', { name: /en\.wikipedia\.org/ })).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Lisbon');
});

test('example chips send immediately', async ({ page }) => {
  await useLab(page, /Clean answer/);
  await page.getByRole('button', { name: 'Kyoto in autumn' }).click();
  await expect(tripTitle(page)).toBeVisible({ timeout: 15_000 });
});

test('streaming stays inside the preview and preserves manual scrolling', async ({ page, isMobile }) => {
  await useLab(page, /Clean answer/);
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (input !== '/api/itinerary') return original(input, init);
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          send({ type: 'stage', stage: 'searching', detail: 'Lisbon travel itinerary' });
          send({ type: 'sources', sources: [{ title: 'Lisbon', domain: 'en.wikipedia.org', url: 'https://en.wikipedia.org/wiki/Lisbon' }] });
          send({ type: 'stage', stage: 'drafting' });
          window.addEventListener('preview-test-chunk', (event) => send({ type: 'delta', text: (event as CustomEvent<string>).detail }));
        },
      });
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
  await plan(page);
  const panel = page.getByRole('region', { name: 'Generation progress' });
  const frame = panel.getByRole('region', { name: 'Live plan panel', exact: true }).locator(':scope > div');
  await page.evaluate(() => document.fonts.ready);
  await expect(panel.getByRole('group', { name: 'Source websites' }).locator('../..')).toHaveAttribute('style', /height: auto/);
  const initialHeight = (await frame.boundingBox())!.height;
  const stops = Array.from({ length: 24 }, (_, i) => JSON.stringify({ time: '10:00', title: `Stop ${i + 1}`, description: 'A detailed stop description with travel information and practical tips for exploring this part of the city.' })).join(',');
  const prefix = '{"status":"ok","itinerary":{"title":"Lisbon","destination":"Lisbon","days":[{"title":"Exploring Lisbon","stops":[';
  await page.evaluate((text) => window.dispatchEvent(new CustomEvent('preview-test-chunk', { detail: text })), prefix + stops);
  const preview = panel.getByRole('region', { name: 'Live itinerary preview', exact: true });
  await expect(preview.getByText('Stop 24', { exact: true })).toHaveCount(1);
  expect(Math.abs((await frame.boundingBox())!.height - initialHeight)).toBeLessThan(2);
  if (!isMobile) {
    const tasks = panel.getByRole('button', { name: 'Hide trip tasks' }).locator('..');
    const a = (await frame.boundingBox())!;
    const b = (await tasks.boundingBox())!;
    expect(Math.abs(a.y + a.height - b.y - b.height)).toBeLessThan(2);
  }
  await expect.poll(() => preview.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await preview.evaluate((el) => { el.scrollTop = 0; });
  await expect(panel.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('preview-test-chunk', { detail: ',{"time":"11:00","title":"Newest stop"}' })));
  await expect(preview.getByText('Newest stop', { exact: true })).toHaveCount(1);
  expect(await preview.evaluate((el) => el.scrollTop)).toBeLessThan(2);
  await panel.getByRole('button', { name: 'Jump to latest' }).click();
  await expect.poll(() => preview.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2);
  await panel.getByRole('tab', { name: 'JSON', exact: true }).click();
  expect(Math.abs((await frame.boundingBox())!.height - initialHeight)).toBeLessThan(2);
  await expect.poll(() => panel.getByLabel('Live trip data').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await panel.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('repairs malformed output once, without bothering the traveller', async ({ page }) => {
  await useLab(page, /Bad JSON, then fixed/);
  await plan(page);
  await expect(tripTitle(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failed run explains itself, offers a retry and keeps the plan', async ({ page }) => {
  await page.getByRole('button', { name: 'View sample' }).click();
  await useLab(page, /Bad JSON twice/);
  await plan(page);
  await expect(page.getByRole('alert').getByText('We couldn’t finish your plan')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Your current trip is unchanged.')).toBeVisible();
  await expect(tripTitle(page)).toBeVisible();
  await expect(page.getByText('Sample', { exact: true })).toBeVisible();

  await useLab(page, /Clean answer/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Grounded in')).toBeVisible({ timeout: 15_000 });
});

test('salvages partial output and lists what was cleaned up', async ({ page }) => {
  await useLab(page, /Partly broken stops/);
  await plan(page);
  await expect(tripTitle(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Removed 2 stops the model returned without a name.')).toBeVisible();
});

test('an unplannable brief gets guidance, not a fake plan', async ({ page }) => {
  await useLab(page, /Not a trip/);
  await plan(page, 'asdf qwerty zxcv');
  await expect(page.getByText('Tell us more about your trip')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
});

test('a stale response never replaces what the user switched to', async ({ page }) => {
  test.setTimeout(90_000);
  await useLab(page, /Slow model/);
  await plan(page, 'Ten days across Japan, mostly trains and food.');
  await expect(page.getByRole('button', { name: 'Hide thinking steps' })).toBeVisible();
  await page.getByRole('button', { name: 'View sample' }).click();
  await expect(page.getByText('Sample', { exact: true })).toBeVisible();
  await page.waitForTimeout(24_000); // longer than the slow simulation takes to finish
  await expect(page.getByText('Sample', { exact: true })).toBeVisible();
  await expect(page.getByText('Grounded in')).toHaveCount(0);
});

test('stop cancels the run cleanly', async ({ page }) => {
  await useLab(page, /Slow model/);
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/itinerary')) requests += 1;
  });
  await plan(page);
  await expect(page.getByText('Live plan', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(page.getByRole('button', { name: 'Hide thinking steps' })).toHaveCount(0);
  // Stop must not double as a submit: the send button is back and no second run was started.
  await expect(page.getByRole('button', { name: 'Plan this trip' })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(requests).toBe(1);
  await expect(page.getByRole('button', { name: 'Stop generating' })).toHaveCount(0);
  await expect(page.getByText('Day by day', { exact: true })).toBeVisible();
  // Nothing lands later, and the brief is still there to edit and resend.
  await expect(page.getByLabel('Describe your trip')).toHaveValue(BRIEF);
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
});

test('refinements are reviewed before they are applied', async ({ page }) => {
  await page.getByRole('button', { name: 'View sample' }).click();
  await useLab(page, /Clean answer/);
  await page.getByLabel('Describe a change to the plan').fill('Add a coffee stop on day one');
  await page.getByRole('button', { name: 'Send change request' }).click();
  const review = page.getByRole('region', { name: 'Review changes' });
  await expect(review).toBeVisible({ timeout: 15_000 });
  await review.getByRole('button', { name: 'Discard' }).click();
  await expect(review).toHaveCount(0);
});

test('removing stops keeps the selection in place, one toast, and an empty day offers a way out', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'the side window this checks is desktop-only');
  await page.getByRole('button', { name: 'View sample' }).click();
  await expect(tripTitle(page)).toBeVisible();
  // No API key on the test server: without the lab there is nothing to ask, so no "Suggest stops".
  await page.getByRole('tab', { name: /Day 02/ }).click();
  for (let i = 0; i < 6; i++)
    await page
      .locator('#trip')
      .getByRole('button', { name: /^Remove / })
      .first()
      .click();
  await expect(page.getByText('Day 02 is free')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suggest stops' })).toHaveCount(0);
  await useLab(page, /Clean answer/);
  await page.getByRole('tab', { name: /Day 01/ }).click();
  await openStop(page, 'Castelo de São Jorge');
  await page.getByRole('button', { name: 'Remove Castelo de São Jorge' }).click();
  // The stop that moved into its place is shown next, not the first stop of the day.
  await expect(page.locator('#trip h3')).toHaveText('Lunch at a tasca in Alfama');

  await page.getByRole('tab', { name: /Day 03/ }).click();
  for (let i = 0; i < 7; i++)
    await page
      .locator('#trip')
      .getByRole('button', { name: /^Remove / })
      .first()
      .click();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1);
  await expect(page.getByText('Day 03 is free')).toBeVisible();
  await page.getByRole('button', { name: 'Suggest stops' }).click();
  await expect(page.getByLabel('Describe a change to the plan')).toHaveValue('Add three or four stops to day 3');
  await expect(page.getByLabel('Describe a change to the plan')).toBeFocused();
});

test('layout never scrolls horizontally', async ({ page, isMobile }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'View sample' }).click();
  await expect(tripTitle(page)).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 700 });
    await expect.poll(overflow).toBeLessThanOrEqual(0);
  }
  await page.locator('#trip').screenshot({ path: testInfo.outputPath('trip.png') });
  await page.locator('#trip > div').first().screenshot({ path: testInfo.outputPath('trip-header.png') });
});
