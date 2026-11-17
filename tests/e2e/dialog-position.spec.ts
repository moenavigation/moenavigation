import type { Locator, Page } from '@playwright/test';
import { test, expect, login } from './fixtures';

type Position = { scrollX: number; scrollY: number; headerX: number; headerWidth: number; contentX: number; contentWidth: number };

async function position(page: Page): Promise<Position> {
  return page.evaluate(() => {
    const header = document.querySelector('[data-site-header], [data-cms-root] > header');
    const content = document.querySelector('[data-cms-root] > main, #main .container');
    if (!header || !content) throw new Error('The page layout is not ready to measure.');
    const h = header.getBoundingClientRect(), c = content.getBoundingClientRect();
    return { scrollX, scrollY, headerX: h.x, headerWidth: h.width, contentX: c.x, contentWidth: c.width };
  });
}

async function unchanged(page: Page, before: Position) {
  const after = await position(page);
  for (const field of Object.keys(before) as (keyof Position)[]) {
    expect(Math.abs(after[field] - before[field]), `${field} must remain fixed while a dialog opens or closes`).toBeLessThanOrEqual(.5);
  }
}

async function readyToOpen(page: Page, trigger: Locator) {
  await page.evaluate(() => document.fonts.ready);
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeInViewport();
  // Measure only after any scrolling needed to reach the opener has finished.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return position(page);
}

async function dismiss(page: Page, dialog: Locator, method: 'close' | 'escape' | 'outside', closeLabel: string) {
  if (method === 'close') await dialog.getByRole('button', { name: closeLabel, exact: true }).click();
  else if (method === 'escape') await page.keyboard.press('Escape');
  else {
    const bounds = (await dialog.boundingBox())!;
    await page.mouse.click(Math.max(1, bounds.x - 5), bounds.y + Math.min(bounds.height / 2, 100));
  }
  await expect(dialog).not.toBeVisible();
}

for (const width of [390, 1440]) test.describe(`dialog background position at ${width}px`, () => {
  test.use({ viewport: { width, height: width < 700 ? 844 : 1000 }, reducedMotion: 'no-preference' });

  test('public selection dialogs preserve the scrolled page and layout on open and every dismissal', async ({ page }) => {
    await page.goto('/routes');
    const trigger = page.getByRole('region', { name: 'Find a route', exact: true }).getByRole('button', { name: 'Origin', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Origin', exact: true });
    // Put the opener below the sticky header before recording the baseline.
    await trigger.evaluate(element => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      const header = document.querySelector('[data-site-header]')!.getBoundingClientRect().height;
      window.scrollTo({ top: Math.max(0, top - header - 80), behavior: 'instant' });
    });
    for (const method of ['close', 'escape', 'outside'] as const) {
      const before = await readyToOpen(page, trigger);
      await trigger.click();
      await expect(dialog).toBeVisible();
      await unchanged(page, before);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await unchanged(page, before);
      await dismiss(page, dialog, method, 'Close dialog');
      await expect(trigger).toBeFocused();
      await unchanged(page, before);
    }
  });

  test('CMS parent and nested selection dialogs preserve the document and parent scroll position', async ({ page }) => {
    await login(page);
    const opener = page.getByRole('button', { name: /^Attention/ });
    const beforeParent = await readyToOpen(page, opener);
    await opener.click();
    const parent = page.getByRole('dialog', { name: 'Content needing attention', exact: true });
    await expect(parent).toBeVisible();
    await unchanged(page, beforeParent);
    const trigger = parent.getByRole('button', { name: 'Content type', exact: true });
    const nested = page.getByRole('dialog', { name: 'Content type', exact: true });
    for (const method of ['close', 'escape', 'outside'] as const) {
      const before = await readyToOpen(page, trigger);
      const parentScroll = await parent.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }));
      await trigger.click();
      await expect(nested).toBeVisible();
      await unchanged(page, before);
      expect(await parent.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }))).toEqual(parentScroll);
      await dismiss(page, nested, method, 'Close dialog');
      await expect(parent).toBeVisible();
      await expect(trigger).toBeFocused();
      await unchanged(page, before);
      expect(await parent.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }))).toEqual(parentScroll);
    }
    await parent.getByRole('button', { name: 'Close attention review', exact: true }).click();
    await expect(parent).not.toBeVisible();
    await expect(opener).toBeFocused();
    await unchanged(page, beforeParent);
  });
});
