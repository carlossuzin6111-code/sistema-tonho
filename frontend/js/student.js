// FitLife Sync - Student Dashboard Logic
let studentWorkouts = [];
let studentMeasurements = [];
let personalTrainerId = null;

const StudentSession = {
  state: null,
  heartbeatId: null,
  elapsedId: null,
  restId: null,
  visibilityHandler: null,
  storageKey() {
    const user = API.getCurrentUser();
    return user?.id ? `fitlife_active_session_${user.id}` : null;
  },
  clearTimers() {
    if (this.heartbeatId) clearInterval(this.heartbeatId);
    if (this.elapsedId) clearInterval(this.elapsedId);
    if (this.restId) clearInterval(this.restId);
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.heartbeatId = this.elapsedId = this.restId = null;
    this.visibilityHandler = null;
  },
  save() {
    const key = this.storageKey();
    if (key && this.state) sessionStorage.setItem(key, JSON.stringify({ id: this.state.id, workoutId: this.state.workoutId }));
  },
  clear() {
    this.clearTimers();
    const key = this.storageKey();
    if (key) sessionStorage.removeItem(key);
    this.state = null;
    document.getElementById('student-active-session')?.remove();
  },
  format(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  },
  render() {
    let banner = document.getElementById('student-active-session');
    if (!this.state) return;
    if (!banner) {
      banner = SafeDOM.el('div', { id: 'student-active-session', className: 'glass active-session-banner', attrs: { role: 'status', 'aria-live': 'polite' } });
      document.getElementById('student-workouts-container')?.prepend(banner);
    }
    SafeDOM.clear(banner);
    const elapsed = Math.floor((Date.now() - new Date(this.state.startedAt).getTime()) / 1000);
    const elapsedLabel = SafeDOM.el('strong', { text: `Sessão ativa · ${this.format(elapsed)}` });
    const restLabel = SafeDOM.el('span', { id: 'student-rest-timer', className: 'session-rest-timer', text: this.state.restUntil ? `Descanso ${this.format((this.state.restUntil - Date.now()) / 1000)}` : 'Pronto para o próximo exercício' });
    banner.append(elapsedLabel, SafeDOM.el('span', { className: 'session-workout-name', text: this.state.workoutName || 'Treino' }), restLabel,
      SafeDOM.el('button', { className: 'btn btn-secondary btn-sm', attrs: { type: 'button', 'data-action': 'start-rest' } }, ['Iniciar descanso']),
      SafeDOM.el('button', { className: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'complete-session' } }, ['Concluir']),
      SafeDOM.el('button', { className: 'btn btn-danger btn-sm', attrs: { type: 'button', 'data-action': 'cancel-session' } }, ['Cancelar']));
  },
  startTimers() {
    this.clearTimers();
    this.heartbeatId = setInterval(() => this.heartbeat(), 30000);
    this.elapsedId = setInterval(() => this.render(), 1000);
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.render();
        this.heartbeat();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  },
  async heartbeat() {
    if (!this.state) return;
    try { const result = await API.patch(`/workout-sessions/${this.state.id}/activity`, {}); this.state.lastActivityAt = result.lastActivityAt; this.save(); }
    catch (error) { console.warn('Heartbeat da sessão falhou:', error.message); }
  },
  async start(workout) {
    if (this.state) { showToast('Já existe uma sessão ativa.', 'info'); return; }
    try {
      const session = await API.post('/workout-sessions/start', { workoutId: workout.id });
      this.state = { ...session, workoutId: workout.id, workoutName: workout.name, startedAt: session.started_at || new Date().toISOString() };
      this.save(); this.render(); this.startTimers(); showToast('Sessão iniciada.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  },
  async recover() {
    const key = this.storageKey();
    if (!key) return;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); }
    catch { sessionStorage.removeItem(key); return; }
    if (!saved?.id) return;
    try {
      const session = await API.get(`/workout-sessions/${saved.id}`);
      if (session.status !== 'in_progress') return this.clear();
      const workout = studentWorkouts.find(item => String(item.id) === String(session.workout_id));
      this.state = { ...session, workoutId: session.workout_id, workoutName: workout?.name || session.workout_name, startedAt: session.started_at };
      this.render(); this.startTimers();
    } catch { this.clear(); }
  },
  async finish(action) {
    if (!this.state) return;
    try { await API.post(`/workout-sessions/${this.state.id}/${action}`); this.clear(); await loadStudentWorkouts(); showToast(action === 'complete' ? 'Treino concluído.' : 'Sessão cancelada.', 'success'); }
    catch (error) { showToast(error.message, 'error'); }
  },
  rest(seconds = 60) {
    if (!this.state) return;
    if (this.restId) clearInterval(this.restId);
    this.state.restUntil = Date.now() + seconds * 1000;
    const tick = () => { const left = this.state?.restUntil - Date.now(); const timer = document.getElementById('student-rest-timer'); if (timer) timer.textContent = left > 0 ? `Descanso ${this.format(left / 1000)}` : 'Descanso finalizado'; if (left <= 0 && this.restId) { clearInterval(this.restId); this.restId = null; } };
    tick(); this.restId = setInterval(tick, 1000);
  }
};

