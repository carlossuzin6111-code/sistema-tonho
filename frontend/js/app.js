// FitLife Sync - App Orchestrator & Shell

let lastModalTrigger = null;

const modalFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

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
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    if (lastModalTrigger && lastModalTrigger.isConnected) lastModalTrigger.focus();
    lastModalTrigger = null;
    modal.setAttribute('aria-hidden', 'true');
  }
}

document.addEventListener('keydown', event => {
  const modal = document.querySelector('.modal-overlay.active');
  if (!modal) return;

  if (event.key === 'Escape') {
    event.preventDefault();
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
}

// Switch Personal Tabs
function switchPersonalTab(tab) {
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
}

// Switch Student Tabs
function switchStudentTab(tab) {
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
}

// Authentication Actions

// Login Handler
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await API.post('/auth/login', { email, password });
    API.saveSession(data.user);
    showToast('Login realizado com sucesso!', 'success');
    setupAppShell(data.user);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Register Personal Trainer Handler
async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const accessKey = document.getElementById('reg-access-key').value;

  if (name.trim() === '' || email.trim() === '' || password.trim() === '' || accessKey.trim() === '') {
    showToast('Por favor, preencha todos os campos.', 'error');
    return;
  }

  try {
    const data = await API.post('/auth/register', { name, email, password, accessKey });
    API.saveSession(data.user);
    showToast('Conta criada com sucesso!', 'success');
    setupAppShell(data.user);
  } catch (err) {
    showToast(err.message, 'error');
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
    if (!cachedUser) setupAppShell(verifiedUser);
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

  const roleBadge = document.getElementById('user-role-badge');
  roleBadge.textContent = user.role === 'personal' ? 'Personal Trainer' : 'Aluno';
  roleBadge.className = `role-badge ${user.role}`;

  // Reset dashboards
  document.getElementById('personal-dashboard').classList.add('hidden');
  document.getElementById('student-dashboard').classList.add('hidden');

  if (user.role === 'personal') {
    document.getElementById('personal-dashboard').classList.remove('hidden');
    switchPersonalTab('students');
  } else {
    document.getElementById('student-dashboard').classList.remove('hidden');
    switchStudentTab('workouts');
  }

  // Connect to the real-time chat SSE stream
  connectRealTimeUpdates(user);
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  API.disconnectChatStream();
}

async function logout() {
  try {
    await API.post('/auth/logout', {});
  } catch (err) {
    console.warn('Server logout failed; clearing local cache.', err.message);
  } finally {
    API.clearSession();
    showLoginScreen();
    showToast('Sessão encerrada.', 'info');
  }
}

// SSE Real-Time connection orchestrator
function connectRealTimeUpdates(user) {
  API.connectChatStream((message) => {
    // 1. Check if active window is chat, and append message
    if (user.role === 'personal') {
      appendPersonalLiveMessage(message);
    } else {
      appendStudentLiveMessage(message);
    }
  }, (err) => {
    console.log('Chat stream error. Attempting reconnect in 5s...');
    setTimeout(() => {
      const activeUser = API.getCurrentUser();
      if (activeUser) connectRealTimeUpdates(activeUser);
    }, 5000);
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
  if (SafeDOM.setSafeImageSource(gifImg, gifUrl)) {
    gifImg.parentElement.style.display = 'flex';
  } else {
    gifImg.src = '';
    gifImg.parentElement.style.display = 'none';
  }
  
  document.getElementById('execution-modal-instructions').textContent = description || 'Sem instruções técnicas adicionadas.';
  
  openModal('modal-exercise-execution');
  lucide.createIcons();
}

// Global measurements submission for Personal and Student
async function handleAddMeasurementSubmit(event) {
  event.preventDefault();
  
  const weight = parseFloat(document.getElementById('meas-weight').value);
  const chest = document.getElementById('meas-chest').value;
  const waist = document.getElementById('meas-waist').value;
  const hips = document.getElementById('meas-hips').value;
  const bicepsL = document.getElementById('meas-biceps-l').value;
  const bicepsR = document.getElementById('meas-biceps-r').value;
  const thighL = document.getElementById('meas-thigh-l').value;
  const thighR = document.getElementById('meas-thigh-r').value;

  const user = API.getCurrentUser();
  if (!user) return;

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
    showToast(err.message, 'error');
  }
}
