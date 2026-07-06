// Replaces local <video>/videoiframe elements in index.html with Kinescope
// iframe embeds, using scripts/kinescope-manifest.json (filename -> embed_link).
//
// Usage: node scripts/apply-kinescope.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const MANIFEST_PATH = path.join(__dirname, 'kinescope-manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
let html = fs.readFileSync(INDEX_PATH, 'utf8');

function embedFor(file) {
  const entry = manifest[file];
  if (!entry || !entry.embed_link) throw new Error('No embed link for ' + file);
  return entry.embed_link;
}

// --- 1. Background/cover autoplay videos ---
// <video style="object-fit: cover; background-size: cover; width: 100%; height: 100%" preload="auto" playsinline="" autoplay="" loop="" muted="">
//   <source src="video/FILE.mp4" type="video/mp4">
// </video>
const bgRe = /<video style="object-fit: cover; background-size: cover; width: 100%; height: 100%" preload="auto" playsinline="" autoplay="" loop="" muted="">\s*<source src="video\/([^"]+\.mp4)" type="video\/mp4">\s*<\/video>/g;
let bgCount = 0;
html = html.replace(bgRe, (match, file) => {
  const embed = embedFor(file);
  bgCount++;
  const src = `${embed}?behaviour%5BautoPlay%5D=true&behaviour%5Bloop%5D=true&behaviour%5Bmuted%5D=true&behaviour%5BplaysInline%5D=true&ui%5Bcontrols%5D=false&ui%5BmainPlayButton%5D=false`;
  return `<iframe src="${src}" style="object-fit: cover; width: 100%; height: 100%; border: 0;" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
});
console.log('Background videos replaced:', bgCount);

// --- 2. Interactive videos already rendered with <video>/<source> ---
// <div class="tn-atom__videoiframe" data-mp4video="video/FILE.mp4" style="...">
//   <video id="..." playsinline="" controls="" style="width: 100%; display: block;">
//     <source src="video/FILE.mp4" type="video/mp4">
//   </video>
// </div>
const renderedRe = /<div class="tn-atom__videoiframe" data-mp4video="video\/([^"]+\.mp4)"( style="[^"]*")><video id="[^"]*" playsinline="" controls="" style="width: 100%; display: block;"><source src="video\/[^"]+\.mp4" type="video\/mp4"><\/video><\/div>/g;
let renderedCount = 0;
html = html.replace(renderedRe, (match, file, style) => {
  const embed = embedFor(file);
  renderedCount++;
  return `<div class="tn-atom__videoiframe"${style}><iframe src="${embed}" style="width: 100%; aspect-ratio: 16/9; border: 0;" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
});
console.log('Rendered interactive videos replaced:', renderedCount);

// --- 3. Interactive videos not yet rendered (empty div, JS would inject on scroll) ---
// <div class="tn-atom__videoiframe" data-mp4video="video/FILE.mp4" style="...position: relative;"></div>
const emptyRe = /<div class="tn-atom__videoiframe" data-mp4video="video\/([^"]+\.mp4)"( style="[^"]*")><\/div>/g;
let emptyCount = 0;
html = html.replace(emptyRe, (match, file, style) => {
  const embed = embedFor(file);
  emptyCount++;
  return `<div class="tn-atom__videoiframe"${style}><iframe src="${embed}" style="width: 100%; aspect-ratio: 16/9; border: 0;" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
});
console.log('Empty (not-yet-rendered) videos replaced:', emptyCount);

const total = bgCount + renderedCount + emptyCount;
console.log('Total replaced:', total);

const remaining = html.match(/video\/[A-Za-z0-9_.-]+\.mp4/g);
if (remaining) {
  console.log('WARNING: local video/ references still remain:', remaining);
} else {
  console.log('No local video/ references remain in index.html.');
}

fs.writeFileSync(INDEX_PATH, html);
console.log('index.html updated.');
