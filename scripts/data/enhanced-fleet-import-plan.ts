import assert from 'node:assert/strict';
import type { ContentRecord } from '../../src/lib/cms-types';
import { normalizeFleetNames } from '../../src/lib/fleet-names';
import selected from './enhanced-fleet-images.json';

export const enhancedFleetOwner = 'enhanced-fleet-import-2026-11-17';
export const enhancedFleetSubmission = '2aa82621-c73f-43b2-bab2-729036ac3d07';
export const enhancedFleetSelection = selected;
export type FleetImagePatch = Pick<ContentRecord, 'image' | 'imageAlt' | 'imageAltTh' | 'gallery'>;

export function buildEnhancedFleetPlan(records: ContentRecord[], urls: Record<string, string>) {
  assert.equal(selected.vessels.length, 7);
  assert.equal(new Set(selected.vessels.map(item => item.id)).size, 7);
  const updates: { id: string; name: string; expectedRevision: number; patch: FleetImagePatch }[] = [];
  for (const vessel of selected.vessels) {
    assert.notEqual(vessel.id, 'dumai-moe');
    const matches = records.filter(record => record.type === 'Vessel' && record.id === vessel.id);
    assert.equal(matches.length, 1, `Expected exactly one saved vessel ${vessel.id}.`);
    const record = matches[0];
    assert(!record.deletedAt, `Vessel ${vessel.id} is removed.`);
    assert.equal(normalizeFleetNames(record).title, vessel.currentName, `Vessel name conflicts with the reviewed photo: ${vessel.id}.`);
    const image = urls[vessel.main.url];
    const alternate = vessel.gallery.map(photo => {
      assert(urls[photo.url], `Missing prepared photo ${photo.url}.`);
      return { url: urls[photo.url], alt: photo.alt, altTh: photo.altTh };
    });
    assert(image && alternate.length === 1 && alternate[0].url !== image, `Incomplete corrected image pair for ${vessel.id}.`);
    // Replace explicitly labelled placeholders, while retaining client-added photos.
    const previous = (record.gallery || []).filter(photo =>
      !/^(Illustration of\b|.+ — illustrative maritime image\b)/i.test(photo.alt)
      && !/^ภาพประกอบ/.test(photo.altTh || ''));
    const gallery = [...alternate, ...previous].filter((photo, index, all) =>
      photo.url !== image && all.findIndex(item => item.url === photo.url) === index);
    assert(gallery.length <= 12, `Review the existing gallery for ${vessel.id}; it exceeds 12 photos.`);
    const patch = { image, imageAlt: vessel.main.alt, imageAltTh: vessel.main.altTh, gallery };
    const current = { image: record.image, imageAlt: record.imageAlt, imageAltTh: record.imageAltTh, gallery: record.gallery };
    if (JSON.stringify(current) !== JSON.stringify(patch)) updates.push({ id: vessel.id, name: record.title, expectedRevision: record.revision, patch });
  }
  return updates;
}
