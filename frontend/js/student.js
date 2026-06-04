// FitLife Sync - Student Dashboard Logic

let studentWorkouts = [];
let studentMeasurements = [];
let personalTrainerId = null;

// Loads student workouts from server and renders checklists
async function loadStudentWorkouts() {
  const container = document.getElementById('student-workouts-container');
  container.innerHTML = `
    <div class="loading-placeholder">
      <div class="spinner"></div>
      <span>Carregando sua ficha de treinos...</span>
    </div>
  `;

  try {
    studentWorkouts = await API.get('/student/workouts');
    
    if (studentWorkouts.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state glass" style="padding: 50px;">
          <i data-lucide="dumbbell" class="chat-empty-icon" style="width: 50px; height: 50px; color: var(--text-muted);"></i>
          <h3>Nenhum treino prescrito</h3>
          <p>Seu Personal Trainer ainda não criou sua ficha de treinos. Fale com ele via chat!</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    container.innerHTML = '';
    studentWorkouts.forEach(workout => {
      // Save personal trainer ID if we don't have it yet, helps with chat mapping
      personalTrainerId = workout.personal_id;

      const card = document.createElement('div');
      card.className = 'workout-card glass';

      let exerciseRows = '';
      if (workout.exercises.length === 0) {
        exerciseRows = '<tr><td colspan="7" class="no-data-msg">Nenhum exercício cadastrado nesta ficha.</td></tr>';
      } else {
        workout.exercises.forEach(ex => {
          const weightVal = ex.weight ? ex.weight : 'Sem carga';
          const restVal = ex.rest_time ? ex.rest_time : 'Sem pausa';
          const noteText = ex.notes ? `<div class="exercise-notes">${ex.notes}</div>` : '';
          
          // Check if cached as checked in local storage
          const isChecked = localStorage.getItem(`fitlife_chk_${ex.id}`) === 'true';
          const checkedAttr = isChecked ? 'checked' : '';

          const executionBtn = ex.gif_url 
            ? `<button class="btn-pill-action" onclick="openExerciseExecutionModal('${ex.name.replace(/'/g, "\\'")}', '${ex.gif_url}', '${(ex.exercise_description || '').replace(/'/g, "\\'")}')"><i data-lucide="play-circle"></i> Ver execução</button>`
            : `<button class="btn-pill-action" disabled title="Sem GIF de execução"><i data-lucide="help-circle"></i> Sem GIF</button>`;

          exerciseRows += `
            <tr id="ex-row-${ex.id}">
              <td style="width: 50px; text-align: center; vertical-align: middle;">
                <label class="checkbox-container" style="padding-left: 18px; margin: 0 auto; display: inline-block;">
                  <input type="checkbox" ${checkedAttr} onchange="toggleExerciseCheck(${ex.id}, this)">
                  <span class="checkmark" style="left: 0;"></span>
                </label>
              </td>
              <td>
                <span class="exercise-name ${isChecked ? 'strike-completed' : ''}" id="ex-name-${ex.id}" style="font-weight:600;">${ex.name}</span>
                ${noteText}
              </td>
              <td style="font-weight: 600; vertical-align: middle;">${ex.sets}</td>
              <td style="vertical-align: middle;">${ex.reps}</td>
              <td style="color: var(--text-muted); vertical-align: middle;">${weightVal}</td>
              <td style="color: var(--text-muted); vertical-align: middle;">${restVal}</td>
              <td style="vertical-align: middle;">${executionBtn}</td>
            </tr>
          `;
        });
      }

      card.innerHTML = `
        <div class="workout-header">
          <div>
            <span class="workout-title">${workout.name}</span>
            ${workout.description ? `<p class="workout-desc">${workout.description}</p>` : ''}
          </div>
        </div>
        
        <div class="pedagogical-table-wrapper">
          <table class="pedagogical-table">
            <thead>
              <tr>
                <th style="width: 60px; text-align: center;">Status</th>
                <th>Exercício</th>
                <th>Séries</th>
                <th>Repetições</th>
                <th>Carga</th>
                <th>Descanso</th>
                <th style="width: 150px;">Execução</th>
              </tr>
            </thead>
            <tbody>
              ${exerciseRows}
            </tbody>
          </table>
        </div>
      `;

      container.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `
      <div class="info-alert" style="border-color: var(--danger); background: rgba(239, 68, 68, 0.05); color: var(--danger);">
        <i data-lucide="alert-circle"></i>
        <span>Erro ao carregar treinos: ${err.message}</span>
      </div>
    `;
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
  
  tbody.innerHTML = '<tr><td colspan="7"><div class="spinner" style="margin: 10px auto;"></div></td></tr>';

  try {
    studentMeasurements = await API.get('/student/measurements');
    tbody.innerHTML = '';

    if (studentMeasurements.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data-msg">Nenhuma medida cadastrada. Clique em "Adicionar Medidas" para registrar!</td></tr>';
      metricsGrid.innerHTML = `
        <div class="no-data-msg" style="grid-column: 1 / -1;">
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

    // Populate dashboard cards
    const latest = studentMeasurements[0];
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

    // Extract weights chronological trends
    const chartData = [...studentMeasurements].reverse().map(m => ({
      label: new Date(m.recorded_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
      value: m.weight
    }));

    plotSvgChart('weight-chart-container', chartData);

  } catch (err) {
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
        <div class="no-data-msg" style="padding: 20px; align-self: center;">
          Inicie o papo! Mande um alô para seu Personal Trainer aqui.
        </div>
      `;
    } else {
      messages.forEach(msg => {
        const bubble = document.createElement('div');
        const cachedUser = API.getCurrentUser();
        const isMe = cachedUser && msg.sender_id.toString() === cachedUser.id.toString();
        bubble.className = `chat-bubble ${isMe ? 'sent' : 'received'}`;

        const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        bubble.innerHTML = `${msg.message} <span class="chat-time">${time}</span>`;
        box.appendChild(bubble);
      });
    }

    box.scrollTop = box.scrollHeight;
    
    // Clear notification badge
    document.getElementById('student-unread-badge').classList.add('hidden');
  } catch (err) {
    box.innerHTML = `<p class="no-data-msg" style="color:var(--danger);">${err.message}</p>`;
  }
}

// Send message to coach
async function sendStudentChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById('student-chat-input');
  const message = input.value.trim();

  if (message === '') return;

  try {
    await API.post('/chat', { message });
    input.value = '';
  } catch (err) {
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

    const bubble = document.createElement('div');
    const cachedUser = API.getCurrentUser();
    const isMe = cachedUser && message.sender_id.toString() === cachedUser.id.toString();
    bubble.className = `chat-bubble ${isMe ? 'sent' : 'received'}`;

    const time = new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `${message.message} <span class="chat-time">${time}</span>`;
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
