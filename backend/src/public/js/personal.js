// FitLife Sync - Personal Trainer Logic

let personalStudents = [];
let selectedStudentId = null;
let activeWorkoutId = null;
let activeChatStudentId = null;

// Renders the list of students in the Personal Dashboard
async function loadPersonalStudents() {
  const grid = document.getElementById('students-grid');
  grid.innerHTML = `
    <div class="loading-placeholder">
      <div class="spinner"></div>
      <span>Carregando sua lista de alunos...</span>
    </div>
  `;

  try {
    personalStudents = await API.get('/personal/students');
    document.getElementById('stat-total-students').textContent = personalStudents.length;

    if (personalStudents.length === 0) {
      grid.innerHTML = `
        <div class="chat-empty-state glass" style="grid-column: 1 / -1; padding: 50px;">
          <i data-lucide="users" class="chat-empty-icon text-gradient" style="width: 50px; height: 50px;"></i>
          <h3>Nenhum aluno cadastrado</h3>
          <p>Crie o primeiro acesso para seus alunos usando a aba "Cadastrar Aluno" na barra lateral.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    grid.innerHTML = '';
    let globalUnread = 0;

    personalStudents.forEach(student => {
      globalUnread += student.unread_messages || 0;
      
      const card = document.createElement('div');
      card.className = 'student-card glass';
      
      // Calculate age if birth_date exists
      let ageText = 'N/A';
      if (student.birth_date) {
        const birth = new Date(student.birth_date);
        const ageDifMs = Date.now() - birth.getTime();
        const ageDate = new Date(ageDifMs);
        ageText = `${Math.abs(ageDate.getUTCFullYear() - 1970)} anos`;
      }

      const weightVal = student.latest_weight ? `${student.latest_weight} kg` : 'N/A';
      const heightVal = student.height ? `${student.height} m` : 'N/A';

      // Unread message badge
      const unreadBadge = student.unread_messages > 0 
        ? `<div class="badge-unread-chat">${student.unread_messages}</div>` 
        : '';

      card.innerHTML = `
        ${unreadBadge}
        <div class="student-card-header">
          <div class="avatar">${student.name.charAt(0).toUpperCase()}</div>
          <div>
            <h3>${student.name}</h3>
            <p>${student.email}</p>
          </div>
        </div>

        <div class="student-stats-row">
          <div class="student-stat">
            <span class="student-stat-title">Peso Atual</span>
            <span class="student-stat-value">${weightVal}</span>
          </div>
          <div class="student-stat">
            <span class="student-stat-title">Altura</span>
            <span class="student-stat-value">${heightVal}</span>
          </div>
          <div class="student-stat">
            <span class="student-stat-title">Idade</span>
            <span class="student-stat-value">${ageText}</span>
          </div>
        </div>

        <div class="student-card-actions">
          <button class="btn btn-primary btn-full btn-sm" onclick="openStudentDetails(${student.id})">
            <i data-lucide="eye"></i> Acompanhar Aluno
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    // Update global unread badge in side nav
    const globalBadge = document.getElementById('global-unread-badge');
    if (globalUnread > 0) {
      globalBadge.textContent = globalUnread;
      globalBadge.classList.remove('hidden');
    } else {
      globalBadge.classList.add('hidden');
    }

    lucide.createIcons();
  } catch (err) {
    grid.innerHTML = `
      <div class="info-alert" style="grid-column: 1 / -1; border-color: var(--danger); background: rgba(239, 68, 68, 0.05); color: var(--danger);">
        <i data-lucide="alert-circle"></i>
        <span>Erro ao carregar lista de alunos: ${err.message}</span>
      </div>
    `;
    lucide.createIcons();
  }
}

// Handle Student Creation
async function handleCreateStudent(event) {
  event.preventDefault();
  
  const name = document.getElementById('new-student-name').value;
  const email = document.getElementById('new-student-email').value;
  const password = document.getElementById('new-student-password').value;
  const birthDate = document.getElementById('new-student-birth').value;
  const heightStr = document.getElementById('new-student-height').value;
  const targetWeightStr = document.getElementById('new-student-target').value;

  const height = heightStr ? parseFloat(heightStr) : null;
  const targetWeight = targetWeightStr ? parseFloat(targetWeightStr) : null;

  try {
    await API.post('/personal/students', {
      name, email, password, height, targetWeight, birthDate: birthDate || null
    });
    
    showToast('Aluno cadastrado com sucesso!', 'success');
    document.getElementById('create-student-form').reset();
    switchPersonalTab('students');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Open student detailed modal view
async function openStudentDetails(studentId) {
  selectedStudentId = studentId;
  
  // Show spinner inside modal
  document.getElementById('modal-sd-name').textContent = 'Carregando...';
  document.getElementById('modal-sd-email').textContent = '';
  document.getElementById('modal-sd-height').textContent = '-';
  document.getElementById('modal-sd-target').textContent = '-';
  document.getElementById('modal-sd-age').textContent = '-';
  document.getElementById('modal-sd-avatar').textContent = '';
  
  document.getElementById('modal-workouts-list').innerHTML = '<div class="spinner"></div>';
  document.getElementById('modal-measurements-table-body').innerHTML = '';
  
  openModal('modal-student-detail');
  switchModalSubtab('workouts'); // default active tab
  
  try {
    const details = await API.get(`/personal/students/${studentId}`);
    const student = details.student;
    
    // Fill profile info
    document.getElementById('modal-sd-name').textContent = student.name;
    document.getElementById('modal-sd-email').textContent = student.email;
    document.getElementById('modal-sd-avatar').textContent = student.name.charAt(0).toUpperCase();
    document.getElementById('modal-sd-height').textContent = student.height ? `${student.height} m` : '-';
    document.getElementById('modal-sd-target').textContent = student.target_weight ? `${student.target_weight} kg` : '-';
    
    if (student.birth_date) {
      const birth = new Date(student.birth_date);
      const ageDifMs = Date.now() - birth.getTime();
      const ageDate = new Date(ageDifMs);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      document.getElementById('modal-sd-age').textContent = `${age} anos`;
    } else {
      document.getElementById('modal-sd-age').textContent = '-';
    }

    // Render Workouts (Treinos)
    renderPersonalStudentWorkouts(details.workouts);

    // Render Measurements (Medidas e Evolução)
    renderPersonalStudentMeasurements(details.measurements);

    lucide.createIcons();
  } catch (err) {
    showToast(`Erro ao carregar detalhes: ${err.message}`, 'error');
    closeModal('modal-student-detail');
  }
}

// Switch detailed student tabs inside modal
function switchModalSubtab(subtab) {
  const tabWorkouts = document.getElementById('modal-tab-workouts');
  const tabMetrics = document.getElementById('modal-tab-metrics');
  const paneWorkouts = document.getElementById('modal-subpane-workouts');
  const paneMetrics = document.getElementById('modal-subpane-metrics');

  tabWorkouts.classList.remove('active');
  tabMetrics.classList.remove('active');
  paneWorkouts.classList.remove('active');
  paneMetrics.classList.remove('active');

  if (subtab === 'workouts') {
    tabWorkouts.classList.add('active');
    paneWorkouts.classList.add('active');
  } else {
    tabMetrics.classList.add('active');
    paneMetrics.classList.add('active');
  }
}

// Render student workouts list in the details modal
function renderPersonalStudentWorkouts(workouts) {
  const listContainer = document.getElementById('modal-workouts-list');
  if (workouts.length === 0) {
    listContainer.innerHTML = `
      <div class="chat-empty-state" style="padding: 20px;">
        <i data-lucide="dumbbell" class="chat-empty-icon text-gradient" style="width: 40px; height: 40px;"></i>
        <h4>Nenhum treino prescrito ainda</h4>
        <p>Use o botão "Criar Ficha de Treino" para adicionar a primeira ficha para o aluno.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  listContainer.innerHTML = '';
  workouts.forEach(workout => {
    const card = document.createElement('div');
    card.className = 'workout-card glass';

    let exercisesRows = '';
    if (workout.exercises.length === 0) {
      exercisesRows = `
        <div class="no-data-msg" style="padding: 10px;">
          Nenhum exercício cadastrado nesta ficha.
        </div>
      `;
    } else {
      workout.exercises.forEach(ex => {
        const weightText = ex.weight ? ex.weight : 'N/A';
        const restText = ex.rest_time ? ex.rest_time : 'N/A';
        const noteText = ex.notes ? `<div class="exercise-notes">${ex.notes}</div>` : '';
        
        const executionBtn = ex.gif_url 
          ? `<button class="btn-pill-action" onclick="openExerciseExecutionModal('${ex.name.replace(/'/g, "\\'")}', '${ex.gif_url}', '${(ex.exercise_description || '').replace(/'/g, "\\'")}')" style="margin-left: 8px;"><i data-lucide="play-circle"></i> Execução</button>` 
          : '';

        exercisesRows += `
          <div class="exercise-row">
            <div class="exercise-row-info">
              <div>
                <span class="exercise-name">${ex.name}</span>${executionBtn}
                ${noteText}
              </div>
              <div class="exercise-stats">
                <div class="exercise-stat-box">
                  <span class="exercise-stat-label">Séries</span>
                  <span class="exercise-stat-value">${ex.sets}</span>
                </div>
                <div class="exercise-stat-box">
                  <span class="exercise-stat-label">Reps</span>
                  <span class="exercise-stat-value">${ex.reps}</span>
                </div>
                <div class="exercise-stat-box">
                  <span class="exercise-stat-label">Carga</span>
                  <span class="exercise-stat-value">${weightText}</span>
                </div>
                <div class="exercise-stat-box">
                  <span class="exercise-stat-label">Pausa</span>
                  <span class="exercise-stat-value">${restText}</span>
                </div>
              </div>
            </div>
            <button class="btn-icon text-danger" onclick="deletePersonalExercise(${ex.id})" title="Remover Exercício">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        `;
      });
    }

    card.innerHTML = `
      <div class="workout-header">
        <div>
          <span class="workout-title">${workout.name}</span>
          ${workout.description ? `<p class="workout-desc">${workout.description}</p>` : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-accent btn-sm" onclick="openAddExercise(${workout.id})">
            <i data-lucide="plus"></i> Exercício
          </button>
          <button class="btn btn-danger btn-sm" onclick="deletePersonalWorkout(${workout.id})">
            <i data-lucide="trash-2"></i> Excluir Treino
          </button>
        </div>
      </div>
      <div class="exercises-list">
        ${exercisesRows}
      </div>
    `;

    listContainer.appendChild(card);
  });

  lucide.createIcons();
}

