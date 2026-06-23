/**
 * GuidedView.js — Final AI Study Session
 *
 * Feels like a teacher walking you through the material.
 * Each step has a clear purpose, warm coaching language,
 * and AI assistance woven in at every stage.
 *
 * Steps per node:
 *   1. Prime       — AI primes your brain for this topic (30s orientation)
 *   2. Understand  — Understanding check gate (what you already know)
 *   3. Notes       — Read structured notes with AI floater available
 *   4. Recall      — Blank-sheet recall from memory
 *   5. Questions   — Answer questions, AI grades + hints on demand
 *   6. Reflect     — What stuck, what didn't, what's next
 */
const GuidedView = {
  _nodes:          [],
  _nodeIndex:      0,
  _stepIndex:      0,
  _stepsCompleted: new Set(),
  _sessionStart:   null,
  _aiMode:         true,
  _speech:         null,
  _forceStartNodeId: null,
  _inSession:       false, // set true in _render, false at completion and on navigate

  /** Tell the guided flow to start at a specific node next time it opens,
   *  overriding resume. Used by the AI Director so its recommendation and
   *  the actual starting point agree. */
  startAtNode(nodeId) { this._forceStartNodeId = nodeId; },

  _STEPS: ['prime','understand','notes','recall','questions','reflect'],

  /* ── Speech helper ─────────────────────────────────── */
  _speak(text, onEnd) {
    this._stopSpeech();
    const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    // Native TTS bridge on Android (Capacitor)
    if (typeof window.KnowledgeNodeTTS !== 'undefined') {
      this._speech = true;
      this._updateSpeechBtns(true);
      if (typeof SpeechPill !== 'undefined') SpeechPill.show();
      const handler = () => {
        this._knttsListener = null;
        this._speech = null;
        this._updateSpeechBtns(false);
        if (typeof SpeechPill !== 'undefined') SpeechPill.hide();
        if (onEnd) onEnd();
      };
      this._knttsListener = handler;
      window.addEventListener('kntts:done', handler, { once: true });
      window.KnowledgeNodeTTS.speak(clean, 0.92, 1.0);
      return;
    }

    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      Toast.info('Your browser does not support read-aloud. Try the lecture, or Chrome/Edge.');
      return;
    }

    // Split into small chunks so long notes don't trip mobile "synthesis-failed".
    const chunks = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean];
    const queue = [];
    let buf = '';
    for (const s of chunks) {
      if ((buf + s).length > 200 && buf) { queue.push(buf.trim()); buf = ''; }
      buf += s;
    }
    if (buf.trim()) queue.push(buf.trim());

    const voices = window.speechSynthesis.getVoices();
    const voice = voices.length
      ? (voices.find(v => v.lang.startsWith('en') && /Google|Natural|Online|Samsung/.test(v.name))
        || voices.find(v => v.lang.startsWith('en')) || voices[0])
      : null;

    let i = 0;
    const speakNext = () => {
      if (i >= queue.length) { this._speech = null; this._updateSpeechBtns(false); if (typeof SpeechPill !== 'undefined') SpeechPill.hide(); if (onEnd) onEnd(); return; }
      const u = new SpeechSynthesisUtterance(queue[i]);
      u.rate = 0.92; u.lang = 'en-US';
      if (voice) u.voice = voice;
      u.onend   = () => { i++; if (this._speech) speakNext(); };
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.warn('[GuidedView] Speech:', e.error);
        i++;
        if (i < queue.length && this._speech) speakNext();
        else { this._speech = null; this._updateSpeechBtns(false); if (typeof SpeechPill !== 'undefined') SpeechPill.hide(); }
      };
      this._speech = u;
      window.speechSynthesis.speak(u);
    };

    this._speech = true; // marker so _stopSpeech can halt the queue
    speakNext();
    this._updateSpeechBtns(true);
    if (typeof SpeechPill !== 'undefined') SpeechPill.show();

    // Safety net: if nothing started speaking within 1.5s (rare mobile stall),
    // reset the button so it isn't stuck on "Stop".
    setTimeout(() => {
      if (this._speech && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        this._stopSpeech();
        Toast.info('Read-aloud didn\'t start — try “Listen as a lecture” instead.');
      }
    }, 1500);
  },

  _stopSpeech() {
    if (this._knttsListener) {
      window.removeEventListener('kntts:done', this._knttsListener);
      this._knttsListener = null;
    }
    if (typeof window.KnowledgeNodeTTS !== 'undefined') window.KnowledgeNodeTTS.stop();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this._speech = null;
    this._updateSpeechBtns(false);
    if (typeof SpeechPill !== 'undefined') SpeechPill.hide();
  },

  _updateSpeechBtns(playing) {
    document.querySelectorAll('.gf-speak-btn').forEach(btn => {
      const idle = btn.dataset.idleLabel || '🔊 Read aloud';
      if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.textContent.trim() || idle;
      btn.textContent = playing ? '⏹ Stop reading' : btn.dataset.idleLabel;
      btn.dataset.playing = playing ? '1' : '';
    });
  },

  _bindSpeakBtn(btnId, getText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (btn.dataset.playing) { this._stopSpeech(); return; }
      const text = getText();
      if (!text) { Toast.info('Nothing to read yet — wait for the AI to finish loading.'); return; }
      this._speak(text);
    });
  },

  _STEP_META: {
    prime:      { icon:'🎯', label:'Orient',    desc:'Set your focus' },
    understand: { icon:'🧠', label:'Check',     desc:'What you know' },
    notes:      { icon:'📋', label:'Study',     desc:'Read & absorb' },
    recall:     { icon:'✍',  label:'Recall',    desc:'From memory' },
    questions:  { icon:'❓', label:'Practice',  desc:'Test yourself' },
    reflect:    { icon:'✅', label:'Reflect',   desc:'Lock it in' },
  },

  init() {
    this._container = document.getElementById('guided-container');
    this._empty     = document.getElementById('guided-empty');
    this._tabs      = document.getElementById('step-tabs');
    this._content   = document.getElementById('step-content');
    this._prevBtn   = document.getElementById('guided-prev');
    this._nextBtn   = document.getElementById('guided-next');

    this._prevBtn.addEventListener('click', () => this._prevStep());
    this._nextBtn.addEventListener('click', () => this._advance());
    this._tabs.addEventListener('click', e => {
      const tab = e.target.closest('.step-tab');
      if (!tab || tab.classList.contains('locked')) return;
      const idx = this._STEPS.indexOf(tab.dataset.step);
      // Allow jumping to any step already reached (current or completed) — not just backwards
      if (idx >= 0 && (idx <= this._stepIndex || this._stepsCompleted.has(idx))) this._goToStep(idx);
    });
  },

  refresh() {
    // Guard: background nodeStore.change events must not reset an active session
    if (this._inSession) return;
    // Sync profile from the first node to be studied
    const nodes = nodeStore.getAll();
    if (nodes.length > 0 && nodes[0].learnerProfile) {
      AIService.setProfile(nodes[0].learnerProfile);
    }
    this._nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    if (!this._nodes.length) {
      this._inSession = false;
      document.getElementById('guided-page-header')?.style.setProperty('display', '');
      this._container.classList.add('hidden');
      this._empty.classList.remove('hidden');
      return;
    }
    this._empty.classList.add('hidden');
    this._container.classList.remove('hidden');

    // If something (e.g. the AI Director) asked us to start at a specific node,
    // honour that and skip resume — so the recommendation and behaviour agree.
    let restored = false;
    if (this._forceStartNodeId) {
      const idx = this._nodes.findIndex(n => n.id === this._forceStartNodeId);
      this._forceStartNodeId = null;
      if (idx !== -1) {
        this._nodeIndex = idx;
        this._stepIndex = 0;
        this._stepsCompleted = new Set();
        try { localStorage.removeItem('kn_guided_progress'); } catch(e) {}
        this._sessionStart = Date.now();
        this._aiMode = AIService.hasApiKey();
        this._render();
        return;
      }
    }

    // Restore last guided position if it's recent and still valid
    try {
      const saved = JSON.parse(localStorage.getItem('kn_guided_progress') || 'null');
      if (saved && typeof saved.nodeIndex === 'number' && typeof saved.stepIndex === 'number') {
        // Match by node ID so it survives library reordering
        const idx = this._nodes.findIndex(n => n.id === saved.nodeId);
        if (idx !== -1 && saved.stepIndex > 0 && saved.stepIndex < this._STEPS.length) {
          this._nodeIndex = idx;
          this._stepIndex = saved.stepIndex;
          this._stepsCompleted = new Set(saved.completed || []);
          restored = true;
        }
      }
    } catch(e) { /* ignore corrupt progress */ }

    if (!restored) {
      this._nodeIndex      = Math.min(this._nodeIndex, this._nodes.length - 1);
      this._stepIndex      = 0;
      this._stepsCompleted = new Set();
    }
    this._sessionStart   = Date.now();
    this._aiMode         = AIService.hasApiKey();
    this._inSession      = true;
    this._render();

    if (restored && !this._resumeToastShown) {
      this._resumeToastShown = true;
      const stepName = this._STEP_META[this._STEPS[this._stepIndex]]?.label || 'where you left off';
      setTimeout(() => Toast.info('Resumed at "' + stepName + '".'), 300);
    }
  },

  /* ─── RENDER SHELL ─────────────────────────────────── */
  _render() {
    const node  = this._nodes[this._nodeIndex];
    if (!node) return;
    const step  = this._STEPS[this._stepIndex];

    // Hide the page-level "Study Session" header/subtitle while a session is
    // active — it's orientation copy for the empty state, not for mid-session.
    document.getElementById('guided-page-header')?.style.setProperty('display', 'none');

    // Persist current position so the session resumes here next time
    try {
      localStorage.setItem('kn_guided_progress', JSON.stringify({
        nodeId:    node.id,
        nodeIndex: this._nodeIndex,
        stepIndex: this._stepIndex,
        completed: [...this._stepsCompleted],
        savedAt:   Date.now(),
      }));
    } catch(e) { /* best-effort */ }

    // Always refresh the content element reference (defensive against re-init)
    this._content = document.getElementById('step-content');

    // Progress bar
    const total   = this._nodes.length * this._STEPS.length;
    const current = this._nodeIndex * this._STEPS.length + this._stepIndex + 1;
    document.getElementById('guided-progress-fill').style.width = ((current/total)*100) + '%';
    document.getElementById('guided-progress-label').textContent =
      'Node ' + (this._nodeIndex+1) + ' of ' + this._nodes.length +
      ' — Step ' + (this._stepIndex+1) + ' of ' + this._STEPS.length;

    // Node header
    document.getElementById('guided-node-badge').textContent = node.subject || 'Node';
    document.getElementById('guided-node-title').textContent = node.title;
    document.getElementById('guided-node-meta').textContent  =
      (() => { const d = new Date(node.createdAt); return isNaN(d) ? '' : d.toLocaleDateString(); })();

    // Tabs — rebuild each render so they stay in sync
    this._tabs.innerHTML = this._STEPS.map((s, i) => {
      const m      = this._STEP_META[s];
      const done   = this._stepsCompleted.has(i);
      const active = i === this._stepIndex;
      // Only lock steps the student has never reached — completed steps are always tappable
      const locked = i > this._stepIndex && !done;
      return '<button class="step-tab' + (active?' active':'') + (locked?' locked':'') + (done?' done':'') + '" data-step="' + s + '">'
        + '<span class="step-tab-icon">' + (done ? '✓' : m.icon) + '</span>'
        + '<span class="step-tab-label">' + m.label + '</span>'
        + '</button>';
    }).join('');

    // Nav
    this._prevBtn.disabled = this._nodeIndex === 0 && this._stepIndex === 0;
    const isLast = this._stepIndex === this._STEPS.length - 1;
    const isLastNode = this._nodeIndex === this._nodes.length - 1;
    this._nextBtn.style.display = 'block';
    this._nextBtn.textContent = isLast
      ? (isLastNode ? '🎉 Complete Session' : 'Next Topic →')
      : 'Continue →';

    SelectToAction.setNode(node);
    try {
      this._renderStep(node, step);
    } catch(e) {
      console.error('[GuidedView] render step "' + step + '" failed:', e);
      if (this._content) {
        this._content.innerHTML =
          '<div style="padding:24px;text-align:center;">'
          + '<p style="font-family:var(--font-body);font-size:14px;color:var(--text-secondary);margin-bottom:16px;">This step couldn\'t display, but you can keep going.</p>'
          + '<button class="btn-primary" id="gf-skip-broken" style="padding:12px 20px;">Continue →</button>'
          + '</div>';
        document.getElementById('gf-skip-broken')?.addEventListener('click', () => this._advance());
      }
    }

    // Scroll active tab into view (so "Recall", "Reflect" are never clipped)
    setTimeout(() => {
      const activeTab = this._tabs.querySelector('.step-tab.active');
      if (activeTab) activeTab.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
    }, 50);

    // Scroll to top — instant on mobile for reliability
    const mc = document.getElementById('main-content');
    if (mc) { mc.scrollTop = 0; }
    window.scrollTo(0, 0);
  },

  /* ─── STEP RENDERERS ────────────────────────────────── */
  _renderStep(node, step) {
    switch(step) {
      case 'prime':      this._renderPrime(node);     break;
      case 'understand': this._renderUnderstand(node);break;
      case 'notes':      this._renderNotes(node);     break;
      case 'recall':     this._renderRecall(node);    break;
      case 'questions':  this._renderQuestions(node); break;
      case 'reflect':    this._renderReflect(node);   break;
    }
  },

  /* ── STEP 1: PRIME ──────────────────────────────────── */
  _renderPrime(node) {
    const hasAI      = this._aiMode;
    const defs       = (node.definitions||[]).slice(0,3).map(d=>d.term).join(', ');
    const keyTerms   = defs || 'the core concepts';
    const lastActivity = LearnerMemory.getNodeActivitySummary(node);
    const weakText   = LearnerMemory.getWeakQuestionsText(node);
    const mastery    = node.masteryScore ?? null;

    // Personalised returning-learner banner
    const returningBanner = lastActivity
      ? '<div class="gf-prime-row" style="background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);padding:12px 14px;">'
        + '<span class="gf-prime-icon">📊</span>'
        + '<div><strong>Last time you studied this</strong>'
        + '<p style="color:var(--text-secondary);">' + this._esc(lastActivity) + '</p>'
        + (mastery !== null ? '<p style="font-family:var(--font-mono);font-size:11px;color:var(--accent);margin-top:4px;">Current mastery: ' + mastery + '%</p>' : '')
        + '</div></div>'
      : '';

    const weakBanner = weakText
      ? '<div class="gf-prime-row" style="background:var(--red-dim,rgba(255,80,80,.08));border:1px solid rgba(255,80,80,.2);border-radius:var(--radius-md);padding:12px 14px;">'
        + '<span class="gf-prime-icon">⚠️</span>'
        + '<div><strong>Focus areas from last session</strong>'
        + '<p style="color:var(--text-secondary);font-size:13px;">' + this._esc(weakText.replace(/- /g,'')) + '</p>'
        + '</div></div>'
      : '';

    this._content.innerHTML =
      '<div class="gf-card gf-prime">'
      + '<div class="gf-step-badge">Step 1 — Orient Your Mind</div>'
      + '<h3 class="gf-title">Let\'s begin</h3>'
      + '<p class="gf-subtitle">Before we dive in, take 30 seconds to prepare your brain. This makes everything that follows stick better.</p>'

      + '<div class="gf-prime-block">'
      + returningBanner
      + weakBanner
      + '<div class="gf-prime-row"><span class="gf-prime-icon">🎯</span>'
      + '<div><strong>What you\'re learning</strong><p>' + this._esc(node.subject || 'Academic Study') + ' — ' + this._esc(node.chapter || node.title) + '</p></div></div>'

      + '<div class="gf-prime-row"><span class="gf-prime-icon">🔑</span>'
      + '<div><strong>Key terms you\'ll encounter</strong><p>' + this._esc(keyTerms) + '</p></div></div>'

      + '<div class="gf-prime-row"><span class="gf-prime-icon">💭</span>'
      + '<div><strong>Take 30 seconds right now</strong>'
      + '<p>Think: what do you <em>already</em> know about this topic? Even a vague feeling counts.</p></div></div>'
      + '</div>'

      + (hasAI
          ? '<div id="gf-prime-ai" class="gf-ai-block">'
            + '<div class="gf-ai-label" style="display:flex;align-items:center;justify-content:space-between;">'
            + '<span>⬡ Teacher\'s Introduction</span>'
            + '<button class="gf-speak-btn btn-secondary" id="gf-prime-speak" style="font-size:11px;padding:4px 10px;">🔊 Read aloud</button>'
            + '</div>'
            + '<div id="gf-prime-ai-text" class="gf-ai-text"><div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div></div>'
            + '</div>'
          : '<div class="gf-ai-block gf-ai-offline">'
            + '<div class="gf-ai-label">📖 Topic Overview</div>'
            + '<p class="gf-ai-text">' + this._esc(node.summary || 'Read through this topic carefully. Pay attention to definitions, formulas, and the step-by-step procedures.') + '</p>'
            + '</div>')

      + '<div class="gf-action-row">'
      + '<button class="gf-continue-btn" id="gf-prime-ready">I\'m ready — let\'s go →</button>'
      + '</div>'
      + '</div>';

    // Wire the card's own button and hide the global "Continue" FIRST, so they're
    // always set up even when the intro is served from cache (which returns early).
    document.getElementById('gf-prime-ready')?.addEventListener('click', () => this._advance());
    this._nextBtn.style.display = 'none'; // the card has its own "I'm ready" button

    if (hasAI) {
      const ctx    = this._sourceContext(node);
      const isBack = !!lastActivity;

      // The first-time intro is static content (same every visit), so cache it
      // per learner level to avoid re-calling the AI each time you open this node.
      // Returning-visit intros are personalised to the last session, so they are
      // always generated fresh and never cached.
      const profile  = node.learnerProfile || 'college';
      // First-visit intro caches permanently per level.
      // Returning-visit intro caches for 24h so re-entering a topic repeatedly
      // in a session reuses it instead of making a fresh AI call every time.
      const DAY = 24 * 60 * 60 * 1000;
      let cachedIntro = null;
      if (!isBack && node.introCache?.[profile]) {
        cachedIntro = node.introCache[profile];
      } else if (isBack && node.introReturnCache?.[profile]) {
        const entry = node.introReturnCache[profile];
        if (entry && entry.text && (Date.now() - (entry.at || 0) < DAY)) {
          cachedIntro = entry.text;
        }
      }

      const renderIntro = (text) => {
        const el = document.getElementById('gf-prime-ai-text');
        if (el) {
          el.innerHTML = text.split('\n').filter(l=>l.trim())
            .map(l=>'<p style="margin:0 0 10px;font-family:var(--font-body);font-size:14px;line-height:1.7;color:var(--text-primary);">' + this._esc(l) + '</p>').join('');
        }
        this._bindSpeakBtn('gf-prime-speak', () =>
          document.getElementById('gf-prime-ai-text')?.innerText || ''
        );
      };

      if (cachedIntro) {
        renderIntro(cachedIntro);
        return;
      }

      const prompt = ctx + '\n\nYou are a warm, encouraging teacher.'
        + (isBack
            ? ' The student is returning to this topic. Their last session: "' + lastActivity + '".'
              + (weakText ? ' They previously struggled with: ' + weakText.replace(/\n/g,'; ') + '.' : '')
              + ' Acknowledge their return briefly, then give a focused intro that addresses those gaps.'
            : ' Write a 2-paragraph introduction based ONLY on the source material above.')
        + '\n- Paragraph 1: What this topic is really about and why it matters\n'
        + '- Paragraph 2: What the student should watch out for — the 1-2 hardest things\n'
        + 'Only reference the source. Conversational tone. Max 120 words.';
      AIService._callWithFunction('chat', [{role:'user',content:prompt}], 300)
        .then(text => {
          if (!isBack) {
            // First-visit intro — cache permanently per level
            if (!node.introCache) node.introCache = {};
            node.introCache[profile] = text;
          } else {
            // Returning-visit intro — cache with timestamp (24h freshness)
            if (!node.introReturnCache) node.introReturnCache = {};
            node.introReturnCache[profile] = { text, at: Date.now() };
          }
          try { nodeStore.save(node); } catch (e) { /* best-effort */ }
          renderIntro(text);
        })
        .catch(() => {
          const el = document.getElementById('gf-prime-ai-text');
          if (el) el.innerHTML = '<p style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.7;">' + this._esc(node.summary || 'Study this topic carefully.') + '</p>';
          this._bindSpeakBtn('gf-prime-speak', () =>
            document.getElementById('gf-prime-ai-text')?.innerText || ''
          );
        });
    }
  },

  /* ── STEP 2: UNDERSTAND ─────────────────────────────── */
  _renderUnderstand(node) {
    // Re-query the live content element to avoid any stale reference
    this._content = document.getElementById('step-content');
    // Remember which step index this is, so onPass advances from the right place
    const understandIndex = this._stepIndex;
    UnderstandingCheck.show(node, () => {
      // Move directly to the notes step (understand + 1), bypassing any guard issues
      this._stepsCompleted.add(understandIndex);
      this._stepIndex = understandIndex + 1;
      this._nextBtn.style.display = 'block';
      try { StreakTracker.recordActivity(); } catch(e) {}
      this._render();
    });
    // Hide the built-in next button — understanding check has its own
    this._nextBtn.style.display = 'none';
  },

  /* ── STEP 3: NOTES ──────────────────────────────────── */
  _renderNotes(node) {
    const hasQuestions = node.questions.length > 0;

    // Build a clean read-aloud script from the node's blocks
    const buildReadScript = () => {
      const parts = [];
      parts.push('Your notes for ' + node.title + '.');
      if (node.blocks?.length) {
        node.blocks.forEach(b => {
          switch (b.type) {
            case 'prose':
            case 'callout':
              if (b.title) parts.push(b.title + '.');
              if (b.html) parts.push(b.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
              break;
            case 'definition':
              parts.push((b.title || 'Key Definitions') + '.');
              (b.items || []).forEach(d => {
                parts.push(d.term + ': ' + d.description + (d.examples ? '. Examples: ' + d.examples : '') + '.');
              });
              break;
            case 'formula':
              parts.push((b.title || 'Formulas') + '.');
              (b.items || []).forEach(f => {
                parts.push(f.expression + '. ' + (f.description || '') + (f.constraints ? '. Constraints: ' + f.constraints : '') + '.');
              });
              break;
            case 'procedure':
              parts.push((b.title || 'Procedure') + (b.appliesTo ? ', applies to ' + b.appliesTo : '') + '.');
              (b.steps || []).forEach((s, i) => parts.push('Step ' + (i+1) + ': ' + s + '.'));
              if (b.notes) parts.push('Note: ' + b.notes);
              break;
            case 'table':
              parts.push((b.title || 'Table') + '.');
              (b.rows || []).forEach(row => parts.push(row.join(', ') + '.'));
              break;
          }
        });
      } else {
        // Legacy fallback
        (node.definitions || []).forEach(d => parts.push(d.term + ': ' + d.description + '.'));
        (node.formulas || []).forEach(f => parts.push(f.expression + '. ' + f.description + '.'));
        if (node.summary) parts.push('Summary: ' + node.summary);
      }
      return parts.join(' ');
    };

    this._content.innerHTML =
      '<div class="gf-notes-header">'
      + '<div class="gf-step-badge">Step 3 — Read & Absorb</div>'
      + '<h3 class="gf-title">Your notes on <em>' + this._esc(node.title) + '</em></h3>'
      + (() => {
          const focus = node.understandingCheck?.focusAreas;
          if (focus?.length) {
            return '<div class="gf-coach-tip" style="background:var(--accent-soft);border:1px solid var(--accent-dim);">📌 <strong>Based on your answers, focus on:</strong>'
              + '<ul style="margin:6px 0 0;padding-left:18px;">'
              + focus.map(f => '<li style="font-size:13px;line-height:1.55;margin-bottom:3px;">' + this._esc(f) + '</li>').join('')
              + '</ul></div>';
          }
          return '<div class="gf-coach-tip">📌 <strong>Teacher tip:</strong> As you read, mentally tick off any gaps you noticed in the Understanding Check. Pay double attention to those sections.</div>';
        })()
      + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button class="btn-primary" id="gf-notes-lecture" style="flex:1;min-width:160px;font-size:13px;padding:9px 14px;display:flex;align-items:center;gap:7px;justify-content:center;" title="A narrated slideshow with activity break points — plus a voice-only option inside">🎓 Slide lecture</button>'
      + '<button class="gf-speak-btn btn-secondary" id="gf-notes-speak" style="font-size:12px;padding:9px 14px;display:flex;align-items:center;gap:6px;justify-content:center;">🔊 Quick read</button>'
      + '</div>'
      + ((node.userNotes && node.userNotes.trim().length > 30)
          ? '<button class="btn-secondary" id="gf-notes-structure" style="margin-top:10px;font-size:11px;padding:6px 12px;opacity:0.85;" title="Turn your typed notes into structured sections like an AI upload">✨ Structure my notes with AI</button>'
          : '')
      + '</div>'
      + '<div id="gf-fit-check"></div>'
      + (node.blocks?.length ? BlockEngine.renderNode(node) : NotesRenderer.renderFullNotes(node))
      + (node.noteTemplate && node.noteTemplate !== 'standard' ? NoteTemplates.renderDisplay(node) : '')
      + '<div class="gf-notes-footer">'
      + '<div class="gf-section-complete-prompt">'
      + '<p>Done reading? Before you continue, say aloud or write one sentence: <strong>what is the single most important thing on this page?</strong></p>'
      + '<button class="gf-continue-btn" id="gf-notes-done">✓ I\'ve read it — continue →</button>'
      + '</div>'
      + '</div>';

    ImageManager.bindEvents(this._content, node);
    TextAnnotator.restoreHighlights(this._content, node);

    // AI lecture — opens LectureMode, which generates a spoken lecture and handles
    // mobile voice-loading reliably (the inline TTS below can stall on mobile).
    document.getElementById('gf-notes-lecture')?.addEventListener('click', () => {
      this._stopSpeech();
      try { LectureMode.open(node); }
      catch (e) { Toast.error('Could not start lecture: ' + e.message); }
    });

    this._bindSpeakBtn('gf-notes-speak', buildReadScript);
    document.getElementById('gf-notes-structure')?.addEventListener('click', () => this._structureUserNotes(node));
    document.getElementById('gf-notes-done')?.addEventListener('click', () => this._advance());
    this._nextBtn.style.display = 'none';

    // AI quietly checks whether any content (e.g. worked examples) would
    // read better in another format, and asks before reshaping anything.
    if (typeof StudyFitCheck !== 'undefined') {
      StudyFitCheck.run(node, this._content, () => this._renderNotes(node));
    }
  },

  /** Turn the learner's typed "My Notes" into structured blocks using the same
   *  AI pipeline as the upload flow. Non-destructive: takes a backup first, only
   *  commits if real structure was produced, and preserves the original text as
   *  the node's source (rawOCR). */
  async _structureUserNotes(node) {
    if (!AIService.hasApiKey()) { Toast.error('Configure AI first in Settings.'); return; }
    const raw = (node.userNotes || '').trim();
    if (raw.length < 20) { Toast.info('Add some notes first.'); return; }
    if (!confirm('Structure these notes into clean sections (definitions, steps, examples) like an AI upload?\n\nYour original text is preserved as the source, and a backup is taken first.')) return;

    const btn = document.getElementById('gf-notes-structure');
    if (btn) { btn.disabled = true; btn.textContent = '⟳ Structuring…'; }
    try {
      if (typeof BackupVault !== 'undefined') { try { await BackupVault.snapshot('pre-structure'); } catch {} }

      const meta = { title: node.title, subject: node.subject, chapter: node.chapter };
      const data = await AIService.processContent([], raw, meta, () => {});

      const hasStructure = (data.definitions?.length || data.formulas?.length ||
        data.procedures?.length || data.tables?.length ||
        data.commonMistakes?.length || data.summary);
      if (!hasStructure) throw new Error('Could not extract structure from these notes — they are unchanged.');

      // Commit the structured content and rebuild the node's blocks.
      node.definitions    = data.definitions    || [];
      node.tables         = data.tables         || [];
      node.formulas       = data.formulas       || [];
      node.procedures     = data.procedures     || [];
      node.commonMistakes = data.commonMistakes || [];
      node.summary        = data.summary || node.summary || '';
      if (Array.isArray(data.questions) && data.questions.length) {
        node.questions = [...(node.questions || []), ...data.questions];
      }
      node.blocks  = node._migrateToBlocks();
      node.rawOCR  = node.rawOCR || raw;   // keep the original text as source
      node.userNotes = '';                  // now represented by structured blocks
      node.updatedAt = Date.now();
      nodeStore.save(node);

      Toast.success('Notes structured. Your original text is kept as the source.');
      this._renderNotes(node);
    } catch (e) {
      Toast.error('Could not structure: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '✨ Structure my notes with AI'; }
    }
  },

  /** Build a clean, readable source reference from the node's actual content —
   *  definitions, formulas, tables, procedures, and raw OCR. Never shows AI prompts. */
  _nodeSourceText(node) {
    const parts = [];
    if (node.summary) parts.push('SUMMARY\n' + node.summary);
    if (node.definitions?.length) {
      parts.push('DEFINITIONS\n' + node.definitions.slice(0, 12).map(d =>
        (d.term || d.name || '') + ': ' + (d.description || d.def || '')).join('\n'));
    }
    if (node.formulas?.length) {
      parts.push('FORMULAS\n' + node.formulas.slice(0, 8).map(f =>
        (f.name || '') + (f.expression ? ' — ' + f.expression : '') + (f.description ? ': ' + f.description : '')).join('\n'));
    }
    if (node.procedures?.length) {
      parts.push('PROCEDURES\n' + node.procedures.slice(0, 4).map((p, i) => {
        const t = typeof p === 'string' ? p : (p && (p.title || p.name || JSON.stringify(p)));
        return (i+1) + '. ' + t;
      }).join('\n'));
    }
    if (node.tables?.length) {
      parts.push('TABLES\n' + node.tables.slice(0, 2).map(t =>
        (t.title || 'Table') + ': ' + (t.description || '')).join('\n'));
    }
    if (node.commonMistakes?.length) {
      parts.push('COMMON MISTAKES\n' + node.commonMistakes.slice(0, 4).map(m =>
        typeof m === 'string' ? m : (m.mistake || m.description || JSON.stringify(m))).join('\n'));
    }
    if (!parts.length && node.rawOCR) parts.push(node.rawOCR.slice(0, 1500));
    if (!parts.length && node.userNotes) parts.push(node.userNotes.slice(0, 1500));
    return parts.join('\n\n') || '(No source content found for this node.)';
  },
  _renderRecall(node) {
    this._nextBtn.style.display = 'none';
    const onPass = () => {
      this._stepsCompleted.add(this._stepIndex);
      this._advance();
    };

    // Mode picker — let the student choose how to test themselves
    const container = document.getElementById('step-content');
    if (!container) { BlankRecall.show(node, 'recall', onPass); return; }

    container.innerHTML =
      '<div class="gf-card" style="text-align:center;">'
      + '<div class="gf-step-badge">Step 4 — Recall</div>'
      + '<h3 class="gf-title">How do you want to test yourself?</h3>'
      + '<p class="gf-subtitle" style="margin-bottom:24px;">Both methods work. The second is harder — and builds more memory.</p>'
      + '<div style="display:flex;flex-direction:column;gap:12px;">'

      + '<button id="mode-blank" class="btn-secondary" style="padding:16px 18px;text-align:left;">'
      + '<div style="font-family:var(--font-ui);font-weight:700;font-size:15px;margin-bottom:4px;">✍ Blank Recall</div>'
      + '<div style="font-size:13px;color:var(--text-muted);">Write everything you remember from scratch, then compare to your notes. Self-marked.</div>'
      + '</button>'

      + '<button id="mode-teach" class="btn-secondary" style="padding:16px 18px;text-align:left;border-color:var(--accent-dim);">'
      + '<div style="font-family:var(--font-ui);font-weight:700;font-size:15px;margin-bottom:4px;color:var(--accent-light);">🎓 Teach It <span style="font-family:var(--font-mono);font-size:10px;font-weight:400;color:var(--accent);margin-left:6px;">90% retention</span></div>'
      + '<div style="font-size:13px;color:var(--text-muted);">Explain the topic as if teaching a beginner. AI evaluates what you covered, what you missed, and what needs correction.</div>'
      + '</button>'

      + '<button id="mode-skip" style="background:none;border:none;color:var(--text-muted);font-size:13px;cursor:pointer;padding:8px;">Skip recall step →</button>'
      + '</div></div>';

    document.getElementById('mode-blank')?.addEventListener('click', () => BlankRecall.show(node, 'recall', onPass));
    document.getElementById('mode-teach')?.addEventListener('click', () => BlankRecall.showTeachIt(node, onPass));
    document.getElementById('mode-skip')?.addEventListener('click', () => onPass());
  },

  /* ── STEP 5: QUESTIONS ──────────────────────────────── */
  _renderQuestions(node) {
    const qs = node.questions;
    this._nextBtn.style.display = 'block';

    if (!qs.length) {
      this._content.innerHTML =
        '<div class="gf-card">'
        + '<div class="gf-step-badge">Step 5 — Practice</div>'
        + '<h3 class="gf-title">No questions yet</h3>'
        + '<p class="gf-subtitle">This node doesn\'t have questions yet. You can:</p>'
        + '<div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">'
        + '<button class="btn-secondary" onclick="NodeDetailView.open(\'' + node.id + '\'); setTimeout(()=>document.querySelector(\'[data-section=questions]\')?.click?.(),400);">+ Add questions in Library →</button>'
        + '</div>'
        + '</div>';
      return;
    }

    // Shuffle questions each session for variety — but persist the order and index
    // so re-entering the step resumes exactly where the student left off.
    const saveKey = 'kn_q_' + node.id;
    let savedState = null;
    try { savedState = JSON.parse(localStorage.getItem(saveKey) || 'null'); } catch {}

    let shuffled, qIdx, correct, skipped;

    // Restore: try to recover both position AND order; fall back to just position
    if (savedState && typeof savedState.qIdx === 'number' && savedState.qIdx > 0) {
      const hasValidOrder = savedState.order && Array.isArray(savedState.order)
        && savedState.order.length === qs.length
        && savedState.order.every(id => id != null);

      if (hasValidOrder) {
        const restored = savedState.order.map(id => qs.find(q => q.id === id)).filter(Boolean);
        shuffled = (restored.length === qs.length) ? restored : [...qs].sort(() => Math.random()-0.5);
      } else {
        // No valid order saved — fresh shuffle but resume at the saved index
        shuffled = [...qs].sort(() => Math.random()-0.5);
      }
      qIdx    = Math.min(savedState.qIdx, shuffled.length - 1);
      correct = savedState.correct || 0;
      skipped = savedState.skipped || 0;
    } else {
      shuffled = [...qs].sort(() => Math.random()-0.5);
      qIdx = 0; correct = 0; skipped = 0;
    }

    const _save = () => {
      const hasIds = shuffled.every(q => q && q.id);
      localStorage.setItem(saveKey, JSON.stringify({
        qIdx, correct, skipped,
        order: hasIds ? shuffled.map(q => q.id) : null,
      }));
    };

    const renderQ = (i) => {
      _save();   // persist current index so re-entering resumes here
      if (i >= shuffled.length) { localStorage.removeItem(saveKey); renderSummaryQ(); return; }
      const q = shuffled[i];
      const isRecall = q.type === 'recall';

      this._content.innerHTML =
        '<div class="gf-card gf-question-card">'
        + '<div class="gf-step-badge">Question ' + (i+1) + ' of ' + shuffled.length + ' — ' + (isRecall?'Recall':'Application') + '</div>'

        // Coach tip varies by question type
        + '<div class="gf-coach-tip">' + (isRecall
            ? '🧠 <strong>Recall:</strong> Try to answer from memory first. Don\'t look at your notes yet.'
            : '🧩 <strong>Application:</strong> Work through this step by step. Think about which procedure or formula applies.')
        + '</div>'

        + '<div class="gf-q-text">' + this._esc(q.question) + '</div>'

        // Source reference panel — always available for application questions,
        // available on demand for recall. Lets students refer to the data the
        // question is based on (e.g. financial statements, tables, examples).
        + '<div id="gf-source-panel" style="margin-bottom:10px;">'
        + '<button id="gf-source-btn" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--text-secondary);cursor:pointer;font-size:12px;padding:6px 12px;font-family:var(--font-ui);">'
        + (isRecall ? '📋 Show source (only if stuck)' : '📋 View source data') + '</button>'
        + '<div id="gf-source-body" style="display:none;margin-top:8px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;max-height:220px;overflow-y:auto;">'
        + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:8px;">📋 Source: ' + this._esc(node.title) + '</div>'
        + '<div style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;">' + this._esc(this._nodeSourceText(node)) + '</div>'
        + '</div></div>'

        + '<textarea id="gf-q-answer" class="config-input gf-answer-area" rows="4" placeholder="Write your answer here…" style="resize:vertical;touch-action:pan-y;" autocorrect="on" autocapitalize="sentences" spellcheck="true"></textarea>'

        // AI hint (hidden by default)
        + '<div id="gf-q-hint-area" style="display:none;margin-top:10px;background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius-md);padding:12px 16px;">'
        + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:8px;">💡 Hint</div>'
        + '<div id="gf-q-hint-text" style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.65;"></div>'
        + '</div>'

        + '<div class="gf-q-actions">'
        + (this._aiMode ? '<button class="rai-btn" id="gf-hint-btn">💡 Hint</button>' : '')
        + '<button class="rai-btn" id="gf-skip-btn">Skip →</button>'
        + '<button class="btn-primary" id="gf-submit-btn">Check Answer →</button>'
        + '</div>'
        + '</div>';

      // Toggle source panel
      document.getElementById('gf-source-btn')?.addEventListener('click', () => {
        const body = document.getElementById('gf-source-body');
        const btn  = document.getElementById('gf-source-btn');
        if (!body) return;
        const showing = body.style.display !== 'none';
        body.style.display = showing ? 'none' : 'block';
        btn.textContent = showing
          ? (isRecall ? '📋 Show source (only if stuck)' : '📋 View source data')
          : '📋 Hide source';
      });

      // Hint
      if (this._aiMode) {
        document.getElementById('gf-hint-btn')?.addEventListener('click', async () => {
          const hintArea = document.getElementById('gf-q-hint-area');
          const hintText = document.getElementById('gf-q-hint-text');
          hintArea.style.display = 'block';
          hintText.innerHTML = '<div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div>';
          try {
            const ctx = this._sourceContext(node);
            const hint = await AIService._callWithFunction('chat', [{role:'user', content: ctx + '\n\nQuestion being asked: "' + q.question + '"\n\nGive a 1-2 sentence hint that nudges the student toward the answer WITHOUT revealing it. Reference only the source material above. If the answer is directly in the source, point them to the relevant section.'}], 150);
            hintText.textContent = hint;
          } catch(e) {
            hintText.textContent = 'Think about the key definition or formula related to this question.';
          }
        });
      }

      // Skip
      document.getElementById('gf-skip-btn')?.addEventListener('click', () => {
        skipped++;
        qIdx++;
        renderQ(qIdx);
      });

      // Submit → AI grade or self-mark
      document.getElementById('gf-submit-btn')?.addEventListener('click', async () => {
        const studentAnswer = document.getElementById('gf-q-answer')?.value.trim();
        if (!studentAnswer) { Toast.info('Write something first — even a guess.'); return; }

        const submitBtn = document.getElementById('gf-submit-btn');
        if (submitBtn) { submitBtn.disabled=true; submitBtn.textContent='Checking…'; }

        let result;
        if (this._aiMode) {
          try {
            const ctx = this._sourceContext(node);
            const gradePrompt = ctx + '\n\nQuestion: "' + q.question + '"\nModel answer: "' + q.answer + '"\nStudent answer: "' + studentAnswer + '"\n\nGrade based on CONCEPTUAL UNDERSTANDING, not exact wording or completeness. Rules:\n- If the student grasps the core idea correctly, score 80-100 even if their phrasing is informal or they left out minor details.\n- Only penalise for a fundamentally wrong concept or a critical missing element that changes the meaning.\n- Paraphrasing the model answer in the student\'s own words = full marks.\n- Partial understanding = 50-79 with encouragement on what they got right.\n- Missing the core concept entirely = below 50.\nBe warm and encouraging. Acknowledge what they got right before noting any gaps.\nOutput ONLY valid JSON: {"score":0,"correct":false,"feedback":"","tip":"","sourceQuote":""}';
            const raw = await AIService._callWithFunction('grading', [{role:'user',content:gradePrompt}], 300);
            result = AIService._parseJSON(raw);
          } catch(e) {
            result = { score: studentAnswer.length > 20 ? 60 : 30, correct: false, feedback: 'Configure AI for detailed grading.', tip: '' };
          }
        } else {
          // Offline: show self-mark
          result = null;
        }

        this._renderAnswerReveal(node, q, studentAnswer, result, shuffled, i, () => {
          if (result && result.score >= 70) correct++;

          // Update SRS state so mastery reflects Guided Study performance
          // Score ≥80 → Easy (4), ≥60 → Good (3), ≥40 → Hard (2), <40 → Again (1)
          const rating = result
            ? (result.score >= 80 ? 4 : result.score >= 60 ? 3 : result.score >= 40 ? 2 : 1)
            : 3; // no AI — default to Good so it at least registers
          try {
            node.recordRating(q.id, rating);
            nodeStore.save(node);
            LearnerMemory.recordStruggle(node, q, rating);
          } catch(e) { console.warn('[GuidedView] recordRating failed:', e); }

          qIdx++;
          renderQ(qIdx);
        });
      });
    };

    const renderSummaryQ = () => {
      const pct = shuffled.length > 0 ? Math.round((correct / shuffled.length) * 100) : 0;
      const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--red)';
      const msg   = pct >= 80
        ? 'Excellent work! You clearly understand this topic.'
        : pct >= 50
          ? 'Good progress. Review the questions you struggled with before moving on.'
          : 'This topic needs more practice. Consider re-reading the notes before your next session.';

      this._content.innerHTML =
        '<div class="gf-card">'
        + '<div class="gf-step-badge">Practice Complete</div>'
        + '<div style="text-align:center;padding:20px 0;">'
        + '<div style="font-family:var(--font-mono);font-size:48px;font-weight:800;color:' + color + ';margin-bottom:8px;">' + pct + '%</div>'
        + '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:16px;">' + correct + '/' + shuffled.length + ' correct · ' + skipped + ' skipped</div>'
        + '<p style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.65;">' + msg + '</p>'
        + '</div>'
        + '</div>';
      this._nextBtn.style.display = 'block';
    };

    renderQ(qIdx);
    this._nextBtn.style.display = 'none';
  },

  _renderAnswerReveal(node, q, studentAnswer, aiResult, shuffled, i, onNext) {
    const isCorrect = aiResult ? aiResult.score >= 70 : null;
    const scoreColor = aiResult
      ? (aiResult.score >= 70 ? 'var(--green)' : aiResult.score >= 40 ? 'var(--accent)' : 'var(--red)')
      : 'var(--text-muted)';

    this._content.innerHTML =
      '<div class="gf-card gf-question-card">'
      + '<div class="gf-step-badge">Question ' + (i+1) + ' of ' + shuffled.length + ' — Answer Revealed</div>'

      // Student answer
      + '<div style="margin-bottom:14px;">'
      + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:6px;">Your answer</div>'
      + '<div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.65;padding:12px 14px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);">' + this._esc(studentAnswer) + '</div>'
      + '</div>'

      // Model answer
      + '<div style="margin-bottom:14px;">'
      + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--green);margin-bottom:6px;">✓ Model answer</div>'
      + '<div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.65;padding:12px 14px;background:var(--green-dim);border:1px solid rgba(52,199,123,0.2);border-radius:var(--radius-md);">' + this._esc(q.answer) + '</div>'
      + '</div>'

      // AI feedback
      + (aiResult
          ? '<div style="padding:12px 16px;background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid ' + scoreColor + ';border-radius:var(--radius-md);margin-bottom:14px;">'
            + '<div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:' + scoreColor + ';margin-bottom:6px;">' + aiResult.score + '/100</div>'
            + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.65;margin-bottom:' + (aiResult.tip?'8px':'0') + ';">' + this._esc(aiResult.feedback||'') + '</p>'
            + (aiResult.tip ? '<p style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-top:6px;">💡 ' + this._esc(aiResult.tip) + '</p>' : '')
            + (aiResult.sourceQuote ? '<div style="margin-top:8px;padding:10px 12px;background:var(--bg-elevated,var(--bg));border:1px solid var(--border-soft,var(--border));border-left:3px solid var(--text-muted);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:11px;color:var(--text-muted);"><span style="font-weight:700;">📖 From your notes: </span>' + this._esc(aiResult.sourceQuote) + '</div>' : '')
            + '</div>'
          : '<div style="padding:12px 16px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:14px;">'
            + '<p style="font-family:var(--font-ui);font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">How did you do?</p>'
            + '<div style="display:flex;gap:8px;">'
            + '<button class="rai-btn" onclick="this.closest(\'.gf-question-card\').dataset.selfMark=\'correct\';onNext();">✓ Got it</button>'
            + '<button class="rai-btn" onclick="onNext();">✗ Missed it</button>'
            + '</div>'
            + '</div>')

      + '<button class="gf-continue-btn" id="gf-next-q-btn">Next Question →</button>'
      + '</div>';

    document.getElementById('gf-next-q-btn')?.addEventListener('click', onNext);
  },

  /* ── STEP 6: REFLECT ─────────────────────────────────── */
  _renderReflect(node) {
    this._nextBtn.style.display = 'block';
    const isLastNode = this._nodeIndex === this._nodes.length - 1;
    const sessionMins = Math.round((Date.now() - (this._sessionStart||Date.now())) / 60000);

    this._content.innerHTML =
      '<div class="gf-card gf-reflect">'
      + '<div class="gf-step-badge">Step 6 — Reflect & Lock In</div>'
      + '<h3 class="gf-title">Great work — let\'s cement this 🧠</h3>'

      // Feynman moment
      + '<div class="gf-reflect-section">'
      + '<div class="gf-reflect-label">✏ The Feynman Test</div>'
      + '<p class="gf-reflect-desc">Explain <strong>' + this._esc(node.title) + '</strong> in plain English, as if teaching a 15-year-old. No jargon allowed. This is the ultimate memory test.</p>'
      + '<textarea id="gf-feynman-text" class="config-input" rows="4" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.65;margin-top:10px;" placeholder="In plain English, this topic is about… The way I\'d explain it is…"></textarea>'
      + (this._aiMode ? '<button class="rai-btn" id="gf-feynman-check" style="margin-top:8px;">⬡ Get AI feedback on my explanation</button>' : '')
      + '<div id="gf-feynman-feedback" style="display:none;margin-top:10px;"></div>'
      + '</div>'

      // What stuck / what didn't
      + '<div class="gf-reflect-section">'
      + '<div class="gf-reflect-label">🎯 Quick self-assessment</div>'
      + '<div class="gf-confidence-grid">'
      + ['I can define the key terms','I understand why it works this way','I can apply this to a new problem','I know the common mistakes to avoid']
        .map((item, i) => '<label class="gf-confidence-row"><input type="checkbox" class="gf-confidence-check" style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;"/><span>' + item + '</span></label>').join('')
      + '</div>'
      + '</div>'

      // What's next
      + '<div class="gf-reflect-section" style="background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);padding:16px 18px;">'
      + '<div class="gf-reflect-label" style="color:var(--accent);">📅 What happens next</div>'
      + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.65;margin-top:6px;">'
      + 'Spaced repetition will schedule a review of this node. The longer you wait and still remember, the less frequently you\'ll need to review it. '
      + 'Check the <strong>Review tab</strong> tomorrow for your first scheduled practice.'
      + '</p>'
      + (sessionMins > 0 ? '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:8px;">Session time: ' + sessionMins + ' min</p>' : '')
      + '</div>'

      + (isLastNode && this._stepsCompleted.size > 0
          ? '<div style="margin-top:20px;padding:18px;background:var(--green-dim);border:1px solid rgba(52,199,123,0.2);border-radius:var(--radius-md);text-align:center;">'
            + '<div style="font-size:28px;margin-bottom:8px;">🎉</div>'
            + '<p style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:var(--green);">All nodes complete!</p>'
            + '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:4px;">Excellent session. Head to Review tomorrow to reinforce everything.</p>'
            + '</div>'
          : '')
      + '</div>';

    // Feynman AI feedback
    if (this._aiMode) {
      document.getElementById('gf-feynman-check')?.addEventListener('click', async () => {
        const text = document.getElementById('gf-feynman-text')?.value?.trim();
        if (!text) { Toast.info('Write your explanation first.'); return; }
        const fb = document.getElementById('gf-feynman-feedback');
        fb.style.display = 'block';
        fb.innerHTML = '<div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div>';
        try {
          const ctx = this._sourceContext(node);
          const prompt = ctx + '\n\nA student wrote this plain-English explanation of the topic:\n"' + text + '"\n\nBased ONLY on the source material above, evaluate their explanation: (1) what concepts they got right, (2) what is missing or inaccurate compared to the source, (3) one improvement suggestion. Where they are wrong, quote the correct information from the source. Be encouraging but honest. Max 100 words.';
          const response = await AIService._callWithFunction('chat', [{role:'user',content:prompt}], 200);
          fb.innerHTML = '<div style="background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius-md);padding:12px 16px;">'
            + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:8px;">⬡ Feedback</div>'
            + response.split('\n').filter(l=>l.trim()).map(l=>'<p style="font-family:var(--font-body);font-size:13px;line-height:1.65;color:var(--text-primary);margin:0 0 6px;">' + this._esc(l) + '</p>').join('')
            + '</div>';
        } catch(e) {
          fb.innerHTML = '<p style="font-family:var(--font-mono);font-size:12px;color:var(--red);">' + this._esc(e.message) + '</p>';
        }
      });
    }
  },

  /* ─── SESSION COMPLETE ───────────────────────────────── */
  _showSessionComplete() {
    const mins = this._sessionStart
      ? Math.round((Date.now() - this._sessionStart) / 60000) : 0;
    // Compute mastery deltas for studied nodes
    const studied = this._nodes.slice(0, this._nodeIndex + 1);
    const masteryLines = studied.map(n =>
      `<div class="gsc-topic"><span>${this._esc(n.title)}</span><span class="gsc-mastery">${n.masteryScore}%</span></div>`
    ).join('');
    const due = nodeStore.getDueNodes().length;

    this._content.innerHTML = `
      <div class="guided-session-complete">
        <div class="gsc-trophy">🎉</div>
        <h2 class="gsc-title">Session Complete!</h2>
        <div class="gsc-stats">
          ${mins > 0 ? `<div class="gsc-stat"><span class="gsc-stat-val">${mins}</span><span class="gsc-stat-lbl">minutes</span></div>` : ''}
          <div class="gsc-stat"><span class="gsc-stat-val">${studied.length}</span><span class="gsc-stat-lbl">topic${studied.length !== 1 ? 's' : ''}</span></div>
          ${due > 0 ? `<div class="gsc-stat gsc-stat--due"><span class="gsc-stat-val">${due}</span><span class="gsc-stat-lbl">cards due</span></div>` : ''}
        </div>
        <div class="gsc-topics">${masteryLines}</div>
        <p class="gsc-next-msg">
          ${due > 0
            ? 'You have <strong>' + due + ' cards due for review</strong> — now is a great time.'
            : 'Your next review will be scheduled automatically. Come back tomorrow to reinforce this.'}
        </p>
        <div class="gsc-actions">
          ${due > 0 ? `<button class="btn-primary" onclick="App.navigateTo('review')">↺ Start Review</button>` : ''}
          <button class="btn-secondary" onclick="App.navigateTo('dashboard')">◉ View Progress</button>
        </div>
      </div>`;
    this._prevBtn.style.display = 'none';
    this._nextBtn.style.display = 'none';
  },

  /* ─── NAVIGATION ─────────────────────────────────────── */
  _advance() {
    this._stopSpeech();
    this._stepsCompleted.add(this._stepIndex);
    // Side effects must never block navigation
    try { StreakTracker.recordActivity(); } catch(e) { console.warn('[GuidedView] streak:', e); }
    try { if (this._stepIndex === 0) Onboarding.markStudied(); } catch(e) { console.warn('[GuidedView] onboarding:', e); }

    if (this._stepIndex < this._STEPS.length - 1) {
      this._stepIndex++;
      this._nextBtn.style.display = 'block';
      this._render();
    } else if (this._nodeIndex < this._nodes.length - 1) {
      this._nodeIndex++;
      this._stepIndex      = 0;
      this._stepsCompleted = new Set();
      this._sessionStart   = Date.now();
      this._render();
    } else {
      // Show rich session completion screen instead of a plain toast
      this._inSession = false;
      try { StreakTracker.recordActivity(); } catch(e) {}
      try { localStorage.removeItem('kn_guided_progress'); } catch(e) {}
      this._saveSessionSummary();
      this._showSessionComplete();
    }
  },

  async _saveSessionSummary() {
    for (const node of this._nodes) {
      try {
        const stepsCompleted = this._stepsCompleted.size;

        // Always write memory — even without AI
        LearnerMemory.recordGuidedSession(node, { stepsCompleted });

        // If AI available, enrich with a smarter summary
        if (!AIService.hasApiKey()) continue;
        const questions = (node.questions||[]).slice(0,5);
        if (!questions.length) continue;
        const prompt = 'In 1-2 sentences, summarise this study session for future reference.\n'
          + 'Subject: ' + (node.subject||node.title) + '\n'
          + 'Session duration: ' + Math.round((Date.now()-(this._sessionStart||Date.now()))/60000) + ' minutes\n'
          + 'Topics covered: ' + node.title + '\n\n'
          + 'Write: what was studied, and note any patterns you can infer. Max 30 words.';
        const summary = await AIService._callWithFunction('noteProcessing', [{role:'user',content:prompt}], 200);

        // Update the activity summary with the richer AI version
        node.activitySummary = summary.trim();
        nodeStore.save(node);
      } catch(e) {
        console.warn('Session summary failed:', e);
      }
    }
  },

  _goToStep(idx) {
    if (idx > this._stepIndex && !this._stepsCompleted.has(idx-1)) return;
    this._stepIndex = idx;
    this._nextBtn.style.display = 'block';
    this._render();
  },

  _prevStep() {
    if (this._stepIndex > 0) {
      this._stepIndex--;
      this._nextBtn.style.display = 'block';
      this._render();
      return;
    }
    if (this._nodeIndex > 0) {
      this._nodeIndex--;
      this._stepIndex      = this._STEPS.length - 1;
      this._stepsCompleted = new Set([0,1,2,3,4]);
      this._render();
    }
  },

  /* ─── Source context builder — passed to every AI call ─── */
  /** Build session memory string to inject into AI calls */
  _sessionMemory(node) {
    const log = (node.sessionLog||[]).slice(-3);
    if (!log.length) return '';
    return 'STUDENT SESSION HISTORY (use to personalise):\n'
      + log.map(s => '- ' + s.date + ': ' + s.summary).join('\n') + '\n\n';
  },

  _sourceContext(node) {
    return LearnerContext.forGuidedStudy(node);
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
