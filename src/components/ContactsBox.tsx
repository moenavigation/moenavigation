import { Mail, Map, MapPin, MessageSquare, Phone } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import type { SiteSettings } from "@/lib/cms-types";
import Link from "./NavigationLink";
import styles from "./ContactsBox.module.css";

export default function ContactsBox({ locale, settings }: { locale: Locale; settings: SiteSettings }) {
  const phone = settings.phone.replace(/[^+\d]/g, "");
  const address = local(locale, settings.officeAddress, settings.officeAddressTh) || settings.officeAddress || settings.officeAddressTh;

  return <section className={styles.contacts} aria-labelledby="footer-contacts">
    <h2 id="footer-contacts">{local(locale, "Contact", "ติดต่อเรา")}</h2>
    <address>
      {address && <div className={styles.address}><MapPin aria-hidden="true"/><span>{address}</span></div>}
      {phone.replace(/\D/g, "").length >= 5 && <a href={`tel:${phone}`}>
        <Phone aria-hidden="true"/><span><span className="sr-only">{local(locale, "Call us ", "โทรหาเรา ")}</span>{settings.phone}</span>
      </a>}
      {settings.email && <a href={`mailto:${settings.email}`}>
        <Mail aria-hidden="true"/><span><span className="sr-only">{local(locale, "Email us ", "ส่งอีเมลถึงเรา ")}</span>{settings.email}</span>
      </a>}
      {settings.mapUrl && <a href={settings.mapUrl} target="_blank" rel="noopener noreferrer">
        <Map aria-hidden="true"/><span>{local(locale, "Office map", "แผนที่สำนักงาน")}<span className="sr-only"> {local(locale, "(opens in a new tab)", "(เปิดในแท็บใหม่)")}</span></span>
      </a>}
    </address>
    <Link className={styles.enquiry} href={`${href(locale, "contact")}#contact-form`}><MessageSquare aria-hidden="true"/>{local(locale, "Send an enquiry", "ส่งข้อความสอบถาม")}</Link>
  </section>;
}