// Render student measurements list and build progress chart
function renderPersonalStudentMeasurements(measurements) {
  const tbody = document.getElementById('modal-measurements-table-body');
  const metricsGrid = document.getElementById('modal-latest-metrics-grid');
  tbody.innerHTML = '';
  
  if (measurements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data-msg">Nenhuma medição realizada pelo aluno.</td></tr>';
    metricsGrid.innerHTML = `
      <div class="no-data-msg" style="grid-column: 1/-1;">
        Nenhum dado de avaliação física.
      </div>
    `;
    plotSvgChart('modal-weight-chart-container', []);
    return;
  }

  // Draw table rows
  measurements.forEach(m => {
    const row = document.createElement('tr');
    const dateFormatted = new Date(m.recorded_at).toLocaleDateString('pt-BR');
    
    row.innerHTML = `
      <td>${dateFormatted}</td>
      <td style="font-weight:600; color:var(--accent-secondary);">${m.weight} kg</td>
      <td>${m.chest ? `${m.chest} cm` : '-'}</td>
      <td>${m.waist ? `${m.waist} cm` : '-'}</td>
      <td>${m.hips ? `${m.hips} cm` : '-'}</td>
      <td>${m.biceps_l || '-'} / ${m.biceps_r || '-'}</td>
      <td>${m.thigh_l || '-'} / ${m.thigh_r || '-'}</td>
    `;
    tbody.appendChild(row);
  });

  // Load latest metrics preview
  const latest = measurements[0];
  metricsGrid.innerHTML = `
    <div class="metric-item">
      <span class="metric-label">Peso</span>
      <span class="metric-value">${latest.weight} kg</span>
    </div>
    <div class="metric-item">
      <span class="metric-label">Cintura</span>
      <span class="metric-value">${latest.waist ? `${latest.waist} cm` : '-'}</span>
    </div>
    <div class="metric-item">
      <span class="metric-label">Tórax</span>
      <span class="metric-value">${latest.chest ? `${latest.chest} cm` : '-'}</span>
    </div>
    <div class="metric-item">
      <span class="metric-label">Quadril</span>
      <span class="metric-value">${latest.hips ? `${latest.hips} cm` : '-'}</span>
    </div>
  `;

  // Plot chart data
  // Reverse measurements to get chronological order for plotting
  const chartData = [...measurements].reverse().map(m => ({
    label: new Date(m.recorded_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
    value: m.weight
  }));

  plotSvgChart('modal-weight-chart-container', chartData);
}

// Custom Premium SVG Line Chart Plotter
function plotSvgChart(containerId, dataPoints) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (dataPoints.length === 0) {
    container.innerHTML = `<p class="no-data-msg">Nenhum dado disponível para plotagem.</p>`;
    return;
  }

  // Basic SVG parameters
  const padding = 35;
  const width = container.clientWidth || 300;
  const height = 180;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Extract min and max values to scale chart
  const weights = dataPoints.map(d => d.value);
  let maxVal = Math.max(...weights);
  let minVal = Math.min(...weights);
  
  // Padding weights slightly
  maxVal = maxVal + 1;
  minVal = Math.max(0, minVal - 1);
  const valRange = maxVal - minVal;

  // Calculate coordinates
  const coords = dataPoints.map((d, index) => {
    const x = padding + (index / Math.max(1, dataPoints.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((d.value - minVal) / (valRange || 1)) * chartHeight;
    return { x, y, label: d.label, val: d.value };
  });

  // Build the line path
  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    pathD += ` L ${coords[i].x} ${coords[i].y}`;
  }

  // Build area under the line path
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padding + chartHeight} L ${coords[0].x} ${padding + chartHeight} Z`;

  // Draw grid lines
  let gridLines = '';
  const gridSteps = 3;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padding + (i / gridSteps) * chartHeight;
    const val = maxVal - (i / gridSteps) * valRange;
    gridLines += `
      <line class="chart-grid-line" x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />
      <text class="chart-axis-text" x="${padding - 5}" y="${y + 3}" text-anchor="end">${val.toFixed(1)}</text>
    `;
  }

  // Draw x-axis labels
  let labels = '';
  // Avoid rendering too many labels if array is huge
  const labelInterval = Math.max(1, Math.ceil(dataPoints.length / 5));
  coords.forEach((coord, i) => {
    if (i % labelInterval === 0 || i === coords.length - 1) {
      labels += `
        <text class="chart-axis-text" x="${coord.x}" y="${height - 10}" text-anchor="middle">${coord.label}</text>
      `;
    }
  });

  // Interactive dots
  let dots = '';
  coords.forEach(coord => {
    dots += `
      <circle class="chart-dot" cx="${coord.cx || coord.x}" cy="${coord.cy || coord.y}" r="4" data-val="${coord.val}" title="${coord.val} kg">
        <title>${coord.label}: ${coord.val} kg</title>
      </circle>
    `;
  });

  // Construct final SVG
  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <defs>
        <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--accent-primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      
      <!-- Grid -->
      ${gridLines}
      
      <!-- Area Under Chart -->
      <path class="chart-area" d="${areaD}" />
      
      <!-- Line Path -->
      <path class="chart-line" d="${pathD}" />
      
      <!-- Dots -->
      ${dots}
      
      <!-- Labels -->
      ${labels}
    </svg>
  `;
}

