import Image from "next/image";
import type { ReactNode } from "react";
import { href, local, type Locale } from "@/lib/content";
import type { SiteSettings } from "@/lib/cms-types";
import Link from "./NavigationLink";
import styles from "./ContactsBox.module.css";

type ContactBoxLink = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  internal?: boolean;
  external?: boolean;
};

export default function ContactsBox({ locale, settings }: { locale: Locale; settings: SiteSettings }) {
  const links: ContactBoxLink[] = [];
  const phone = settings.phone.replace(/[^+\d]/g, "");
  if (phone.replace(/\D/g, "").length >= 5) links.push({
    id: "phone",
    label: local(locale, `Call us: ${settings.phone}`, `โทรหาเรา ${settings.phone}`),
    href: `tel:${phone}`,
    icon: <Image className={styles.image} src="/icons/Phone.svg" width={96} height={96} alt="" unoptimized />,
  });
  links.push({
    id: "enquiry",
    label: local(locale, "Send an enquiry", "ส่งข้อความสอบถาม"),
    href: `${href(locale, "contact")}#contact-form`,
    icon: <Image className={styles.image} src="/icons/Email.svg" width={96} height={96} alt="" unoptimized />,
    internal: true,
  });
  if (settings.email) links.push({
    id: "email",
    label: local(locale, `Email us: ${settings.email}`, `ส่งอีเมลถึงเรา ${settings.email}`),
    href: `mailto:${settings.email}`,
    icon: <Image className={styles.image} src="/icons/Email.svg" width={96} height={96} alt="" unoptimized />,
  });
  if (settings.mapUrl) links.push({
    id: "map",
    label: local(locale, "Office map (opens in a new tab)", "แผนที่สำนักงาน (เปิดในแท็บใหม่)"),
    href: settings.mapUrl,
    icon: <Image className={styles.image} src="/icons/Location.svg" width={96} height={96} alt="" unoptimized />,
    external: true,
  });

  return <nav className={styles.contactBar} aria-label={local(locale, "Footer contact options", "ช่องทางติดต่อท้ายเว็บไซต์")}>
    {links.map(link => {
      const props = { className: styles.contactIcon, "aria-label": link.label, title: link.label };
      return link.internal
        ? <Link key={link.id} href={link.href} {...props}>{link.icon}</Link>
        : <a key={link.id} href={link.href} {...props} target={link.external ? "_blank" : undefined} rel={link.external ? "noopener noreferrer" : undefined}>{link.icon}</a>;
    })}
  </nav>;
}
