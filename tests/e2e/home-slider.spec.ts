import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, refreshPublicCache } from './fixtures';
import { defaultHomeSlides } from '../../src/lib/home-slides';

test.use({ reducedMotion: 'no-preference' });

function slider(page: Page, thai = false) {
  return page.getByRole('region', { name: thai ? 'ภาพบรรยากาศการเดินเรือ' : 'Maritime highlights', exact: true });
}

async function expectHeroLayout(page: Page, ratio: number, thai = false) {
  const carousel = slider(page, thai);
  await expect(carousel).toBeVisible();
  const image = carousel.locator('img').first();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const frame = (await carousel.boundingBox())!;
  const heading = page.getByRole('heading', { level: 1 });
  const title = (await heading.boundingBox())!;
  expect(frame.width / frame.height).toBeCloseTo(ratio, 2);
  expect(title.y, 'introductory copy follows the image').toBeGreaterThanOrEqual(frame.y + frame.height);
  expect(title.x + title.width / 2, 'headline is horizontally centered').toBeCloseTo(page.viewportSize()!.width / 2, 0);
  await expect(heading).toHaveCSS('text-align', 'center');
  await expect(image).toHaveCSS('object-fit', 'cover');
  await expect(image).toHaveCSS('object-position', '50% 50%');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const action = page.getByRole('link', { name: thai ? 'ดูบริการของเรา' : 'Explore services', exact: true });
  const actionBox = (await action.boundingBox())!;
  expect(actionBox.y).toBeGreaterThan(title.y + title.height);
  return carousel;
}

async function saveScreenshot(page: Page, name: string) {
  await mkdir(path.resolve('docs/screenshots'), { recursive: true });
  await page.screenshot({ path: path.resolve(`docs/screenshots/${name}.png`), animations: 'disabled' });
}

test('desktop banner is 3:1 with centered copy and actions underneath', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const carousel = await expectHeroLayout(page, 3);
  await expect(carousel.locator('img')).toHaveCount(5);
  await expect(carousel.getByRole('group')).toHaveCount(1);
  await saveScreenshot(page, `hero-en-desktop-${testInfo.project.name}`);
});

test('390px mobile crops both sides to 16:9 and localizes the complete hero', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectHeroLayout(page, 16 / 9);
  await saveScreenshot(page, `hero-en-mobile-390-${testInfo.project.name}`);
  await page.goto('/th');
  const carousel = await expectHeroLayout(page, 16 / 9, true);
  await expect(carousel.getByRole('button', { name: 'สไลด์ถัดไป', exact: true })).toBeVisible();
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', defaultHomeSlides[0].altTh);
  await carousel.getByRole('button', { name: 'สไลด์ถัดไป', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', defaultHomeSlides[1].altTh);
  await saveScreenshot(page, `hero-th-mobile-390-${testInfo.project.name}`);
});

test('320px mobile keeps all five-slide controls usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 1050 });
  await page.goto('/');
  const carousel = await expectHeroLayout(page, 16 / 9);
  await carousel.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
  await carousel.getByRole('button', { name: 'Previous slide', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  await expect(carousel.getByRole('button', { name: 'Play slideshow', exact: true })).toBeVisible();
  await saveScreenshot(page, `hero-en-mobile-320-${testInfo.project.name}`);
});

test('default autoplay advances at three seconds and pauses while hovered', async ({ page }) => {
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await carousel.hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  const start = Number(await carousel.getAttribute('data-slide-index'));
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  // Real pointer events and their effects must settle on the native browser
  // clock. A duration check here verifies the three-second behavior itself.
  await page.waitForTimeout(2500);
  await expect(carousel).toHaveAttribute('data-slide-index', String(start));
  await expect(carousel).toHaveAttribute('data-slide-index', String((start + 1) % 5), { timeout: 4500 });
  await carousel.hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await page.waitForTimeout(3200);
  await expect(carousel).toHaveAttribute('data-slide-index', String((start + 1) % 5));
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await expect(carousel).toHaveAttribute('data-slide-index', String((start + 2) % 5), { timeout: 4500 });
});

test('pause persists after the first pointer click and navigation supports keyboard wrapping', async ({ page }) => {
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await carousel.getByRole('button', { name: 'Pause slideshow', exact: true }).click();
  await page.getByRole('banner').hover();
  await expect(carousel.getByRole('button', { name: 'Play slideshow', exact: true })).toBeVisible();
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  const pausedIndex = await carousel.getAttribute('data-slide-index');
  await page.waitForTimeout(3200);
  await expect(carousel).toHaveAttribute('data-slide-index', pausedIndex!);
  await carousel.getByRole('button', { name: 'Show slide 1', exact: true }).click();
  const previous = carousel.getByRole('button', { name: 'Previous slide', exact: true });
  await previous.press('ArrowLeft');
  await expect(carousel).toHaveAttribute('data-slide-index', '4');
  await previous.press('ArrowRight');
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  await carousel.getByRole('button', { name: 'Show slide 3', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '2');
  await expect(carousel.getByRole('button', { name: 'Show slide 3', exact: true })).toHaveAttribute('aria-current', 'true');
  await carousel.getByRole('button', { name: 'Play slideshow', exact: true }).click();
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await expect(carousel).toHaveAttribute('data-slide-index', '3', { timeout: 4500 });
  await page.keyboard.press('Tab');
  await carousel.getByRole('button', { name: 'Next slide', exact: true }).focus();
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
});

test('reduced motion disables rotation while preserving manual controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await expect(carousel.getByRole('button', { name: /slideshow/ })).toHaveCount(0);
  await page.clock.install();
  await page.clock.fastForward(9000);
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  await carousel.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
  await expect(carousel.getByRole('group')).toHaveAttribute('aria-label', '2 of 5');
});

test('the saved interval controls public autoplay', async ({ page, db }) => {
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { heroSlideInterval: 6 } });
  await refreshPublicCache();
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  const start = Number(await carousel.getAttribute('data-slide-index'));
  // Native browser timing avoids virtual-clock races with React effects in WebKit.
  await page.waitForTimeout(5000);
  await expect(carousel).toHaveAttribute('data-slide-index', String(start));
  await expect(carousel).toHaveAttribute('data-slide-index', String((start + 1) % 5), { timeout: 4500 });
});

