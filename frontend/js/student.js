// FitLife Sync - Student Dashboard Logic

let studentWorkouts = [];
let studentMeasurements = [];
let personalTrainerId = null;

// Loads student workouts from server and renders checklists
async function loadStudentWorkouts() {
  const container = document.getElementById('student-workouts-container');
  renderLoadingSkeletons(container, { count: 3, variant: 'workout', label: 'Carregando ficha de treinos' });

  try {
    studentWorkouts = await API.get('/student/workouts');
    finishLoadingState(container);
    
    if (studentWorkouts.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state glass empty-state-large">
          <i data-lucide="dumbbell" class="chat-empty-icon icon-50 text-muted"></i>
          <h3>Nenhum treino prescrito</h3>
          <p>Seu Personal Trainer ainda não criou sua ficha de treinos. Fale com ele via chat!</p>
        </div>
      `;
      appendEmptyStateAction(container, { label: 'Conversar com meu personal', icon: 'message-square', onClick: () => switchStudentTab('chat') });
      lucide.createIcons();
      return;
    }

    container.innerHTML = '';
    studentWorkouts.forEach(workout => {
      // Save personal trainer ID if we don't have it yet, helps with chat mapping
      personalTrainerId = workout.personal_id;

      const card = document.createElement('div');
      card.className = 'workout-card glass';

      const titleBlock = SafeDOM.el('div', {}, [
        SafeDOM.el('span', { className: 'workout-title', text: workout.name })
      ]);
      if (workout.description) {
        titleBlock.appendChild(SafeDOM.el('p', { className: 'workout-desc', text: workout.description }));
      }
      card.appendChild(SafeDOM.el('div', { className: 'workout-header' }, [titleBlock]));

      const table = SafeDOM.el('table', { className: 'pedagogical-table' });
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th class="workout-status-heading">Status</th>
          <th>Exercício</th>
          <th>Séries</th>
          <th>Repetições</th>
          <th>Carga</th>
          <th>Descanso</th>
          <th class="workout-execution-heading">Execução</th>
        </tr>`;
      table.appendChild(thead);
      const tbody = document.createElement('tbody');

      if (workout.exercises.length === 0) {
        const cell = SafeDOM.el('td', {
          className: 'no-data-msg',
          text: 'Nenhum exercício cadastrado nesta ficha.',
          attrs: { colspan: '7' }
        });
        tbody.appendChild(SafeDOM.el('tr', {}, [cell]));
      } else {
        workout.exercises.forEach(ex => {
          const isChecked = localStorage.getItem(`fitlife_chk_${ex.id}`) === 'true';
          const checkbox = SafeDOM.el('input', { attrs: { type: 'checkbox' } });
          checkbox.checked = isChecked;
          checkbox.addEventListener('change', () => toggleExerciseCheck(ex.id, checkbox));

          const label = SafeDOM.el('label', {
            className: 'checkbox-container workout-checkbox'
          }, [checkbox, SafeDOM.el('span', { className: 'checkmark workout-checkmark' })]);

          const name = SafeDOM.el('span', {
            text: ex.name,
            attrs: { id: `ex-name-${ex.id}` },
            className: `exercise-name exercise-name-strong ${isChecked ? 'strike-completed' : ''}`
          });
          const nameCell = SafeDOM.el('td', {}, [name]);
          if (ex.notes) nameCell.appendChild(SafeDOM.el('div', { className: 'exercise-notes', text: ex.notes }));

          const executionButton = SafeDOM.el('button', {
            className: 'btn-pill-action',
            attrs: ex.gif_url ? {} : { disabled: '', title: 'Sem GIF de execução' },
            on: ex.gif_url ? {
              click: () => openExerciseExecutionModal(ex.name, ex.gif_url, ex.exercise_description || '')
            } : {}
          }, [SafeDOM.icon(ex.gif_url ? 'play-circle' : 'help-circle'), ex.gif_url ? ' Ver execução' : ' Sem GIF']);

          const row = SafeDOM.el('tr', { attrs: { id: `ex-row-${ex.id}` } }, [
            SafeDOM.el('td', { className: 'workout-check-cell' }, [label]),
            nameCell,
            SafeDOM.el('td', { text: ex.sets, className: 'workout-cell workout-cell-strong' }),
            SafeDOM.el('td', { text: ex.reps, className: 'workout-cell' }),
            SafeDOM.el('td', { text: ex.weight || 'Sem carga', className: 'workout-cell workout-cell-muted' }),
            SafeDOM.el('td', { text: ex.rest_time || 'Sem pausa', className: 'workout-cell workout-cell-muted' }),
            SafeDOM.el('td', { className: 'workout-cell' }, [executionButton])
          ]);
          tbody.appendChild(row);
        });
      }

      table.appendChild(tbody);
      card.appendChild(SafeDOM.el('div', { className: 'pedagogical-table-wrapper' }, [table]));

      container.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    SafeDOM.clear(container);
    container.appendChild(SafeDOM.errorAlert('Erro ao carregar treinos: ', err.message));
    lucide.createIcons();
  }
}

// Stores toggle checkmark state for workouts in localStorage
function toggleExerciseCheck(exerciseId, checkbox) {
  localStorage.setItem(`fitlife_chk_${exerciseId}`, checkbox.checked);
  
  const nameSpan = document.getElementById(`ex-name-${exerciseId}`);
  if (nameSpan) {
    if (checkbox.checked) {
      nameSpan.classList.add('strike-completed');
    } else {
      nameSpan.classList.remove('strike-completed');
    }
  }
}

// Load and plot student body measurements
async function loadStudentMeasurements() {
  const tbody = document.getElementById('measurements-table-body');
  const metricsGrid = document.getElementById('latest-metrics-grid');
  
  tbody.innerHTML = '<tr><td colspan="7"><div class="spinner table-spinner"></div></td></tr>';

  try {
    studentMeasurements = await API.get('/student/measurements');
    tbody.innerHTML = '';

    if (studentMeasurements.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data-msg">Nenhuma medida cadastrada. Clique em "Adicionar Medidas" para registrar!</td></tr>';
      metricsGrid.innerHTML = `
        <div class="no-data-msg grid-span-full">
          Nenhum dado cadastrado.
        </div>
      `;
      plotSvgChart('weight-chart-container', []);
      return;
    }

    // Populate history table
    studentMeasurements.forEach(m => {
      const row = document.createElement('tr');
      const dateFormatted = new Date(m.recorded_at).toLocaleDateString('pt-BR');
      SafeDOM.appendChildren(row, [
        SafeDOM.el('td', { text: dateFormatted }),
        SafeDOM.el('td', { text: `${m.weight} kg`, className: 'metric-weight-value' }),
        SafeDOM.el('td', { text: m.chest ? `${m.chest} cm` : '-' }),
        SafeDOM.el('td', { text: m.waist ? `${m.waist} cm` : '-' }),
        SafeDOM.el('td', { text: m.hips ? `${m.hips} cm` : '-' }),
        SafeDOM.el('td', { text: `${m.biceps_l || '-'} / ${m.biceps_r || '-'}` }),
        SafeDOM.el('td', { text: `${m.thigh_l || '-'} / ${m.thigh_r || '-'}` })
      ]);
      tbody.appendChild(row);
    });

    // Populate dashboard cards
    const latest = studentMeasurements[0];
    SafeDOM.clear(metricsGrid);
    SafeDOM.appendChildren(metricsGrid, [
      SafeDOM.metricItem('Peso', `${latest.weight} kg`),
      SafeDOM.metricItem('Cintura', latest.waist ? `${latest.waist} cm` : '-'),
      SafeDOM.metricItem('Tórax', latest.chest ? `${latest.chest} cm` : '-'),
      SafeDOM.metricItem('Quadril', latest.hips ? `${latest.hips} cm` : '-')
    ]);

    // Extract weights chronological trends
    const chartData = [...studentMeasurements].reverse().map(m => ({
      label: new Date(m.recorded_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
      value: m.weight
    }));

    plotSvgChart('weight-chart-container', chartData);

  } catch (err) {
    finishLoadingState(container);
    showToast(err.message, 'error');
  }
}

// Add body measurements submit (moved to app.js globally)

// Loads and clears badges for chat history
async function loadStudentChat() {
  const box = document.getElementById('student-chat-messages');
  box.innerHTML = '<div class="spinner"></div>';

  try {
    // Call server to fetch history. It marks incoming messages as read automatically
    const messages = await API.get('/chat');
    box.innerHTML = '';

    if (messages.length === 0) {
      box.innerHTML = `
        <div class="no-data-msg chat-empty-message">
          Inicie o papo! Mande um alô para seu Personal Trainer aqui.
        </div>
      `;
    } else {
      messages.forEach(msg => {
        const cachedUser = API.getCurrentUser();
        const isMe = cachedUser && msg.sender_id.toString() === cachedUser.id.toString();
        const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const bubble = SafeDOM.chatBubble(msg.message, time, isMe ? 'sent' : 'received');
        box.appendChild(bubble);
      });
    }

    box.scrollTop = box.scrollHeight;
    
    // Clear notification badge
    document.getElementById('student-unread-badge').classList.add('hidden');
  } catch (err) {
    SafeDOM.clear(box);
    box.appendChild(SafeDOM.el('p', {
      className: 'no-data-msg text-danger',
      text: err.message
    }));
  }
}

// Send message to coach
async function sendStudentChatMessage(event) {
  event.preventDefault();
  const form = event.target;
  const input = document.getElementById('student-chat-input');
  const message = input.value.trim();

  if (message === '') return;

  setChatSendState(form, 'sending', 'Enviando...');
  try {
    await API.post('/chat', { message });
    input.value = '';
    setChatSendState(form, 'sent', 'Mensagem enviada.');
  } catch (err) {
    setChatSendState(form, 'failed', 'Falha no envio. Tente novamente.');
    showToast(err.message, 'error');
  }
}

// SSE live updates append
function appendStudentLiveMessage(message) {
  const isChatTabActive = document.getElementById('tab-s-chat').classList.contains('active');

  if (isChatTabActive) {
    const box = document.getElementById('student-chat-messages');
    
    // Clear blank threads instructions if first message
    const emptyMsg = box.querySelector('.no-data-msg');
    if (emptyMsg) emptyMsg.remove();

    const cachedUser = API.getCurrentUser();
    const isMe = cachedUser && message.sender_id.toString() === cachedUser.id.toString();
    const time = new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const bubble = SafeDOM.chatBubble(message.message, time, isMe ? 'sent' : 'received');
    box.appendChild(bubble);
    box.scrollTop = box.scrollHeight;

    // Silently mark read on backend
    if (!isMe) {
      API.get('/chat').catch(() => {});
    }
  } else {
    // If user is on workouts or measurements tab, update badges & toast alerts
    const cachedUser = API.getCurrentUser();
    if (cachedUser && message.sender_id.toString() !== cachedUser.id.toString()) {
      showToast(`Personal mandou uma mensagem!`, 'info');
      
      const badge = document.getElementById('student-unread-badge');
      badge.classList.remove('hidden');
      // Set to 1 or increment
      badge.textContent = '●';
    }
  }
}
