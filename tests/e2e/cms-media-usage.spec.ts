import { test, expect, login } from './fixtures';

test('media usage lists active and Trash references without exposing the lookup to visitors', async ({ page, db }) => {
  const source = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(source).not.toBeNull();
  const endpoint = `/api/cms/media/usage?mediaId=${encodeURIComponent(String(source!.id))}`;
  const activeItemEndpoint = '/api/cms/content/item?type=Vessel&id=media-usage-active';
  const trashedItemEndpoint = '/api/cms/content/item?type=News&id=media-usage-trash';
  expect((await page.request.get(endpoint)).status()).toBe(401);
  expect((await page.request.get(activeItemEndpoint)).status()).toBe(401);

  const usages = [
    {
      _id: 'Vessel:media-usage-active', id: 'media-usage-active', type: 'Vessel',
      title: 'Vessel using shared image', titleTh: 'เรือที่ใช้ภาพร่วม', description: '', descriptionTh: '',
      image: source!.url, mobileImage: '', gallery: [{ url: source!.url, alt: '', altTh: '' }],
      category: 'Cargo', status: 'Published', revision: 1, updatedAt: '2020-01-01T00:00:00.000Z',
    },
    {
      _id: 'News:media-usage-trash', id: 'media-usage-trash', type: 'News',
      title: 'Deleted story using shared image', titleTh: 'ข่าวที่ลบแล้วและใช้ภาพร่วม', description: '', descriptionTh: '',
      image: '', mobileImage: source!.url, category: 'News', status: 'Published', revision: 2,
      updatedAt: new Date().toISOString(), deletedAt: new Date().toISOString(), purgeAt: new Date(Date.now() + 86400000),
    },
  ];
  await db.collection<{ _id: string }>('moe_content').insertMany(usages);
  // The usage link must open the exact record, even when the fleet's first page omits it.
  await db.collection<{ _id: string }>('moe_content').insertMany(Array.from({ length: 12 }, (_, index) => ({
    _id: `Vessel:media-usage-filler-${index}`,
    id: `media-usage-filler-${index}`,
    type: 'Vessel', title: `Other vessel ${index}`, titleTh: `เรืออื่น ${index}`,
    description: '', descriptionTh: '', image: '', category: 'Cargo',
    status: 'Published', revision: 1,
    updatedAt: new Date(Date.now() + index * 1000).toISOString(),
  })));
  await login(page);

  const firstFleetPage = await page.request.get('/api/cms/content?type=Vessel&q=&status=All');
  expect(firstFleetPage.ok()).toBe(true);
  expect((await firstFleetPage.json()).records).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'media-usage-active' }),
  ]));
  const activeItem = await page.request.get(activeItemEndpoint);
  expect(activeItem.status()).toBe(200);
  expect(await activeItem.json()).toMatchObject({ record: { type: 'Vessel', id: 'media-usage-active', title: 'Vessel using shared image' } });
  expect((await page.request.get(trashedItemEndpoint)).status()).toBe(404);

  const response = await page.request.get(endpoint);
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.media).toMatchObject({ id: source!.id, title: source!.title });
  expect(result.usages).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'media-usage-active', type: 'Vessel', fields: ['image', 'gallery'] }),
    expect.objectContaining({ id: 'media-usage-trash', type: 'News', fields: ['mobileImage'], deletedAt: expect.any(String) }),
  ]));
  expect((await page.request.get('/api/cms/media/usage?mediaId=does-not-exist')).status()).toBe(404);
  expect((await page.request.get(`${endpoint}&mediaId=another`)).status()).toBe(400);
  expect((await page.request.get('/api/cms/media/usage?mediaId=%24ne')).status()).toBe(400);

  await page.goto('/cms/media');
  const card = page.getByRole('region', { name: 'Saved images' }).locator('[class*="libraryGrid"] > div').filter({ hasText: String(source!.title) }).first();
  const usedButton = card.getByRole('button', { name: `Usage for ${source!.title}` });
  await expect(usedButton).toHaveText('Used');
  await usedButton.click();
  const dialog = page.getByRole('dialog', { name: 'Where this image is used' });
  await expect(dialog).toContainText('Vessel using shared image');
  await expect(dialog).toContainText('Deleted story using shared image');
  await expect(dialog).toContainText('Main image, Gallery image');
  await expect(dialog).toContainText('In Trash');

  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    const image = dialog.locator('[class*="mediaUsageIntro"] img');
    const intro = dialog.locator('[class*="mediaUsageIntro"]');
    await expect(image).toBeVisible();
    const imageBox = await image.boundingBox();
    const introBox = await intro.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(introBox).not.toBeNull();
    expect(Math.abs(imageBox!.x - introBox!.x)).toBeLessThan(2);
    expect(imageBox!.width).toBeGreaterThanOrEqual(introBox!.width - 2);
  }

  await dialog.getByRole('link', { name: /Vessel using shared image/ }).click();
  await expect(page).toHaveURL(/\/cms\/fleet(?:\?|$)/);
  const vesselEditor = page.getByRole('dialog', { name: 'Edit vessel' });
  await expect(vesselEditor).toBeVisible();
  await expect(vesselEditor.getByRole('textbox', { name: 'Title · English' })).toHaveValue('Vessel using shared image');
  await vesselEditor.getByRole('button', { name: 'Close Edit vessel' }).click();

  await page.goto('/cms/media');
  const cardAgain = page.getByRole('region', { name: 'Saved images' }).locator('[class*="libraryGrid"] > div').filter({ hasText: String(source!.title) }).first();
  await cardAgain.getByRole('button', { name: `Usage for ${source!.title}` }).click();
  const usageAgain = page.getByRole('dialog', { name: 'Where this image is used' });
  await usageAgain.getByRole('link', { name: /Deleted story using shared image/ }).click();
  await expect(page).toHaveURL(/\/cms\/trash(?:\?|$)/);
  const restore = page.getByRole('button', { name: 'Restore Deleted story using shared image' });
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page).toHaveURL(/\/cms\/news(?:\?|$)/);
  const newsEditor = page.getByRole('dialog', { name: 'Edit news' });
  await expect(newsEditor).toBeVisible();
  await expect(newsEditor.getByRole('textbox', { name: 'Title · English' })).toHaveValue('Deleted story using shared image');
});

