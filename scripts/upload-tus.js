// Tus resumable upload for large files (more reliable than a single POST
// over a slow/flaky connection). Usage:
//   node scripts/upload-tus.js <filename-in-video-dir>

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIDEO_DIR = path.join(ROOT, 'video');
const MANIFEST_PATH = path.join(__dirname, 'kinescope-manifest.json');

function loadEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const TOKEN = process.env.KINESCOPE_API_TOKEN;
if (!TOKEN) throw new Error('KINESCOPE_API_TOKEN not found in .env');

const API_BASE = 'https://api.kinescope.io/v1';
const INIT_URL = 'https://uploader.kinescope.io/v2/init';
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

async function getParentId() {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error('Failed to list projects: ' + res.status);
  const json = await res.json();
  return json.data[0].id;
}

async function initUpload(filesize, filename, title, parentId) {
  const res = await fetch(INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filesize, type: 'video', parent_id: parentId, title, filename }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error('init failed: ' + res.status + ' ' + text);
  return JSON.parse(text);
}

async function uploadChunks(endpoint, filePath, filesize) {
  const fd = fs.openSync(filePath, 'r');
  let offset = 0;
  try {
    while (offset < filesize) {
      const len = Math.min(CHUNK_SIZE, filesize - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Tus-Resumable': '1.0.0',
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': String(offset),
          'Content-Length': String(len),
        },
        body: buf,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`PATCH failed at offset ${offset}: ${res.status} ${t}`);
      }
      const newOffsetHeader = res.headers.get('upload-offset');
      offset = newOffsetHeader ? parseInt(newOffsetHeader, 10) : offset + len;
      console.log(`  progress: ${offset}/${filesize} (${((offset / filesize) * 100).toFixed(1)}%)`);
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function waitForVideo(videoId, retries = 30) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`${API_BASE}/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.ok) {
      const json = await res.json();
      const video = json.data || json;
      if (video.embed_link) return video;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

(async () => {
  const filename = process.argv[2];
  if (!filename) throw new Error('Usage: node scripts/upload-tus.js <filename>');
  const filePath = path.join(VIDEO_DIR, filename);
  const filesize = fs.statSync(filePath).size;
  const title = filename.replace(/\.mp4$/i, '');

  console.log(`Uploading ${filename} (${(filesize / 1024 / 1024).toFixed(1)}MB) via Tus...`);
  const parentId = await getParentId();
  const init = await initUpload(filesize, filename, title, parentId);
  console.log('Init response:', JSON.stringify(init));
  const endpoint = init.data?.endpoint || init.endpoint;
  const videoId = init.data?.id || init.id;

  await uploadChunks(endpoint, filePath, filesize);
  console.log('Upload complete, waiting for video info...');

  const video = await waitForVideo(videoId);
  if (!video) throw new Error('Video not ready after waiting');

  const manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : {};
  manifest[filename] = { id: video.id, embed_link: video.embed_link, play_link: video.play_link };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Done:', video.embed_link);
})();
