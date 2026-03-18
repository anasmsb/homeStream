const express = require('express');
const db = require('../db');
const scanner = require('../lib/scanner');

const router = express.Router();

// Check if user has permission to access a folder
async function hasPermission(user, folderRelPath) {
  if (user.role === 'admin') return true;

  const result = await db.query(
    'SELECT folder_path FROM folder_permissions WHERE user_id = $1',
    [user.userId]
  );

  const permitted = result.rows.map((r) => r.folder_path);
  const normalizedPath = folderRelPath.replace(/\\/g, '/');

  for (const p of permitted) {
    // Exact match or parent match
    if (normalizedPath === p || normalizedPath.startsWith(p + '/')) return true;
    // Child of permitted path (user can navigate into subfolders)
    if (p.startsWith(normalizedPath + '/')) return true;
  }

  // Root access: if user has any permission, they can see root
  if (normalizedPath === '.') return permitted.length > 0;

  return false;
}

// Filter folders based on user permissions
async function filterFolders(user, folderIds) {
  if (user.role === 'admin') return folderIds;

  const result = await db.query(
    'SELECT folder_path FROM folder_permissions WHERE user_id = $1',
    [user.userId]
  );
  const permitted = result.rows.map((r) => r.folder_path);

  return folderIds.filter((fid) => {
    const folder = scanner.folders.get(fid);
    if (!folder) return false;
    const rel = folder.relPath;
    for (const p of permitted) {
      if (rel === p || rel.startsWith(p + '/') || p.startsWith(rel + '/')) return true;
    }
    return false;
  });
}

// GET /api/folders/:id? — list contents of a folder
router.get('/:id?', async (req, res) => {
  try {
    const folderId = req.params.id || scanner.getRootId();
    const folder = scanner.folders.get(folderId);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Permission check
    if (!(await hasPermission(req.user, folder.relPath))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Filter children folders by permission
    const visibleChildren = await filterFolders(req.user, folder.children);
    const childFolders = visibleChildren.map((cid) => {
      const child = scanner.folders.get(cid);
      const totalFiles = countFilesRecursive(cid);
      const thumbFile = findFirstFile(cid);
      return {
        id: child.id,
        name: child.name,
        fileCount: totalFiles,
        thumbFileId: thumbFile ? thumbFile.id : null,
      };
    });

    // Files in this folder with pagination
    const allFiles = folder.files.map((fid) => scanner.files.get(fid)).filter(Boolean);
    const totalFiles = allFiles.length;
    const start = (page - 1) * limit;
    const pagedFiles = limit === 0 ? allFiles : allFiles.slice(start, start + limit);
    const fileList = pagedFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
    }));

    // Build breadcrumbs
    const breadcrumbs = [];
    let current = folder;
    while (current) {
      breadcrumbs.unshift({ id: current.id, name: current.name });
      current = current.parentId ? scanner.folders.get(current.parentId) : null;
    }

    res.json({
      id: folder.id,
      name: folder.name,
      breadcrumbs,
      folders: childFolders,
      files: fileList,
      pagination: {
        page,
        limit,
        total: totalFiles,
        totalPages: limit === 0 ? 1 : Math.ceil(totalFiles / limit),
      },
    });
  } catch (err) {
    console.error('Folder listing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/folders/:id/all — all files recursively
router.get('/:id/all', async (req, res) => {
  try {
    const folderId = req.params.id || scanner.getRootId();
    const folder = scanner.folders.get(folderId);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    if (!(await hasPermission(req.user, folder.relPath))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const allFiles = [];
    collectFilesRecursive(folderId, allFiles, req.user);

    const total = allFiles.length;
    const start = (page - 1) * limit;
    const paged = limit === 0 ? allFiles : allFiles.slice(start, start + limit);

    res.json({
      files: paged.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        folderName: getFolderName(f.folderId),
        folderId: f.folderId,
      })),
      pagination: { page, limit, total, totalPages: limit === 0 ? 1 : Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('All files error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function countFilesRecursive(folderId) {
  const folder = scanner.folders.get(folderId);
  if (!folder) return 0;
  let count = folder.files.length;
  for (const childId of folder.children) {
    count += countFilesRecursive(childId);
  }
  return count;
}

function findFirstFile(folderId) {
  const folder = scanner.folders.get(folderId);
  if (!folder) return null;
  if (folder.files.length > 0) return scanner.files.get(folder.files[0]);
  for (const childId of folder.children) {
    const found = findFirstFile(childId);
    if (found) return found;
  }
  return null;
}

function collectFilesRecursive(folderId, result) {
  const folder = scanner.folders.get(folderId);
  if (!folder) return;
  for (const fid of folder.files) {
    const f = scanner.files.get(fid);
    if (f) result.push(f);
  }
  for (const childId of folder.children) {
    collectFilesRecursive(childId, result);
  }
}

function getFolderName(folderId) {
  const folder = scanner.folders.get(folderId);
  return folder ? folder.name : '';
}

module.exports = router;
