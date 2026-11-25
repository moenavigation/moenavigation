import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, refreshPublicCache, E2E_IMAGE_BUFFER, E2E_BASE_URL } from './fixtures';
import { defaultHomeSlides, fleetPhotoSlides, homeSlideVideoPoster } from '../../src/lib/home-slides';

test.use({ reducedMotion: 'no-preference' });

function slider(page: Page, thai = false) {
  return page.getByRole('region', { name: thai ? 'ภาพบรรยากาศการเดินเรือ' : 'Maritime highlights', exact: true });
}

// The real media tests exercise decoding. These event tests run independently
// of the codecs available to each browser, including Windows WebKit.
async function simulateClipPlayback(page: Page, urls: string[], blocked = false) {
  await page.addInitScript(({ urls, blocked }) => {
    function matches(target: EventTarget | null) {
      const video = target instanceof HTMLSourceElement ? target.parentElement : target;
      return video instanceof HTMLVideoElement && (urls.includes(video.getAttribute('src') || '')
        || Array.from(video.querySelectorAll('source')).some(source => urls.includes(source.getAttribute('src') || '')));
    }
    window.addEventListener('error', event => {
      if (matches(event.target)) event.stopImmediatePropagation();
    }, true);
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!matches(this)) return originalPlay.call(this);
      Object.defineProperty(this, 'error', { configurable: true, value: null });
      this.dataset.playAttempts = String(Number(this.dataset.playAttempts || 0) + 1);
      if (blocked) return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
  }, { urls, blocked });
}

async function expectClipToAdvance(banner: Locator, nextIndex: number) {
  const activeVideo = banner.getByRole('group').locator('video');
  await expect(activeVideo).toHaveAttribute('data-play-attempts', /^[1-9]\d*$/);
  const play = banner.getByRole('button', { name: 'Play video', exact: true });
  await expect(play).toHaveCount(0);
  // Inspect appended nodes as well as the final state to catch a Play button
  // that appears for a single render between the end event and the next slide.
  const stopWatching = await banner.evaluateHandle(element => {
    const selector = 'button[aria-label="Play video"]';
    let appeared = false;
    const observer = new MutationObserver(records => {
      for (const { addedNodes } of records) {
        for (const node of addedNodes) {
          if (node instanceof Element && (node.matches(selector) || node.querySelector(selector))) appeared = true;
        }
      }
    });
    observer.observe(element, { childList: true, subtree: true });
    return () => { observer.disconnect(); return appeared; };
  });
  try {
    await activeVideo.dispatchEvent('ended');
    await expect(banner).toHaveAttribute('data-slide-index', String(nextIndex), { timeout: 2500 });
    expect(await stopWatching.evaluate(stop => stop()), 'the finished clip never offers replay during the transition').toBe(false);
  } finally {
    await stopWatching.dispose();
  }
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
  // The stable scrollbar gutter reserves space outside the rendered canvas.
  expect(title.x + title.width / 2, 'headline is horizontally centered within the banner canvas').toBeCloseTo(frame.x + frame.width / 2, 0);
  await expect(heading).toHaveCSS('text-align', 'center');
  await expect(image).toHaveCSS('object-fit', 'cover');
  await expect(image).toHaveCSS('object-position', '50% 50%');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const action = page.getByRole('link', { name: thai ? 'ดูบริการของเรา' : 'Explore Our Services', exact: true });
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
  const shareUrl = E2E_BASE_URL + '/images/fleet-originals/moe-line-3.webp';
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', shareUrl);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', shareUrl);
  await expect(carousel.locator('img')).toHaveCount(5);
  await expect(carousel.getByRole('group')).toHaveCount(1);
  await expect(carousel.getByRole('button')).toHaveCount(5);
  await expect(carousel.getByRole('button', { name: /Previous|Next|slideshow/ })).toHaveCount(0);
  await saveScreenshot(page, `hero-en-desktop-${testInfo.project.name}`);
});

