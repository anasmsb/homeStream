const fs = require('fs');
const path = require('path');
const ids = require('./ids');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.wmv']);

// In-memory index
const folders = new Map(); // id -> { id, name, relPath, parentId, children: [id], files: [id] }
const files = new Map();   // id -> { id, name, relPath, type, folderId, size, mtime }

function getMediaType(ext) {
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

function scanDirectory(mediaDir) {
  ids.clear();
  folders.clear();
  files.clear();

  const absMediaDir = path.resolve(mediaDir);

  // Assign root an ID
  const rootId = ids.assignId('.');
  folders.set(rootId, {
    id: rootId,
    name: 'Root',
    relPath: '.',
    parentId: null,
    children: [],
    files: [],
  });

  function scanRecursive(dirPath, parentId) {
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort entries naturally
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(absMediaDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        const folderId = ids.assignId(relPath);
        const folderInfo = {
          id: folderId,
          name: entry.name,
          relPath,
          parentId,
          children: [],
          files: [],
        };
        folders.set(folderId, folderInfo);
        folders.get(parentId).children.push(folderId);
        scanRecursive(fullPath, folderId);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const type = getMediaType(ext);
        if (!type) continue;

        let stat;
        try { stat = fs.statSync(fullPath); } catch { continue; }

        const fileId = ids.assignId(relPath);
        const fileInfo = {
          id: fileId,
          name: entry.name,
          relPath,
          type,
          folderId: parentId,
          size: stat.size,
          mtime: stat.mtime,
        };
        files.set(fileId, fileInfo);
        folders.get(parentId).files.push(fileId);
      }
    }
  }

  scanRecursive(absMediaDir, rootId);
  console.log(`Scanned: ${folders.size - 1} folders, ${files.size} files`);
}

function addFile(mediaDir, relPath) {
  const absMediaDir = path.resolve(mediaDir);
  const fullPath = path.join(absMediaDir, relPath);
  const ext = path.extname(relPath).toLowerCase();
  const type = getMediaType(ext);
  if (!type) return;

  const dirRelPath = path.dirname(relPath).replace(/\\/g, '/');
  let parentId;
  if (dirRelPath === '.' || dirRelPath === '') {
    parentId = ids.getId('.');
  } else {
    // Ensure parent folder chain exists
    parentId = addFolder(mediaDir, dirRelPath);
  }
  if (!parentId) return;

  let stat;
  try { stat = fs.statSync(fullPath); } catch { return; }

  const normalizedRel = relPath.replace(/\\/g, '/');
  const fileId = ids.assignId(normalizedRel);
  const fileInfo = {
    id: fileId,
    name: path.basename(relPath),
    relPath: normalizedRel,
    type,
    folderId: parentId,
    size: stat.size,
    mtime: stat.mtime,
  };
  files.set(fileId, fileInfo);
  const folder = folders.get(parentId);
  if (folder && !folder.files.includes(fileId)) {
    folder.files.push(fileId);
  }
}

function removeFile(relPath) {
  const normalizedRel = relPath.replace(/\\/g, '/');
  const fileId = ids.getId(normalizedRel);
  if (!fileId) return;

  const file = files.get(fileId);
  if (file) {
    const folder = folders.get(file.folderId);
    if (folder) {
      folder.files = folder.files.filter((id) => id !== fileId);
    }
  }
  files.delete(fileId);
  ids.removeByPath(normalizedRel);
}

function addFolder(mediaDir, relPath) {
  const normalizedRel = relPath.replace(/\\/g, '/');
  if (ids.getId(normalizedRel)) return ids.getId(normalizedRel); // already exists

  // Ensure all parent folders exist first (recursive)
  const parts = normalizedRel.split('/');
  let currentRel = '';
  let parentId = ids.getId('.');  // start from root

  for (const part of parts) {
    currentRel = currentRel ? currentRel + '/' + part : part;
    const existingId = ids.getId(currentRel);
    if (existingId) {
      parentId = existingId;
      continue;
    }

    // Create this folder
    const folderId = ids.assignId(currentRel);
    const folderInfo = {
      id: folderId,
      name: part,
      relPath: currentRel,
      parentId,
      children: [],
      files: [],
    };
    folders.set(folderId, folderInfo);
    const parent = folders.get(parentId);
    if (parent && !parent.children.includes(folderId)) {
      parent.children.push(folderId);
    }
    parentId = folderId;
  }

  return parentId;
}

function removeFolder(relPath) {
  const normalizedRel = relPath.replace(/\\/g, '/');
  const folderId = ids.getId(normalizedRel);
  if (!folderId) return;

  const folder = folders.get(folderId);
  if (folder && folder.parentId) {
    const parent = folders.get(folder.parentId);
    if (parent) {
      parent.children = parent.children.filter((id) => id !== folderId);
    }
  }

  // Remove all files in this folder
  if (folder) {
    for (const fileId of folder.files) {
      const f = files.get(fileId);
      if (f) ids.removeByPath(f.relPath);
      files.delete(fileId);
    }
  }

  folders.delete(folderId);
  ids.removeByPath(normalizedRel);
}

function getRootId() {
  return ids.getId('.');
}

module.exports = {
  scanDirectory,
  addFile,
  removeFile,
  addFolder,
  removeFolder,
  folders,
  files,
  getRootId,
  IMAGE_EXTS,
  VIDEO_EXTS,
  getMediaType,
};
