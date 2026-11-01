import type { Locator } from '@playwright/test';
import { translateCms, type CmsLocale } from '../../src/lib/cms-locale';
import { expect } from './fixtures';

export async function checkPasswordToggle(dialog: Locator, label: string, value: string, locale: CmsLocale = 'en', leaveVisible = false) {
  const input = dialog.getByLabel(translateCms(locale, label), { exact: true });
  const showLabel = `${translateCms(locale, 'Show password')}: ${translateCms(locale, label)}`;
  const hideLabel = `${translateCms(locale, 'Hide password')}: ${translateCms(locale, label)}`;
  await expect(input).toHaveAttribute('type', 'password');
  const show = dialog.getByRole('button', { name: showLabel, exact: true });
  await expect(show).toHaveAttribute('type', 'button');
  await expect(show).toHaveAttribute('aria-controls', (await input.getAttribute('id'))!);
  await show.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue(value);
  const hide = dialog.getByRole('button', { name: hideLabel, exact: true });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await hide.click();
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveValue(value);
  if (leaveVisible) await show.click();
}
