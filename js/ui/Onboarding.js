/**
 * Onboarding.js — First-run journey
 *
 * New users get a clear, step-by-step journey:
 *   1. Welcome screen (choose tour or jump in)
 *   2. 3-slide tour explaining the study loop
 *   3. Action gate — guided setup with 3 concrete steps
 *      shown as a persistent checklist until completed:
 *        ① Upload your first notes
 *        ② Add your exam date (Study Plan)
 *        ③ Do your first Study session
 *   4. Once all 3 done — journey complete, checklist hides
 *
 * The checklist is shown as a banner at the top of every
 * screen until dismissed, so the student always knows what
 * to do next regardless of where they navigate.
 *
 * Stored in localStorage — never shown again after dismissed.
 */

const Onboarding = {
  _key:        'kn_onboarded_v1',
  _journeyKey: 'kn_journey_v1',
  _dismissKey: 'kn_checklist_dismissed', // session-scoped: stays closed until app reopened
  _ran:        false,
  _currentSlide: 0,

  _slides: [
    {
      icon: '⬡',
      title: 'The Study Loop',
      subtitle: 'One method. Proven by research.',
      content: `
        <div class="ob-loop">
          <div class="ob-loop-step"><span class="ob-loop-icon">📖</span><span>Read</span></div>
          <div class="ob-loop-arrow">→</div>
          <div class="ob-loop-step"><span class="ob-loop-icon">💡</span><span>Understand</span></div>
          <div class="ob-loop-arrow">→</div>
          <div class="ob-loop-step"><span class="ob-loop-icon">✍</span><span>Recall</span></div>
          <div class="ob-loop-arrow">→</div>
          <div class="ob-loop-step"><span class="ob-loop-icon">❓</span><span>Test</span></div>
          <div class="ob-loop-arrow">→</div>
          <div class="ob-loop-step accent"><span class="ob-loop-icon">🔁</span><span>Repeat</span></div>
        </div>
        <p class="ob-body">Most students re-read their notes. That feels productive but doesn't build memory. KnowledgeNode forces retrieval — the only thing that actually works.</p>`,
    },
    {
      icon: '⊞',
      title: 'Knowledge Nodes',
      subtitle: 'Your notes, structured for learning.',
      content: `
        <div class="ob-features">
          <div class="ob-feature">
            <span class="ob-feature-icon">📷</span>
            <div>
              <div class="ob-feature-title">Scan anything</div>
              <div class="ob-feature-desc">Photo, PDF, or type. AI pulls out definitions, formulas, procedures — from your source only.</div>
            </div>
          </div>
          <div class="ob-feature">
            <span class="ob-feature-icon">🎓</span>
            <div>
              <div class="ob-feature-title">Adapt to your level</div>
              <div class="ob-feature-desc">Primary, High School, College, or Professional. Same content, explained at your pace.</div>
            </div>
          </div>
          <div class="ob-feature">
            <span class="ob-feature-icon">✍</span>
            <div>
              <div class="ob-feature-title">Recall before reading</div>
              <div class="ob-feature-desc">Write everything you remember first. That struggle is where real learning happens.</div>
            </div>
          </div>
          <div class="ob-feature">
            <span class="ob-feature-icon">🔁</span>
            <div>
              <div class="ob-feature-title">Spaced repetition</div>
              <div class="ob-feature-desc">The app decides when to show each question again. Easy cards fade out. Hard ones resurface.</div>
            </div>
          </div>
        </div>`,
    },
    {
      icon: '📅',
      title: 'Three steps to get started',
      subtitle: "Here's exactly what to do first.",
      content: `
        <div class="ob-steps">
          <div class="ob-step">
            <div class="ob-step-num">1</div>
            <div>
              <div class="ob-step-title">Upload your first notes</div>
              <div class="ob-step-desc">Photograph a page, drag in a PDF, or type. The AI structures it into your first node. <strong>Scan one topic at a time</strong> — e.g. "M1.1 Gross Income" as one node, not the whole module.</div>
            </div>
          </div>
          <div class="ob-step">
            <div class="ob-step-num">2</div>
            <div>
              <div class="ob-step-title">Set your exam date</div>
              <div class="ob-step-desc">Go to Study Plan and enter your deadline. The app builds a day-by-day schedule automatically.</div>
            </div>
          </div>
          <div class="ob-step">
            <div class="ob-step-num">3</div>
            <div>
              <div class="ob-step-title">Do your first Study session</div>
              <div class="ob-step-desc">Tap Study in the bottom bar. Walk through Orient → Read → Recall → Practice for your first node.</div>
            </div>
          </div>
        </div>
        <div class="ob-tip">A checklist will guide you through these steps — visible until all three are done.</div>`,
    },
  ],

  /* ─────────────────────────────────────────────────
     JOURNEY STATE
  ───────────────────────────────────────────────── */
  _getJourney() {
    let j;
    try { j = JSON.parse(localStorage.getItem(this._journeyKey) || '{}'); } catch(e) { j = {}; }
    // Self-heal: if any node exists, the "upload" step is done — no matter which
    // save path created it. Keeps the checklist from drifting out of sync.
    try {
      if (!j.uploaded && typeof nodeStore !== 'undefined' && nodeStore.getAll && nodeStore.getAll().length > 0) {
        j.uploaded = true;
      }
    } catch(e) {}
    return j;
  },
  _saveJourney(state) {
    try { localStorage.setItem(this._journeyKey, JSON.stringify(state)); } catch(e) {}
  },
  _journeyComplete() {
    const j = this._getJourney();
    return j.uploaded && j.planSet && j.studied;
  },

  /* Mark individual journey steps */
  markUploaded()  { const j = this._getJourney(); j.uploaded = true;  this._saveJourney(j); this._refreshChecklist(); },
  markPlanSet()   { const j = this._getJourney(); j.planSet  = true;  this._saveJourney(j); this._refreshChecklist(); },
  markStudied()   { const j = this._getJourney(); j.studied  = true;  this._saveJourney(j); this._refreshChecklist(); },

  /* ─────────────────────────────────────────────────
     ENTRY POINT
  ───────────────────────────────────────────────── */
  checkFirstLaunch() {
    if (this._ran) return;
    this._ran = true;
    try {
      const onboarded = localStorage.getItem(this._key);
      if (!onboarded) {
        this._showWelcome();
      } else if (!this._journeyComplete()) {
        // Returning user who hasn't finished setup
        setTimeout(() => this._mountChecklist(), 800);
      }
    } catch(e) {
      console.warn('[Onboarding] localStorage unavailable:', e.message);
    }
  },

  /* ─────────────────────────────────────────────────
     WELCOME SCREEN
  ───────────────────────────────────────────────── */
  _showWelcome() {
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-welcome">
        <div class="ob-logo">
          <div class="ob-logo-mark">K</div>
          <div class="ob-logo-text">KnowledgeNode</div>
        </div>
        <h1 class="ob-welcome-title">Study smarter.<br>Remember more.</h1>
        <p class="ob-welcome-sub">An AI-powered study system built around how memory actually works.</p>
        <div class="ob-choice-btns">
          <button class="ob-btn-primary" id="ob-show-tour">🚀 Show me how it works</button>
          <button class="ob-btn-secondary" id="ob-skip">⬡ I know what I'm doing — jump in</button>
        </div>
        <p class="ob-small">Prefer the details? <button id="ob-open-guide" style="background:none;border:none;padding:0;color:var(--accent);font:inherit;cursor:pointer;text-decoration:underline;">Read the full guide</button> — also in Settings anytime.</p>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('ob-show-tour').addEventListener('click', () => {
      overlay.remove();
      this._currentSlide = 0;
      this._showSlide();
    });
    document.getElementById('ob-open-guide')?.addEventListener('click', () => {
      if (typeof Guide !== 'undefined') Guide.open();
    });
    document.getElementById('ob-skip').addEventListener('click', () => {
      overlay.remove();
      this._markDone();
      this._mountChecklist();
      App.navigateTo('upload');
    });
  },

  /* ─────────────────────────────────────────────────
     3-SLIDE TOUR
  ───────────────────────────────────────────────── */
  _showSlide() {
    document.getElementById('onboarding-overlay')?.remove();
    const slide  = this._slides[this._currentSlide];
    const total  = this._slides.length;
    const isLast = this._currentSlide === total - 1;
    const dots   = this._slides.map((_, i) =>
      `<div class="ob-dot ${i === this._currentSlide ? 'active' : ''}"></div>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-slide">
        <button class="ob-skip-link" id="ob-skip-tour">Skip</button>
        <div class="ob-slide-icon">${slide.icon}</div>
        <h2 class="ob-slide-title">${slide.title}</h2>
        <p class="ob-slide-sub">${slide.subtitle}</p>
        <div class="ob-slide-content">${slide.content}</div>
        <div class="ob-dots">${dots}</div>
        <div class="ob-slide-nav">
          ${this._currentSlide > 0
            ? `<button class="ob-btn-ghost" id="ob-prev">← Back</button>`
            : `<div></div>`}
          <button class="ob-btn-primary" id="ob-next">
            ${isLast ? "Let's go →" : 'Next →'}
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Swipe support
    let startX = 0;
    overlay.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchend',   e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) diff > 0 ? this._next() : this._prev();
    });

    document.getElementById('ob-next')?.addEventListener('click',     () => this._next());
    document.getElementById('ob-prev')?.addEventListener('click',     () => this._prev());
    document.getElementById('ob-skip-tour')?.addEventListener('click', () => {
      overlay.remove();
      this._markDone();
      this._mountChecklist();
      App.navigateTo('upload');
    });
  },

  _next() {
    document.getElementById('onboarding-overlay')?.remove();
    if (this._currentSlide < this._slides.length - 1) {
      this._currentSlide++;
      this._showSlide();
    } else {
      this._markDone();
      this._mountChecklist();
      App.navigateTo('upload');
    }
  },
  _prev() {
    if (this._currentSlide > 0) {
      this._currentSlide--;
      document.getElementById('onboarding-overlay')?.remove();
      this._showSlide();
    }
  },
  _markDone() {
    try { localStorage.setItem(this._key, '1'); } catch(e) {}
  },

  /* ─────────────────────────────────────────────────
     PERSISTENT CHECKLIST BANNER
     Mounts once, stays visible across all views
     until all 3 journey steps are complete.
  ───────────────────────────────────────────────── */
  _checklistDismissed() {
    try { return sessionStorage.getItem(this._dismissKey) === '1'; } catch (e) { return false; }
  },

  _mountChecklist() {
    if (document.getElementById('ob-checklist')) return; // already mounted
    if (this._journeyComplete()) return;
    if (this._checklistDismissed()) return; // dismissed this session — stays closed until app reopened

    const bar = document.createElement('div');
    bar.id = 'ob-checklist';
    bar.style.cssText = [
      'position:fixed',
      'bottom:calc(56px + env(safe-area-inset-bottom, 0px))', // sits above mobile nav
      'left:0','right:0',
      'z-index:500',
      'background:var(--bg-raised,#1a1e2a)',
      'border-top:1px solid var(--border,rgba(255,255,255,.08))',
      'padding:12px 16px 10px',
      'box-shadow:0 -4px 24px rgba(0,0,0,.35)',
      'transition:transform .3s ease',
    ].join(';');
    document.body.appendChild(bar);
    document.body.classList.add('has-checklist');
    this._renderChecklist(bar);
  },

  _renderChecklist(bar) {
    const j    = this._getJourney();
    const done = (j.uploaded ? 1 : 0) + (j.planSet ? 1 : 0) + (j.studied ? 1 : 0);
    const pct  = Math.round((done / 3) * 100);

    const step = (flag, label, action, view) => {
      const checked = !!flag;
      return `
        <button class="ob-cl-step ${checked ? 'done' : ''}" data-view="${view}" style="
          display:flex;align-items:center;gap:8px;
          background:${checked ? 'transparent' : 'var(--accent-soft,rgba(240,165,0,.08))'};
          border:1px solid ${checked ? 'var(--border,rgba(255,255,255,.07))' : 'var(--accent-dim,rgba(240,165,0,.2))'};
          border-radius:8px;padding:7px 10px;cursor:${checked ? 'default' : 'pointer'};
          font-family:var(--font-ui,sans-serif);font-size:12px;font-weight:600;
          color:${checked ? 'var(--text-muted,#6b7280)' : 'var(--text-primary,#e8eaf0)'};
          text-align:left;flex:1;min-width:0;
        ">
          <span style="font-size:14px;flex-shrink:0;">${checked ? '✅' : '○'}</span>
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</span>
        </button>`;
    };

    bar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;
                     text-transform:uppercase;letter-spacing:.08em;color:var(--accent,#f0a500);">
          Getting started — ${done}/3 done
        </span>
        <button id="ob-cl-dismiss" style="
          background:transparent;border:none;
          color:var(--text-muted,#6b7280);font-size:18px;
          cursor:pointer;padding:0 4px;line-height:1;
        " title="Dismiss">×</button>
      </div>
      <div style="height:3px;background:var(--border,rgba(255,255,255,.07));border-radius:2px;margin-bottom:10px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--accent,#f0a500);border-radius:2px;transition:width .4s;"></div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;">
        ${step(j.uploaded, '① Upload notes',     'go-upload',   'upload')}
        ${step(j.planSet,  '② Set exam date',    'go-plan',     'studyplan')}
        ${step(j.studied,  '③ First study session','go-study',  'guided')}
      </div>`;

    // Step buttons — navigate and highlight
    bar.querySelectorAll('.ob-cl-step:not(.done)').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) App.navigateTo(view);
        this._pulseNav(view);
      });
    });

    // Dismiss — stays closed for the rest of this session (returns next app open).
    document.getElementById('ob-cl-dismiss')?.addEventListener('click', () => {
      try { sessionStorage.setItem(this._dismissKey, '1'); } catch (e) {}
      bar.style.transform = 'translateY(120%)';
      document.body.classList.remove('has-checklist');
      setTimeout(() => bar.remove(), 320);
    });
  },

  _refreshChecklist() {
    const bar = document.getElementById('ob-checklist');
    if (!bar) {
      if (!this._journeyComplete()) this._mountChecklist();
      return;
    }
    if (this._journeyComplete()) {
      // All done — celebrate and remove
      bar.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 0;">
          <span style="font-size:22px;">🎉</span>
          <span style="font-family:var(--font-ui,sans-serif);font-size:14px;font-weight:700;
                       color:var(--text-primary,#e8eaf0);">
            Setup complete — you're ready to study!
          </span>
        </div>`;
      setTimeout(() => {
        bar.style.transition = 'transform .4s ease, opacity .4s ease';
        bar.style.transform = 'translateY(120%)';
        bar.style.opacity = '0';
        document.body.classList.remove('has-checklist');
        setTimeout(() => bar.remove(), 420);
      }, 2000);
    } else {
      this._renderChecklist(bar);
    }
  },

  _pulseNav(view) {
    const btn = document.querySelector(`.mobile-nav-btn[data-view="${view}"]`)
             || document.querySelector(`.nav-item[data-view="${view}"]`);
    if (!btn) return;
    btn.style.animation = 'pulse-accent 1.2s ease 3';
    setTimeout(() => { btn.style.animation = ''; }, 3600);
  },

  /* ─────────────────────────────────────────────────
     PUBLIC
  ───────────────────────────────────────────────── */
  showTour() {
    this._currentSlide = 0;
    this._showSlide();
  },
  reset() {
    try {
      localStorage.removeItem(this._key);
      localStorage.removeItem(this._journeyKey);
    } catch(e) {}
    this._ran = false;
    document.getElementById('ob-checklist')?.remove();
  },
};
