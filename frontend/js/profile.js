// Own-profile UI shared by desktop.html and mobile.html.
let pendingProfileAvatar = null;

function profileAvatarUrl(user) {
  if (!user?.hasAvatar) return '';
  const version = user.avatarUpdatedAt ? new Date(user.avatarUpdatedAt).getTime() : Date.now();
  return `/api/profile/avatar/${user.id}?v=${version}`;
}

function setAvatarFallback(container, user) {
  SafeDOM.clear(container);
  container.textContent = (user?.name || '?').charAt(0).toUpperCase();
}

function applyProfileAvatarToHeader(user) {
  const container = document.getElementById('header-avatar');
  if (!container) return;
  setAvatarFallback(container, user);
  const source = profileAvatarUrl(user);
  if (!source) return;

  const image = SafeDOM.el('img', { className: 'avatar-header-img', attrs: { alt: '' } });
  image.addEventListener('error', () => setAvatarFallback(container, user), { once: true });
  if (SafeDOM.setSafeImageSource(image, source)) container.replaceChildren(image);
}

function showProfileAvatarStatus(message, isError = false) {
  const status = document.getElementById('profile-avatar-status');
  if (!status) return;
  status.textContent = message;
  status.className = isError ? 'form-error' : 'form-success';
  status.setAttribute('role', isError ? 'alert' : 'status');
}

function resetProfileAvatarSelection() {
  pendingProfileAvatar = null;
  const saveButton = document.getElementById('btn-save-avatar');
  if (saveButton) saveButton.disabled = true;
  document.getElementById('profile-avatar-crop-controls')?.classList.add('hidden');
  const fileInput = document.getElementById('profile-avatar-file');
  if (fileInput) fileInput.value = '';
}

function showProfileAvatar(user) {
  const fallback = document.getElementById('profile-modal-avatar-preview');
  const image = document.getElementById('profile-modal-avatar-img');
  if (!fallback || !image) return;
  fallback.textContent = (user?.name || '?').charAt(0).toUpperCase();
  fallback.classList.remove('hidden');
  image.classList.add('hidden');
  image.removeAttribute('src');
  const removeButton = document.getElementById('btn-remove-avatar');
  if (removeButton) removeButton.disabled = !user?.hasAvatar;

  const source = profileAvatarUrl(user);
  if (!source) return;
  image.addEventListener('error', () => {
    image.classList.add('hidden');
    fallback.classList.remove('hidden');
  }, { once: true });
  if (SafeDOM.setSafeImageSource(image, source)) {
    image.classList.remove('hidden');
    fallback.classList.add('hidden');
  }
}

function openEditProfileModal() {
  const user = API.getCurrentUser();
  if (!user) return;
  document.getElementById('profile-new-name').value = user.name || '';
  document.getElementById('profile-email-readonly').value = user.email || '';
  document.getElementById('profile-role-readonly').value = user.role === 'personal' ? 'Personal Trainer' : 'Aluno';
  document.getElementById('edit-profile-password-form').reset();
  clearFormError('edit-profile-name-form');
  clearFormError('edit-profile-password-form');
  resetProfileAvatarSelection();
  showProfileAvatar(user);
  showProfileAvatarStatus('');
  switchProfileTab('name');
  openModal('modal-edit-profile');
  lucide.createIcons();
}

function switchProfileTab(tab) {
  if (!['name', 'password'].includes(tab)) return;
  for (const name of ['name', 'password']) {
    const active = name === tab;
    const button = document.getElementById(`profile-tab-${name}`);
    const panel = document.getElementById(`profile-panel-${name}`);
    button?.classList.toggle('active', active);
    button?.setAttribute('aria-selected', String(active));
    if (button) button.tabIndex = active ? 0 : -1;
    if (panel) panel.hidden = !active;
  }
}