test('390px mobile loads the 16:9 photograph and localizes the complete hero', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectHeroLayout(page, 16 / 9);
  await saveScreenshot(page, `hero-en-mobile-390-${testInfo.project.name}`);
  await page.goto('/th');
  const carousel = await expectHeroLayout(page, 16 / 9, true);
  await expect.poll(() => carousel.getByRole('img').evaluate(el => (el as HTMLImageElement).currentSrc)).toContain('-mobile.webp');
  await expect(carousel.getByRole('button', { name: 'แสดงสไลด์ 2', exact: true })).toBeVisible();
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', fleetPhotoSlides[0].altTh);
  await carousel.getByRole('button', { name: 'แสดงสไลด์ 2', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', fleetPhotoSlides[1].altTh);
  await saveScreenshot(page, `hero-th-mobile-390-${testInfo.project.name}`);
});

test('320px mobile keeps all five-slide controls usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 1050 });
  await page.goto('/');
  const carousel = await expectHeroLayout(page, 16 / 9);
  await carousel.getByRole('button', { name: 'Show slide 2', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
  await carousel.getByRole('button', { name: 'Show slide 1', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  await expect(carousel.getByRole('button')).toHaveCount(5);
  await saveScreenshot(page, `hero-en-mobile-320-${testInfo.project.name}`);
});

test('default autoplay advances at three seconds and pauses while hovered', async ({ page }) => {
  await page.goto('/');
  const carousel = slider(page);
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

test('autoplay resumes after manual selection and keyboard focus pauses it', async ({ page }) => {
  await page.goto('/');
  const carousel = slider(page);
  await carousel.hover();
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await carousel.getByRole('button', { name: 'Show slide 1', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await expect(carousel).toHaveAttribute('data-slide-index', '1', { timeout: 4500 });
  await carousel.getByRole('button', { name: 'Show slide 1', exact: true }).focus();
  const previous = carousel.getByRole('button', { name: 'Show slide 1', exact: true });
  await previous.press('Enter');
  await previous.press('ArrowLeft');
  await expect(carousel).toHaveAttribute('data-slide-index', '4');
  await previous.press('ArrowRight');
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await page.waitForTimeout(3200);
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  // Moving backward from the first indicator keeps the carousel onscreen.
  // Focusing the CTA below it can correctly pause rotation as it scrolls away.
  await previous.press('Shift+Tab');
  await expect.poll(() => carousel.evaluate(element => element.contains(document.activeElement))).toBe(false);
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await carousel.getByRole('button', { name: 'Show slide 3', exact: true }).click();
  await expect(carousel).toHaveAttribute('data-slide-index', '2');
  await expect(carousel.getByRole('button', { name: 'Show slide 3', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
});

test('clicking the banner pauses while hovered and resumes after the pointer leaves', async ({ page }) => {
  await page.goto('/');
  const carousel = slider(page);
  await carousel.hover();
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  const start = Number(await carousel.getAttribute('data-slide-index'));
  await carousel.click({ position: { x: 150, y: 80 } });
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await page.waitForTimeout(3200);
  await expect(carousel).toHaveAttribute('data-slide-index', String(start));
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await expect(carousel).toHaveAttribute('data-slide-index', String((start + 1) % 5), { timeout: 4500 });
});

test('mouse dragging changes slides in both directions, wraps, and resumes autoplay on leave', async ({ page }) => {
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  const bounds = (await carousel.boundingBox())!;
  const left = bounds.x + bounds.width * 0.25;
  const right = bounds.x + bounds.width * 0.75;
  const y = bounds.y + bounds.height / 3;
  async function drag(startX: number, endX: number, endY = y) {
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 8 });
    await page.mouse.up();
  }

  await drag(right, left);
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
  await drag(left, right);
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  await drag(left, right);
  await expect(carousel).toHaveAttribute('data-slide-index', '4');
  await drag(right, right - 15);
  await expect(carousel).toHaveAttribute('data-slide-index', '4');
  await drag(left, left + 10, y + 90);
  await expect(carousel).toHaveAttribute('data-slide-index', '4');
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await expect(carousel).toHaveAttribute('data-slide-index', '0', { timeout: 4500 });
});

test('mouse drag can finish outside the banner without leaving a stuck gesture', async ({ page }) => {
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
  const bounds = (await carousel.boundingBox())!;
  const y = bounds.y + bounds.height / 3;
  await page.mouse.move(bounds.x + bounds.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.85, bounds.y + bounds.height + 40, { steps: 10 });
  await page.mouse.up();
  await expect(carousel).toHaveAttribute('data-slide-index', '4');
  await carousel.hover();
  await page.getByRole('banner').hover();
  await expect(carousel).toHaveAttribute('data-slide-index', '4');
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
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
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await carousel.getByRole('button', { name: 'Show slide 2', exact: true }).click();
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
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { heroSlides: [{ ...fleetPhotoSlides[3] }] } });
  await refreshPublicCache();
  await page.goto('/');
  const carousel = slider(page);
  await expect(carousel.locator('img')).toHaveCount(1);
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', fleetPhotoSlides[3].alt);
  await expect(carousel.getByRole('button')).toHaveCount(0);
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await page.clock.install();
  await page.clock.fastForward(9000);
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
});

test('video slides play silently to completion and offer Play for reduced motion on mobile', async ({ page, db, browserName }) => {
  const url = 'https://res.cloudinary.com/moe-e2e/video/upload/v1/harbor.mp4';
  const bytes = await readFile(path.resolve('tests/fixtures/banner-video.mp4'));
  await page.route('**/video/upload/so_0/**', route => route.fulfill({ contentType: 'image/png', body: E2E_IMAGE_BUFFER }));
  await page.route('**/video/upload/**/harbor.mp4', route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    if (!range) return route.fulfill({ contentType: 'video/mp4', body: bytes });
    const start = Number(range[1]);
    const end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
    return route.fulfill({ status: 206, contentType: 'video/mp4',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
      body: bytes.subarray(start, end + 1) });
  });
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: {
    heroSlideInterval: 2, heroSlides: [{ kind: 'video', url, alt: 'Harbor video', altTh: 'วิดีโอท่าเรือ' }, fleetPhotoSlides[0]],
  } });
  await refreshPublicCache();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/th');
  const carousel = slider(page, true);
  const video = carousel.locator('video');
  const play = carousel.getByRole('button', { name: 'เล่นวิดีโอ', exact: true });
  const pause = carousel.getByRole('button', { name: 'หยุดวิดีโอชั่วคราว', exact: true, includeHidden: true });
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', url.replace('/upload/', '/upload/so_0/').replace('.mp4', '.jpg'));
  await expect(video).toHaveAttribute('aria-label', 'วิดีโอท่าเรือ');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).toHaveAttribute('poster', /so_0\/v1\/harbor.jpg/);
  await expect(video).toHaveCSS('object-fit', 'cover');
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted && element.paused)).toBe(true);
  await expect(play).toBeVisible();
  await expect(pause).toHaveCount(0);
  if (browserName === 'webkit' && process.platform === 'win32') {
    // Some Windows WebKit builds advertise MP4 support without a working decoder.
    // Check the fixture independently so a carousel regression still fails here.
    const decodes = await page.evaluate(async src => {
      const probe = document.createElement('video');
      probe.muted = true;
      probe.playsInline = true;
      probe.src = src;
      document.body.append(probe);
      let timer: number | undefined;
      try {
        return await Promise.race([
          probe.play().then(() => true),
          new Promise<boolean>(resolve => { timer = window.setTimeout(() => resolve(false), 5000); }),
        ]);
      }
      catch { return false; }
      finally { window.clearTimeout(timer); probe.pause(); probe.remove(); }
    }, url);
    if (!decodes) {
      await page.getByRole('banner').hover();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect(carousel).toHaveAttribute('data-slide-index', '1', { timeout: 18000 });
      return;
    }
  }
  await play.click();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime > 0 && element.muted && !element.paused && !element.controls)).toBe(true);
  await expect(play).toHaveCount(0);
  await expect(pause).toHaveCount(0);
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = element.duration - 0.25; });
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await expect(play).toHaveCount(0);
  await carousel.getByRole('button', { name: 'แสดงสไลด์ 1', exact: true }).click();
  await page.getByRole('banner').hover();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(2.1);
  await expect(pause).toHaveCount(0);
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
});

