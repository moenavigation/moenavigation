import type { ContentRecord } from '@/lib/cms-types';
import { fleetPhotos } from '@/lib/fleet-photos';

// Vessel-specific slots always retain the identity of the vessel being presented.
export function replaceLegacyFleetPhotos<T extends Omit<ContentRecord, 'revision'>>(record: T, matches: (url: string) => boolean): T {
  if (record.type !== 'Vessel' || !Object.hasOwn(fleetPhotos, record.id)) return record;
  const id = record.id as keyof typeof fleetPhotos;
  const [main, ...alternates] = fleetPhotos[id];
  const replaceMain = matches(record.image);
  const replaceMobile = record.mobileImage && matches(record.mobileImage);
  const replaceGallery = record.gallery?.some(item => matches(item.url));
  if (!replaceMain && !replaceMobile && !replaceGallery) return record;

  let gallery = record.gallery;
  if (gallery && replaceGallery) {
    const firstOld = gallery.findIndex(image => matches(image.url));
    const additions = alternates.filter(photo => photo.url !== record.image && !gallery?.some(image => image.url === photo.url));
    gallery = gallery.flatMap((item, index) => index === firstOld ? additions : matches(item.url) ? [] : [item]);
  } else if (replaceMain && !gallery?.length) {
    gallery = alternates;
  }
  return {
    ...record,
    ...(replaceMain && { image: main.url, imageAlt: main.alt, imageAltTh: main.altTh }),
    ...(replaceMobile && { mobileImage: '' }),
    ...(gallery !== record.gallery && { gallery }),
  };
}