test('media usage links open the exact page and section editors', async ({ page, db }) => {
  const source = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(source).not.toBeNull();
  const content = db.collection<{ type: string; id: string; title: string; image?: string }>('moe_content');
  const targets = [
    { type: 'Page', id: 'home' },
    { type: 'Section', id: 'home-expertise' },
  ] as const;
  const titles: string[] = [];
  for (const target of targets) {
    const saved = await content.findOne(target);
    expect(saved).not.toBeNull();
    titles.push(saved!.title);
    const result = await content.updateOne(target, { $set: { image: source!.url } });
    expect(result.matchedCount).toBe(1);
  }
  await login(page);

  for (const [index, target] of targets.entries()) {
    await page.goto('/cms/media');
    const card = page.getByRole('region', { name: 'Saved images' }).locator('[class*="libraryGrid"] > div').filter({ hasText: String(source!.title) }).first();
    await card.getByRole('button', { name: `Usage for ${source!.title}` }).click();
    const usageDialog = page.getByRole('dialog', { name: 'Where this image is used' });
    const link = usageDialog.getByRole('link').filter({ hasText: titles[index] });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/cms\/pages\?/);
    const destination = new URL(page.url());
    expect(destination.searchParams.get('page')).toBe('home');
    expect(destination.searchParams.get('edit')).toBe(`${target.type}:${target.id}`);
    const editor = page.getByRole('dialog', { name: 'Edit content' });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Title · English' })).toHaveValue(titles[index]);
  }
});
