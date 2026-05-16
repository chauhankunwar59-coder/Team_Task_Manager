document.addEventListener('DOMContentLoaded', async () => {
  initPageChrome();
  requireAuth();
  const user = getCurrentUser();
  if (!user) { logout(); return; }

  document.getElementById('user-name').textContent  = user.name;
  document.getElementById('user-email').textContent = user.email;
  const roleEl = document.getElementById('user-account-role');
  if (roleEl) {
    roleEl.innerHTML = user.account_role === 'ADMIN'
      ? '<span class="badge badge-lead">Project Lead</span>'
      : '<span class="badge badge-tasker">Tasker</span>';
  }
  setUserAvatar(document.getElementById('user-avatar'), user.name);
  document.getElementById('logout-btn').addEventListener('click', logout);

  const hubIcon = document.getElementById('hub-llm-icon');
  const projIcon = document.getElementById('proj-llm-icon');
  if (hubIcon && typeof Icons !== 'undefined') hubIcon.innerHTML = Icons.sparkles;
  if (projIcon && typeof Icons !== 'undefined') projIcon.innerHTML = Icons.sparkles;

  if (!isAccountAdmin()) {
    document.getElementById('create-project-btn')?.classList.add('hidden');
    document.querySelector('.role-legend')?.classList.add('hidden');
  }

  const createBtn     = document.getElementById('create-project-btn');
  const modal         = document.getElementById('create-project-modal');
  const closeModal    = document.getElementById('close-modal');
  const cancelCreate  = document.getElementById('cancel-create');
  const createForm    = document.getElementById('create-project-form');

  createBtn.addEventListener('click', () => modal.classList.add('open'));
  closeModal.addEventListener('click', () => modal.classList.remove('open'));
  cancelCreate.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  document.getElementById('ai-project-desc-btn')?.addEventListener('click', generateProjectDescription);
  document.getElementById('hub-llm-refresh')?.addEventListener('click', runHubLlmInsight);

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = createForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await API.post('/projects/', {
        name:        createForm.proj_name.value.trim(),
        description: createForm.proj_desc.value.trim() || null,
      });
      modal.classList.remove('open');
      createForm.reset();
      document.getElementById('proj-llm-status')?.classList.add('hidden');
      showToast('Project created successfully', 'success');
      loadWorkHub();
    } catch (ex) {
      showToast(ex.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  window.refreshPageData = loadWorkHub;
  loadWorkHub();
});

async function loadWorkHub() {
  try {
    const [stats, projects] = await Promise.all([
      API.get('/tasks/dashboard'),
      API.get('/projects/'),
    ]);
    renderStats(stats);
    renderMyTasks(stats.my_tasks);
    renderProjects(projects);
    renderRoleSummary(projects);
    if (typeof renderCharts === 'function') renderCharts(stats, projects);
  } catch (ex) {
    showToast('Failed to load work hub: ' + ex.message, 'error');
  }
}

function renderRoleSummary(projects) {
  const el = document.getElementById('user-role-summary');
  if (!el) return;
  if (!projects.length) {
    el.textContent = 'No project roles yet';
    return;
  }
  const leads = projects.filter(p => p.my_role === 'ADMIN').length;
  const tasker = projects.filter(p => p.my_role === 'MEMBER').length;
  const parts = [];
  if (leads) parts.push(`Lead on ${leads}`);
  if (tasker) parts.push(`Tasker on ${tasker}`);
  el.textContent = parts.join(' · ') || 'Member';
}

function renderStats(stats) {
  document.getElementById('stat-total').textContent    = stats.total_tasks;
  document.getElementById('stat-progress').textContent = stats.in_progress;
  document.getElementById('stat-done').textContent     = stats.done;
  document.getElementById('stat-overdue').textContent  = stats.overdue;
}

function renderMyTasks(tasks) {
  const el = document.getElementById('my-tasks-list');
  const badge = document.getElementById('my-tasks-badge');
  badge.textContent = tasks.length;

  if (!tasks.length) {
    el.innerHTML = emptyState('No deliverables assigned to you yet.');
    return;
  }

  el.innerHTML = tasks.slice(0, 8).map(t => {
    const overdue = isOverdue(t.due_date, t.status);
    return `
      <div class="task-item ${overdue ? 'overdue' : ''}" onclick="window.location.href='/project?id=${t.project_id}'">
        <div class="task-info">
          <div class="task-title">${escHtml(t.title)}</div>
          <div class="task-meta">
            ${statusBadge(t.status)}
            ${priorityBadge(t.priority)}
            ${t.due_date ? `<span class="task-due${overdue ? ' overdue' : ''}">${Icons.calendar} ${formatDate(t.due_date)}${overdue ? ' · Overdue' : ''}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderProjects(projects) {
  const el = document.getElementById('projects-grid');
  const badge = document.getElementById('projects-badge');
  badge.textContent = projects.length;

  if (!projects.length) {
    el.innerHTML = emptyState('No initiatives yet. Create your first project to get started.');
    return;
  }

  el.innerHTML = projects.map(p => {
    const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
    return `
      <div class="project-card" onclick="window.location.href='/project?id=${p.id}'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <h3>${escHtml(p.name)}</h3>
          ${roleBadge(p.my_role)}
        </div>
        <p>${escHtml(p.description || 'No description')}</p>
        <div class="project-meta">
          <span>${p.member_count} member${p.member_count !== 1 ? 's' : ''}</span>
          <span>${p.done_count} / ${p.task_count} completed</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

async function generateProjectDescription() {
  const name = document.getElementById('proj_name')?.value.trim();
  const statusEl = document.getElementById('proj-llm-status');
  const descEl = document.getElementById('proj_desc');
  if (!name) {
    showToast('Enter a project name first', 'error');
    return;
  }
  const btn = document.getElementById('ai-project-desc-btn');
  btn.disabled = true;
  statusEl.classList.remove('hidden');
  statusEl.textContent = 'LLM generating…';
  try {
    const res = await API.post('/ai/project-description', {
      name,
      context: document.getElementById('proj_ai_context')?.value.trim() || null,
    });
    descEl.value = res.description;
    statusEl.innerHTML = escHtml(res.description) + `<div class="llm-source">${res.source === 'llm' ? 'OpenAI' : 'Built-in assistant'}</div>`;
    showToast('Description generated', 'success');
  } catch (ex) {
    statusEl.textContent = ex.message;
    showToast(ex.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function runHubLlmInsight() {
  const out = document.getElementById('hub-llm-output');
  const btn = document.getElementById('hub-llm-refresh');
  btn.disabled = true;
  out.classList.remove('hidden');
  out.textContent = 'Analyzing…';
  try {
    const stats = await API.get('/tasks/dashboard');
    const projects = await API.get('/projects/');
    const leadN = projects.filter(p => p.my_role === 'ADMIN').length;
    const lines = [
      `You have ${stats.total_tasks} assigned deliverable(s): ${stats.in_progress} in progress, ${stats.done} done, ${stats.overdue} overdue.`,
      `Across ${projects.length} initiative(s) — Project Lead on ${leadN}, Tasker on ${projects.length - leadN}.`,
    ];
    if (stats.overdue > 0) lines.push('Priority: clear overdue items or ask your Project Lead for an extension.');
    if (stats.total_tasks === 0) lines.push('No assignments yet — check Active initiatives or ask your lead to assign work.');
    if (projects.length && stats.in_progress === 0 && stats.total_tasks > 0) {
      lines.push('LLM tip: move one task to In progress to signal active work to stakeholders.');
    }
    out.innerHTML = lines.map(l => `<p style="margin-bottom:8px">${escHtml(l)}</p>`).join('')
      + '<div class="llm-source">Built-in assistant</div>';
  } catch (ex) {
    out.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let taskStatusChart = null;
let projectProgressChart = null;

function renderCharts(stats, projects) {
  if (typeof Chart === 'undefined') return;
  
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  Chart.defaults.color = isDark ? '#958da8' : '#64748b';
  Chart.defaults.font.family = "var(--font)";
  if (Chart.defaults.scale && Chart.defaults.scale.grid) {
    Chart.defaults.scale.grid.color = isDark ? '#241f32' : '#e2e8f0';
  }

  const ctxStatus = document.getElementById('task-status-chart');
  if (ctxStatus) {
    if (taskStatusChart) taskStatusChart.destroy();
    
    const todoCount = Math.max(0, stats.total_tasks - stats.done - stats.in_progress);
    
    // Only render if there's actual data, else show empty doughnut
    const hasData = stats.total_tasks > 0;
    
    taskStatusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: hasData ? ['Done', 'In Progress', 'To Do'] : ['No Tasks'],
        datasets: [{
          data: hasData ? [stats.done, stats.in_progress, todoCount] : [1],
          backgroundColor: hasData ? [
            '#34d399', // success
            '#fbbf24', // warning
            isDark ? '#262233' : '#e2e8f0' // to do
          ] : [isDark ? '#262233' : '#e2e8f0'],
          borderWidth: isDark ? 2 : 1,
          borderColor: isDark ? '#16141f' : '#ffffff',
          hoverOffset: hasData ? 4 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom',
            labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' }
          },
          tooltip: { enabled: hasData }
        },
        cutout: '75%',
        animation: { animateScale: true }
      }
    });
  }

  const ctxProject = document.getElementById('project-progress-chart');
  if (ctxProject) {
    if (projectProgressChart) projectProgressChart.destroy();
    
    if (projects.length > 0) {
      const topProjects = projects.slice(0, 6);
      
      projectProgressChart = new Chart(ctxProject, {
        type: 'bar',
        data: {
          labels: topProjects.map(p => p.name.length > 12 ? p.name.substring(0, 12) + '...' : p.name),
          datasets: [
            {
              label: 'Completed',
              data: topProjects.map(p => p.done_count),
              backgroundColor: '#8b5cf6', // accent
              borderRadius: 4,
              barPercentage: 0.6
            },
            {
              label: 'Total Tasks',
              data: topProjects.map(p => p.task_count),
              backgroundColor: isDark ? '#262233' : '#e2e8f0',
              borderRadius: 4,
              barPercentage: 0.6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { 
              beginAtZero: true, 
              ticks: { precision: 0, stepSize: 1 },
              border: { display: false }
            },
            x: { 
              grid: { display: false },
              border: { display: false }
            }
          },
          plugins: {
            legend: { 
              position: 'bottom',
              labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' }
            }
          },
          interaction: {
            mode: 'index',
            intersect: false,
          }
        }
      });
    } else {
      // Empty chart state for projects
      projectProgressChart = new Chart(ctxProject, {
        type: 'bar',
        data: { labels: ['No Projects'], datasets: [{ data: [0] }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { y: { display: false }, x: { display: false } }
        }
      });
    }
  }
}
