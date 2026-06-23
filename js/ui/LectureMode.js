/**
 * LectureMode.js — Voice lecture with hardened cross-browser speech synthesis
 */
const LectureMode = {
  _node: null, _script: '', _questions: [], _currentQ: 0,
  _utterance: null, _isPlaying: false,
  _voiceMode: 'browser', _recognition: null, _quizAnswers: [],
  _slides: null, _slideIndex: 0, _autoNarrate: false, _slideSpeaking: false, _presentMode: false,

  // Lazy-init synth — some browsers throw if accessed before user gesture
  get _synth() {
    return window.speechSynthesis || null;
  },

  /** True when running as a native Android app (Capacitor) with our TTS bridge. */
  _isCapacitor() {
    return typeof window.KnowledgeNodeTTS !== 'undefined';
  },

  /** Speak via native TTS and call onDone when finished. Manages its own listener. */
  _capSpeak(text, rate, onDone) {
    if (this._capDoneListener) {
      window.removeEventListener('kntts:done', this._capDoneListener);
    }
    this._capDoneListener = () => {
      this._capDoneListener = null;
      if (onDone) onDone();
    };
    window.addEventListener('kntts:done', this._capDoneListener, { once: true });
    window.KnowledgeNodeTTS.speak(text, rate, 0.95);
  },

  /** Stop native TTS and cancel pending done callback. */
  _capStop() {
    if (this._capDoneListener) {
      window.removeEventListener('kntts:done', this._capDoneListener);
      this._capDoneListener = null;
    }
    if (typeof window.KnowledgeNodeTTS !== 'undefined') window.KnowledgeNodeTTS.stop();
  },

  _speechSupported() {
    // Native TTS is always available on Capacitor Android.
    if (this._isCapacitor()) return true;
    return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  },

  open(node) {
    this._node = node; this._script = ''; this._questions = [];
    this._currentQ = 0; this._quizAnswers = []; this._isPlaying = false;
    this._slides = null; this._slideIndex = 0; this._slideSpeaking = false;
    this._halt(); // stop any playback WITHOUT clearing saved position
    Modal.open(this._renderUI(), () => this._halt());
    // Bind events AFTER modal renders, then auto-load a cached lecture if one
    // exists for this node's current learner level (saves an AI call).
    setTimeout(() => {
      this._bindAllEvents();
      const cached = this._node.lectureCache?.[this._profileKey()];
      if (cached) this._displayLecture(cached, true);
      // Pre-load a cached slide deck into the (default) Slides tab — display only,
      // no narration, so there's no surprise audio on open.
      const cachedSlides = this._node.lectureSlidesCache?.[this._profileKey()];
      if (cachedSlides && cachedSlides.length) this._displaySlides(cachedSlides, true);
    }, 0);
  },

  /** Stop playback but preserve the saved resume position. */
  _clearPauseTimer() {
    if (this._pauseTimer) { clearTimeout(this._pauseTimer); this._pauseTimer = null; }
  },

  _halt() {
    this._clearPauseTimer();
    this._slideSpeaking = false;
    this._presentMode = false;
    document.getElementById('lm-present')?.remove();
    if (!this._speechSupported()) return;
    this._isPlaying = false;
    if (this._isCapacitor()) { this._capStop(); } else { this._synth.cancel(); }
    this._updatePlayBtn();
    this._updateSlidePlayBtn();
    if (typeof SpeechPill !== 'undefined') SpeechPill.hide();
  },

  _renderUI() {
    return `
      <div id="lecture-modal">
        <h2 style="font-family:var(--font-ui);font-size:19px;font-weight:800;margin-bottom:4px;">🎓 Lecture Mode</h2>
        <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:18px;">${this._esc(this._node.title)}</p>

        <div style="display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid var(--border);padding-bottom:16px;">
          <button class="lecture-tab active" id="tab-slides" data-mode="slides">🎓 Lecture</button>
          <button class="lecture-tab" id="tab-lecture" data-mode="lecture">🔊 Voice only</button>
          <button class="lecture-tab" id="tab-quiz" data-mode="quiz">❓ Practice</button>
        </div>

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;">
          <span style="font-family:var(--font-ui);font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">Voice</span>
          <span style="font-family:var(--font-ui);font-size:12px;color:var(--text-secondary);">🔊 Your device's built-in voice</span>
        </div>

        <!-- Slides Panel -->
        <div id="slides-panel">
          <div id="slides-stage" style="min-height:340px;margin-bottom:14px;">
            <div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:14px;padding:48px 24px;text-align:center;">
              <div style="font-size:34px;margin-bottom:12px;">🎓</div>
              <div style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Slide Lecture</div>
              <p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.6;max-width:340px;margin:0 auto 18px;">A narrated slideshow — each slide a single idea, read aloud, with activity break points where you answer before moving on. Tap Play and it presents itself like a class.</p>
              <button class="btn-primary" id="gen-slides-btn" style="justify-content:center;">⬡ Generate lecture</button>
            </div>
          </div>
          <div id="slides-controls" style="display:none;flex-wrap:wrap;gap:8px;align-items:center;">
            <button class="btn-secondary" id="slide-prev-btn" title="Previous slide">← Prev</button>
            <button class="btn-primary" id="slide-play-btn" title="Play the narrated lecture">▶ Play</button>
            <button class="btn-secondary" id="slide-next-btn" title="Next slide">Next →</button>
            <button class="btn-secondary" id="slide-present-btn" title="Full-screen presentation">⛶ Present</button>
            <select id="slide-speed" class="config-select" style="width:auto;padding:8px 12px;font-size:12px;">
              <option value="0.8">Slow</option>
              <option value="1" selected>Normal</option>
              <option value="1.3">Fast</option>
            </select>
            <button class="btn-secondary" id="slide-pptx-btn" title="Download as an editable PowerPoint file">⬇ PowerPoint</button>
            <button class="btn-secondary" id="slide-regen-btn" style="margin-left:auto;" title="Generate a fresh lecture">⬡ Regenerate</button>
          </div>
        </div>

        <!-- Lecture Panel -->
        <div id="lecture-panel" style="display:none;">
          <div id="lecture-script-area" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:18px;min-height:140px;max-height:280px;overflow-y:auto;font-family:var(--font-body);font-size:14px;line-height:1.7;color:var(--text-secondary);margin-bottom:14px;scroll-behavior:smooth;">
            <span style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;">Click "Generate" to create your script…</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn-primary" id="gen-lecture-btn">⬡ Generate</button>
            <button class="btn-secondary" id="skip-back-btn" disabled title="Back 10 seconds">⏪ 10s</button>
            <button class="btn-secondary" id="play-btn" disabled>▶ Play</button>
            <button class="btn-secondary" id="skip-fwd-btn" disabled title="Forward 10 seconds">10s ⏩</button>
            <button class="btn-secondary" id="stop-btn" disabled>■ Stop</button>
            <select id="lecture-speed" class="config-select" style="width:auto;padding:8px 12px;font-size:12px;">
              <option value="0.8">Slow</option>
              <option value="1" selected>Normal</option>
              <option value="1.3">Fast</option>
            </select>
          </div>
        </div>

        <!-- Quiz Panel -->
        <div id="quiz-panel" style="display:none;">
          <div style="padding:24px;text-align:center;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);">
            <div style="font-size:32px;margin-bottom:12px;">❓</div>
            <div style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Practice Questions</div>
            <p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.65;margin-bottom:18px;">
              Your practice questions live in the <strong>Review tab</strong> — powered by spaced repetition so you're tested at the right time.
            </p>
            <button class="btn-primary" id="lm-go-review" style="width:100%;justify-content:center;">Go to Review →</button>
          </div>
        </div>
      </div>`;
  },

  _bindAllEvents() {
    // Tab switching
    document.getElementById('tab-slides')?.addEventListener('click',  () => this._switchTab('slides'));
    document.getElementById('tab-lecture')?.addEventListener('click', () => this._switchTab('lecture'));
    document.getElementById('tab-quiz')?.addEventListener('click',    () => this._switchTab('quiz'));

    // Slide controls
    document.getElementById('gen-slides-btn')?.addEventListener('click', () => { this._forceSlideRegen = false; this._generateSlides(); });
    document.getElementById('slide-regen-btn')?.addEventListener('click', () => { this._forceSlideRegen = true; this._generateSlides(); });
    document.getElementById('slide-prev-btn')?.addEventListener('click', () => this._gotoSlide(this._slideIndex - 1));
    document.getElementById('slide-next-btn')?.addEventListener('click', () => this._gotoSlide(this._slideIndex + 1));
    document.getElementById('slide-play-btn')?.addEventListener('click', () => this._togglePresentation());
    document.getElementById('slide-present-btn')?.addEventListener('click', () => this._enterPresent());
    document.getElementById('slide-pptx-btn')?.addEventListener('click', () => this._exportPptx());

    // Lecture controls
    document.getElementById('gen-lecture-btn')?.addEventListener('click', () => {
      // If a lecture is already showing/cached, an explicit click means "regenerate".
      this._forceRegen = !!(this._node.lectureCache?.[this._profileKey()]);
      this._generateLecture();
    });
    document.getElementById('play-btn')?.addEventListener('click',         () => this._togglePlay());
    document.getElementById('stop-btn')?.addEventListener('click',         () => this._stop());
    document.getElementById('skip-back-btn')?.addEventListener('click',    () => this._skip(-1));
    document.getElementById('skip-fwd-btn')?.addEventListener('click',     () => this._skip(1));

    // Quiz controls
    document.getElementById('lm-go-review')?.addEventListener('click', () => { Modal.close(); App.navigateTo('review'); });
  },

  _switchTab(mode) {
    document.getElementById('tab-slides')?.classList.toggle('active',  mode==='slides');
    document.getElementById('tab-lecture')?.classList.toggle('active', mode==='lecture');
    document.getElementById('tab-quiz')?.classList.toggle('active',    mode==='quiz');
    const sp = document.getElementById('slides-panel');  if (sp) sp.style.display = mode==='slides'  ? 'block' : 'none';
    const lp = document.getElementById('lecture-panel'); if (lp) lp.style.display = mode==='lecture' ? 'block' : 'none';
    const qp = document.getElementById('quiz-panel');    if (qp) qp.style.display = mode==='quiz'    ? 'block' : 'none';
    // Leaving a tab stops any audio from that tab.
    this._stop();
    this._stopSlideNarration();
  },

  _profileKey() {
    return this._node?.learnerProfile || AIService._activeProfile || 'college';
  },

  async _generateLecture() {
    const btn  = document.getElementById('gen-lecture-btn');
    const area = document.getElementById('lecture-script-area');
    const profile = this._profileKey();

    // Reuse a saved lecture for this level unless the user is explicitly
    // regenerating (the button reads "Regenerate" once one is cached).
    const cached = this._node.lectureCache?.[profile];
    if (cached && !this._forceRegen) { this._displayLecture(cached, true); return; }
    this._forceRegen = false;

    btn.disabled = true; btn.textContent = '⬡ Generating…';
    area.innerHTML = '<span style="color:var(--accent);font-family:var(--font-mono);font-size:12px;">AI is writing your lecture…</span>';
    try {
      let script;
      if (AIService.hasApiKey()) {
        script = await AIService.generateLecture(this._node);
      } else {
        await this._delay(1200); script = this._mockLecture();
      }
      // Save to the node so reopening (or switching back to this level) is free.
      if (!this._node.lectureCache) this._node.lectureCache = {};
      this._node.lectureCache[profile] = script;
      try { nodeStore.save(this._node); } catch (e) { /* persistence is best-effort */ }
      this._displayLecture(script, false);
    } catch(e) {
      area.innerHTML = `<span style="color:var(--red);font-family:var(--font-mono);font-size:12px;">Error: ${this._esc(e.message)}</span>`;
      btn.disabled = false; btn.textContent = '⬡ Generate';
    }
  },

  /** Render a lecture script into the panel and enable controls. */
  _displayLecture(script, fromCache) {
    this._script = script;
    this._questions = this._node.questions || [];
    const area = document.getElementById('lecture-script-area');
    const btn  = document.getElementById('gen-lecture-btn');

    // Preserve paragraph breaks (\n\n) for natural narration pauses; only
    // collapse runs of spaces/tabs and single newlines within a paragraph.
    const fullText = script
      .replace(/\[PAUSE\]/g, '. ')           // old pause cues → sentence stop
      .replace(/[#*_`>]/g, ' ')              // strip markdown symbols
      .replace(/\r/g, '')
      .replace(/\n{2,}/g, '\n\n')            // normalise paragraph breaks
      .replace(/[ \t]+/g, ' ')               // collapse spaces/tabs only
      .replace(/ *\n *(?!\n)/g, ' ')         // join single newlines into spaces
      .trim();
    this._chunks = this._chunkText(fullText, 200);
    // Resume from saved position if we have one for this node
    const savedPos = this._loadPosition();
    this._chunkIndex = (savedPos > 0 && savedPos < this._chunks.length) ? savedPos : 0;

    const savedBadge = fromCache
      ? '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:8px;">💾 Saved lecture for <b>' + this._esc(this._profileKey()) + '</b> level — tap Regenerate for a fresh one.</div>'
      : '';
    if (area) area.innerHTML = savedBadge
      + '<div id="lecture-text" style="white-space:normal;font-size:15px;line-height:1.8;">'
      + this._chunks.map((c, i) => `<span class="lm-chunk" id="lm_chunk_${i}" data-i="${i}">${this._esc(c.text)} </span>`).join('')
      + '</div>';

    ['play-btn','stop-btn','skip-back-btn','skip-fwd-btn'].forEach(id => {
      const el = document.getElementById(id); if (el) el.disabled = false;
    });
    if (btn) { btn.disabled = false; btn.textContent = '⬡ Regenerate'; }

    // If resuming, highlight where we left off (the Resume button label is enough — no toast)
    if (this._chunkIndex > 0) {
      this._highlightChunk(this._chunkIndex);
      const playBtn = document.getElementById('play-btn');
      if (playBtn) playBtn.textContent = '▶ Resume';
    }
  },

  // ─── Slide Lecture ────────────────────────────────────

  async _generateSlides() {
    const stage = document.getElementById('slides-stage');
    const profile = this._profileKey();
    const cached = this._node.lectureSlidesCache?.[profile];
    if (cached && cached.length && !this._forceSlideRegen) { this._displaySlides(cached, true); return; }
    this._forceSlideRegen = false;
    this._stopSlideNarration();

    if (stage) stage.innerHTML = '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:14px;padding:48px 24px;text-align:center;"><div style="font-family:var(--font-mono);font-size:12px;color:var(--accent);">⬡ Building your slides…</div></div>';
    try {
      let slides;
      if (AIService.hasApiKey()) {
        slides = await AIService.generateLectureSlides(this._node);
      } else {
        await this._delay(900); slides = this._mockSlides();
      }
      if (!this._node.lectureSlidesCache) this._node.lectureSlidesCache = {};
      this._node.lectureSlidesCache[profile] = slides;
      try { nodeStore.save(this._node); } catch(e) { /* best-effort */ }
      this._displaySlides(slides, false);
    } catch(e) {
      if (stage) stage.innerHTML = '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:14px;padding:40px 24px;text-align:center;"><div style="color:var(--red);font-family:var(--font-mono);font-size:12px;margin-bottom:14px;">Error: ' + this._esc(e.message) + '</div><button class="btn-secondary" id="slides-retry">Try again</button></div>';
      document.getElementById('slides-retry')?.addEventListener('click', () => this._generateSlides());
    }
  },

  _displaySlides(slides, fromCache) {
    if (!Array.isArray(slides) || !slides.length) return;
    this._slides = slides;
    this._slideIndex = 0;
    const controls = document.getElementById('slides-controls');
    if (controls) controls.style.display = 'flex';
    this._renderSlide();
  },

  _renderSlide() {
    const stage = document.getElementById('slides-stage');
    if (!stage || !this._slides || !this._slides.length) return;
    const i = this._slides[this._slideIndex] ? this._slideIndex : 0;
    const s = this._slides[i];
    const total = this._slides.length;
    const pct = Math.round(((i + 1) / total) * 100);
    const kicker = this._esc(((this._node.subject || 'Lecture') + (this._node.chapter ? ' · ' + this._node.chapter : '')).toUpperCase());
    const topic = this._esc(this._node.title || '');
    const footer =
      '<div class="lm-deck-footer">'
      + '<span class="lm-deck-topic">' + topic + '</span>'
      + '<span class="lm-deck-num">' + (i + 1) + ' / ' + total + '</span>'
      + '</div>';
    const progress = '<div class="lm-deck-progress"><div class="lm-deck-progress-fill" style="width:' + pct + '%;"></div></div>';

    if (s.kind === 'activity') {
      const typeLabel = { recall: 'Recall', apply: 'Apply', reflect: 'Reflect' }[s.activityType] || 'Activity';
      stage.innerHTML =
        '<div class="lm-deck lm-deck-activity" key="' + i + '">'
        + progress
        + '<div class="lm-deck-body">'
        +   '<div class="lm-activity-badge">✏️ Your turn · ' + typeLabel + '</div>'
        +   '<h3 class="lm-deck-title">' + this._esc(s.title) + '</h3>'
        +   '<p class="lm-activity-prompt">' + this._esc(s.prompt) + '</p>'
        +   '<textarea id="lm-activity-input" class="lm-activity-input" rows="3" placeholder="Type your answer…"></textarea>'
        +   '<div class="lm-activity-actions">'
        +     '<button class="btn-primary" id="lm-activity-check">Check my answer</button>'
        +     (s.answer ? '<button class="btn-secondary" id="lm-activity-reveal">Reveal answer</button>' : '')
        +   '</div>'
        +   '<div id="lm-activity-feedback" class="lm-activity-feedback" style="display:none;"></div>'
        + '</div>'
        + footer
        + '</div>';
      document.getElementById('lm-activity-check')?.addEventListener('click', () => this._checkActivity(s));
      document.getElementById('lm-activity-reveal')?.addEventListener('click', () => this._revealActivity(s));
    } else {
      const isTitle = (i === 0) && (!s.bullets || s.bullets.length === 0);
      const bullets = (s.bullets || []).map((b, n) =>
        '<li style="animation-delay:' + (0.12 + n * 0.08).toFixed(2) + 's">' + this._esc(b) + '</li>').join('');
      stage.innerHTML =
        '<div class="lm-deck lm-deck-teach' + (isTitle ? ' lm-deck-titleslide' : '') + '" key="' + i + '">'
        + progress
        + '<div class="lm-deck-body">'
        +   '<div class="lm-deck-kicker">' + kicker + '</div>'
        +   '<h3 class="lm-deck-title">' + this._esc(s.title) + '</h3>'
        +   (bullets ? '<ul class="lm-deck-bullets">' + bullets + '</ul>' : '')
        + '</div>'
        + (s.explanation ? '<div class="lm-deck-notes"><span class="lm-deck-notes-label">Narration</span><span class="lm-deck-notes-text">' + this._esc(s.explanation) + '</span></div>' : '')
        + footer
        + '</div>';
    }

    const prev = document.getElementById('slide-prev-btn'); if (prev) prev.disabled = i === 0;
    const next = document.getElementById('slide-next-btn'); if (next) next.disabled = i >= total - 1;
    // Restart narration for the new slide if auto-narrate is on; otherwise just
    // reset the play button. (No audio without an explicit toggle/gesture.)
    this._stopSlideNarration();
    if (this._autoNarrate) this._narrateCurrentSlide();
    else this._updateSlidePlayBtn();
  },

  async _checkActivity(slide) {
    const input = document.getElementById('lm-activity-input');
    const fb = document.getElementById('lm-activity-feedback');
    const answer = (input?.value || '').trim();
    if (!answer) { Toast.info('Type an answer first, or tap Reveal answer.'); return; }
    if (fb) { fb.style.display = 'block'; fb.innerHTML = '<span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);">Checking…</span>'; }
    let result;
    try {
      result = AIService.hasApiKey()
        ? await AIService.checkAnswer(slide.prompt, slide.answer || '', answer, this._node.subject, this._node)
        : this._mockGrade(answer, slide.answer || '');
    } catch { result = this._mockGrade(answer, slide.answer || ''); }
    const color = result.score >= 70 ? 'var(--green)' : result.score >= 40 ? 'var(--accent)' : 'var(--red)';
    if (fb) fb.innerHTML =
      '<div style="border-left:3px solid ' + color + ';padding:10px 14px;background:var(--bg-base);border-radius:var(--radius-sm);">'
      + '<div style="font-family:var(--font-ui);font-size:14px;font-weight:700;color:' + color + ';margin-bottom:6px;">' + result.score + '/100</div>'
      + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);margin:0 0 8px;">' + this._esc(result.feedback) + '</p>'
      + (slide.answer ? '<div style="padding-top:8px;border-top:1px solid var(--border-soft);font-family:var(--font-body);font-size:12px;color:var(--text-secondary);"><b>Model answer:</b> ' + this._esc(slide.answer) + '</div>' : '')
      + '<div style="margin-top:10px;"><button class="btn-primary" id="lm-activity-continue">Continue →</button></div>'
      + '</div>';
    document.getElementById('lm-activity-continue')?.addEventListener('click', () => this._gotoSlide(this._slideIndex + 1));
  },

  _revealActivity(slide) {
    const fb = document.getElementById('lm-activity-feedback');
    if (fb) {
      fb.style.display = 'block';
      fb.innerHTML =
        '<div style="border-left:3px solid var(--accent);padding:10px 14px;background:var(--bg-base);border-radius:var(--radius-sm);">'
        + '<div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:6px;">Model answer</div>'
        + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);margin:0 0 10px;">' + this._esc(slide.answer) + '</p>'
        + '<button class="btn-primary" id="lm-activity-continue">Continue →</button>'
        + '</div>';
      document.getElementById('lm-activity-continue')?.addEventListener('click', () => this._gotoSlide(this._slideIndex + 1));
    }
  },

  _gotoSlide(idx) {
    if (!this._slides) return;
    const clamped = Math.max(0, Math.min(this._slides.length - 1, idx));
    if (clamped === this._slideIndex) return;
    this._slideIndex = clamped;
    if (this._presentMode) this._renderPresent();
    else this._renderSlide();
  },

  /** What the "lecturer" says aloud. For a teaching slide: the explanation,
   *  prefixed by the title. For an activity: a cue plus the prompt. */
  _slideNarrationText(s) {
    if (s.kind === 'activity') {
      return 'Let\'s pause for a quick activity. ' + (s.prompt || s.title || '');
    }
    const body = s.explanation || (s.bullets || []).join('. ');
    return (s.title ? s.title + '. ' : '') + body;
  },

  _narrateCurrentSlide() {
    if (!this._speechSupported()) { Toast.error('Read-aloud needs Chrome or Edge.'); return; }
    const s = this._slides && this._slides[this._slideIndex];
    if (!s) return;
    const chunks = this._chunkText(this._slideNarrationText(s), 200);
    const speed = parseFloat(document.getElementById('slide-speed')?.value || 1);
    if (this._isCapacitor()) { this._capStop(); } else { this._synth.cancel(); }
    if (!this._isCapacitor()) {
      const voices = this._synth.getVoices();
      this._voice = voices.length
        ? (voices.find(v => v.lang.startsWith('en') && /Google|Natural|Online|Samsung/.test(v.name))
          || voices.find(v => v.lang.startsWith('en')) || voices[0])
        : null;
    }
    this._slideSpeaking = true;
    this._updateSlidePlayBtn();
    let k = 0;
    const speakNext = () => {
      if (!this._slideSpeaking) return;
      if (k >= chunks.length) {
        this._slideSpeaking = false;
        this._updateSlidePlayBtn();
        const cur = this._slides[this._slideIndex];
        if (this._autoNarrate && cur && cur.kind !== 'activity' && this._slideIndex < this._slides.length - 1) {
          this._pauseTimer = setTimeout(() => this._gotoSlide(this._slideIndex + 1), 700);
        }
        return;
      }
      const chunk = chunks[k];
      if (this._isCapacitor()) {
        this._capSpeak(chunk.text, speed * 0.9, () => {
          const justRead = chunk; k++;
          if (this._slideSpeaking) this._pauseTimer = setTimeout(speakNext, this._pauseFor(justRead.pause));
        });
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[k].text);
      u.rate = speed * 0.9; u.pitch = 0.95; u.lang = 'en-US';
      if (this._voice) u.voice = this._voice;
      u.onend = () => {
        const justRead = chunks[k]; k++;
        if (this._slideSpeaking) this._pauseTimer = setTimeout(speakNext, this._pauseFor(justRead.pause));
      };
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        k++;
        if (this._slideSpeaking && k < chunks.length) speakNext();
        else { this._slideSpeaking = false; this._updateSlidePlayBtn(); }
      };
      this._utterance = u;
      try { this._synth.speak(u); }
      catch(err) { this._slideSpeaking = false; this._updateSlidePlayBtn(); }
    };
    speakNext();
  },

  /** Play/pause the whole narrated lecture: narrate the current slide and
   *  auto-advance through teaching slides, pausing at activity break points. */
  _togglePresentation() {
    if (this._slideSpeaking) {
      this._autoNarrate = false;
      this._stopSlideNarration();
    } else {
      if (!this._speechSupported()) { Toast.error('Read-aloud needs Chrome or Edge. You can still tap through the slides.'); return; }
      this._autoNarrate = true;
      this._narrateCurrentSlide();
    }
  },

  _stopSlideNarration() {
    this._slideSpeaking = false;
    this._clearPauseTimer();
    if (this._isCapacitor()) { this._capStop(); }
    else if (this._speechSupported()) { this._synth.cancel(); }
    this._updateSlidePlayBtn();
  },

  _updateSlidePlayBtn() {
    const txt = this._slideSpeaking ? '⏸ Pause' : '▶ Play';
    const b = document.getElementById('slide-play-btn'); if (b) b.textContent = txt;
    const p = document.getElementById('lm-present-play'); if (p) p.textContent = txt;
  },

  // ─── Full-screen presentation ─────────────────────────
  _enterPresent() {
    if (!this._slides || !this._slides.length) { Toast.info('Generate the lecture first.'); return; }
    if (document.getElementById('lm-present')) return;
    this._presentMode = true;

    // Lock body scroll using a CSS class — safer than position:fixed on mobile
    // (position:fixed causes page-jump and can hide the overlay on some browsers).
    this._scrollY = window.scrollY;
    document.body.classList.add('lm-presenting');
    document.body.style.top = '-' + this._scrollY + 'px';

    const el = document.createElement('div');
    el.id = 'lm-present';
    el.className = 'lm-present';
    el.innerHTML =
      '<div class="lm-present-top">'
      +   '<span class="lm-present-kicker" id="lm-present-kicker"></span>'
      +   '<div style="display:flex;gap:8px;">'
      +     '<button class="lm-present-iconbtn" id="lm-present-notes" title="Speaker notes">📝</button>'
      +     '<button class="lm-present-iconbtn" id="lm-present-exit" title="Exit full screen">✕</button>'
      +   '</div>'
      + '</div>'
      + '<div id="lm-present-stage" class="lm-present-stage"></div>'
      + '<div id="lm-present-notes-sheet" class="lm-present-notes-sheet" style="display:none;"></div>'
      + '<div class="lm-present-bar">'
      +   '<button class="btn-secondary" id="lm-present-prev">← Prev</button>'
      +   '<button class="btn-primary" id="lm-present-play">▶ Play</button>'
      +   '<button class="btn-secondary" id="lm-present-next">Next →</button>'
      + '</div>';
    document.body.appendChild(el);

    // Block touchmove on the overlay so rubber-band scroll can't bleed through
    // to whatever is underneath. The notes sheet, slide stage, and activity
    // input are exempt — they need to scroll internally.
    el.addEventListener('touchmove', (e) => {
      if (!e.target.closest('#lm-present-notes-sheet, #lm-present-stage, #lm-activity-input')) {
        e.preventDefault();
      }
    }, { passive: false });

    document.getElementById('lm-present-exit').addEventListener('click', () => this._exitPresent());
    document.getElementById('lm-present-prev').addEventListener('click', () => this._gotoSlide(this._slideIndex - 1));
    document.getElementById('lm-present-next').addEventListener('click', () => this._gotoSlide(this._slideIndex + 1));
    document.getElementById('lm-present-play').addEventListener('click', () => this._togglePresentation());
    document.getElementById('lm-present-notes').addEventListener('click', () => this._togglePresentNotes());
    this._renderPresent();
  },

  _exitPresent() {
    this._presentMode = false;
    this._autoNarrate = false;
    this._stopSlideNarration();
    document.getElementById('lm-present')?.remove();
    // Restore body scroll and position
    document.body.classList.remove('lm-presenting');
    document.body.style.top = '';
    window.scrollTo(0, this._scrollY || 0);
    this._renderSlide(); // keep the inline stage in sync with where they left off
  },

  _renderPresent() {
    const stage = document.getElementById('lm-present-stage');
    if (!stage) return;
    const i = this._slides[this._slideIndex] ? this._slideIndex : 0;
    const s = this._slides[i];
    const total = this._slides.length;
    const kicker = this._esc(((this._node.subject || 'Lecture') + (this._node.chapter ? ' · ' + this._node.chapter : '')).toUpperCase());
    const kEl = document.getElementById('lm-present-kicker'); if (kEl) kEl.textContent = (i + 1) + ' / ' + total;

    if (s.kind === 'activity') {
      const typeLabel = { recall:'Recall', apply:'Apply', reflect:'Reflect' }[s.activityType] || 'Activity';
      stage.innerHTML =
        '<div class="lm-present-slide lm-present-activity">'
        + '<div class="lm-activity-badge">✏️ Your turn · ' + typeLabel + '</div>'
        + '<h2 class="lm-present-title">' + this._esc(s.title) + '</h2>'
        + '<p class="lm-activity-prompt">' + this._esc(s.prompt) + '</p>'
        + '<textarea id="lm-activity-input" class="lm-activity-input" rows="3" placeholder="Type your answer…"></textarea>'
        + '<div class="lm-activity-actions">'
        +   '<button class="btn-primary" id="lm-activity-check">Check my answer</button>'
        +   (s.answer ? '<button class="btn-secondary" id="lm-activity-reveal">Reveal answer</button>' : '')
        + '</div>'
        + '<div id="lm-activity-feedback" class="lm-activity-feedback" style="display:none;"></div>'
        + '</div>';
      document.getElementById('lm-activity-check')?.addEventListener('click', () => this._checkActivity(s));
      document.getElementById('lm-activity-reveal')?.addEventListener('click', () => this._revealActivity(s));
    } else {
      const bullets = (s.bullets || []).map((b, n) =>
        '<li style="animation-delay:' + (0.1 + n * 0.07).toFixed(2) + 's">' + this._esc(b) + '</li>').join('');
      // Show a short preview of the narration inline (≤4 bullets only).
      // Full narration is always available via the 📝 notes button.
      const MAX_NARRATION = 220;
      const showInlineNarration = s.explanation && (s.bullets || []).length <= 4;
      const narrationPreview = showInlineNarration
        ? (() => {
            const exp = s.explanation;
            if (exp.length <= MAX_NARRATION) return exp;
            // Try to end on a sentence boundary within the limit
            const cut = exp.slice(0, MAX_NARRATION);
            const lastDot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
            return lastDot > MAX_NARRATION * 0.5
              ? exp.slice(0, lastDot + 1)
              : cut.replace(/\s+\S*$/, '') + '…';
          })()
        : null;
      stage.innerHTML =
        '<div class="lm-present-slide">'
        + '<div class="lm-present-kicker2">' + kicker + '</div>'
        + '<h2 class="lm-present-title">' + this._esc(s.title) + '</h2>'
        + (bullets ? '<ul class="lm-present-bullets">' + bullets + '</ul>' : '')
        + (narrationPreview
            ? '<div class="lm-present-narration">' + this._esc(narrationPreview) + '</div>'
            : '')
        + '</div>';
    }
    const sheet = document.getElementById('lm-present-notes-sheet');
    if (sheet && sheet.style.display !== 'none') {
      sheet.innerHTML = '<span class="lm-deck-notes-label">Narration</span>' + this._esc(s.explanation || s.prompt || '');
    }
    const prev = document.getElementById('lm-present-prev'); if (prev) prev.disabled = i === 0;
    const next = document.getElementById('lm-present-next'); if (next) next.disabled = i >= total - 1;
    this._stopSlideNarration();
    if (this._autoNarrate) this._narrateCurrentSlide();
    else this._updateSlidePlayBtn();
  },

  _togglePresentNotes() {
    const sheet = document.getElementById('lm-present-notes-sheet');
    if (!sheet) return;
    const show = sheet.style.display === 'none';
    sheet.style.display = show ? 'block' : 'none';
    if (show) {
      const s = this._slides[this._slideIndex];
      sheet.innerHTML = '<span class="lm-deck-notes-label">Narration</span>' + this._esc(s.explanation || s.prompt || '');
    }
  },

  // ─── Export to a real, editable PowerPoint (.pptx) ────
  /** Pure mapping from slides → a plain deck model (unit-testable). */
  _pptxModel() {
    const n = this._node;
    const safe = (n.title || 'lecture').replace(/[^a-z0-9 _-]/gi, '').trim() || 'lecture';
    return {
      fileName: safe,
      title: n.title || 'Lecture',
      subtitle: ((n.subject || '') + (n.chapter ? ' · ' + n.chapter : '')).trim(),
      slides: (this._slides || []).map(s => s.kind === 'activity'
        ? { kind: 'activity', title: s.title || 'Your turn', bullets: [s.prompt || ''].filter(Boolean), notes: s.answer || '' }
        : { kind: 'teach', title: s.title || '', bullets: (s.bullets || []).slice(), notes: s.explanation || '' }),
    };
  },

  async _exportPptx() {
    if (!this._slides || !this._slides.length) { Toast.info('Generate the lecture first.'); return; }
    if (typeof PptxGenJS === 'undefined') { Toast.error('PowerPoint export is still loading — try again in a moment.'); return; }
    const btn = document.getElementById('slide-pptx-btn');
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⬇ Building…'; }
    try {
      const model = this._pptxModel();
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      pptx.author = 'KnowledgeNode';
      pptx.title  = model.title;
      const ACCENT = '5B8DEF', DARK = '0E1116', LIGHT = 'E8ECF2', MUTED = '9AA4B2';
      // Title slide
      const t = pptx.addSlide(); t.background = { color: DARK };
      t.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.25, fill: { color: ACCENT } });
      t.addText(model.title, { x: 0.6, y: 2.0, w: 8.8, h: 1.4, fontSize: 40, bold: true, color: LIGHT, align: 'center' });
      if (model.subtitle) t.addText(model.subtitle, { x: 0.6, y: 3.5, w: 8.8, h: 0.6, fontSize: 18, color: ACCENT, align: 'center' });
      // Content slides
      model.slides.forEach((s, idx) => {
        const sl = pptx.addSlide(); sl.background = { color: DARK };
        sl.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.18, fill: { color: ACCENT } });
        sl.addText(s.title, { x: 0.6, y: 0.45, w: 8.8, h: 0.9, fontSize: 26, bold: true, color: s.kind === 'activity' ? ACCENT : LIGHT });
        if (s.bullets && s.bullets.length) {
          sl.addText(
            s.bullets.map(b => ({ text: b, options: { bullet: { code: '25B8' }, color: LIGHT, fontSize: 18, paraSpaceAfter: 12 } })),
            { x: 0.8, y: 1.6, w: 8.4, h: 3.4, valign: 'top' }
          );
        }
        sl.addText((idx + 1) + ' / ' + model.slides.length, { x: 8.3, y: 5.05, w: 1.3, h: 0.3, fontSize: 10, color: MUTED, align: 'right' });
        if (s.notes) sl.addNotes(s.notes);
      });
      await pptx.writeFile({ fileName: model.fileName + '.pptx' });
      Toast.success('PowerPoint saved to your device.');
    } catch (e) {
      Toast.error('Could not create the PowerPoint: ' + (e && e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  },

  /** Offline/no-key fallback deck built from the node's structured content,
   *  with an activity break point so the structure matches the real deck. */
  _mockSlides() {
    const n = this._node;
    const slides = [];
    slides.push({ kind: 'teach', title: n.title || 'Overview', bullets: [ (n.subject || 'This topic') + (n.chapter ? ' · ' + n.chapter : '') ].filter(Boolean), explanation: 'This deck covers ' + (n.title || 'this topic') + '. ' + (n.summary || '') });
    const defs = (n.definitions || []).slice(0, 6);
    defs.forEach(d => slides.push({ kind: 'teach', title: d.term || 'Definition', bullets: [d.description || ''].filter(Boolean), explanation: (d.term ? d.term + ': ' : '') + (d.description || '') }));
    // Break point: a recall activity on the first definition, if we have one.
    if (defs.length && defs[0].term) {
      slides.push({ kind: 'activity', title: 'Quick check', prompt: 'In your own words, what does "' + defs[0].term + '" mean?', answer: defs[0].description || '', activityType: 'recall' });
    }
    if ((n.formulas || []).length) slides.push({ kind: 'teach', title: 'Key formulas', bullets: n.formulas.map(f => (f.expression || '') + (f.description ? ' — ' + f.description : '')).filter(Boolean), explanation: 'These are the formulas to remember for this topic.' });
    if (n.summary) slides.push({ kind: 'teach', title: 'Summary', bullets: [n.summary], explanation: n.summary });
    let deck = slides.filter(s => s.kind === 'activity' ? !!s.prompt : (s.bullets.length || s.explanation));
    // Always include at least one activity break, even when the node has no
    // structured definitions to build one from.
    if (!deck.some(s => s.kind === 'activity')) {
      const act = { kind: 'activity', title: 'Your turn', prompt: 'In a sentence or two, explain the main idea of ' + (n.title || 'this topic') + ' in your own words.', answer: n.summary || '', activityType: 'reflect' };
      // Insert before the final summary slide if there is one, else append.
      const lastIsSummary = deck.length && /summary/i.test(deck[deck.length - 1].title || '');
      if (lastIsSummary) deck.splice(deck.length - 1, 0, act); else deck.push(act);
    }
    return deck;
  },

  _togglePlay() { this._isPlaying ? this._pause() : this._play(); },

  _play() {
    if (!this._chunks || !this._chunks.length) return;
    if (!this._speechSupported()) {
      Toast.error('Your browser does not support text-to-speech. Try Chrome or Edge.');
      return;
    }
    const speed = parseFloat(document.getElementById('lecture-speed')?.value || 1);
    if (this._isCapacitor()) {
      this._capStop();
    } else {
      this._synth.cancel();
    }
    if (this._chunkIndex === 0) {
      const saved = this._loadPosition();
      if (saved > 0 && saved < this._chunks.length) this._chunkIndex = saved;
    }
    if (this._chunkIndex >= this._chunks.length) this._chunkIndex = 0;
    if (!this._isCapacitor()) {
      const voices = this._synth.getVoices();
      this._voice = voices.length
        ? (voices.find(v => v.lang.startsWith('en') && /Google|Natural|Online|Samsung/.test(v.name))
          || voices.find(v => v.lang.startsWith('en')) || voices[0])
        : null;
    }
    this._isPlaying = true; this._updatePlayBtn();
    this._speakNextChunk(speed);
  },

  /** Split text into natural narration units: one sentence per chunk, with
   *  paragraph breaks marked. This gives a real pause at every period and a
   *  longer pause between paragraphs — like an audiobook narrator. */
  _chunkText(text, maxLen) {
    // Preserve paragraph breaks as explicit markers
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const chunks = [];

    paragraphs.forEach((para, pIdx) => {
      // Split into sentences — keep the terminal punctuation
      const sentences = para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [para];
      sentences.forEach(sentence => {
        const s = sentence.trim();
        if (!s) return;
        // For very long sentences, split on commas/semicolons so the narrator
        // takes a breath mid-sentence rather than racing through.
        if (s.length > 180) {
          const clauses = s.match(/[^,;:]+[,;:]+(\s|$)|[^,;:]+$/g) || [s];
          let buf = '';
          clauses.forEach(cl => {
            const c = cl.trim();
            if ((buf + ' ' + c).length > 180 && buf) {
              chunks.push({ text: buf.trim(), pause: 'clause' });
              buf = '';
            }
            buf += (buf ? ' ' : '') + c;
          });
          if (buf.trim()) chunks.push({ text: buf.trim(), pause: 'sentence' });
        } else {
          chunks.push({ text: s, pause: 'sentence' });
        }
      });
      // Mark the last chunk of a paragraph for a longer pause
      if (chunks.length && pIdx < paragraphs.length - 1) {
        chunks[chunks.length - 1].pause = 'paragraph';
      }
    });

    // Fallback: if nothing parsed, return the whole text as one chunk
    if (!chunks.length) chunks.push({ text: text.trim(), pause: 'sentence' });

    // Safety net: hard-wrap any chunk longer than maxLen on word boundaries.
    // A long unpunctuated passage could otherwise become one giant utterance
    // that some mobile TTS engines truncate or drop entirely.
    const cap = maxLen || 200;
    const wrapped = [];
    chunks.forEach(chunk => {
      if (chunk.text.length <= cap) { wrapped.push(chunk); return; }
      const words = chunk.text.split(/\s+/);
      let buf = '';
      words.forEach(w => {
        if (buf && (buf + ' ' + w).length > cap) {
          wrapped.push({ text: buf, pause: 'clause' });
          buf = '';
        }
        buf += (buf ? ' ' : '') + w;
      });
      if (buf) wrapped.push({ text: buf, pause: chunk.pause });
    });
    return wrapped;
  },

  /** Pause length in milliseconds after a chunk, by break type. */
  _pauseFor(type) {
    switch (type) {
      case 'clause':    return 180;  // brief breath mid-sentence
      case 'sentence':  return 420;  // clear stop at a period
      case 'paragraph': return 850;  // longer rest between paragraphs
      default:          return 350;
    }
  },

  _speakNextChunk(speed) {
    if (!this._isPlaying) return;
    if (this._chunkIndex >= this._chunks.length) {
      this._isPlaying = false; this._updatePlayBtn();
      this._highlightChunk(-1);
      if (typeof SpeechPill !== 'undefined') SpeechPill.hide();
      return;
    }
    this._highlightChunk(this._chunkIndex);
    const chunk = this._chunks[this._chunkIndex];
    if (this._isCapacitor()) {
      this._capSpeak(chunk.text, speed * 0.9, () => {
        this._chunkIndex++;
        this._savePosition();
        const pauseMs = this._pauseFor(chunk.pause);
        if (this._isPlaying) this._pauseTimer = setTimeout(() => this._speakNextChunk(speed), pauseMs);
      });
      return;
    }
    const u = new SpeechSynthesisUtterance(chunk.text);
    // Narration settings: slightly slower and lower for an audiobook feel
    u.rate  = speed * 0.9;
    u.pitch = 0.95;
    u.lang  = 'en-US';
    if (this._voice) u.voice = this._voice;
    u.onend = () => {
      this._chunkIndex++;
      this._savePosition();
      // Insert a natural silent pause before the next chunk
      const pauseMs = this._pauseFor(chunk.pause);
      if (this._isPlaying) {
        this._pauseTimer = setTimeout(() => this._speakNextChunk(speed), pauseMs);
      }
    };
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      // Skip a failed chunk rather than aborting the whole lecture.
      console.warn('[LectureMode] chunk speech error:', e.error);
      this._chunkIndex++;
      if (this._chunkIndex < this._chunks.length) { this._speakNextChunk(speed); }
      else {
        this._isPlaying = false; this._updatePlayBtn();
        Toast.error('Read-aloud isn\'t available in this browser — the lecture text is shown below.');
      }
    };
    this._utterance = u;
    try { this._synth.speak(u); }
    catch (err) {
      this._isPlaying = false; this._updatePlayBtn();
      Toast.error('Could not start read-aloud here. The lecture text is shown below.');
    }
  },

  /** Highlight the chunk currently being read and scroll it into view. Pass -1 to clear. */
  _highlightChunk(i) {
    document.querySelectorAll('.lm-chunk.active').forEach(el => el.classList.remove('active'));
    if (i < 0) return;
    const el = document.getElementById('lm_chunk_' + i);
    if (!el) return;
    el.classList.add('active');
    // Keep the active line comfortably in view inside the scroll box.
    const box = document.getElementById('lecture-script-area');
    if (box) {
      const boxRect = box.getBoundingClientRect();
      const elRect  = el.getBoundingClientRect();
      if (elRect.top < boxRect.top + 24 || elRect.bottom > boxRect.bottom - 24) {
        box.scrollTop += (elRect.top - boxRect.top) - box.clientHeight / 3;
      }
    }
  },

  /** Skip roughly ±10 seconds. At ~14 chars/sec speech, 10s ≈ 2 chunks of 200 chars. */
  _skip(direction) {
    if (!this._chunks || !this._chunks.length) return;
    const wasPlaying = this._isPlaying;
    this._clearPauseTimer();
    if (this._isCapacitor()) { this._capStop(); } else { this._synth.cancel(); }
    this._chunkIndex = Math.max(0, Math.min(this._chunks.length - 1, this._chunkIndex + direction * 2));
    this._highlightChunk(this._chunkIndex);
    if (wasPlaying) {
      const speed = parseFloat(document.getElementById('lecture-speed')?.value || 1);
      this._isPlaying = true; this._updatePlayBtn();
      this._speakNextChunk(speed);
    }
  },

  _savePosition() {
    if (!this._node) return;
    try {
      const key = 'kn_lecture_pos';
      const all = JSON.parse(localStorage.getItem(key) || '{}');
      const posKey = this._node.id + ':' + this._profileKey();
      // At the end, clear the saved position so next open starts fresh
      if (this._chunkIndex >= (this._chunks?.length || 0)) {
        delete all[posKey];
      } else {
        all[posKey] = this._chunkIndex;
      }
      localStorage.setItem(key, JSON.stringify(all));
    } catch(e) { /* best-effort */ }
  },

  _loadPosition() {
    try {
      const all = JSON.parse(localStorage.getItem('kn_lecture_pos') || '{}');
      const posKey = this._node.id + ':' + this._profileKey();
      const v = all[posKey];
      return (typeof v === 'number' && v > 0) ? v : 0;
    } catch(e) { return 0; }
  },

  _pause() {
    if (!this._speechSupported()) return;
    this._clearPauseTimer();
    // With chunked playback, cancel and stay on the current chunk so Play resumes
    // from here (synth.pause/resume is unreliable on mobile).
    this._isPlaying = false;
    this._synth.cancel();
    this._savePosition();
    this._updatePlayBtn();
    // Leave the current chunk highlighted so the reader sees where they paused.
  },
  _stop() {
    if (!this._speechSupported()) return;
    this._clearPauseTimer();
    this._isPlaying = false;
    this._chunkIndex = 0;
    this._synth.cancel();
    // Starting over — clear saved position
    try {
      const all = JSON.parse(localStorage.getItem('kn_lecture_pos') || '{}');
      delete all[this._node.id + ':' + this._profileKey()];
      localStorage.setItem('kn_lecture_pos', JSON.stringify(all));
    } catch(e) {}
    this._updatePlayBtn();
    this._highlightChunk(-1);
    if (typeof SpeechPill !== 'undefined') SpeechPill.hide();
  },
  _updatePlayBtn() { const b = document.getElementById('play-btn'); if (b) b.textContent = this._isPlaying ? '⏸ Pause' : '▶ Play'; },

  // ─── Voice Input — Fixed proper binding ──────────────

  _startVoiceInput() {
    const btn = document.getElementById('voice-answer-btn');
    if (!btn) return;

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      Toast.error('Voice recognition requires Chrome or Edge.');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';

    btn.textContent = '🔴 Listening…'; btn.style.color = 'var(--red)';
    btn.disabled = true;

    rec.onresult = e => {
      const transcript = Array.from(e.results).map(r=>r[0].transcript).join('');
      const ta = document.getElementById('quiz-text-answer');
      if (ta) ta.value = transcript;
    };
    rec.onerror = err => {
      Toast.error('Voice error: ' + err.error + '. Try speaking clearly into the mic.');
      btn.textContent = '🎤 Voice Answer'; btn.style.color = ''; btn.disabled = false;
    };
    rec.onend = () => {
      btn.textContent = '🎤 Voice Answer'; btn.style.color = ''; btn.disabled = false;
    };

    try { rec.start(); }
    catch(e) { Toast.error('Could not start microphone: ' + e.message); btn.textContent = '🎤 Voice Answer'; btn.style.color = ''; btn.disabled = false; }
  },

  // ─── Quiz ─────────────────────────────────────────────

  _startQuiz() {
    if (!this._questions.length) {
      Toast.info('No questions — generate a lecture first or add questions to this node.');
      return;
    }
    this._currentQ = 0; this._quizAnswers = [];
    document.getElementById('start-quiz-btn').style.display = 'none';
    document.getElementById('quiz-progress').style.display  = 'block';
    this._renderQuestion();
  },

  _renderQuestion() {
    const q = this._questions[this._currentQ];
    if (!q) { this._showQuizComplete(); return; }
    const area = document.getElementById('quiz-question-area');
    if (area) area.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:8px;">
        Question ${this._currentQ+1} of ${this._questions.length} · ${q.type}
      </div>
      <div style="font-family:var(--font-ui);font-size:16px;font-weight:600;color:var(--text-primary);line-height:1.4;">${this._esc(q.question)}</div>`;

    const ta = document.getElementById('quiz-text-answer');
    if (ta) ta.value = '';
    const ansArea = document.getElementById('quiz-answer-area');
    if (ansArea) ansArea.style.display = 'block';
    const feedback = document.getElementById('quiz-feedback');
    if (feedback) feedback.style.display = 'none';
    const nextBtn = document.getElementById('next-q-btn');
    if (nextBtn) nextBtn.style.display = 'none';
    const pct = (this._currentQ / this._questions.length) * 100;
    const pFill = document.getElementById('quiz-progress-fill');
    if (pFill) pFill.style.width = pct + '%';
    const pLabel = document.getElementById('quiz-progress-label');
    if (pLabel) pLabel.textContent = `${this._currentQ} / ${this._questions.length}`;

    if (this._voiceMode === 'browser') {
      const u = new SpeechSynthesisUtterance(`Question ${this._currentQ+1}. ${q.question}`);
      u.rate = 0.95; this._synth.cancel(); this._synth.speak(u);
    }
  },

  async _submitAnswer() {
    const q      = this._questions[this._currentQ];
    const answer = document.getElementById('quiz-text-answer')?.value?.trim() || '';

    const ansArea = document.getElementById('quiz-answer-area');
    if (ansArea) ansArea.style.display = 'none';
    const feedback = document.getElementById('quiz-feedback');
    if (feedback) { feedback.style.display = 'block'; feedback.innerHTML = '<span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);">Checking…</span>'; }

    let result;
    try {
      result = AIService.hasApiKey()
        ? await AIService.checkAnswer(q.question, q.answer, answer, this._node.subject)
        : this._mockGrade(answer, q.answer);
    } catch { result = this._mockGrade(answer, q.answer); }

    this._quizAnswers.push({ question:q, studentAnswer:answer, result });

    const color = result.score>=70?'var(--green)':result.score>=40?'var(--accent)':'var(--red)';
    if (feedback) feedback.innerHTML = `
      <div style="background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid ${color};border-radius:var(--radius-md);padding:14px 18px;">
        <div style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:${color};margin-bottom:7px;">${result.score}/100</div>
        <p style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);margin-bottom:8px;">${this._esc(result.feedback)}</p>
        <div style="padding-top:10px;border-top:1px solid var(--border-soft);font-family:var(--font-body);font-size:12px;color:var(--text-secondary);font-style:italic;">
          Model: ${this._esc(q.answer.slice(0,100))}${q.answer.length>100?'…':''}
        </div>
      </div>`;

    if (this._voiceMode === 'browser') {
      const u = new SpeechSynthesisUtterance(result.feedback);
      u.rate = 0.95; this._synth.cancel(); this._synth.speak(u);
    }

    const nextBtn = document.getElementById('next-q-btn');
    if (nextBtn) { nextBtn.style.display = 'inline-flex'; nextBtn.textContent = this._currentQ < this._questions.length-1 ? 'Next →' : 'See Results'; }
  },

  _nextQuestion() { this._currentQ++; this._renderQuestion(); },

  _showQuizComplete() {
    const total = this._quizAnswers.length;
    const avg   = total ? Math.round(this._quizAnswers.reduce((s,a)=>s+a.result.score,0)/total) : 0;
    const area  = document.getElementById('quiz-question-area');
    if (area) area.innerHTML = `
      <div style="font-size:36px;margin-bottom:12px;">🎓</div>
      <div style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:6px;">Quiz Complete!</div>
      <div style="font-family:var(--font-mono);font-size:13px;color:var(--accent);">Average: ${avg}/100</div>`;
    const ansArea = document.getElementById('quiz-answer-area');
    const feedback = document.getElementById('quiz-feedback');
    const nextBtn  = document.getElementById('next-q-btn');
    const startBtn = document.getElementById('start-quiz-btn');
    if (ansArea)  ansArea.style.display  = 'none';
    if (feedback) feedback.style.display = 'none';
    if (nextBtn)  nextBtn.style.display  = 'none';
    if (startBtn) { startBtn.style.display = 'inline-flex'; startBtn.textContent = '↺ Restart Quiz'; }
    const pFill = document.getElementById('quiz-progress-fill');
    if (pFill) pFill.style.width = '100%';
    const pLabel = document.getElementById('quiz-progress-label');
    if (pLabel) pLabel.textContent = `${total} / ${total}`;
  },

  _mockGrade(student, correct) {
    if (!student) return { score:0, feedback:'No answer given.', keyPointsMissed:[] };
    const stu = student.toLowerCase().split(/\W+/).filter(Boolean);
    const mod = correct.toLowerCase().split(/\W+/).filter(w=>w.length>3);
    const hits = mod.filter(w=>stu.includes(w)).length;
    const score = Math.min(100, Math.round((hits/Math.max(mod.length,1))*120));
    return { score, feedback: score>=70?'Good answer!':score>=40?'Partially correct — review the model answer.':'Needs more detail.', keyPointsMissed:[] };
  },

  _mockLecture() {
    return `Welcome. Today we cover ${this._node.title} — a core topic in ${this._node.subject||'your subject'}.\n\n[PAUSE]\n\n${this._node.definitions?.map((d,i)=>`${i===0?'First':'Next'}, let's define ${d.term}. ${d.description}`).join('\n\n')}\n\n[PAUSE]\n\nFormulas to know:\n${this._node.formulas?.map(f=>`${f.expression} — ${f.description}`).join('\n')}\n\n[PAUSE]\n\nSummary: ${this._node.summary}\n\n[PAUSE]\n\nNow let me test your understanding…`;
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  _delay: ms => new Promise(r=>setTimeout(r,ms)),
};
