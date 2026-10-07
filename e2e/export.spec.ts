import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { isPhone, openApp, openSetup, waitForIteration } from './helpers';

async function openExport(page: Page) {
  if (await isPhone(page)) await openSetup(page);
  else await page.getByTestId('export-menu').click();
}

test('exporting SVG produces a non-empty, millimetre-sized cut file', async ({ page }) => {
  await openApp(page);
  await waitForIteration(page, 40);
  await openExport(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-svg').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^strut-bridge-\d+x\d+-vf20-it\d+\.svg$/);
  const svg = await readFile((await download.path())!, 'utf8');
  expect(svg.length).toBeGreaterThan(500);
  expect(svg).toContain('width="200.00mm"');
  expect(svg).toMatch(/<path d="M[\d.]+ [\d.]+C/);
  await expect(page.getByTestId('toasts')).toContainText('Saved strut-bridge');
});

test('exporting STL produces a binary mesh', async ({ page }) => {
  await openApp(page);
  await waitForIteration(page, 40);
  await openExport(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-stl').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.stl$/);
  const buf = await readFile((await download.path())!);
  const triangles = buf.readUInt32LE(80);
  expect(triangles).toBeGreaterThan(100);
  expect(buf.length).toBe(84 + 50 * triangles);
});
