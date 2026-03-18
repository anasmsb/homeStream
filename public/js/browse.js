// State
let currentView = 'folders'; // folders, all, favorites, search
let currentFolderId = null;
let currentFiles = [];
let favoriteIds = new Set();
let currentPage = 1;
let pageSize = parseInt(localStorage.getItem('pageSize') || '50');

// Infinite scroll state
const SCROLL_BATCH = 20;
let infiniteLoading = false;
let infiniteHasMore = false;
let infinitePage = 1;

// Init
if (!checkAuth()) throw new Error('Not authenticated');

const user = getUser();
document.getElementById('currentUser').textContent = user.username;
document.getElementById('currentRole').textContent = user.role;

if (user.role === 'admin') {
  document.getElementById('navAdmin').style.display = '';
}

// Hide upload button for viewers
if (user.role === 'viewer') {
  document.getElementById('uploadBtn').style.display = 'none';
}

// Page size
const pageSizeSelect = document.getElementById('pageSizeSelect');
pageSizeSelect.value = pageSize.toString();
pageSizeSelect.addEventListener('change', () => {
  pageSize = parseInt(pageSizeSelect.value);
  localStorage.setItem('pageSize', pageSize.toString());
  currentPage = 1;
  infinitePage = 1;
  infiniteHasMore = false;
  loadCurrentView();
});

// Sidebar navigation
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const view = item.dataset.view;
    if (view === 'admin') {
      window.location.href = '/admin';
      return;
    }
    setView(view);
  });
});

// Sidebar mobile toggle
document.getElementById('sidebarOpen').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', logout);

function setView(view) {
  currentView = view;
  currentPage = 1;
  infinitePage = 1;
  infiniteHasMore = false;
  currentFolderId = null;
  document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('contentGrid').style.display = '';
  loadCurrentView();
}

function loadCurrentView() {
  switch (currentView) {
    case 'folders': loadFolder(currentFolderId); break;
    case 'all': loadAllFiles(); break;
    case 'favorites': loadFavorites(); break;
  }
}

// Load favorites list
async function loadFavoritesCheck() {
  try {
    const res = await apiFetch('/api/favorites/check');
    if (!res) return;
    const data = await res.json();
    favoriteIds = new Set(data.favoriteIds);
  } catch { /* ignore */ }
}

// Load folder
async function loadFolder(folderId, append) {
  if (!append) showLoading(true);
  await loadFavoritesCheck();

  const isInfinite = pageSize === 0;
  const effectiveLimit = isInfinite ? SCROLL_BATCH : pageSize;
  const effectivePage = isInfinite ? infinitePage : currentPage;

  const url = folderId
    ? `/api/folders/${folderId}?page=${effectivePage}&limit=${effectiveLimit}`
    : `/api/folders?page=${effectivePage}&limit=${effectiveLimit}`;

  try {
    const res = await apiFetch(url);
    if (!res) return;
    const data = await res.json();

    currentFolderId = data.id;
    renderBreadcrumbs(data.breadcrumbs);

    const grid = document.getElementById('contentGrid');
    if (!append) grid.innerHTML = '';

    // Render folders (only on first load)
    if (!append) {
      for (const folder of data.folders) {
        grid.appendChild(createFolderCard(folder));
      }
    }

    // Render files
    if (append) {
      currentFiles = currentFiles.concat(data.files);
    } else {
      currentFiles = data.files;
    }
    for (const file of data.files) {
      grid.appendChild(createFileCard(file));
    }

    if (!append && data.folders.length === 0 && data.files.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128193;</div><p>This folder is empty</p></div>';
    }

    if (isInfinite) {
      document.getElementById('pagination').style.display = 'none';
      infiniteHasMore = effectivePage < data.pagination.totalPages;
      infiniteLoading = false;
    } else {
      renderPagination(data.pagination, 'pagination');
    }
  } catch (err) {
    console.error('Load folder error:', err);
    infiniteLoading = false;
  }
  if (!append) showLoading(false);
}

// Load all files
async function loadAllFiles(append) {
  if (!append) showLoading(true);
  await loadFavoritesCheck();

  const rootRes = await apiFetch('/api/folders');
  if (!rootRes) return;
  const rootData = await rootRes.json();

  const isInfinite = pageSize === 0;
  const effectiveLimit = isInfinite ? SCROLL_BATCH : pageSize;
  const effectivePage = isInfinite ? infinitePage : currentPage;

  const url = `/api/folders/${rootData.id}/all?page=${effectivePage}&limit=${effectiveLimit}`;
  try {
    const res = await apiFetch(url);
    if (!res) return;
    const data = await res.json();

    renderBreadcrumbs([{ id: null, name: 'All Files' }]);

    const grid = document.getElementById('contentGrid');
    if (!append) grid.innerHTML = '';

    if (append) {
      currentFiles = currentFiles.concat(data.files);
    } else {
      currentFiles = data.files;
    }
    for (const file of data.files) {
      grid.appendChild(createFileCard(file, true));
    }

    if (!append && data.files.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128444;</div><p>No files found</p></div>';
    }

    if (isInfinite) {
      document.getElementById('pagination').style.display = 'none';
      infiniteHasMore = effectivePage < data.pagination.totalPages;
      infiniteLoading = false;
    } else {
      renderPagination(data.pagination, 'pagination');
    }
  } catch (err) {
    console.error('Load all error:', err);
    infiniteLoading = false;
  }
  if (!append) showLoading(false);
}

