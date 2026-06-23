/**
 * AIDirector.js — "Let AI take the wheel."
 *
 * One button. The AI evaluates the learner across every node (mastery,
 * due counts, review history, self-ratings) and DICTATES a coordinated
 * set of changes:
 *   • per-node note method (standard / cornell / outline / feynman)
 *   • per-node learner profile (primary / high / college / pro)
 *   • which nodes are urgent
 *   • one overall study method to push right now
 *   • study-plan guidance + a concrete first action
 *
 * It shows its assessment, then applies the changes live (narrated by the
 * reshaping bar) and drops the learner straight into the method it chose.
 */
const AIDirector = {
  _STUDY_METHOD_VIEW: {
    'review':      { view: 'review',  label: 'Spaced Repetition Review' },
    'guided':      { view: 'guided',  label: 'Guided Step-by-Step Study' },
    'blank-recall':{ view: 'guided',  label: 'Active Recall' },
    'exam':        { view: 'review',  label: 'Exam-Pressure Practice' },
  },

  /** Entry point — wired to the "AI: assess & adapt" button. */
  async run() {
    const nodes = nodeStore.getAll();
    if (!nodes.length) { Toast.info('Add at least one node first — the AI adapts your library.'); return; }
    if (!AIService.hasApiKey()) {
      Modal.open(this._noKeyHtml());
      document.getElementById('aidir-configure')?.addEventListener('click', () => { Modal.close(); AISettingsModal.open(); });
      return;
    }

    // Loading modal
    Modal.open(`<div class="aidir">
      <div class="aidir-head"><span class="aidir-orb">⬡</span><h2>AI is evaluating your library…</h2></div>
      <p class="aidir-sub">Reading mastery, review history and where you've struggled across ${nodes.length} node${nodes.length>1?'s':''}, then deciding how to reshape your study.</p>
      <div class="aidir-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div>
    </div>`);

    try {
      const plan = (typeof PlanStore !== 'undefined' ? PlanStore.getActive() : null)
                 || (typeof StudyPlanView !== 'undefined' ? StudyPlanView._plan : null);
      const daysToExam = plan?.examDate
        ? Math.ceil((new Date(plan.examDate) - Date.now()) / 86400000) : null;

      // Build full plan context — same information the Coach gets — so Director
      // can give specific plan guidance, not just days-remaining generics.
      let planContext = null;
      if (plan) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayTasks = (plan.days || [])
          .find(d => d.date === todayStr)?.tasks || [];
        const doneSessions  = (plan.days || []).reduce((n, d) => n + (d.tasks || []).filter(t => t.done).length, 0);
        const totalSessions = (plan.days || []).reduce((n, d) => n + (d.tasks || []).length, 0);
        planContext = {
          title:          plan.title || 'Study Plan',
          daysToExam,
          dailyMinutes:   plan.dailyMinutes || null,
          todayTasks:     todayTasks.map(t => t.nodeTitle + ' (' + (t.activityType || 'study') + ', ' + (t.estimatedMins || '?') + ' min)'),
          progressFraction: totalSessions ? (doneSessions + '/' + totalSessions) : null,
          progressPct:    totalSessions ? Math.round(doneSessions / totalSessions * 100) : null,
        };
      }

      // Pass global learner state so the AI has real cross-session evidence
      const globalState = LearnerMemory.getGlobalState();
      const directive = await AIService.directLearning(nodes, { daysToExam, globalState, planContext });
      this._directive = directive;
      this._renderReview(directive, nodes);
    } catch (e) {
      Modal.open(`<div class="aidir"><div class="aidir-head"><span class="aidir-orb" style="animation:none">⬡</span><h2>Couldn't evaluate</h2></div><p class="aidir-sub">${this._esc(e.message || 'Try again in a moment.')}</p><button class="btn-secondary" onclick="Modal.close()">Close</button></div>`);
    }
  },

  /** Show the AI's assessment + the changes it wants to make, with one Apply button. */
  _renderReview(d, nodes) {
    const directives = (d.nodeDirectives || []).map(nd => {
      const node = nodes.find(n => n.title === nd.title) || nodes.find(n => n.title.toLowerCase() === (nd.title||'').toLowerCase());
      const changed = node && (node.noteMethod !== nd.noteMethod || node.learnerProfile !== nd.profile);
      return { nd, node, changed };
    }).filter(x => x.node);

    const methodLabel = this._STUDY_METHOD_VIEW[d.overallStudyMethod]?.label || d.overallStudyMethod;

    // Only show nodes where something actually changes or are flagged urgent.
    // Showing all 50 nodes when 40 are unchanged creates noise that buries the real decisions.
    const visibleDirectives = directives.filter(({ nd, changed }) => changed || nd.urgent);
    const hiddenCount = directives.length - visibleDirectives.length;

    const rows = visibleDirectives.map(({ nd, node, changed }) => `
      <div class="aidir-row${nd.urgent ? ' urgent' : ''}">
        <div class="aidir-row-main">
          <div class="aidir-node-title">${nd.urgent ? '<span class="aidir-urgent-dot"></span>' : ''}${this._esc(nd.title)}</div>
          <div class="aidir-change">
            ${changed
              ? `<span class="aidir-pill">${this._esc(node.noteMethod || 'standard')}</span>
                 <span class="aidir-arrow">→</span>
                 <span class="aidir-pill new">${this._esc(nd.noteMethod)}</span>
                 <span class="aidir-pill new">${this._esc(nd.profile)}</span>`
              : `<span class="aidir-pill urgent-only">urgent — no method change needed</span>`
            }
          </div>
          <div class="aidir-why">${this._esc(nd.why || '')}</div>
        </div>
      </div>`).join('')
    + (hiddenCount > 0
        ? `<p class="aidir-sub" style="margin-top:10px;font-size:11px;">+ ${hiddenCount} other topic${hiddenCount===1?'':'s'} — no changes needed, already well set up.</p>`
        : '');

    const hasDetail = !!(d.assessment || d.studyMethodWhy || d.planGuidance || rows);
    const changeSummary = visibleDirectives.length
      ? `Updating ${visibleDirectives.length} topic${visibleDirectives.length===1?'':'s'}`
        + (directives.length > visibleDirectives.length ? ` · ${directives.length} reviewed` : '')
      : 'No topic changes needed — your setup already fits';

    Modal.open(`<div class="aidir">
      <div class="aidir-head"><span class="aidir-orb" style="animation:none">⬡</span><h2>Your plan is ready</h2></div>

      <div class="aidir-method-card">
        <div class="aidir-method-label">Study method I'm putting you in now</div>
        <div class="aidir-method-name">${this._esc(methodLabel)}</div>
        <div class="aidir-method-meta">${this._esc(changeSummary)}</div>
      </div>

      ${d.firstAction ? `<div class="aidir-firstaction">▶ First: ${this._esc(d.firstAction)}</div>` : ''}

      ${hasDetail ? `<details class="aidir-details">
        <summary>Why this plan &amp; what changes</summary>
        <div class="aidir-details-body">
          ${d.assessment ? `<p class="aidir-assessment">${this._esc(d.assessment)}</p>` : ''}
          ${d.studyMethodWhy ? `<div class="aidir-section-label">Why ${this._esc(methodLabel)}</div><p class="aidir-sub">${this._esc(d.studyMethodWhy)}</p>` : ''}
          ${rows ? `<div class="aidir-section-label">Changes to your topics (${visibleDirectives.length} of ${directives.length})</div><div class="aidir-rows">${rows}</div>` : ''}
          ${d.planGuidance ? `<div class="aidir-section-label">Study plan direction</div><p class="aidir-sub">${this._esc(d.planGuidance)}</p>` : ''}
        </div>
      </details>` : ''}

      <div class="aidir-btns">
        <button class="btn-secondary" id="aidir-cancel">Not now</button>
        <button class="btn-primary" id="aidir-apply">⬡ Apply &amp; start</button>
      </div>
    </div>`);

    document.getElementById('aidir-cancel')?.addEventListener('click', () => Modal.close());
    document.getElementById('aidir-apply')?.addEventListener('click', () => this._apply(d, directives));
  },

  /** Apply every change the AI dictated, narrated live, then enter the chosen method. */
  async _apply(d, directives) {
    Modal.close();
    const bar = (typeof ReactiveReshaper !== 'undefined') ? ReactiveReshaper : null;

    for (const { nd, node } of directives) {
      bar?.show(`Reshaping "${this._short(nd.title)}" → ${nd.noteMethod} · ${nd.profile}`);
      node.noteMethod     = nd.noteMethod || node.noteMethod;
      node.learnerProfile = nd.profile    || node.learnerProfile;
      node._aiUrgent      = !!nd.urgent;
      node._aiNoteWhy     = nd.why || '';
      nodeStore.save(node);
      await this._tick(380);
    }

    // Persist the directive to the shared LearnerState so the Coach
    // (and any future system) can always see what was decided and why.
    try {
      LearnerState.saveDirectorRun({
        assessment:         d.assessment         || '',
        overallStudyMethod: d.overallStudyMethod || '',
        studyMethodWhy:     d.studyMethodWhy     || '',
        startNodeTitle:     d.startNodeTitle     || null,
        urgentNodes:        directives.filter(x => x.nd.urgent).map(x => x.nd.title),
        planGuidance:       d.planGuidance       || '',
        firstAction:        d.firstAction        || '',  // Coach can reference this
        reshapedCount:      directives.length,
      });
    } catch(e) { /* storage optional */ }

    // Persist the directive's plan guidance where the plan view can show it.
    if (d.planGuidance && typeof StudyPlanView !== 'undefined') {
      try { StudyPlanView._aiGuidance = d.planGuidance; } catch (e) {}
    }

    bar?.show('Setting your study method…');
    await this._tick(500);
    bar?.hide(400);

    Toast.success('Done — the AI reshaped ' + directives.length + ' node' + (directives.length!==1?'s':'') + ' and chose your study method.');

    const target = this._STUDY_METHOD_VIEW[d.overallStudyMethod] || this._STUDY_METHOD_VIEW.review;

    // Make the recommendation and behaviour agree: if the AI named a start node
    // and we're entering guided study, force the flow to begin there (not resume).
    if (target.view === 'guided' && d.startNodeTitle && typeof GuidedView !== 'undefined') {
      const all = nodeStore.getAll();
      const start = all.find(n => n.title === d.startNodeTitle)
                 || all.find(n => (n.title||'').toLowerCase().trim() === (d.startNodeTitle||'').toLowerCase().trim());
      if (start) GuidedView.startAtNode(start.id);
    }

    App.navigateTo(target.view);
  },

  _noKeyHtml() {
    return `<div class="aidir">
      <div class="aidir-head"><span class="aidir-orb" style="animation:none">⬡</span><h2>Let the AI take the wheel</h2></div>
      <p class="aidir-sub">This evaluates how you're doing across every node, then dictates the best note method, learner level, and study method for each — and reshapes them for you. It needs an AI key configured.</p>
      <div class="aidir-btns"><button class="btn-secondary" onclick="Modal.close()">Later</button><button class="btn-primary" id="aidir-configure">Configure AI</button></div>
    </div>`;
  },

  _tick(ms) { return new Promise(r => setTimeout(r, ms)); },
  _short(s) { s = String(s || ''); return s.length > 32 ? s.slice(0, 30) + '…' : s; },
  _esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); },
};
