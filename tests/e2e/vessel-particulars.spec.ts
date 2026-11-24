import type { Locator, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { test, expect, login, refreshPublicCache } from './fixtures';

// Synthetic particulars exercise persistence and display; they are not imported
// legacy-site facts or an assertion about the real vessel.
const numericFields = [
  { key: 'lengthM', label: 'LOA (m)', value: 71.25 },
  { key: 'beamM', label: 'Breadth (m)', value: 15.4 },
  { key: 'depthM', label: 'Depth (m)', value: 6.2 },
  { key: 'draftM', label: 'Draft (m)', value: 4.15 },
  { key: 'capacityTeu', label: 'Nominal (TEU)', value: 120 },
  { key: 'reeferPlugs', label: 'Reefer Plug (units)', value: 0 },
  { key: 'grossTonnage', label: 'GRT', value: 1420 },
  { key: 'netTonnage', label: 'NRT', value: 750 },
  { key: 'deadweightT', label: 'DWT (tonnes)', value: 2200 },
  { key: 'cargoCapacityT', label: 'DWCC (tonnes)', value: 1980.5 },
] as const;
const newKeys = ['depthM', 'reeferPlugs', 'grossTonnage', 'netTonnage', 'cargoCapacityT'] as const;
const legacySpecs = {
  imo: '7654329', yearBuilt: 2020, flag: 'Thailand', flagTh: 'ไทย',
  availability: 'Legacy availability marker', availabilityTh: 'ข้อความความพร้อมเดิม',
};
const suppliedSpecs = { ...legacySpecs, ...Object.fromEntries(numericFields.map(field => [field.key, field.value])) };

const publicGroups = {
  en: [
    { name: 'Dimension', labels: ['LOA', 'Breadth', 'Depth', 'Draft'], values: ['71.25 m', '15.40 m', '6.20 m', '4.15 m'] },
    { name: 'Container Capacity', labels: ['Nominal', 'Reefer Plug'], values: ['120 TEU', '0 units'] },
    { name: 'Tonnage', labels: ['GRT', 'NRT', 'DWT', 'DWCC'], values: ['1,420', '750', '2,200 tonnes', '1,980.5 tonnes'] },
  ],
  th: [
    { name: 'ขนาดเรือ', labels: ['ความยาวตลอดลำ (LOA)', 'ความกว้าง', 'ความลึก', 'ระยะกินน้ำลึก'], values: ['71.25 ม.', '15.40 ม.', '6.20 ม.', '4.15 ม.'] },
    { name: 'ความจุตู้คอนเทนเนอร์', labels: ['ความจุตามพิกัด', 'จุดจ่ายไฟตู้เย็น'], values: ['120 TEU', '0 จุด'] },
    { name: 'ขนาดระวาง', labels: ['GRT', 'NRT', 'DWT', 'DWCC'], values: ['1,420', '750', '2,200 ตัน', '1,980.5 ตัน'] },
  ],
};

function valueFor(region: Locator, label: string) {
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return region.locator('dt').filter({ hasText: exact }).locator('xpath=following-sibling::dd');
}

async function openVesselEditor(page: Page) {
  await page.goto('/cms/fleet');
  await page.getByRole('button', { name: 'Edit RANONG MOE', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit vessel', exact: true });
  await expect(editor).toBeVisible();
  const details = editor.getByLabel('LOA (m)', { exact: true }).locator('xpath=ancestor::details[1]');
  await expect(details).not.toHaveAttribute('open');
  await details.locator(':scope > summary').click();
  return { editor, details };
}

async function saveVessel(page: Page, editor: Locator): Promise<ContentRecord> {
  const pending = page.waitForResponse(response => response.url().endsWith('/api/cms/content') && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  return (await response.json()).record;
}

async function assertPublicParticulars(page: Page, locale: 'en' | 'th') {
  for (const group of publicGroups[locale]) {
    const region = page.getByRole('region', { name: group.name, exact: true });
    await expect(region).toBeVisible();
    await expect(region.locator('dd')).toHaveCount(group.labels.length);
    for (let index = 0; index < group.labels.length; index++) {
      await expect(valueFor(region, group.labels[index])).toHaveText(group.values[index]);
    }
  }
  await expect(page.getByRole('main').locator('dt').filter({ hasText: /^(Specifications|Availability|ข้อมูลทางเทคนิค|ความพร้อมให้บริการ)$/ })).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText(legacySpecs.availability);
  await expect(page.getByRole('main')).not.toContainText(legacySpecs.availabilityTh);
}

test('CMS saves, reopens and clears optional particulars while preserving hidden legacy data', async ({ page, db }) => {
  test.setTimeout(120_000);
  await db.collection('moe_content').updateOne({ type: 'Vessel', id: 'ranong-moe' }, { $set: { vesselSpecs: legacySpecs } });
  await login(page);
  const first = await openVesselEditor(page);
  await expect(first.editor.getByLabel(/^Availability statement/)).toHaveCount(0);
  for (const field of numericFields) await first.editor.getByLabel(field.label, { exact: true }).fill(String(field.value));
  await first.details.locator(':scope > summary').click();
  await first.details.locator(':scope > summary').click();
  for (const field of numericFields) await expect(first.editor.getByLabel(field.label, { exact: true })).toHaveValue(String(field.value));
  const saved = await saveVessel(page, first.editor);
  expect(saved.vesselSpecs).toEqual(suppliedSpecs);

  for (const locale of ['en', 'th'] as const) {
    await page.goto(`${locale === 'th' ? '/th' : ''}/fleet/ranong-moe`);
    await assertPublicParticulars(page, locale);
  }
  const reopened = await openVesselEditor(page);
  for (const field of numericFields) await expect(reopened.editor.getByLabel(field.label, { exact: true })).toHaveValue(String(field.value));
  for (const field of numericFields.filter(field => (newKeys as readonly string[]).includes(field.key))) {
    await reopened.editor.getByLabel(field.label, { exact: true }).fill('');
  }
  const cleared = await saveVessel(page, reopened.editor);
  const remaining = { ...suppliedSpecs } as Record<string, unknown>;
  for (const key of newKeys) delete remaining[key];
  expect(cleared.vesselSpecs).toEqual(remaining);
  const stored = await db.collection('moe_content').findOne({ type: 'Vessel', id: 'ranong-moe' });
  expect(stored!.vesselSpecs).toEqual(remaining);

  const final = await openVesselEditor(page);
  for (const field of numericFields.filter(field => (newKeys as readonly string[]).includes(field.key))) {
    await expect(final.editor.getByLabel(field.label, { exact: true })).toHaveValue('');
  }
  await final.editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const locale of ['en', 'th'] as const) {
    await page.goto(`${locale === 'th' ? '/th' : ''}/fleet/ranong-moe`);
    for (const [groupIndex, rowIndex] of [[0, 2], [1, 1], [2, 0], [2, 1], [2, 3]]) {
      const group = publicGroups[locale][groupIndex];
      await expect(valueFor(page.getByRole('region', { name: group.name, exact: true }), group.labels[rowIndex])).toContainText(locale === 'en' ? 'Not provided' : 'ยังไม่มีข้อมูล');
    }
  }
});

test('each vessel shows its reviewed capacity in the appropriate units in both languages', async ({ page }) => {
  test.setTimeout(120_000);
  const vessels = [
    { id: 'ranong-moe', en: 'RANONG MOE', th: 'ระนองโม', nominal: 96 },
    { id: 'moe-line-2', en: 'MOE LINE 2', th: 'โมไลน์ 2', nominal: 72 },
    { id: 'moe-line-3', en: 'MOE LINE 3', th: 'โมไลน์ 3', nominal: 72 },
    { id: 'moe-line-4', en: 'MOE LINE 4', th: 'โมไลน์ 4', nominal: undefined },
    { id: 'moe-line-5', en: 'MOE LINE 5', th: 'โมไลน์ 5', nominal: 120 },
    { id: 'moe-line-6', en: 'MOE LINE 6', th: 'โมไลน์ 6', nominal: 120 },
    { id: 'moe-line-7', en: 'MOE LINE 7', th: 'โมไลน์ 7', nominal: 120 },
    { id: 'dumai-moe', en: 'DUMAI MOE', th: 'Dumai Moe', nominal: undefined },
  ];
  for (const locale of ['en', 'th'] as const) {
    const prefix = locale === 'th' ? '/th' : '';
    const group = publicGroups[locale][1];
    for (const vessel of vessels) {
      await page.goto(`${prefix}/fleet/${vessel.id}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(vessel[locale]);
      const capacity = page.getByRole('region', { name: group.name, exact: true });
      const nominal = valueFor(capacity, group.labels[0]);
      const reefers = valueFor(capacity, group.labels[1]);
      if (vessel.nominal !== undefined) {
        await expect(nominal).toHaveText(`${vessel.nominal} TEU`);
        const plugs = vessel.id === 'moe-line-5' || vessel.id === 'moe-line-6' ? 4 : 3;
        await expect(reefers).toHaveText(`${plugs} ${locale === 'en' ? 'units' : 'จุด'}`);
      } else {
        await expect(capacity).toHaveCount(0);
        if (vessel.id === 'dumai-moe') {
          await expect(page.getByText('3,330 m³', { exact: true })).toBeVisible();
          await expect(page.getByText('9190975', { exact: true })).toBeVisible();
          await expect(valueFor(page.getByRole('region', { name: publicGroups[locale][2].name, exact: true }), 'GT')).toHaveText('2,487');
        } else {
          await expect(page.getByText(locale === 'en' ? '200 tonnes' : '200 ตัน', { exact: true })).toBeVisible();
          await expect(page.getByText('4800-00377', { exact: true })).toBeVisible();
        }
      }
    }
  }
});

test('existing vessels without particulars show accessible blanks rather than invented zero values', async ({ page, db }) => {
  await db.collection('moe_content').updateOne({ type: 'Vessel', id: 'dumai-moe' }, { $unset: { vesselSpecs: '' } });
  await refreshPublicCache();
  for (const locale of ['en', 'th'] as const) {
    await page.goto(`${locale === 'th' ? '/th' : ''}/fleet/dumai-moe`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'en' ? 'DUMAI MOE' : 'Dumai Moe');
    for (const group of publicGroups[locale]) {
      const region = page.getByRole('region', { name: group.name, exact: true });
      await expect(region).toBeVisible();
      await expect(region.locator('dd')).toHaveCount(group.labels.length);
      for (const label of group.labels) {
        const value = valueFor(region, label);
        await expect(value).toContainText('—');
        await expect(value).toContainText(locale === 'en' ? 'Not provided' : 'ยังไม่มีข้อมูล');
        await expect(value).not.toContainText(/\d/);
      }
    }
    await expect(page.getByRole('main').locator('dt').filter({ hasText: /^(Specifications|Availability|ข้อมูลทางเทคนิค|ความพร้อมให้บริการ)$/ })).toHaveCount(0);
  }
});

// Create each context at its target size. Runtime viewport resizing can stall
// Firefox on Windows before it returns control to the test.
for (const width of [320, 390, 768, 1440, 2560]) {
  test.describe(`vessel particulars at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 768 ? 844 : 1000 } });

    test('grouped bilingual particulars fit the screen and retain gallery and enquiry actions', async ({ page, db }, testInfo) => {
      test.setTimeout(120_000);
      await db.collection('moe_content').updateOne({ type: 'Vessel', id: 'ranong-moe' }, { $set: { vesselSpecs: suppliedSpecs } });
      await refreshPublicCache();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const locale of ['en', 'th'] as const) {
        const prefix = locale === 'th' ? '/th' : '';
        await page.goto(`${prefix}/fleet/ranong-moe`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'en' ? 'RANONG MOE' : 'ระนองโม');
        await assertPublicParticulars(page, locale);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        for (const group of publicGroups[locale]) {
          expect(await page.getByRole('region', { name: group.name, exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        }
        if (width === 320 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`vessel-particulars-${locale}-${width}.png`), fullPage: true });
        const galleryTrigger = page.getByRole('button', { name: locale === 'en' ? 'Open image gallery' : 'เปิดแกลเลอรีภาพ', exact: true });
        await galleryTrigger.click();
        const gallery = page.getByRole('dialog');
        await expect(gallery).toBeVisible();
        await gallery.press('Escape');
        await expect(gallery).not.toBeVisible();
        await expect(galleryTrigger).toBeFocused();
        const enquiry = page.getByRole('link', { name: locale === 'en' ? 'Enquire about this vessel' : 'สอบถามเกี่ยวกับเรือลำนี้', exact: true });
        await expect(enquiry).toHaveAttribute('href', `${prefix}/contact?subject=${encodeURIComponent(locale === 'en' ? 'RANONG MOE' : 'ระนองโม')}`);
      }
      expect(errors).toEqual([]);
    });
  });
}
