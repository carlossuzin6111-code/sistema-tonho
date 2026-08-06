// Centralized bindings for static HTML actions. Keeping behavior in this
// allowlist lets the application use a CSP without script-src 'unsafe-inline'.

let mobileDrawerTrigger = null;

function toggleMobileDrawer(trigger) {
  const drawer = document.getElementById('mobile-drawer');
  if (!drawer) return;

  const role = document.getElementById('user-role-badge')?.textContent || '';
  const personalNavigation = document.getElementById('drawer-nav-personal');
  const studentNavigation = document.getElementById('drawer-nav-student');

  if (drawer.classList.contains('active')) {
    drawer.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true');
    document.querySelector('.mobile-menu-button')?.setAttribute('aria-expanded', 'false');
    mobileDrawerTrigger?.focus();
    mobileDrawerTrigger = null;
    return;
  }

  mobileDrawerTrigger = trigger || document.activeElement;
  drawer.classList.add('active');
  drawer.setAttribute('aria-hidden', 'false');
  document.querySelector('.mobile-menu-button')?.setAttribute('aria-expanded', 'true');
  const isPersonal = role.includes('Personal');
  personalNavigation?.classList.toggle('hidden', !isPersonal);
  studentNavigation?.classList.toggle('hidden', isPersonal);
  drawer.querySelector('[aria-label="Fechar menu"]')?.focus();
}

const clickActions = Object.freeze({
  'switch-auth-tab': element => switchAuthTab(element.dataset.tab),
  'toggle-theme': () => toggleTheme(),
  'logout': () => logout(),
  'edit-chat-message': element => editChatMessage(element),
  'delete-chat-message': element => deleteChatMessage(element),
  'load-older-student-chat': () => loadOlderStudentChat(),
  'load-older-personal-chat': () => loadOlderPersonalChat(),
  'open-forgot-password': () => openForgotPassword(),
  'resend-email-verification': () => handleResendEmailVerification(),
  'export-my-data': () => exportMyData(),
  'manage-sessions': () => manageSessions(),
  'revoke-profile-session': element => confirmRevokeProfileSession(element),
  'revoke-other-sessions': () => confirmRevokeOtherSessions(),
  'logout-all-sessions': () => confirmLogoutAllSessions(),
  'open-notifications': () => openNotifications(),
  'close-notifications': () => closeNotifications(),
  'mark-notification-read': element => markNotificationRead(element),
  'save-notification-preferences': () => saveNotificationPreferences(),
  'switch-personal-tab': element => switchPersonalTab(element.dataset.tab),
  'switch-student-tab': element => switchStudentTab(element.dataset.tab),
  'close-chat-thread': () => closeChatThreadMobile(),
  'open-catalog-exercise': () => openCreateCatalogExerciseModal(),
  'close-modal': element => closeModal(element.dataset.modal),
  'reset-password': () => openResetPasswordModal(),
  'close-reset-password': () => closeResetPasswordModal(),
  'open-autonomous-reset': () => openAutonomousResetModal(),
  'close-autonomous-reset': () => closeAutonomousResetModal(),
  'open-claim-invitation': () => openClaimInvitationModal(),
  'close-claim-invitation': () => closeClaimInvitationModal(),
  'open-start-impersonation': () => openStartImpersonationModal(),
  'close-start-impersonation': () => closeStartImpersonationModal(),
  'end-impersonation': () => handleEndImpersonation(),
  'open-grant-partner-consent': () => openGrantPartnerConsentModal(),
  'close-grant-partner-consent': () => closeGrantPartnerConsentModal(),
  'revoke-partner-consent': element => handleRevokePartnerConsent(element),
  'close-destructive-confirmation': () => closeDestructiveConfirmation(),
  'switch-modal-tab': element => switchModalSubtab(element.dataset.tab),
  'open-workout-modal': () => openCreateWorkoutModal(),
  'open-modal': element => openModal(element.dataset.modal),
  'toggle-password': element => togglePasswordVisibility(element),
  'toggle-drawer': element => toggleMobileDrawer(element),
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
  },
  'open-profile-modal': () => openEditProfileModal(),
  'switch-profile-tab': element => switchProfileTab(element.dataset.tab),
  'filter-student-status': element => filterStudentStatus(element.dataset.studentStatusFilter, element),
  'save-profile-avatar': () => handleSaveAvatar(),
  'remove-profile-avatar': () => handleRemoveAvatar(),
  'start-student-session': element => {
    const workout = studentWorkouts.find(item => String(item.id) === String(element.dataset.workoutId));
    if (workout) StudentSession.start(workout);
  },
  'start-rest': () => handleStudentSessionAction('start-rest'),
  'complete-session': () => handleStudentSessionAction('complete-session'),
  'cancel-session': () => handleStudentSessionAction('cancel-session'),
  'retry-session-sync': () => handleStudentSessionAction('retry-session-sync')
});

