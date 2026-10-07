import { expect, type Page } from '@playwright/test';

/** Opens the app and waits until it is interactive. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** Current global iteration count, read from the viewport. */
export async function iteration(page: Page): Promise<number> {
  return Number(await page.getByTestId('viewport').getAttribute('data-iteration'));
}

export async function waitForIteration(page: Page, n: number, timeout = 30_000): Promise<void> {
  await expect.poll(() => iteration(page), { timeout }).toBeGreaterThanOrEqual(n);
}

export async function compliance(page: Page): Promise<number> {
  return Number((await page.getByTestId('compliance').textContent())?.trim());
}

export async function isPhone(page: Page): Promise<boolean> {
  return (page.viewportSize()?.width ?? 1440) < 700;
}

/** Opens the place where presets, parameters and export live on this layout. */
export async function openSetup(page: Page): Promise<void> {
  if (await isPhone(page)) {
    await page.getByTestId('open-sheet').click();
    await expect(page.getByTestId('sheet')).toBeVisible();
  }
}

export async function choosePreset(page: Page, id: string): Promise<void> {
  await openSetup(page);
  await page.getByTestId(`preset-${id}`).click();
}
