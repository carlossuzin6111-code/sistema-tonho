// FitLife Sync - App Orchestrator & Shell

let lastModalTrigger = null;
let pendingDestructiveAction = null;

const DASHBOARD_TABS = Object.freeze({
  personal: ['students', 'create', 'chat', 'exercises'],
  student: ['workouts', 'measurements', 'chat']
});

function dashboardRoute(role, tab) {
  return `#/${role}/${tab}`;
}

function tabFromDashboardRoute(role) {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/^#\/(personal|student)\/([a-z-]+)$/);
  if (!match || match[1] !== role || !DASHBOARD_TABS[role]?.includes(match[2])) return null;
  return match[2];
}

function updateDashboardRoute(role, tab, historyMode) {
  if (typeof window === 'undefined' || historyMode === 'none') return;
  const route = dashboardRoute(role, tab);
  if (window.location.hash === route) return;
  const method = historyMode === 'replace' ? 'replaceState' : 'pushState';
  window.history[method]({ role, tab }, '', route);
}

const modalFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const tabGroups = [
  { buttons: ['tab-btn-login', 'tab-btn-register'], panels: ['login-form', 'register-form'] },
  { buttons: ['nav-p-students', 'nav-p-create', 'nav-p-chat', 'nav-p-exercises'], panels: ['tab-p-students', 'tab-p-create', 'tab-p-chat', 'tab-p-exercises'] },
  { buttons: ['nav-s-workouts', 'nav-s-measurements', 'nav-s-chat'], panels: ['tab-s-workouts', 'tab-s-measurements', 'tab-s-chat'] },
  { buttons: ['modal-tab-workouts', 'modal-tab-metrics'], panels: ['modal-subpane-workouts', 'modal-subpane-metrics'] }
];

function syncTabGroup(buttonIds, panelIds, activeButtonId) {
  buttonIds.forEach((buttonId, index) => {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelIds[index]);
    if (!button || !panel) return;
    const active = buttonId === activeButtonId;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = !active;
  });
}

function configureTabGroups() {
  tabGroups.forEach(group => {
    const active = group.buttons.find(id => document.getElementById(id)?.classList.contains('active')) || group.buttons[0];
    syncTabGroup(group.buttons, group.panels, active);
  });
}

function configureAccessibleModal(modal) {
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-hidden', modal.classList.contains('active') ? 'false' : 'true');
  modal.setAttribute('tabindex', '-1');

  const title = modal.querySelector('.modal-title, h1, h2, h3, #modal-student-name');
  if (title) {
    if (!title.id) title.id = `${modal.id}-title`;
    modal.setAttribute('aria-labelledby', title.id);
  } else {
    modal.setAttribute('aria-label', 'Janela de diálogo');
  }

  modal.querySelectorAll('[data-action="close-modal"]').forEach(button => {
    if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Fechar janela');
  });
}

function getModalFocusableElements(modal) {
  return Array.from(modal.querySelectorAll(modalFocusableSelector)).filter(element => {
    return !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(configureAccessibleModal);
  configureTabGroups();

  // Check and apply theme
  const savedTheme = localStorage.getItem('fitlife_theme');
  const icon = document.getElementById('theme-toggle-icon');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (icon) icon.setAttribute('data-lucide', 'sun');
  } else {
    document.body.classList.remove('dark-theme');
    if (icon) icon.setAttribute('data-lucide', 'moon');
  }

  const verificationToken = new URLSearchParams(window.location.search).get('token');
  if (verificationToken) {
    API.post('/auth/verify-email', { token: verificationToken })
      .then(() => showToast('E-mail confirmado com sucesso.', 'success'))
      .catch(error => showToast(error.message || 'Não foi possível confirmar o e-mail.', 'error'));
  }

  // Check if session exists
  checkAuthSession();
  
  // Render Lucide icons
  lucide.createIcons();
});

// Toast system
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  toastMessage.textContent = message;
  toast.className = `toast glass active ${type}`;
  
  // Configure icon
  if (type === 'success') {
    toastIcon.setAttribute('data-lucide', 'check-circle');
  } else if (type === 'error') {
    toastIcon.setAttribute('data-lucide', 'alert-circle');
  } else {
    toastIcon.setAttribute('data-lucide', 'info');
  }
  lucide.createIcons();

  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

