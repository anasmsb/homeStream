// Search
const searchInput = document.getElementById('searchInput');
let searchDebounce = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const query = searchInput.value.trim();

  if (!query) {
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('contentGrid').style.display = '';
    document.getElementById('pagination').style.display = '';
    return;
  }

  searchDebounce = setTimeout(() => performSearch(query), 300);
});

async function performSearch(query, page = 1) {
  try {
    const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}&limit=${pageSize}`);
    if (!res) return;
    const data = await res.json();

    document.getElementById('contentGrid').style.display = 'none';
    document.getElementById('pagination').style.display = 'none';
    const searchResults = document.getElementById('searchResults');
    searchResults.style.display = '';

    const grid = document.getElementById('searchGrid');
    grid.innerHTML = '';

    currentFiles = data.files;
    for (const file of data.files) {
      const card = createFileCard(file, true);
      grid.appendChild(card);
    }

    if (data.files.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>No results found</p></div>';
    }

    renderPagination(data.pagination, 'searchPagination', (p) => performSearch(query, p));
  } catch (err) {
    console.error('Search error:', err);
  }
}
