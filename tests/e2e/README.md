# Browser regressions

Use Node 22 and the installed development dependencies:

```sh
npm run test:e2e:install
npm run test:e2e
# A focused local rerun:
npm run test:e2e -- --project=chromium tests/e2e/inbox.spec.ts
```

The suite covers Chromium, Firefox and WebKit. Linux machines also need Playwright's OS dependencies (`npx playwright install --with-deps chromium firefox webkit`); CI installs them automatically. The first run downloads a pinned MongoDB binary from `fastdl.mongodb.org` into `.local/e2e/mongodb`.

## Isolation

- The runner creates one temporary MongoDB replica set bound to `127.0.0.1`, with database `moenavigation_e2e`. Fixture reset requires both the loopback connection and the current run's ownership marker. It never accepts a production database URL.
- A separate production build uses `.next-e2e`. Next listens on `127.0.0.1:3011`, behind the test HTTPS proxy at `https://127.0.0.1:3010`. Both ports must be free. The temporary certificate exists only in the runner's memory; OS trust is not changed. HTTPS exercises the real Secure authentication cookie in every browser.
- Environment-file variable names and provider variables are explicitly blanked before the test configuration is applied, preventing Next from loading live MongoDB, Cloudinary or email credentials from `.env.local`.
- Every test receives a fresh database fixture, and one worker serializes mutations. The deterministic administrator and 130 enquiries are synthetic. The Thai and literal-regex search fixtures are older than the first two default inbox pages.
- Real application login, validation, MongoDB transactions, save, revision conflicts, publication, Trash/restore and submission resolution run unchanged. There is no production authentication bypass or test endpoint.

## Media scope

External browser image and map requests are fulfilled with synthetic PNG bytes. Other external browser requests are blocked.

The upload-retry browser scenario intercepts only the test browser's upload request and creates a submission-owned staged image in the ephemeral database. It deliberately simulates the provider step; the subsequent application save and uncertain-outcome resolution endpoints are real. It does not validate the live Cloudinary transport. The separately authorized media integration rehearsal covers that provider lifecycle.

## Results and cleanup

Failed tests retain traces and screenshots in ignored `test-results/` and an HTML report in `playwright-report/`. Those artifacts contain synthetic account/input data. CI uploads failure artifacts for seven days and never receives production credentials.

The runner stops its Next process, HTTPS proxy and owned MongoDB process, removes only its UUID-named temporary database directory, and restores generated `next-env.d.ts` changes. Binary caches and `.next-e2e` remain ignored for subsequent runs. `.local/e2e/result.json` records the runner outcome; `.local/e2e/runner.log` contains build/server/test output.

Use the npm runner to execute tests; invoking Playwright directly has no owned database. `npx playwright test --list` is safe for discovery without starting the application.
