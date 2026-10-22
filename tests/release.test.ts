import assert from 'node:assert/strict';
import test from 'node:test';
import { indexingEnabled, publicHttpsOrigin, siteOrigin } from '../src/lib/site-config';
import loader from '../src/lib/cloudinary-loader';
import { safeErrorDetails } from '../src/lib/error-reporting';

test('indexing requires explicit content approval and a production public HTTPS origin', () => {
  const ready = { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://moe-navigation.com', SITE_INDEXING_ENABLED: 'true', SITE_CONTENT_APPROVED: 'true' };
  assert.equal(indexingEnabled(ready), true);
  for (const changes of [{ NODE_ENV: 'development' }, { SITE_CONTENT_APPROVED: 'false' }, { SITE_INDEXING_ENABLED: 'false' }, { VERCEL_ENV: 'preview' }, { NEXT_PUBLIC_SITE_URL: 'https://example.com' }, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3005' }]) assert.equal(indexingEnabled({ ...ready, ...changes }), false);
  for (const url of ['https://127.0.0.1', 'https://a.local', 'https://a.example', 'https://u:p@moe-navigation.com', 'https://moe-navigation.com/path', 'https://moe-navigation.com?x=1']) assert.equal(publicHttpsOrigin(url), false);
  assert.equal(siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://moe-navigation.com/' }), 'https://moe-navigation.com');
  assert.throws(() => siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://example.com/extra' }));
});

test('responsive media delivery preserves original identity and skips signed/external URLs', () => {
  const original = 'https://res.cloudinary.com/test/image/upload/v123/moe/photo.webp';
  assert.equal(loader({ src: original, width: 640 }), 'https://res.cloudinary.com/test/image/upload/f_auto,q_auto:good,c_limit,w_640/v123/moe/photo.webp');
  assert.match(loader({ src: original, width: 10000 }), /w_3840/);
  for (const src of ['/icon.svg', 'blob:local-image', 'https://example.com/a.jpg', 'https://res.cloudinary.com/test/image/upload/s--signed--/v1/a.jpg']) assert.equal(loader({ src, width: 640 }), src);
});

test('error reporting excludes provider messages, arbitrary names, stacks, and unsafe digests', () => {
  const error = Object.assign(new Error('mongodb://private-credential'), { digest: 'known-123' });
  assert.deepEqual(safeErrorDetails(error), { type: 'Error', digest: 'known-123' });
  error.name = 'secret-token'; error.digest = 'private\nvalue';
  assert.deepEqual(safeErrorDetails(error), { type: 'UnknownError' });
});
