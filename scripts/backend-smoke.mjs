import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const base = new URL(args.find(arg => /^https?:\/\//.test(arg)) || 'http://localhost:3005');
const allowWrite = args.includes('--allow-write');
const skipUpload = args.includes('--skip-upload');
const qa = args.includes('--qa');
const credentialsPath = args.find(arg => arg.startsWith('--credentials='))?.slice('--credentials='.length);
const runId = `qa-${Date.now()}-${randomUUID().slice(0, 8)}`;
const report = { runId, base: base.origin, content: [], enquiries: [], media: [], checks: [], cleanup: [] };
let cookie = '';

async function request(path, { method = 'GET', body, authenticated = true, origin = base.origin, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (method !== 'GET' && method !== 'HEAD' && origin !== null) requestHeaders.Origin = origin;
  if (authenticated && cookie) requestHeaders.Cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) requestHeaders['Content-Type'] = 'application/json';
  const response = await fetch(new URL(path, base), {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { response, data, text };
}

function status(result, expected, label) {
  assert.equal(result.response.status, expected, `${label}: expected HTTP ${expected}, received ${result.response.status}`);
}

async function check(label, run) {
  await run();
  report.checks.push(label);
  console.log(`PASS: ${label}`);
}

async function publicStatus(path, expected, label) {
  const result = await request(path, { authenticated: false });
  status(result, expected, label);
  return result;
}

async function contentSave(record, expectedRevision, submissionId = randomUUID()) {
  return request('/api/cms/content', { method: 'POST', body: { record, expectedRevision, submissionId } });
}

async function contentAction(record, action) {
  return request('/api/cms/content/action', {
    method: 'POST', body: { id: record.id, type: record.type, expectedRevision: record.revision, action },
  });
}

try {
  await check('CMS data and mutations require authentication', async () => {
    for (const path of ['/api/cms/content', '/api/cms/media', '/api/cms/inbox', '/api/cms/export', '/api/cms/settings']) {
      status(await request(path, { authenticated: false }), 401, path);
    }
    for (const path of ['/api/cms/content', '/api/cms/content/action', '/api/cms/media', '/api/cms/media/commit', '/api/cms/media/remove', '/api/cms/media/cleanup', '/api/cms/media/submission', '/api/cms/password']) {
      status(await request(path, { method: 'POST', body: {}, authenticated: false }), 401, path);
    }
    status(await request('/api/cms/inbox', { method: 'PATCH', body: {}, authenticated: false }), 401, 'Inbox update');
    status(await request(`/api/cms/inbox?id=${randomUUID()}`, { authenticated: false }), 401, 'Individual enquiry');
    status(await request('/api/cms/settings', { method: 'PUT', body: {}, authenticated: false }), 401, 'Website settings update');
  });

  await check('Anonymous session exposes no user', async () => {
    const result = await request('/api/cms/session', { authenticated: false });
    status(result, 200, 'Session');
    assert.equal(result.data?.user, null);
  });

  await check('Cross-origin login and enquiry requests are rejected', async () => {
    for (const path of ['/api/cms/login', '/api/contact']) {
      status(await request(path, { method: 'POST', body: {}, origin: 'https://untrusted.invalid', authenticated: false }), 403, path);
    }
  });

  if (!allowWrite) {
    console.log('Read-only checks complete. Add --allow-write against an isolated QA database to exercise login, content, enquiries, and uploads.');
  } else {
    let credentials = { username: process.env.CMS_TEST_USERNAME, password: process.env.CMS_TEST_PASSWORD };
    if (!credentials.username || !credentials.password) {
      const local = JSON.parse(await readFile(credentialsPath || new URL(qa ? '../.local/cms-access.qa.json' : '../.local/cms-access.json', import.meta.url), 'utf8'));
      credentials = { username: local.username, password: local.password };
    }
    assert.ok(credentials.username && credentials.password, 'Supply test credentials in the environment or the selected private credentials file.');

    await check('Wrong password is rejected', async () => {
      const result = await request('/api/cms/login', { method: 'POST', body: { username: credentials.username, password: randomUUID() }, authenticated: false });
      status(result, 401, 'Wrong password');
    });

    await check('Login creates a private session cookie', async () => {
      const result = await request('/api/cms/login', { method: 'POST', body: credentials, authenticated: false });
      status(result, 200, 'Login');
      const setCookies = result.response.headers.getSetCookie();
      assert.ok(setCookies.length, 'Session cookie must be set');
      const sessionCookie = setCookies.find(value => /HttpOnly/i.test(value));
      assert.ok(sessionCookie, 'Session cookie must be HttpOnly');
      assert.match(sessionCookie, /SameSite=(?:Strict|Lax)/i);
      assert.match(sessionCookie, /Path=\//i);
      if (base.protocol === 'https:') assert.match(sessionCookie, /Secure/i);
      cookie = sessionCookie.split(';', 1)[0];
      assert.ok(!result.text.includes(credentials.password), 'Password must never appear in a response');
      const session = await request('/api/cms/session');
      assert.equal(session.data?.user?.username, credentials.username);
    });

    await check('Authenticated mutations reject another origin', async () => {
      status(await request('/api/cms/content', { method: 'POST', body: {}, origin: 'https://untrusted.invalid' }), 403, 'Content origin');
    });

    await check('CMS responses cannot be cached publicly', async () => {
      const result = await request('/api/cms/content');
      status(result, 200, 'Content list');
      assert.ok(Array.isArray(result.data?.records));
      assert.match(result.response.headers.get('cache-control') || '', /no-store/i);
      const exported = await request('/api/cms/export');
      status(exported, 200, 'Data export');
      assert.match(exported.response.headers.get('content-disposition') || '', /attachment/);
      assert.ok(Array.isArray(exported.data?.records) && Array.isArray(exported.data?.enquiries) && Array.isArray(exported.data?.media));
      assert.ok(!('users' in exported.data) && !('sessions' in exported.data));
      assert.ok(!exported.text.includes(credentials.password), 'Export must never include login credentials');
    });

    await check('Website settings save with conflict protection and can be restored', async () => {
      const before = await request('/api/cms/settings');
      status(before, 200, 'Read website settings');
      const original = before.data.settings;
      const changed = { ...original, companyName: `QA settings ${runId}`, companyNameTh: `ตรวจสอบ ${runId}` };
      try {
        const foreign = await request('/api/cms/settings', { method: 'PUT', body: { settings: changed, expectedRevision: original.revision }, origin: 'https://untrusted.invalid' });
        status(foreign, 403, 'Website settings origin');
        const saved = await request('/api/cms/settings', { method: 'PUT', body: { settings: changed, expectedRevision: original.revision } });
        status(saved, 200, 'Save website settings');
        assert.equal(saved.data.settings.revision, original.revision + 1);
        const stale = await request('/api/cms/settings', { method: 'PUT', body: { settings: original, expectedRevision: original.revision } });
        status(stale, 409, 'Stale website settings');
        const readback = await request('/api/cms/settings');
        assert.equal(readback.data.settings.companyName, changed.companyName);
      } finally {
        const latest = await request('/api/cms/settings');
        if (latest.data?.settings?.companyName === changed.companyName) {
          const restored = await request('/api/cms/settings', { method: 'PUT', body: { settings: original, expectedRevision: latest.data.settings.revision } });
          status(restored, 200, 'Restore QA website settings');
          assert.equal(restored.data.settings.companyName, original.companyName);
        }
      }
    });

    const existingLibrary = await request('/api/cms/media');
    status(existingLibrary, 200, 'Library fixture');
    const existingImage = existingLibrary.data.media[0]?.url;
    assert.ok(existingImage, 'Initialize the isolated QA media library before running write checks.');
    const record = {
      id: runId,
      type: 'News',
      title: `Backend verification ${runId}`,
      titleTh: `ตรวจสอบระบบ ${runId}`,
      description: 'A temporary isolated QA record for persistence and publication checks.',
      descriptionTh: 'ข้อมูลชั่วคราวสำหรับตรวจสอบการบันทึกและเผยแพร่',
      image: existingImage,
      imageAlt: 'Illustrative maritime scene',
      imageAltTh: 'ภาพประกอบการเดินเรือ',
      category: 'Verification',
      categoryTh: 'การตรวจสอบ',
      status: 'Draft',
    };

    await check('Invalid identifiers, missing translations, and unowned media are rejected', async () => {
      for (const invalid of [
        { ...record, id: '../unsafe' },
        { ...record, titleTh: '' },
        { ...record, image: 'https://example.com/unowned-image.jpg' },
        { ...record, image: 'data:image/png;base64,not-an-image' },
      ]) {
        const result = await contentSave(invalid, null);
        assert.ok([400, 422].includes(result.response.status), `Invalid content must be rejected, received ${result.response.status}`);
      }
    });

    let current;
    await check('Content saves once when a request is retried', async () => {
      const submissionId = randomUUID();
      const first = await contentSave(record, null, submissionId);
      assert.ok([200, 201].includes(first.response.status), `Create received ${first.response.status}`);
      current = first.data.record;
      report.content.push({ id: current.id, type: current.type });
      assert.ok(Number.isInteger(current.revision));
      const retry = await contentSave(record, null, submissionId);
      assert.ok([200, 201].includes(retry.response.status), `Retry received ${retry.response.status}`);
      assert.equal(retry.data.record.id, current.id);
      assert.equal(retry.data.record.revision, current.revision);
      const list = await request('/api/cms/content');
      assert.equal(list.data.records.filter(item => item.id === current.id && item.type === current.type).length, 1);
    });

    await check('Draft content returns HTTP 404 in both languages', async () => {
      await publicStatus(`/news/${runId}`, 404, 'Thai draft');
      await publicStatus(`/en/news/${runId}`, 404, 'English draft');
    });

    await check('Published content appears in HTML, metadata, and sitemap', async () => {
      const published = await contentSave({ ...current, status: 'Published' }, current.revision);
      status(published, 200, 'Publish');
      const staleRevision = current.revision;
      current = published.data.record;
      assert.ok(current.revision > staleRevision);
      const english = await publicStatus(`/en/news/${runId}`, 200, 'English published');
      assert.ok(english.text.includes(record.title), 'Published English title must be server rendered');
      assert.match(english.text, /<link rel="canonical"/);
      assert.match(english.text, /hrefLang="th"/);
      const thai = await publicStatus(`/news/${runId}`, 200, 'Thai published');
      assert.ok(thai.text.includes(record.titleTh), 'Published Thai title must be server rendered');
      const sitemap = await request('/sitemap.xml', { authenticated: false });
      assert.ok(sitemap.text.includes(`/news/${runId}`), 'Published detail must be included in sitemap');
      const conflict = await contentSave({ ...current, title: 'A stale edit must never win' }, staleRevision);
      status(conflict, 409, 'Stale update');
    });

    await check('Trash removes public content and stale restore is rejected', async () => {
      const trashed = await contentAction(current, 'trash');
      status(trashed, 200, 'Trash');
      const previous = current;
      current = trashed.data.record;
      assert.ok(current.deletedAt);
      await publicStatus(`/en/news/${runId}`, 404, 'Trashed detail');
      const sitemap = await request('/sitemap.xml', { authenticated: false });
      assert.ok(!sitemap.text.includes(`/news/${runId}`), 'Trash must be excluded from sitemap');
      status(await contentAction(previous, 'restore'), 409, 'Stale restore');
      const restored = await contentAction(current, 'restore');
      status(restored, 200, 'Restore');
      current = restored.data.record;
      assert.ok(!current.deletedAt);
      await publicStatus(`/en/news/${runId}`, 200, 'Restored detail');
      const drafted = await contentSave({ ...current, status: 'Draft' }, current.revision);
      status(drafted, 200, 'Return to draft');
      current = drafted.data.record;
      await publicStatus(`/en/news/${runId}`, 404, 'Unpublished detail');
    });

    if (!skipUpload) {
      await check('Cloudinary retries reuse the asset and content commits only its own staged upload', async () => {
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzGQAAAAASUVORK5CYII=', 'base64');
        const submissionId = randomUUID();
        const form = () => {
          const value = new FormData();
          value.set('file', new Blob([png], { type: 'image/png' }), `${runId}.png`);
          value.set('submissionId', submissionId);
          return value;
        };
        const first = await request('/api/cms/media', { method: 'POST', body: form() });
        assert.ok([200, 201].includes(first.response.status), `Upload received ${first.response.status}`);
        const media = first.data.media;
        report.media.push({ id: media.id, publicId: media.publicId });
        assert.match(media.url, /^https:\/\/res\.cloudinary\.com\//);
        const retry = await request('/api/cms/media', { method: 'POST', body: form() });
        assert.ok([200, 201].includes(retry.response.status), `Upload retry received ${retry.response.status}`);
        assert.equal(retry.data.media.id, media.id);
        assert.equal(retry.data.media.publicId, media.publicId);
        const imageRecord = { ...current, image: media.url };
        status(await contentSave(imageRecord, current.revision, randomUUID()), 403, 'Wrong submission content save');
        const saved = await contentSave(imageRecord, current.revision, submissionId);
        status(saved, 200, 'Save content with staged media');
        const savedAgain = await contentSave(imageRecord, current.revision, submissionId);
        status(savedAgain, 200, 'Retry content with staged media');
        current = saved.data.record;
        assert.equal(savedAgain.data.record.revision, current.revision);
        assert.equal(current.image, media.url);
        const wrongOwner = await request('/api/cms/media/commit', { method: 'POST', body: { mediaId: media.id, submissionId: randomUUID(), title: runId } });
        assert.ok([400, 403, 404, 409, 422].includes(wrongOwner.response.status), 'A staged upload cannot commit under a different submission');
        const committed = await request('/api/cms/media/commit', { method: 'POST', body: { mediaId: media.id, submissionId, title: runId } });
        assert.ok([200, 201].includes(committed.response.status), `Commit received ${committed.response.status}`);
        const library = await request('/api/cms/media');
        assert.ok(library.data.media.some(item => item.id === media.id && item.state === 'committed'));
        status(await request('/api/cms/media/remove', { method: 'POST', body: { mediaId: media.id } }), 409, 'Referenced media removal');
      });
    }

    await check('Enquiries require consent and are stored once on retry', async () => {
      const submission = {
        name: 'Backend QA', email: `${runId}@example.com`, company: '', subject: runId,
        message: 'Temporary QA enquiry for verifying durable delivery to the CMS inbox.',
        consent: true, locale: 'en', submissionId: randomUUID(), website: '',
      };
      const invalid = await request('/api/contact', { method: 'POST', body: { ...submission, consent: false }, authenticated: false });
      assert.ok([400, 422].includes(invalid.response.status), 'Missing consent must be rejected');
      const first = await request('/api/contact', { method: 'POST', body: submission, authenticated: false });
      assert.ok([200, 201].includes(first.response.status), `Enquiry received ${first.response.status}`);
      assert.ok(first.data.id);
      report.enquiries.push(first.data.id);
      const retry = await request('/api/contact', { method: 'POST', body: submission, authenticated: false });
      assert.ok([200, 201].includes(retry.response.status), `Enquiry retry received ${retry.response.status}`);
      assert.equal(retry.data.id, first.data.id);
      const alteredRetry = await request('/api/contact', { method: 'POST', body: { ...submission, message: 'A changed message must not replace the original submitted enquiry.' }, authenticated: false });
      status(alteredRetry, 409, 'Changed enquiry retry');
      const inbox = await request('/api/cms/inbox');
      status(inbox, 200, 'Inbox');
      const matches = inbox.data.enquiries.filter(item => item.id === first.data.id);
      assert.equal(matches.length, 1);
      const enquiry = matches[0];
      assert.equal(enquiry.subject, runId);
      const updated = await request('/api/cms/inbox', { method: 'PATCH', body: { id: enquiry.id, expectedRevision: enquiry.revision, status: 'In progress' } });
      status(updated, 200, 'Inbox status');
      status(await request('/api/cms/inbox', { method: 'PATCH', body: { id: enquiry.id, expectedRevision: enquiry.revision, status: 'Resolved' } }), 409, 'Stale inbox edit');
      const refreshed = await request(`/api/cms/inbox?id=${enquiry.id}`);
      status(refreshed, 200, 'Refresh individual enquiry');
      assert.equal(refreshed.data.enquiry.status, 'In progress');
      assert.equal(refreshed.data.enquiry.revision, updated.data.enquiry.revision);
      for (const key of ['_id', 'submissionId', 'fingerprint', 'consentAt', 'notificationDelivery']) {
        assert.equal(key in refreshed.data.enquiry, false, `Enquiry refresh must not expose ${key}`);
      }
      assert.match(refreshed.response.headers.get('cache-control') || '', /no-store/i);
      status(await request('/api/cms/inbox?id=invalid'), 400, 'Malformed enquiry identifier');
      status(await request(`/api/cms/inbox?id=${randomUUID()}`), 404, 'Missing enquiry');
    });

    await check('Password changes require the current password', async () => {
      const result = await request('/api/cms/password', { method: 'POST', body: { currentPassword: randomUUID(), newPassword: `${randomUUID()}Aa9!` } });
      assert.ok([400, 401, 403].includes(result.response.status), 'Wrong current password must reject the change');
      const session = await request('/api/cms/session');
      assert.equal(session.data?.user?.username, credentials.username);
    });
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : 'Backend verification failed';
  console.error(`FAIL: ${report.error}`);
  process.exitCode = 1;
} finally {
  if (cookie) {
    for (const item of report.content) {
      try {
        const list = await request('/api/cms/content');
        const record = list.data?.records?.find(record => record.id === item.id && record.type === item.type);
        if (record && !record.deletedAt) {
          const result = await contentAction(record, 'trash');
          status(result, 200, 'QA content cleanup');
        }
        report.cleanup.push(`Content ${item.type}/${item.id} is in Trash`);
      } catch {
        report.cleanup.push(`Review QA content ${item.type}/${item.id}`);
        process.exitCode = 1;
      }
    }
    try {
      const originalCookie = cookie;
      const logout = await request('/api/cms/logout', { method: 'POST', body: {} });
      status(logout, 200, 'Logout');
      cookie = originalCookie;
      status(await request('/api/cms/content'), 401, 'Revoked session');
      report.checks.push('Logout invalidates the saved session token');
      console.log('PASS: Logout invalidates the saved session token');
    } catch (error) {
      report.cleanup.push(error instanceof Error ? error.message : 'Logout verification failed');
      process.exitCode = 1;
    }
  }
  if (allowWrite) {
    const directory = new URL('../.local/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('backend-smoke-result.json', directory), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log('Exact QA artifact IDs saved in .local/backend-smoke-result.json. Only this run’s content was moved to Trash.');
  }
  console.log(`${report.checks.length} backend checks completed${process.exitCode ? ' with a failure' : ''}.`);
}