function renderLoadingSkeletons(container, { count = 3, variant = 'card', label = 'Carregando conteúdo' } = {}) {
  SafeDOM.clear(container);
  container.setAttribute('role', 'status');
  container.setAttribute('aria-label', label);
  container.setAttribute('aria-busy', 'true');
  for (let index = 0; index < count; index += 1) {
    container.appendChild(SafeDOM.el('div', { className: `skeleton-card skeleton-${variant}`, attrs: { 'aria-hidden': 'true' } }, [
      SafeDOM.el('div', { className: 'skeleton-line skeleton-line-title' }),
      SafeDOM.el('div', { className: 'skeleton-line' }),
      SafeDOM.el('div', { className: 'skeleton-line skeleton-line-short' })
    ]));
  }
}

function finishLoadingState(container) {
  container.removeAttribute('role');
  container.removeAttribute('aria-label');
  container.setAttribute('aria-busy', 'false');
}

function appendEmptyStateAction(container, { label, icon, onClick }) {
  const emptyState = container.querySelector('.chat-empty-state');
  if (!emptyState) return;
  emptyState.appendChild(SafeDOM.el('button', {
    className: 'btn btn-primary empty-state-action',
    on: { click: onClick }
  }, [SafeDOM.icon(icon), ` ${label}`]));
  lucide.createIcons();
}

// Modal management
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    lastModalTrigger = document.activeElement;
    configureAccessibleModal(modal);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const focusTarget = getModalFocusableElements(modal)[0] || modal;
    focusTarget.focus();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    if (modal.dataset.passwordRequired === 'true') return;
    const returnModalId = modal.dataset.returnModal;
    const formId = modal.dataset.clearFormOnClose;
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    if (lastModalTrigger && lastModalTrigger.isConnected) lastModalTrigger.focus();
    lastModalTrigger = null;
    modal.setAttribute('aria-hidden', 'true');
    if (modalId === 'modal-destructive-confirmation') pendingDestructiveAction = null;
    if (formId) {
      document.getElementById(formId)?.reset();
      clearFormError(formId);
    }
    if (returnModalId) openModal(returnModalId);
  }
}

function openDestructiveConfirmation({ title, message, confirmLabel = 'Excluir', returnModalId = '', action }) {
  const modal = document.getElementById('modal-destructive-confirmation');
  const form = document.getElementById('destructive-confirmation-form');
  const submitButton = form?.querySelector('button[type="submit"]');
  if (!modal || !form || typeof action !== 'function') return;

  if (returnModalId) closeModal(returnModalId);
  modal.dataset.returnModal = returnModalId;
  document.getElementById('destructive-confirmation-title').textContent = title;
  document.getElementById('destructive-confirmation-message').textContent = message;
  submitButton.dataset.defaultLabel = confirmLabel;
  submitButton.querySelector('[data-submit-label]').textContent = confirmLabel;
  clearFormError(form.id);
  pendingDestructiveAction = action;
  openModal(modal.id);
}

function closeDestructiveConfirmation() {
  closeModal('modal-destructive-confirmation');
}

async function handleDestructiveConfirmationSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true' || !pendingDestructiveAction) return;

  clearFormError(form.id);
  setFormSubmitting(form, true);
  let afterClose;
  try {
    afterClose = await pendingDestructiveAction();
  } catch (err) {
    setFormError(form.id, err.message);
    showToast('Não foi possível concluir a exclusão.', 'error');
    return;
  } finally {
    setFormSubmitting(form, false);
  }

  pendingDestructiveAction = null;
  closeDestructiveConfirmation();
  if (typeof afterClose === 'function') {
    try {
      await afterClose();
    } catch (err) {
      showToast(`A exclusão foi concluída, mas a tela não pôde ser atualizada: ${err.message}`, 'error');
    }
  }
}

document.addEventListener('keydown', event => {
  const modal = document.querySelector('.modal-overlay.active');
  if (!modal) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    if (modal.dataset.passwordRequired === 'true') return;
    closeModal(modal.id);
    return;
  }

  if (event.key !== 'Tab') return;

  const focusable = getModalFocusableElements(modal);
  if (!focusable.length) {
    event.preventDefault();
    modal.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Switch Login/Register Tabs
function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-btn-login');
  const tabRegister = document.getElementById('tab-btn-register');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabRegister.setAttribute('aria-selected', 'false');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  } else {
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    tabLogin.setAttribute('aria-selected', 'false');
    tabRegister.setAttribute('aria-selected', 'true');
    formLogin.classList.add('hidden');
    formRegister.classList.remove('hidden');
  }
  syncTabGroup(['tab-btn-login', 'tab-btn-register'], ['login-form', 'register-form'], tab === 'login' ? 'tab-btn-login' : 'tab-btn-register');
}

