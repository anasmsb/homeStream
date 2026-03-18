// Pagination
function renderPagination(paginationData, containerId, customCallback) {
  const container = document.getElementById(containerId);
  if (!paginationData || paginationData.totalPages <= 1 || paginationData.limit === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  const { page, totalPages, total } = paginationData;

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Prev';
  prevBtn.disabled = page <= 1;
  prevBtn.addEventListener('click', () => goToPage(page - 1, customCallback));
  container.appendChild(prevBtn);

  // Page numbers
  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  if (startPage > 1) {
    container.appendChild(createPageBtn(1, page, customCallback));
    if (startPage > 2) {
      const dots = document.createElement('span');
      dots.className = 'page-info';
      dots.textContent = '...';
      container.appendChild(dots);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    container.appendChild(createPageBtn(i, page, customCallback));
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement('span');
      dots.className = 'page-info';
      dots.textContent = '...';
      container.appendChild(dots);
    }
    container.appendChild(createPageBtn(totalPages, page, customCallback));
  }

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  nextBtn.disabled = page >= totalPages;
  nextBtn.addEventListener('click', () => goToPage(page + 1, customCallback));
  container.appendChild(nextBtn);

  // Info
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `${total} items`;
  container.appendChild(info);
}

function createPageBtn(pageNum, currentPage, customCallback) {
  const btn = document.createElement('button');
  btn.textContent = pageNum;
  btn.className = pageNum === currentPage ? 'active' : '';
  btn.addEventListener('click', () => goToPage(pageNum, customCallback));
  return btn;
}

function goToPage(page, customCallback) {
  currentPage = page;
  if (customCallback) {
    customCallback(page);
  } else {
    loadCurrentView();
  }
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
