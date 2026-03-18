const crypto = require('crypto');

const idToPath = new Map();
const pathToId = new Map();

function generateId() {
  return crypto.randomBytes(6).toString('hex');
}

function assignId(filePath) {
  if (pathToId.has(filePath)) return pathToId.get(filePath);
  let id;
  do { id = generateId(); } while (idToPath.has(id));
  idToPath.set(id, filePath);
  pathToId.set(filePath, id);
  return id;
}

function getId(filePath) {
  return pathToId.get(filePath) || null;
}

function getPath(id) {
  return idToPath.get(id) || null;
}

function removeByPath(filePath) {
  const id = pathToId.get(filePath);
  if (id) {
    idToPath.delete(id);
    pathToId.delete(filePath);
  }
}

function clear() {
  idToPath.clear();
  pathToId.clear();
}

module.exports = { assignId, getId, getPath, removeByPath, clear, idToPath, pathToId };
