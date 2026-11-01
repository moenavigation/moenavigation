import { createHash } from 'node:crypto';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, loginChallengeData, solveLoginSlide } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';

const rememberedUsernameKey = 'moe-cms-remembered-username';
const rememberLabel = 'Remember username on this device';

test('password visibility is keyboard accessible, preserves input, and submits only once', async ({ page }, testInfo) => {
  let loginRequests = 0;
  let releaseLogin!: () => void;
  const loginGate = new Promise<void>(resolve => { releaseLogin = resolve; });
  await page.route('**/api/cms/login', async route => {
    loginRequests++;
    await loginGate;
    await route.fulfill({ status: 401, json: { error: 'The username or password is incorrect.' } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/cms');
  const username = page.getByLabel('Username', { exact: true });
  const password = page.getByLabel('Password', { exact: true });
  const remember = page.getByRole('checkbox', { name: rememberLabel, exact: true });
  await expect(username).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(remember).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('cms-login-desktop.png'), fullPage: true });
  await username.fill('unverified-user');
  await password.fill('Synthetic-password-not-for-storage');
  await remember.check();
  const show = page.getByRole('button', { name: 'Show password', exact: true });
  await show.focus();
  await show.press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('Synthetic-password-not-for-storage');
  await expect(page.getByRole('button', { name: 'Hide password', exact: true })).toBeFocused();
  expect(loginRequests).toBe(0);
  try {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').locator('[class*="loginPuzzleTarget"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('cms-login-puzzle-start.png'), animations: 'disabled' });
    await solveLoginSlide(page, { submit: false });
    expect(loginRequests).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('cms-login-puzzle-dialog.png'), animations: 'disabled' });
    await page.getByRole('dialog').locator('input[type="range"]').press('Enter');
    await expect.poll(() => loginRequests).toBe(1);
    await expect(password).toHaveAttribute('type', 'password');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.locator('[class*="loginPuzzleLoading"]')).toContainText('Signing in…');
    await expect(dialog.locator('[class*="loginPuzzleLoading"]')).toBeVisible();
    await expect(dialog.locator('input[type="range"]')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Close verification', exact: true })).toBeDisabled();
    // Even repeated submit events while the request is in flight must not send more credentials.
    await password.evaluate(input => input.closest('form')!.requestSubmit());
    await expect.poll(() => loginRequests).toBe(1);
  } finally {
    releaseLogin();
  }
  await expect(page.getByRole('main').getByRole('alert')).toContainText('The username or password is incorrect.');
  await solveLoginSlide(page, { submit: false });
  await expect(page.getByRole('dialog').locator('input[type="range"]')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
  await expect(password).toHaveValue('Synthetic-password-not-for-storage');
  await expect(password).toHaveAttribute('type', 'password');
  const storage = await page.evaluate(key => ({ remembered: localStorage.getItem(key), local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), cookie: document.cookie }), rememberedUsernameKey);
  expect(storage.remembered).toBeNull();
  expect(JSON.stringify(storage)).not.toContain('Synthetic-password-not-for-storage');
  expect(loginRequests).toBe(1);
});

