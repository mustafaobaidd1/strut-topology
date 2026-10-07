import { expect, test } from '@playwright/test';
import { isPhone, openApp, openSetup } from './helpers';

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('starts paused with a clear button, then shows the finished result', async ({ page }) => {
    await openApp(page);
    const go = page.getByRole('button', { name: 'Optimise this design' });
    await expect(go).toBeVisible();
    await expect(page.getByTestId('canvas-status')).toContainText('Ready');
    await go.click();
    await expect(page.getByTestId('canvas-status')).toContainText(/Converged|Stopped/, {
      timeout: 60_000,
    });
    expect(Number(await page.getByTestId('compliance').textContent())).toBeGreaterThan(0);
  });
});

test('the 88-line reference reproduces the published compliance', async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  if (await isPhone(page)) {
    await openSetup(page);
    await page.getByRole('button', { name: 'Run the 88-line reference' }).click();
  } else {
    await page.getByTestId('enter-reference').click();
  }
  const panel = page.getByTestId('reference-panel').first();
  await expect(panel.getByTestId('reference-result')).toHaveText('c = 233.71', {
    timeout: 60_000,
  });
  await expect(panel).toContainText('Matches the published value');
});

test('how it works opens with typeset equations and closes with Escape', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'How it works' }).click();
  const dialog = page.getByTestId('how-it-works');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.katex').first()).toBeVisible();
  await expect(dialog).toContainText('216.81');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('if the worker cannot start, the solver falls back to the main thread', async ({ page }) => {
  await page.route('**/*solver.worker*', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(page.getByText('runs on the main thread')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => Number(await page.getByTestId('viewport').getAttribute('data-iteration')), {
      timeout: 30_000,
    })
    .toBeGreaterThan(5);
});
