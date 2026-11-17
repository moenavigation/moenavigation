import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(folder, 'originals-manifest.json'), 'utf8'));
const nameAudit = JSON.parse(await fs.readFile(path.join(folder, 'source-checks/painted-name-audit.json'), 'utf8'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const relative = file => path.relative(folder, file).replaceAll('\\', '/');
const variant = (vessel, label, filename, description) => `<figure class="photo" data-enhancement>
  <a class="image-link" href="finals/${vessel.id}/${filename}.png" target="_blank" rel="noopener" aria-label="Open ${escape(vessel.currentName)} ${label.toLowerCase()} enhancement at full size">
    <span class="pending">Final image is being prepared.</span>
    <img src="finals/${vessel.id}/${filename}.png" alt="${escape(vessel.currentName)} — ${description}; AI-enhanced photograph" loading="eager" decoding="async">
  </a>
  <figcaption><div><h3>${label}</h3><span class="tag ${filename}">AI enhanced</span></div><p>${description}</p><span class="dimensions" aria-label="Image dimensions">Checking file…</span></figcaption>
</figure>`;
const vessels = manifest.vessels.map(vessel => {
  const source = manifest.photoFiles.find(photo => photo.vesselId === vessel.id && photo.primary);
  const name = nameAudit.vessels.find(item => item.currentId === vessel.id);
  const thai = name.paintedThai || name.referenceTranscription;
  return `<section class="vessel" id="${vessel.id}" aria-labelledby="title-${vessel.id}">
    <div class="vessel-heading"><div><span class="eyebrow">${vessel.id === 'moe-line-4' ? 'Crane vessel' : 'Container vessel'}</span><h2 id="title-${vessel.id}">${escape(vessel.currentName)}</h2><p>Painted legacy name: <strong>${escape(vessel.legacyName)}${thai ? ` · <span lang="th">${escape(thai)}</span>` : ''}</strong></p></div><a class="source-link" href="${escape(source.sourceUrl)}" target="_blank" rel="noopener">View source photo</a></div>
    <div class="comparisons">
      <figure class="photo original"><a class="image-link" href="${relative(source.localFile)}" target="_blank" rel="noopener" aria-label="Open ${escape(vessel.currentName)} unaltered original at full size"><img src="${relative(source.localFile)}" width="${source.width}" height="${source.height}" alt="Unaltered source photograph of ${escape(vessel.currentName)}" loading="lazy" decoding="async"></a><figcaption><div><h3>Original</h3><span class="tag">Source file</span></div><p>As downloaded. Original pixels preserved.</p><span class="dimensions">${source.width} × ${source.height} px</span></figcaption></figure>
      ${variant(vessel, 'Neutral daylight', 'neutral', 'Balanced clarity and natural daylight')}
      ${variant(vessel, 'Warm daylight', 'warm', 'Gentle warmth and restrained contrast')}
    </div>
  </section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <title>Fleet photograph review · Moe Navigation</title>
  <style>
    :root{--navy:#082b50;--ink:#12334d;--muted:#60717e;--line:#dce5eb;--paper:#fff;--blue:#176b8f;--pale:#f1f5f7;--font:Segoe UI,Tahoma,Arial,sans-serif;color-scheme:light}
    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:1.5rem}body{margin:0;background:var(--pale);color:var(--ink);font:1rem/1.6 var(--font)}a{color:inherit;text-underline-offset:.2em}a:focus-visible{outline:3px solid #53a9cf;outline-offset:5px}.wrap{width:min(92%,100rem);margin:auto}.skip{position:absolute;top:-6rem;left:1rem;background:white;padding:.75rem;z-index:4}.skip:focus{top:1rem}
    header{background:linear-gradient(120deg,#071f3c,#0c4361);color:#fff;padding:2rem 0 2.5rem}.masthead{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:2.8rem}.brand{font-weight:700;letter-spacing:.025em}.date{color:#bed0df}.eyebrow{display:block;text-transform:uppercase;font-size:1rem;letter-spacing:.1em;color:var(--blue);font-weight:650;margin-bottom:.3rem}header .eyebrow{color:#91cbe3}h1{font-size:2.6rem;line-height:1.14;letter-spacing:-.035em;margin:.4rem 0 1rem}header p{max-width:51rem;margin:0;color:#d4e2ec}.summary{display:flex;gap:.6rem;flex-wrap:wrap;margin:1.8rem 0 0}.summary span{border:1px solid #ffffff30;background:#ffffff08;border-radius:2rem;padding:.4rem .85rem}
    .review-note{background:#fff;border-bottom:1px solid var(--line);padding:1.2rem 0}.review-note .wrap{display:flex;align-items:start;justify-content:space-between;gap:1.4rem;flex-wrap:wrap}.review-note p{margin:0;max-width:61rem}.review-note strong{color:var(--navy)}.availability{white-space:nowrap;color:var(--muted)}
    nav{padding:1.4rem 0 .2rem;display:flex;gap:.55rem;flex-wrap:wrap}nav a{padding:.45rem .8rem;border:1px solid var(--line);background:#fff;border-radius:.4rem;text-decoration:none;font-weight:600}main{padding-bottom:3rem}.vessel{padding:2.5rem 0;border-bottom:1px solid var(--line)}.vessel-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.1rem}h2{font-size:1.8rem;line-height:1.25;letter-spacing:-.025em;margin:0 0 .3rem}.vessel-heading p{margin:0;color:var(--muted)}.vessel-heading p strong{font-weight:500;color:var(--ink)}.source-link{color:var(--blue);font-weight:600;white-space:nowrap}.source-link span{margin-left:.15rem}
    .comparisons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.photo{margin:0;min-width:0;background:#fff;border:1px solid var(--line);border-radius:.65rem;overflow:hidden;box-shadow:0 .2rem .7rem #12334d04}.image-link{position:relative;display:grid;place-items:center;aspect-ratio:16/10;background:#e5edf1;text-decoration:none;overflow:hidden}.image-link img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}.pending{padding:1.5rem;text-align:center;color:var(--muted)}.photo[data-enhancement] .image-link:not([data-ready]) img{visibility:hidden}.photo[data-enhancement] .image-link[data-ready] .pending{display:none}.photo[data-enhancement] .image-link[data-missing]{cursor:default}.photo figcaption{padding:1rem 1.1rem}.photo figcaption>div{display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap}h3{font-size:1rem;line-height:1.4;margin:0;font-weight:700}.photo p{margin:.4rem 0 .5rem;color:var(--muted)}.tag{display:inline-block;background:#edf2f5;color:#435c6d;border-radius:2rem;padding:.18rem .6rem;white-space:nowrap}.tag.neutral{background:#e9f3f8;color:#24627e}.tag.warm{background:#fbf0e1;color:#89602c}.dimensions{font-variant-numeric:tabular-nums;color:var(--muted)}
    .missing{display:grid;grid-template-columns:1fr auto;align-items:center;gap:1rem;background:#fff;border:1px solid var(--line);border-radius:.65rem;padding:1.5rem;margin:2rem 0 0}.missing h2{font-size:1.25rem}.missing p{margin:.4rem 0 0;color:var(--muted);max-width:57rem}.missing .tag{white-space:normal}footer{background:#fff;border-top:1px solid var(--line);padding:1.6rem 0 2rem;color:var(--muted)}footer .wrap{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}footer p{margin:0}footer a{color:var(--blue)}.footer-links{display:flex;gap:1rem;flex-wrap:wrap}
    nav a,.source-link,.footer-links a{display:inline-flex;align-items:center;min-height:2.75rem}
    @media(hover:hover){nav a:hover{border-color:#93b7cd;background:#f7fbfd}.source-link:hover,footer a:hover{color:#083c62}.image-link[data-ready]:hover{background:#dce8ee}}
    @media(max-width:1050px){.comparisons{grid-template-columns:repeat(2,minmax(0,1fr))}.photo.original{grid-column:1/-1}.photo.original .image-link{aspect-ratio:2/1}.photo.original img{object-fit:contain}header{padding-top:1.5rem}.masthead{margin-bottom:2rem}}
    @media(max-width:620px){.wrap{width:92%}h1{font-size:2.1rem}.comparisons{grid-template-columns:minmax(0,1fr)}.photo.original{grid-column:auto}.photo.original .image-link,.image-link{aspect-ratio:16/10}.vessel{padding:2rem 0}.vessel-heading{align-items:start}.missing{grid-template-columns:minmax(0,1fr)}.summary{gap:.45rem}.summary span{padding:.35rem .65rem}.photo figcaption{padding:1rem}.review-note .wrap{gap:.65rem}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style>
</head>
<body>
  <a class="skip" href="#gallery">Skip to photographs</a>
  <header><div class="wrap"><div class="masthead"><span class="brand">MOE NAVIGATION <span aria-hidden="true">/</span> IMAGE REVIEW</span><span class="date">17 November 2026</span></div><span class="eyebrow">Originals & enhancements</span><h1>Fleet photograph review.</h1><p>Compare the recovered original with two restrained treatments of the same vessel. Open any photograph to inspect the full-size file.</p><div class="summary"><span>7 verified vessels</span><span>2 treatments per vessel</span><span>Original files preserved</span></div></div></header>
  <aside class="review-note" aria-label="About these photographs"><div class="wrap"><p><strong>The enhanced versions are AI-enhanced photographs, not documentary originals.</strong> The original is shown for comparison. Painted legacy names are retained even where the current vessel display name is shorter.</p><span class="availability" id="availability" aria-live="polite">Enhancement files are loading…</span></div></aside>
  <main class="wrap" id="gallery"><nav aria-label="Jump to vessel">${manifest.vessels.map(vessel => `<a href="#${vessel.id}">${escape(vessel.currentName)}</a>`).join('')}</nav>${vessels}<aside class="missing" aria-labelledby="missing-title"><div><h2 id="missing-title">DUMAI MOE</h2><p>A verified original photograph was not recovered from the old website. No other vessel has been substituted. Enhancements can be prepared when a verified source photograph is available.</p></div><span class="tag">Awaiting verified original</span></aside></main>
  <footer><div class="wrap"><p>Local review files. Original website and CMS content are unchanged.</p><div class="footer-links"><a href="originals-manifest.json">Originals manifest</a><a href="final-manifest.json">Enhancement manifest</a><a href="generation-log.json">Full prompts</a><a href="metadata-qa.json">Metadata checks</a><a href="source-checks/painted-name-audit.json">Painted-name references</a><a href="https://www.moe-line.com/fleet-list/" target="_blank" rel="noopener">Legacy fleet list</a></div></div></footer>
  <script>
    const enhanced = Array.from(document.querySelectorAll('[data-enhancement] img'));
    const availability = document.getElementById('availability');
    function updateCount() { availability.textContent = enhanced.filter(image => image.closest('.image-link').hasAttribute('data-ready')).length + ' / 14 enhancements available'; }
    enhanced.forEach(image => {
      const link = image.closest('.image-link');
      const dimensions = image.closest('figure').querySelector('.dimensions');
      function loaded() { if (!image.naturalWidth) return; link.setAttribute('data-ready', ''); link.removeAttribute('data-missing'); dimensions.textContent = image.naturalWidth + ' × ' + image.naturalHeight + ' px'; updateCount(); }
      function missing() { link.setAttribute('data-missing', ''); dimensions.textContent = 'Preparing final file'; updateCount(); }
      image.addEventListener('load', loaded); image.addEventListener('error', missing);
      link.addEventListener('click', event => { if (!link.hasAttribute('data-ready')) event.preventDefault(); });
      if (image.complete) image.naturalWidth ? loaded() : missing();
    });
  </script>
</body></html>`;
await fs.writeFile(path.join(folder, 'index.html'), html);
console.log(path.join(folder, 'index.html'));
