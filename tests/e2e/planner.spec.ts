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
  await page.getByRole('list', { name: /^Stops for/ }).getByRole('button', { name: new RegExp(title) }).first().click();
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
  await expect(first).toContainText('08:30');

  await page.getByRole('button', { name: 'Save trip' }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

  await page.reload();
  await expect(tripTitle(page)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Stops for Alfama and the river' }).locator(':scope > li').first()).toContainText('Miradouro da Senhora do Monte');
});

test('previews the plan as it streams, then renders only the validated plan', async ({ page }) => {
  test.setTimeout(90_000);
  await useLab(page, /Slow model/);
  await plan(page);
  await expect(page.getByText('Planning your trip…')).toBeVisible();
  await expect(page.getByText('Live plan', { exact: true })).toBeVisible();
  // The preview fills in from the partial JSON: the title shows up before the run is done.
  const panel = page.getByRole('region', { name: 'Generation progress' });
  await expect(panel.getByText('Three slow days in Lisbon')).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('tab', { name: 'JSON' }).click();
  await expect(panel.locator('pre').getByText('"status"')).toBeVisible();
  await expect(tripTitle(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
});

test('example chips send immediately', async ({ page }) => {
  await useLab(page, /Clean answer/);
  await page.getByRole('button', { name: 'Kyoto in autumn' }).click();
  await expect(tripTitle(page)).toBeVisible({ timeout: 15_000 });
});

test('repairs malformed output once and says so', async ({ page }) => {
  await useLab(page, /Bad JSON, then fixed/);
  await plan(page);
  await expect(page.getByText('Corrected after a retry')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('The first draft had a formatting issue.')).toBeVisible();
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
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 15_000 });
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
  await expect(page.getByText('Planning your trip…')).toBeVisible();
  await page.getByRole('button', { name: 'View sample' }).click();
  await expect(page.getByText('Sample', { exact: true })).toBeVisible();
  await page.waitForTimeout(24_000); // longer than the slow simulation takes to finish
  await expect(page.getByText('Sample', { exact: true })).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(0);
});

test('stop cancels the run cleanly', async ({ page }) => {
  await useLab(page, /Slow model/);
  await plan(page);
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(page.getByText('Planning your trip…')).toHaveCount(0);
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

test('layout never scrolls horizontally', async ({ page }) => {
  await page.getByRole('button', { name: 'View sample' }).click();
  await expect(tripTitle(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