test('captcha loading stays inside the dialog until the challenge is ready', async ({ page }, testInfo) => {
  let releaseChallenge!: () => void;
  const challengeGate = new Promise<void>(resolve => { releaseChallenge = resolve; });
  await page.route('**/api/cms/login/challenge', async route => {
    await challengeGate;
    await route.fulfill({ json: { id: 'a'.repeat(48), target: 60 } });
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/cms');
  await page.getByLabel('Username', { exact: true }).fill('unverified-user');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-not-for-storage');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const loading = dialog.locator('[class*="loginPuzzleLoading"]');
  try {
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-busy', 'true');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(loading).toContainText('Loading slide…');
    await expect(dialog.locator('input[type="range"]')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'New slide challenge', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Close verification', exact: true })).toBeEnabled();
    const panelBounds = (await loading.boundingBox())!;
    const dialogBounds = (await dialog.boundingBox())!;
    expect(panelBounds.x).toBeGreaterThanOrEqual(dialogBounds.x);
    expect(panelBounds.y).toBeGreaterThanOrEqual(dialogBounds.y);
    expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(dialogBounds.x + dialogBounds.width);
    expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(dialogBounds.y + dialogBounds.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('cms-login-captcha-loading-320.png'), animations: 'disabled' });
  } finally {
    releaseChallenge();
  }
  await expect(dialog).toHaveAttribute('aria-busy', 'false');
  await expect(loading).not.toBeVisible();
  await expect(dialog.locator('input[type="range"]')).toBeEnabled();
  await expect(dialog.locator('[class*="loginPuzzleTarget"]')).toBeVisible();
});

for (const dismissal of ['Escape', 'Close verification']) {
  test(`captcha loading can be dismissed with ${dismissal} and reopened`, async ({ page }) => {
    let releaseChallenge!: () => void;
    const challengeGate = new Promise<void>(resolve => { releaseChallenge = resolve; });
    let challengeRequests = 0;
    await page.route('**/api/cms/login/challenge', async route => {
      const first = ++challengeRequests === 1;
      if (first) await challengeGate;
      await route.fulfill({ json: { id: (first ? 'a' : 'b').repeat(48), target: first ? 80 : 40 } });
    });
    await page.goto('/cms');
    await page.getByLabel('Username', { exact: true }).fill('unverified-user');
    await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-not-for-storage');
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await signIn.click();
    const dialog = page.getByRole('dialog');
    try {
      await expect(dialog.locator('[class*="loginPuzzleLoading"]')).toBeVisible();
      await expect.poll(() => challengeRequests).toBe(1);
      if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: dismissal, exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(signIn).toBeFocused();
      await signIn.click();
      await expect(dialog.locator('input[type="range"]')).toBeEnabled();
      expect(await dialog.locator('[class*="loginPuzzleTarget"]').evaluate(element => (element as HTMLElement).style.left)).toBe('32%');
      const lateResponse = page.waitForResponse('**/api/cms/login/challenge');
      releaseChallenge();
      await (await lateResponse).finished();
      await expect(dialog).toHaveAttribute('aria-busy', 'false');
      expect(await dialog.locator('[class*="loginPuzzleTarget"]').evaluate(element => (element as HTMLElement).style.left)).toBe('32%');
    } finally {
      releaseChallenge();
    }
  });
}

test('refreshing a captcha shows in-dialog loading and recovers from a failed challenge', async ({ page }) => {
  let releaseChallenge!: () => void;
  const challengeGate = new Promise<void>(resolve => { releaseChallenge = resolve; });
  let challengeRequests = 0;
  const failure = 'This request could not be completed. Please try again.';
  await page.route('**/api/cms/login/challenge', async route => {
    const request = ++challengeRequests;
    if (request === 2) {
      await challengeGate;
      await route.fulfill({ status: 503, json: { error: failure } });
    } else {
      await route.fulfill({ json: { id: String(request).repeat(48), target: request === 1 ? 60 : 40 } });
    }
  });
  await page.goto('/cms');
  await page.getByLabel('Username', { exact: true }).fill('unverified-user');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-not-for-storage');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.locator('input[type="range"]');
  const refresh = dialog.getByRole('button', { name: 'New slide challenge', exact: true });
  await expect(slider).toBeEnabled();
  await refresh.click();
  try {
    await expect(dialog).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.locator('[class*="loginPuzzleLoading"]')).toContainText('Loading slide…');
    await expect(dialog.locator('[class*="loginPuzzleLoading"]')).toBeVisible();
    await expect(slider).toBeDisabled();
    await expect(refresh).toBeDisabled();
  } finally {
    releaseChallenge();
  }
  await expect(dialog).toHaveAttribute('aria-busy', 'false');
  await expect(dialog.locator('[class*="loginPuzzleLoading"]')).not.toBeVisible();
  await expect(dialog).toContainText(failure);
  await expect(slider).toBeDisabled();
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(slider).toBeEnabled();
  await expect(dialog).not.toContainText(failure);
  expect(await dialog.locator('[class*="loginPuzzleTarget"]').evaluate(element => (element as HTMLElement).style.left)).toBe('32%');
});

test('releasing the slider submits only when the puzzle matches', async ({ page }) => {
  let loginRequests = 0;
  let submittedPosition: unknown;
  await page.route('**/api/cms/login', async route => {
    loginRequests++;
    submittedPosition = route.request().postDataJSON().challengePosition;
    await route.fulfill({ status: 401, json: { error: 'The username or password is incorrect.' } });
  });
  await page.goto('/cms');
  await page.getByLabel('Username', { exact: true }).fill('unverified-user');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-not-for-storage');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.locator('input[type="range"]');
  await expect(slider).toBeEnabled();
  const target = Number.parseFloat(await dialog.locator('[class*="loginPuzzleTarget"]').evaluate(element => (element as HTMLElement).style.left)) / .8;
  const track = await slider.boundingBox();
  expect(track).not.toBeNull();
  const thumbWidth = Number(await slider.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))) * 3.2;
  const x = (value: number) => track!.x + thumbWidth / 2 + (track!.width - thumbWidth) * value / 100;
  const y = track!.y + track!.height / 2;
  async function drag(from: number, to: number) {
    await page.mouse.move(x(from), y);
    await page.mouse.down();
    await page.mouse.move(x(to), y, { steps: 10 });
    // Read immediately while held: a delayed animation must not catch up before this assertion.
    const movement = await slider.evaluate(input => {
      const container = input.closest('dialog')!;
      const board = container.querySelector('[class*="loginPuzzleBoard"]')!.getBoundingClientRect();
      const piece = container.querySelector('[class*="loginPuzzlePiece"]')!.getBoundingClientRect();
      return {
        offset: piece.left - board.left,
        expected: Number((input as HTMLInputElement).value) / 100 * (board.width - piece.width),
        sliderTop: input.getBoundingClientRect().top,
      };
    });
    expect(loginRequests).toBe(0);
    expect(Math.abs(movement.offset - movement.expected)).toBeLessThanOrEqual(1);
    expect(Math.abs(movement.sliderTop - track!.y)).toBeLessThanOrEqual(1);
    await page.mouse.up();
  }
  await drag(0, 20);
  expect(loginRequests).toBe(0);
  await expect(dialog).toBeVisible();
  const current = Number(await slider.inputValue());
  await drag(current, target);
  await expect.poll(() => loginRequests).toBe(1);
  expect(typeof submittedPosition).toBe('number');
  expect(Number.isInteger(submittedPosition)).toBe(true);
  await expect(dialog).not.toBeVisible();
});