function handleStudentSessionAction(action) {
  if (action === 'start-rest') StudentSession.rest();
  if (action === 'complete-session') StudentSession.finish('complete');
  if (action === 'cancel-session') StudentSession.finish('cancel');
}

function exerciseCheckKey(exerciseId) {
  const userId = API.getCurrentUser()?.id;
  return userId ? `fitlife_chk_user_${userId}_exercise_${exerciseId}` : null;
}

function tableMessageRow(message, className = 'no-data-msg') {
  return SafeDOM.el('tr', {}, [SafeDOM.el('td', { className, text: message, attrs: { colspan: '7' } })]);
}

function updateStudentWorkoutSummary() {
  const exercises = studentWorkouts.flatMap(workout => workout.exercises || []);
  const completed = exercises.reduce((total, exercise) => {
    const key = exerciseCheckKey(exercise.id);
    return total + (key && localStorage.getItem(key) === 'true' ? 1 : 0);
  }, 0);
  const values = {
    'student-workout-count': studentWorkouts.length,
    'student-exercise-count': exercises.length,
    'student-completed-count': completed
  };
  for (const [id, value] of Object.entries(values)) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }
}

async function loadStudentWorkouts() {
  const container = document.getElementById('student-workouts-container');
  renderLoadingSkeletons(container, { count: 3, variant: 'workout', label: 'Carregando ficha de treinos' });
  try {
    studentWorkouts = await API.get('/student/workouts');
    finishLoadingState(container);
    updateStudentWorkoutSummary();
    SafeDOM.clear(container);
    if (!studentWorkouts.length) {
      container.appendChild(SafeDOM.el('div', { className: 'chat-empty-state glass empty-state-large' }, [
        SafeDOM.icon('dumbbell', 'chat-empty-icon icon-50 text-muted'),
        SafeDOM.el('h3', { text: 'Nenhum treino prescrito' }),
        SafeDOM.el('p', { text: 'Seu Personal Trainer ainda não criou sua ficha de treinos. Fale com ele via chat!' })
      ]));
      appendEmptyStateAction(container, { label: 'Conversar com meu personal', icon: 'message-square', onClick: () => switchStudentTab('chat') });
      lucide.createIcons();
      return;
    }

    for (const workout of studentWorkouts) {
      personalTrainerId = workout.personal_id;
      const card = SafeDOM.el('div', { className: 'workout-card glass' });
      const titleBlock = SafeDOM.el('div', {}, [SafeDOM.el('span', { className: 'workout-title', text: workout.name })]);
      if (workout.description) titleBlock.appendChild(SafeDOM.el('p', { className: 'workout-desc', text: workout.description }));
      card.appendChild(SafeDOM.el('div', { className: 'workout-header' }, [titleBlock, SafeDOM.el('button', { className: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'start-student-session', 'data-workout-id': workout.id } }, ['Iniciar treino'])]));
      const table = SafeDOM.el('table', { className: 'pedagogical-table' });
      table.appendChild(SafeDOM.el('thead', {}, [SafeDOM.el('tr', {}, [
        SafeDOM.el('th', { text: 'Status', className: 'workout-status-heading', attrs: { scope: 'col' } }),
        ...['Exercício', 'Séries', 'Repetições', 'Carga', 'Descanso'].map(label => SafeDOM.el('th', { text: label, attrs: { scope: 'col' } })),
        SafeDOM.el('th', { text: 'Execução', className: 'workout-execution-heading', attrs: { scope: 'col' } })
      ])]));
      const tbody = SafeDOM.el('tbody');
      if (!workout.exercises.length) {
        tbody.appendChild(tableMessageRow('Nenhum exercício cadastrado nesta ficha.'));
      } else {
        for (const exercise of workout.exercises) {
          const key = exerciseCheckKey(exercise.id);
          const checked = key ? localStorage.getItem(key) === 'true' : false;
          const checkbox = SafeDOM.el('input', { attrs: { type: 'checkbox', 'aria-label': `Marcar ${exercise.name} como concluído` } });
          checkbox.checked = checked;
          checkbox.addEventListener('change', () => toggleExerciseCheck(exercise.id, checkbox));
          const checkLabel = SafeDOM.el('label', { className: 'checkbox-container workout-checkbox' }, [checkbox, SafeDOM.el('span', { className: 'checkmark workout-checkmark' })]);
          const name = SafeDOM.el('span', { text: exercise.name, attrs: { id: `ex-name-${exercise.id}` }, className: `exercise-name exercise-name-strong ${checked ? 'strike-completed' : ''}` });
          const nameCell = SafeDOM.el('td', { className: 'workout-exercise-main', attrs: { 'data-label': 'Exercício' } }, [name]);
          if (exercise.notes) nameCell.appendChild(SafeDOM.el('div', { className: 'exercise-notes', text: exercise.notes }));
          const execution = SafeDOM.el('button', {
            className: 'btn-pill-action',
            attrs: exercise.gif_url ? { 'aria-label': `Ver execução de ${exercise.name}` } : { disabled: '', title: 'Sem GIF de execução' },
            on: exercise.gif_url ? { click: () => openExerciseExecutionModal(exercise.name, exercise.gif_url, exercise.exercise_description || '') } : {}
          }, [SafeDOM.icon(exercise.gif_url ? 'play-circle' : 'help-circle'), exercise.gif_url ? ' Ver execução' : ' Sem GIF']);
          tbody.appendChild(SafeDOM.el('tr', { attrs: { id: `ex-row-${exercise.id}` } }, [
            SafeDOM.el('td', { className: 'workout-check-cell', attrs: { 'data-label': 'Status' } }, [checkLabel]), nameCell,
            SafeDOM.el('td', { text: exercise.sets, className: 'workout-cell workout-cell-strong', attrs: { 'data-label': 'Séries' } }),
            SafeDOM.el('td', { text: exercise.reps, className: 'workout-cell', attrs: { 'data-label': 'Repetições' } }),
            SafeDOM.el('td', { text: exercise.weight || 'Sem carga', className: 'workout-cell workout-cell-muted', attrs: { 'data-label': 'Carga' } }),
            SafeDOM.el('td', { text: exercise.rest_time || 'Sem pausa', className: 'workout-cell workout-cell-muted', attrs: { 'data-label': 'Descanso' } }),
            SafeDOM.el('td', { className: 'workout-cell workout-execution-cell', attrs: { 'data-label': 'Execução' } }, [execution])
          ]));
        }
      }
      table.appendChild(tbody);
      card.appendChild(SafeDOM.el('div', { className: 'pedagogical-table-wrapper' }, [table]));
      container.appendChild(card);
    }
    lucide.createIcons();
    await StudentSession.recover();
  } catch (error) {
    studentWorkouts = [];
    updateStudentWorkoutSummary();
    SafeDOM.clear(container);
    container.appendChild(SafeDOM.errorAlert('Erro ao carregar treinos: ', error.message));
    appendEmptyStateAction(container, { label: 'Tentar novamente', icon: 'refresh-cw', onClick: loadStudentWorkouts });
    lucide.createIcons();
  }
}

