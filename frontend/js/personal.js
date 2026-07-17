// FitLife Sync - Personal Trainer Logic

let personalStudents = [];
let selectedStudentId = null;
let activeWorkoutId = null;
let activeChatStudentId = null;

function normalizeListSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function filterRenderedList({ containerId, cardSelector, emptyId, countId, query }) {
  const normalizedQuery = normalizeListSearch(query);
  const cards = Array.from(document.getElementById(containerId).querySelectorAll(cardSelector));
  let visible = 0;
  cards.forEach(card => {
    const matches = !normalizedQuery || card.dataset.search.includes(normalizedQuery);
    card.classList.toggle('hidden', !matches);
    if (matches) visible += 1;
  });
  document.getElementById(countId).textContent = `${visible} de ${cards.length}`;
  document.getElementById(emptyId).classList.toggle('hidden', !normalizedQuery || visible > 0);
}

function filterPersonalStudents(query) {
  filterRenderedList({ containerId: 'students-grid', cardSelector: '.student-card', emptyId: 'students-search-empty', countId: 'students-search-count', query });
}

function filterPersonalExercises(query) {
  filterRenderedList({ containerId: 'exercises-catalog-list', cardSelector: '.exercise-db-card', emptyId: 'exercises-search-empty', countId: 'exercises-search-count', query });
}

function sortRenderedList(containerId, cardSelector, compare) {
  const container = document.getElementById(containerId);
  Array.from(container.querySelectorAll(cardSelector)).sort(compare).forEach(card => container.appendChild(card));
}

function sortPersonalStudents(value) {
  sortRenderedList('students-grid', '.student-card', (a, b) => {
    if (value === 'unread') return Number(b.dataset.unread) - Number(a.dataset.unread) || a.dataset.sortName.localeCompare(b.dataset.sortName, 'pt-BR');
    const direction = value === 'name-desc' ? -1 : 1;
    return direction * a.dataset.sortName.localeCompare(b.dataset.sortName, 'pt-BR');
  });
  filterPersonalStudents(document.getElementById('students-search').value);
}

function sortPersonalExercises(value) {
  sortRenderedList('exercises-catalog-list', '.exercise-db-card', (a, b) => {
    const direction = value === 'name-desc' ? -1 : 1;
    return direction * a.dataset.sortName.localeCompare(b.dataset.sortName, 'pt-BR');
  });
  filterPersonalExercises(document.getElementById('exercises-search').value);
}