test('successful sign-in remembers only the username and logout revokes the server session', async ({ page, context, request }) => {
  await page.goto('/cms');
  await page.getByLabel('Username', { exact: true }).fill(` ${E2E_ADMIN.username.toUpperCase()} `);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('checkbox', { name: rememberLabel, exact: true }).check();
  const loginResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/cms/login') && response.request().method() === 'POST');
  await solveLoginSlide(page);
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  const sessionHeader = (await loginResponse.headerValues('set-cookie')).find(value => value.startsWith('moe_cms_session='));
  expect(sessionHeader).toBeDefined();
  // Assert the policy actually sent by the server. Windows WebKit's cookie
  // introspection reported SameSite=None despite this response declaring Strict.
  expect(sessionHeader).toMatch(/;\s*SameSite=Strict(?:;|$)/i);
  expect(sessionHeader).toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(sessionHeader).toMatch(/;\s*Secure(?:;|$)/i);
  expect(sessionHeader).toMatch(/;\s*Max-Age=28800(?:;|$)/i);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), rememberedUsernameKey)).toBe(E2E_ADMIN.username);

  const session = (await context.cookies()).find(cookie => cookie.name === 'moe_cms_session');
  expect(session).toMatchObject({ httpOnly: true, secure: true, path: '/' });
  expect(session!.value).toMatch(/^[a-f0-9]{64}$/);
  expect(session!.expires - Date.now() / 1000).toBeGreaterThan(8 * 60 * 60 - 60);
  expect(session!.expires - Date.now() / 1000).toBeLessThanOrEqual(8 * 60 * 60);
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), cookie: document.cookie }));
  expect(JSON.stringify(storage)).not.toContain(E2E_ADMIN.password);
  expect(JSON.stringify(storage)).not.toContain(session!.value);

  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  await page.getByRole('dialog', { name: 'CMS navigation', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(E2E_ADMIN.username);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: rememberLabel, exact: true })).toBeChecked();
  expect((await context.cookies()).some(cookie => cookie.name === 'moe_cms_session')).toBe(false);
  const replay = await request.get('/api/cms/content', { headers: { cookie: `moe_cms_session=${session!.value}` } });
  expect(replay.status()).toBe(401);
  await page.reload();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(E2E_ADMIN.username);
  await page.getByRole('checkbox', { name: rememberLabel, exact: true }).uncheck();
  expect(await page.evaluate(key => localStorage.getItem(key), rememberedUsernameKey)).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: rememberLabel, exact: true })).not.toBeChecked();
});

