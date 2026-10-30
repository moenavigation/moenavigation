import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCollectionId, newCollectionDraft } from '../src/lib/cms-collection-editor';
import type { ContentRecord } from '../src/lib/cms-types';
import { idSchema } from '../src/lib/validation';

test('automatic addresses support duplicate, non-Latin and long names without exceeding URL limits', () => {
  const token = '12345678-1234-4321-8321-123456789abc';
  for (const title of ['เรือทดสอบ', '---', 'Étoile du Nord', 'A'.repeat(200), 'A'.repeat(85) + ' --- B']) {
    assert.ok(idSchema.safeParse(createCollectionId('Vessel', title, token)).success);
  }
  assert.notEqual(createCollectionId('Vessel', 'Same name', token), createCollectionId('Vessel', 'Same name', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'));
  assert.match(createCollectionId('Vessel', 'เรือทดสอบ', token), /^vessel-/);
});

test('new drafts use appropriate defaults and append to their own collection without inventing vessel facts', () => {
  const records = [{ type: 'Service', order: 99 }, { type: 'Vessel', order: 5 }, { type: 'Vessel', order: 12, deletedAt: '2026-01-01' }] as ContentRecord[];
  const vessel = newCollectionDraft('Vessel', records);
  assert.equal(vessel.order, 13);
  assert.equal(vessel.category, '');
  assert.equal(vessel.id, '');
  assert.equal(vessel.vesselSpecs, undefined);
  assert.equal(newCollectionDraft('Service', records).category, 'Maritime services');
  assert.equal(newCollectionDraft('Route', records).category, 'Port connections');
  assert.equal(newCollectionDraft('News', [], new Date(2026, 9, 30, 9)).date, '2026-10-30');
  assert.equal(newCollectionDraft('Project', []).date, undefined);
  assert.equal(newCollectionDraft('Vessel', [{ type: 'Vessel', order: 10000 }] as ContentRecord[]).order, 10000);
});