function toggleExerciseCheck(exerciseId, checkbox) {
  const key = exerciseCheckKey(exerciseId);
  if (key) localStorage.setItem(key, checkbox.checked);
  document.getElementById(`ex-name-${exerciseId}`)?.classList.toggle('strike-completed', checkbox.checked);
  updateStudentWorkoutSummary();
  if (StudentSession.state) {
    const sessionExercise = (StudentSession.state.exercises || []).find(item => String(item.workout_exercise_id) === String(exerciseId));
    if (sessionExercise) API.patch(`/workout-sessions/${StudentSession.state.id}/exercises/${sessionExercise.id}`, { completed: checkbox.checked }).catch(error => showToast(error.message, 'error'));
  }
}

function updateStudentMeasurementOverview() {
  const latest = studentMeasurements[0];
  const previous = studentMeasurements[1];
  const latestWeight = latest?.weight === null || latest?.weight === undefined ? null : Number(latest.weight);
  const previousWeight = previous?.weight === null || previous?.weight === undefined ? null : Number(previous.weight);
  const change = Number.isFinite(latestWeight) && Number.isFinite(previousWeight) ? latestWeight - previousWeight : null;
  const values = {
    'student-latest-weight': Number.isFinite(latestWeight) ? `${latestWeight.toLocaleString('pt-BR')} kg` : '-',
    'student-weight-change': change === null ? '-' : `${change > 0 ? '+' : ''}${change.toLocaleString('pt-BR')} kg`,
    'student-latest-measurement-date': latest?.recorded_at ? AppDateTime.date(latest.recorded_at) : '-',
    'student-measurement-count': studentMeasurements.length
  };
  for (const [id, value] of Object.entries(values)) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }
}

