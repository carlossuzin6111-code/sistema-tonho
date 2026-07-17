// Centralized bindings for static HTML actions. Keeping behavior in this
// allowlist lets the application use a CSP without script-src 'unsafe-inline'.

function toggleMobileDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  if (!drawer) return;

  const role = document.getElementById('user-role-badge')?.textContent || '';
  const personalNavigation = document.getElementById('drawer-nav-personal');
  const studentNavigation = document.getElementById('drawer-nav-student');

  if (drawer.classList.contains('active')) {
    drawer.classList.remove('active');
    return;
  }

  drawer.classList.add('active');
  const isPersonal = role.includes('Personal');
  if (personalNavigation) personalNavigation.style.display = isPersonal ? 'flex' : 'none';
  if (studentNavigation) studentNavigation.style.display = isPersonal ? 'none' : 'flex';
}

const clickActions = Object.freeze({
  'switch-auth-tab': element => switchAuthTab(element.dataset.tab),
  'toggle-theme': () => toggleTheme(),
  'logout': () => logout(),
  'switch-personal-tab': element => switchPersonalTab(element.dataset.tab),
  'switch-student-tab': element => switchStudentTab(element.dataset.tab),
  'close-chat-thread': () => closeChatThreadMobile(),
  'open-catalog-exercise': () => openCreateCatalogExerciseModal(),
  'close-modal': element => closeModal(element.dataset.modal),
  'reset-password': () => promptResetPassword(),
  'switch-modal-tab': element => switchModalSubtab(element.dataset.tab),
  'open-workout-modal': () => openCreateWorkoutModal(),
  'open-modal': element => openModal(element.dataset.modal),
  'toggle-password': element => togglePasswordVisibility(element),
  'toggle-drawer': () => toggleMobileDrawer(),
  'close-drawer': (element, event) => {
    if (event.target === element) toggleMobileDrawer();
  },
  'stop-propagation': (element, event) => event.stopPropagation(),
  'drawer-personal-tab': element => {
    switchPersonalTab(element.dataset.tab);
    toggleMobileDrawer();
  },
  'drawer-student-tab': element => {
    switchStudentTab(element.dataset.tab);
    toggleMobileDrawer();
  }
});

const submitHandlers = Object.freeze({
  'login-form': event => handleLogin(event),
  'register-form': event => handleRegister(event),
  'create-student-form': event => handleCreateStudent(event),
  'personal-chat-form': event => sendPersonalChatMessage(event),
  'student-chat-form': event => sendStudentChatMessage(event),
  'create-workout-form': event => handleCreateWorkoutSubmit(event),
  'add-exercise-form': event => handleAddExerciseSubmit(event),
  'add-measurement-form': event => handleAddMeasurementSubmit(event),
  'create-catalog-exercise-form': event => handleCreateCatalogExerciseSubmit(event)
});

document.addEventListener('click', event => {
  const element = event.target.closest('[data-action]');
  if (!element) return;

  const handler = clickActions[element.dataset.action];
  if (!handler) return;

  event.preventDefault();
  handler(element, event);
});

document.addEventListener('submit', event => {
  const handler = submitHandlers[event.target.id];
  if (handler) handler(event);
});

document.addEventListener('change', event => {
  if (event.target.id === 'ex-select') handleExerciseSelectChange(event.target);
  if (event.target.id === 'cat-ex-gif-file') handleCatalogGifFileSelect(event.target);
});

document.addEventListener('input', event => {
  if (event.target.id === 'cat-ex-gif-url') handleCatalogGifUrlInput();
  if (event.target.id === 'students-search') filterPersonalStudents(event.target.value);
  if (event.target.id === 'exercises-search') filterPersonalExercises(event.target.value);
  const authForm = event.target.closest?.('.auth-form');
  if (authForm) clearFormError(authForm.id);
});
