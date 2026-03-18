function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return false;
  }
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 < Date.now()) {
      logout();
      return false;
    }
  } catch {
    logout();
    return false;
  }
  return true;
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  if (!token) { logout(); return null; }

  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  };

  const res = await fetch(url, options);
  if (res.status === 401) {
    logout();
    return null;
  }
  return res;
}

function mediaUrl(fileId, type) {
  const token = getToken();
  return `/api/media/${fileId}/${type}?token=${encodeURIComponent(token)}`;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
