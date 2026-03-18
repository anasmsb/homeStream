const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFile } = require('child_process');
const { getFfmpegPath } = require('./ffmpeg');

const THUMBS_DIR = path.join(__dirname, '..', 'thumbs');

let ffmpegBin = undefined; // undefined = not checked yet, null = checked and not found

async function ensureFfmpeg() {
  if (ffmpegBin) return ffmpegBin;
  // Re-check every time if previously not found (it may have been installed since)
  ffmpegBin = getFfmpegPath();
  if (!ffmpegBin) {
    console.warn('[thumb] ffmpeg not available. Video thumbnails/previews disabled.');
  } else {
    console.log(`[thumb] Using ffmpeg: ${ffmpegBin}`);
  }
  return ffmpegBin;
}

function getThumbPath(fileId) {
  return path.join(THUMBS_DIR, `${fileId}.jpg`);
}

function getPreviewPath(fileId) {
  return path.join(THUMBS_DIR, `${fileId}_preview.webm`);
}

async function generateImageThumb(sourcePath, fileId) {
  const thumbPath = getThumbPath(fileId);
  if (fs.existsSync(thumbPath)) return thumbPath;

  await fs.promises.mkdir(path.dirname(thumbPath), { recursive: true });

  console.log(`[thumb] Generating image thumbnail: ${sourcePath}`);
  try {
    await sharp(sourcePath)
      .resize(400, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);
    return thumbPath;
  } catch (err) {
    console.error(`[thumb] Image thumbnail failed for ${sourcePath}:`, err.message);
    throw err;
  }
}

async function generateVideoThumb(sourcePath, fileId) {
  const thumbPath = getThumbPath(fileId);
  if (fs.existsSync(thumbPath)) return thumbPath;

  const bin = await ensureFfmpeg();
  if (!bin) throw new Error('ffmpeg not installed - run "npm run setup" to download it');

  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
  console.log(`[thumb] Generating video thumbnail: ${sourcePath}`);

  return new Promise((resolve, reject) => {
    execFile(bin, [
      '-i', sourcePath,
      '-ss', '3',
      '-vframes', '1',
      '-vf', 'scale=400:-1',
      '-q:v', '5',
      '-y',
      thumbPath,
    ], (err, stdout, stderr) => {
      if (err) {
        console.log(`[thumb] Retrying at 0s: ${sourcePath}`);
        execFile(bin, [
          '-i', sourcePath,
          '-ss', '0',
          '-vframes', '1',
          '-vf', 'scale=400:-1',
          '-q:v', '5',
          '-y',
          thumbPath,
        ], (err2, stdout2, stderr2) => {
          if (err2) {
            console.error(`[thumb] Video thumb failed: ${err2.message}`);
            console.error(`[thumb] stderr: ${stderr2}`);
            return reject(err2);
          }
          resolve(thumbPath);
        });
      } else {
        resolve(thumbPath);
      }
    });
  });
}

async function generateVideoPreview(sourcePath, fileId) {
  const previewPath = getPreviewPath(fileId);
  if (fs.existsSync(previewPath)) return previewPath;

  const bin = await ensureFfmpeg();
  if (!bin) throw new Error('ffmpeg not installed - run "npm run setup" to download it');

  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  console.log(`[thumb] Generating video preview: ${sourcePath}`);

  return new Promise((resolve, reject) => {
    execFile(bin, [
      '-i', sourcePath,
      '-ss', '3',
      '-t', '4',
      '-vf', 'scale=400:-1,fps=10',
      '-an',
      '-y',
      previewPath,
    ], (err, stdout, stderr) => {
      if (err) {
        execFile(bin, [
          '-i', sourcePath,
          '-ss', '0',
          '-t', '4',
          '-vf', 'scale=400:-1,fps=10',
          '-an',
          '-y',
          previewPath,
        ], (err2, stdout2, stderr2) => {
          if (err2) {
            console.error(`[thumb] Video preview failed: ${err2.message}`);
            console.error(`[thumb] stderr: ${stderr2}`);
            return reject(err2);
          }
          resolve(previewPath);
        });
      } else {
        resolve(previewPath);
      }
    });
  });
}

// Reset cached path (e.g., after download)
function resetFfmpegPath() {
  ffmpegBin = null;
}

module.exports = { generateImageThumb, generateVideoThumb, generateVideoPreview, getThumbPath, getPreviewPath, resetFfmpegPath };
