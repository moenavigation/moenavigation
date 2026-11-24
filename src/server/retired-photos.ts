import { createHash } from 'node:crypto';
import type { ContentImage, ContentRecord, HomeSlide } from '@/lib/cms-types';
import { companyPhotoReplacements } from '@/lib/company-photo-replacements';
import { fleetPhotos, isBundledVesselPhoto } from '@/lib/fleet-photos';
import { defaultHomeSlides, getHomeSlides } from '@/lib/home-slides';
import { replaceLegacyFleetPhotos } from './fleet-photo-replacements';
import identities from './retired-photo-identities.json';
import manifest from '../../scripts/data/media-manifest.json';

type Identity = { source: string; url?: string; id?: string; sha256: string; vessel?: string };
const byUrl = new Map<string, Identity>();
const byRecoveryFile = new Map<string, Identity>();
const byId = new Map<string, Identity>();
const byHash = new Map<string, Identity>();
for (const photo of identities as Identity[]) {
  byUrl.set(photo.source, photo);
  if (photo.url) byUrl.set(photo.url, photo);
  byHash.set(photo.sha256, photo);
  if (photo.id) {
    byId.set(photo.id, photo);
    // Recovery preserves the media ID and writes this content-addressed filename.
    const key = createHash('sha256').update(photo.id).digest('hex').slice(0, 20);
    byRecoveryFile.set(`${key}-${photo.sha256.slice(0, 16)}`, photo);
  }
}

function identityForUrl(url: string) {
  const direct = byUrl.get(url);
  if (direct) return direct;
  const recovery = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?[\w/-]+\/recovery\/[\w-]+\/([0-9a-f]{20}-[0-9a-f]{16})\.\w+$/.exec(url);
  return recovery ? byRecoveryFile.get(recovery[1]) : undefined;
}

export const retiredPhotoSource = (url: string) => identityForUrl(url)?.source;
type MediaIdentity = { url: string; id?: string; _id?: string; sourcePath?: string; sourceSha256?: string };
export function isRetiredMedia(media: MediaIdentity) {
  return Boolean(identityForUrl(media.url) || byId.has(media.id ?? media._id ?? '')
    || byUrl.has(media.sourcePath ?? '') || byHash.has(media.sourceSha256 ?? ''));
}

// Apply before cursor/limit so hidden files cannot create empty picker pages.
export const selectableMediaFilter = {
  _id: { $nin: [...byId.keys()] }, url: { $nin: [...byUrl.keys()] },
  sourcePath: { $nin: identities.map(photo => photo.source) }, sourceSha256: { $nin: [...byHash.keys()] },
};

const verifiedPhotos = new Set([
  ...manifest.map(photo => photo.sourcePath), ...defaultHomeSlides.map(photo => photo.url),
]);
export function isBundledContentPhoto(type: string, id: string, url: string) {
  return type === 'Vessel' ? isBundledVesselPhoto(type, id, url) : verifiedPhotos.has(url);
}

function replacement(image: HomeSlide): ContentImage | undefined {
  if (image.kind === 'video') return;
  const previous = identityForUrl(image.url);
  if (!previous) return;
  if (previous.vessel) return fleetPhotos[previous.vessel as keyof typeof fleetPhotos][0];
  return companyPhotoReplacements[previous.source] ?? getHomeSlides({ heroSlides: [{ ...image, url: previous.source }] })[0];
}

function replaceList<T extends HomeSlide>(items?: T[]) {
  if (!items?.some(item => identityForUrl(item.url) && item.kind !== 'video')) return items;
  // Keep the current editor's descriptions when a retired item resolves to a photo
  // already selected in this list, even if the retired item came first.
  const retained = new Set(items.filter(item => !identityForUrl(item.url)).map(item => item.url));
  return items.flatMap(item => {
    const photo = replacement(item);
    if (!photo) return [item];
    if (retained.has(photo.url)) return [];
    retained.add(photo.url);
    return [photo];
  });
}

export function replaceRetiredContentPhotos<T extends Omit<ContentRecord, 'revision'>>(record: T): T {
  const vessel = replaceLegacyFleetPhotos(record, url => Boolean(identityForUrl(url)));
  const image = replacement({ url: vessel.image, alt: vessel.imageAlt ?? '', altTh: vessel.imageAltTh ?? '' });
  const mobile = vessel.mobileImage && replacement({ url: vessel.mobileImage, alt: '', altTh: '' });
  const gallery = replaceList(vessel.gallery);
  const heroSlides = replaceList(vessel.heroSlides);
  if (!image && !mobile && gallery === vessel.gallery && heroSlides === vessel.heroSlides) return vessel;
  return { ...vessel, ...(image && { image: image.url, imageAlt: image.alt, imageAltTh: image.altTh }),
    ...(mobile && { mobileImage: mobile.url }), ...(gallery !== vessel.gallery && { gallery }),
    ...(heroSlides !== vessel.heroSlides && { heroSlides }),
  };
}
