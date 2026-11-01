import assert from 'node:assert/strict';
import test from 'node:test';
import { googleMapsPointUrl, googleMapsUrl, parseGoogleMapsCoordinates } from '../src/lib/google-maps';
import { resolveGoogleMapsCoordinates } from '../src/server/google-maps';
import { HttpError } from '../src/server/http';

const expected = { latitude: 13.08654321, longitude: 100.89456789 };
const pair = `${expected.latitude},${expected.longitude}`;
const full = googleMapsPointUrl(expected.latitude, expected.longitude);
const short = 'https://maps.app.goo.gl/Example123';
const noFetch: typeof fetch = async () => { assert.fail('This input must not make a network request.'); };
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;

test('Google Maps point links use the documented cross-platform search format', () => {
  assert.equal(full, 'https://www.google.com/maps/search/?api=1&query=13.08654321%2C100.89456789');
  assert.deepEqual(parseGoogleMapsCoordinates(full), expected);
});

test('explicit Google Maps coordinates preserve precision in supported full link formats', () => {
  for (const input of [
    full,
    `https://google.com/maps?q=${pair}`,
    `https://maps.google.com/?q=loc:${pair}`,
    `https://www.google.co.th/maps/search/?api=1&query=${pair}`,
    `https://maps.google.co.th/?q=${pair}`,
    `https://www.google.com/maps/place/${encodeURIComponent(pair)}/`,
    `https://www.google.com/maps/search/${pair}/`,
    `https://www.google.com/maps/@${pair},15z`,
    `https://www.google.com/maps/@${pair},1500m/data=!3m1!1e3`,
    `https://www.google.com/maps/@?api=1&map_action=map&center=${pair}`,
    `https://maps.google.com/?ll=${pair}`,
    `https://www.google.com/maps?q=${pair}&query=${pair}`,
    `  ${full}  `,
  ]) assert.deepEqual(parseGoogleMapsCoordinates(input), expected, input);
  for (const [latitude, longitude] of [[0, 0], [-90, -180], [90, 180], [-0.12345678912345, 0.00000001]]) {
    assert.deepEqual(parseGoogleMapsCoordinates(googleMapsPointUrl(latitude, longitude)), { latitude, longitude });
  }
});

test('place pins override camera centers and encoded data payloads are supported', () => {
  for (const input of [
    `https://www.google.com/maps/place/Port/@1,2,16z/data=!4m6!3m5!1splace!8m2!3d${expected.latitude}!4d${expected.longitude}!16svalue`,
    `https://www.google.com/maps/place/Port/@1,2,16z/?data=${encodeURIComponent(`!3d${expected.latitude}!4d${expected.longitude}`)}`,
    `https://www.google.com/maps/place/Port/data=%213d${expected.latitude}%214d${expected.longitude}`,
  ]) assert.deepEqual(parseGoogleMapsCoordinates(input), expected, input);
});

test('unsupported, misleading and unsafe link origins never produce coordinates', () => {
  for (const input of [
    '', pair, '/maps?q=13,100', 'not a URL',
    'http://www.google.com/maps?q=13,100',
    'https://www.google.com.evil.example/maps?q=13,100',
    'https://google.example/maps?q=13,100',
    'https://google.ai/maps?q=13,100',
    'https://www.google.com:444/maps?q=13,100',
    'https://user:secret@www.google.com/maps?q=13,100',
    'https://www.google.com/url?q=https://example.test',
    'https://127.0.0.1/maps?q=13,100',
    'https://[::1]/maps?q=13,100',
    'https://maps.google.com/other?q=13,100',
    'https://goo.gl/Other123?q=13,100',
    'https://maps.app.goo.gl/a/b?q=13,100',
    'https://www.goo\ngle.com/maps?q=13,100',
    'https://www.google.com\\maps?q=13,100',
    `https://www.google.com/maps?q=${'1'.repeat(8200)},100`,
  ]) {
    assert.equal(googleMapsUrl(input), null, input);
    assert.equal(parseGoogleMapsCoordinates(input), null, input);
  }
});

