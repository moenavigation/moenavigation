"use client";

import Image from "next/image";
import { useEffect, useState, type RefObject } from "react";
import { href, local, type Locale } from "@/lib/content";
import Link from "./NavigationLink";
import styles from "./FloatingContact.module.css";

export default function FloatingContact({ locale, footerRef }: { locale: Locale; footerRef: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    // Leave footer links clear without attaching a listener to every scroll.
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    observer.observe(footer);
    return () => observer.disconnect();
  }, [footerRef]);

  const label = local(locale, "Contact us", "ติดต่อเรา");
  return <Link
    className={`${styles.button} ${visible ? styles.visible : ""}`}
    href={`${href(locale, "contact")}#contact-form`}
    aria-label={label}
    title={local(locale, "Send an enquiry", "ส่งข้อความสอบถาม")}
    data-contact-fab="true"
  >
    <Image className={styles.icon} src="/icons/Email.png" width={24} height={24} alt="" unoptimized />
    <span className={styles.label}>{label}</span>
  </Link>;
}
