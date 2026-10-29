import { Ship } from "lucide-react";
import { local, type Locale } from "@/lib/content";
import styles from "./VesselPhotoPlaceholder.module.css";

export default function VesselPhotoPlaceholder({ locale }: { locale: Locale }) {
  return <div className={styles.placeholder}>
    <Ship className={styles.icon} strokeWidth={1.2} aria-hidden="true" />
    <span>{local(locale, "Vessel photo not yet available", "ยังไม่มีภาพเรือลำนี้")}</span>
  </div>;
}
