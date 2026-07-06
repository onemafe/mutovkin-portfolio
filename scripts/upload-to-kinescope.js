// One-off / reusable script: uploads all mp4 files from video/ to Kinescope
// and writes the mapping (filename -> {id, embed_link}) to
// scripts/kinescope-manifest.json.
//
// Usage: node scripts/upload-to-kinescope.js
// Requires KINESCOPE_API_TOKEN in .env (project root).
// Safe to re-run: files already present in the manifest (with an embed_link)
// are skipped.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIDEO_DIR = path.join(ROOT, 'video');
const MANIFEST_PATH = path.join(__dirname, 'kinescope-manifest.json');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const TOKEN = process.env.KINESCOPE_API_TOKEN;
if (!TOKEN) throw new Error('KINESCOPE_API_TOKEN not found in .env');

const API_BASE = 'https://api.kinescope.io/v1';
const UPLOAD_URL = 'https://uploader.kinescope.io/v2/video';

async function getParentId() {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error('Failed to list projects: ' + res.status + ' ' + (await res.text()));
  const json = await res.json();
  const project = json.data?.[0];
  if (!project) throw new Error('No projects found on this Kinescope account');
  console.log('Using project:', project.name, project.id);
  return project.id;
}

async function uploadVideo(filePath, title, parentId) {
  const buf = fs.readFileSync(filePath);
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'X-Parent-ID': parentId,
      'X-Video-Title': title,
      'Content-Type': 'video/mp4',
    },
    body: buf,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Upload failed for ${title}: ${res.status} ${text}`);
  const json = JSON.parse(text);
  return json.data;
}

(async () => {
  const parentId = await getParentId();
  const files = fs.readdirSync(VIDEO_DIR).filter((f) => f.toLowerCase().endsWith('.mp4'));
  console.log(`Found ${files.length} videos in video/.`);

  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : {};

  for (const file of files) {
    if (manifest[file]?.embed_link) {
      console.log(`Skipping ${file} (already uploaded)`);
      continue;
    }
    const title = file.replace(/\.mp4$/i, '');
    console.log(`Uploading ${file}...`);
    const filePath = path.join(VIDEO_DIR, file);
    try {
      const video = await uploadVideo(filePath, title, parentId);
      manifest[file] = { id: video.id, embed_link: video.embed_link, play_link: video.play_link };
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
      console.log(`  -> ${video.embed_link}`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      manifest[file] = { error: err.message };
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    }
  }

  console.log('Done. Manifest written to', MANIFEST_PATH);
})();
