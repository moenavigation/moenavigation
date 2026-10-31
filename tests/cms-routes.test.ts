import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cmsPathForView, cmsViewFromPathname } from '../src/lib/cms-routes';

test('website settings and administrator accounts have separate destinations', () => {
  assert.equal(cmsPathForView('setting'), '/cms/setting');
  assert.deepEqual(cmsViewFromPathname('/cms/setting'), { section: 'setting', type: 'All' });
  assert.equal(cmsPathForView('users'), '/cms/users');
  assert.deepEqual(cmsViewFromPathname('/cms/users'), { section: 'users', type: 'All' });
  assert.equal(cmsPathForView('logs'), '/cms/logs');
  assert.deepEqual(cmsViewFromPathname('/cms/logs'), { section: 'logs', type: 'All' });
  assert.equal(cmsPathForView('usage'), '/cms/usage');
  assert.deepEqual(cmsViewFromPathname('/cms/usage'), { section: 'usage', type: 'All' });
  assert.equal(cmsPathForView('slides'), '/cms/slides');
  assert.deepEqual(cmsViewFromPathname('/cms/slides'), { section: 'slides', type: 'All' });
});

test('old section links resolve to the existing Pages manager', () => {
  const url = new URL(cmsPathForView('content', 'Section'), 'https://example.test');
  assert.equal(url.pathname, '/cms/pages');
  assert.deepEqual(cmsViewFromPathname(url.pathname, url.searchParams), { section: 'content', type: 'Page' });
  assert.deepEqual(cmsViewFromPathname('/cms', new URLSearchParams('type=Section')), { section: 'content', type: 'Page' });
  assert.deepEqual(cmsViewFromPathname('/cms/sections'), { section: 'content', type: 'All' });
  assert.deepEqual(cmsViewFromPathname('/cms'), { section: 'content', type: 'All' });
});

test('section filters do not override other CMS views or accept arbitrary content types', () => {
  const params = new URLSearchParams('type=Section');
  assert.equal(cmsPathForView('content', 'Page'), '/cms/pages');
  assert.equal(cmsPathForView('content'), '/cms');
  assert.deepEqual(cmsViewFromPathname('/cms/pages', params), { section: 'content', type: 'Page' });
  assert.deepEqual(cmsViewFromPathname('/cms/trash', params), { section: 'trash', type: 'All' });
  assert.deepEqual(cmsViewFromPathname('/cms/logs', params), { section: 'logs', type: 'All' });
  assert.deepEqual(cmsViewFromPathname('/cms/usage', params), { section: 'usage', type: 'All' });
  assert.deepEqual(cmsViewFromPathname('/cms', new URLSearchParams('type=unknown')), { section: 'content', type: 'All' });
});
