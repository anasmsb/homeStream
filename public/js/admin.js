// Admin Panel
if (!checkAuth()) throw new Error('Not authenticated');
const user = getUser();
if (user.role !== 'admin') {
  window.location.href = '/browse';
  throw new Error('Not admin');
}

document.getElementById('currentUser').textContent = user.username;
document.getElementById('currentRole').textContent = user.role;
document.getElementById('logoutBtn').addEventListener('click', logout);

// Mobile sidebar
document.getElementById('sidebarOpen').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
document.getElementById('sidebarClose').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

// --- Tab Navigation ---
const tabs = { users: 'usersTab', trash: 'trashTab' };
document.querySelectorAll('.nav-item[data-tab]').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = item.dataset.tab;
    document.querySelectorAll('.nav-item[data-tab]').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
    Object.values(tabs).forEach((id) => document.getElementById(id).style.display = 'none');
    document.getElementById(tabs[tab]).style.display = '';
    document.getElementById('pageTitle').textContent = tab === 'users' ? 'User Management' : 'Trash';
    if (tab === 'trash') loadTrash();
  });
});

// --- Role Helpers ---
const ROLE_META = {
  admin: { label: 'Admin', icon: '&#9881;', color: '#6366f1', desc: 'Full access' },
  uploader: { label: 'Uploader', icon: '&#8679;', color: '#22c55e', desc: 'View + Upload' },
  viewer: { label: 'Viewer', icon: '&#128065;', color: '#64748b', desc: 'View only' },
};

// --- Users ---
let editingUserId = null;

async function loadUsers() {
  const res = await apiFetch('/api/admin/users');
  if (!res) return;
  const data = await res.json();

  const container = document.getElementById('userCards');
  container.innerHTML = '';

  for (const u of data.users) {
    const meta = ROLE_META[u.role] || ROLE_META.viewer;
    const isSelf = u.id === user.id;

    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
      <div class="user-card-header">
        <div class="user-avatar" style="background:${meta.color}">${u.username[0].toUpperCase()}</div>
        <div class="user-card-info">
          <span class="user-card-name">${escapeHtml(u.username)}${isSelf ? ' <span class="badge badge-muted">You</span>' : ''}</span>
          <span class="user-card-role"><span class="role-badge" style="--role-color:${meta.color}">${meta.icon} ${meta.label}</span></span>
        </div>
      </div>
      <div class="user-card-meta">
        Joined ${new Date(u.created_at).toLocaleDateString()}
      </div>
      <div class="user-card-actions">
        <button class="btn btn-sm edit-btn" data-id="${u.id}">Edit</button>
        ${u.role !== 'admin' ? `<button class="btn btn-sm perm-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}">Permissions</button>` : ''}
        ${!isSelf ? `<button class="btn btn-sm btn-danger del-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}">Delete</button>` : ''}
      </div>
    `;
    container.appendChild(card);
  }

  // Bind events
  container.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u2 = data.users.find((x) => x.id === parseInt(btn.dataset.id));
      openEditModal(u2);
    });
  });
  container.querySelectorAll('.perm-btn').forEach((btn) => {
    btn.addEventListener('click', () => openPermissions(btn.dataset.id, btn.dataset.username));
  });
  container.querySelectorAll('.del-btn').forEach((btn) => {
    btn.addEventListener('click', () => confirmAction(
      'Delete User',
      `Are you sure you want to delete "${btn.dataset.username}"? This will remove all their favorites and permissions.`,
      () => deleteUser(btn.dataset.id)
    ));
  });
}

// --- User Modal ---
const userModal = document.getElementById('userModal');
const userForm = document.getElementById('userForm');

document.getElementById('showCreateForm').addEventListener('click', () => openCreateModal());
document.getElementById('modalClose').addEventListener('click', () => userModal.style.display = 'none');
document.getElementById('modalCancel').addEventListener('click', () => userModal.style.display = 'none');

function openCreateModal() {
  editingUserId = null;
  document.getElementById('modalTitle').textContent = 'New User';
  document.getElementById('formUsername').value = '';
  document.getElementById('formUsername').disabled = false;
  document.getElementById('formPassword').value = '';
  document.getElementById('formPassword').required = true;
  document.getElementById('passwordLabel').textContent = 'Password';
  document.getElementById('formSubmit').textContent = 'Create User';
  document.querySelector('input[name="role"][value="viewer"]').checked = true;
  userModal.style.display = '';
}

function openEditModal(u) {
  editingUserId = u.id;
  document.getElementById('modalTitle').textContent = `Edit: ${u.username}`;
  document.getElementById('formUsername').value = u.username;
  document.getElementById('formUsername').disabled = true;
  document.getElementById('formPassword').value = '';
  document.getElementById('formPassword').required = false;
  document.getElementById('passwordLabel').textContent = 'New Password (leave blank to keep)';
  document.getElementById('formSubmit').textContent = 'Save Changes';
  const roleInput = document.querySelector(`input[name="role"][value="${u.role}"]`);
  if (roleInput) roleInput.checked = true;
  userModal.style.display = '';
}

userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('formUsername').value.trim();
  const password = document.getElementById('formPassword').value;
  const role = document.querySelector('input[name="role"]:checked').value;

  try {
    if (editingUserId) {
      const body = { role };
      if (password) body.password = password;
      const res = await apiFetch(`/api/admin/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res || !res.ok) {
        const err = await res.json();
        return alert(err.error || 'Update failed');
      }
    } else {
      if (!username) return alert('Username required');
      if (!password) return alert('Password required');
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      });
      if (!res || !res.ok) {
        const err = await res.json();
        return alert(err.error || 'Create failed');
      }
    }
    userModal.style.display = 'none';
    loadUsers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