// Switch Personal Tabs
function switchPersonalTab(tab, { historyMode = 'push' } = {}) {
  if (!DASHBOARD_TABS.personal.includes(tab)) return;
  const tabPaneStudents = document.getElementById('tab-p-students');
  const tabPaneCreate = document.getElementById('tab-p-create');
  const tabPaneChat = document.getElementById('tab-p-chat');
  const tabPaneExercises = document.getElementById('tab-p-exercises');

  const navStudents = document.getElementById('nav-p-students');
  const navCreate = document.getElementById('nav-p-create');
  const navChat = document.getElementById('nav-p-chat');
  const navExercises = document.getElementById('nav-p-exercises');

  tabPaneStudents.classList.remove('active');
  tabPaneCreate.classList.remove('active');
  tabPaneChat.classList.remove('active');
  if (tabPaneExercises) tabPaneExercises.classList.remove('active');

  navStudents.classList.remove('active');
  navCreate.classList.remove('active');
  navChat.classList.remove('active');
  if (navExercises) navExercises.classList.remove('active');

  if (tab === 'students') {
    tabPaneStudents.classList.add('active');
    navStudents.classList.add('active');
    loadPersonalStudents();
  } else if (tab === 'create') {
    tabPaneCreate.classList.add('active');
    navCreate.classList.add('active');
  } else if (tab === 'chat') {
    tabPaneChat.classList.add('active');
    navChat.classList.add('active');
    loadPersonalChatThreads();
  } else if (tab === 'exercises') {
    if (tabPaneExercises) tabPaneExercises.classList.add('active');
    if (navExercises) navExercises.classList.add('active');
    loadPersonalExercises();
  }
  updateDashboardRoute('personal', tab, historyMode);
  syncTabGroup(
    ['nav-p-students', 'nav-p-create', 'nav-p-chat', 'nav-p-exercises'],
    ['tab-p-students', 'tab-p-create', 'tab-p-chat', 'tab-p-exercises'],
    `nav-p-${tab}`
  );
}

// Switch Student Tabs
function switchStudentTab(tab, { historyMode = 'push' } = {}) {
  if (!DASHBOARD_TABS.student.includes(tab)) return;
  const tabPaneWorkouts = document.getElementById('tab-s-workouts');
  const tabPaneMeasurements = document.getElementById('tab-s-measurements');
  const tabPaneChat = document.getElementById('tab-s-chat');

  const navWorkouts = document.getElementById('nav-s-workouts');
  const navMeasurements = document.getElementById('nav-s-measurements');
  const navChat = document.getElementById('nav-s-chat');

  tabPaneWorkouts.classList.remove('active');
  tabPaneMeasurements.classList.remove('active');
  tabPaneChat.classList.remove('active');

  navWorkouts.classList.remove('active');
  navMeasurements.classList.remove('active');
  navChat.classList.remove('active');

  if (tab === 'workouts') {
    tabPaneWorkouts.classList.add('active');
    navWorkouts.classList.add('active');
    loadStudentWorkouts();
  } else if (tab === 'measurements') {
    tabPaneMeasurements.classList.add('active');
    navMeasurements.classList.add('active');
    loadStudentMeasurements();
  } else if (tab === 'chat') {
    tabPaneChat.classList.add('active');
    navChat.classList.add('active');
    loadStudentChat();
  }
  updateDashboardRoute('student', tab, historyMode);
  syncTabGroup(
    ['nav-s-workouts', 'nav-s-measurements', 'nav-s-chat'],
    ['tab-s-workouts', 'tab-s-measurements', 'tab-s-chat'],
    `nav-s-${tab}`
  );
}

