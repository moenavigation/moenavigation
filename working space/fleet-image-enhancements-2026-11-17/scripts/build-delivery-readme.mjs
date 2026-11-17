import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originals = JSON.parse(await fs.readFile(path.join(folder, 'originals-manifest.json'), 'utf8'));
const finals = JSON.parse(await fs.readFile(path.join(folder, 'final-manifest.json'), 'utf8'));
if (finals.jobs.length !== 14 || finals.jobs.some(job => !job.decodedPixelsUnchangedFromGeneratedInput)) throw new Error('The 14 reviewed final files are not ready.');
const rows = originals.vessels.map(vessel => {
  const neutral = finals.jobs.find(job => job.vessel === vessel.id && job.variant === 'neutral');
  const warm = finals.jobs.find(job => job.vessel === vessel.id && job.variant === 'warm');
  if (!neutral || !warm) throw new Error(`Missing pair ${vessel.id}`);
  return `| ${vessel.currentName} | ${vessel.legacyName} | [${neutral.width} × ${neutral.height}](${neutral.path}) | [${warm.width} × ${warm.height}](${warm.path}) |`;
}).join('\n');
const text = `# Fleet photo enhancements

Open [index.html](index.html) to compare the seven source photographs with
14 selected enhancements. Each image opens at full size for inspecting small
painted lettering. The page works locally; no hosting is required.

The enhanced PNGs are AI-enhanced photographs, not documentary originals.
Original source files remain unchanged. Current vessel display names and
historical painted names are shown separately; no vessel rename is implied.

| Current vessel | Legacy painted identity | Neutral PNG dimensions | Warm PNG dimensions |
| --- | --- | --- | --- |
${rows}

Dimensions above are the actual saved pixel dimensions. The source inventory
contains ${originals.uniqueCopiedFileCount} source files, including alternate crops/renditions: ${originals.verifiedPhotoFileCount} files
mapped to seven vessels and ${originals.unassignedPhotoFiles.length} historical/unidentified files retained
separately. They are not ${originals.uniqueCopiedFileCount} different camera views.

DUMAI MOE remains without a verified original photograph from the old website.
No replacement vessel or invented photograph was supplied for it.

- [Original source manifest](originals-manifest.json): URLs, mappings, dimensions and hashes.
- [Final enhancement manifest](final-manifest.json): the selected 14 files and output hashes.
- [Full generation prompts](generation-log.json): prompts and generated source paths, including superseded drafts.
- [PNG metadata checks](metadata-qa.json): generated-file metadata and decode verification.
- [Painted-name references](source-checks/painted-name-audit.json): verified character references and source crops.
- [Source collection notes](ORIGINALS.md): provenance and unassigned-source limits.

Metadata cleaning applies only to the generated final PNGs. Their decoded pixels
were verified unchanged from the selected generated inputs. Source originals
were not cleaned or re-encoded. No website assets, CMS records or database data
were changed by this delivery.
`;
await fs.writeFile(path.join(folder, 'README.md'), text);
console.log(path.join(folder, 'README.md'));
