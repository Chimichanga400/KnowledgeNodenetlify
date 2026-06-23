/**
 * StudyCoach.js — "Talk to your coach."
 *
 * A read-only conversational layer over the cross-node brain. The learner can
 * ask how to study — where to start, what's weak, how to spend their time —
 * and the coach answers using their whole library (mastery, weak spots,
 * history, plan). It advises only; it does not change settings.
 */
const StudyCoach = {
  _history: [],
  _pending: false,

  open() {
    if (!AIService.hasApiKey()) {
      Toast.info('Configure AI in Settings to talk to your study coach.');
      return;
    }
    if (!nodeStore.getAll().length) {
      Toast.info('Add a topic or two first — the coach reads your library.');
      return;
    }
    Modal.open(
      '<div class="coach">'
      + '<div class="coach-head"><span class="coach-orb">⬡</span><div><h2 style="margin:0;font-family:var(--font-ui);font-size:18px;font-weight:800;">Your Study Coach</h2>'
      + '<p style="margin:2px 0 0;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Ask about how to study — it sees your whole library.</p></div></div>'
      + '<div id="coach-log" class="coach-log"></div>'
      + '<div class="coach-input-row">'
      + '<input type="text" id="coach-input" class="config-input" placeholder="e.g. Where should I start today?" style="flex:1;font-size:13px;" />'
      + '<button class="btn-primary" id="coach-send" style="padding:9px 14px;">→</button>'
      + '</div></div>',
      () => { document.querySelector('#modal-overlay .modal')?.classList.remove('modal-coach'); }
    );
    setTimeout(() => {
      // Lock the modal to a fixed height and stop IT from scrolling, so the
      // only scroll container is the coach log. Two nested scrollers were
      // fighting and painting over each other.
      document.querySelector('#modal-overlay .modal')?.classList.add('modal-coach');
      this._renderLog();
      const input = document.getElementById('coach-input');
      const send  = () => { const v = input.value.trim(); if (v) { input.value=''; this._ask(v); } };
      document.getElementById('coach-send')?.addEventListener('click', send);
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
      input?.focus();
    }, 0);
  },

  _renderSuggestions() { /* suggestions now render inside the log */ },

  _renderLog() {
    const log = document.getElementById('coach-log');
    // Modal may have been closed while a request was in-flight — silently abort render.
    // _pending was already reset to false in _ask's finally path, so next open is clean.
    if (!log) return;
    if (!this._history.length && !this._pending) {
      // Director-aware opening: if the Director ran recently, surface its
      // assessment and offer to explain or act on it instead of generic chips.
      const state     = (typeof LearnerState !== 'undefined') ? LearnerState.get() : {};
      const directive = state.director;
      let openingHtml = '';
      // Hoisted to outer scope: referenced below at the "coach-empty" line even
      // when there's no directive (fresh/demo session), so it must always exist.
      let isExpired = false;
      let chips = [
        'Where should I start today?',
        'What am I weakest at?',
        'How do I manage my time before the exam?',
        'How do I deal with study stress?',
      ];

      if (directive && directive.at) {
        const daysAgo = Math.floor((Date.now() - directive.at) / 86400000);
        const when    = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : daysAgo + ' days ago';
        const urgents = (directive.urgentNodes || []).slice(0, 2);
        const methodLabel = {
          review: 'spaced repetition review',
          guided: 'guided step-by-step study',
          'blank-recall': 'active recall practice',
          exam: 'exam-pressure practice',
        }[directive.overallStudyMethod] || (directive.overallStudyMethod || 'study');

        // After 7 days the assessment is likely outdated — show a nudge instead
        // of the full card. After 30 days, don't show it at all.
        const isStale   = daysAgo >= 7;
        isExpired = daysAgo >= 30;

        if (!isExpired) {
          if (isStale) {
            // Soft nudge — still surfaceable but flagged outdated
            openingHtml = '<div class="coach-director-context coach-dir-stale">'
              + '<span class="coach-dir-badge">⬡ AI assessment from ' + this._esc(when) + ' — may be outdated</span>'
              + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Your library has likely changed. Run a fresh assessment for an accurate read.</p>'
              + '</div>';
            chips = [
              'Run a fresh AI assessment',
              'What am I weakest at right now?',
              'How do I manage my time before the exam?',
              'Where should I start today?',
            ];
          } else {
            // Fresh assessment — show in full
            openingHtml = '<div class="coach-director-context">'
              + '<span class="coach-dir-badge">⬡ Last AI assessment — ' + this._esc(when) + '</span>'
              + (directive.assessment ? '<p>' + this._esc(directive.assessment) + '</p>' : '')
              + (urgents.length ? '<p>Flagged urgent: <strong>' + urgents.map(n => this._esc(n)).join(', ') + '</strong></p>' : '')
              + (directive.planGuidance ? '<p class="coach-dir-plan">' + this._esc(directive.planGuidance) + '</p>' : '')
              + (directive.firstAction ? '<p class="coach-dir-action">▶ ' + this._esc(directive.firstAction) + '</p>' : '')
              + '</div>';

            chips = [
              'Why did the AI choose ' + methodLabel + ' for me?',
              urgents.length ? 'Help me understand ' + urgents[0] : 'What should I focus on now?',
              'Have I done what the AI suggested?',
              'How do I manage my time before the exam?',
            ];
          }
        }
      }

      log.innerHTML = openingHtml
        + '<div class="coach-empty">'
        + (directive && !isExpired ? "I can see the assessment above. Ask me anything — I'll explain the reasoning, challenge it, or help you start." : "Ask me anything about how to study. I can see every topic, your mastery, what you keep getting wrong, and your plan.")
        + '</div>'
        + '<div class="coach-suggest">' + chips.map(c =>
            '<button class="coach-chip" data-q="' + c.replace(/"/g, '&quot;') + '">' + this._esc(c) + '</button>'
          ).join('') + '</div>';
      log.querySelectorAll('.coach-chip').forEach(b =>
        b.addEventListener('click', () => this._ask(b.dataset.q)));
      return;
    }
    const html = this._history.map((m, i) =>
      m.role === 'user'
        ? '<div class="coach-msg user" data-msg="' + i + '">' + this._esc(m.text) + '</div>'
        : '<div class="coach-msg coach cclamp" data-msg="' + i + '">'
            + m.text.split('\n').filter(l=>l.trim()).map(l=>'<p style="margin:0 0 8px;">'+this._md(l)+'</p>').join('')
            + (m.action ? '<button class="coach-action" data-i="' + i + '">' + this._esc(m.action.label) + '</button>' : '')
          + '</div>'
    ).join('') + (this._pending ? '<div class="coach-msg coach" data-msg="pending"><div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div></div>' : '');

    // Render synchronously in one shot. (Earlier deferred/double-buffered
    // rendering raced with rapid successive calls and left overlapping bubbles.)
    log.innerHTML = html;

    log.querySelectorAll('.coach-action').forEach(btn =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = this._history[parseInt(btn.dataset.i, 10)];
        if (m && m.action) this._runAction(m.action);
      }));

    // Messages render clamped to a preview height (.cclamp). Here we check —
    // locally on each element — whether the content actually overflows that
    // clamp. This compares the element's own content height to its own clamped
    // height, so it does NOT depend on the sheet's outer layout being settled
    // (the source of the earlier flakiness). Overflowing → keep the clamp + add
    // the expand pill. Fits → drop the clamp and show it in full, no pill.
    const wireExpand = () => {
      log.querySelectorAll('.coach-msg.coach[data-msg]').forEach(el => {
        if (el.dataset.msg === 'pending' || el.dataset.expChecked === '1') return;
        if (!el.clientHeight) return; // not laid out yet — a later pass will catch it
        const i = parseInt(el.dataset.msg, 10);
        const overflowing = el.scrollHeight - el.clientHeight > 8;
        el.dataset.expChecked = '1';
        if (overflowing) {
          if (!el.querySelector('.coach-expand')) {
            el.insertAdjacentHTML('afterbegin',
              '<button class="coach-expand" data-exp="' + i + '">⤢ Tap to expand full message</button>');
            el.querySelector('.coach-expand')
              .addEventListener('click', (e) => { e.stopPropagation(); this._expand(i); });
            el.addEventListener('click', (e) => {
              if (e.target.closest('.coach-action') || e.target.closest('.coach-expand')) return;
              if ((window.getSelection?.().toString() || '').trim()) return; // don't hijack selection
              this._expand(i);
            });
          }
        } else {
          el.classList.remove('cclamp'); // fits — show in full
        }
      });
    };

    // WhatsApp-style: keep the conversation pinned to the BOTTOM. Measure after
    // layout, and once more on a short delay in case the sheet was still
    // animating open on the first frame.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wireExpand();
        log.scrollTop = log.scrollHeight;
      });
    });
    setTimeout(() => { wireExpand(); log.scrollTop = log.scrollHeight; }, 250);
  },

  /** Escape, then apply light markdown (bold) so **text** renders bold. */
  /** Expand one message in-place: a panel that fills the chat area above the
   *  input box, so the conversation context stays and you read the full text. */
  _expand(index) {
    const m = this._history[index];
    if (!m) return;
    const coach = document.querySelector('#modal-overlay .coach');
    if (!coach) return;
    let panel = document.getElementById('coach-reader');
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'coach-reader';
    panel.className = 'coach-reader';
    panel.innerHTML =
      '<div class="coach-reader-bar">'
      + '<span class="coach-reader-who">' + (m.role === 'user' ? 'You' : 'Your coach') + '</span>'
      + '<button class="coach-reader-close" id="coach-reader-close">← Back</button>'
      + '</div>'
      + '<div class="coach-reader-body">'
      + m.text.split('\n').filter(l => l.trim()).map(l => '<p>' + this._md(l) + '</p>').join('')
      + '</div>';
    // Insert just before the input row so it sits ABOVE the text box.
    const inputRow = coach.querySelector('.coach-input-row');
    coach.insertBefore(panel, inputRow);

    const close = () => { panel.remove(); };

    // Tap anywhere in the reader to close — far easier than reaching the button.
    // We close on `click` (not pointerup) and stop propagation: closing on
    // pointerup removed the panel before the click fired, so the click fell
    // through to the chat message underneath and instantly re-expanded it.
    // Guards keep scrolling and text-selection working.
    let sx = 0, sy = 0, moved = false;
    panel.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; moved = false; });
    panel.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) moved = true;
    });
    panel.addEventListener('click', (e) => {
      if (moved) return;                                              // was a scroll/drag
      if ((window.getSelection?.().toString() || '').trim()) return;  // user is selecting text
      e.stopPropagation();                                            // don't fall through to the chat message
      close();
    });
  },

  _md(s) {
    let t = String(s ?? '');
    // --- Strip/convert artifacts the model sometimes emits, so they don't show raw ---
    // LaTeX delimiters and common commands → plain text
    t = t.replace(/\$\$?/g, '');
    t = t.replace(/\\text\{([^}]*)\}/g, '$1');
    t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1) / ($2)');
    t = t.replace(/\\times/g, '×').replace(/\\div/g, '/').replace(/\\,/g, ' ').replace(/\\%/g, '%');
    t = t.replace(/\\[a-zA-Z]+/g, '');           // any other stray \commands
    // Markdown headers (## Step 2) → just the text
    t = t.replace(/^#{1,6}\s*/gm, '');
    // Horizontal rules (--- on their own line) → blank
    t = t.replace(/^\s*-{3,}\s*$/gm, '');
    // Markdown table separator rows (|---|---|) → drop
    t = t.replace(/^\s*\|?[\s:|-]*\|[\s:|-]*$/gm, m => (/^[\s|:-]+$/.test(m) ? '' : m));
    // Table rows: turn "| a | b | c |" into "a — b — c" (do this BEFORE <br/> so
    // rows containing <br/> still match as a single line)
    t = t.replace(/^\s*\|(.+)\|\s*$/gm, (m, inner) =>
      inner.split('|').map(c => c.replace(/<br\s*\/?>/gi, '; ').trim()).filter(Boolean).join('  —  '));
    // Remaining HTML line breaks → real newlines
    t = t.replace(/<br\s*\/?>/gi, '\n');

    return this._esc(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(?:^|\s)\*([^*]+)\*(?=\s|$)/g, m => m.replace(/\*([^*]+)\*/, '<em>$1</em>'));
  },

  async _ask(question, exampleContext = null) {
    if (this._pending) return;
    this._history.push({ role: 'user', text: question });
    this._pending = true;
    this._renderLog();
    try {
      const answer = await AIService.studyCoach(question, this._history, exampleContext);
      if (!answer || !String(answer).trim()) throw new Error('empty');
      // Extract structured signal FIRST (hidden from student), then action, then display text
      const { clean: cleanAnswer, signal } = this._extractSignal(answer);
      const { text, action } = this._extractAction(cleanAnswer);
      this._history.push({ role: 'coach', text: text || cleanAnswer, action: action || null });
      // Cap history to prevent unbounded memory growth in long sessions.
      // Keep first message (session context) + last 49 to stay coherent.
      if (this._history.length > 50) {
        this._history = [this._history[0], ...this._history.slice(-49)];
      }
      // Write structured signal to shared memory.
      // The Director reads this before its next evaluation — it now knows what
      // the student is confused about, not just what their SRS numbers say.
      try {
        if (typeof LearnerState !== 'undefined') {
          LearnerState.saveCoachExchange({
            question: question,
            signal:   signal || null,             // distilled learning signal (AI-extracted)
            insight:  signal || (text || cleanAnswer).slice(0, 200), // fallback if no signal
          });
        }
      } catch(e) { /* optional */ }
    } catch (e) {
      const msg = (e && /quota|limit|429|rate/i.test(e.message || ''))
        ? 'I have hit the AI usage limit for now — that is an OpenRouter/Haiku cap, not the app. Try again later or check your AI plan.'
        : 'Sorry — I could not reach the AI just now. Check your connection and AI key in Settings, then try again.';
      this._history.push({ role: 'coach', text: msg });
    }
    this._pending = false;
    this._renderLog();
  },

  /** Build full text of one stored example and ask the coach to teach it.
   *  The content is already on the device — we only pay to send it this once. */
  _teachExample(nodeId, exampleId) {
    const node = nodeStore.get(nodeId);
    if (!node) return;
    const ex = (node.workedExamples || []).find(e => e.id === exampleId)
            || (node.workedExamples || [])[0];
    if (!ex) { Toast.info('No example found to teach.'); return; }
    let ctx = 'WORKED EXAMPLE — "' + (ex.title || 'Example') + '" (from topic "' + node.title + '")\n';
    if (ex.question) ctx += '\nProblem:\n' + ex.question + '\n';
    if (ex.solution) ctx += '\nSolution:\n' + ex.solution + '\n';
    if (Array.isArray(ex.steps) && ex.steps.length) {
      ctx += '\nSteps:\n' + ex.steps.map((s, i) => (i + 1) + '. ' + (typeof s === 'string' ? s : (s && (s.text || s.title) || ''))).join('\n') + '\n';
    }
    if (Array.isArray(ex.tables) && ex.tables.length) {
      ctx += '\n(The example also contains ' + ex.tables.length + ' table(s) of figures.)\n';
    }
    this._ask('Walk me through the "' + (ex.title || 'example') + '" example step by step.', ctx);
  },

  /** Pull a trailing [[ACTION:...]] line out of the reply, if present. */
  /** Strip [[SIGNAL:...]] from the reply before display and return it separately.
   *  The signal is a distilled one-liner the Director can read — never shown to student. */
  _extractSignal(raw) {
    const str   = String(raw || '');
    const match = str.match(/\[\[SIGNAL:([^\]]+)\]\]/);
    const signal = match ? match[1].trim() : null;
    const clean  = str.replace(/\n?\[\[SIGNAL:[^\]]*\]\]\n?/g, '').trimEnd();
    return { clean, signal };
  },

  _extractAction(raw) {
    const m = String(raw || '').match(/\[\[ACTION:([^\]]+)\]\]/);
    if (!m) return { text: raw, action: null };
    const text = raw.replace(/\[\[ACTION:[^\]]+\]\]/, '').trim();
    const body = m[1];
    const kind = body.split('|')[0].trim();
    const params = {};
    body.split('|').slice(1).forEach(p => {
      const i = p.indexOf('=');
      if (i !== -1) params[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    // Whitelist: only known, safe actions are accepted.
    if (!['startGuided', 'openExamples', 'teachExample', 'openReview', 'openLibrary', 'openStudyPlan', 'runDirector', 'setLoad'].includes(kind)) return { text, action: null };
    let label = '';
    if (kind === 'startGuided' || kind === 'openExamples' || kind === 'teachExample') {
      const node = nodeStore.getAll().find(n => n.title === params.node)
                || nodeStore.getAll().find(n => (n.title||'').toLowerCase().trim() === (params.node||'').toLowerCase().trim());
      if (!node) return { text, action: null }; // node must really exist
      params._nodeId = node.id;
      params._nodeTitle = node.title;
      if (kind === 'teachExample') {
        const exCount = (node.workedExamples || []).length;
        if (!exCount) return { text, action: null }; // nothing to teach
        params._exampleId = node.workedExamples[0].id;
        label = '📖 Teach me the "' + (node.workedExamples[0].title || 'example') + '" example';
      } else if (kind === 'openExamples') {
        label = '💡 Open examples in "' + node.title + '"';
      } else {
        label = '▶ Start studying "' + node.title + '"';
      }
    } else if (kind === 'openReview') {
      label = '↺ Open Review';
    } else if (kind === 'openLibrary') {
      label = '⊞ Open Library';
    } else if (kind === 'openStudyPlan') {
      label = '📅 Open Study Plan';
    } else if (kind === 'runDirector') {
      label = '🧠 Run full AI assessment';
    } else if (kind === 'setLoad') {
      const lvl = ['light','normal','deep'].includes(params.level) ? params.level : 'normal';
      params._level = lvl;
      label = lvl === 'light' ? '🌙 Keep this session light'
            : lvl === 'deep'  ? '🔥 Make this a deep session'
            :                   '⚖ Set to a normal session';
    }
    return { text, action: { kind, params, label } };
  },

  _runAction(action) {
    if (!action) return;
    try {
      if (action.kind === 'startGuided') {
        if (typeof GuidedView !== 'undefined') GuidedView.startAtNode(action.params._nodeId);
        Modal.close();
        App.navigateTo('guided');
      } else if (action.kind === 'openExamples') {
        Modal.close();
        if (typeof NodeDetailView !== 'undefined') NodeDetailView.open(action.params._nodeId, 'examples');
      } else if (action.kind === 'teachExample') {
        // Stay in the chat; load the example content and have the coach teach it.
        this._teachExample(action.params._nodeId, action.params._exampleId);
      } else if (action.kind === 'openReview') {
        Modal.close();
        App.navigateTo('review');
      } else if (action.kind === 'openLibrary') {
        Modal.close();
        App.navigateTo('library');
      } else if (action.kind === 'openStudyPlan') {
        Modal.close();
        App.navigateTo('studyplan');
      } else if (action.kind === 'runDirector') {
        Modal.close();
        if (typeof AIDirector !== 'undefined') AIDirector.run();
      } else if (action.kind === 'setLoad') {
        if (typeof LearnerState !== 'undefined') {
          LearnerState.setSessionLoad(action.params._level, action.params.reason || '');
          const lvl = action.params._level;
          const drained = (lvl === 'deep' && LearnerState.deferredCount() > 0)
            ? LearnerState.deferredCount() : 0;
          Toast.success(
            lvl === 'light' ? 'Session set to light — skipped work stays queued for later.'
          : lvl === 'deep'  ? (drained ? `Deep session — pulling in ${drained} deferred task(s).` : 'Session set to deep.')
          :                   'Session set to normal.'
          );
        }
      }
    } catch (e) {
      Toast.error('Could not do that — try the tab directly.');
    }
  },

  _esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); },
};