const submitHandlers = Object.freeze({
  'login-form': event => handleLogin(event),
  'register-form': event => handleRegister(event),
  'create-student-form': event => handleCreateStudent(event),
  'reset-password-form': event => handleResetPasswordSubmit(event),
  'autonomous-reset-password-form': event => handleAutonomousResetPasswordSubmit(event),
  'claim-invitation-form': event => handleClaimInvitationSubmit(event),
  'start-impersonation-form': event => handleStartImpersonationSubmit(event),
  'grant-partner-consent-form': event => handleGrantPartnerConsentSubmit(event),
  'destructive-confirmation-form': event => handleDestructiveConfirmationSubmit(event),
  'personal-chat-form': event => sendPersonalChatMessage(event),
  'student-chat-form': event => sendStudentChatMessage(event),
  'create-workout-form': event => handleCreateWorkoutSubmit(event),
  'add-exercise-form': event => handleAddExerciseSubmit(event),
  'add-measurement-form': event => handleAddMeasurementSubmit(event),
  'student-assessment-form': event => handleStudentAssessmentSubmit(event),
  'create-catalog-exercise-form': event => handleCreateCatalogExerciseSubmit(event),
  'edit-profile-name-form': event => handleUpdateProfileName(event),
  'edit-profile-password-form': event => handleUpdateProfilePassword(event)
  , 'current-waiver-form': event => submitCurrentWaiver(event)
  , 'student-readiness-form': event => submitStudentReadiness(event)
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
  if (event.target.id === 'students-sort') sortPersonalStudents(event.target.value);
  if (event.target.id === 'exercises-sort') sortPersonalExercises(event.target.value);
  if (event.target.id === 'profile-avatar-file') handleAvatarFileSelected(event);
});

document.addEventListener('input', event => {
  if (event.target.id === 'cat-ex-gif-url') handleCatalogGifUrlInput();
  if (event.target.id === 'students-search') filterPersonalStudents(event.target.value);
  if (event.target.id === 'exercises-search') filterPersonalExercises(event.target.value);
  if (['personal-chat-input', 'student-chat-input'].includes(event.target.id)) resetChatSendFeedback(event.target);
  if (['personal-chat-input', 'student-chat-input'].includes(event.target.id)) handleChatTypingInput(event.target);
  if (['profile-avatar-zoom', 'profile-avatar-x', 'profile-avatar-y'].includes(event.target.id)) renderProfileAvatarCrop();
  const feedbackForm = event.target.closest?.('.auth-form, .form-with-feedback');
  if (feedbackForm) clearFormError(feedbackForm.id);
});

document.addEventListener('keydown', event => {
  const drawer = document.getElementById('mobile-drawer');
  if (!drawer?.classList.contains('active')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    toggleMobileDrawer();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...drawer.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.closest('.hidden'));
  if (!focusable.length) return;
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

document.addEventListener('DOMContentLoaded', () => {
  if (typeof checkURLForResetToken === 'function') {
    checkURLForResetToken();
  }
  if (typeof checkURLForVerifyEmailToken === 'function') {
    checkURLForVerifyEmailToken();
  }
  if (typeof checkURLForInviteToken === 'function') {
    checkURLForInviteToken();
  }
});
