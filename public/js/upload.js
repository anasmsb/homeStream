// Upload
const uploadBtn = document.getElementById('uploadBtn');
const uploadModal = document.getElementById('uploadModal');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');

uploadBtn.addEventListener('click', () => {
  uploadModal.style.display = '';
  document.getElementById('uploadProgress').style.display = 'none';
});

document.getElementById('uploadModalClose').addEventListener('click', () => {
  uploadModal.style.display = 'none';
});

document.getElementById('selectFiles').addEventListener('click', () => fileInput.click());
document.getElementById('selectFolder').addEventListener('click', () => folderInput.click());

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  const paths = files.map((f) => f.name);
  uploadFilesWithPaths(files, paths);
});

folderInput.addEventListener('change', () => {
  const files = Array.from(folderInput.files);
  const paths = files.map((f) => f.webkitRelativePath || f.name);
  uploadFilesWithPaths(files, paths);
});

// Drag and drop
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});
uploadZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');

  // Use DataTransferItem API to read folder contents
  const items = e.dataTransfer.items;
  if (items && items.length > 0 && items[0].webkitGetAsEntry) {
    const allFiles = [];
    const allPaths = [];
    const entries = [];

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }

    await Promise.all(entries.map((entry) => traverseEntry(entry, '', allFiles, allPaths)));

    if (allFiles.length > 0) {
      uploadFilesWithPaths(allFiles, allPaths);
    }
  } else {
    // Fallback: plain file drop (no folder structure)
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map((f) => f.name);
    uploadFilesWithPaths(files, paths);
  }
});

// Recursively traverse dropped folder entries
function traverseEntry(entry, parentPath, fileList, pathList) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        fileList.push(file);
        pathList.push(parentPath ? parentPath + '/' + file.name : file.name);
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const dirPath = parentPath ? parentPath + '/' + entry.name : entry.name;
      readAllEntries(dirReader, (entries) => {
        Promise.all(
          entries.map((e) => traverseEntry(e, dirPath, fileList, pathList))
        ).then(resolve);
      });
    } else {
      resolve();
    }
  });
}

// Directory reader may return entries in batches, so read all
function readAllEntries(reader, callback) {
  const allEntries = [];
  function readBatch() {
    reader.readEntries((entries) => {
      if (entries.length === 0) {
        callback(allEntries);
      } else {
        allEntries.push(...entries);
        readBatch();
      }
    }, () => callback(allEntries));
  }
  readBatch();
}

async function uploadFilesWithPaths(files, relativePaths) {
  if (!files || files.length === 0) return;

  const progressDiv = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const status = document.getElementById('uploadStatus');
  progressDiv.style.display = '';

  const formData = new FormData();
  // Text fields MUST come before file fields for multer to parse them
  formData.append('relativePaths', JSON.stringify(relativePaths));
  if (currentFolderId) {
    formData.append('folderId', currentFolderId);
  }
  for (const file of files) {
    formData.append('files', file);
  }

  try {
    status.textContent = `Uploading ${files.length} file(s)...`;
    progressFill.style.width = '0%';

    const xhr = new XMLHttpRequest();
    const token = getToken();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        status.textContent = `Uploading... ${pct}%`;
      }
    });

    await new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          status.textContent = `Upload complete! ${data.count} file(s) uploaded.`;
          progressFill.style.width = '100%';
          resolve();
        } else {
          let msg = 'Upload failed';
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));

      xhr.open('POST', '/api/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });

    // Refresh current view after short delay
    setTimeout(() => {
      uploadModal.style.display = 'none';
      loadCurrentView();
    }, 1500);
  } catch (err) {
    status.textContent = 'Upload failed: ' + err.message;
    console.error('Upload error:', err);
  }
}