// Workout & Exercises API Triggers

function openCreateWorkoutModal() {
  openModal('modal-create-workout');
}

async function handleCreateWorkoutSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('workout-name').value;
  const description = document.getElementById('workout-description').value;

  try {
    await API.post('/workouts', {
      studentId: selectedStudentId,
      name,
      description
    });

    showToast('Ficha de treino criada!', 'success');
    closeModal('modal-create-workout');
    document.getElementById('create-workout-form').reset();
    
    // Refresh student details in modal
    openStudentDetails(selectedStudentId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePersonalWorkout(workoutId) {
  if (!confirm('Deseja realmente remover esta ficha de treino inteira? Todos os exercícios vinculados serão excluídos.')) return;

  try {
    await API.delete(`/workouts/${workoutId}`);
    showToast('Treino excluído com sucesso!', 'success');
    openStudentDetails(selectedStudentId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openAddExercise(workoutId) {
  activeWorkoutId = workoutId;
  const select = document.getElementById('ex-select');
  select.innerHTML = '<option value="">-- Carregando biblioteca... --</option>';

  try {
    const list = await API.get('/catalog/exercises');
    select.innerHTML = '<option value="">-- Selecionar da Biblioteca --</option>';
    
    list.forEach(ex => {
      const option = document.createElement('option');
      option.value = ex.id;
      option.textContent = ex.name;
      option.setAttribute('data-name', ex.name);
      select.appendChild(option);
    });

    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Outro (Digitar Nome Customizado)';
    select.appendChild(customOption);

    // Reset layout
    document.getElementById('ex-custom-name-group').classList.add('hidden');
    document.getElementById('ex-name').required = false;
    document.getElementById('ex-name').value = '';

    openModal('modal-add-exercise');
  } catch (err) {
    showToast('Erro ao carregar catálogo: ' + err.message, 'error');
  }
}

// Trigger dropdown selection change in modal
function handleExerciseSelectChange(select) {
  const customGroup = document.getElementById('ex-custom-name-group');
  const customInput = document.getElementById('ex-name');
  
  if (select.value === 'custom') {
    customGroup.classList.remove('hidden');
    customInput.required = true;
    customInput.focus();
  } else {
    customGroup.classList.add('hidden');
    customInput.required = false;
    customInput.value = '';
  }
}

async function handleAddExerciseSubmit(event) {
  event.preventDefault();
  
  const select = document.getElementById('ex-select');
  const sets = document.getElementById('ex-sets').value;
  const reps = document.getElementById('ex-reps').value;
  const weight = document.getElementById('ex-weight').value;
  const restTime = document.getElementById('ex-rest').value;
  const notes = document.getElementById('ex-notes').value;

  let name = '';
  let exerciseId = null;

  if (select.value === 'custom') {
    name = document.getElementById('ex-name').value.trim();
  } else if (select.value) {
    const selectedOption = select.options[select.selectedIndex];
    name = selectedOption.getAttribute('data-name');
    exerciseId = parseInt(select.value);
  } else {
    showToast('Por favor, selecione um exercício da biblioteca.', 'error');
    return;
  }

  if (!name) {
    showToast('Nome do exercício é obrigatório.', 'error');
    return;
  }

  try {
    await API.post(`/workouts/${activeWorkoutId}/exercises`, {
      name, 
      sets: parseInt(sets), 
      reps, 
      weight, 
      restTime, 
      notes,
      exerciseId
    });

    showToast('Exercício adicionado!', 'success');
    closeModal('modal-add-exercise');
    document.getElementById('add-exercise-form').reset();
    openStudentDetails(selectedStudentId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePersonalExercise(exerciseId) {
  if (!confirm('Excluir este exercício?')) return;

  try {
    await API.delete(`/exercises/${exerciseId}`);
    showToast('Exercício removido!', 'success');
    openStudentDetails(selectedStudentId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Chat Central (Personal Trainer Dashboard)

// Loads the student threads list in Chat Central Sidebar
async function loadPersonalChatThreads() {
  const list = document.getElementById('chat-students-list');
  list.innerHTML = '<div class="spinner"></div>';

  try {
    personalStudents = await API.get('/personal/students');
    list.innerHTML = '';
    
    if (personalStudents.length === 0) {
      list.innerHTML = '<p class="no-data-msg" style="padding:10px;">Sem alunos para conversar.</p>';
      return;
    }

    personalStudents.forEach(student => {
      const thread = document.createElement('div');
      thread.className = `chat-thread-item ${activeChatStudentId === student.id ? 'active' : ''}`;
      thread.onclick = () => openPersonalChatThread(student.id, student.name);

      const unreadBadge = student.unread_messages > 0 
        ? `<span class="badge-count" style="margin-left: 10px;">${student.unread_messages}</span>` 
        : '';

      thread.innerHTML = `
        <div class="avatar">${student.name.charAt(0).toUpperCase()}</div>
        <div class="thread-details">
          <div class="thread-name">${student.name}</div>
          <div class="thread-preview">Ver histórico de conversa...</div>
        </div>
        ${unreadBadge}
      `;
      list.appendChild(thread);
    });

  } catch (err) {
    list.innerHTML = `<p class="no-data-msg" style="color:var(--danger);">${err.message}</p>`;
  }
}

// Activates chat box with specific student
async function openPersonalChatThread(studentId, studentName) {
  activeChatStudentId = studentId;

  // Add mobile class for responsive view sliding
  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer) {
    chatContainer.classList.add('show-window');
  }

  // Render chat sidebar active items correctly
  loadPersonalChatThreads();

  // Hide empty state and show active chat area
  document.getElementById('personal-chat-empty').classList.add('hidden');
  document.getElementById('personal-chat-active').classList.remove('hidden');

  document.getElementById('chat-active-name').textContent = studentName;
  document.getElementById('chat-active-avatar').textContent = studentName.charAt(0).toUpperCase();

  const chatMessagesBox = document.getElementById('personal-chat-messages');
  chatMessagesBox.innerHTML = '<div class="spinner"></div>';

  try {
    const messages = await API.get(`/chat/${studentId}`);
    chatMessagesBox.innerHTML = '';

    if (messages.length === 0) {
      chatMessagesBox.innerHTML = `
        <div class="no-data-msg" style="padding: 20px; align-self: center;">
          Inicie a conversa! Envie uma instrução ou mensagem de incentivo abaixo.
        </div>
      `;
    } else {
      messages.forEach(msg => {
        const bubble = document.createElement('div');
        const isMe = msg.sender_id.toString() !== studentId.toString();
        bubble.className = `chat-bubble ${isMe ? 'sent' : 'received'}`;
        
        const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        bubble.innerHTML = `${msg.message} <span class="chat-time">${time}</span>`;
        chatMessagesBox.appendChild(bubble);
      });
    }

    // Scroll to bottom
    chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;

    // Refresh general student list badges
    loadPersonalStudents();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Submit messages to student
async function sendPersonalChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById('personal-chat-input');
  const message = input.value.trim();

  if (message === '' || !activeChatStudentId) return;

  try {
    await API.post('/chat', {
      receiverId: activeChatStudentId,
      message
    });
    input.value = '';
    // EventSource (SSE) will trigger addition, but we fetch to sync instantly if desired.
    // However, to keep it slick, we empty the input and let SSE handle the rendering or just append instantly.
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Real-Time Append (Called by SSE triggers in app.js)
function appendPersonalLiveMessage(message) {
  // If the chat with this student is active, append it directly
  if (activeChatStudentId && 
      (message.sender_id.toString() === activeChatStudentId.toString() || 
       message.receiver_id.toString() === activeChatStudentId.toString())) {
    
    const chatMessagesBox = document.getElementById('personal-chat-messages');
    
    // Remove blank thread instructions if first message
    const emptyMsg = chatMessagesBox.querySelector('.no-data-msg');
    if (emptyMsg) emptyMsg.remove();

    const bubble = document.createElement('div');
    const isMe = message.sender_id.toString() !== activeChatStudentId.toString();
    bubble.className = `chat-bubble ${isMe ? 'sent' : 'received'}`;
    
    const time = new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `${message.message} <span class="chat-time">${time}</span>`;
    chatMessagesBox.appendChild(bubble);
    chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;

    // Send visual read receipt to backend silently since we are actively looking at the box
    if (!isMe) {
      API.get(`/chat/${activeChatStudentId}`).catch(() => {});
    }
  } else {
    // If we are looking at another screen or another chat, show toast and refresh badge numbers
    const cachedUser = API.getCurrentUser();
    if (cachedUser && message.sender_id.toString() !== cachedUser.id.toString()) {
      showToast(`Nova mensagem recebida!`, 'info');
    }
  }

  // Refresh thread lists & badges in background
  loadPersonalStudents();
  if (document.getElementById('tab-p-chat').classList.contains('active')) {
    loadPersonalChatThreads();
  }
}

// Mobile responsive back button logic
function closeChatThreadMobile() {
  activeChatStudentId = null;
  const container = document.querySelector('.chat-container');
  if (container) {
    container.classList.remove('show-window');
  }
  loadPersonalChatThreads();
}

// Reset Student Password
async function promptResetPassword() {
  const newPassword = prompt('Digite a nova senha para o aluno (mínimo 6 caracteres):');
  if (!newPassword) return; 

  if (newPassword.length < 6) {
    showToast('A senha precisa ter pelo menos 6 caracteres', 'error');
    return;
  }

  try {
    await API.post(`/personal/students/${selectedStudentId}/reset-password`, { newPassword });
    showToast('Senha redefinida com sucesso!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// LIBRARY / DATABASE OF EXERCISES MANAGEMENT (PERSONAL TRAINER LIBRARY)
// ==========================================================================

async function loadPersonalExercises() {
  const container = document.getElementById('exercises-catalog-list');
  container.innerHTML = `
    <div class="loading-placeholder" style="grid-column: 1 / -1;">
      <div class="spinner"></div>
      <span>Carregando biblioteca de exercícios...</span>
    </div>
  `;

  try {
    const list = await API.get('/catalog/exercises');
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state glass" style="grid-column: 1 / -1; padding: 40px;">
          <i data-lucide="dumbbell" class="chat-empty-icon" style="width: 40px; height: 40px;"></i>
          <h3>Sua biblioteca está vazia</h3>
          <p>Cadastre seu primeiro exercício personalizado clicando no botão "Novo Exercício".</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    list.forEach(ex => {
      const card = document.createElement('div');
      card.className = 'exercise-db-card glass';

      const thumb = ex.gif_url 
        ? `<img src="${ex.gif_url}" class="exercise-thumb" alt="Exercício" />`
        : `<div class="exercise-thumb" style="display:flex; align-items:center; justify-content:center;"><i data-lucide="dumbbell" style="width:18px; color:var(--text-muted);"></i></div>`;

      const descText = ex.description ? ex.description : 'Sem orientações técnicas cadastradas.';

      card.innerHTML = `
        <div class="exercise-db-info">
          ${thumb}
          <div class="exercise-db-details">
            <h4>${ex.name}</h4>
            <p>${descText}</p>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${ex.gif_url ? `<button class="btn btn-tertiary btn-sm" onclick="openExerciseExecutionModal('${ex.name.replace(/'/g, "\\'")}', '${ex.gif_url}', '${descText.replace(/'/g, "\\'")}')" title="Testar Popup"><i data-lucide="eye"></i></button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteCatalogExercise(${ex.id})" title="Excluir da Biblioteca">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `
      <div class="info-alert" style="grid-column: 1 / -1; border-color: var(--danger); background: rgba(239, 68, 68, 0.05); color: var(--danger);">
        <i data-lucide="alert-circle"></i>
        <span>Erro ao carregar catálogo: ${err.message}</span>
      </div>
    `;
    lucide.createIcons();
  }
}

function openCreateCatalogExerciseModal() {
  document.getElementById('create-catalog-exercise-form').reset();
  document.getElementById('cat-ex-base64').value = '';
  openModal('modal-create-catalog-exercise');
}

// Convert uploaded file to Base64 data URL
function handleCatalogGifFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  // Clear text input to prevent confusion
  document.getElementById('cat-ex-gif-url').value = '';

  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('cat-ex-base64').value = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Clear file selection when typing URL
function handleCatalogGifUrlInput() {
  document.getElementById('cat-ex-gif-file').value = '';
  document.getElementById('cat-ex-base64').value = '';
}

async function handleCreateCatalogExerciseSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('cat-ex-name').value.trim();
  const description = document.getElementById('cat-ex-description').value.trim();
  const urlVal = document.getElementById('cat-ex-gif-url').value.trim();
  const base64Val = document.getElementById('cat-ex-base64').value;

  const gifUrl = base64Val || urlVal || null;

  if (!name) {
    showToast('O nome do exercício é obrigatório.', 'error');
    return;
  }

  try {
    await API.post('/catalog/exercises', {
      name,
      description,
      gifUrl
    });

    showToast('Exercício criado com sucesso!', 'success');
    closeModal('modal-create-catalog-exercise');
    loadPersonalExercises();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCatalogExercise(id) {
  if (!confirm('Deseja realmente excluir este exercício do seu catálogo? Isso não apagará históricos de treinos passados, mas removerá o vínculo ao GIF de execução.')) return;

  try {
    await API.delete(`/catalog/exercises/${id}`);
    showToast('Exercício removido da biblioteca!', 'success');
    loadPersonalExercises();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