document.addEventListener('keydown', event => {
  const tab = event.target.closest?.('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const tablist = tab.closest('[role="tablist"]');
  const tabs = Array.from(tablist?.querySelectorAll('[role="tab"]') || []);
  if (!tabs.length) return;
  event.preventDefault();
  const current = tabs.indexOf(tab);
  const target = event.key === 'Home' ? tabs[0]
    : event.key === 'End' ? tabs[tabs.length - 1]
      : tabs[(current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length];
  target.focus();
  target.click();
});

function restoreDashboardRoute() {
  const user = API.getCurrentUser();
  if (!user || !DASHBOARD_TABS[user.role]) return;
  const tab = tabFromDashboardRoute(user.role);
  if (!tab) return;
  if (user.role === 'personal') switchPersonalTab(tab, { historyMode: 'none' });
  else switchStudentTab(tab, { historyMode: 'none' });
}

if (typeof window !== 'undefined') window.addEventListener('popstate', restoreDashboardRoute);

// Authentication Actions

function setFormSubmitting(form, isSubmitting) {
  const submitButton = form.querySelector('button[type="submit"]');
  const label = submitButton?.querySelector('[data-submit-label]');

  form.dataset.submitting = isSubmitting ? 'true' : 'false';
  form.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
  if (!submitButton) return;

  submitButton.disabled = isSubmitting;
  submitButton.classList.toggle('is-loading', isSubmitting);
  if (label) {
    label.textContent = isSubmitting
      ? submitButton.dataset.loadingLabel
      : submitButton.dataset.defaultLabel;
  }
}

function setFormError(formId, message) {
  const error = document.getElementById(`${formId}-error`);
  if (!error) return;
  error.textContent = message;
  error.classList.remove('hidden');
}

function clearFormError(formId) {
  const error = document.getElementById(`${formId}-error`);
  if (!error) return;
  error.textContent = '';
  error.classList.add('hidden');
}

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.dataset.target);
  if (!input) return;

  const willShow = input.type === 'password';
  input.type = willShow ? 'text' : 'password';
  button.setAttribute('aria-pressed', willShow ? 'true' : 'false');
  button.setAttribute('aria-label', willShow ? 'Ocultar senha' : 'Mostrar senha');

  const icon = button.querySelector('[data-lucide]');
  if (icon) icon.setAttribute('data-lucide', willShow ? 'eye-off' : 'eye');
  lucide.createIcons();
}

// Login Handler
async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true') return;

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  clearFormError(form.id);
  setFormSubmitting(form, true);

  try {
    const data = await API.post('/auth/login', { email, password });
    API.saveSession(data.user);
    await API.saveMobileRefreshToken(data.refreshToken);
    showToast('Login realizado com sucesso!', 'success');
    setupAppShell(data.user);
  } catch (err) {
    setFormError(form.id, err.message);
    showToast(err.message, 'error');
  } finally {
    setFormSubmitting(form, false);
  }
}

// Register Personal Trainer Handler
async function handleRegister(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true') return;

  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const accessKey = document.getElementById('reg-access-key').value;

  if (name.trim() === '' || email.trim() === '' || password.trim() === '' || accessKey.trim() === '') {
    const message = 'Por favor, preencha todos os campos.';
    setFormError(form.id, message);
    showToast(message, 'error');
    return;
  }

  clearFormError(form.id);
  setFormSubmitting(form, true);

  try {
    const data = await API.post('/auth/register', { name, email, password, accessKey });
    API.saveSession(data.user);
    showToast('Conta criada com sucesso!', 'success');
    setupAppShell(data.user);
  } catch (err) {
    setFormError(form.id, err.message);
    showToast(err.message, 'error');
  } finally {
    setFormSubmitting(form, false);
  }
}

// Check session on load
async function checkAuthSession() {
  const cachedUser = API.getCurrentUser();

  if (cachedUser) {
    setupAppShell(cachedUser);
  }

  try {
    const verifiedUser = await API.get('/auth/me');
    API.saveSession(verifiedUser);
    if (!cachedUser
      || cachedUser.mustChangePassword !== verifiedUser.mustChangePassword
      || cachedUser.emailVerified !== verifiedUser.emailVerified) setupAppShell(verifiedUser);
  } catch (err) {
    console.warn('Session expired or invalid.', err.message);
    API.clearSession();
    showLoginScreen();
  }
}

// Setup active UI based on user role
function setupAppShell(user) {
  document.getElementById('login-screen').classList.add('hidden');
  const appScreen = document.getElementById('app-screen');
  appScreen.classList.remove('hidden');

  // Load user data into header
  document.getElementById('header-user-name').textContent = user.name;
  document.getElementById('header-user-email').textContent = user.email;
  document.getElementById('header-avatar').textContent = user.name.charAt(0).toUpperCase();
  if (typeof applyProfileAvatarToHeader === 'function') applyProfileAvatarToHeader(user);

  const roleBadge = document.getElementById('user-role-badge');
  roleBadge.textContent = user.role === 'personal' ? 'Personal Trainer' : 'Aluno';
  roleBadge.className = `role-badge ${user.role}`;

  // Reset dashboards
  document.getElementById('personal-dashboard').classList.add('hidden');
  document.getElementById('student-dashboard').classList.add('hidden');

  if (user.role === 'personal') {
    document.getElementById('personal-dashboard').classList.remove('hidden');
    switchPersonalTab(tabFromDashboardRoute('personal') || 'students', { historyMode: 'replace' });
  } else {
    document.getElementById('student-dashboard').classList.remove('hidden');
    switchStudentTab(tabFromDashboardRoute('student') || 'workouts', { historyMode: 'replace' });
  }

  // Connect to the real-time chat SSE stream
  connectRealTimeUpdates(user);
  if (user.mustChangePassword) {
    window.setTimeout(() => openRequiredPasswordChange(), 0);
  }
  if (user.emailVerified === false && typeof showToast === 'function') {
    showToast('Confirme seu e-mail para habilitar a recuperação de senha.', 'warning');
  }
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  API.disconnectChatStream();
  setChatConnectionStatus('disconnected');
}

