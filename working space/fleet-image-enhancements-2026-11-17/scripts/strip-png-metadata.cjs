/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS CLI also exports stripPng for the local draft processor; preserve both entry points. */
// Usage: node strip-png-metadata.cjs INPUT.png OUTPUT.png
// Reads the source only. Writes one new PNG inside this task folder, with no
// pixel re-encoding, and prints the verification report as JSON.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
function parsePng(bytes) {
  assert(bytes.subarray(0, 8).equals(signature), 'Input is not a PNG.');
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'Truncated PNG chunk header.');
    const size = bytes.readUInt32BE(offset);
    assert(size <= 0x7fffffff && offset + size + 12 <= bytes.length, 'Invalid PNG chunk length.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert(/^[A-Za-z]{4}$/.test(type), 'Invalid PNG chunk name.');
    const payload = bytes.subarray(offset + 8, offset + 8 + size);
    const crc = bytes.readUInt32BE(offset + 8 + size);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + size)), crc, `Invalid CRC in ${type}.`);
    chunks.push({ type, payload, bytes: bytes.subarray(offset, offset + size + 12) });
    offset += size + 12;
    if (type === 'IEND') break;
  }
  assert.equal(offset, bytes.length, 'Unexpected bytes after PNG IEND.');
  assert.equal(chunks[0]?.type, 'IHDR', 'PNG must begin with IHDR.');
  assert.equal(chunks[0]?.payload.length, 13, 'Invalid IHDR size.');
  assert.equal(chunks.at(-1)?.type, 'IEND', 'PNG is missing IEND.');
  assert.equal(chunks.at(-1)?.payload.length, 0, 'Invalid IEND size.');
  assert.equal(chunks.filter(chunk => chunk.type === 'IHDR').length, 1, 'Duplicate IHDR.');
  assert(chunks.some(chunk => chunk.type === 'IDAT'), 'PNG has no pixel data.');
  assert(!chunks.some(chunk => ['acTL', 'fcTL', 'fdAT'].includes(chunk.type)), 'Animated PNG needs a separate frame-preserving workflow.');
  for (const chunk of chunks) if (chunk.type[0] === chunk.type[0].toUpperCase()) {
    assert(['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(chunk.type), `Unsupported critical PNG chunk: ${chunk.type}.`);
  }
  return chunks;
}
async function decodedPixels(bytes) {
  return sharp(bytes, { failOn: 'warning' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
async function stripPng(bytes) {
  const original = parsePng(bytes);
  // tRNS is rendering data for palette/RGB/grayscale transparency. Keep it,
  // together with every critical chunk, while removing ancillary metadata.
  const retained = original.filter(chunk => ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(chunk.type));
  const cleaned = Buffer.concat([signature, ...retained.map(chunk => chunk.bytes)]);
  const verified = parsePng(cleaned);
  assert.deepEqual(verified.map(chunk => chunk.type), retained.map(chunk => chunk.type));
  assert.equal(hash(Buffer.concat(retained.map(chunk => chunk.bytes))), hash(Buffer.concat(verified.map(chunk => chunk.bytes))), 'Encoded image or transparency chunks changed.');
  const before = await decodedPixels(bytes), after = await decodedPixels(cleaned);
  assert.deepEqual(after.info, before.info, 'Decoded PNG dimensions or channel information changed.');
  assert(before.data.equals(after.data), 'Decoded pixels changed; no output was written.');
  return { bytes: cleaned, report: {
    inputBytes: bytes.length, outputBytes: cleaned.length,
    inputSha256: hash(bytes), outputSha256: hash(cleaned),
    inputChunks: original.map(chunk => chunk.type), outputChunks: verified.map(chunk => chunk.type),
    removedChunks: original.filter(chunk => !retained.includes(chunk)).map(chunk => chunk.type),
    width: before.info.width, height: before.info.height, channels: before.info.channels,
    decodedPixelSha256: hash(before.data),
    allChunkCrcsValid: true, encodedImageChunksUnchanged: true, decodedPixelsUnchanged: true, reencoded: false,
  } };
}
async function main() {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2, 'Usage: node strip-png-metadata.cjs INPUT.png OUTPUT.png');
  const input = await fs.realpath(path.resolve(args[0]));
  const output = path.resolve(args[1]);
  const taskRoot = path.resolve(__dirname, '..');
  const relative = path.relative(taskRoot, output);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Output must be a new file inside the fleet-image-enhancements task folder.');
  assert.notEqual(input.toLowerCase(), output.toLowerCase(), 'Source and output paths must differ.');
  assert.equal(path.extname(output).toLowerCase(), '.png', 'Output must use the .png extension.');
  // Refuse existing files before doing any processing; never overwrite an image.
  await fs.access(output).then(() => { throw new Error('Output already exists; choose a new filename.'); }, error => { if (error.code !== 'ENOENT') throw error; });
  const source = await fs.readFile(input);
  const result = await stripPng(source);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.bytes, { flag: 'wx' });
  assert.equal(hash(await fs.readFile(input)), hash(source), 'The source file changed during processing.');
  console.log(JSON.stringify({ input, output, ...result.report }, null, 2));
}
module.exports = { crc32, parsePng, stripPng };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
