// Favorites
async function toggleFavorite(fileId, btnElement) {
  const isFav = favoriteIds.has(fileId);

  try {
    if (isFav) {
      await apiFetch(`/api/favorites/${fileId}`, { method: 'DELETE' });
      favoriteIds.delete(fileId);
    } else {
      await apiFetch(`/api/favorites/${fileId}`, { method: 'POST' });
      favoriteIds.add(fileId);
    }

    // Update button
    if (btnElement) {
      btnElement.innerHTML = favoriteIds.has(fileId) ? '&#9829;' : '&#9825;';
      btnElement.classList.toggle('active', favoriteIds.has(fileId));
      btnElement.style.color = favoriteIds.has(fileId) ? 'var(--heart)' : '';
    }

    // Update all visible favorite buttons for this file
    document.querySelectorAll('.card-fav').forEach((btn) => {
      // We'll rely on the card's data
    });
  } catch (err) {
    console.error('Favorite error:', err);
  }
}

async function loadFavorites(append) {
  if (!append) showLoading(true);
  await loadFavoritesCheck();

  const isInfinite = pageSize === 0;
  const effectiveLimit = isInfinite ? SCROLL_BATCH : pageSize;
  const effectivePage = isInfinite ? infinitePage : currentPage;

  try {
    const res = await apiFetch(`/api/favorites?page=${effectivePage}&limit=${effectiveLimit}`);
    if (!res) return;
    const data = await res.json();

    renderBreadcrumbs([{ id: null, name: 'Favorites' }]);

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
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9829;</div><p>No favorites yet</p></div>';
    }

    if (isInfinite) {
      document.getElementById('pagination').style.display = 'none';
      infiniteHasMore = effectivePage < data.pagination.totalPages;
      infiniteLoading = false;
    } else {
      renderPagination(data.pagination, 'pagination');
    }
  } catch (err) {
    console.error('Load favorites error:', err);
    infiniteLoading = false;
  }
  if (!append) showLoading(false);
}