function renderBreadcrumbs(crumbs) {
  const bc = document.getElementById('breadcrumbs');
  bc.innerHTML = '';
  crumbs.forEach((c, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = '/';
      bc.appendChild(sep);
    }
    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    span.textContent = c.name === 'Root' ? 'Home' : c.name;
    if (i < crumbs.length - 1) {
      span.classList.add('clickable');
      span.addEventListener('click', () => {
        currentView = 'folders';
        currentPage = 1;
        currentFolderId = c.id;
        document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
        document.getElementById('navFolders').classList.add('active');
        loadFolder(c.id);
      });
    }
    bc.appendChild(span);
  });
}

function createFolderCard(folder) {
  const card = document.createElement('div');
  card.className = 'card';
  card.addEventListener('click', () => {
    currentView = 'folders';
    currentPage = 1;
    currentFolderId = folder.id;
    loadFolder(folder.id);
  });

  if (folder.thumbFileId) {
    const img = document.createElement('img');
    img.className = 'card-thumb';
    img.src = mediaUrl(folder.thumbFileId, 'thumb');
    img.alt = folder.name;
    img.loading = 'lazy';
    card.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-thumb-placeholder';
    placeholder.textContent = '\u{1F4C1}';
    card.appendChild(placeholder);
  }

  const body = document.createElement('div');
  body.className = 'card-body';
  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = folder.name;
  body.appendChild(name);
  const meta = document.createElement('span');
  meta.className = 'card-meta';
  meta.textContent = `${folder.fileCount} files`;
  body.appendChild(meta);
  card.appendChild(body);

  return card;
}

function createFileCard(file, showFolder) {
  const card = document.createElement('div');
  card.className = 'card';

  // Thumbnail
  const img = document.createElement('img');
  img.className = 'card-thumb';
  img.src = mediaUrl(file.id, 'thumb');
  img.alt = file.name;
  img.loading = 'lazy';
  img.onerror = () => {
    img.style.display = 'none';
    const ph = document.createElement('div');
    ph.className = 'card-thumb-placeholder';
    ph.textContent = file.type === 'video' ? '\u{1F3AC}' : '\u{1F5BC}';
    card.insertBefore(ph, card.firstChild);
  };
  card.appendChild(img);

  // Video preview on hover
  if (file.type === 'video') {
    const badge = document.createElement('span');
    badge.className = 'card-type-badge';
    badge.textContent = 'VIDEO';
    card.appendChild(badge);

    let previewLoaded = false;
    card.addEventListener('mouseenter', () => {
      if (previewLoaded) return;
      previewLoaded = true;
      const vid = document.createElement('video');
      vid.className = 'preview-video';
      vid.src = mediaUrl(file.id, 'preview');
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.addEventListener('loadeddata', () => vid.play());
      card.insertBefore(vid, card.children[1] || null);
    });
  }

  // Card body
  const body = document.createElement('div');
  body.className = 'card-body';
  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = file.name;
  body.appendChild(name);

  // Favorite button
  const fav = document.createElement('button');
  fav.className = 'card-fav' + (favoriteIds.has(file.id) ? ' active' : '');
  fav.innerHTML = favoriteIds.has(file.id) ? '&#9829;' : '&#9825;';
  fav.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(file.id, fav);
  });
  body.appendChild(fav);
  card.appendChild(body);

  // Folder label for "All" and search views
  if (showFolder && file.folderName) {
    const folderLabel = document.createElement('div');
    folderLabel.className = 'card-folder-label';
    folderLabel.textContent = file.folderName;
    card.appendChild(folderLabel);
  }

  // Click handler — unified: openViewer handles both images and videos
  card.addEventListener('click', () => {
    const fileIndex = currentFiles.findIndex((f) => f.id === file.id);
    openViewer(fileIndex >= 0 ? fileIndex : 0);
  });

  return card;
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? '' : 'none';
  if (show) {
    document.getElementById('contentGrid').innerHTML = '';
    document.getElementById('pagination').style.display = 'none';
  }
}

// Navigate to folder (used by search results)
function navigateToFolder(folderId) {
  setView('folders');
  currentFolderId = folderId;
  loadFolder(folderId);
}

// Infinite scroll listener
window.addEventListener('scroll', () => {
  if (pageSize !== 0 || !infiniteHasMore || infiniteLoading) return;
  const scrollBottom = window.innerHeight + window.scrollY;
  if (scrollBottom >= document.body.offsetHeight - 300) {
    infiniteLoading = true;
    infinitePage++;
    switch (currentView) {
      case 'folders': loadFolder(currentFolderId, true); break;
      case 'all': loadAllFiles(true); break;
      case 'favorites': loadFavorites(true); break;
    }
  }
});

// Init: load root folder
loadFolder(null);
