// Video Player — integrated with unified media navigation
const playerOverlay = document.getElementById('playerOverlay');
const videoPlayer = document.getElementById('videoPlayer');
const seekIndicator = document.getElementById('seekIndicator');
const playerCounter = document.getElementById('playerCounter');
let currentVideoFile = null;

function openPlayerAtIndex(index) {
  const file = mediaFiles[index];
  if (!file || file.type !== 'video') return;

  currentVideoFile = file;
  mediaIndex = index;
  videoPlayer.src = mediaUrl(file.id, 'stream');
  document.getElementById('playerFilename').textContent = file.name;
  playerCounter.textContent = `${mediaIndex + 1} / ${mediaFiles.length}`;

  const fav = document.getElementById('playerFav');
  fav.innerHTML = favoriteIds.has(file.id) ? '&#9829;' : '&#9825;';
  fav.style.color = favoriteIds.has(file.id) ? 'var(--heart)' : '';

  playerOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  videoPlayer.play().catch(() => {});
}

// Also support opening player directly (e.g., from browse click)
function openPlayer(file) {
  mediaFiles = currentFiles.slice();
  const idx = mediaFiles.findIndex((f) => f.id === file.id);
  mediaIndex = idx >= 0 ? idx : 0;
  openPlayerAtIndex(mediaIndex);
}

function closePlayer() {
  videoPlayer.pause();
  videoPlayer.src = '';
  playerOverlay.style.display = 'none';
  document.body.style.overflow = '';
  currentVideoFile = null;
}

// Silent close — no body overflow reset (used when switching to viewer)
function closePlayerSilent() {
  videoPlayer.pause();
  videoPlayer.src = '';
  playerOverlay.style.display = 'none';
  currentVideoFile = null;
}

function playerPrev() {
  if (mediaIndex > 0) {
    videoPlayer.pause();
    videoPlayer.src = '';
    mediaIndex--;
    showMediaAtIndex(); // from viewer.js — handles image/video switch
  }
}

function playerNext() {
  if (mediaIndex < mediaFiles.length - 1) {
    videoPlayer.pause();
    videoPlayer.src = '';
    mediaIndex++;
    showMediaAtIndex();
  }
}

document.getElementById('playerClose').addEventListener('click', closePlayer);
document.getElementById('playerPrev').addEventListener('click', playerPrev);
document.getElementById('playerNext').addEventListener('click', playerNext);

document.getElementById('playerFav').addEventListener('click', () => {
  if (currentVideoFile) {
    toggleFavorite(currentVideoFile.id, document.getElementById('playerFav'));
  }
});

document.getElementById('playerInfo').addEventListener('click', () => {
  if (currentVideoFile) showFileInfo(currentVideoFile.id);
});

document.getElementById('playerDelete').addEventListener('click', () => {
  if (currentVideoFile && confirm(`Delete "${currentVideoFile.name}"? It will be moved to trash.`)) {
    deleteMediaFile(currentVideoFile.id);
  }
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (playerOverlay.style.display === 'none') return;
  // Don't handle arrows when seek is intended (video playing)
  if (e.key === 'Escape') { closePlayer(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); playerPrev(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); playerNext(); return; }
  if (e.key === 'ArrowRight') { seekVideo(10); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { seekVideo(-10); e.preventDefault(); }
  if (e.key === ' ') {
    e.preventDefault();
    if (videoPlayer.paused) videoPlayer.play();
    else videoPlayer.pause();
  }
});

function seekVideo(seconds) {
  videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration, videoPlayer.currentTime + seconds));
  showSeekIndicator(seconds > 0 ? `+${seconds}s` : `${seconds}s`, seconds > 0 ? 'right' : 'left');
}

function showSeekIndicator(text, side) {
  seekIndicator.textContent = text;
  seekIndicator.style.display = 'block';
  seekIndicator.style.left = side === 'left' ? '20%' : '';
  seekIndicator.style.right = side === 'right' ? '20%' : '';
  seekIndicator.style.animation = 'none';
  seekIndicator.offsetHeight; // trigger reflow
  seekIndicator.style.animation = 'fadeOut 0.6s forwards';
}

// Touch: swipe for prev/next (on non-video areas)
const playerContainer = document.querySelector('.player-container');
let playerTouchStartX = 0;
let playerTouchStartY = 0;

playerContainer.addEventListener('touchstart', (e) => {
  playerTouchStartX = e.touches[0].clientX;
  playerTouchStartY = e.touches[0].clientY;
}, { passive: true });

playerContainer.addEventListener('touchend', (e) => {
  if (e.target.closest('video') || e.target.closest('.player-toolbar')) return;
  const dx = e.changedTouches[0].clientX - playerTouchStartX;
  const dy = e.changedTouches[0].clientY - playerTouchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
    if (dx > 0) playerPrev();
    else playerNext();
  }
});
