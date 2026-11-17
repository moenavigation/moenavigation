/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS maintenance CLI; retain its .cjs runtime and local helper compatibility. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const review = JSON.parse(await fs.readFile(path.join(root, 'visual-review.json'), 'utf8'));
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'metadata-qa.json'), 'utf8'));
  const jobs = [];
  for (const decision of review.jobs.filter((job) => job.approvedForFinal === true)) {
    if (decision.status !== 'pass_identity_review' || !/^[a-z0-9-]+$/.test(decision.finalVessel)
      || !['neutral', 'warm'].includes(decision.variant)) throw new Error(`Invalid final review: ${decision.key}`);
    const qa = metadata.jobs.find((job) => job.key === decision.key);
    if (!qa?.decodedPixelsUnchanged || !qa.allChunkCrcsValid || !qa.encodedImageChunksUnchanged)
      throw new Error(`Missing metadata validation: ${decision.key}`);
    const input = path.join(root, 'drafts', `${decision.key}.png`);
    const bytes = await fs.readFile(input);
    if (sha256(bytes) !== qa.outputSha256) throw new Error(`Draft changed: ${decision.key}`);
    const directory = path.join(root, 'finals', decision.finalVessel);
    const output = path.join(directory, `${decision.variant}.png`);
    await fs.mkdir(directory, { recursive: true });
    try { await fs.writeFile(output, bytes, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (sha256(await fs.readFile(output)) !== qa.outputSha256)
        throw new Error(`Refusing to replace a different final: ${output}`);
    }
    jobs.push({ key: decision.key, vessel: decision.finalVessel, variant: decision.variant,
      path: path.relative(root, output).split(path.sep).join('/'), width: qa.width, height: qa.height,
      bytes: bytes.length, sha256: qa.outputSha256, metadataChunks: qa.outputChunks,
      decodedPixelsUnchangedFromGeneratedInput: true, reviewStatus: decision.status });
  }
  const manifest = { reviewedAt: new Date().toISOString(), scope: 'Reviewed local image copies only; website and database unchanged.', jobs };
  await fs.writeFile(path.join(root, 'final-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ staged: jobs.length, files: jobs.map((job) => job.path) }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
