/**
 * ReviewView.js — Final AI-powered study session
 *
 * Every card has:
 *  - "Get a hint"       → AI gives a nudge without revealing the answer
 *  - "Explain this"     → AI explains the concept after reveal
 *  - "Follow-up Q"      → AI generates a fresh related question on the fly
 *  - "I don't get it"   → AI tries a completely different explanation angle
 *
 * The session feels like studying with a teacher, not flipping flashcards.
 */
const ReviewView = {
  _session:    [],
  _index:      0,
  _inSession:  false,
  _revealed:   false,
  _stats:      { again:0, hard:0, good:0, easy:0 },
  _aiPending:  false,

  init() {
    document.getElementById('reveal-btn')
      .addEventListener('click', () => this._reveal());
    document.getElementById('skip-btn')
      .addEventListener('click', () => this._skip());
    document.querySelectorAll('.rating-btn').forEach(btn =>
      btn.addEventListener('click', () => this._rate(parseInt(btn.dataset.rating))));
    document.getElementById('review-again-btn')
      .addEventListener('click', () => { this._inSession = false; this.refresh(); });
  },

  refresh() {
    // A nodeStore "change" event fires on every rating (we save the node to
    // record it). Do NOT tear down an active review session when that happens —
    // only (re)build the filter UI when no session is running.
    if (this._inSession) return;
    this._hideAll();
    this._renderFilterUI();
  },

  _hideAll() {
    ['review-container','review-complete','review-empty'].forEach(id =>
      document.getElementById(id).classList.add('hidden'));
  },

  /* ─── FILTER UI ─────────────────────────────────── */
  _renderFilterUI() {
    const allNodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    const filterEl = document.getElementById('review-filter-panel');

    if (!allNodes.length) {
      filterEl.style.display = 'none';
      const emptyEl = document.getElementById('review-empty');
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }

    const emptyEl2 = document.getElementById('review-empty');
    if (emptyEl2) emptyEl2.style.display = 'none';
    // Single pass — avoids 5 separate loops (4 reduce + 1 map) and multiple
    // dueQuestions() SRS scans. Inline the due check to avoid creating arrays.
    let totalQs = 0, dueQs = 0, newQs = 0, weakCount = 0;
    const now = Date.now(), subjectSet = new Set();
    for (const n of allNodes) {
      totalQs  += n.questions.length;
      weakCount += n.weakQuestions?.length || 0;
      if (n.subject) subjectSet.add(n.subject);
      for (const q of n.questions) {
        const srs = n.srsState[q.id];
        if (!srs || srs.repetitions === 0) newQs++;
        else if (srs.nextReview <= now)     dueQs++;
      }
    }
    const subjects = Array.from(subjectSet);

    filterEl.style.display = 'block';
    filterEl.innerHTML = `
      <div class="review-filter-card">
        <div class="notes-section-title" style="margin-bottom:16px;">Study Session</div>
        <div class="review-stats-row">
          <div class="review-stat"><span class="review-stat-val">${totalQs}</span><span class="review-stat-key">Cards</span></div>
          <div class="review-stat accent"><span class="review-stat-val">${dueQs}</span><span class="review-stat-key">Due</span></div>
          <div class="review-stat" style="color:var(--blue,#4f9cf9);"><span class="review-stat-val">${newQs}</span><span class="review-stat-key">New</span></div>
          <div class="review-stat"><span class="review-stat-val">${allNodes.length}</span><span class="review-stat-key">Nodes</span></div>
        </div>

        <div style="margin-bottom:16px;">
          <label class="config-label">Mode</label>
          <div class="review-mode-toggle">
            <button class="mode-btn active" id="mode-due">Due Today ${dueQs>0?`(${dueQs})`:''}</button>
            <button class="mode-btn" id="mode-all">All Cards (${totalQs})</button>
            <button class="mode-btn" id="mode-weak">🎯 Weak Spots${weakCount>0?` (${weakCount})`:''}</button>
          </div>
        </div>

        ${subjects.length > 1 ? `
        <div style="margin-bottom:16px;">
          <label class="config-label">Subject</label>
          <select id="review-subject-filter" class="config-select">
            <option value="">All subjects</option>
            ${subjects.map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>` : ''}

        <!-- AI session settings -->
        <div style="margin-bottom:20px;padding:14px 16px;background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);">
          <div style="font-family:var(--font-ui);font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px;">⬡ AI Study Mode</div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="ai-mode-toggle" ${AIService.hasApiKey()?'checked':''} style="accent-color:var(--accent);width:16px;height:16px;" ${!AIService.hasApiKey()?'disabled':''}>
            <span style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);">
              ${AIService.hasApiKey()
                ? 'AI hints, explanations &amp; follow-up questions enabled'
                : 'Configure AI in Settings to enable AI study mode'}
            </span>
          </label>
        </div>

        <button class="btn-primary" id="start-review-btn" style="width:100%;justify-content:center;padding:14px;" ${!totalQs?'disabled':''}>
          ${dueQs > 0 ? `Start Session — ${dueQs} Due` : `Start Session — ${totalQs} Cards`}
        </button>
      </div>`;

    let mode = dueQs > 0 ? 'due' : 'all';
    document.getElementById('mode-due').addEventListener('click', () => {
      mode = 'due';
      document.getElementById('mode-due').classList.add('active');
      document.getElementById('mode-all').classList.remove('active');
      document.getElementById('start-review-btn').textContent =
        dueQs > 0 ? `Start Session — ${dueQs} Due` : 'No due cards — switch to All';
    });
    document.getElementById('mode-all').addEventListener('click', () => {
      mode = 'all';
      document.getElementById('mode-all').classList.add('active');
      document.getElementById('mode-due').classList.remove('active');
      document.getElementById('mode-weak').classList.remove('active');
      document.getElementById('start-review-btn').textContent = `Start Session — ${totalQs} Cards`;
    });
    document.getElementById('mode-weak').addEventListener('click', () => {
      mode = 'weak';
      document.getElementById('mode-weak').classList.add('active');
      document.getElementById('mode-due').classList.remove('active');
      document.getElementById('mode-all').classList.remove('active');
      document.getElementById('start-review-btn').textContent =
        weakCount > 0 ? `Start Session — ${weakCount} Weak Spots` : 'No weak spots yet — keep studying';
    });
    document.getElementById('start-review-btn').addEventListener('click', () => {
      const subject = document.getElementById('review-subject-filter')?.value || '';
      const aiMode  = document.getElementById('ai-mode-toggle')?.checked ?? false;
      const filtered = subject ? allNodes.filter(n=>n.subject===subject) : allNodes;
      this._startSession(filtered, mode, aiMode);
    });
  },

  /* ─── SESSION ───────────────────────────────────── */
  _startSession(nodes, mode, aiMode) {
    const session = mode === 'weak'
      ? this._buildWeakSession(nodes)
      : (mode === 'due' && nodes.some(n=>n.dueQuestions().length)
        ? this._buildDueSession(nodes)
        : this._buildAllSession(nodes));

    if (!session.length) {
      Toast.info('No questions found. Add notes and generate questions first.');
      return;
    }

    this._session  = session;
    this._index    = 0;
    this._revealed = false;
    this._aiMode   = aiMode;
    this._stats    = { again:0, hard:0, good:0, easy:0 };
    this._inSession = true;

    document.getElementById('review-filter-panel').style.display = 'none';
    document.getElementById('review-container').classList.remove('hidden');
    this._renderCard();
  },

  /**
   * Scale a built session by the student's current load lever and, on light
   * days, prepend any deferred review items so backlog resurfaces. On deep
   * days the full set plays (multiplier > 1 just means "don't trim").
   *
   * Review cards are SRS-backed: an unserved due card stays due and returns
   * tomorrow on its own, so "deferring" here only controls how many you face
   * in THIS sitting — nothing is lost.
   */
  _applyLoad(items) {
    if (!items.length) return items;
    let load = { level: 'normal' }, mult = 1;
    try {
      if (typeof LearnerState !== 'undefined') {
        load = LearnerState.getSessionLoad();
        mult = LearnerState.loadMultiplier();
      }
    } catch (_) {}

    // Deep day: surface everything (the queue is the cap). Normal: as-is.
    if (load.level !== 'light') return items;

    // Light day: keep a focused slice; the rest simply stays due for next time.
    const keep = Math.max(3, Math.round(items.length * mult)); // never below 3
    if (keep >= items.length) return items;
    return items.slice(0, keep);
  },

  _buildDueSession(nodes) {
    const items = [];
    nodes.forEach(node => {
      node.dueQuestions().forEach(q => items.push({ node, question:q, state:node.srsState[q.id]||null }));
    });
    return this._applyLoad(this._shuffle(items));
  },

  /** Build a session from the questions the learner keeps getting wrong,
   *  most-struggled first (highest struggle count, then lowest rating). */
  _buildWeakSession(nodes) {
    const items = [];
    nodes.forEach(node => {
      (node.weakQuestions || []).forEach(w => {
        const q = node.questions.find(q => q.id === w.id);
        if (q) items.push({ node, question: q, state: node.srsState[q.id] || null, _struggle: w });
      });
    });
    // Hardest first: more misses and lower ratings come first
    items.sort((a, b) => {
      const countCmp = (b._struggle.count || 1) - (a._struggle.count || 1);
      if (countCmp !== 0) return countCmp;
      return (a._struggle.rating || 0) - (b._struggle.rating || 0);
    });
    return this._applyLoad(items);
  },

  _buildAllSession(nodes) {
    const dueItems = [];
    const newItems = [];

    // Sort nodes by subject then chapter so new questions are grouped logically
    const sorted = [...nodes].sort((a, b) => {
      const subjectCmp = (a.subject || '').localeCompare(b.subject || '');
      if (subjectCmp !== 0) return subjectCmp;
      return (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });
    });

    sorted.forEach(node => {
      node.questions.forEach(q => {
        const s = node.srsState[q.id];
        const isNew = !s || s.repetitions === 0;
        const item  = { node, question: q, state: s || null };
        if (isNew) newItems.push(item);
        else       dueItems.push(item);
      });
    });

    // Due cards shuffled (spaced repetition order), new cards in chapter order
    return this._applyLoad([...this._shuffle(dueItems), ...newItems]);
  },

  _shuffle(arr) {
    for (let i=arr.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  },

  /* ─── CARD RENDER ───────────────────────────────── */
  _renderCard() {
    const item = this._session[this._index];
    if (!item) { this._showComplete(); return; }
    const { node, question } = item;

    let _loadTag = '';
    try {
      if (typeof LearnerState !== 'undefined') {
        const lvl = LearnerState.getSessionLoad().level;
        if (lvl === 'light') _loadTag = '  ·  light session';
        else if (lvl === 'deep') _loadTag = '  ·  deep session';
      }
    } catch (_) {}
    document.getElementById('review-counter').textContent  = `Card ${this._index+1} of ${this._session.length}${_loadTag}`;
    document.getElementById('review-node-tag').textContent = node.title;
    document.getElementById('card-type-label').textContent = question.type==='recall' ? '🔁 Recall' : '🧩 Application';
    document.getElementById('card-question').textContent   = question.question;
    document.getElementById('card-answer').textContent     = question.answer;
    document.getElementById('flashcard-back').classList.add('hidden');
    document.getElementById('reveal-btn').classList.remove('hidden');
    document.getElementById('skip-btn').classList.remove('hidden');
    this._revealed = false;

    // Inject AI toolbar below question
    this._renderAIToolbar(node, question);
  },

  _renderAIToolbar(node, question) {
    // Remove old toolbar if exists
    document.getElementById('review-ai-toolbar')?.remove();
    document.getElementById('review-ai-panel')?.remove();

    if (!this._aiMode) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'review-ai-toolbar';
    toolbar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 0;';
    toolbar.innerHTML =
      '<button class="rai-btn" id="rai-hint">💡 Hint</button>'
      + '<button class="rai-btn" id="rai-explain">📖 Explain</button>'
      + '<button class="rai-btn" id="rai-followup">🔀 New Q</button>'
      + '<button class="rai-btn" id="rai-struggle">🤔 I don\'t get it</button>';

    // Insert after question
    const qEl = document.getElementById('card-question');
    qEl.parentNode.insertBefore(toolbar, qEl.nextSibling);

    // AI response panel
    const panel = document.createElement('div');
    panel.id = 'review-ai-panel';
    panel.style.cssText = 'display:none;margin-top:10px;background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius-md);padding:14px 16px;';
    toolbar.parentNode.insertBefore(panel, toolbar.nextSibling);

    const showAI = async (promptFn, label) => {
      if (this._aiPending) return;
      this._aiPending = true;
      // Dim all buttons
      toolbar.querySelectorAll('.rai-btn').forEach(b => { b.disabled=true; b.style.opacity='0.5'; });
      panel.style.display = 'block';
      panel.innerHTML = '<div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div>';

      try {
        const ctx = LearnerContext.forReviewCard(node, question);
        const response = await AIService._callWithFunction('chat',
          [{ role:'user', content: ctx + '\n\n' + promptFn(question, node) }], 600);
        panel.innerHTML =
          '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:8px;">' + label + '</div>'
          + response.split('\n').filter(l=>l.trim())
              .map(l=>'<p style="font-family:var(--font-body);font-size:13px;line-height:1.7;color:var(--text-primary);margin:0 0 8px;">' + this._esc(l) + '</p>')
              .join('');
      } catch(e) {
        panel.innerHTML = '<p style="font-family:var(--font-mono);font-size:12px;color:var(--red);">' + this._esc(e.message) + '</p>';
      }
      this._aiPending = false;
      toolbar.querySelectorAll('.rai-btn').forEach(b => { b.disabled=false; b.style.opacity='1'; });
    };

    // Hint — nudge without giving away answer
    document.getElementById('rai-hint')?.addEventListener('click', () => showAI(
      (q, n) => `Give a helpful hint for this question WITHOUT revealing the answer. A hint should activate memory, not replace it. Be brief — 1-2 sentences max.\n\nQuestion: "${q.question}"`,
      '💡 Hint'
    ));

    // Explain — full explanation after reveal
    document.getElementById('rai-explain')?.addEventListener('click', () => showAI(
      (q, n) => `Explain this concept thoroughly:\n- What is the core idea behind the answer?\n- Why does it work this way?\n- Give a short real-world accounting/tax example that makes it concrete.\n\nKeep it to 3-4 short paragraphs.`,
      '📖 Explanation'
    ));

    // Follow-up — generate a fresh related question
    document.getElementById('rai-followup')?.addEventListener('click', async () => {
      if (this._aiPending) return;
      this._aiPending = true;
      toolbar.querySelectorAll('.rai-btn').forEach(b=>{b.disabled=true;b.style.opacity='0.5';});
      panel.style.display='block';
      panel.innerHTML='<div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div>';
      try {
        const ctx = LearnerContext.forReviewCard(node, question);
        const prompt = ctx + '\n\nGenerate ONE follow-up question that tests the same concept from a different angle — make it harder or more applied than the original. Output ONLY valid JSON: {"question":"","answer":""}';
        const raw  = await AIService._callWithFunction('questionGen', [{role:'user',content:prompt}], 400);
        const data = AIService._parseJSON(raw);
        panel.innerHTML =
          '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:10px;">🔀 Follow-up Question</div>'
          + '<div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);margin-bottom:12px;line-height:1.65;">' + this._esc(data.question||'') + '</div>'
          + '<div id="rai-fu-answer" style="display:none;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.65;">' + this._esc(data.answer||'') + '</div>'
          + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">'
          + '<button class="rai-btn" id="rai-fu-reveal">Show Answer</button>'
          + '<button class="rai-btn" id="rai-fu-save">+ Save to node</button>'
          + '</div>';
        document.getElementById('rai-fu-reveal')?.addEventListener('click', () => {
          document.getElementById('rai-fu-answer').style.display='block';
          document.getElementById('rai-fu-reveal').textContent='Answer shown';
          document.getElementById('rai-fu-reveal').disabled=true;
        });
        document.getElementById('rai-fu-save')?.addEventListener('click', () => {
          node.questions.push({ id:KnowledgeNode._generateQuestionId(), type:'application', question:data.question, answer:data.answer });
          nodeStore.save(node);
          Toast.success('Question saved to node!');
          document.getElementById('rai-fu-save').disabled=true;
          document.getElementById('rai-fu-save').textContent='✓ Saved';
        });
      } catch(e) {
        panel.innerHTML='<p style="font-family:var(--font-mono);font-size:12px;color:var(--red);">' + this._esc(e.message) + '</p>';
      }
      this._aiPending=false;
      toolbar.querySelectorAll('.rai-btn').forEach(b=>{b.disabled=false;b.style.opacity='1';});
    });

    // I don't get it — completely different angle
    document.getElementById('rai-struggle')?.addEventListener('click', () => showAI(
      (q, n) => `A student is struggling with this concept. Explain it from a completely different angle:\n1. Use a simple everyday analogy (nothing accounting-related)\n2. Then show how that analogy maps to the actual concept\n3. End with the simplest possible version of the rule to remember\n\nQuestion context: "${q.question}"`,
      '🤔 Different Angle'
    ));
  },

  /* ─── REVEAL & RATE ─────────────────────────────── */
  _reveal() {
    document.getElementById('reveal-btn').classList.add('hidden');
    document.getElementById('skip-btn').classList.add('hidden');
    document.getElementById('flashcard-back').classList.remove('hidden');
    this._revealed = true;
    // Show scheduling hints so the student knows the consequence of each rating
    this._updateRatingHints();
  },

  /** Adds scheduling hints to rating buttons after answer is revealed.
   *  Computes actual next-review intervals from the SRS state where available. */
  _updateRatingHints() {
    const item  = this._session?.[this._index];
    const hints = { 1: 'Right now', 2: 'Tomorrow', 3: '~3 days', 4: '~1 week' };
    if (item && typeof SpacedRepetition !== 'undefined') {
      try {
        const state = item.node.srsState?.[item.question?.id] || {};
        [1,2,3,4].forEach(r => {
          const next = SpacedRepetition.update({ ...state }, r);
          const days = Math.round((next.nextReview - Date.now()) / 86400000);
          hints[r] = days <= 0 ? 'Right now'
            : days === 1 ? 'Tomorrow'
            : days < 7   ? days + ' days'
            : days < 14  ? '~1 week'
            : Math.round(days / 7) + ' weeks';
        });
      } catch(e) { /* fallback to static hints */ }
    }
    document.querySelectorAll('.rating-btn').forEach(btn => {
      const r = parseInt(btn.dataset.rating);
      if (!r) return;
      btn.querySelector('.rating-hint')?.remove();
      const hint = document.createElement('span');
      hint.className = 'rating-hint';
      hint.textContent = hints[r] || '';
      btn.appendChild(hint);
    });
  },

  /** Skip the current card without rating it.
   *  The card is re-queued at the end so it isn't lost — you'll see it
   *  again before the session finishes. No SRS rating is recorded. */
  _skip() {
    const item = this._session[this._index];
    if (!item) return;
    // Re-queue a copy at the end of the session (skip last card → no-op re-add still works)
    this._session.push({ ...item });
    this._index++;
    document.getElementById('review-ai-toolbar')?.remove();
    document.getElementById('review-ai-panel')?.remove();
    this._renderCard();
  },

  _rate(rating) {
    if (!this._revealed) return;
    const item = this._session[this._index];
    if (!item) return;
    const { node, question } = item;

    // Record the rating and learner signals — but never let a writeback error
    // stop the session from advancing to the next card.
    try { node.recordRating(question.id, rating); nodeStore.save(node); } catch(e) { console.warn('[Review] recordRating failed', e); }
    try { LearnerMemory.recordStruggle(node, question, rating); } catch(e) { console.warn('[Review] recordStruggle failed', e); }
    if (!this._ratingMap) this._ratingMap = {};
    this._ratingMap[question.id] = rating;
    // Fire-and-forget: don't await (review must advance immediately).
    // .catch() surfaces errors without breaking the session flow.
    ReactiveReshaper.onRating(node, question, rating)
      .catch(e => console.warn('[ReviewView] onRating background error:', e));

    const labels = { 1:'again', 2:'hard', 3:'good', 4:'easy' };
    this._stats[labels[rating]]++;
    if (rating === 1) this._session.push({ ...item }); // re-queue
    this._index++;
    // Clear AI panel
    document.getElementById('review-ai-toolbar')?.remove();
    document.getElementById('review-ai-panel')?.remove();
    this._renderCard();
  },

  /* ─── COMPLETE ──────────────────────────────────── */
  _showComplete() {
    this._inSession = false;
    document.getElementById('review-container').classList.add('hidden');
    const el = document.getElementById('review-complete');
    el.classList.remove('hidden');
    const { again, hard, good, easy } = this._stats;
    const total = again + hard + good + easy;
    const score = total ? Math.round(((good*0.7 + easy) / total) * 100) : 0;

    document.getElementById('review-complete-stats').innerHTML =
      `<div style="font-size:36px;font-weight:800;color:var(--accent);font-family:var(--font-mono);margin-bottom:4px;">${score}%</div>`
      + `<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:16px;">${total} cards — Easy: ${easy} · Good: ${good} · Hard: ${hard} · Again: ${again}</div>`
      + (this._aiMode && AIService.hasApiKey() ? '<div id="complete-ai-insight" style="margin-top:8px;"><div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div></div>' : '');

    Toast.success('Session complete!');
    App.updateSidebarStats();
    StreakTracker.recordActivity();
    StreakTracker.render();

    // Write session result back to every node that was reviewed
    const reviewedNodes = [...new Set(this._session.map(i => i.node))];
    reviewedNodes.forEach(n => {
      const nodeItems  = this._session.filter(i => i.node === n);
      const hardQIds   = nodeItems
        .filter(i => (this._ratingMap?.[i.question.id] || 3) <= 2)
        .map(i => i.question.id);
      LearnerMemory.recordReview(n, { again, hard, good, easy, score }, hardQIds);
    });

    // AI session debrief — structured, cross-topic analysis via analyzeSessionGaps
    if (this._aiMode && AIService.hasApiKey()) {
      const hardList = this._session
        .filter((_,i) => i < this._stats.again + this._stats.hard)
        .map(item => item.question.question).slice(0, 5);
      const sessionData = {
        score, easy, good, hard, again,
        reviewedTopics: reviewedNodes.map(n => n.title),
        struggledQuestions: hardList,
      };
      AIService.analyzeSessionGaps(sessionData, nodeStore.getAll())
        .then(r => {
          const el = document.getElementById('complete-ai-insight');
          if (!el || !r) return;
          const chips = (arr, color) => (arr || []).filter(Boolean).slice(0,4)
            .map(t => '<span style="display:inline-block;background:var(--bg-raised);border:1px solid ' + color + ';border-radius:999px;padding:3px 10px;margin:2px 4px 2px 0;font-family:var(--font-mono);font-size:11px;">' + this._esc(t) + '</span>').join('');
          const block = (label, html) => html
            ? '<div style="margin-top:10px;"><div style="font-family:var(--font-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px;">' + label + '</div>' + html + '</div>'
            : '';
          el.innerHTML = '<div style="background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);padding:14px 16px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
            +   '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);">⬡ AI Session Debrief</span>'
            +   (r.examReadiness ? '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--accent);">Exam ready: ' + this._esc(String(r.examReadiness)) + '</span>' : '')
            + '</div>'
            + (r.sessionSummary ? '<p style="margin:0;font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.7;">' + this._esc(r.sessionSummary) + '</p>' : '')
            + block('Strong areas',      chips(r.strongAreas, 'var(--green)'))
            + block('Focus next',        chips((r.weakAreas||[]).concat(r.nextSessionFocus||[]), 'var(--red)'))
            + (r.dailyRecommendation ? block('Recommended', '<span style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);">' + this._esc(r.dailyRecommendation) + '</span>') : '')
            + '</div>';
        })
        .catch(() => { document.getElementById('complete-ai-insight')?.remove(); });
    }
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