test('login rejects cross-site requests and gives the same failure for unknown users and wrong passwords', async ({ request }) => {
  const data = { username: E2E_ADMIN.username, password: E2E_ADMIN.password };
  expect((await request.post('/api/cms/login', { data })).status()).toBe(403);
  expect((await request.post('/api/cms/login', { headers: { origin: 'https://attacker.example' }, data })).status()).toBe(403);
  expect((await request.post('/api/cms/login', { headers: { origin: E2E_BASE_URL, 'sec-fetch-site': 'cross-site' }, data })).status()).toBe(403);
  const headers = { origin: E2E_BASE_URL };
  const known = await request.post('/api/cms/login', { headers, data: { username: E2E_ADMIN.username, password: 'Incorrect-synthetic-password', ...await loginChallengeData(request) } });
  const unknown = await request.post('/api/cms/login', { headers, data: { username: 'no-such-admin', password: 'Incorrect-synthetic-password', ...await loginChallengeData(request) } });
  expect(known.status()).toBe(401);
  expect(unknown.status()).toBe(401);
  expect(await known.json()).toEqual({ error: 'The username or password is incorrect.' });
  expect(await unknown.json()).toEqual(await known.json());
  expect(known.headers()['cache-control']).toBe('no-store');
  expect(known.headers()['set-cookie']).toBeUndefined();
  expect((await request.get('/api/cms/content')).status()).toBe(401);
});

test('slide verification is required, single-use, and checked by the server', async ({ request }) => {
  const headers = { origin: E2E_BASE_URL };
  const credentials = { username: E2E_ADMIN.username, password: E2E_ADMIN.password };
  const missing = await request.post('/api/cms/login', { headers, data: credentials });
  expect(missing.status()).toBe(400);

  const challenge = await loginChallengeData(request);
  const wrongPosition = challenge.challengePosition > 50 ? 0 : 100;
  const wrong = await request.post('/api/cms/login', { headers, data: { ...credentials, ...challenge, challengePosition: wrongPosition } });
  expect(wrong.status()).toBe(400);
  const replay = await request.post('/api/cms/login', { headers, data: { ...credentials, ...challenge } });
  expect(replay.status()).toBe(400);
  expect(replay.headers()['set-cookie']).toBeUndefined();

  const fresh = await request.post('/api/cms/login', { headers, data: { ...credentials, ...await loginChallengeData(request) } });
  expect(fresh.status()).toBe(200);
});

