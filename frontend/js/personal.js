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

      if (student.unread_messages > 0) {
        card.appendChild(SafeDOM.el('div', { className: 'badge-unread-chat', text: student.unread_messages }));
      }

      const studentName = String(student.name ?? '');
      card.appendChild(SafeDOM.el('div', { className: 'student-card-header' }, [
        SafeDOM.el('div', { className: 'avatar', text: studentName.charAt(0).toUpperCase() }),
        SafeDOM.el('div', {}, [
          SafeDOM.el('h3', { text: studentName }),
          SafeDOM.el('p', { text: student.email })
        ])
      ]));

      const stat = (label, value) => SafeDOM.el('div', { className: 'student-stat' }, [
        SafeDOM.el('span', { className: 'student-stat-title', text: label }),
        SafeDOM.el('span', { className: 'student-stat-value', text: value })
      ]);
      card.appendChild(SafeDOM.el('div', { className: 'student-stats-row' }, [
        stat('Peso Atual', weightVal),
        stat('Altura', heightVal),
        stat('Idade', ageText)
      ]));

      const detailsButton = SafeDOM.el('button', {
        className: 'btn btn-primary btn-full btn-sm',
        on: { click: () => openStudentDetails(student.id) }
      }, [SafeDOM.icon('eye'), ' Acompanhar Aluno']);
      card.appendChild(SafeDOM.el('div', { className: 'student-card-actions' }, [detailsButton]));

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
    SafeDOM.clear(grid);
    grid.appendChild(SafeDOM.errorAlert('Erro ao carregar lista de alunos: ', err.message, { gridColumn: '1 / -1' }));
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

    const titleBlock = SafeDOM.el('div', {}, [
      SafeDOM.el('span', { className: 'workout-title', text: workout.name })
    ]);
    if (workout.description) {
      titleBlock.appendChild(SafeDOM.el('p', { className: 'workout-desc', text: workout.description }));
    }

    const addButton = SafeDOM.el('button', {
      className: 'btn btn-accent btn-sm',
      on: { click: () => openAddExercise(workout.id) }
    }, [SafeDOM.icon('plus'), ' Exercício']);
    const deleteButton = SafeDOM.el('button', {
      className: 'btn btn-danger btn-sm',
      on: { click: () => deletePersonalWorkout(workout.id) }
    }, [SafeDOM.icon('trash-2'), ' Excluir Treino']);
    card.appendChild(SafeDOM.el('div', { className: 'workout-header' }, [
      titleBlock,
      SafeDOM.el('div', { style: { display: 'flex', gap: '8px' } }, [addButton, deleteButton])
    ]));

    const exercisesList = SafeDOM.el('div', { className: 'exercises-list' });
    if (workout.exercises.length === 0) {
      exercisesList.appendChild(SafeDOM.el('div', {
        className: 'no-data-msg',
        text: 'Nenhum exercício cadastrado nesta ficha.',
        style: { padding: '10px' }
      }));
    } else {
      workout.exercises.forEach(ex => {
        const nameBlock = SafeDOM.el('div', {}, [
          SafeDOM.el('span', { className: 'exercise-name', text: ex.name })
        ]);
        if (ex.gif_url) {
          nameBlock.appendChild(SafeDOM.el('button', {
            className: 'btn-pill-action',
            style: { marginLeft: '8px' },
            on: { click: () => openExerciseExecutionModal(ex.name, ex.gif_url, ex.exercise_description || '') }
          }, [SafeDOM.icon('play-circle'), ' Execução']));
        }
        if (ex.notes) nameBlock.appendChild(SafeDOM.el('div', { className: 'exercise-notes', text: ex.notes }));

        const stat = (label, value) => SafeDOM.el('div', { className: 'exercise-stat-box' }, [
          SafeDOM.el('span', { className: 'exercise-stat-label', text: label }),
          SafeDOM.el('span', { className: 'exercise-stat-value', text: value })
        ]);
        const info = SafeDOM.el('div', { className: 'exercise-row-info' }, [
          nameBlock,
          SafeDOM.el('div', { className: 'exercise-stats' }, [
            stat('Séries', ex.sets),
            stat('Reps', ex.reps),
            stat('Carga', ex.weight || 'N/A'),
            stat('Pausa', ex.rest_time || 'N/A')
          ])
        ]);
        const removeButton = SafeDOM.el('button', {
          className: 'btn-icon text-danger',
          attrs: { title: 'Remover Exercício' },
          on: { click: () => deletePersonalExercise(ex.id) }
        }, [SafeDOM.icon('trash-2')]);
        exercisesList.appendChild(SafeDOM.el('div', { className: 'exercise-row' }, [info, removeButton]));
      });
    }
    card.appendChild(exercisesList);

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
    SafeDOM.appendChildren(row, [
      SafeDOM.el('td', { text: dateFormatted }),
      SafeDOM.el('td', { text: `${m.weight} kg`, style: { fontWeight: '600', color: 'var(--accent-secondary)' } }),
      SafeDOM.el('td', { text: m.chest ? `${m.chest} cm` : '-' }),
      SafeDOM.el('td', { text: m.waist ? `${m.waist} cm` : '-' }),
      SafeDOM.el('td', { text: m.hips ? `${m.hips} cm` : '-' }),
      SafeDOM.el('td', { text: `${m.biceps_l || '-'} / ${m.biceps_r || '-'}` }),
      SafeDOM.el('td', { text: `${m.thigh_l || '-'} / ${m.thigh_r || '-'}` })
    ]);
    tbody.appendChild(row);
  });

  // Load latest metrics preview
  const latest = measurements[0];
  SafeDOM.clear(metricsGrid);
  SafeDOM.appendChildren(metricsGrid, [
    SafeDOM.metricItem('Peso', `${latest.weight} kg`),
    SafeDOM.metricItem('Cintura', latest.waist ? `${latest.waist} cm` : '-'),
    SafeDOM.metricItem('Tórax', latest.chest ? `${latest.chest} cm` : '-'),
    SafeDOM.metricItem('Quadril', latest.hips ? `${latest.hips} cm` : '-')
  ]);

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

  const normalizedPoints = dataPoints
    .map(point => ({ label: String(point.label ?? ''), value: Number(point.value) }))
    .filter(point => Number.isFinite(point.value));

  if (normalizedPoints.length === 0) {
    SafeDOM.clear(container);
    container.appendChild(SafeDOM.el('p', { className: 'no-data-msg', text: 'Nenhum dado disponível para plotagem.' }));
    return;
  }

  // Basic SVG parameters
  const padding = 35;
  const width = container.clientWidth || 300;
  const height = 180;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Extract min and max values to scale chart
  const weights = normalizedPoints.map(d => d.value);
  let maxVal = Math.max(...weights);
  let minVal = Math.min(...weights);
  
  // Padding weights slightly
  maxVal = maxVal + 1;
  minVal = Math.max(0, minVal - 1);
  const valRange = maxVal - minVal;

  // Calculate coordinates
  const coords = normalizedPoints.map((d, index) => {
    const x = padding + (index / Math.max(1, normalizedPoints.length - 1)) * chartWidth;
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

  const svg = SafeDOM.svgEl('svg', {
    class: 'chart-svg',
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height: '100%'
  });

  // Draw grid lines
  const gridSteps = 3;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padding + (i / gridSteps) * chartHeight;
    const val = maxVal - (i / gridSteps) * valRange;
    svg.appendChild(SafeDOM.svgEl('line', {
      class: 'chart-grid-line', x1: padding, y1: y, x2: width - padding, y2: y
    }));
    svg.appendChild(SafeDOM.svgEl('text', {
      class: 'chart-axis-text', x: padding - 5, y: y + 3, 'text-anchor': 'end'
    }, val.toFixed(1)));
  }

  svg.appendChild(SafeDOM.svgEl('path', { class: 'chart-area', d: areaD }));
  svg.appendChild(SafeDOM.svgEl('path', { class: 'chart-line', d: pathD }));

  // Interactive dots
  coords.forEach(coord => {
    const circle = SafeDOM.svgEl('circle', {
      class: 'chart-dot', cx: coord.x, cy: coord.y, r: 4, 'data-val': coord.val
    });
    circle.appendChild(SafeDOM.svgEl('title', {}, `${coord.label}: ${coord.val} kg`));
    svg.appendChild(circle);
  });

  // Draw x-axis labels
  // Avoid rendering too many labels if array is huge
  const labelInterval = Math.max(1, Math.ceil(normalizedPoints.length / 5));
  coords.forEach((coord, i) => {
    if (i % labelInterval === 0 || i === coords.length - 1) {
      svg.appendChild(SafeDOM.svgEl('text', {
        class: 'chart-axis-text', x: coord.x, y: height - 10, 'text-anchor': 'middle'
      }, coord.label));
    }
  });

  SafeDOM.clear(container);
  container.appendChild(svg);
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
      const studentName = String(student.name ?? '');
      SafeDOM.appendChildren(thread, [
        SafeDOM.el('div', { className: 'avatar', text: studentName.charAt(0).toUpperCase() }),
        SafeDOM.el('div', { className: 'thread-details' }, [
          SafeDOM.el('div', { className: 'thread-name', text: studentName }),
          SafeDOM.el('div', { className: 'thread-preview', text: 'Ver histórico de conversa...' })
        ])
      ]);
      if (student.unread_messages > 0) {
        thread.appendChild(SafeDOM.el('span', {
          className: 'badge-count',
          text: student.unread_messages,
          style: { marginLeft: '10px' }
        }));
      }
      list.appendChild(thread);
    });

  } catch (err) {
    SafeDOM.clear(list);
    list.appendChild(SafeDOM.el('p', {
      className: 'no-data-msg',
      text: err.message,
      style: { color: 'var(--danger)' }
    }));
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
        const isMe = msg.sender_id.toString() !== studentId.toString();
        const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const bubble = SafeDOM.chatBubble(msg.message, time, isMe ? 'sent' : 'received');
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

    const isMe = message.sender_id.toString() !== activeChatStudentId.toString();
    const time = new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const bubble = SafeDOM.chatBubble(message.message, time, isMe ? 'sent' : 'received');
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
  const newPassword = prompt('Digite a nova senha para o aluno (mínimo 10 caracteres):');
  if (!newPassword) return; 

  if (newPassword.length < 10) {
    showToast('A senha precisa ter pelo menos 10 caracteres', 'error');
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
      const descText = ex.description ? ex.description : 'Sem orientações técnicas cadastradas.';
      const image = SafeDOM.el('img', {
        className: 'exercise-thumb',
        attrs: { alt: 'Exercício' }
      });
      const hasSafeImage = SafeDOM.setSafeImageSource(image, ex.gif_url);
      const thumb = hasSafeImage
        ? image
        : SafeDOM.el('div', {
            className: 'exercise-thumb',
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center' }
          }, [SafeDOM.icon('dumbbell')]);

      const info = SafeDOM.el('div', { className: 'exercise-db-info' }, [
        thumb,
        SafeDOM.el('div', { className: 'exercise-db-details' }, [
          SafeDOM.el('h4', { text: ex.name }),
          SafeDOM.el('p', { text: descText })
        ])
      ]);
      const actions = SafeDOM.el('div', { style: { display: 'flex', gap: '6px' } });
      if (hasSafeImage) {
        actions.appendChild(SafeDOM.el('button', {
          className: 'btn btn-tertiary btn-sm',
          attrs: { title: 'Testar Popup' },
          on: { click: () => openExerciseExecutionModal(ex.name, ex.gif_url, descText) }
        }, [SafeDOM.icon('eye')]));
      }
      actions.appendChild(SafeDOM.el('button', {
        className: 'btn btn-danger btn-sm',
        attrs: { title: 'Excluir da Biblioteca' },
        on: { click: () => deleteCatalogExercise(ex.id) }
      }, [SafeDOM.icon('trash-2')]));
      SafeDOM.appendChildren(card, [info, actions]);
      container.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    SafeDOM.clear(container);
    container.appendChild(SafeDOM.errorAlert('Erro ao carregar catálogo: ', err.message, { gridColumn: '1 / -1' }));
    lucide.createIcons();
  }
}