async function handleUpdateProfileName(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  const name = document.getElementById('profile-new-name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return setFormError(form.id, 'O nome deve ter pelo menos 2 caracteres.');

  clearFormError(form.id);
  setFormSubmitting(form, true);
  try {
    const { user } = await API.patch('/profile', { name });
    API.saveSession(user);
    document.getElementById('header-user-name').textContent = user.name;
    document.getElementById('profile-modal-avatar-preview').textContent = user.name.charAt(0).toUpperCase();
    applyProfileAvatarToHeader(user);
    showToast('Nome atualizado com sucesso!', 'success');
  } catch (error) {
    setFormError(form.id, error.message);
  } finally {
    setFormSubmitting(form, false);
  }
}

async function handleUpdateProfilePassword(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  const currentPassword = document.getElementById('profile-current-password').value;
  const newPassword = document.getElementById('profile-new-password').value;
  const confirmation = document.getElementById('profile-confirm-password').value;
  if (!currentPassword || !newPassword || !confirmation) return setFormError(form.id, 'Preencha todos os campos de senha.');
  if (newPassword !== confirmation) return setFormError(form.id, 'As novas senhas não coincidem.');
  if (newPassword.length < 10) return setFormError(form.id, 'A nova senha deve ter pelo menos 10 caracteres.');

  clearFormError(form.id);
  setFormSubmitting(form, true);
  try {
    await API.put('/profile/password', { currentPassword, newPassword });
    form.reset();
    showToast('Senha alterada; as outras sessões foram encerradas.', 'success');
  } catch (error) {
    setFormError(form.id, error.message);
  } finally {
    setFormSubmitting(form, false);
  }
}

function drawProfileAvatarCrop() {
  if (!pendingProfileAvatar) return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const zoom = Number(document.getElementById('profile-avatar-zoom').value);
  const positionX = Number(document.getElementById('profile-avatar-x').value) / 100;
  const positionY = Number(document.getElementById('profile-avatar-y').value) / 100;
  const scale = Math.max(size / pendingProfileAvatar.naturalWidth, size / pendingProfileAvatar.naturalHeight) * zoom;
  const width = pendingProfileAvatar.naturalWidth * scale;
  const height = pendingProfileAvatar.naturalHeight * scale;
  canvas.getContext('2d').drawImage(pendingProfileAvatar, (size - width) * positionX, (size - height) * positionY, width, height);
  return canvas;
}

function renderProfileAvatarCrop() {
  const canvas = drawProfileAvatarCrop();
  if (!canvas) return;
  const image = document.getElementById('profile-modal-avatar-img');
  image.src = canvas.toDataURL('image/webp', 0.82);
  image.classList.remove('hidden');
  document.getElementById('profile-modal-avatar-preview').classList.add('hidden');
}

function handleAvatarFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    event.target.value = '';
    return showProfileAvatarStatus('Selecione JPEG, PNG ou WebP de até 5 MB.', true);
  }
  const reader = new FileReader();
  reader.onerror = () => showProfileAvatarStatus('Não foi possível ler a imagem.', true);
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096) return showProfileAvatarStatus('A imagem deve ter no máximo 4096 × 4096 px.', true);
      pendingProfileAvatar = image;
      for (const id of ['profile-avatar-zoom', 'profile-avatar-x', 'profile-avatar-y']) document.getElementById(id).value = id.endsWith('zoom') ? '1' : '50';
      document.getElementById('profile-avatar-crop-controls').classList.remove('hidden');
      document.getElementById('btn-save-avatar').disabled = false;
      renderProfileAvatarCrop();
      showProfileAvatarStatus('Ajuste o recorte e salve a foto.');
    };
    image.onerror = () => showProfileAvatarStatus('O arquivo não contém uma imagem válida.', true);
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function canvasToProfileDataUrl(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) return reject(new Error('Não foi possível processar a foto.'));
    if (blob.size > 400000) return reject(new Error('A foto processada excedeu 400 KB.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível preparar a foto.'));
    reader.readAsDataURL(blob);
  }, 'image/webp', 0.82));
}

async function handleSaveAvatar() {
  const canvas = drawProfileAvatarCrop();
  if (!canvas) return;
  const button = document.getElementById('btn-save-avatar');
  button.disabled = true;
  try {
    const imageDataUrl = await canvasToProfileDataUrl(canvas);
    const { user } = await API.put('/profile/avatar', { imageDataUrl });
    API.saveSession(user);
    resetProfileAvatarSelection();
    showProfileAvatar(user);
    applyProfileAvatarToHeader(user);
    showProfileAvatarStatus('Foto de perfil atualizada.');
    showToast('Foto de perfil atualizada!', 'success');
  } catch (error) {
    button.disabled = false;
    showProfileAvatarStatus(error.message, true);
  }
}

async function handleRemoveAvatar() {
  const button = document.getElementById('btn-remove-avatar');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await API.delete('/profile/avatar');
    const user = { ...API.getCurrentUser(), hasAvatar: false, avatarUpdatedAt: null };
    API.saveSession(user);
    resetProfileAvatarSelection();
    showProfileAvatar(user);
    applyProfileAvatarToHeader(user);
    showProfileAvatarStatus('Foto removida.');
    showToast('Foto de perfil removida.', 'success');
  } catch (error) {
    showProfileAvatarStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}
