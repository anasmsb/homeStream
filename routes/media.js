const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const db = require('../db');
const ids = require('../lib/ids');
const scanner = require('../lib/scanner');
const thumbs = require('../lib/thumbs');

const router = express.Router();

function getMediaDir() {
  return path.resolve(process.env.MEDIA_DIR || './media');
}

async function checkFilePermission(user, fileInfo) {
  if (user.role === 'admin') return true;
  const folder = scanner.folders.get(fileInfo.folderId);
  if (!folder) return false;

  const result = await db.query(
    'SELECT folder_path FROM folder_permissions WHERE user_id = $1',
    [user.userId]
  );
  const permitted = result.rows.map((r) => r.folder_path);
  const folderRel = folder.relPath;

  for (const p of permitted) {
    if (folderRel === p || folderRel.startsWith(p + '/') || folderRel === '.') {
      // Root check: only if user has permissions at all
      if (folderRel === '.' && permitted.length > 0) return true;
      if (folderRel !== '.') return true;
    }
  }
  return false;
}

// GET /api/media/:id/stream
router.get('/:id/stream', async (req, res) => {
  try {
    const filePath = ids.getPath(req.params.id);
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    const fileInfo = scanner.files.get(req.params.id);
    if (!fileInfo) return res.status(404).json({ error: 'File not found' });

    if (!(await checkFilePermission(req.user, fileInfo))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absPath = path.join(getMediaDir(), filePath);
    // Path traversal protection
    if (!path.resolve(absPath).startsWith(path.resolve(getMediaDir()))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(absPath);
    const mimeType = mime.lookup(absPath) || 'application/octet-stream';

    // Handle Range requests for video seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      fs.createReadStream(absPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(absPath).pipe(res);
    }
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/media/:id/thumb
router.get('/:id/thumb', async (req, res) => {
  try {
    const filePath = ids.getPath(req.params.id);
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    const fileInfo = scanner.files.get(req.params.id);
    if (!fileInfo) return res.status(404).json({ error: 'File not found' });

    if (!(await checkFilePermission(req.user, fileInfo))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absPath = path.join(getMediaDir(), filePath);

    if (!fs.existsSync(absPath)) {
      console.error(`[thumb] Source file missing: ${absPath}`);
      return res.status(404).json({ error: 'Source file not found on disk' });
    }

    let thumbPath;
    if (fileInfo.type === 'image') {
      thumbPath = await thumbs.generateImageThumb(absPath, req.params.id);
    } else if (fileInfo.type === 'video') {
      thumbPath = await thumbs.generateVideoThumb(absPath, req.params.id);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    res.sendFile(thumbPath);
  } catch (err) {
    console.error(`[thumb] Error for ${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Could not generate thumbnail: ' + err.message });
  }
});

// GET /api/media/:id/preview — animated video preview
router.get('/:id/preview', async (req, res) => {
  try {
    const filePath = ids.getPath(req.params.id);
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    const fileInfo = scanner.files.get(req.params.id);
    if (!fileInfo || fileInfo.type !== 'video') {
      return res.status(400).json({ error: 'Not a video file' });
    }

    if (!(await checkFilePermission(req.user, fileInfo))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absPath = path.join(getMediaDir(), filePath);
    const previewPath = await thumbs.generateVideoPreview(absPath, req.params.id);
    res.sendFile(previewPath);
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Could not generate preview: ' + err.message });
  }
});

// GET /api/media/:id/info
router.get('/:id/info', async (req, res) => {
  try {
    const filePath = ids.getPath(req.params.id);
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    const fileInfo = scanner.files.get(req.params.id);
    if (!fileInfo) return res.status(404).json({ error: 'File not found' });

    if (!(await checkFilePermission(req.user, fileInfo))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const folder = scanner.folders.get(fileInfo.folderId);
    const folderPath = folder ? folder.relPath : '';

    // Build full folder breadcrumb path
    const pathParts = [];
    let current = folder;
    while (current && current.relPath !== '.') {
      pathParts.unshift(current.name);
      current = current.parentId ? scanner.folders.get(current.parentId) : null;
    }

    res.json({
      id: fileInfo.id,
      name: fileInfo.name,
      type: fileInfo.type,
      size: fileInfo.size,
      mtime: fileInfo.mtime,
      folderPath: pathParts.join('/') || 'Root',
      folderId: fileInfo.folderId,
    });
  } catch (err) {
    console.error('Info error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
