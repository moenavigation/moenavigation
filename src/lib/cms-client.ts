import type { ContentRecord, MediaItem, SiteSettings } from './cms-types';

export type WebsiteDetailsDraft = { saved: SiteSettings; draft: SiteSettings };

export function refreshWebsiteDetailsDraft(current: WebsiteDetailsDraft | null, latest: SiteSettings): WebsiteDetailsDraft {
  // Keep the original revision with a dirty draft so a later save still detects
  // edits made by another administrator instead of silently overwriting them.
  return current && JSON.stringify(current.saved) !== JSON.stringify(current.draft)
    ? current
    : { saved: latest, draft: latest };
}

export function createEditorDraftExport(record: ContentRecord, routeText: string) {
  let exportedRecord = record;
  if (record.type === 'Route') {
    try { exportedRecord = { ...record, waypoints: parseRouteCoordinates(routeText) }; }
    catch { /* The raw coordinate text below preserves incomplete input too. */ }
  }
  return {
    version: 1,
    kind: 'moe-unsaved-content',
    record: exportedRecord,
    ...(record.type === 'Route' ? { routeCoordinatesText: routeText } : {}),
    note: 'This copy contains text and image references. Prepared device image files are not included; keep the original files.',
  };
}

export function changeEditorContentType(record: ContentRecord, nextType: ContentRecord['type'], routeText: string) {
  const next = { ...record, type: nextType };
  const discardedFields: string[] = [];
  if (nextType !== 'Vessel') {
    if (record.vesselSpecs && Object.values(record.vesselSpecs).some(value => value !== undefined && value !== '')) discardedFields.push('vessel specifications');
    delete next.vesselSpecs;
  }
  if (nextType !== 'Route') {
    if (routeText.trim() || record.waypoints?.length || [record.origin, record.destination].some(port => port && Object.values(port).some(value => value.trim()))) discardedFields.push('route ports and coordinates');
    delete next.origin;
    delete next.destination;
    delete next.waypoints;
  }
  return { record: next, discardedFields };
}

export class CmsRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'CmsRequestError';
  }
}

export async function cmsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: init?.signal ?? AbortSignal.timeout(65_000),
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new CmsRequestError('The server could not be reached. Your changes are still here. Check your connection and try again.', 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith('/login')) window.dispatchEvent(new Event('moe-cms-session-expired'));
    throw new CmsRequestError(data?.error || 'This request could not be completed. Please try again.', response.status);
  }
  if (!data) throw new CmsRequestError('The server response could not be read. Refresh the list before trying this change again.', 0);
  return data as T;
}

export function cmsErrorText(error: unknown): string {
  return error instanceof Error ? error.message : 'This request could not be completed. Please try again.';
}

export type PreparedImage = { blob: Blob; preview: string; filename: string; width: number; height: number };

export type SubmissionResult = { status: 'committed' | 'pending' | 'aborted' | 'open'; record?: ContentRecord; media?: MediaItem[]; deleted: number; failed: number; pending: number };
export function resolveSubmission(submissionId: string, action: 'resolve' | 'abort' = 'abort') {
  return cmsRequest<SubmissionResult>('/api/cms/media/submission', { method: 'POST', body: JSON.stringify({ submissionId, action }) });
}
export function mapRecordImages<T extends Pick<ContentRecord, 'image' | 'mobileImage' | 'gallery' | 'heroSlides'>>(record: T, transform: (url: string) => string): T {
  return { ...record, image: transform(record.image), ...(record.mobileImage !== undefined ? { mobileImage: transform(record.mobileImage) } : {}), ...(record.gallery ? { gallery: record.gallery.map(item => ({ ...item, url: transform(item.url) })) } : {}), ...(record.heroSlides ? { heroSlides: record.heroSlides.map(item => ({ ...item, url: transform(item.url) })) } : {}) };
}
export function recordImageUrls(record: Pick<ContentRecord, 'image' | 'mobileImage' | 'gallery' | 'heroSlides'>) {
  return [...new Set([record.image, record.mobileImage, ...(record.gallery || []).map(item => item.url), ...(record.heroSlides || []).map(item => item.url)].filter((url): url is string => Boolean(url)))];
}
export function parseRouteCoordinates(text: string): [number, number][] {
  if (!text.trim()) return [];
  return text.trim().split(/\r?\n/).map((line, index) => {
    const values = line.trim().split(/\s*,\s*/);
    if (values.length !== 2 || values.some(value => !value.trim() || !Number.isFinite(Number(value)))) throw new Error(`Route coordinates: line ${index + 1} needs latitude, longitude.`);
    const latitude = Number(values[0]); const longitude = Number(values[1]);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error(`Route coordinates: line ${index + 1} is outside the valid range.`);
    return [latitude, longitude];
  });
}

export async function prepareCmsImage(file: File): Promise<PreparedImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const original = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = original;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image could not be opened.');
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .86));
    const fallback = scale < 1 ? await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.type, .9)) : file;
    const retained = fallback || file;
    const blob = webp?.type === 'image/webp' && webp.size < retained.size ? webp : retained;
    if (blob.size > 3 * 1024 * 1024) throw new Error('Choose a smaller image. The prepared image must be under 3 MB.');
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    return { blob, preview: URL.createObjectURL(blob), filename: `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, width: canvas.width, height: canvas.height };
  } catch (error) {
    if (error instanceof Error && error.name === 'EncodingError') throw new Error('This image could not be opened. Choose a different JPEG, PNG, or WebP file.');
    throw error;
  } finally {
    URL.revokeObjectURL(original);
  }
}