test('one saved slide renders without rotation or redundant controls', async ({ page, db }) => {
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { heroSlides: [{ ...defaultHomeSlides[3] }] } });
  await refreshPublicCache();
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel.locator('img')).toHaveCount(1);
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', defaultHomeSlides[3].alt);
  await expect(carousel.getByRole('button')).toHaveCount(0);
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await page.clock.install();
  await page.clock.fastForward(9000);
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
});

for (const width of [320, 390, 768]) {
  test.describe(`twelve slides at ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });

    test('keeps all navigation reachable', async ({ page, db }) => {
      const slides = Array.from({ length: 12 }, (_, index) => ({ url: `${defaultHomeSlides[index % 5].url}?fixture=${index}`, alt: `Test slide ${index + 1}`, altTh: `ภาพทดสอบ ${index + 1}` }));
      await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { heroSlides: slides } });
      await refreshPublicCache();
      await page.goto('/');
      const carousel = slider(page);
      await expectHeroLayout(page, width <= 700 ? 16 / 9 : 3);
      await carousel.getByRole('button', { name: 'Show slide 12', exact: true }).click();
      await expect(carousel).toHaveAttribute('data-slide-index', '11');
      for (const name of ['Previous slide', 'Next slide']) {
        const control = carousel.getByRole('button', { name, exact: true });
        const bounds = (await control.boundingBox())!;
        expect(bounds.x, name).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width, name).toBeLessThanOrEqual(width);
        await expect(control).toBeInViewport();
      }
      await carousel.getByRole('button', { name: 'Next slide', exact: true }).click();
      await expect(carousel).toHaveAttribute('data-slide-index', '0');
    });
  });
}

test.describe('touch pointer navigation', () => {
  test.use({ viewport: { width: 390, height: 1000 }, hasTouch: true, reducedMotion: 'reduce' });

  test('advances horizontal gestures and ignores vertical movement', async ({ page }) => {
    await page.goto('/');
    const carousel = slider(page);
    await expect(carousel).toHaveAttribute('data-slide-index', '0');
    const bounds = (await carousel.boundingBox())!;
    const y = bounds.y + bounds.height / 3;
    const pointer = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 };
    await carousel.dispatchEvent('pointerdown', { ...pointer, clientX: 250, clientY: y });
    await carousel.dispatchEvent('pointerup', { ...pointer, clientX: 245, clientY: y + 70 });
    await expect(carousel).toHaveAttribute('data-slide-index', '0');
    await carousel.dispatchEvent('pointerdown', { ...pointer, clientX: 290, clientY: y });
    await carousel.dispatchEvent('pointerup', { ...pointer, clientX: 90, clientY: y + 5 });
    await expect(carousel).toHaveAttribute('data-slide-index', '1');
    await carousel.dispatchEvent('pointerdown', { ...pointer, clientX: 90, clientY: y });
    await carousel.dispatchEvent('pointerup', { ...pointer, clientX: 290, clientY: y + 5 });
    await expect(carousel).toHaveAttribute('data-slide-index', '0');
  });
});
