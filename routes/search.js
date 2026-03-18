const express = require('express');
const db = require('../db');
const scanner = require('../lib/scanner');

const router = express.Router();

// GET /api/search?q=term
router.get('/', async (req, res) => {
  try {
    const query = (req.query.q || '').trim().toLowerCase();
    if (!query) return res.json({ files: [] });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Get user's permitted folders
    let permitted = null;
    if (req.user.role !== 'admin') {
      const result = await db.query(
        'SELECT folder_path FROM folder_permissions WHERE user_id = $1',
        [req.user.userId]
      );
      permitted = result.rows.map((r) => r.folder_path);
    }

    const matches = [];
    for (const [, file] of scanner.files) {
      if (!file.name.toLowerCase().includes(query)) continue;

      // Permission check
      if (permitted) {
        const folder = scanner.folders.get(file.folderId);
        if (!folder) continue;
        const folderRel = folder.relPath;
        const hasAccess = permitted.some(
          (p) => folderRel === p || folderRel.startsWith(p + '/')
        );
        if (!hasAccess) continue;
      }

      const folder = scanner.folders.get(file.folderId);
      matches.push({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        folderId: file.folderId,
        folderName: folder ? folder.name : '',
      });
    }

    const total = matches.length;
    const start = (page - 1) * limit;
    const paged = limit === 0 ? matches : matches.slice(start, start + limit);

    res.json({
      files: paged,
      pagination: { page, limit, total, totalPages: limit === 0 ? 1 : Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
