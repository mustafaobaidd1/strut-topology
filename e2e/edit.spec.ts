import { expect, test, type Page } from '@playwright/test';
import { openApp, waitForIteration } from './helpers';

async function centroid(page: Page): Promise<[number, number]> {
  const v = (await page.getByTestId('viewport').getAttribute('data-centroid')) ?? '0,0';
  const [x, y] = v.split(',').map(Number);
  return [x, y];
}

test('dragging the load re-optimises and changes the design', async ({ page }) => {
  await openApp(page);
  await waitForIteration(page, 40);
  const before = await centroid(page);
  const handle = page.getByTestId('handle-load-anchor').first();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const domain = ((await page.getByTestId('viewport').getAttribute('data-domain')) ?? '0,0,100')
    .split(',')
    .map(Number);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Lift the deck to 80 % of the height in small steps, like a hand would.
  const lift = domain[2] * 0.5;
  for (let k = 1; k <= 10; k++) await page.mouse.move(x, y - (lift * k) / 10);
  await page.mouse.up();
  await expect(page.getByTestId('canvas-status')).toContainText(/Solving|Converged/);
  await expect
    .poll(async () => Math.abs((await centroid(page))[1] - before[1]), { timeout: 20_000 })
    .toBeGreaterThan(1.5);
});

test('keyboard: a focused load moves with the arrow keys', async ({ page }) => {
  await openApp(page);
  const handle = page.getByTestId('handle-load-anchor').first();
  await handle.focus();
  const label = (await handle.getAttribute('aria-label')) ?? '';
  const y0 = Number(/y (\d\.\d\d)/.exec(label)?.[1]);
  await page.keyboard.press('Shift+ArrowUp');
  await expect
    .poll(async () =>
      Number(/y (\d\.\d\d)/.exec((await handle.getAttribute('aria-label')) ?? '')?.[1]),
    )
    .toBeGreaterThan(y0);
});

test('removing every support explains the problem and undo recovers', async ({ page }) => {
  await openApp(page);
  const supports = page.getByTestId('handle-support-move');
  await expect(supports).toHaveCount(2);
  await supports.first().focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('issue')).toContainText('slide or spin');
  await page.getByTestId('handle-support-move').first().focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('issue')).toContainText(
    'The structure can fly away — add at least one fixed support',
  );
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByTestId('issue')).toHaveCount(0);
  await expect(page.getByTestId('handle-support-move')).toHaveCount(2);
});

test('removing the load says there is nothing to resist', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('handle-load-anchor').first().focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('issue')).toContainText('Nothing to resist');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('issue')).toHaveCount(0);
});
