import type { ContentImage, ContentRecord, HomeSlide } from './cms-types';
import { ownerPhotos } from './owner-photos';
import ownerVideos from './owner-videos.json';

export const DEFAULT_HOME_SLIDE_INTERVAL = 3;
export const MIN_HOME_SLIDE_INTERVAL = 2;
export const MAX_HOME_SLIDE_INTERVAL = 15;
export const MAX_HOME_SLIDES = 12;

export const fleetPhotoSlides: readonly ContentImage[] = [
  { url: '/images/hero/moe-line-3.webp', alt: 'MOE LINE 3 carrying containers along the coast', altTh: 'เรือโมไลน์ 3 บรรทุกตู้คอนเทนเนอร์แล่นเลียบชายฝั่ง' },
  { url: '/images/hero/moe-line-4.webp', alt: 'MOE LINE 4 crane barge at a container terminal', altTh: 'เรือเครนโมไลน์ 4 เทียบท่าที่ลานตู้คอนเทนเนอร์' },
  { url: '/images/hero/moe-line-5.webp', alt: 'MOE LINE 5 underway at sea', altTh: 'เรือโมไลน์ 5 ขณะเดินทะเล' },
  { url: '/images/hero/ranong-moe.webp', alt: 'RANONG MOE alongside a quay', altTh: 'เรือระนองโมจอดเทียบท่า' },
  { url: '/images/hero/moe-line-7.webp', alt: 'Loaded containers on the deck of MOE LINE 7', altTh: 'ตู้คอนเทนเนอร์บรรทุกบนดาดฟ้าเรือโมไลน์ 7' },
];

const formerBanners = new Map([
  ['/images/hero/01-open-water.webp', fleetPhotoSlides[0]],
  ['/images/hero/02-harbor-tug.webp', fleetPhotoSlides[1]],
  ['/images/hero/03-blue-hour-port.webp', fleetPhotoSlides[2]],
  ['/images/hero/04-ocean-carrier.webp', fleetPhotoSlides[3]],
  ['/images/hero/05-coastal-passage.webp', fleetPhotoSlides[4]],
]);
export const ownerVideoSlides: readonly HomeSlide[] = ownerVideos.map(({ url, alt, altTh }) => ({ url, alt, altTh, kind: 'video' }));
export const ownerPhotoSlides: readonly ContentImage[] = [ownerPhotos['archive-moe-line-3-underway'], ownerPhotos['dumai-moe-anchorage']];
export const defaultHomeSlides: readonly HomeSlide[] = [
  ...ownerVideoSlides.flatMap((video, i) => ownerPhotoSlides[i] ? [video, ownerPhotoSlides[i]] : [video]),
  ...ownerPhotoSlides.slice(ownerVideoSlides.length),
];
export const includedHomeSlides: readonly HomeSlide[] = [...defaultHomeSlides, ...fleetPhotoSlides];
const videoPosters = new Map(ownerVideos.map(video => [video.url, video.poster]));
const includedPhotoUrls = new Set([...fleetPhotoSlides, ...ownerPhotoSlides].map(slide => slide.url));
const fleetPhotoUrls = new Set(fleetPhotoSlides.map(slide => slide.url));
export function isBundledHomeSlide(url: string, kind?: HomeSlide['kind']) {
  if (videoPosters.has(url)) return kind === undefined || kind === 'video';
  return kind !== 'video' && (includedPhotoUrls.has(url) || formerBanners.has(url));
}
export function mobileHomeSlidePhoto(url: string) {
  if (fleetPhotoUrls.has(url)) return url.replace('.webp', '-mobile.webp');
  if (ownerPhotoSlides.some(photo => photo.url === url)) return url.replace('/photo-', '/mobile-');
  return undefined;
}
// Share cards need the full photograph instead of the panoramic homepage crop.
export const homeSlideSharePhoto = (url: string) => fleetPhotoUrls.has(url) ? url.replace('/images/hero/', '/images/fleet-originals/') : url;
// The uploaded wider rendition depicts this MOE LINE 3 scene. Use the documented company original.
const previousCoastalPhoto = 'https://res.cloudinary.com/yod4qzgu/image/upload/v1795492687/moe-navigation/5402285d79e4849c3d8e0d839aa7bc55fdd5abfabe1bf522159271c015098a68.webp';

export function homeSlideVideoPoster(url: string): string | undefined {
  const poster = videoPosters.get(url);
  if (poster) return poster;
  if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/.+\.(?:mp4|webm)$/i.test(url)) return undefined;
  return url.replace('/video/upload/', '/video/upload/so_0/').replace(/\.(mp4|webm)$/i, '.jpg');
}

export function getHomeSlides(record?: Pick<ContentRecord, 'heroSlides'>): HomeSlide[] {
  const slides = (record?.heroSlides?.length ? record.heroSlides : defaultHomeSlides).map(slide => {
    if (slide.url === previousCoastalPhoto) {
      const photo = fleetPhotoSlides[0];
      return { ...photo, alt: slide.alt || photo.alt, altTh: slide.altTh || photo.altTh };
    }
    return { ...(formerBanners.get(slide.url) || slide) };
  });
  return slides.filter((slide, index) => slides.findIndex(item => item.url === slide.url) === index);
}

export function getHomeSlideInterval(record?: Pick<ContentRecord, 'heroSlideInterval'>): number {
  const value = record?.heroSlideInterval;
  return value !== undefined && Number.isInteger(value) && value >= MIN_HOME_SLIDE_INTERVAL && value <= MAX_HOME_SLIDE_INTERVAL ? value : DEFAULT_HOME_SLIDE_INTERVAL;
}
