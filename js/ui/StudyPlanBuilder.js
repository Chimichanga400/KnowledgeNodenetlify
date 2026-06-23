/**
 * StudyPlanBuilder.js
 * UI for creating study plans — manual or AI-generated.
 * Opened as a full modal wizard.
 */

const StudyPlanBuilder = {
  _step: 1,
  _settings: {},
  _nodes: [],
  _aiPlan: null,

  open() {
    this._step     = 1;
    this._settings = {};
    this._nodes    = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    this._aiPlan   = null;

    // Plan can be created without nodes - tasks added as nodes are created
    this._renderStep();
  },

  _renderStep() {
    const steps = ['Setup', 'Subjects', 'Method', 'Preview'];
    const stepBar = steps.map((s,i) => `
      <div class="wizard-step ${i+1 === this._step ? 'active' : i+1 < this._step ? 'done' : ''}">
        <div class="wizard-step-dot">${i+1 < this._step ? '✓' : i+1}</div>
        <span>${s}</span>
      </div>`).join('<div class="wizard-step-line"></div>');

    Modal.open(`
      <div id="plan-wizard">
        <h2 style="font-family:var(--font-ui);font-size:20px;font-weight:800;margin-bottom:20px;">
          📅 Study Plan Builder
        </h2>
        <div class="wizard-steps">${stepBar}</div>
        <div id="wizard-body" style="margin-top:24px;"></div>
      </div>
    `);
    this[`_renderStep${this._step}`]();
  },

  _renderStep1() {
    document.getElementById('wizard-body').innerHTML = `
      <div class="config-row" style="margin-bottom:16px;">
        <label class="config-label">Plan Title</label>
        <input type="text" id="plan-title" class="config-input"
               placeholder="e.g. Tax Law Exam Prep" value="${this._settings.title||''}"/>
      </div>
      <div class="config-row" style="margin-bottom:16px;">
        <label class="config-label">Exam / Target Date</label>
        <input type="date" id="plan-exam-date" class="config-input"
               min="${new Date().toISOString().slice(0,10)}" value="${this._settings.examDate||''}"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div class="config-row">
          <label class="config-label">Daily Study Time</label>
          <select id="plan-daily-mins" class="config-select">
            <option value="30"  ${this._settings.dailyMins===30 ?'selected':''}>30 min / day</option>
            <option value="60"  ${!this._settings.dailyMins||this._settings.dailyMins===60?'selected':''}>1 hour / day</option>
            <option value="90"  ${this._settings.dailyMins===90 ?'selected':''}>1.5 hours / day</option>
            <option value="120" ${this._settings.dailyMins===120?'selected':''}>2 hours / day</option>
            <option value="180" ${this._settings.dailyMins===180?'selected':''}>3 hours / day</option>
          </select>
        </div>
        <div class="config-row">
          <label class="config-label">Difficulty Order</label>
          <select id="plan-difficulty" class="config-select">
            <option value="balanced"   ${(!this._settings.difficulty||this._settings.difficulty==='balanced')  ?'selected':''}>Balanced (recommended)</option>
            <option value="hard-first" ${this._settings.difficulty==='hard-first'?'selected':''}>Hard topics first</option>
            <option value="easy-first" ${this._settings.difficulty==='easy-first'?'selected':''}>Easy topics first</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div class="config-row">
          <label class="config-label">Session Length</label>
          <select id="plan-session-mins" class="config-select">
            <optgroup label="Short sessions">
              <option value="5">5 min (no break)</option>
              <option value="10">10 min + 2 min break</option>
              <option value="15">15 min + 3 min break</option>
              <option value="20">20 min + 3 min break</option>
            </optgroup>
            <optgroup label="Full sessions">
              <option value="25">25 min + 5 min break (Pomodoro)</option>
              <option value="45" selected>45 min + 10 min break (Standard)</option>
              <option value="60">60 min + 15 min break</option>
              <option value="90">90 min + 20 min break</option>
            </optgroup>
          </select>
        </div>
        <div class="config-row">
          <label class="config-label">Study Days</label>
          <select id="plan-days-per-week" class="config-select">
            <option value="7" selected>Every day</option>
            <option value="6">6 days/week</option>
            <option value="5">Weekdays only</option>
            <option value="3">3 days/week</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn-primary" id="wizard-next-1">Next →</button>
      </div>`;

    document.getElementById('wizard-next-1').addEventListener('click', () => {
      const title    = document.getElementById('plan-title').value.trim();
      const examDate = document.getElementById('plan-exam-date').value;
      if (!title)    { Toast.error('Please enter a plan title.'); return; }
      if (!examDate) { Toast.error('Please select an exam date.'); return; }
      this._settings = { ...this._settings, title, examDate,
        dailyMins:   parseInt(document.getElementById('plan-daily-mins').value),
        difficulty:  document.getElementById('plan-difficulty').value,
        sessionMins: parseInt(document.getElementById('plan-session-mins')?.value || 45),
        daysPerWeek: parseInt(document.getElementById('plan-days-per-week')?.value || 7) };
      this._step = 2;
      this._renderStep();
    });
  },

  _renderStep2() {
    this._refreshNodeList();
    this._renderStep2UI();
  },

  _refreshNodeList() {
    this._nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
  },

  _renderStep2UI() {
    const subjects = [...new Set(this._nodes.map(n => n.subject).filter(Boolean))];
    const allSel   = !this._settings.subjects?.length;
    const noNodes  = this._nodes.length === 0;

    document.getElementById('wizard-body').innerHTML = `
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:14px;">
        Select which subjects to include. You can also create new nodes here to structure your plan.
      </p>

      ${noNodes ? `
        <div style="background:var(--blue-dim);border:1px solid rgba(78,142,247,0.2);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:16px;font-family:var(--font-body);font-size:13px;color:var(--text-secondary);">
          ℹ No nodes yet. Create your first node below to structure your plan — you can add content to it later.
        </div>` : ''}

      <!-- Subject / node list -->
      <div id="subject-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
        ${!noNodes ? `
          <label class="subject-toggle ${allSel?'selected':''}" style="cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-raised);border:1px solid ${allSel?'var(--accent)':'var(--border)'};border-radius:var(--radius-md);">
            <input type="checkbox" id="subj-all" ${allSel?'checked':''} style="accent-color:var(--accent);width:16px;height:16px;"/>
            <div>
              <div style="font-family:var(--font-ui);font-size:13px;font-weight:700;">All Subjects</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${this._nodes.length} nodes total</div>
            </div>
          </label>
          ${subjects.map(s => {
            const count   = this._nodes.filter(n=>n.subject===s).length;
            const avgMast = Math.round(this._nodes.filter(n=>n.subject===s).reduce((a,n)=>a+n.masteryScore,0)/count);
            const checked = allSel || (this._settings.subjects||[]).includes(s);
            return `<div style="background:var(--bg-raised);border:1px solid ${checked?'var(--accent-dim)':'var(--border)'};border-radius:var(--radius-md);overflow:hidden;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px 16px;">
                <input type="checkbox" class="subj-check" value="${s}" ${checked?'checked':''} style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;"/>
                <div style="flex:1;min-width:0;">
                  <div style="font-family:var(--font-ui);font-size:13px;font-weight:700;">${this._esc(s)}</div>
                  <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${count} node${count!==1?'s':''} · ${avgMast}% mastery</div>
                </div>
                <div class="mastery-bar-track" style="width:50px;flex-shrink:0;"><div class="mastery-bar-fill" style="width:${avgMast}%"></div></div>
              </label>
            </div>`;
          }).join('')}` : ''}
      </div>

      <!-- CREATE NODE inline -->
      <details id="create-node-panel" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden;">
        <summary style="padding:12px 16px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;font-family:var(--font-ui);font-size:13px;font-weight:600;color:var(--text-secondary);">
          <span style="font-size:16px;">+</span> Create a new node to add to this plan
        </summary>
        <div style="padding:14px 16px;border-top:1px solid var(--border-soft);">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div class="config-row">
              <label class="config-label">Subject *</label>
              <input type="text" id="wizard-node-subject" class="config-input" placeholder="e.g. Tax Law"/>
            </div>
            <div class="config-row">
              <label class="config-label">Chapter *</label>
              <input type="text" id="wizard-node-chapter" class="config-input" placeholder="e.g. Module 1"/>
            </div>
          </div>
          <div class="config-row" style="margin-bottom:12px;">
            <label class="config-label">Title (optional)</label>
            <input type="text" id="wizard-node-title" class="config-input" placeholder="Auto-generated if blank"/>
          </div>
          <button class="btn-secondary" id="wizard-create-node-btn" style="font-size:12px;">+ Create Node</button>
          <span id="wizard-node-result" style="font-family:var(--font-mono);font-size:11px;color:var(--green);margin-left:12px;display:none;">✓ Node created!</span>
        </div>
      </details>

      <div style="display:flex;gap:8px;justify-content:space-between;">
        <button class="btn-secondary" id="wizard-back-2">← Back</button>
        <button class="btn-primary" id="wizard-next-2">Next →</button>
      </div>`;

    // All subjects toggle
    document.getElementById('subj-all')?.addEventListener('change', e => {
      document.querySelectorAll('.subj-check').forEach(cb => cb.checked = e.target.checked);
    });

    // Create node inline
    document.getElementById('wizard-create-node-btn')?.addEventListener('click', () => {
      const subj = document.getElementById('wizard-node-subject')?.value.trim();
      const chap = document.getElementById('wizard-node-chapter')?.value.trim();
      if (!subj || !chap) { Toast.error('Subject and Chapter are required.'); return; }
      const title = document.getElementById('wizard-node-title')?.value.trim() || `${subj} — ${chap}`;
      const node  = new KnowledgeNode({ subject:subj, chapter:chap, title, processingStatus:'ready' });
      nodeStore.save(node);
      const res = document.getElementById('wizard-node-result');
      if (res) { res.style.display='inline'; res.textContent=`✓ "${title}" created!`; }
      // Clear fields
      document.getElementById('wizard-node-subject').value = '';
      document.getElementById('wizard-node-chapter').value = '';
      document.getElementById('wizard-node-title').value   = '';
      // Refresh node list and re-render subject list
      this._refreshNodeList();
      this._renderStep2UI();
      // Re-open the panel
      setTimeout(() => { document.getElementById('create-node-panel')?.setAttribute('open',''); }, 50);
      Toast.success(`Node "${title}" created and added to subjects.`);
    });

    document.getElementById('wizard-back-2').addEventListener('click', () => { this._step=1; this._renderStep(); });
    document.getElementById('wizard-next-2').addEventListener('click', () => {
      const allChecked = document.getElementById('subj-all')?.checked;
      const subjects   = allChecked ? [] : Array.from(document.querySelectorAll('.subj-check:checked')).map(cb=>cb.value);
      if (!allChecked && !subjects.length && this._nodes.length > 0) { Toast.error('Select at least one subject.'); return; }
      this._settings.subjects = subjects;
      this._step = 3;
      this._renderStep();
    });
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),

  _renderStep3() {
    document.getElementById('wizard-body').innerHTML = `
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:20px;">
        Choose how to build the plan. AI mode analyses your mastery gaps and writes a rationale.
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
        <button class="export-format-btn" id="build-ai-btn">
          <span class="exp-icon">⬡</span>
          <div>
            <div class="exp-title">AI Plan Builder</div>
            <div class="exp-desc">AI analyses your mastery gaps, weighs urgency, and explains its decisions. Requires API key.</div>
          </div>
        </button>
        <button class="export-format-btn" id="build-manual-btn">
          <span class="exp-icon">📋</span>
          <div>
            <div class="exp-title">Manual Plan Builder</div>
            <div class="exp-desc">Algorithm builds the schedule from your settings — no AI needed. Works offline.</div>
          </div>
        </button>
      </div>
      <div style="display:flex;gap:8px;justify-content:space-between;">
        <button class="btn-secondary" id="wizard-back-3">← Back</button>
      </div>
      <div id="build-status" style="display:none;text-align:center;padding:24px 0;">
        <div class="hex-ring" style="margin:0 auto 16px;"></div>
        <p style="font-family:var(--font-mono);font-size:13px;color:var(--accent);">AI is building your personalised plan…</p>
      </div>`;

    document.getElementById('wizard-back-3').addEventListener('click', () => { this._step=2; this._renderStep(); });

    document.getElementById('build-manual-btn').addEventListener('click', () => {
      const filteredNodes = this._filteredNodes();
      const plan = PlanEngine.build(this._settings, filteredNodes);
      this._aiPlan = plan;
      this._step = 4;
      this._renderStep();
    });

    document.getElementById('build-ai-btn').addEventListener('click', async () => {
      document.getElementById('build-ai-btn').style.display    = 'none';
      document.getElementById('build-manual-btn').style.display = 'none';
      document.getElementById('wizard-back-3').style.display   = 'none';
      document.getElementById('build-status').style.display    = 'block';

      try {
        const filteredNodes = this._filteredNodes();
        let rationale = '';

        if (AIService.hasApiKey()) {
          rationale = await this._callAIForPlan(filteredNodes);
        } else {
          await new Promise(r => setTimeout(r, 1200));
          rationale = this._mockAIRationale(filteredNodes);
        }

        const plan = PlanEngine.build(this._settings, filteredNodes, rationale);
        this._aiPlan = plan;
        this._step = 4;
        this._renderStep();
      } catch(e) {
        Toast.error('AI plan failed: ' + e.message);
        document.getElementById('build-status').style.display    = 'none';
        document.getElementById('build-ai-btn').style.display    = 'flex';
        document.getElementById('build-manual-btn').style.display = 'flex';
        document.getElementById('wizard-back-3').style.display   = 'inline-flex';
      }
    });
  },

  _renderStep4() {
    const plan = this._aiPlan;
    if (!plan) return;

    const examStr    = new Date(plan.examDate).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    const daysLeft   = plan.daysRemaining;
    const totalMins  = plan.days.reduce((s,d)=>s+d.totalMins, 0);
    const totalHours = (totalMins/60).toFixed(1);

    // Preview first 5 days
    const dayPreview = plan.days.slice(0,5).map(day => {
      const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
      const taskList  = day.tasks.map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-soft);">
          <span style="font-size:13px;">${this._actIcon(t.activityType)}</span>
          <span style="font-family:var(--font-body);font-size:12px;color:var(--text-primary);flex:1;">${this._esc(t.nodeTitle)}</span>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">${t.estimatedMins}m</span>
          <span class="priority-dot priority-${t.priority}"></span>
        </div>`).join('');
      return `
        <div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-family:var(--font-ui);font-size:12px;font-weight:700;color:var(--accent);">${dateLabel}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">${day.totalMins} min</span>
          </div>
          ${taskList}
        </div>`;
    }).join('');

    document.getElementById('wizard-body').innerHTML = `
      <!-- Summary stats -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
        <div class="mastery-stat-card"><span class="mastery-stat-value">${daysLeft}</span><span class="mastery-stat-label">Days Left</span></div>
        <div class="mastery-stat-card"><span class="mastery-stat-value">${plan.totalTasks}</span><span class="mastery-stat-label">Total Tasks</span></div>
        <div class="mastery-stat-card"><span class="mastery-stat-value">${totalHours}h</span><span class="mastery-stat-label">Study Time</span></div>
      </div>

      ${plan.aiRationale ? `
        <div style="background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:20px;">
          <div style="font-family:var(--font-ui);font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">⬡ AI Rationale</div>
          <div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.65;">${this._esc(plan.aiRationale)}</div>
        </div>` : ''}

      <!-- Day preview -->
      <div style="font-family:var(--font-ui);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">
        First ${Math.min(5,plan.days.length)} days preview${plan.days.length > 5 ? ` (+ ${plan.days.length-5} more)` : ''}
      </div>
      <div style="max-height:320px;overflow-y:auto;padding-right:4px;">${dayPreview}</div>

      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:20px;flex-wrap:wrap;">
        <button class="btn-secondary" id="wizard-back-4">← Rebuild</button>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
          <button class="btn-primary" id="wizard-save-plan">✓ Activate Plan</button>
        </div>
      </div>`;

    document.getElementById('wizard-back-4').addEventListener('click', () => { this._step=3; this._renderStep(); });
    document.getElementById('wizard-save-plan').addEventListener('click', () => {
      // Deactivate existing plans
      PlanStore.getAll().forEach(p => { p.isActive = false; PlanStore.save(p); });
      this._aiPlan.isActive = true;
      PlanStore.save(this._aiPlan);
      Onboarding.markPlanSet();
      Modal.close();
      Toast.success('Study plan activated! Check the Study Plan view.');
      App.navigateTo('studyplan');
    });
  },

  // ─── Helpers ──────────────────────────────────────────

  _filteredNodes() {
    const subjects = this._settings.subjects || [];
    return subjects.length
      ? this._nodes.filter(n => subjects.includes(n.subject))
      : this._nodes;
  },

  async _callAIForPlan(nodes) {
    const nodesSummary = nodes.map(n =>
      `- "${n.title}" (${n.subject}, mastery: ${n.masteryScore}%, questions: ${n.questions.length})`
    ).join('\n');

    const prompt = `You are an expert academic study planner.

A student has the following exam settings:
- Exam date: ${this._settings.examDate}
- Daily study time: ${this._settings.dailyMins} minutes
- Difficulty preference: ${this._settings.difficulty}
- Days until exam: ${Math.ceil((new Date(this._settings.examDate)-new Date())/86400000)}

Their Knowledge Nodes (study material) are:
${nodesSummary}

Write a brief (3-5 sentences) study plan rationale explaining:
1. Which topics need the most urgent attention and why (based on mastery gaps)
2. How you recommend distributing study time given the difficulty preference
3. When competency tests should be taken
4. Any specific advice for their situation

Be specific, practical, and encouraging. Reference actual topic names. Output ONLY the rationale text, no headings or bullets.`;

    return await AIService._call([{ role: 'user', content: prompt }], 600);
  },

  _mockAIRationale(nodes) {
    const weakest = nodes.sort((a,b)=>a.masteryScore-b.masteryScore).slice(0,2);
    const days    = Math.ceil((new Date(this._settings.examDate)-new Date())/86400000);
    return `With ${days} days until your exam and ${this._settings.dailyMins} minutes of daily study time, I've prioritised ${weakest.map(n=>n.title).join(' and ')} first since these show the lowest mastery scores and need the most reinforcement. The plan follows a ${this._settings.difficulty} difficulty curve — beginning with foundational review sessions, progressing to recall and application practice, and reserving the final 20% of your study period for competency tests across each subject. I recommend completing each competency test in one sitting to simulate real exam conditions. Stay consistent with your daily sessions and use the spaced repetition reviews to reinforce what you've already covered.`;
  },

  _actIcon(type) {
    return { review:'📖', recall:'🔁', application:'🧩', summary:'📝', lecture:'🎓', competency:'🏆' }[type] || '📌';
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