function openCreateCatalogExerciseModal() {
  document.getElementById('create-catalog-exercise-form').reset();
  document.getElementById('cat-ex-base64').value = '';
  openModal('modal-create-catalog-exercise');
}

const CATALOG_IMAGE_TYPES = new Set(['image/gif', 'image/png', 'image/jpeg', 'image/webp']);
const CATALOG_IMAGE_MAX_FILE_SIZE = 380 * 1024;

// Convert an allowed, bounded raster image to a Base64 data URL.
function handleCatalogGifFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  if (!CATALOG_IMAGE_TYPES.has(file.type)) {
    input.value = '';
    document.getElementById('cat-ex-base64').value = '';
    showToast('Use uma imagem GIF, PNG, JPEG ou WebP.', 'error');
    return;
  }

  if (file.size > CATALOG_IMAGE_MAX_FILE_SIZE) {
    input.value = '';
    document.getElementById('cat-ex-base64').value = '';
    showToast('A imagem deve ter no máximo 380 KB.', 'error');
    return;
  }

  // Clear text input to prevent confusion
  document.getElementById('cat-ex-gif-url').value = '';

  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('cat-ex-base64').value = e.target.result;
  };
  reader.onerror = function() {
    input.value = '';
    document.getElementById('cat-ex-base64').value = '';
    showToast('Não foi possível ler a imagem selecionada.', 'error');
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
