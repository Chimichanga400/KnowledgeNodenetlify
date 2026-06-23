/**
 * StudyPlanView.js — Final
 * Fixes:
 *  - Checkbox no longer collapses dropdown (partial re-render instead of full refresh)
 *  - Breaks shown in schedule with visual separator
 *  - Timer integrated into Start Today's Study Session
 *  - Better schedule layout — tasks breathe, hierarchy clear
 *  - Empty node creation from plan
 *  - Past days never added (fixed in StudyPlan.js dateStr)
 */

const StudyPlanView = {
  _plan:              null,
  _rebalanceChanges:  [],
  _openDays:          new Set(), // track which <details> are open

  init() {},

  refresh() {
    const incoming = PlanStore.getActive();
    // If the plan changed (new or deleted), reset delegation so the new
    // container gets a fresh listener binding on next _bindEvents() call.
    if (incoming?.id !== this._plan?.id) this._delegated = false;
    this._plan = incoming;
    if (this._plan) this._checkRebalanceDirty();
    this._render();
  },

  _checkRebalanceDirty() {
    if (!this._plan) return;
    // Only run the full rebalance when something that affects it has changed.
    // Rebalance is O(sessions × nodes) — too expensive to run on every nav tap.
    const fp = nodeStore.getAll()
      .map(n => n.id + ':' + n.masteryScore + ':' + (n.updatedAt || 0))
      .join('|');
    if (fp === this._rebalanceFp) return; // nothing changed
    this._rebalanceFp = fp;
    const changes = PlanEngine.rebalance(this._plan, nodeStore.getAll());
    if (changes.length) this._rebalanceChanges = changes;

    // Deferred-load safety valve: warn (once per dirty cycle) if the backlog
    // from light days can no longer fit before the exam.
    try {
      if (typeof PlanEngine.checkDeferredFit === 'function') {
        const fit = PlanEngine.checkDeferredFit(this._plan);
        if (fit && !fit.fits && typeof Toast !== 'undefined') Toast.warn(fit.message);
      }
    } catch (_) {}
  },

  // ─── Full render (only on load / plan change, NOT on checkbox) ──────

  _render() {
    const container = document.getElementById('studyplan-body');
    if (!container) return;

    if (!this._plan) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📅</span>
          <p>No active study plan yet.</p>
          <button class="btn-primary" style="margin-top:16px;" id="sp-create-btn">+ Create Study Plan</button>
        </div>`;
      document.getElementById('sp-create-btn')?.addEventListener('click', () => StudyPlanBuilder.open());
      return;
    }

    const plan     = this._plan;
    const today    = StudyPlan._dateStr(new Date());
    const examStr  = new Date(plan.examDate + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
    const daysLeft = plan.daysRemaining;
    const pct      = plan.progressPct;

    // Auto-open today's day
    this._openDays.add(today);

    const rebalanceBanner = this._rebalanceChanges.length ? `
      <div class="rebalance-banner">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:18px;">⬡</span>
          <div style="flex:1;">
            <div style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--accent);margin-bottom:5px;">Plan Update Available</div>
            <div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);margin-bottom:8px;">${this._rebalanceChanges.length} task${this._rebalanceChanges.length!==1?'s':''} can be adjusted based on your recent performance:</div>
            <ul style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin:0;padding-left:16px;">
              ${this._rebalanceChanges.slice(0,3).map(c=>`<li style="margin-bottom:3px;">${this._esc(c.reason)}</li>`).join('')}
              ${this._rebalanceChanges.length > 3 ? `<li style="color:var(--accent);">+${this._rebalanceChanges.length-3} more…</li>` : ''}
            </ul>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn-primary" style="font-size:12px;padding:8px 16px;" id="apply-rebalance">Apply all</button>
          <button class="btn-secondary" style="font-size:12px;padding:8px 16px;" id="dismiss-rebalance">Dismiss</button>
        </div>
      </div>` : '';

    container.innerHTML = `
      ${rebalanceBanner}

      <!-- PLAN HEADER -->
      <div class="sp-header">
        <div class="sp-title-row">
          <div>
            <h3 class="sp-title">${this._esc(plan.title)}</h3>
            <p class="sp-meta">
              Exam: <strong>${examStr}</strong> ·
              <span style="color:${daysLeft<=7?'var(--red)':daysLeft<=14?'var(--accent)':'var(--green)'};">${daysLeft} days left</span>
              ${plan.aiGenerated ? ' · <span style="color:var(--accent);">⬡ AI</span>' : ''}
            </p>
          </div>
          <div class="sp-header-actions">
            <button class="btn-secondary sp-action-btn" id="sp-edit-plan-btn">✏ Edit</button>
            <button class="btn-secondary sp-action-btn" id="sp-new-plan-btn">🔄 New</button>
            <button class="btn-secondary sp-action-btn sp-delete-btn" id="sp-delete-btn">🗑</button>
          </div>
        </div>

        <!-- Progress -->
        <div class="sp-progress-row">
          <div class="progress-track" style="flex:1;height:6px;">
            <div class="progress-fill" style="width:${pct}%;height:6px;"></div>
          </div>
          <span class="sp-progress-label">${pct}% · ${plan.completedTasks}/${plan.totalTasks}</span>
        </div>

        ${plan.aiRationale ? `
          <details class="sp-rationale">
            <summary>⬡ AI Rationale ▾</summary>
            <p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.65;margin-top:8px;">${this._esc(plan.aiRationale)}</p>
          </details>` : ''}
      </div>

      <!-- START SESSION — integrated timer -->
      <button class="btn-primary" id="sp-start-session-btn"
        style="width:100%;justify-content:center;padding:16px;font-size:15px;margin-bottom:24px;border-radius:var(--radius-lg);">
        ▶ Start Today's Study Session
      </button>

      <!-- FULL CALENDAR -->
      <div class="notes-section-title" style="margin-bottom:16px;">Full Schedule</div>
      <div id="sp-calendar">
        ${plan.days.map(day => this._renderDayCard(day, today)).join('')}
      </div>
    `;

    this._bindEvents();
    this._bindDayToggles(); // re-bind after innerHTML rebuild
  },

  _bindEvents() {
    // All listeners on the stable container — set once, never re-bound on refresh.
    // This replaces per-element querySelectorAll().forEach() which rebound on every render.
    if (this._delegated) return;
    this._delegated = true;
    const container = document.getElementById('studyplan-body');
    if (!container) return;

    container.addEventListener('click', e => {
      const t = e.target;

      if (t.id === 'apply-rebalance' || t.closest('#apply-rebalance')) {
        PlanEngine.applyRebalance(this._plan, this._rebalanceChanges);
        PlanStore.save(this._plan);
        this._rebalanceChanges = [];
        Toast.success('Plan updated!');
        this._render(); return;
      }
      if (t.id === 'dismiss-rebalance') { this._rebalanceChanges = []; this._render(); return; }
      if (t.id === 'sp-edit-plan-btn')  { this._openEditPlanModal(); return; }
      if (t.id === 'sp-new-plan-btn' || t.id === 'sp-create-btn') { StudyPlanBuilder.open(); return; }
      if (t.id === 'sp-delete-btn')     { this._confirmDelete(); return; }
      if (t.id === 'sp-start-session-btn') { this._startIntegratedSession(); return; }

      const launchBtn = t.closest('.task-launch-btn');
      if (launchBtn) { this._launchTask(launchBtn.dataset.nodeId, launchBtn.dataset.activity); return; }

      const addBtn = t.closest('.sp-add-task-btn');
      if (addBtn) { this._openAddTaskModal(addBtn.dataset.dayDate); return; }
    });

    container.addEventListener('change', e => {
      const cb = e.target.closest('.task-check');
      if (cb) this._toggleTaskPartial(cb);
    });

    // Day card open/closed state — <details> toggle doesn't bubble, needs direct binding.
    // Re-applied each render since <details> elements are recreated in innerHTML.
    // Wrapped here rather than in _render() to keep all event logic in one place.
    this._bindDayToggles();
  },

  /** Re-bind <details> toggle listeners after innerHTML rebuild.
   *  toggle events don't bubble, so event delegation can't catch them. */
  _bindDayToggles() {
    document.querySelectorAll('.plan-day-card').forEach(el => {
      el.addEventListener('toggle', () => {
        const date = el.dataset.date;
        if (date) {
          if (el.open) this._openDays.add(date);
          else this._openDays.delete(date);
        }
      });
    });
  },

  // ─── Day card rendering ────────────────────────────────

  _renderDayCard(day, today) {
    const dateObj   = new Date(day.date + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
    const isPast    = day.date < today;
    const isToday   = day.date === today;
    const isDone    = day.isComplete;
    const shouldOpen= this._openDays.has(day.date);

    // Build task + break timeline
    const timeline = this._renderTimeline(day, isToday, isPast);

    // Stats row
    const doneTasks  = day.tasks.filter(t=>t.done).length;
    const totalTasks = day.tasks.length;
    const totalBreakMins = (day.breaks||[]).reduce((s,b)=>s+b.durationMins,0);

    return `
      <details class="plan-day-card" data-date="${day.date}" ${shouldOpen ? 'open' : ''}>
        <summary class="plan-day-summary">
          <div class="plan-day-left">
            <span class="sp-day-label ${isToday?'today':isPast?'past':''}">${dateLabel}</span>
            ${isToday  ? '<span class="sp-today-badge">TODAY</span>' : ''}
            ${isDone   ? '<span class="sp-done-badge">✓</span>'     : ''}
          </div>
          <div class="plan-day-right">
            <span class="plan-day-stats">${totalTasks} task${totalTasks!==1?'s':''} · ${day.totalMins}m${totalBreakMins ? ` + ${totalBreakMins}m break` : ''}</span>
            ${doneTasks > 0 ? `<span class="plan-day-progress-text">${doneTasks}/${totalTasks}</span>` : ''}
            <span class="sp-chevron">›</span>
          </div>
        </summary>

        <!-- Progress bar inside day card -->
        ${totalTasks > 0 ? `
          <div style="padding:0 16px;">
            <div class="mastery-bar-track" style="height:3px;border-radius:0;">
              <div class="mastery-bar-fill" style="width:${Math.round((doneTasks/totalTasks)*100)}%;height:3px;border-radius:0;"></div>
            </div>
          </div>` : ''}

        <div class="sp-day-body">
          ${timeline}
          ${isToday || !isPast ? `<button class="sp-add-task-btn" data-day-date="${day.date}">+ Add Task</button>` : ''}
        </div>
      </details>`;
  },

  _renderTimeline(day, isToday, isPast) {
    if (!day.tasks.length) return '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);padding:8px 0;">No tasks scheduled.</p>';

    const actLabel = { review:'Review', recall:'Recall', application:'Apply', summary:'Summary', lecture:'Lecture', competency:'Test' };
    const actIcon  = t => ({ review:'📖', recall:'🔁', application:'🧩', summary:'📝', lecture:'🎓', competency:'🏆' }[t]||'📌');

    const breakMap = {};
    (day.breaks||[]).forEach(b => { breakMap[b.afterTaskIndex] = b.durationMins; });

    // Group tasks by module prefix (e.g. "M1" from "M1.2 - Gross Income")
    const getModuleGroup = title => {
      const match = (title || '').match(/^(M\d+|Module\s*\d+)/i);
      return match ? match[1].toUpperCase().replace(/\s+/g,'') : null;
    };

    let html = '';
    let lastGroup = null;

    day.tasks.forEach((task, idx) => {
      const isDone       = task.done;
      const isLaunchable = !isDone && !isPast && task.nodeId && !task.nodeId.startsWith('competency_');
      const isTestable   = !isDone && task.nodeId?.startsWith('competency_');
      const group        = getModuleGroup(task.nodeTitle);

      // Insert module group header when group changes
      if (group && group !== lastGroup) {
        html += `<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;
                   text-transform:uppercase;letter-spacing:.08em;color:var(--accent);
                   padding:8px 0 4px;margin-top:${lastGroup ? '8px' : '0'};">
                   ${this._esc(group)}
                 </div>`;
        lastGroup = group;
      }

      html += `
        <div class="sp-task-row ${isDone ? 'done' : ''}" data-task-id="${task.id}">
          <input type="checkbox" class="task-check"
            data-day-date="${day.date}" data-task-id="${task.id}"
            ${isDone ? 'checked' : ''}
            style="accent-color:var(--accent);width:18px;height:18px;flex-shrink:0;cursor:pointer;"/>
          <span class="sp-task-icon">${actIcon(task.activityType)}</span>
          <div class="sp-task-info">
            <div class="sp-task-title ${isDone ? 'done-text' : ''}">${this._esc(task.nodeTitle)}</div>
            <div class="sp-task-meta">${actLabel[task.activityType]||task.activityType} · ${task.estimatedMins} min</div>
          </div>
          <div class="sp-task-actions">
            <span class="priority-dot priority-${task.priority}"></span>
            ${isLaunchable ? `<button class="task-launch-btn sp-open-btn" data-node-id="${task.nodeId}" data-activity="${task.activityType}">Open</button>` : ''}
            ${isTestable   ? `<button class="task-launch-btn sp-test-btn" data-node-id="${task.nodeId}" data-activity="competency">🏆 Test</button>` : ''}
          </div>
        </div>`;

      // Insert break separator after this task if needed
      if (breakMap[idx] !== undefined) {
        html += `
          <div class="sp-break-row">
            <div class="sp-break-line"></div>
            <div class="sp-break-badge">
              ☕ ${breakMap[idx]} min break
            </div>
            <div class="sp-break-line"></div>
          </div>`;
      }
    });

    return html;
  },

  // ─── Partial checkbox update (no full re-render = no collapse) ──────

  _toggleTaskPartial(cb) {
    const date   = cb.dataset.dayDate;
    const taskId = cb.dataset.taskId;
    const done   = cb.checked;

    // Update data
    const day  = this._plan.days.find(d => d.date === date);
    const task = day?.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.done   = done;
    task.doneAt = done ? Date.now() : null;
    PlanStore.save(this._plan);
    if (done) StreakTracker.recordActivity();

    // Partial DOM update — only update the task row appearance
    const row = cb.closest('.sp-task-row');
    if (row) {
      row.classList.toggle('done', done);
      const titleEl = row.querySelector('.sp-task-title');
      if (titleEl) titleEl.classList.toggle('done-text', done);
    }

    // Update the day card's progress bar and stats — without closing it
    this._updateDayCardProgress(date);

    // Update overall plan progress
    this._updatePlanProgress();
  },

  _updateDayCardProgress(date) {
    const day = this._plan.days.find(d => d.date === date);
    if (!day) return;
    const done  = day.tasks.filter(t=>t.done).length;
    const total = day.tasks.length;
    const pct   = total ? Math.round((done/total)*100) : 0;

    // Find the day card by data-date attribute
    const card = document.querySelector(`.plan-day-card[data-date="${date}"]`);
    if (!card) return;

    // Update progress bar inside card
    const bar = card.querySelector('.mastery-bar-fill');
    if (bar) bar.style.width = pct + '%';

    // Update done badge in summary
    const summary = card.querySelector('.plan-day-summary');
    const existingDone = summary?.querySelector('.sp-done-badge');
    if (pct === 100 && !existingDone) {
      const badge = document.createElement('span');
      badge.className = 'sp-done-badge';
      badge.textContent = '✓';
      summary?.querySelector('.plan-day-left')?.appendChild(badge);
    }

    // Update task count text
    const statsEl = card.querySelector('.plan-day-progress-text');
    if (statsEl) { statsEl.textContent = `${done}/${total}`; }
    else if (done > 0) {
      const statsArea = card.querySelector('.plan-day-right');
      if (statsArea) {
        const span = document.createElement('span');
        span.className = 'plan-day-progress-text';
        span.textContent = `${done}/${total}`;
        statsArea.insertBefore(span, statsArea.querySelector('.sp-chevron'));
      }
    }
  },

  _updatePlanProgress() {
    const pct   = this._plan.progressPct;
    const done  = this._plan.completedTasks;
    const total = this._plan.totalTasks;
    const bar   = document.querySelector('#studyplan-body .progress-fill');
    const label = document.querySelector('#studyplan-body .sp-progress-label');
    if (bar)   bar.style.width = pct + '%';
    if (label) label.textContent = `${pct}% · ${done}/${total}`;
  },

  // ─── Integrated timer session ─────────────────────────

  _startIntegratedSession() {
    const today    = StudyPlan._dateStr(new Date());
    const dayPlan  = this._plan?.days.find(d => d.date === today);
    const pending  = dayPlan?.tasks.filter(t => !t.done) || [];

    if (!pending.length) { Toast.info("Today's tasks are all done! 🎉"); return; }

    const sessionMins = this._plan.sessionMins || 45;
    const breakMins   = sessionMins <= 25 ? 5 : sessionMins <= 45 ? 10 : sessionMins <= 60 ? 15 : 20;

    // Build session queue from today's pending tasks
    const queue = [...pending];
    let currentIdx = 0;

    const launchNext = () => {
      if (currentIdx >= queue.length) {
        Toast.success("All of today's tasks complete! Great session. 🎉");
        StudySession._endSession?.();
        return;
      }
      const task = queue[currentIdx];
      Toast.info(`Starting: ${task.nodeTitle} — ${task.activityType} (${task.estimatedMins} min)`);
      this._launchTask(task.nodeId, task.activityType);
      currentIdx++;
    };

    // Start the session timer with integrated callbacks
    StudySession._sessionLen  = sessionMins * 60;
    StudySession._breakLen    = breakMins * 60;
    StudySession._elapsed     = 0;
    StudySession._phase       = 'studying';
    StudySession._onBreakEnd  = () => {
      Toast.info('Break over! Continuing session… 📚');
      launchNext();
    };
    StudySession._showOverlay();
    StudySession._tick();

    // Launch first task
    launchNext();
  },

  // ─── Task launch ─────────────────────────────────────

  _launchTask(nodeId, activity) {
    if (!nodeId) return;
    if (nodeId.startsWith('competency_')) { CompetencyView.open(nodeId.replace('competency_','')); return; }
    const node = nodeStore.get(nodeId);
    if (!node) { Toast.error('Node not found.'); return; }
    NodeDetailView.open(nodeId);
    if (activity === 'recall' || activity === 'application') {
      setTimeout(() => {
        NodeDetailView._currentSection = 'questions';
        document.querySelectorAll('.detail-nav-btn,.detail-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.section==='questions'));
        NodeDetailView._renderSection();
      }, 150);
    }
  },

  // ─── Create empty node from plan ─────────────────────

  _createNodeFromPlan() {
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:19px;font-weight:800;margin-bottom:6px;">Add Node to Plan</h2>
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:20px;">
        Create an empty node to add to the plan schedule. Fill in content later.
      </p>
      <div class="config-row" style="margin-bottom:14px;">
        <label class="config-label">Subject *</label>
        <input type="text" id="pn-subject" class="config-input" placeholder="e.g. Income Tax"/>
      </div>
      <div class="config-row" style="margin-bottom:14px;">
        <label class="config-label">Chapter / Module *</label>
        <input type="text" id="pn-chapter" class="config-input" placeholder="e.g. Module 4 — Deductions"/>
      </div>
      <div class="config-row" style="margin-bottom:14px;">
        <label class="config-label">Node Title</label>
        <input type="text" id="pn-title" class="config-input" placeholder="Auto-generated if blank"/>
      </div>
      <div class="config-row" style="margin-bottom:20px;">
        <label class="config-label">Add to Schedule</label>
        <select id="pn-schedule" class="config-select">
          <option value="auto">Auto-schedule (next available day)</option>
          <option value="none">Just create — don't schedule yet</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary" id="pn-create-btn" style="flex:1;justify-content:center;">Create Node</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>`);

    setTimeout(() => {
      document.getElementById('pn-subject')?.focus();
      document.getElementById('pn-create-btn')?.addEventListener('click', () => {
        const subject  = document.getElementById('pn-subject')?.value.trim();
        const chapter  = document.getElementById('pn-chapter')?.value.trim();
        const titleIn  = document.getElementById('pn-title')?.value.trim();
        const schedule = document.getElementById('pn-schedule')?.value;
        if (!subject || !chapter) { Toast.error('Subject and Chapter are required.'); return; }

        const title = titleIn || [subject, chapter].filter(Boolean).join(' — ');
        const node  = new KnowledgeNode({ subject, chapter, title, processingStatus: 'ready' });
        nodeStore.save(node);

        if (schedule === 'auto' && this._plan) {
          // Find next available day with capacity
          const today      = StudyPlan._dateStr(new Date());
          const targetDay  = this._plan.days.find(d => d.date >= today && d.totalMins < (this._plan.dailyMins || 60));
          if (targetDay) {
            targetDay.tasks.push(new StudyTask({ nodeId: node.id, nodeTitle: title, subject, activityType: 'review', estimatedMins: 20, priority: 2 }));
            targetDay.tasks.push(new StudyTask({ nodeId: node.id, nodeTitle: title, subject, activityType: 'recall',  estimatedMins: 15, priority: 2 }));
            PlanStore.save(this._plan);
            Toast.success(`Node created and scheduled!`);
          } else {
            Toast.success(`Node created! No available slot found — open the node to add manually.`);
          }
        } else {
          Toast.success(`Node "${title}" created. Open Library to add content.`);
        }

        Modal.close();
        this._render();
      });
    }, 0);
  },

  // ─── Edit plan ────────────────────────────────────────

  _openEditPlanModal() {
    const plan = this._plan;
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:20px;">Edit Plan</h2>
      <div class="config-row" style="margin-bottom:14px;">
        <label class="config-label">Plan Title</label>
        <input type="text" id="ep-title" class="config-input" value="${this._esc(plan.title)}"/>
      </div>
      <div class="config-row" style="margin-bottom:14px;">
        <label class="config-label">Exam Date</label>
        <input type="date" id="ep-exam-date" class="config-input" value="${plan.examDate}"
               min="${StudyPlan._dateStr(new Date())}"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div class="config-row">
          <label class="config-label">Daily Time (min)</label>
          <input type="number" id="ep-daily-mins" class="config-input" value="${plan.dailyMins}" min="15" max="480"/>
        </div>
        <div class="config-row">
          <label class="config-label">Session (min)</label>
          <select id="ep-session-mins" class="config-select">
            <option value="25"  ${plan.sessionMins===25 ?'selected':''}>25 (Pomodoro)</option>
            <option value="45"  ${(!plan.sessionMins||plan.sessionMins===45)?'selected':''}>45 (Standard)</option>
            <option value="60"  ${plan.sessionMins===60 ?'selected':''}>60 min</option>
            <option value="90"  ${plan.sessionMins===90 ?'selected':''}>90 min</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary" id="ep-save-btn">Save</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>`);
    setTimeout(() => {
      document.getElementById('ep-save-btn')?.addEventListener('click', () => {
        plan.title       = document.getElementById('ep-title')?.value.trim()            || plan.title;
        plan.examDate    = document.getElementById('ep-exam-date')?.value               || plan.examDate;
        plan.dailyMins   = parseInt(document.getElementById('ep-daily-mins')?.value)    || plan.dailyMins;
        plan.sessionMins = parseInt(document.getElementById('ep-session-mins')?.value)  || 45;
        plan.updatedAt   = Date.now();
        PlanStore.save(plan);
        Modal.close();
        Toast.success('Plan updated!');
        this._render();
      });
    }, 0);
  },

  _openAddTaskModal(dayDate) {
    const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:20px;">Add Task</h2>
      <div class="config-row" style="margin-bottom:14px;">
        <label class="config-label">Node</label>
        <select id="add-task-node" class="config-select">
          ${nodes.map(n=>`<option value="${n.id}">${this._esc(n.title)}</option>`).join('')}
          ${!nodes.length ? '<option value="">No nodes yet — create one first</option>' : ''}
        </select>
      </div>
      <div class="config-row" style="margin-bottom:14px;">
        <label class="config-label">Activity Type</label>
        <select id="add-task-type" class="config-select">
          <option value="review">📖 Review</option>
          <option value="recall">🔁 Recall</option>
          <option value="application">🧩 Application</option>
          <option value="summary">📝 Summary</option>
          <option value="competency">🏆 Competency Test</option>
        </select>
      </div>
      <div class="config-row" style="margin-bottom:20px;">
        <label class="config-label">Time (minutes)</label>
        <input type="number" id="add-task-mins" class="config-input" value="20" min="5" max="180"/>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary" id="add-task-save-btn">Add</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>`);
    setTimeout(() => {
      document.getElementById('add-task-save-btn')?.addEventListener('click', () => {
        const nodeId = document.getElementById('add-task-node').value;
        const type   = document.getElementById('add-task-type').value;
        const mins   = parseInt(document.getElementById('add-task-mins').value) || 20;
        const node   = nodeStore.get(nodeId);
        const day    = this._plan.days.find(d => d.date === dayDate);
        if (!day) { Toast.error('Day not found.'); return; }
        day.tasks.push(new StudyTask({ nodeId, nodeTitle: node?.title||'Custom Task', subject: node?.subject||'', activityType: type, estimatedMins: mins, priority: 2 }));
        PlanStore.save(this._plan);
        Modal.close();
        Toast.success('Task added!');
        this._render();
      });
    }, 0);
  },

  _confirmDelete() {
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:12px;">Delete Plan?</h2>
      <p style="font-family:var(--font-body);font-size:14px;color:var(--text-secondary);margin-bottom:24px;">
        Permanently delete "<strong>${this._esc(this._plan.title)}</strong>"?
      </p>
      <div style="display:flex;gap:10px;">
        <button class="btn-danger" id="confirm-del-plan-btn">Delete</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>`);
    setTimeout(() => {
      document.getElementById('confirm-del-plan-btn')?.addEventListener('click', () => {
        PlanStore.delete(this._plan.id);
        Modal.close();
        Toast.success('Plan deleted.');
        this._plan = null;
        this._openDays.clear();
        this._render();
      });
    }, 0);
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
