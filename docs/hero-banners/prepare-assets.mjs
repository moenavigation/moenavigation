import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/hero-banners/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await mkdir(path.join(root, 'output/hero-banners/originals'), { recursive: true });
await mkdir(path.join(root, 'public/images/hero'), { recursive: true });
for (const asset of manifest.assets) {
  const original = path.join(root, asset.sourceFile);
  await copyFile(asset.originalGeneratedPath, original);
  const metadata = await sharp(original).metadata();
  if (metadata.width !== metadata.height * 3) throw new Error(`Banner is not 3:1: ${asset.name}`);
  const output = await sharp(original).webp({ quality: 88, effort: 6 }).toFile(path.join(root, 'public', asset.publicPath));
  asset.width = metadata.width;
  asset.height = metadata.height;
  asset.webpBytes = output.size;
  console.log(`${asset.name}: ${asset.width}x${asset.height}, ${output.size} bytes`);
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