test('a finished video advances while hovered and the last video wraps with keyboard focus', async ({ page, db }) => {
  const [lead, photo, last] = defaultHomeSlides;
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: {
    heroSlides: [lead, photo, last], heroSlideInterval: 15,
  } });
  await refreshPublicCache();
  await simulateClipPlayback(page, [lead.url, last.url]);
  await page.goto('/');
  const carousel = slider(page);
  await carousel.hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await expectClipToAdvance(carousel, 1);
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', photo.alt);

  await page.getByRole('banner').hover();
  const secondDot = carousel.getByRole('button', { name: 'Show slide 2', exact: true });
  await secondDot.press('ArrowRight');
  await expect(secondDot).toBeFocused();
  await expect(carousel).toHaveAttribute('data-slide-index', '2');
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await expectClipToAdvance(carousel, 0);
  await expect(carousel.getByRole('group').locator('video')).toHaveAttribute('aria-label', lead.alt);
  await expect(carousel.locator('button:focus')).toHaveCount(1);

  // A drag started on the finished clip advances the carousel only once.
  const frame = (await carousel.boundingBox())!;
  const y = frame.y + frame.height / 3;
  await page.mouse.move(frame.x + frame.width * 0.6, y);
  await page.mouse.down();
  await expectClipToAdvance(carousel, 1);
  await page.mouse.move(frame.x + frame.width * 0.4, y, { steps: 4 });
  await page.mouse.up();
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
});

