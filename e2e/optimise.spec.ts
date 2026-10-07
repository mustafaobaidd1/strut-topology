import { expect, test } from '@playwright/test';
import { choosePreset, compliance, iteration, openApp, waitForIteration } from './helpers';

test('the first screen grows a design on its own: compliance falls as iterations run', async ({
  page,
}) => {
  await openApp(page);
  await waitForIteration(page, 3);
  const early = await compliance(page);
  await waitForIteration(page, 25);
  const later = await compliance(page);
  expect(later).toBeLessThan(early);
  await expect(page.getByTestId('chart')).toHaveAttribute('aria-label', /Compliance went from/);
});

test('picking a preset and running it lowers the compliance over iterations', async ({ page }) => {
  await openApp(page);
  await choosePreset(page, 'cantilever');
  await expect(page.getByTestId('preset-cantilever')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); // closes the phone sheet if open
  const start = await iteration(page);
  await waitForIteration(page, start + 4);
  const c1 = await compliance(page);
  await waitForIteration(page, start + 30);
  const c2 = await compliance(page);
  expect(c2).toBeLessThan(c1);
});

test('pause stops the iterations and step advances exactly one', async ({ page }) => {
  await openApp(page);
  await waitForIteration(page, 5);
  await page.getByTestId('play').click(); // pause
  await expect(page.getByTestId('canvas-status')).toContainText('Paused');
  const it = await iteration(page);
  await page.waitForTimeout(600);
  expect(await iteration(page)).toBe(it);
  await page.getByTestId('step').click();
  await expect.poll(() => iteration(page)).toBe(it + 1);
});

test('switching views shows the stress legend', async ({ page }) => {
  await openApp(page);
  await waitForIteration(page, 5);
  await page.getByTestId('view-stress').click();
  await expect(page.getByText('von Mises stress')).toBeVisible();
  await page.getByTestId('view-deformed').click();
  await expect(page.getByText('displacements exaggerated')).toBeVisible();
});
