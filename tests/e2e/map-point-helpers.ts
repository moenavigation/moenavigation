import { expect, type Locator, type Page } from '@playwright/test';

/** A partly clipped point must stay under the pointer until pointerup. */
export async function clickClippedMapPoint(page: Page, map: Locator, marker: Locator) {
  await map.scrollIntoViewIfNeeded();
  await map.focus();
  const before = await marker.boundingBox();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await marker.boundingBox())!.x).toBeCloseTo(before!.x - 80, 0);
  const bounds = (await map.boundingBox())!;
  const point = (await marker.boundingBox())!;
  const delta = bounds.x + 12 - (point.x + point.width / 2);
  const start = { x: bounds.x + bounds.width * .8, y: bounds.y + bounds.height * .25 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta, start.y, { steps: 8 });
  // Pause the drag before releasing so Leaflet does not add an inertial pan.
  await page.waitForTimeout(100);
  await page.mouse.up();
  const clipped = (await marker.boundingBox())!;
  expect(clipped.x).toBeLessThan(bounds.x);
  expect(clipped.x + clipped.width).toBeGreaterThan(bounds.x);
  await page.mouse.move(clipped.x + clipped.width / 2, clipped.y + clipped.height / 2);
  await page.mouse.down();
  try {
    const focused = (await marker.boundingBox())!;
    expect(focused.x).toBeCloseTo(clipped.x, 0);
    expect(focused.y).toBeCloseTo(clipped.y, 0);
  } finally { await page.mouse.up(); }
}
