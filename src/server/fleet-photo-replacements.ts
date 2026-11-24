import type { ContentRecord } from '@/lib/cms-types';
import { fleetPhotos } from '@/lib/fleet-photos';
import replacedUrls from './legacy-fleet-photo-urls.json';

// Each list contains only the previous seed artwork and the exact delivery URLs from
// the two historical fleet imports. User-selected photos continue to use their saved URLs.
export function replaceLegacyFleetPhotos(record: ContentRecord): ContentRecord {
  if (record.type !== 'Vessel' || !Object.hasOwn(fleetPhotos, record.id)) return record;
  const id = record.id as keyof typeof fleetPhotos;
  const previous = replacedUrls[id];
  const [main, ...alternates] = fleetPhotos[id];
  const replaceMain = previous.includes(record.image);
  const replaceMobile = record.mobileImage && previous.includes(record.mobileImage);
  const replaceGallery = record.gallery?.some(item => previous.includes(item.url));
  if (!replaceMain && !replaceMobile && !replaceGallery) return record;

  let gallery = record.gallery;
  if (gallery && replaceGallery) {
    const firstOld = gallery.findIndex(image => previous.includes(image.url));
    const additions = alternates.filter(photo => photo.url !== record.image && !gallery?.some(image => image.url === photo.url));
    gallery = gallery.flatMap((item, index) => index === firstOld ? additions : previous.includes(item.url) ? [] : [item]);
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
