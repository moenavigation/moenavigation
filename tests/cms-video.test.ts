import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BlobSource, Input, WEBM } from 'mediabunny';
import { prepareCmsVideo } from '../src/lib/cms-video';

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
