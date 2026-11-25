import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BlobSource, EncodedPacketSink, Input, MP4, WEBM } from 'mediabunny';
import { prepareCmsVideo } from '../src/lib/cms-video';

test('keeps the original HD picture packets while stripping audio for upload', async () => {
  const bytes = await readFile('tests/fixtures/banner-video.mp4');
  const file = new File([new Uint8Array(bytes)], 'banner.mp4', { type: 'video/mp4' });
  const prepared = await prepareCmsVideo(file);
  const original = new Input({ formats: [MP4], source: new BlobSource(file) });
  const result = new Input({ formats: [MP4], source: new BlobSource(prepared.blob) });
  async function pictureHash(input: Input) {
    const track = await input.getPrimaryVideoTrack();
    assert.ok(track);
    const hash = createHash('sha256');
    for await (const packet of new EncodedPacketSink(track).packets()) hash.update(packet.data);
    return hash.digest('hex');
  }
  try {
    assert.deepEqual([prepared.width, prepared.height], [1536, 512]);
    assert.equal((await original.getTracks()).length, 2);
    assert.equal((await result.getTracks()).length, 1);
    assert.equal(await pictureHash(original), await pictureHash(result));
    assert.ok(prepared.blob.size < file.size);
  } finally {
    original.dispose();
    result.dispose();
    URL.revokeObjectURL(prepared.preview);
  }
});

test('prepares a durationless WebM recording as a smaller, silent, seekable banner', async () => {
  // The short VP9/Opus fixture has no duration field, as with browser recordings.
  const bytes = await readFile('tests/fixtures/banner-recording.webm');
  const file = new File([new Uint8Array(bytes)], 'recording.webm', { type: 'video/webm' });
  const prepared = await prepareCmsVideo(file);
  const result = new Input({ formats: [WEBM], source: new BlobSource(prepared.blob) });
  try {
    assert.deepEqual([prepared.width, prepared.height], [160, 90]);
    assert.equal(prepared.blob.type, 'video/webm');
    assert.ok(prepared.blob.size < file.size);
    assert.equal((await result.getTracks()).length, 1);
    const track = await result.getPrimaryVideoTrack();
    assert.equal(await track?.getCodec(), 'vp9');
    const duration = await track?.getDurationFromMetadata();
    assert.ok(duration && Math.abs(duration - 0.8) < 0.01);
  } finally {
    result.dispose();
    URL.revokeObjectURL(prepared.preview);
  }
});
