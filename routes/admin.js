const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const scanner = require('../lib/scanner');

const router = express.Router();

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, role, created_at FROM users ORDER BY created_at'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (role && !['admin', 'viewer', 'uploader'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or viewer' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
      [username, hash, role || 'viewer']
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const { password, role } = req.body;
    const userId = parseInt(req.params.id);

    if (role && !['admin', 'viewer', 'uploader'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or viewer' });
    }

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    }
    if (role) {
      await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    }

    const result = await db.query(
      'SELECT id, username, role, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent deleting yourself
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users/:id/permissions
router.get('/users/:id/permissions', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const result = await db.query(
      'SELECT folder_path FROM folder_permissions WHERE user_id = $1',
      [userId]
    );

    res.json({ permissions: result.rows.map((r) => r.folder_path) });
  } catch (err) {
    console.error('Get permissions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id/permissions
router.put('/users/:id/permissions', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { folders } = req.body; // array of folder paths

    if (!Array.isArray(folders)) {
      return res.status(400).json({ error: 'folders must be an array' });
    }

    // Replace all permissions
    await db.query('DELETE FROM folder_permissions WHERE user_id = $1', [userId]);

    for (const folderPath of folders) {
      await db.query(
        'INSERT INTO folder_permissions (user_id, folder_path) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, folderPath]
      );
    }

    res.json({ success: true, permissions: folders });
  } catch (err) {
    console.error('Set permissions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/folders — list all folders for permission assignment
router.get('/folders', async (req, res) => {
  try {
    const folderList = [];
    for (const [, folder] of scanner.folders) {
      if (folder.relPath === '.') continue;
      folderList.push({
        id: folder.id,
        name: folder.name,
        relPath: folder.relPath,
      });
    }
    folderList.sort((a, b) => a.relPath.localeCompare(b.relPath));
    res.json({ folders: folderList });
  } catch (err) {
    console.error('List folders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
