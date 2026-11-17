/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS maintenance CLI; retain its .cjs runtime and local helper compatibility. */
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripPng } = require('./strip-png-metadata.cjs');

(async () => {
  const taskRoot = path.resolve(__dirname, '..');
  const log = JSON.parse(await fs.readFile(path.join(taskRoot, 'generation-log.json'), 'utf8'));
  assert.equal(new Set(log.jobs.map(job => job.key)).size, log.jobs.length, 'Duplicate generation job keys.');
  await fs.mkdir(path.join(taskRoot, 'drafts'), { recursive: true });
  const jobs = await Promise.all(log.jobs.map(async job => {
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(job.key), 'Invalid draft key.');
    const source = await fs.readFile(job.generatedPath);
    const output = path.join(taskRoot, 'drafts', `${job.key}.png`);
    const result = await stripPng(source);
    let reusedVerifiedOutput = false;
    try {
      const existing = await fs.readFile(output);
      assert(existing.equals(result.bytes), `An existing draft differs from this generation: ${job.key}. Choose a new key.`);
      reusedVerifiedOutput = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.writeFile(output, result.bytes, { flag: 'wx' });
      assert((await fs.readFile(output)).equals(result.bytes), `Saved draft differs for ${job.key}.`);
    }
    return { key: job.key, input: job.generatedPath, output, reusedVerifiedOutput, ...result.report };
  }));
  const report = { reviewedAt: new Date().toISOString(), scope: 'Metadata removal only; original generated files remain unchanged outside the workspace. No website or database changes.', jobs };
  await fs.writeFile(path.join(taskRoot, 'metadata-qa.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(jobs.map(({ key, width, height, removedChunks, allChunkCrcsValid, decodedPixelsUnchanged, reencoded }) => ({ key, width, height, removedChunks, allChunkCrcsValid, decodedPixelsUnchanged, reencoded })), null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
