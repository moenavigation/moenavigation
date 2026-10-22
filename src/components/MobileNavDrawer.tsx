"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import BrandMark from "./BrandMark";
import styles from "./MobileNavDrawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow: string;
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

export default function MobileNavDrawer({ open, onClose, title, eyebrow, closeLabel, triggerRef, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const navigationCloseRef = useRef(false);
  const backdropPointerRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (open) {
      navigationCloseRef.current = false;
      if (!dialog.open) {
        dialog.dataset.phase = "closed";
        dialog.showModal();
        // Establish the offscreen position before starting the enter transition.
        void panelRef.current?.offsetWidth;
      }
      if (reduceMotion) {
        dialog.dataset.phase = "open";
        closeRef.current?.focus({ preventScroll: true });
        return;
      }
      const frame = window.requestAnimationFrame(() => {
        dialog.dataset.phase = "open";
      });
      closeRef.current?.focus({ preventScroll: true });
      return () => window.cancelAnimationFrame(frame);
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

    const panel = panelRef.current;
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === panel && event.propertyName === "transform") finish();
    };
    panel?.addEventListener("transitionend", onTransitionEnd);
    const fallback = window.setTimeout(finish, 360);
    return () => {
      panel?.removeEventListener("transitionend", onTransitionEnd);
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
    aria-labelledby={titleId}
    onKeyDown={containFocus}
    onClickCapture={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && link.origin === window.location.origin && (!link.target || link.target === "_self") && !link.hasAttribute("download")) navigationCloseRef.current = true;
    }}
    onPointerDown={(event) => { backdropPointerRef.current = event.target === event.currentTarget; }}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && backdropPointerRef.current) onClose(); backdropPointerRef.current = false; }}
  >
    <div ref={panelRef} className={styles.panel}>
      <div className={styles.heading}>
        <span className={styles.wordmark} aria-hidden="true"><BrandMark /><span><strong>MOE</strong><small>NAVIGATION</small></span></span>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label={closeLabel}><X aria-hidden="true" /></button>
      </div>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
      </div>
      {children}
    </div>
  </dialog>;
}
