import { expect, test } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

test('mobile menu enters from the right on first open and reopen', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
  const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });

  for (let cycle = 0; cycle < 2; cycle++) {
    // Start before the real click: waiting for a stable dialog first would miss
    // showModal autofocus scrolling an offscreen panel into view instantly.
    const recording = await page.evaluateHandle(() => {
      type Frame = { left: number; right: number; width: number; scrollLeft: number };
      const frames: Frame[] = [];
      let firstOpenAt: number | undefined;
      let frameId = 0;
      let resolve!: (frames: Frame[]) => void;
      const finished = new Promise<Frame[]>(done => { resolve = done; });
      const finish = () => { window.cancelAnimationFrame(frameId); resolve(frames); };
      const timeout = window.setTimeout(finish, 5_000);
      const sample = (time: number) => {
        const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
        const panel = dialog?.firstElementChild;
        if (dialog && panel) {
          firstOpenAt ??= time;
          const bounds = panel.getBoundingClientRect();
          frames.push({ left: bounds.left, right: bounds.right, width: bounds.width, scrollLeft: dialog.scrollLeft });
        }
        if (firstOpenAt !== undefined && time - firstOpenAt >= 900) {
          window.clearTimeout(timeout);
          finish();
        } else {
          frameId = window.requestAnimationFrame(sample);
        }
      };
      frameId = window.requestAnimationFrame(sample);
      return { finished };
    });

    await trigger.click();
    const frames = await recording.evaluate(async recorder => recorder.finished);
    await recording.dispose();
    expect(frames.length, 'capture the entrance, not only the final position').toBeGreaterThan(8);
    const first = frames[0];
    const last = frames.at(-1)!;
    const viewportWidth = page.viewportSize()!.width;
    expect(first.left, 'the panel begins beyond the right edge').toBeGreaterThanOrEqual(viewportWidth - 2);
    expect(last.right, 'the open panel rests at the right edge').toBeCloseTo(viewportWidth, 0);
    expect(last.left).toBeCloseTo(viewportWidth - last.width, 0);
    expect(first.left - last.left, 'the panel visibly travels into place').toBeGreaterThan(last.width * 0.9);
    expect(frames.some(frame => frame.left > last.left + 20 && frame.left < viewportWidth - 20), 'capture visible intermediate positions').toBe(true);
    for (const [index, frame] of frames.entries()) {
      expect(frame.scrollLeft, 'autofocus must not horizontally scroll the dialog').toBe(0);
      expect(frame.left, 'the panel never overshoots its resting position').toBeGreaterThanOrEqual(last.left - 1);
      if (index > 0) expect(frame.left, 'opening never reverses direction').toBeLessThanOrEqual(frames[index - 1].left + 1);
    }
    await expect(drawer.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused();

    if (cycle === 0) {
      await page.keyboard.press('Escape');
    } else {
      // The uncovered left edge is the native dialog backdrop.
      await page.mouse.click(last.left / 2, 200);
    }
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});
