"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import BrandMark from "./BrandMark";
import styles from "./MobileNavDrawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

function focusMainAfterNavigation() {
  window.requestAnimationFrame(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById("main")?.focus({ preventScroll: true });
  });
}

function isOutsideDrawer(dialog: HTMLDialogElement, x: number, y: number) {
  const bounds = dialog.getBoundingClientRect();
  return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
}

export default function MobileNavDrawer({ open, onClose, title, closeLabel, triggerRef, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const navigationCloseRef = useRef(false);
  const backdropPointerRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (open) {
      navigationCloseRef.current = false;
      if (!dialog.open) {
        dialog.dataset.phase = "closed";
        // Move the dialog itself so native autofocus cannot scroll an offscreen
        // child into view and cancel out the opening transform.
        dialog.showModal();
        panelRef.current?.scrollTo({ top: 0, behavior: "instant" });
      }
      if (reduceMotion) {
        dialog.dataset.phase = "open";
        closeRef.current?.focus({ preventScroll: true });
        return;
      }
      // Let the closed position paint before transitioning, without forcing layout.
      let enterFrame = 0;
      const paintFrame = window.requestAnimationFrame(() => {
        enterFrame = window.requestAnimationFrame(() => {
          dialog.dataset.phase = "open";
        });
      });
      closeRef.current?.focus({ preventScroll: true });
      return () => {
        window.cancelAnimationFrame(paintFrame);
        window.cancelAnimationFrame(enterFrame);
      };
    }

    if (!dialog.open) return;
    dialog.dataset.phase = "closed";

    const finish = () => {
      if (!dialog.open) return;
      dialog.close();
      if (navigationCloseRef.current) {
        focusMainAfterNavigation();
        return;
      }
      const trigger = triggerRef.current;
      if (trigger?.getClientRects().length) {
        trigger.focus({ preventScroll: true });
      } else {
        const desktopNav = document.querySelector("header nav");
        const desktopLink = desktopNav?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
          ?? desktopNav?.querySelector<HTMLAnchorElement>("a");
        desktopLink?.focus({ preventScroll: true });
      }
    };

    if (reduceMotion) {
      finish();
      return;
    }

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === dialog && event.propertyName === "transform") finish();
    };
    dialog.addEventListener("transitionend", onTransitionEnd);
    const fallback = window.setTimeout(finish, 360);
    return () => {
      dialog.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(fallback);
    };
  }, [open, triggerRef]);

  useEffect(() => () => {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
      if (navigationCloseRef.current) focusMainAfterNavigation();
    }
  }, []);

  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <dialog
    ref={dialogRef}
    className={styles.drawer}
    data-phase="closed"
    aria-label={title}
    onKeyDown={containFocus}
    onClickCapture={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && link.origin === window.location.origin && (!link.target || link.target === "_self") && !link.hasAttribute("download")) navigationCloseRef.current = true;
    }}
    onPointerDown={(event) => {
      backdropPointerRef.current = event.target === event.currentTarget
        && isOutsideDrawer(event.currentTarget, event.clientX, event.clientY);
    }}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target === event.currentTarget && backdropPointerRef.current
        && isOutsideDrawer(event.currentTarget, event.clientX, event.clientY)) onClose();
      backdropPointerRef.current = false;
    }}
  >
    <div ref={panelRef} className={styles.panel}>
      <div className={styles.heading}>
        <span className={styles.wordmark} aria-hidden="true"><BrandMark /><span><strong>MOE</strong><small>NAVIGATION</small></span></span>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label={closeLabel}><X aria-hidden="true" /></button>
      </div>
      {children}
    </div>
  </dialog>;
}
