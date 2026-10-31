import type { ContentImage, ContentRecord } from './cms-types';

export const DEFAULT_HOME_SLIDE_INTERVAL = 3;
export const MIN_HOME_SLIDE_INTERVAL = 2;
export const MAX_HOME_SLIDE_INTERVAL = 15;
export const MAX_HOME_SLIDES = 12;

// Illustrative commissioned artwork, not a claim that these are company vessels.
export const defaultHomeSlides: readonly ContentImage[] = [
  { url: '/images/hero/01-open-water.webp', alt: 'A cargo vessel crossing calm open water in warm morning light', altTh: 'เรือสินค้ากลางทะเลสงบในแสงยามเช้า' },
  { url: '/images/hero/02-harbor-tug.webp', alt: 'A tugboat navigating the harbor', altTh: 'เรือลากจูงกำลังเดินเรือในท่าเรือ' },
  { url: '/images/hero/03-blue-hour-port.webp', alt: 'A maritime port illuminated at blue hour', altTh: 'แสงไฟท่าเรือในช่วงพลบค่ำ' },
  { url: '/images/hero/04-ocean-carrier.webp', alt: 'An ocean carrier sailing across deep blue water', altTh: 'เรือขนส่งสินค้ากำลังแล่นผ่านทะเลสีน้ำเงิน' },
  { url: '/images/hero/05-coastal-passage.webp', alt: 'A vessel following a peaceful coastal passage', altTh: 'เรือกำลังเดินทางผ่านชายฝั่งทะเลอันสงบ' },
];

const bundledUrls = new Set(defaultHomeSlides.map(slide => slide.url));
export const isBundledHomeSlide = (url: string) => bundledUrls.has(url);

export function getHomeSlides(record?: Pick<ContentRecord, 'heroSlides'>): ContentImage[] {
  return (record?.heroSlides?.length ? record.heroSlides : defaultHomeSlides).map(slide => ({ ...slide }));
}

export function getHomeSlideInterval(record?: Pick<ContentRecord, 'heroSlideInterval'>): number {
  const value = record?.heroSlideInterval;
  return value !== undefined && Number.isInteger(value) && value >= MIN_HOME_SLIDE_INTERVAL && value <= MAX_HOME_SLIDE_INTERVAL ? value : DEFAULT_HOME_SLIDE_INTERVAL;
}
