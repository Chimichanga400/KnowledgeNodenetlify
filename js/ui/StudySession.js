/**
 * StudySession.js — Final
 * - Pause / Resume / Skip to break / Skip break
 * - Minimise / restore overlay (timer keeps running)
 * - Short sessions: 5, 10, 15, 20 min + all existing presets
 * - _onBreakEnd callback for integrated plan sessions
 */

const StudySession = {
  // ─── State ────────────────────────────────────────────
  _timer:      null,
  _elapsed:    0,
  _sessionLen: 45 * 60,
  _breakLen:   10 * 60,
  _phase:      'idle',     // 'idle'|'studying'|'break'|'paused'
  _pausedAt:   0,
  _overlay:    null,
  _minimised:  false,
  _onBreakEnd: null,

  // ─── OPEN SETTINGS MODAL ──────────────────────────────
  open() {
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:19px;font-weight:800;margin-bottom:6px;">⏱ Study Session</h2>
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:20px;">
        Choose a session length. A break reminder fires automatically when time is up.
      </p>

      <div style="margin-bottom:16px;">
        <label class="config-label" style="margin-bottom:10px;">Quick sessions</label>
        <div class="session-presets" id="session-presets-quick" style="grid-template-columns:repeat(4,1fr);">
          <button class="session-preset" data-mins="5">5 min<span>Micro</span></button>
          <button class="session-preset" data-mins="10">10 min<span>Burst</span></button>
          <button class="session-preset" data-mins="15">15 min<span>Quick</span></button>
          <button class="session-preset" data-mins="20">20 min<span>Focus</span></button>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <label class="config-label" style="margin-bottom:10px;">Full sessions</label>
        <div class="session-presets" id="session-presets-full">
          <button class="session-preset active" data-mins="25">25 min<span>Pomodoro</span></button>
          <button class="session-preset" data-mins="45">45 min<span>Standard</span></button>
          <button class="session-preset" data-mins="60">60 min<span>Deep</span></button>
          <button class="session-preset" data-mins="90">90 min<span>Extended</span></button>
          <button class="session-preset" data-mins="custom">Custom<span>Any</span></button>
        </div>
      </div>

      <div id="custom-mins-row" style="display:none;margin-bottom:16px;">
        <label class="config-label">Custom minutes</label>
        <input type="number" id="custom-mins-input" class="config-input"
          value="50" min="1" max="300" style="width:140px;margin-top:6px;"/>
      </div>

      <div style="padding:14px 18px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:20px;" id="break-preview-box">
        <div style="font-family:var(--font-ui);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px;">Break Schedule</div>
        <div id="break-preview" style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.7;">
          After 25 min → 5 min break
        </div>
      </div>

      <div style="display:flex;gap:8px;">
        <button class="btn-primary" id="start-session-modal-btn" style="flex:1;justify-content:center;padding:14px;">▶ Start Session</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>`);

    setTimeout(() => {
      let selectedMins = 25;

      const allPresets = () => document.querySelectorAll('.session-preset');
      const setActive  = btn => { allPresets().forEach(b => b.classList.remove('active')); btn.classList.add('active'); };

      allPresets().forEach(btn => {
        btn.addEventListener('click', () => {
          setActive(btn);
          const m = btn.dataset.mins;
          const customRow = document.getElementById('custom-mins-row');
          if (m === 'custom') {
            customRow.style.display = 'block';
            selectedMins = parseInt(document.getElementById('custom-mins-input').value) || 50;
          } else {
            customRow.style.display = 'none';
            selectedMins = parseInt(m);
          }
          this._updateBreakPreview(selectedMins);
        });
      });

      document.getElementById('custom-mins-input')?.addEventListener('input', e => {
        selectedMins = parseInt(e.target.value) || 50;
        this._updateBreakPreview(selectedMins);
      });

      document.getElementById('start-session-modal-btn')?.addEventListener('click', () => {
        const active = document.querySelector('.session-preset.active');
        if (active?.dataset.mins === 'custom') {
          selectedMins = parseInt(document.getElementById('custom-mins-input').value) || 50;
        }
        Modal.close();
        this._startSession(selectedMins);
      });

      this._updateBreakPreview(25);
    }, 0);
  },

  _updateBreakPreview(mins) {
    const el = document.getElementById('break-preview');
    if (!el) return;
    const b = this._calcBreak(mins);
    if (b === 0) {
      el.innerHTML = `<span style="color:var(--text-muted);">No break for sessions under 5 min.</span>`;
    } else {
      const reps = mins <= 25 ? '4× = ~${mins*4} min total' : '';
      el.innerHTML = `After ${mins} min → <strong>${b} min break</strong>${reps ? `<br><span style="color:var(--text-muted);font-size:11px;">${reps}</span>` : ''}`;
    }
  },

  _calcBreak(mins) {
    if (mins < 5)  return 0;
    if (mins <= 10) return 2;
    if (mins <= 20) return 3;
    if (mins <= 25) return 5;
    if (mins <= 45) return 10;
    if (mins <= 60) return 15;
    return 20;
  },

  // ─── START ────────────────────────────────────────────

  _startSession(mins) {
    const b = this._calcBreak(mins);
    this._sessionLen = mins * 60;
    this._breakLen   = b * 60;
    this._elapsed    = 0;
    this._phase      = 'studying';
    this._minimised  = false;
    this._showOverlay();
    this._tick();
  },

  // ─── OVERLAY ─────────────────────────────────────────

  _showOverlay() {
    if (this._overlay) this._overlay.remove();

    this._overlay = document.createElement('div');
    this._overlay.id = 'session-overlay';
    this._overlay.innerHTML = this._overlayHTML();
    document.body.appendChild(this._overlay);
    this._bindOverlayEvents();
  },

  _overlayHTML() {
    const sesMins   = Math.round(this._sessionLen / 60);
    const breakMins = Math.round(this._breakLen / 60);
    return `
      <!-- Full overlay -->
      <div id="session-full" style="display:block;">
        <div class="so-header">
          <span id="session-phase-label" class="so-phase">Studying</span>
          <div style="display:flex;gap:4px;">
            <button id="session-minimise-btn" class="so-icon-btn" title="Minimise">⬇</button>
            <button id="end-session-btn"      class="so-icon-btn" title="End session">✕</button>
          </div>
        </div>

        <div id="session-timer-display" class="so-timer">0:00</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);text-align:center;margin-bottom:10px;" id="session-sub">
          ${sesMins} min session · ${breakMins > 0 ? breakMins + ' min break' : 'no break'}
        </div>

        <div class="mastery-bar-track" style="height:4px;margin-bottom:14px;">
          <div class="mastery-bar-fill" id="session-progress" style="width:0%;height:4px;"></div>
        </div>

        <!-- Controls -->
        <div class="so-controls">
          <button id="session-pause-btn" class="so-ctrl-btn primary">⏸ Pause</button>
          <button id="session-skip-btn"  class="so-ctrl-btn">⏭ Skip</button>
        </div>
      </div>

      <!-- Minimised pill -->
      <div id="session-mini" style="display:none;">
        <span id="mini-phase-icon">⏱</span>
        <span id="mini-timer">0:00</span>
        <button id="session-restore-btn" class="so-icon-btn" title="Restore">⬆</button>
        <button id="session-minimise-end" class="so-icon-btn" title="End">✕</button>
      </div>`;
  },

  _bindOverlayEvents() {
    document.getElementById('end-session-btn')       ?.addEventListener('click', () => this._endSession());
    document.getElementById('session-minimise-btn')  ?.addEventListener('click', () => this._minimise());
    document.getElementById('session-restore-btn')   ?.addEventListener('click', () => this._restore());
    document.getElementById('session-minimise-end')  ?.addEventListener('click', () => this._endSession());
    document.getElementById('session-pause-btn')     ?.addEventListener('click', () => this._togglePause());
    document.getElementById('session-skip-btn')      ?.addEventListener('click', () => this._skipPhase());
  },

  _minimise() {
    this._minimised = true;
    document.getElementById('session-full').style.display = 'none';
    document.getElementById('session-mini').style.display = 'flex';
    // Shrink overlay to pill
    this._overlay.classList.add('minimised');
  },

  _restore() {
    this._minimised = false;
    document.getElementById('session-full').style.display = 'block';
    document.getElementById('session-mini').style.display = 'none';
    this._overlay.classList.remove('minimised');
  },

  _togglePause() {
    const btn = document.getElementById('session-pause-btn');
    if (this._phase === 'paused') {
      // Resume
      this._phase = this._pausedPhase || 'studying';
      this._tick();
      if (btn) { btn.textContent = '⏸ Pause'; btn.classList.add('primary'); }
      Toast.info('Session resumed.');
    } else {
      // Pause
      this._pausedPhase = this._phase;
      this._phase = 'paused';
      clearInterval(this._timer);
      if (btn) { btn.textContent = '▶ Resume'; btn.classList.remove('primary'); }
      Toast.info('Session paused.');
    }
  },

  _skipPhase() {
    clearInterval(this._timer);
    this._elapsed = 0;
    if (this._phase === 'studying' || this._phase === 'paused') {
      if (this._breakLen > 0) {
        this._showBreakAlert();
      } else {
        Toast.info('Session skipped — no break configured.');
        this._phase = 'studying';
        this._tick();
      }
    } else if (this._phase === 'break') {
      this._showStudyAlert();
    }
  },

  // ─── TICK ─────────────────────────────────────────────

  _tick() {
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      if (this._phase === 'paused') return;
      this._elapsed++;
      this._updateDisplay();

      const limit = this._phase === 'break' ? this._breakLen : this._sessionLen;

      // 80% warning
      if (this._phase === 'studying' && this._sessionLen > 60 &&
          this._elapsed === Math.round(this._sessionLen * 0.8)) {
        const rem = Math.round((this._sessionLen - this._elapsed) / 60);
        Toast.info(`⏱ ${rem} min left — start wrapping up.`);
      }

      if (this._elapsed >= limit) {
        clearInterval(this._timer);
        this._phase === 'break' ? this._showStudyAlert() : this._showBreakAlert();
      }
    }, 1000);
  },

  _updateDisplay() {
    const m   = Math.floor(this._elapsed / 60);
    const s   = this._elapsed % 60;
    const str = `${m}:${s.toString().padStart(2,'0')}`;
    const lim = this._phase === 'break' ? this._breakLen : this._sessionLen;
    const pct = Math.min(100, (this._elapsed / Math.max(1,lim)) * 100);

    // Full view
    const timerEl = document.getElementById('session-timer-display');
    const progEl  = document.getElementById('session-progress');
    if (timerEl) {
      timerEl.textContent = str;
      timerEl.style.color = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--accent)' : 'var(--text-primary)';
    }
    if (progEl) progEl.style.width = pct + '%';

    // Mini view
    const miniTimer = document.getElementById('mini-timer');
    if (miniTimer) miniTimer.textContent = str;
    const miniIcon  = document.getElementById('mini-phase-icon');
    if (miniIcon)  miniIcon.textContent  = this._phase === 'break' ? '☕' : '⏱';
  },

  _showBreakAlert() {
    this._phase   = 'break';
    this._elapsed = 0;
    StreakTracker.recordActivity();
    const bm = Math.round(this._breakLen / 60);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('KnowledgeNode — Take a break! 🧠', {
        body: `Session done. Take a ${bm} min break.`, icon: 'icons/icon.svg',
      });
    }

    const label = document.getElementById('session-phase-label');
    const sub   = document.getElementById('session-sub');
    if (label) { label.textContent = 'Break'; label.style.color = 'var(--green)'; }
    if (sub)   sub.textContent = `${bm} min break — stand up, stretch`;

    const skipBtn = document.getElementById('session-skip-btn');
    if (skipBtn) skipBtn.textContent = '⏭ Skip break';

    Toast.success(`✓ Session done! Take a ${bm > 0 ? bm + ' min' : 'short'} break.`);
    if (this._breakLen > 0) this._tick();
  },

  _showStudyAlert() {
    this._phase   = 'studying';
    this._elapsed = 0;
    const sesMins = Math.round(this._sessionLen / 60);

    const label = document.getElementById('session-phase-label');
    const sub   = document.getElementById('session-sub');
    const skip  = document.getElementById('session-skip-btn');
    if (label) { label.textContent = 'Studying'; label.style.color = 'var(--accent)'; }
    if (sub)   sub.textContent = `${sesMins} min session`;
    if (skip)  skip.textContent = '⏭ Skip to break';

    Toast.info('Break over! Back to work. 📚');
    if (typeof this._onBreakEnd === 'function') this._onBreakEnd();
    this._tick();
  },

  _endSession() {
    clearInterval(this._timer);
    this._overlay?.remove();
    this._overlay  = null;
    this._phase    = 'idle';
    this._onBreakEnd = null;
    const mins = Math.round(this._elapsed / 60);
    if (mins > 0) Toast.success(`Session ended. Studied for ${mins} min. Great work! 🎉`);
  },

  requestNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },
};
