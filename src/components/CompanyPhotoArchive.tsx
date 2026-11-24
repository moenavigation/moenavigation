'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { ContentImage } from '@/lib/cms-types';
import { local, type Locale } from '@/lib/content';
import Dialog from './Dialog';
import styles from './AboutPage.module.css';

export default function CompanyPhotoArchive({ photos, locale }: { photos: ContentImage[]; locale: Locale }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = local(locale, 'Company photo archive', 'ภาพจากคลังของบริษัท');
  const enlarge = local(locale, 'Enlarge photo', 'ขยายภาพ');
  function describe(photo: ContentImage, index: number) {
    const lang = !photo.altTh ? 'en' : !photo.alt ? 'th' : locale;
    const caption = local(lang, photo.alt, photo.altTh);
    const alt = caption || local(locale, `Archive photo ${index + 1}`, `ภาพจากคลังลำดับที่ ${index + 1}`);
    return { caption, alt, lang: caption ? lang : locale };
  }
  const selected = selectedIndex === null ? null : photos[selectedIndex];
  const description = selected && selectedIndex !== null ? describe(selected, selectedIndex) : null;
  return <section className={styles.archive} aria-labelledby="company-photo-archive">
    <h2 id="company-photo-archive">{title}</h2>
    <div className={styles.archiveGrid}>
      {photos.map((photo, index) => {
        const { caption, alt, lang } = describe(photo, index);
        return <figure key={photo.url + index}>
          <button type="button" aria-haspopup="dialog" onClick={event => {
            trigger.current = event.currentTarget;
            setSelectedIndex(index);
          }}>
            <span className="sr-only">{enlarge} · </span>
            <Image src={photo.url} alt={alt} lang={lang} fill sizes="(max-width: 650px) 82vw, (max-width: 950px) 45vw, 30vw" />
            <span className={styles.zoomIcon}><Maximize2 size={18} aria-hidden="true" /></span>
          </button>
          {caption && <figcaption lang={lang}>{caption}</figcaption>}
        </figure>;
      })}
    </div>
    <Dialog open={!!selected} onClose={() => setSelectedIndex(null)} triggerRef={trigger} title={title} closeLabel={local(locale, 'Close photograph', 'ปิดภาพ')}>
      {selected && description && <figure className={styles.archivePreview} lang={description.lang}>
        <div><Image src={selected.url} alt={description.alt} fill loading="eager" sizes="(max-width: 960px) 90vw, 55rem" /></div>
        {description.caption && <figcaption>{description.caption}</figcaption>}
      </figure>}
    </Dialog>
  </section>;
}
