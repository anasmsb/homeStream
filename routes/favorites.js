const express = require('express');
const db = require('../db');
const scanner = require('../lib/scanner');
const ids = require('../lib/ids');

const router = express.Router();

// GET /api/favorites
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await db.query(
      'SELECT file_path, created_at FROM favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    // Resolve file_path to current opaque IDs
    const allFavs = [];
    for (const row of result.rows) {
      const fileId = ids.getId(row.file_path);
      if (!fileId) continue; // file no longer exists
      const file = scanner.files.get(fileId);
      if (!file) continue;
      const folder = scanner.folders.get(file.folderId);
      allFavs.push({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        folderId: file.folderId,
        folderName: folder ? folder.name : '',
        favoritedAt: row.created_at,
      });
    }

    const total = allFavs.length;
    const start = (page - 1) * limit;
    const paged = limit === 0 ? allFavs : allFavs.slice(start, start + limit);

    res.json({
      files: paged,
      pagination: { page, limit, total, totalPages: limit === 0 ? 1 : Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Favorites error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/favorites/:fileId
router.post('/:fileId', async (req, res) => {
  try {
    const filePath = ids.getPath(req.params.fileId);
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    await db.query(
      'INSERT INTO favorites (user_id, file_path) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, filePath]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Add favorite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/favorites/:fileId
router.delete('/:fileId', async (req, res) => {
  try {
    const filePath = ids.getPath(req.params.fileId);
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    await db.query(
      'DELETE FROM favorites WHERE user_id = $1 AND file_path = $2',
      [req.user.userId, filePath]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Remove favorite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/favorites/check — check which files are favorited
router.get('/check', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM favorites WHERE user_id = $1',
      [req.user.userId]
    );

    // Map file_paths to current opaque IDs
    const favIds = new Set();
    for (const row of result.rows) {
      const fileId = ids.getId(row.file_path);
      if (fileId) favIds.add(fileId);
    }

    res.json({ favoriteIds: [...favIds] });
  } catch (err) {
    console.error('Check favorites error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