test('name-only, multi-point, invalid and ambiguous links never fall back to unrelated map centers', () => {
  for (const input of [
    'https://www.google.com/maps/place/Port/@13,100,16z',
    'https://www.google.com/maps/search/Port/@13,100,16z',
    'https://www.google.com/maps?q=Port&ll=13,100',
    'https://www.google.com/maps/search/?api=1&query=Port',
    'https://www.google.com/maps/search/?query=13,100&query_place_id=ChIJexample',
    'https://www.google.com/maps?cid=123&ll=13,100',
    'https://www.google.com/maps/dir/Port/Other/@13,100,16z/data=!3d13!4d100',
    'https://www.google.com/maps?origin=13,100&destination=14,101&q=13,100',
    'https://www.google.com/maps?saddr=13,100&daddr=14,101&q=13,100',
    'https://www.google.com/maps/@13,100,3a,75y,90t',
    'https://www.google.com/maps/@?api=1&map_action=pano&center=13,100',
    'https://www.google.com/maps/@13,100,15z?api=1&map_action=shortlist',
    'https://maps.google.com/?f=d&q=13,100',
    'https://www.google.com/maps?q=13,100&q=14,101',
    'https://www.google.com/maps?q=13,100&query=Port',
    'https://www.google.com/maps/place/Port/data=!3d13!4d100!3d14!4d101',
    'https://www.google.com/maps/place/Port/data=!3d91!4d100?q=13,100',
    'https://www.google.com/maps/place/Port/data=!3d13!4d100!3d14',
    'https://www.google.com/maps?q=91,100',
    'https://www.google.com/maps?q=13,181',
    'https://www.google.com/maps?q=,100',
    'https://www.google.com/maps?q=13,',
    'https://www.google.com/maps?q=13,100,101',
    'https://www.google.com/maps?q=0x10,100',
    'https://www.google.com/maps?q=NaN,100',
    'https://www.google.com/maps?q=13,Infinity',
    'https://www.google.com/maps?q=1e999,100',
    'https://www.google.com/maps/place/%ZZ/@13,100,16z',
    short,
  ]) assert.equal(parseGoogleMapsCoordinates(input), null, input);
});

test('full links resolve locally while unsupported links fail before any network request', async () => {
  assert.deepEqual(await resolveGoogleMapsCoordinates(full, { fetch: noFetch }), expected);
  await assert.rejects(resolveGoogleMapsCoordinates('https://example.test/', { fetch: noFetch }), status(400));
  await assert.rejects(resolveGoogleMapsCoordinates('https://www.google.com/maps/place/Port/@13,100,16z', { fetch: noFetch }), status(422));
});

test('short links expand through allowlisted redirects without fetching the final place page', async () => {
  const called: string[] = [];
  let cancelled = 0;
  const fetcher: typeof fetch = async (input, init) => {
    called.push(String(input));
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'manual');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'omit');
    assert.ok(init?.signal);
    assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { accept: 'text/html' });
    const location = called.length === 1 ? 'https://goo.gl/maps/Next123' : full;
    return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 302, headers: { location } });
  };
  assert.deepEqual(await resolveGoogleMapsCoordinates(short, { fetch: fetcher }), expected);
  assert.deepEqual(called, [short, 'https://goo.gl/maps/Next123']);
  assert.equal(cancelled, 2);
});

test('every redirect is revalidated before any subsequent request', async () => {
  for (const location of [
    'http://www.google.com/maps?q=13,100', 'https://evil.example/maps?q=13,100',
    'https://www.google.com.evil.example/maps?q=13,100', 'https://127.0.0.1/maps?q=13,100',
    'https://www.google.com/url?url=https://127.0.0.1/', 'https://user@www.google.com/maps?q=13,100',
    'https://www.google.com:8080/maps?q=13,100', 'https://goo.gl/NotMaps',
  ]) {
    let count = 0;
    await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => {
      count++;
      return new Response(null, { status: 302, headers: { location } });
    } }), status(400));
    assert.equal(count, 1, location);
  }
});

test('redirect loops, excessive hops and missing locations stop within a bounded request count', async () => {
  let calls = 0;
  await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: short } });
  } }), status(502));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: `https://maps.app.goo.gl/Hop${calls}` } });
  } }), status(502));
  assert.equal(calls, 4);
  await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => new Response(null, { status: 302 }) }), status(502));
});

test('provider failures and unresolved links return actionable errors without scraping HTML', async () => {
  for (const code of [429, 500, 503]) {
    await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => new Response('private provider error', { status: code }) }), status(502));
  }
  for (const code of [200, 404]) {
    await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => new Response('<html>not coordinates</html>', { status: code }) }), status(422));
  }
  await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => { throw new Error('private upstream details'); } }), error => {
    assert.ok(status(502)(error));
    assert.doesNotMatch(String(error), /private upstream details/);
    return true;
  });
  await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async () => new Response(null, {
    status: 302, headers: { location: 'https://www.google.com/maps/place/Port/@13,100,16z' },
  }) }), status(422));
});

test('short-link resolution has a deadline and respects cancellation', async t => {
  t.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')));
  await assert.rejects(resolveGoogleMapsCoordinates(short, { fetch: async (_input, init) => {
    init?.signal?.throwIfAborted();
    assert.fail('The deadline must abort the request.');
  } }), status(504));
  t.mock.restoreAll();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(resolveGoogleMapsCoordinates(short, { signal: controller.signal, fetch: async (_input, init) => {
    assert.ok(init?.signal?.aborted);
    init?.signal?.throwIfAborted();
    assert.fail('The caller must be able to cancel.');
  } }), status(502));
});
