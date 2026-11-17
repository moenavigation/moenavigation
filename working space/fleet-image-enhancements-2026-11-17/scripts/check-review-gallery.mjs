import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(path.join(folder, 'index.html')).href);
    await page.waitForFunction(() => document.querySelectorAll('[data-enhancement] [data-ready]').length === 14);
    await page.locator('.vessel').first().scrollIntoViewIfNeeded();
    const result = await page.evaluate(() => ({
      viewport: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      vesselSections: document.querySelectorAll('.vessel').length,
      enhancementSlots: document.querySelectorAll('[data-enhancement]').length,
      available: document.querySelectorAll('[data-enhancement] [data-ready]').length,
      pending: document.querySelectorAll('[data-enhancement] [data-missing]').length,
      originalLoaded: Array.from(document.querySelectorAll('.original img')).every(image => !image.complete || image.naturalWidth > 0),
      aiDisclosure: document.querySelector('.review-note').textContent.includes('not documentary originals'),
      missingDumai: document.getElementById('missing-title').textContent === 'DUMAI MOE',
    }));
    if (result.overflow > 1 || result.vesselSections !== 7 || result.enhancementSlots !== 14 || result.available !== 14 || result.pending !== 0 || !result.originalLoaded || !result.aiDisclosure || !result.missingDumai || errors.length) throw new Error(JSON.stringify({ result, errors }));
    await page.locator('.vessel').first().screenshot({ path: path.join(folder, `source-checks/gallery-${width}.png`), animations: 'disabled' });
    checks.push({ ...result, errors });
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(folder, 'source-checks/gallery-check.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
console.log(JSON.stringify(checks, null, 2));