async function deleteUser(id) {
  const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  if (res && res.ok) loadUsers();
  else {
    const err = await res.json();
    alert(err.error || 'Delete failed');
  }
}

// --- Permissions Modal ---
let permUserId = null;
const permModal = document.getElementById('permModal');

document.getElementById('permClose').addEventListener('click', () => permModal.style.display = 'none');
document.getElementById('permCancel').addEventListener('click', () => permModal.style.display = 'none');

async function openPermissions(userId, username) {
  permUserId = userId;
  document.getElementById('permUserName').textContent = username;
  permModal.style.display = '';

  const [foldersRes, permsRes] = await Promise.all([
    apiFetch('/api/admin/folders'),
    apiFetch(`/api/admin/users/${userId}/permissions`),
  ]);
  if (!foldersRes || !permsRes) return;

  const foldersData = await foldersRes.json();
  const permsData = await permsRes.json();
  const currentPerms = new Set(permsData.permissions);

  const tree = document.getElementById('permissionsTree');
  tree.innerHTML = '';

  if (foldersData.folders.length === 0) {
    tree.innerHTML = '<p class="text-muted" style="font-size:13px">No folders in media directory yet.</p>';
    return;
  }

  for (const folder of foldersData.folders) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = folder.relPath;
    cb.checked = currentPerms.has(folder.relPath);
    const depth = folder.relPath.split('/').length - 1;
    label.style.paddingLeft = (depth * 20) + 'px';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + folder.relPath));
    tree.appendChild(label);
  }
}

document.getElementById('permSave').addEventListener('click', async () => {
  const checkboxes = document.querySelectorAll('#permissionsTree input[type="checkbox"]:checked');
  const folders = Array.from(checkboxes).map((cb) => cb.value);

  const res = await apiFetch(`/api/admin/users/${permUserId}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folders }),
  });
  if (res && res.ok) {
    permModal.style.display = 'none';
  }
});

// --- Trash ---
async function loadTrash() {
  const res = await apiFetch('/api/delete/trash');
  if (!res) return;
  const data = await res.json();

  const tbody = document.getElementById('trashTableBody');
  const emptyState = document.getElementById('trashEmpty');
  const info = document.getElementById('trashInfo');

  if (data.files.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = '';
    info.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  const totalSize = data.files.reduce((sum, f) => sum + (f.file_size || 0), 0);
  info.textContent = `${data.files.length} file(s), ${formatSize(totalSize)} total`;

  tbody.innerHTML = '';
  for (const f of data.files) {
    const daysLeft = Math.max(0, Math.ceil((new Date(f.purge_after) - Date.now()) / (1000 * 60 * 60 * 24)));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="trash-filename">${escapeHtml(f.file_name)}</span>
        <span class="trash-path">${escapeHtml(f.original_path)}</span>
      </td>
      <td>${formatSize(f.file_size)}</td>
      <td>${f.deleted_by_name || 'Unknown'}</td>
      <td>${new Date(f.deleted_at).toLocaleDateString()}</td>
      <td><span class="badge ${daysLeft <= 3 ? 'badge-danger' : 'badge-muted'}">${daysLeft} days left</span></td>
      <td class="admin-actions">
        <button class="btn btn-sm restore-btn" data-id="${f.id}">Restore</button>
        <button class="btn btn-sm btn-danger purge-btn" data-id="${f.id}" data-name="${escapeHtml(f.file_name)}">Delete Now</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.restore-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res2 = await apiFetch(`/api/delete/restore/${btn.dataset.id}`, { method: 'POST' });
      if (res2 && res2.ok) loadTrash();
      else {
        const err = await res2.json();
        alert(err.error || 'Restore failed');
      }
    });
  });

  tbody.querySelectorAll('.purge-btn').forEach((btn) => {
    btn.addEventListener('click', () => confirmAction(
      'Permanently Delete',
      `Are you sure you want to permanently delete "${btn.dataset.name}"? This cannot be undone.`,
      async () => {
        const res2 = await apiFetch(`/api/delete/purge/${btn.dataset.id}`, { method: 'DELETE' });
        if (res2 && res2.ok) loadTrash();
      }
    ));
  });
}

// --- Confirm Dialog ---
let confirmCallback = null;
const confirmModal = document.getElementById('confirmModal');

function confirmAction(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  confirmModal.style.display = '';
}

document.getElementById('confirmClose').addEventListener('click', () => confirmModal.style.display = 'none');
document.getElementById('confirmNo').addEventListener('click', () => confirmModal.style.display = 'none');
document.getElementById('confirmYes').addEventListener('click', async () => {
  confirmModal.style.display = 'none';
  if (confirmCallback) await confirmCallback();
  confirmCallback = null;
});

// --- Helpers ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Init
loadUsers();
