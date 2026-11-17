import { expect, type Locator } from '@playwright/test';

/** Exercise the real selection dialog instead of synthesizing a change event. */
export async function chooseDialogOption(trigger: Locator, choice: string | { label: string }) {
  await trigger.click();
  const dialog = trigger.page().getByRole('dialog', { name: (await trigger.getAttribute('aria-label'))!, exact: true });
  await expect(dialog).toBeVisible();
  const option = typeof choice === 'string'
    ? dialog.locator(`[data-selection-option=${JSON.stringify(choice)}]`)
    : dialog.getByRole('button', { name: choice.label, exact: true });
  await option.click();
  await expect(dialog).not.toBeVisible();
  if (typeof choice === 'string') await expect(trigger).toHaveAttribute('data-selection-value', choice);
}
