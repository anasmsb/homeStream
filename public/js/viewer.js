// Unified Media Viewer — handles both images and videos with prev/next across all files
const viewerOverlay = document.getElementById('viewerOverlay');
const viewerImage = document.getElementById('viewerImage');
const viewerCounter = document.getElementById('viewerCounter');
const viewerFav = document.getElementById('viewerFav');

let mediaIndex = 0;       // current index in currentFiles
let mediaFiles = [];       // reference to currentFiles at time of opening

function openViewer(index) {
  mediaFiles = currentFiles.slice(); // snapshot
  if (mediaFiles.length === 0) return;
  mediaIndex = Math.max(0, Math.min(index, mediaFiles.length - 1));
  showMediaAtIndex();
}

function showMediaAtIndex() {
  const file = mediaFiles[mediaIndex];
  if (!file) return;

  if (file.type === 'video') {
    // Switch to player overlay
    viewerOverlay.style.display = 'none';
    openPlayerAtIndex(mediaIndex);
  } else {
    // Image — show in viewer
    closePlayerSilent();
    viewerOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    viewerImage.src = mediaUrl(file.id, 'stream');
    updateViewerUI(file);

    // Preload adjacent images
    if (mediaIndex > 0 && mediaFiles[mediaIndex - 1].type === 'image') {
      const prev = new Image();
      prev.src = mediaUrl(mediaFiles[mediaIndex - 1].id, 'stream');
    }
    if (mediaIndex < mediaFiles.length - 1 && mediaFiles[mediaIndex + 1].type === 'image') {
      const next = new Image();
      next.src = mediaUrl(mediaFiles[mediaIndex + 1].id, 'stream');
    }
  }
}

function updateViewerUI(file) {
  viewerCounter.textContent = `${mediaIndex + 1} / ${mediaFiles.length}`;
  viewerFav.innerHTML = favoriteIds.has(file.id) ? '&#9829;' : '&#9825;';
  viewerFav.style.color = favoriteIds.has(file.id) ? 'var(--heart)' : '';
}

function closeViewer() {
  viewerOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

function mediaPrev() {
  if (mediaIndex > 0) {
    mediaIndex--;
    showMediaAtIndex();
  }
}

function mediaNext() {
  if (mediaIndex < mediaFiles.length - 1) {
    mediaIndex++;
    showMediaAtIndex();
  }
}

document.getElementById('viewerClose').addEventListener('click', closeViewer);
document.getElementById('viewerPrev').addEventListener('click', mediaPrev);
document.getElementById('viewerNext').addEventListener('click', mediaNext);

viewerFav.addEventListener('click', () => {
  const file = mediaFiles[mediaIndex];
  if (file) toggleFavorite(file.id, viewerFav);
});

document.getElementById('viewerInfo').addEventListener('click', () => {
  const file = mediaFiles[mediaIndex];
  if (file) showFileInfo(file.id);
});

// Show delete button for admins
if (getUser().role === 'admin') {
  document.getElementById('viewerDelete').style.display = '';
  document.getElementById('playerDelete').style.display = '';
}

document.getElementById('viewerDelete').addEventListener('click', () => {
  const file = mediaFiles[mediaIndex];
  if (file && confirm(`Delete "${file.name}"? It will be moved to trash.`)) {
    deleteMediaFile(file.id);
  }
});

async function deleteMediaFile(fileId) {
  try {
    const res = await apiFetch(`/api/delete/${fileId}`, { method: 'DELETE' });
    if (!res || !res.ok) {
      const err = await res.json();
      alert(err.error || 'Delete failed');
      return;
    }
    // Remove from current lists
    mediaFiles = mediaFiles.filter((f) => f.id !== fileId);
    currentFiles = currentFiles.filter((f) => f.id !== fileId);

    if (mediaFiles.length === 0) {
      closeViewer();
      closePlayer();
      loadCurrentView();
    } else {
      if (mediaIndex >= mediaFiles.length) mediaIndex = mediaFiles.length - 1;
      showMediaAtIndex();
    }
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

// Keyboard — image viewer
document.addEventListener('keydown', (e) => {
  if (viewerOverlay.style.display === 'none') return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') mediaPrev();
  if (e.key === 'ArrowRight') mediaNext();
});

// Touch swipe — image viewer
let touchStartX = 0;
let touchStartY = 0;
viewerOverlay.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

viewerOverlay.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
    if (dx > 0) mediaPrev();
    else mediaNext();
  }
});

// Info panel
async function showFileInfo(fileId) {
  try {
    const res = await apiFetch(`/api/media/${fileId}/info`);
    if (!res) return;
    const info = await res.json();

    const panel = document.getElementById('infoPanel');
    const body = document.getElementById('infoPanelBody');
    body.innerHTML = `
      <div class="info-row"><span class="info-label">Name</span><span class="info-value">${info.name}</span></div>
      <div class="info-row"><span class="info-label">Type</span><span class="info-value">${info.type}</span></div>
      <div class="info-row"><span class="info-label">Size</span><span class="info-value">${formatSize(info.size)}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-value">${info.folderPath}</span></div>
      <div class="info-row"><span class="info-label">Modified</span><span class="info-value">${new Date(info.mtime).toLocaleString()}</span></div>
    `;

    const goBtn = document.getElementById('infoGoToFolder');
    if (info.folderId) {
      goBtn.style.display = '';
      goBtn.onclick = () => {
        panel.style.display = 'none';
        closeViewer();
        closePlayer();
        navigateToFolder(info.folderId);
      };
    } else {
      goBtn.style.display = 'none';
    }

    panel.style.display = '';
  } catch (err) {
    console.error('Info error:', err);
  }
}

document.getElementById('infoPanelClose').addEventListener('click', () => {
  document.getElementById('infoPanel').style.display = 'none';
});