async function loadStudentMeasurements() {
  const tbody = document.getElementById('measurements-table-body');
  const metricsGrid = document.getElementById('latest-metrics-grid');
  SafeDOM.clear(tbody);
  tbody.appendChild(SafeDOM.el('tr', {}, [SafeDOM.el('td', { attrs: { colspan: '7' } }, [SafeDOM.el('div', { className: 'spinner table-spinner', attrs: { 'aria-label': 'Carregando medidas' } })])]));
  try {
    studentMeasurements = await API.get('/student/measurements');
    updateStudentMeasurementOverview();
    SafeDOM.clear(tbody);
    if (!studentMeasurements.length) {
      tbody.appendChild(tableMessageRow('Nenhuma medida cadastrada.'));
      SafeDOM.clear(metricsGrid);
      metricsGrid.appendChild(SafeDOM.el('div', { className: 'no-data-msg grid-span-full', text: 'Nenhum dado cadastrado.' }));
      plotSvgChart('weight-chart-container', []);
      return;
    }
    for (const measurement of studentMeasurements) {
      const row = SafeDOM.el('tr');
      const value = item => item === null || item === undefined ? '-' : `${item} cm`;
      SafeDOM.appendChildren(row, [
        SafeDOM.el('td', { text: AppDateTime.date(measurement.recorded_at), attrs: { 'data-label': 'Data' } }),
        SafeDOM.el('td', { text: `${measurement.weight} kg`, className: 'metric-weight-value', attrs: { 'data-label': 'Peso' } }),
        SafeDOM.el('td', { text: value(measurement.chest), attrs: { 'data-label': 'Tórax' } }),
        SafeDOM.el('td', { text: value(measurement.waist), attrs: { 'data-label': 'Cintura' } }),
        SafeDOM.el('td', { text: value(measurement.hips), attrs: { 'data-label': 'Quadril' } }),
        SafeDOM.el('td', { text: `${measurement.biceps_l ?? '-'} / ${measurement.biceps_r ?? '-'}`, attrs: { 'data-label': 'Bíceps E / D' } }),
        SafeDOM.el('td', { text: `${measurement.thigh_l ?? '-'} / ${measurement.thigh_r ?? '-'}`, attrs: { 'data-label': 'Coxa E / D' } })
      ]);
      tbody.appendChild(row);
    }
    const latest = studentMeasurements[0];
    SafeDOM.clear(metricsGrid);
    SafeDOM.appendChildren(metricsGrid, [
      SafeDOM.metricItem('Peso', `${latest.weight} kg`), SafeDOM.metricItem('Cintura', latest.waist === null || latest.waist === undefined ? '-' : `${latest.waist} cm`),
      SafeDOM.metricItem('Tórax', latest.chest === null || latest.chest === undefined ? '-' : `${latest.chest} cm`),
      SafeDOM.metricItem('Quadril', latest.hips === null || latest.hips === undefined ? '-' : `${latest.hips} cm`)
    ]);
    plotSvgChart('weight-chart-container', [...studentMeasurements].reverse().map(item => ({ label: AppDateTime.shortDate(item.recorded_at), value: item.weight })));
  } catch (error) {
    studentMeasurements = [];
    updateStudentMeasurementOverview();
    SafeDOM.clear(tbody);
    tbody.appendChild(tableMessageRow(`Erro ao carregar medidas: ${error.message}`, 'no-data-msg text-danger'));
    SafeDOM.clear(metricsGrid);
    metricsGrid.appendChild(SafeDOM.errorAlert('Erro ao carregar medidas: ', error.message, 'grid-span-full'));
    appendEmptyStateAction(metricsGrid, { label: 'Tentar novamente', icon: 'refresh-cw', onClick: loadStudentMeasurements });
    plotSvgChart('weight-chart-container', []);
  }
}

