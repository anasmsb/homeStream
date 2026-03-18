const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const ids = require('../lib/ids');
const scanner = require('../lib/scanner');

const router = express.Router();

function getMediaDir() {
  return path.resolve(process.env.MEDIA_DIR || './media');
}

function getTrashDir() {
  return path.join(__dirname, '..', '.trash');
}

function getSoftDeleteDays() {
  return parseInt(process.env.SOFT_DELETE_DAYS) || 30;
}

// DELETE /api/delete/:id — soft delete a file (admin only)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete files' });
  }

  try {
    const filePath = ids.getPath(req.params.id);
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    const fileInfo = scanner.files.get(req.params.id);
    if (!fileInfo) return res.status(404).json({ error: 'File not found' });

    const mediaDir = getMediaDir();
    const absPath = path.join(mediaDir, filePath);

    if (!fs.existsSync(absPath)) {
      // File already gone from disk, just clean up index
      scanner.removeFile(filePath);
      return res.json({ success: true, message: 'File was already removed from disk' });
    }

    // Move to trash
    const trashDir = getTrashDir();
    const trashName = `${Date.now()}_${path.basename(filePath)}`;
    const trashPath = path.join(trashDir, trashName);
    fs.mkdirSync(trashDir, { recursive: true });
    fs.renameSync(absPath, trashPath);

    // Record in database
    const days = getSoftDeleteDays();
    const purgeAfter = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO deleted_files (original_path, trash_path, deleted_by, purge_after, file_size, file_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [filePath, trashName, req.user.userId, purgeAfter, fileInfo.size, fileInfo.name]
    );

    // Remove from scanner index
    scanner.removeFile(filePath);

    res.json({
      success: true,
      message: `File moved to trash. Will be permanently deleted after ${days} days.`,
      purgeAfter,
    });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

// GET /api/delete/trash — list trashed files (admin only)
router.get('/trash', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  try {
    const result = await db.query(
      `SELECT d.*, u.username as deleted_by_name
       FROM deleted_files d
       LEFT JOIN users u ON d.deleted_by = u.id
       ORDER BY d.deleted_at DESC`
    );
    res.json({ files: result.rows });
  } catch (err) {
    console.error('Trash list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/delete/restore/:id — restore a trashed file (admin only)
router.post('/restore/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  try {
    const result = await db.query('SELECT * FROM deleted_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trashed file not found' });
    }

    const record = result.rows[0];
    const trashDir = getTrashDir();
    const trashPath = path.join(trashDir, record.trash_path);
    const mediaDir = getMediaDir();
    const restorePath = path.join(mediaDir, record.original_path);

    if (!fs.existsSync(trashPath)) {
      await db.query('DELETE FROM deleted_files WHERE id = $1', [req.params.id]);
      return res.status(404).json({ error: 'File no longer exists in trash' });
    }

    // Restore to original location
    fs.mkdirSync(path.dirname(restorePath), { recursive: true });
    fs.renameSync(trashPath, restorePath);

    // Remove from deleted_files table
    await db.query('DELETE FROM deleted_files WHERE id = $1', [req.params.id]);

    // Re-index
    const relPath = record.original_path.replace(/\\/g, '/');
    scanner.addFile(process.env.MEDIA_DIR || './media', relPath);

    res.json({ success: true, message: 'File restored' });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

// DELETE /api/delete/purge/:id — permanently delete (admin only)
router.delete('/purge/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  try {
    const result = await db.query('SELECT * FROM deleted_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const record = result.rows[0];
    const trashPath = path.join(getTrashDir(), record.trash_path);

    // Delete file from disk
    try { fs.unlinkSync(trashPath); } catch {}

    // Remove from database
    await db.query('DELETE FROM deleted_files WHERE id = $1', [req.params.id]);

    res.json({ success: true, message: 'File permanently deleted' });
  } catch (err) {
    console.error('Purge error:', err);
    res.status(500).json({ error: 'Purge failed' });
  }
});

// Auto-purge job — called periodically
async function purgeExpiredFiles() {
  try {
    const result = await db.query(
      'SELECT * FROM deleted_files WHERE purge_after <= NOW()'
    );

    for (const record of result.rows) {
      const trashPath = path.join(getTrashDir(), record.trash_path);
      try { fs.unlinkSync(trashPath); } catch {}
    }

    if (result.rows.length > 0) {
      await db.query('DELETE FROM deleted_files WHERE purge_after <= NOW()');
      console.log(`[trash] Purged ${result.rows.length} expired file(s)`);
    }
  } catch (err) {
    console.error('[trash] Purge error:', err);
  }
}

module.exports = router;
module.exports.purgeExpiredFiles = purgeExpiredFiles;
