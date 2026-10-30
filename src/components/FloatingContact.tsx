"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { href, local, type Locale } from "@/lib/content";
import { usePublicContent } from "@/lib/use-public-content";
import Link from "./NavigationLink";
import styles from "./FloatingContact.module.css";

type ContactAction = {
  id: string;
  label: string;
  detail?: string;
  href: string;
  icon: string;
  internal?: boolean;
  external?: boolean;
};

export default function FloatingContact({ locale }: { locale: Locale }) {
  const { settings } = usePublicContent();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsId = useId();

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [open]);

  function closeAndFocusTrigger() {
    triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }

  const actions: ContactAction[] = [{
    id: "enquiry",
    label: local(locale, "Send an enquiry", "ส่งข้อความสอบถาม"),
    href: `${href(locale, "contact")}#contact-form`,
    icon: "/icons/Email.svg", internal: true,
  }];
  const phone = settings.phone.replace(/[^+\d]/g, "");
  if (phone.replace(/\D/g, "").length >= 5) actions.push({
    id: "phone", label: local(locale, "Call us", "โทรหาเรา"), detail: settings.phone,
    href: `tel:${phone}`, icon: "/icons/Phone.svg",
  });
  if (settings.email) actions.push({
    id: "email", label: local(locale, "Email us", "ส่งอีเมล"), detail: settings.email,
    href: `mailto:${settings.email}`, icon: "/icons/Email.svg",
  });
  if (settings.mapUrl) actions.push({
    id: "map", label: local(locale, "Office map", "แผนที่สำนักงาน"),
    href: settings.mapUrl, icon: "/icons/Location.svg", external: true,
  });

  return <aside
    ref={rootRef}
    className={styles.root}
    aria-label={local(locale, "Quick contact", "ช่องทางติดต่อ")}
    data-open={open}
    data-contact-fab="true"
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeAndFocusTrigger();
      }
    }}
  >
    <button
      ref={triggerRef}
      className={styles.trigger}
      type="button"
      aria-label={open ? local(locale, "Close contact menu", "ปิดช่องทางติดต่อ") : local(locale, "Open contact menu", "เปิดช่องทางติดต่อ")}
      aria-expanded={open}
      aria-controls={itemsId}
      onClick={() => { triggerRef.current?.focus({ preventScroll: true }); setOpen(current => !current); }}
    >
      <Image className={styles.callIcon} src="/icons/Call-start.svg" width={64} height={64} alt="" unoptimized />
      <Image className={styles.closeIcon} src="/icons/Call-end.svg" width={64} height={64} alt="" unoptimized />
    </button>
    <nav id={itemsId} className={styles.items} aria-label={local(locale, "Contact options", "เลือกช่องทางติดต่อ")} aria-hidden={!open} inert={!open}>
      {actions.map((action, index) => {
        const content = <>
          <span className={styles.itemText}>{action.label}{action.detail && <span className={styles.itemDetail}>{action.detail}</span>}</span>
          <span className={styles.itemIcon}>
            <Image src={action.icon} width={48} height={48} alt="" unoptimized />
          </span>
          {action.external && <span className="sr-only">{local(locale, "(opens in a new tab)", "(เปิดในแท็บใหม่)")}</span>}
        </>;
        const style = { "--item-index": actions.length - index - 1 } as CSSProperties;
        const props = { className: styles.item, style, tabIndex: open ? 0 : -1, onClick: closeAndFocusTrigger };
        return action.internal
          ? <Link key={action.id} {...props} href={action.href}>{content}</Link>
          : <a key={action.id} {...props} href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noopener noreferrer" : undefined}>{content}</a>;
      })}
    </nav>
  </aside>;
}
