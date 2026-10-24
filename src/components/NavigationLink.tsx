"use client";

import NextLink, { useLinkStatus } from "next/link";
import { useLayoutEffect, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import LoadingScreen from "./LoadingScreen";
import styles from "./NavigationLink.module.css";

type LinkProps = ComponentProps<typeof NextLink>;

function PendingOverlay({ href }: { href: LinkProps["href"] }) {
  const path = typeof href === "string"
    ? new URL(href, window.location.href).pathname
    : href.pathname || window.location.pathname;
  const locale = path === "/en" || path.startsWith("/en/") || path === "/cms" ? "en" : "th";

  useLayoutEffect(() => {
    // Keep the visible header usable while the covered page waits for its replacement.
    const covered = Array.from(document.querySelectorAll<HTMLElement>("main, footer"))
      .filter(element => !element.closest("[data-navigation-loading]"));
    const previous = covered.map(element => ({ element, inert: element.inert, hidden: element.getAttribute('aria-hidden') }));
    covered.forEach(element => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    return () => previous.forEach(({ element, inert, hidden }) => {
      element.inert = inert;
      if (hidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', hidden);
    });
  }, []);

  return createPortal(
    <div className={styles.overlay} data-navigation-loading="true">
      <LoadingScreen variant="public" locale={locale} stage="page" />
    </div>,
    document.body,
  );
}

function NavigationPending({ href }: { href: LinkProps["href"] }) {
  const { pending } = useLinkStatus();
  return pending ? <PendingOverlay href={href} /> : null;
}

export default function NavigationLink({ children, ...props }: LinkProps) {
  // Public pages are cached on the server. Fetch them when selected instead of
  // downloading every visible navigation/card destination in the background.
  return <NextLink prefetch={false} {...props}>{children}<NavigationPending href={props.as || props.href} /></NextLink>;
}
