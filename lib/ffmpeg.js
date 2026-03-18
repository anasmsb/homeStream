const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');
const os = require('os');

const FFMPEG_DIR = path.join(__dirname, '..', 'ffmpeg');
const platform = os.platform(); // win32, linux, darwin
const arch = os.arch(); // x64, arm64

// Download URLs for static ffmpeg builds
function getDownloadUrl() {
  if (platform === 'win32') {
    return 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
  } else if (platform === 'linux') {
    if (arch === 'arm64') {
      return 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz';
    }
    return 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz';
  } else if (platform === 'darwin') {
    // macOS - use evermeet builds
    return arch === 'arm64'
      ? 'https://www.osxexperts.net/ffmpeg7arm.zip'
      : 'https://evermeet.cx/ffmpeg/getrelease/zip';
  }
  return null;
}

function getBinaryName() {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function getFfmpegPath() {
  // 1. Check local ffmpeg directory
  const localBin = path.join(FFMPEG_DIR, getBinaryName());
  if (fs.existsSync(localBin)) return localBin;

  // 2. Check nested structure (some archives extract into a subfolder)
  if (fs.existsSync(FFMPEG_DIR)) {
    const found = findBinaryRecursive(FFMPEG_DIR, getBinaryName());
    if (found) return found;
  }

  // 3. Check system PATH
  try {
    execFileSync(platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { stdio: 'pipe' });
    return 'ffmpeg'; // available on PATH
  } catch {
    return null;
  }
}

function findBinaryRecursive(dir, name, depth = 3) {
  if (depth <= 0) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full;
      if (entry.isDirectory()) {
        const found = findBinaryRecursive(full, name, depth - 1);
        if (found) return found;
      }
    }
  } catch {}
  return null;
}

// Follow redirects manually for https
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const getter = url.startsWith('https') ? https : http;

    function doRequest(reqUrl, redirects) {
      if (redirects > 10) return reject(new Error('Too many redirects'));

      getter.get(reqUrl, { headers: { 'User-Agent': 'MediaServer/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, reqUrl).href;
          const nextGetter = next.startsWith('https') ? https : http;
          // Use the correct protocol for redirect
          nextGetter.get(next, { headers: { 'User-Agent': 'MediaServer/1.0' } }, (res2) => {
            if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
              res2.resume();
              doRequest(res2.headers.location.startsWith('http') ? res2.headers.location : new URL(res2.headers.location, next).href, redirects + 1);
            } else if (res2.statusCode !== 200) {
              res2.resume();
              reject(new Error(`Download failed: HTTP ${res2.statusCode}`));
            } else {
              const total = parseInt(res2.headers['content-length']) || 0;
              let downloaded = 0;
              res2.on('data', (chunk) => {
                downloaded += chunk.length;
                if (total > 0) {
                  const pct = Math.round((downloaded / total) * 100);
                  process.stdout.write(`\r  Downloading ffmpeg... ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
                }
              });
              res2.pipe(file);
              file.on('finish', () => { file.close(); console.log(''); resolve(); });
            }
          }).on('error', reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length']) || 0;
        let downloaded = 0;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            process.stdout.write(`\r  Downloading ffmpeg... ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(''); resolve(); });
      }).on('error', reject);
    }

    doRequest(url, 0);
  });
}

async function extractZipNode(zipPath, destDir) {
  // Pure Node.js zip extraction using built-in zlib
  const zlib = require('zlib');
  const buf = fs.readFileSync(zipPath);

  // Find all local file headers (PK\x03\x04)
  let offset = 0;
  const files = [];

  while (offset < buf.length - 4) {
    // Look for central directory signature — stop processing local headers
    if (buf.readUInt32LE(offset) === 0x02014b50) break;
    if (buf.readUInt32LE(offset) !== 0x04034b50) break; // not a local file header

    const compression = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;

    files.push({ name, compression, compressedSize, uncompressedSize, dataStart, dataEnd });
    offset = dataEnd;
  }

  console.log(`  Extracting ${files.length} entries...`);

  for (const entry of files) {
    const entryPath = path.join(destDir, entry.name);

    // Security: prevent path traversal
    if (!path.resolve(entryPath).startsWith(path.resolve(destDir))) continue;

    if (entry.name.endsWith('/')) {
      fs.mkdirSync(entryPath, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(entryPath), { recursive: true });

    const rawData = buf.slice(entry.dataStart, entry.dataEnd);

    if (entry.compression === 0) {
      // Stored (no compression)
      fs.writeFileSync(entryPath, rawData);
    } else if (entry.compression === 8) {
      // Deflate
      const inflated = zlib.inflateRawSync(rawData);
      fs.writeFileSync(entryPath, inflated);
    }
    // Skip other compression methods
  }
}

async function extractArchive(archivePath, destDir) {
  const ext = archivePath.toLowerCase();

  if (ext.endsWith('.zip')) {
    await extractZipNode(archivePath, destDir);
  } else if (ext.endsWith('.tar.xz')) {
    const { execSync } = require('child_process');
    execSync(`tar -xf "${archivePath}" -C "${destDir}"`, { stdio: 'pipe' });
  }
}

async function downloadFfmpeg() {
  const existing = getFfmpegPath();
  if (existing) {
    console.log(`[ffmpeg] Found at: ${existing}`);
    return existing;
  }

  const url = getDownloadUrl();
  if (!url) {
    console.error(`[ffmpeg] No download available for ${platform}/${arch}`);
    console.error('[ffmpeg] Please install ffmpeg manually: https://ffmpeg.org/download.html');
    return null;
  }

  console.log(`[ffmpeg] Not found. Downloading for ${platform}/${arch}...`);
  fs.mkdirSync(FFMPEG_DIR, { recursive: true });

  const isZip = url.endsWith('.zip');
  const archiveName = isZip ? 'ffmpeg.zip' : 'ffmpeg.tar.xz';
  const archivePath = path.join(FFMPEG_DIR, archiveName);

  try {
    await downloadFile(url, archivePath);
    console.log('[ffmpeg] Extracting...');
    await extractArchive(archivePath, FFMPEG_DIR);

    // Clean up archive
    try { fs.unlinkSync(archivePath); } catch {}

    // Find the binary in extracted files
    const binPath = findBinaryRecursive(FFMPEG_DIR, getBinaryName());
    if (!binPath) {
      console.error('[ffmpeg] Could not find ffmpeg binary after extraction');
      return null;
    }

    // On Linux/Mac, make executable
    if (platform !== 'win32') {
      fs.chmodSync(binPath, 0o755);
    }

    console.log(`[ffmpeg] Installed at: ${binPath}`);
    return binPath;
  } catch (err) {
    console.error(`[ffmpeg] Download/extract failed: ${err.message}`);
    console.error('[ffmpeg] Please install ffmpeg manually: https://ffmpeg.org/download.html');
    // Clean up on failure
    try { fs.unlinkSync(archivePath); } catch {}
    return null;
  }
}

module.exports = { getFfmpegPath, downloadFfmpeg, FFMPEG_DIR };