async function logout() {
  try {
    await API.post('/auth/logout', {});
    await API.clearMobileRefreshToken();
  } catch (err) {
    console.warn('Server logout failed; clearing local cache.', err.message);
  } finally {
    API.clearSession();
    window.history.replaceState(null, '', window.location.pathname);
    showLoginScreen();
    showToast('Sessão encerrada.', 'info');
  }
}

const CHAT_CONNECTION_LABELS = Object.freeze({
  connecting: 'Conectando...',
  connected: 'Conectado',
  reconnecting: 'Reconectando...',
  offline: 'Sem conexão',
  disconnected: 'Desconectado'
});

function setChatConnectionStatus(status) {
  const normalizedStatus = Object.hasOwn(CHAT_CONNECTION_LABELS, status) ? status : 'offline';
  document.querySelectorAll('[data-chat-status]').forEach(element => {
    element.className = `chat-connection-status ${normalizedStatus}`;
    element.textContent = CHAT_CONNECTION_LABELS[normalizedStatus];
  });
}

function setChatSendState(form, state, message) {
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-chat-send-status]');
  const isSending = state === 'sending';
  button.disabled = isSending;
  button.setAttribute('aria-busy', String(isSending));
  form.dataset.sendState = state;
  button.setAttribute('aria-label', state === 'failed' ? 'Tentar enviar mensagem novamente' : 'Enviar mensagem');
  if (status) status.textContent = message;
}

function resetChatSendFeedback(input) {
  const form = input.closest('.chat-input-form');
  if (form && form.dataset.sendState !== 'sending') setChatSendState(form, 'idle', '');
}

const chatTypingTimers = new WeakMap();
function handleChatTypingInput(input) {
  if (!input || !input.value.trim()) return;
  const receiverId = input.id === 'personal-chat-input'
    ? (typeof activeChatStudentId !== 'undefined' ? activeChatStudentId : null)
    : (typeof personalTrainerId !== 'undefined' ? personalTrainerId : null);
  if (!receiverId) return;
  const previous = chatTypingTimers.get(input);
  if (previous) clearTimeout(previous);
  chatTypingTimers.set(input, setTimeout(() => {
    API.post('/chat/typing', { receiverId }).catch(() => {});
    chatTypingTimers.delete(input);
  }, 350));
}

function renderTypingIndicator(message) {
  if (message?.type !== 'typing') return false;
  const currentUser = API.getCurrentUser();
  if (!currentUser || String(message.senderId) === String(currentUser.id)) return true;
  const targetId = currentUser.role === 'personal' ? 'personal-chat-typing' : 'student-chat-typing';
  const element = document.getElementById(targetId);
  if (!element) return true;
  element.textContent = 'Digitando...';
  element.classList.remove('hidden');
  clearTimeout(element._typingTimeout);
  element._typingTimeout = setTimeout(() => {
    element.textContent = '';
    element.classList.add('hidden');
  }, message.expiresInMs || 3000);
  return true;
}

// EventSource owns its native retry cycle; opening parallel streams here would
// duplicate messages after intermittent network failures.
function connectRealTimeUpdates(user) {
  setChatConnectionStatus(navigator.onLine ? 'connecting' : 'offline');
  API.connectChatStream((message) => {
    if (renderTypingIndicator(message)) return;
    // 1. Check if active window is chat, and append message
    if (user.role === 'personal') {
      appendPersonalLiveMessage(message);
    } else {
      appendStudentLiveMessage(message);
    }
  }, {
    onOpen: () => setChatConnectionStatus('connected'),
    onError: () => setChatConnectionStatus(navigator.onLine ? 'reconnecting' : 'offline'),
    onTyping: setChatTypingIndicator
  });
}