async function loadStudentChat() {
  const box = document.getElementById('student-chat-messages');
  SafeDOM.clear(box);
  box.appendChild(SafeDOM.el('div', { className: 'spinner', attrs: { 'aria-label': 'Carregando mensagens' } }));
  try {
    const [messages, partner] = await Promise.all([API.get('/chat'), API.get('/chat/partner')]);
    personalTrainerId = partner.id;
    document.getElementById('student-chat-trainer-name').textContent = partner.name;
    renderUserAvatar(document.getElementById('student-chat-trainer-avatar'), partner);
    SafeDOM.clear(box);
    if (!messages.length) box.appendChild(SafeDOM.el('div', { className: 'no-data-msg chat-empty-message', text: 'Inicie o papo! Mande um alô para seu Personal Trainer aqui.' }));
    else for (const message of messages) {
      const currentUser = API.getCurrentUser();
      const isMe = currentUser && String(message.sender_id) === String(currentUser.id);
      box.appendChild(SafeDOM.chatBubble(message.message, AppDateTime.time(message.created_at), isMe ? 'sent' : 'received'));
    }
    box.scrollTop = box.scrollHeight;
    document.getElementById('student-unread-badge').classList.add('hidden');
  } catch (error) {
    SafeDOM.clear(box);
    box.appendChild(SafeDOM.el('p', { className: 'no-data-msg text-danger', text: error.message }));
    appendEmptyStateAction(box, { label: 'Tentar novamente', icon: 'refresh-cw', onClick: loadStudentChat });
  }
}

async function sendStudentChatMessage(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.sendState === 'sending') return;
  const input = document.getElementById('student-chat-input');
  const message = input.value.trim();
  if (!message) return;
  setChatSendState(form, 'sending', 'Enviando...');
  try {
    await API.post('/chat', { message });
    input.value = '';
    setChatSendState(form, 'sent', 'Mensagem enviada.');
  } catch (error) {
    setChatSendState(form, 'failed', 'Falha no envio. Tente novamente.');
    showToast(error.message, 'error');
  }
}

function appendStudentLiveMessage(message) {
  const active = document.getElementById('tab-s-chat').classList.contains('active');
  const currentUser = API.getCurrentUser();
  const isMe = currentUser && String(message.sender_id) === String(currentUser.id);
  if (active) {
    const box = document.getElementById('student-chat-messages');
    box.querySelector('.no-data-msg')?.remove();
    box.appendChild(SafeDOM.chatBubble(message.message, AppDateTime.time(message.created_at), isMe ? 'sent' : 'received'));
    box.scrollTop = box.scrollHeight;
    if (!isMe) API.get('/chat').catch(() => {});
  } else if (!isMe) {
    showToast('Personal mandou uma mensagem!', 'info');
    const badge = document.getElementById('student-unread-badge');
    badge.classList.remove('hidden');
    badge.textContent = '•';
  }
}