test('manually finishing a video in reduced motion advances once and leaves the following still in place', async ({ page, db }) => {
  const [clip, photo] = defaultHomeSlides;
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: {
    heroSlides: [clip, photo], heroSlideInterval: 2,
  } });
  await refreshPublicCache();
  await simulateClipPlayback(page, [clip.url]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const carousel = slider(page);
  const play = carousel.getByRole('button', { name: 'Play video', exact: true });
  await expect(play).toBeVisible();
  await expect(carousel.locator('video')).not.toHaveAttribute('data-play-attempts', /.+/);
  await play.press('Enter');
  await expectClipToAdvance(carousel, 1);
  await expect(carousel.getByRole('img')).toHaveAttribute('alt', photo.alt);
  // Move keyboard focus outside the banner so only the motion preference holds the still.
  const header = page.getByRole('banner');
  await header.hover();
  await header.getByRole('link').first().focus();
  await expect(carousel).toBeInViewport({ ratio: 0.15 });
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await page.clock.install();
  await page.clock.fastForward(6000);
  await expect(carousel).toHaveAttribute('data-slide-index', '1');
});

test('a single video loops automatically and permits replay after a reduced-motion viewer starts it', async ({ page, db }) => {
  const clip = defaultHomeSlides[0];
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { heroSlides: [clip] } });
  await refreshPublicCache();
  await simulateClipPlayback(page, [clip.url]);
  await page.goto('/');
  const carousel = slider(page);
  const video = carousel.locator('video');
  await expect(video).toHaveJSProperty('loop', true);
  await expect(video).toHaveAttribute('data-play-attempts', /^[1-9]\d*$/);
  await expect(carousel.getByRole('button')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const play = carousel.getByRole('button', { name: 'Play video', exact: true });
  await expect(play).toBeVisible();
  await expect(video).toHaveJSProperty('loop', false);
  await play.press('Enter');
  await expect(play).toHaveCount(0);
  await video.dispatchEvent('ended');
  await expect(play).toBeVisible();
  await expect(carousel).toHaveAttribute('data-slide-index', '0');
});

test('blocked video autoplay offers Play to retry without a Pause control', async ({ page, db }) => {
  const clip = defaultHomeSlides[0];
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { heroSlides: [clip] } });
  await refreshPublicCache();
  await simulateClipPlayback(page, [clip.url], true);
  await page.goto('/');
  const carousel = slider(page);
  const attempts = () => carousel.locator('video').getAttribute('data-play-attempts').then(Number);
  await expect.poll(attempts).toBeGreaterThan(0);
  const first = await attempts();
  const play = carousel.getByRole('button', { name: 'Play video', exact: true });
  await expect(play).toBeVisible();
  await play.click();
  await expect.poll(attempts).toBeGreaterThan(first);
  await expect(play).toBeVisible();
  await expect(carousel.getByRole('button', { name: 'Pause video', exact: true, includeHidden: true })).toHaveCount(0);
});