for (const username of ['throttle-test-user', 'global']) {
test(`username ${username} gets ten attempts without colliding with the global throttle`, async ({ request }) => {
  const headers = { origin: E2E_BASE_URL };
  const data = { username, password: 'Incorrect-synthetic-password' };
  for (let attempt = 0; attempt < 10; attempt++) {
    expect((await request.post('/api/cms/login', { headers, data: { ...data, ...await loginChallengeData(request) } })).status()).toBe(401);
  }
  const limited = await request.post('/api/cms/login', { headers, data: { ...data, ...await loginChallengeData(request) } });
  expect(limited.status()).toBe(429);
  expect(await limited.json()).toEqual({ error: 'Too many attempts. Please wait a few minutes and try again.' });
  expect(limited.headers()['set-cookie']).toBeUndefined();
});
}

test('an exhausted global login budget prevents new per-username rate-limit state', async ({ request, db }) => {
  const bucketDuration = 15 * 60 * 1000;
  const currentBucket = Math.floor(Date.now() / bucketDuration);
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const state = db.collection<{ _id: string; count?: number; expiresAt: Date }>('moe_state');
  // Cover a possible boundary crossing while these requests are running.
  for (const bucket of [currentBucket, currentBucket + 1]) {
    await state.updateOne({ _id: `limit:${digest('login:global')}:${bucket}` }, {
      $set: { count: 100, expiresAt: new Date((bucket + 2) * bucketDuration) },
    }, { upsert: true });
  }
  const idsBefore = (await state.find({}, { projection: { _id: 1 } }).toArray()).map(item => item._id).sort();
  const usernames = ['global-budget-new-one', 'global-budget-new-two', 'global-budget-new-three'];
  for (const username of usernames) {
    const response = await request.post('/api/cms/login', {
      headers: { origin: E2E_BASE_URL }, data: { username, password: 'Incorrect-synthetic-password', challengeId: '0'.repeat(48), challengePosition: 0 },
    });
    expect(response.status()).toBe(429);
    expect(response.headers()['set-cookie']).toBeUndefined();
  }
  const idsAfter = (await state.find({}, { projection: { _id: 1 } }).toArray()).map(item => item._id).sort();
  expect(idsAfter).toEqual(idsBefore);
  const unexpectedUserBuckets = usernames.flatMap(username => [currentBucket, currentBucket + 1].map(bucket => `limit:${digest(`login:username:${username}`)}:${bucket}`));
  expect(await state.countDocuments({ _id: { $in: unexpectedUserBuckets } })).toBe(0);
});

test.describe('Thai mobile login', () => {
  test.use({ cmsLocale: 'th', viewport: { width: 320, height: 800 } });

  test('translated controls fit at 320px and login works when browser storage is blocked', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
        Object.defineProperty(Storage.prototype, method, { configurable: true, value() { throw new DOMException('Browser storage is blocked', 'SecurityError'); } });
      }
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/cms');
    await expect(page.getByRole('heading', { name: cmsMainThai['Welcome back'], exact: true })).toBeVisible();
    await expect(page.locator('[class*="loginIcon"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: cmsMainThai['Show password'], exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: cmsMainThai[rememberLabel], exact: true })).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('cms-login-thai-320.png'), fullPage: true });
    await page.getByLabel(cmsMainThai['Username'], { exact: true }).fill(E2E_ADMIN.username);
    await page.getByLabel(cmsMainThai['Password'], { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole('checkbox', { name: cmsMainThai[rememberLabel], exact: true }).check();
    await solveLoginSlide(page, { submit: false });
    await page.screenshot({ path: testInfo.outputPath('cms-login-puzzle-thai-320.png'), animations: 'disabled' });
    await page.getByRole('dialog').locator('input[type="range"]').press('Enter');
    await expect(page.getByRole('heading', { name: cmsMainThai['Dashboard'], exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: cmsMainThai['Refresh workspace'], exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });
});