// Renders the list of students in the Personal Dashboard
async function loadPersonalStudents() {
  const grid = document.getElementById('students-grid');
  renderLoadingSkeletons(grid, { count: 3, variant: 'student', label: 'Carregando lista de alunos' });

  try {
    personalStudents = await API.get('/personal/students');
    finishLoadingState(grid);
    document.getElementById('stat-total-students').textContent = personalStudents.length;
    const globalUnread = personalStudents.reduce((total, student) => total + (student.unread_messages || 0), 0);
    document.getElementById('stat-unread-messages').textContent = globalUnread;

    if (personalStudents.length === 0) {
      grid.innerHTML = `
        <div class="chat-empty-state glass grid-span-full empty-state-large">
          <i data-lucide="users" class="chat-empty-icon text-gradient icon-50"></i>
          <h3>Nenhum aluno cadastrado</h3>
          <p>Crie o primeiro acesso para seus alunos usando a aba "Cadastrar Aluno" na barra lateral.</p>
        </div>
      `;
      appendEmptyStateAction(grid, { label: 'Cadastrar primeiro aluno', icon: 'user-plus', onClick: () => switchPersonalTab('create') });
      lucide.createIcons();
      filterPersonalStudents(document.getElementById('students-search').value);
      return;
    }

    grid.innerHTML = '';
    personalStudents.forEach(student => {
      const card = document.createElement('div');
      card.className = 'student-card glass';
      card.dataset.search = normalizeListSearch(`${student.name} ${student.email}`);
      card.dataset.sortName = normalizeListSearch(student.name);
      card.dataset.unread = String(student.unread_messages || 0);
      
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
    sortPersonalStudents(document.getElementById('students-sort').value);
    filterPersonalStudents(document.getElementById('students-search').value);
  } catch (err) {
    finishLoadingState(grid);
    SafeDOM.clear(grid);
    grid.appendChild(SafeDOM.errorAlert('Erro ao carregar lista de alunos: ', err.message, 'grid-span-full'));
    lucide.createIcons();
  }
}

// Handle Student Creation
async function handleCreateStudent(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  clearFormError(form.id);
  setFormSubmitting(form, true);
  
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
    setFormError(form.id, err.message);
    showToast(err.message, 'error');
  } finally {
    setFormSubmitting(form, false);
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
  
  renderLoadingSkeletons(document.getElementById('modal-workouts-list'), { count: 2, variant: 'workout', label: 'Carregando treinos do aluno' });
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
  syncTabGroup(
    ['modal-tab-workouts', 'modal-tab-metrics'],
    ['modal-subpane-workouts', 'modal-subpane-metrics'],
    subtab === 'workouts' ? 'modal-tab-workouts' : 'modal-tab-metrics'
  );
}

// Render student workouts list in the details modal
function renderPersonalStudentWorkouts(workouts) {
  const listContainer = document.getElementById('modal-workouts-list');
  if (workouts.length === 0) {
    listContainer.innerHTML = `
      <div class="chat-empty-state empty-state-medium">
        <i data-lucide="dumbbell" class="chat-empty-icon text-gradient icon-40"></i>
        <h4>Nenhum treino prescrito ainda</h4>
        <p>Use o botão "Criar Ficha de Treino" para adicionar a primeira ficha para o aluno.</p>
      </div>
    `;
    appendEmptyStateAction(listContainer, { label: 'Criar primeira ficha', icon: 'plus-circle', onClick: () => openCreateWorkoutModal() });
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
      on: { click: () => deletePersonalWorkout(workout.id, workout.name) }
    }, [SafeDOM.icon('trash-2'), ' Excluir Treino']);
    card.appendChild(SafeDOM.el('div', { className: 'workout-header' }, [
      titleBlock,
      SafeDOM.el('div', { className: 'inline-actions' }, [addButton, deleteButton])
    ]));

    const exercisesList = SafeDOM.el('div', { className: 'exercises-list' });
    if (workout.exercises.length === 0) {
      exercisesList.appendChild(SafeDOM.el('div', {
        className: 'no-data-msg compact-empty-state',
        text: 'Nenhum exercício cadastrado nesta ficha.'
      }));
    } else {
      workout.exercises.forEach(ex => {
        const nameBlock = SafeDOM.el('div', {}, [
          SafeDOM.el('span', { className: 'exercise-name', text: ex.name })
        ]);
        if (ex.gif_url) {
          nameBlock.appendChild(SafeDOM.el('button', {
            className: 'btn-pill-action execution-inline-action',
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
          attrs: { title: 'Remover Exercício', 'aria-label': `Remover ${ex.name} do treino` },
          on: { click: () => deletePersonalExercise(ex.id, ex.name) }
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
      <div class="no-data-msg grid-span-full">
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
      SafeDOM.el('td', { text: `${m.weight} kg`, className: 'metric-weight-value' }),
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
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  clearFormError(form.id);
  setFormSubmitting(form, true);
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
    setFormError(form.id, err.message);
    showToast(err.message, 'error');
  } finally {
    setFormSubmitting(form, false);
  }
}

function deletePersonalWorkout(workoutId, workoutName) {
  openDestructiveConfirmation({
    title: 'Excluir ficha de treino?',
    message: `A ficha “${workoutName}” e todos os exercícios vinculados serão excluídos permanentemente.`,
    confirmLabel: 'Excluir treino',
    returnModalId: 'modal-student-detail',
    action: async () => {
      await API.delete(`/workouts/${workoutId}`);
      showToast('Treino excluído com sucesso!', 'success');
      return () => openStudentDetails(selectedStudentId);
    }
  });
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
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  clearFormError(form.id);
  
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
    const message = 'Por favor, selecione um exercício da biblioteca.';
    setFormError(form.id, message);
    showToast(message, 'error');
    return;
  }

  if (!name) {
    const message = 'Nome do exercício é obrigatório.';
    setFormError(form.id, message);
    showToast(message, 'error');
    return;
  }

  setFormSubmitting(form, true);
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
    setFormError(form.id, err.message);
    showToast(err.message, 'error');
  } finally {
    setFormSubmitting(form, false);
  }
}

function deletePersonalExercise(exerciseId, exerciseName) {
  openDestructiveConfirmation({
    title: 'Remover exercício do treino?',
    message: `O exercício “${exerciseName}” será removido desta ficha de treino.`,
    confirmLabel: 'Remover exercício',
    returnModalId: 'modal-student-detail',
    action: async () => {
      await API.delete(`/exercises/${exerciseId}`);
      showToast('Exercício removido!', 'success');
      return () => openStudentDetails(selectedStudentId);
    }
  });
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
      list.innerHTML = '<p class="no-data-msg compact-empty-state">Sem alunos para conversar.</p>';
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
          className: 'badge-count thread-unread-badge',
          text: student.unread_messages
        }));
      }
      list.appendChild(thread);
    });

  } catch (err) {
    SafeDOM.clear(list);
    list.appendChild(SafeDOM.el('p', {
      className: 'no-data-msg text-danger',
      text: err.message
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
        <div class="no-data-msg chat-empty-message">
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
  const form = event.target;
  const input = document.getElementById('personal-chat-input');
  const message = input.value.trim();

  if (message === '' || !activeChatStudentId) return;

  setChatSendState(form, 'sending', 'Enviando...');
  try {
    await API.post('/chat', {
      receiverId: activeChatStudentId,
      message
    });
    input.value = '';
    setChatSendState(form, 'sent', 'Mensagem enviada.');
  } catch (err) {
    setChatSendState(form, 'failed', 'Falha no envio. Tente novamente.');
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
function openResetPasswordModal() {
  if (!selectedStudentId) return;

  const form = document.getElementById('reset-password-form');
  form?.reset();
  clearFormError('reset-password-form');
  closeModal('modal-student-detail');
  openModal('modal-reset-password');
}

function closeResetPasswordModal() {
  closeModal('modal-reset-password');
}

async function handleResetPasswordSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true' || !selectedStudentId) return;

  const passwordInput = document.getElementById('reset-student-password');
  const confirmationInput = document.getElementById('reset-student-password-confirm');
  const newPassword = passwordInput.value;
  const confirmation = confirmationInput.value;
  clearFormError(form.id);

  if (newPassword.length < 10) {
    setFormError(form.id, 'A senha precisa ter pelo menos 10 caracteres.');
    passwordInput.focus();
    return;
  }
  if (newPassword !== confirmation) {
    setFormError(form.id, 'As senhas informadas não coincidem.');
    confirmationInput.focus();
    return;
  }

  setFormSubmitting(form, true);
  try {
    await API.post(`/personal/students/${selectedStudentId}/reset-password`, { newPassword });
    closeResetPasswordModal();
    showToast('Senha redefinida com sucesso!', 'success');
  } catch (err) {
    setFormError(form.id, err.message);
    showToast('Não foi possível redefinir a senha.', 'error');
  } finally {
    setFormSubmitting(form, false);
  }
}

// ==========================================================================
// LIBRARY / DATABASE OF EXERCISES MANAGEMENT (PERSONAL TRAINER LIBRARY)
// ==========================================================================

async function loadPersonalExercises() {
  const container = document.getElementById('exercises-catalog-list');
  renderLoadingSkeletons(container, { count: 4, variant: 'exercise', label: 'Carregando biblioteca de exercícios' });

  try {
    const list = await API.get('/catalog/exercises');
    finishLoadingState(container);
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state glass grid-span-full empty-state-catalog">
          <i data-lucide="dumbbell" class="chat-empty-icon icon-40"></i>
          <h3>Sua biblioteca está vazia</h3>
          <p>Cadastre seu primeiro exercício personalizado clicando no botão "Novo Exercício".</p>
        </div>
      `;
      appendEmptyStateAction(container, { label: 'Criar primeiro exercício', icon: 'plus-circle', onClick: () => openCreateCatalogExerciseModal() });
      lucide.createIcons();
      filterPersonalExercises(document.getElementById('exercises-search').value);
      return;
    }

    list.forEach(ex => {
      const card = document.createElement('div');
      card.className = 'exercise-db-card glass';
      const descText = ex.description ? ex.description : 'Sem orientações técnicas cadastradas.';
      card.dataset.search = normalizeListSearch(`${ex.name} ${descText}`);
      card.dataset.sortName = normalizeListSearch(ex.name);
      const image = SafeDOM.el('img', {
        className: 'exercise-thumb',
        attrs: { alt: 'Exercício' }
      });
      const hasSafeImage = SafeDOM.setSafeImageSource(image, ex.gif_url);
      const thumb = hasSafeImage
        ? image
        : SafeDOM.el('div', {
            className: 'exercise-thumb exercise-thumb-placeholder'
          }, [SafeDOM.icon('dumbbell')]);

      const info = SafeDOM.el('div', { className: 'exercise-db-info' }, [
        thumb,
        SafeDOM.el('div', { className: 'exercise-db-details' }, [
          SafeDOM.el('h4', { text: ex.name }),
          SafeDOM.el('p', { text: descText })
        ])
      ]);
      const actions = SafeDOM.el('div', { className: 'catalog-actions' });
      if (hasSafeImage) {
        actions.appendChild(SafeDOM.el('button', {
          className: 'btn btn-tertiary btn-sm',
          attrs: { title: 'Visualizar execução', 'aria-label': `Visualizar execução de ${ex.name}` },
          on: { click: () => openExerciseExecutionModal(ex.name, ex.gif_url, descText) }
        }, [SafeDOM.icon('eye')]));
      }
      actions.appendChild(SafeDOM.el('button', {
        className: 'btn btn-danger btn-sm',
        attrs: { title: 'Excluir da biblioteca', 'aria-label': `Excluir ${ex.name} da biblioteca` },
        on: { click: () => deleteCatalogExercise(ex.id, ex.name) }
      }, [SafeDOM.icon('trash-2')]));
      SafeDOM.appendChildren(card, [info, actions]);
      container.appendChild(card);
    });

    lucide.createIcons();
    sortPersonalExercises(document.getElementById('exercises-sort').value);
    filterPersonalExercises(document.getElementById('exercises-search').value);
  } catch (err) {
    finishLoadingState(container);
    SafeDOM.clear(container);
    container.appendChild(SafeDOM.errorAlert('Erro ao carregar catálogo: ', err.message, 'grid-span-full'));
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
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  clearFormError(form.id);

  const name = document.getElementById('cat-ex-name').value.trim();
  const description = document.getElementById('cat-ex-description').value.trim();
  const urlVal = document.getElementById('cat-ex-gif-url').value.trim();
  const base64Val = document.getElementById('cat-ex-base64').value;

  const gifUrl = base64Val || urlVal || null;

  if (!name) {
    const message = 'O nome do exercício é obrigatório.';
    setFormError(form.id, message);
    showToast(message, 'error');
    return;
  }

  setFormSubmitting(form, true);
  try {
    await API.post('/catalog/exercises', {
      name,
      description,
      gifUrl
    });

    showToast('Exercício criado com sucesso!', 'success');
    closeModal('modal-create-catalog-exercise');
    form.reset();
    loadPersonalExercises();
  } catch (err) {
    setFormError(form.id, err.message);
    showToast(err.message, 'error');
  } finally {
    setFormSubmitting(form, false);
  }
}

function deleteCatalogExercise(id, exerciseName) {
  openDestructiveConfirmation({
    title: 'Excluir exercício do catálogo?',
    message: `“${exerciseName}” será removido do catálogo e perderá o vínculo com a mídia de execução. Os históricos de treinos serão preservados.`,
    confirmLabel: 'Excluir do catálogo',
    action: async () => {
      await API.delete(`/catalog/exercises/${id}`);
      showToast('Exercício removido da biblioteca!', 'success');
      return () => loadPersonalExercises();
    }
  });
}
