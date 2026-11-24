import type { ContentImage } from './cms-types';

export const numberedFleetNames = [2, 3, 4, 5, 6, 7].map(number => ({
  id: `moe-line-${number}`, number,
  en: `MOE LINE ${number}`, oldEn: `MOE ${number}`,
  th: `โมไลน์ ${number}`, oldTh: [`โม${number}`, `โม ${number}`],
}));

type VesselNameFields = {
  type: string; id: string; title: string; titleTh?: string;
  imageAlt?: string; imageAltTh?: string; gallery?: ContentImage[]; fleetNamesReviewed?: boolean;
};

/** Display the former fleet values on their original records using the updated names. */
export function normalizeFleetNames<T extends VesselNameFields>(record: T): T {
  if (record.type !== 'Vessel' || record.fleetNamesReviewed) return record;
  const names = numberedFleetNames.find(item => item.id === record.id);
  if (!names) return record;
  const english = new RegExp(`\\bMOE ${names.number}\\b`, 'g');
  const thai = new RegExp(`โม ?${names.number}(?![0-9])`, 'g');
  return {
    ...record,
    title: record.title === names.oldEn ? names.en : record.title,
    ...(names.oldTh.includes(record.titleTh ?? '') ? { titleTh: names.th } : {}),
    ...(record.imageAlt ? { imageAlt: record.imageAlt.replace(english, names.en) } : {}),
    ...(record.imageAltTh ? { imageAltTh: record.imageAltTh.replace(thai, names.th) } : {}),
    ...(record.gallery ? { gallery: record.gallery.map(photo => ({
      ...photo,
      ...(photo.alt ? { alt: photo.alt.replace(english, names.en) } : {}),
      ...(photo.altTh ? { altTh: photo.altTh.replace(thai, names.th) } : {}),
    })) } : {}),
  };
}

export function formerFleetSearchNames(id: string, en: string, th: string) {
  const names = numberedFleetNames.find(item => item.id === id);
  if (!names) return [];
  return [...(en === names.en ? [names.oldEn] : []), ...(th === names.th ? names.oldTh : [])];
}

/** Alias matches are constrained by both the vessel ID and its stored name. */
export function fleetNameSearchFilters(query: string) {
  const text = query.toLowerCase();
  const filters: ({ id: string; title: { $in: string[] } } | { id: string; titleTh: { $in: string[] } })[] = [];
  for (const names of numberedFleetNames) {
    const en = [names.en, names.oldEn];
    const th = [names.th, ...names.oldTh];
    if (en.some(name => name.toLowerCase().includes(text))) filters.push({ id: names.id, title: { $in: en } });
    if (th.some(name => name.includes(text))) filters.push({ id: names.id, titleTh: { $in: th } });
  }
  return filters;
}
