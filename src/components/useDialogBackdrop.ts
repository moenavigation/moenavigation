'use client';

import { useRef, type MouseEvent, type PointerEvent } from 'react';

function outside(dialog: HTMLDialogElement, x: number, y: number) {
  const bounds = dialog.getBoundingClientRect();
  return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
}

/** A real backdrop gesture must start and finish beyond the dialog panel. */
export default function useDialogBackdrop(onClose: () => void, disabled = false) {
  const startedOutside = useRef(false);

  return {
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      startedOutside.current = !disabled && event.isPrimary && event.button === 0
        && event.target === event.currentTarget
        && outside(event.currentTarget, event.clientX, event.clientY);
    },
    onPointerCancel() { startedOutside.current = false; },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const dismiss = startedOutside.current && !disabled && event.button === 0
        && event.target === event.currentTarget
        && outside(event.currentTarget, event.clientX, event.clientY);
      startedOutside.current = false;
      if (dismiss) onClose();
    },
  };
}
