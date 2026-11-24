import {
  BlobSource, BufferTarget, Conversion, getFirstEncodableVideoCodec, Input,
  MP4, Mp4OutputFormat, Output, Quality, WEBM, WebMOutputFormat,
} from 'mediabunny';
import type { PreparedImage } from './cms-client';
import { MAX_SLIDE_VIDEO_BYTES, MAX_SLIDE_VIDEO_SECONDS, MAX_SLIDE_VIDEO_SIDE } from './slide-video-limits';

const unreadable = 'This video could not be opened. Choose another MP4 or WebM file.';
const unsupported = 'This browser could not compress this video. Try another browser or choose a different clip.';

class VideoPreparationError extends Error {}

type PrepareOptions = { signal?: AbortSignal; onProgress?: (fraction: number) => void };

export async function prepareCmsVideo(file: File, { signal, onProgress }: PrepareOptions = {}): Promise<PreparedImage> {
  signal?.throwIfAborted();
  if (!(file.type === 'video/mp4' || file.type === 'video/webm' || (!file.type && /\.(mp4|webm)$/i.test(file.name)))) {
    throw new Error('Choose an MP4 or WebM video.');
  }
  if (file.size > 100 * 1024 * 1024) throw new Error('Choose a video of 100 MB or less.');
  const input = new Input({ formats: [MP4, WEBM], source: new BlobSource(file) });
  let conversion: Conversion | undefined;
  const abort = () => {
    void conversion?.cancel().catch(() => {});
    input.dispose();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoPreparationError(unreadable);
    // Read packet timestamps so recordings with missing container duration also work.
    const [start, end, sourceWidth, sourceHeight, sourceCodec] = await Promise.all([
      track.getFirstTimestamp(), track.computeDuration(), track.getDisplayWidth(), track.getDisplayHeight(), track.getCodec(),
    ]);
    const duration = end - start;
    if (!Number.isFinite(duration) || duration <= 0 || !sourceWidth || !sourceHeight) throw new VideoPreparationError(unreadable);
    if (duration > MAX_SLIDE_VIDEO_SECONDS + 0.000001) throw new VideoPreparationError('Choose a video no longer than 30 seconds.');

    const scale = Math.min(1, MAX_SLIDE_VIDEO_SIDE / Math.max(sourceWidth, sourceHeight));
    const stats = await track.computePacketStats();
    const frameRate = Math.min(30, Math.max(1, stats.averagePacketRate || 30));
    // Reserve room for container overhead and the encoder's variable bitrate.
    const uploadBitrate = Math.min(2_500_000, MAX_SLIDE_VIDEO_BYTES * 8 * 0.82 / duration);
    const bitrate = Math.floor(Math.min(uploadBitrate, Math.max(100_000, stats.averageBitrate * 0.85)));
    const quality = new Quality({ bitrate });
    // A small, already-efficient video track can keep its exact picture quality.
    // It is still repackaged locally to remove audio and source metadata.
    const canCopy = scale === 1 && file.size <= MAX_SLIDE_VIDEO_BYTES && stats.averagePacketRate <= 30
      && stats.averageBitrate <= uploadBitrate * 0.65 && (sourceCodec === 'avc' || sourceCodec === 'vp9' || sourceCodec === 'vp8');
    const width = canCopy ? sourceWidth : Math.max(2, Math.round(sourceWidth * scale / 2) * 2);
    const height = canCopy ? sourceHeight : Math.max(2, Math.round(sourceHeight * scale / 2) * 2);
    const codec = canCopy ? sourceCodec : await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width, height, frameRate, quality });
    if (!codec) throw new VideoPreparationError(unsupported);
    const mp4 = codec === 'avc';
    const target = new BufferTarget();
    const output = new Output({ target, format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat() });
    signal?.throwIfAborted();
    conversion = await Conversion.init({
      input, output, tracks: 'primary', audio: { discard: true }, tags: {}, showWarnings: false,
      video: canCopy ? { codec } : { codec, quality, width, height, fit: 'contain', frameRate, allowTransformationMetadata: false },
    });
    signal?.throwIfAborted();
    if (!conversion.isValid) throw new VideoPreparationError(unsupported);
    if (onProgress) conversion.onProgress = onProgress;
    await conversion.execute();
    signal?.throwIfAborted();
    if (!target.buffer?.byteLength) throw new VideoPreparationError(unsupported);
    if (target.buffer.byteLength > MAX_SLIDE_VIDEO_BYTES) {
      throw new VideoPreparationError('The prepared video exceeds 4 MB. Choose a shorter clip.');
    }
    const blob = new Blob([target.buffer], { type: mp4 ? 'video/mp4' : 'video/webm' });
    const filename = file.name.replace(/\.[^.]+$/, '') + (mp4 ? '.mp4' : '.webm');
    return { blob, preview: URL.createObjectURL(blob), width, height, filename };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof VideoPreparationError) throw error;
    throw new Error(conversion ? unsupported : unreadable, { cause: error });
  } finally {
    signal?.removeEventListener('abort', abort);
    input.dispose();
  }
}