test.describe('bundled owner banners', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('owner footage uses the real poster for first paint, mobile crop, social sharing and playback failure', async ({ page, db, browserName }, testInfo) => {
    await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $unset: { heroSlides: '' } });
    await refreshPublicCache();
    const lead = defaultHomeSlides[0];
    const poster = homeSlideVideoPoster(lead.url)!;
    const requested: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('.mp4')) requested.push(path);
    });
    await page.goto('/th');
    const carousel = slider(page, true);
    const video = carousel.locator('video');
    await expect(video).toHaveAttribute('poster', poster);
    await expect(video).toHaveAttribute('aria-label', lead.altTh);
    await expect(video).toHaveAttribute('preload', 'none');
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      await expect(page.locator(selector)).toHaveAttribute('content', E2E_BASE_URL + poster);
    }
    const frame = (await carousel.boundingBox())!;
    expect((await video.boundingBox())!.width).toBeCloseTo(frame.width, 0);
    expect(frame.width / frame.height).toBeCloseTo(16 / 9, 2);
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused && el.muted)).toBe(true);
    expect(requested).toEqual([]);
    await carousel.screenshot({ path: testInfo.outputPath('owner-mobile-banner.png') });
    const hasPlaybackDecoder = browserName !== 'webkit' || process.platform !== 'win32';
    if (hasPlaybackDecoder) {
      await page.getByRole('banner').hover();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0);
      await expect(carousel.getByRole('button', { name: /^(เล่นวิดีโอ|หยุดวิดีโอชั่วคราว)$/ })).toHaveCount(0);
      expect(await video.evaluate((el: HTMLVideoElement) => [el.videoWidth, el.videoHeight])).toEqual([1920, 864]);
      await video.evaluate((el: HTMLVideoElement) => { el.currentTime = el.duration - 0.5; });
      await expect(carousel).toHaveAttribute('data-slide-index', '1');
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    // Test the error on the next clip. Firefox can retain the previously
    // decoded video across reloads without issuing another HTTP request.
    const unavailable = defaultHomeSlides[2];
    let failedRequests = 0;
    await page.route('**/video-moe-line-4*.mp4', route => {
      failedRequests++;
      return route.fulfill({ status: 404, headers: { 'Cache-Control': 'no-store' } });
    });
    await carousel.getByRole('button', { name: 'แสดงสไลด์ 3', exact: true }).click();
    // Windows WebKit can fail before requesting media if no decoder exists.
    // Both a decoder error and a real network error must leave the poster visible.
    await carousel.hover();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const still = carousel.getByRole('img', { name: unavailable.altTh, exact: true });
    await expect(still).toHaveAttribute('src', homeSlideVideoPoster(unavailable.url)!);
    await expect.poll(() => still.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    if (hasPlaybackDecoder) expect(failedRequests).toBeGreaterThan(0);
    await carousel.getByRole('button', { name: 'แสดงสไลด์ 2', exact: true }).click();
    await expect(carousel.getByRole('img')).toHaveAttribute('alt', defaultHomeSlides[1].altTh);
  });
});

for (const width of [320, 390, 768]) {
  test.describe(`twelve slides at ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });

    test('keeps all navigation reachable', async ({ page, db }) => {
      const slides = Array.from({ length: 12 }, (_, index) => ({ url: `${fleetPhotoSlides[index % 5].url}?fixture=${index}`, alt: `Test slide ${index + 1}`, altTh: `ภาพทดสอบ ${index + 1}` }));
      await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { heroSlides: slides } });
      await refreshPublicCache();
      await page.goto('/');
      const carousel = slider(page);
      await expectHeroLayout(page, width <= 700 ? 16 / 9 : 3);
      await carousel.getByRole('button', { name: 'Show slide 12', exact: true }).click();
      await expect(carousel).toHaveAttribute('data-slide-index', '11');
      for (const [name, index] of [['Show slide 1', '0'], ['Show slide 12', '11']]) {
        const control = carousel.getByRole('button', { name, exact: true });
        await control.click();
        await expect(carousel).toHaveAttribute('data-slide-index', index);
        await expect(control).toBeInViewport();
        const bounds = (await control.boundingBox())!;
        expect(bounds.x, name).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width, name).toBeLessThanOrEqual(width);
        await expect(control).toBeInViewport();
      }
      await carousel.getByRole('button', { name: 'Show slide 1', exact: true }).click();
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

  test('tapping the banner lets autoplay continue after release', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const carousel = slider(page);
    await expect(carousel).toHaveAttribute('data-slide-index', '0');
    const bounds = (await carousel.boundingBox())!;
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 3);
    await expect(carousel).toHaveAttribute('data-slide-index', '0');
    await expect(carousel).toHaveAttribute('data-autoplay', 'true');
    await expect(carousel).toHaveAttribute('data-slide-index', '1', { timeout: 4500 });
  });
});