function setChatTypingIndicator(payload) {
  if (!payload || payload.userId === API.getCurrentUser()?.id) return;
  const targets = document.querySelectorAll('[data-chat-typing-status]');
  const activeTarget = typeof activeChatStudentId !== 'undefined' ? activeChatStudentId : personalTrainerId;
  if (activeTarget && String(activeTarget) !== String(payload.userId)) return;
  targets.forEach(target => { target.textContent = payload.isTyping ? 'Digitando...' : ''; });
}

function announceTyping(input) {
  const currentUser = API.getCurrentUser();
  if (!currentUser) return;
  const receiverId = currentUser.role === 'personal'
    ? (typeof activeChatStudentId !== 'undefined' ? activeChatStudentId : null)
    : (typeof personalTrainerId !== 'undefined' ? personalTrainerId : null);
  if (!receiverId) return;
  API.post('/chat/typing', { receiverId, isTyping: true }).catch(() => {});
}

if (typeof document !== 'undefined') {
  document.addEventListener('input', event => {
    if (event.target?.id === 'personal-chat-input' || event.target?.id === 'student-chat-input') announceTyping(event.target);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => setChatConnectionStatus('offline'));
  window.addEventListener('online', () => {
    if (API.getCurrentUser() && API.chatStream) setChatConnectionStatus('reconnecting');
  });
}

// Toggle Light/Dark Theme
function toggleTheme() {
  const body = document.body;
  body.classList.toggle('dark-theme');
  const isDark = body.classList.contains('dark-theme');
  localStorage.setItem('fitlife_theme', isDark ? 'dark' : 'light');
  
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

// Global modal execution helper
function openExerciseExecutionModal(name, gifUrl, description) {
  const title = document.getElementById('execution-modal-title');
  SafeDOM.clear(title);
  title.appendChild(SafeDOM.icon('play-circle'));
  title.appendChild(document.createTextNode(` Execução: ${name ?? ''}`));
  
  const gifImg = document.getElementById('execution-modal-gif');
  gifImg.alt = name ? `Demonstração do exercício ${name}` : 'Demonstração do exercício';
  if (SafeDOM.setSafeImageSource(gifImg, gifUrl)) {
    gifImg.parentElement.classList.remove('hidden');
  } else {
    gifImg.removeAttribute('src');
    gifImg.parentElement.classList.add('hidden');
  }
  
  document.getElementById('execution-modal-instructions').textContent = description || 'Sem instruções técnicas adicionadas.';
  
  openModal('modal-exercise-execution');
  lucide.createIcons();
}

// Global measurements submission for Personal and Student
async function handleAddMeasurementSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  clearFormError(form.id);
  setFormSubmitting(form, true);
  
  const weight = parseFloat(document.getElementById('meas-weight').value);
  const chest = document.getElementById('meas-chest').value;
  const waist = document.getElementById('meas-waist').value;
  const hips = document.getElementById('meas-hips').value;
  const bicepsL = document.getElementById('meas-biceps-l').value;
  const bicepsR = document.getElementById('meas-biceps-r').value;
  const thighL = document.getElementById('meas-thigh-l').value;
  const thighR = document.getElementById('meas-thigh-r').value;

  const user = API.getCurrentUser();
  if (!user) {
    setFormSubmitting(form, false);
    return;
  }

  const payload = {
    weight,
    chest: chest ? parseFloat(chest) : null,
    waist: waist ? parseFloat(waist) : null,
    hips: hips ? parseFloat(hips) : null,
    bicepsL: bicepsL ? parseFloat(bicepsL) : null,
    bicepsR: bicepsR ? parseFloat(bicepsR) : null,
    thighL: thighL ? parseFloat(thighL) : null,
    thighR: thighR ? parseFloat(thighR) : null
  };

  // If Personal Trainer is active, supply selectedStudentId
  if (user.role === 'personal') {
    payload.studentId = selectedStudentId;
  }

  try {
    await API.post('/student/measurements', payload);
    showToast('Medidas registradas com sucesso!', 'success');
    closeModal('modal-add-measurement');
    document.getElementById('add-measurement-form').reset();
    
    // Refresh the active view
    if (user.role === 'personal') {
      openStudentDetails(selectedStudentId);
    } else {
      loadStudentMeasurements();
    }
  } catch (err) {
    setFormError(form.id, err.message);
    showToast(err.message, 'error');
  } finally {
    setFormSubmitting(form, false);
  }
}
