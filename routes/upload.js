const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const ids = require('../lib/ids');
const scanner = require('../lib/scanner');

const router = express.Router();

function getMediaDir() {
  return path.resolve(process.env.MEDIA_DIR || './media');
}

// Temp upload directory — files go here first, then we move them
const TEMP_DIR = path.join(__dirname, '..', '.uploads_tmp');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    // Use a unique temp name to avoid collisions
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, unique + path.extname(file.originalname));
  },
});

function getUploadMiddleware() {
  const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB) || 5120;
  const maxFiles = parseInt(process.env.MAX_FILES_PER_UPLOAD) || 500;
  return multer({
    storage,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  }).array('files', maxFiles);
}

// POST /api/upload
router.post('/', (req, res, next) => {
  // Only admin and uploader can upload
  if (req.user.role === 'viewer') {
    return res.status(403).json({ error: 'Upload not allowed for your role' });
  }
  getUploadMiddleware()(req, res, next);
}, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const mediaDir = getMediaDir();
    const folderId = req.body.folderId || req.query.folderId;

    // Determine base target directory
    let baseTargetDir = mediaDir;
    if (folderId) {
      const folderPath = ids.getPath(folderId);
      if (folderPath && folderPath !== '.') {
        baseTargetDir = path.join(mediaDir, folderPath);
      }
    }

    // Parse relative paths from the client
    let relativePaths = [];
    try {
      if (req.body.relativePaths) {
        relativePaths = JSON.parse(req.body.relativePaths);
      }
    } catch { /* ignore */ }

    console.log(`[upload] ${req.files.length} files, relativePaths: ${relativePaths.length > 0 ? relativePaths.slice(0, 3).join(', ') + (relativePaths.length > 3 ? '...' : '') : 'NONE (flat upload)'}`);


    const uploaded = [];
    const newFolderPaths = new Set();

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const relPath = relativePaths[i] || file.originalname;

      // Sanitize: prevent path traversal
      const sanitized = relPath.replace(/\.\.\//g, '').replace(/\.\.\\/g, '').replace(/^\/+/, '');
      const targetPath = path.join(baseTargetDir, sanitized);

      // Verify it's still within media dir
      if (!path.resolve(targetPath).startsWith(path.resolve(mediaDir))) {
        // Clean up temp file and skip
        try { fs.unlinkSync(file.path); } catch {}
        continue;
      }

      // Create directory structure
      const targetDir = path.dirname(targetPath);
      fs.mkdirSync(targetDir, { recursive: true });

      // Handle duplicate filenames
      let finalPath = targetPath;
      if (fs.existsSync(finalPath)) {
        const ext = path.extname(finalPath);
        const base = path.basename(finalPath, ext);
        const dir = path.dirname(finalPath);
        let counter = 1;
        while (fs.existsSync(path.join(dir, `${base}_${counter}${ext}`))) {
          counter++;
        }
        finalPath = path.join(dir, `${base}_${counter}${ext}`);
      }

      // Move from temp to final location
      fs.renameSync(file.path, finalPath);

      const fileRelPath = path.relative(mediaDir, finalPath).replace(/\\/g, '/');
      uploaded.push({
        name: path.basename(finalPath),
        size: file.size,
        path: fileRelPath,
      });

      // Track new folder paths for permission auto-grant
      const dirRelPath = path.dirname(fileRelPath);
      if (dirRelPath && dirRelPath !== '.') {
        const parts = dirRelPath.split('/');
        let cumulative = '';
        for (const part of parts) {
          cumulative = cumulative ? cumulative + '/' + part : part;
          newFolderPaths.add(cumulative);
        }
      }

      // Ensure folder exists in scanner
      const dirRel = path.relative(mediaDir, targetDir).replace(/\\/g, '/');
      if (dirRel && dirRel !== '.') {
        scanner.addFolder(process.env.MEDIA_DIR || './media', dirRel);
      }

      // Add file to scanner immediately
      scanner.addFile(process.env.MEDIA_DIR || './media', fileRelPath);
    }

    // Auto-grant permissions for new folders (for non-admin users)
    if (req.user.role !== 'admin') {
      for (const folderPath of newFolderPaths) {
        await db.query(
          'INSERT INTO folder_permissions (user_id, folder_path) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.user.userId, folderPath]
        );
      }
    }

    // Clean up temp dir
    try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch {}

    res.json({ success: true, files: uploaded, count: uploaded.length });
  } catch (err) {
    console.error('Upload error:', err);
    // Clean up any remaining temp files
    try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

module.exports = router;
