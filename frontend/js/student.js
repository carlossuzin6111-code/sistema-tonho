// FitLife Sync - Student Dashboard Logic
let studentWorkouts = [];
let studentMeasurements = [];
let personalTrainerId = null;

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
      card.appendChild(SafeDOM.el('div', { className: 'workout-header' }, [titleBlock]));
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
    'student-latest-measurement-date': latest?.recorded_at ? new Date(latest.recorded_at).toLocaleDateString('pt-BR') : '-',
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
        SafeDOM.el('td', { text: new Date(measurement.recorded_at).toLocaleDateString('pt-BR'), attrs: { 'data-label': 'Data' } }),
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
    plotSvgChart('weight-chart-container', [...studentMeasurements].reverse().map(item => ({ label: new Date(item.recorded_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }), value: item.weight })));
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
      box.appendChild(SafeDOM.chatBubble(message.message, new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), isMe ? 'sent' : 'received'));
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
    box.appendChild(SafeDOM.chatBubble(message.message, new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), isMe ? 'sent' : 'received'));
    box.scrollTop = box.scrollHeight;
    if (!isMe) API.get('/chat').catch(() => {});
  } else if (!isMe) {
    showToast('Personal mandou uma mensagem!', 'info');
    const badge = document.getElementById('student-unread-badge');
    badge.classList.remove('hidden');
    badge.textContent = '•';
  }
}
