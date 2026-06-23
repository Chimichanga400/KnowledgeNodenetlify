/**
 * BlankRecall.js
 * The blank-sheet recall canvas — shown BEFORE the recall/apply steps in Guided Flow.
 * Student writes everything they remember from memory.
 * Then their attempt is shown alongside the actual notes for self-marking.
 */

const BlankRecall = {
  _node:   null,
  _onPass: null,
  _mode:   'recall', // 'recall' | 'apply'

  /**
   * @param {KnowledgeNode} node
   * @param {'recall'|'apply'} mode
   * @param {function} onPass  — called when student proceeds to see questions
   */
  show(node, mode, onPass) {
    this._node   = node;
    this._mode   = mode;
    this._onPass = onPass;
    this._renderCanvas();
  },

  _renderCanvas() {
    const node    = this._node;
    const isApply = this._mode === 'application';
    const container = document.getElementById('step-content');
    if (!container) return;

    const prompt = isApply
      ? `Explain how you would apply the concepts from <strong>${this._esc(node.title)}</strong> to a real problem. Write the key steps, formula, and any constraints.`
      : `Without looking at anything, write down everything you remember about <strong>${this._esc(node.title)}</strong>. Definitions, formulas, steps, exceptions — everything.`;

    const placeholder = isApply
      ? 'I would start by identifying… then apply the formula… the key constraint is…'
      : 'From memory: the key concept is… the formula is… the steps are… the exceptions are…';

    container.innerHTML = `
      <div class="br-wrapper">
        <div class="br-header">
          <div class="br-badge">${isApply ? 'Application' : 'Blank-Sheet Recall'} — Write from Memory</div>
          <h3 class="br-title">${isApply ? 'How would you apply this?' : 'What do you remember?'}</h3>
          <p class="br-subtitle">${prompt}</p>
        </div>

        <!-- Timer display -->
        <div class="br-timer-row">
          <div class="br-timer" id="br-timer">
            <span id="br-timer-val">0:00</span>
          </div>
          <p class="br-struggle-tip">
            ⏱ If you get stuck, <strong>wait 30 seconds before giving up</strong>. That struggle is where memory is built.
          </p>
        </div>

        <!-- Canvas -->
        <textarea id="br-canvas" class="br-canvas"
          placeholder="${placeholder}"
          autocorrect="on" autocapitalize="sentences" spellcheck="true"></textarea>

        <!-- Word counter -->
        <div class="br-meta-row">
          <span class="br-word-count" id="br-word-count">0 words</span>
          <span class="br-hint">Write freely — spelling doesn't matter</span>
        </div>

        <!-- Actions -->
        <div class="br-actions">
          <button class="btn-primary" id="br-reveal-btn">
            ✓ I'm done — show me how I did
          </button>
          <button class="btn-secondary" id="br-skip-btn">
            Skip blank-sheet step
          </button>
        </div>
      </div>
    `;

    // Start timer
    this._startTimer();

    // Word counter
    document.getElementById('br-canvas').addEventListener('input', () => {
      const words = document.getElementById('br-canvas').value.trim().split(/\s+/).filter(Boolean).length;
      document.getElementById('br-word-count').textContent = `${words} word${words !== 1 ? 's' : ''}`;
    });

    document.getElementById('br-reveal-btn').addEventListener('click', () => {
      this._stopTimer();
      const canvas = document.getElementById('br-canvas');
      const attempt = (canvas?.value || '').trim();
      if (!attempt) {
        Toast.info("Write something first — even a few words. The effort is what counts.");
        canvas?.focus();
        return;
      }
      try {
        this._showComparison(attempt);
      } catch (e) {
        console.error('[BlankRecall] comparison failed:', e);
        // Never strand the user — show a minimal comparison, then let them continue.
        const container = document.getElementById('step-content');
        if (container) {
          container.innerHTML =
            '<div class="br-wrapper"><div class="br-header"><div class="br-badge">Recall Check</div>'
            + '<h3 class="br-title">Nice work writing that out</h3></div>'
            + '<div class="br-compare-col"><div class="br-col-label">✍ Your attempt</div>'
            + '<div class="br-col-body">' + this._esc(attempt) + '</div></div>'
            + '<div class="br-selfmark"><div class="br-selfmark-title">How did your recall feel?</div>'
            + '<div class="br-selfmark-btns">'
            + '<button class="br-mark-btn red" id="brm-low">🔴 Forgot most</button>'
            + '<button class="br-mark-btn amber" id="brm-mid">🟡 Some</button>'
            + '<button class="br-mark-btn green" id="brm-high">🟢 Well</button>'
            + '</div></div></div>';
          ['brm-low','brm-mid','brm-high'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => this._onPass?.());
          });
        } else {
          this._onPass?.();
        }
      }
    });

    document.getElementById('br-skip-btn').addEventListener('click', () => {
      this._stopTimer();
      this._onPass?.();
    });

    document.getElementById('br-canvas').focus();
  },

  _showComparison(attempt) {
    const node      = this._node;
    const container = document.getElementById('step-content');
    const isApply   = this._mode === 'application';

    // Score attempt heuristically (keyword matching). Be defensive about node
    // shape — newer block-based nodes may not have these legacy arrays, and a
    // formula/definition may be missing fields. Never let this throw.
    const keyTerms = [
      ...(Array.isArray(node.definitions) ? node.definitions.map(d => d && (d.term || d.name)) : []),
      ...(Array.isArray(node.formulas) ? node.formulas.map(f => {
            const exp = f && (f.expression || f.formula || f.name);
            return (typeof exp === 'string' && exp.length) ? exp.split(/\s+/)[0] : null;
          }) : []),
      ...(Array.isArray(node.procedures) ? node.procedures.slice(0, 3).map(p => (typeof p === 'string' ? p : (p && (p.title || p.name)))) : []),
      // Fall back to block content for block-based nodes
      ...(Array.isArray(node.blocks) ? node.blocks.flatMap(b => {
            if (!b) return [];
            if (b.term) return [b.term];
            if (b.title) return [b.title];
            return [];
          }) : []),
    ].filter(t => typeof t === 'string' && t.trim().length);

    const attemptLower = attempt.toLowerCase();
    const hits    = keyTerms.filter(t => attemptLower.includes(t.toLowerCase().slice(0,5))).length;
    const total   = Math.max(1, keyTerms.length);
    const pct     = Math.min(100, Math.round((hits / total) * 100));
    const color   = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--accent)' : 'var(--red)';
    const label   = pct >= 70 ? 'Strong recall' : pct >= 40 ? 'Partial recall — good effort' : 'Low recall — that\'s what studying is for';

    container.innerHTML = `
      <div class="br-wrapper">
        <div class="br-header">
          <div class="br-badge">Recall Check</div>
          <h3 class="br-title">Your attempt vs. your notes</h3>
        </div>

        <!-- Score -->
        <div class="br-score-row">
          <div class="br-score-circle" style="border-color:${color};">
            <span style="color:${color};font-size:22px;font-weight:700;">${pct}%</span>
            <span style="font-size:10px;color:var(--text-muted);">coverage</span>
          </div>
          <div>
            <div style="font-family:var(--font-ui);font-size:14px;font-weight:700;color:${color};margin-bottom:4px;">${label}</div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">
              Matched ${hits} of ${total} key concepts
            </div>
          </div>
        </div>

        <!-- Side by side -->
        <div class="br-compare">
          <div class="br-compare-col">
            <div class="br-col-label">✍ Your attempt</div>
            <div class="br-col-body">${this._esc(attempt)}</div>
          </div>
          <div class="br-compare-col">
            <div class="br-col-label">📋 Key concepts from notes</div>
            <div class="br-col-body">
              ${node.definitions?.length ? `
                <div class="br-ref-section"><strong>Definitions:</strong>
                  ${node.definitions.slice(0,3).map(d => `<div class="br-ref-item"><em>${this._esc(d.term)}</em> — ${this._esc(d.description)}</div>`).join('')}
                </div>` : ''}
              ${node.formulas?.length ? `
                <div class="br-ref-section"><strong>Formulas:</strong>
                  ${node.formulas.slice(0,2).map(f => `<div class="br-ref-item"><code>${this._esc(f.expression)}</code></div>`).join('')}
                </div>` : ''}
              ${node.procedures?.length ? `
                <div class="br-ref-section"><strong>Steps:</strong>
                  ${node.procedures.slice(0,3).map((s,i) => {
                    const txt = (typeof s === 'string') ? s : (s && (s.title || s.name) ? (s.title || s.name) : '');
                    return txt ? `<div class="br-ref-item">${i+1}. ${this._esc(txt)}</div>` : '';
                  }).join('')}
                </div>` : ''}
            </div>
          </div>
        </div>

        <!-- Self-mark -->
        <div class="br-selfmark">
          <div class="br-selfmark-title">Mark your own recall:</div>
          <div class="br-selfmark-btns">
            <button class="br-mark-btn red"    id="brm-low">🔴 Forgot most of it</button>
            <button class="br-mark-btn amber"  id="brm-mid">🟡 Remembered some</button>
            <button class="br-mark-btn green"  id="brm-high">🟢 Remembered well</button>
          </div>
        </div>
      </div>
    `;

    ['brm-low','brm-mid','brm-high'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        const rating = id === 'brm-low' ? 1 : id === 'brm-mid' ? 2 : 3;
        // Save recall rating to node
        this._node.lastRecallRating = { rating, attemptPct: pct, at: Date.now() };
        nodeStore.save(this._node);
        this._onPass?.();
      });
    });
  },

  // ─── Timer ────────────────────────────────────────────

  _timerInterval: null,
  _elapsed: 0,

  _startTimer() {
    this._elapsed = 0;
    this._stopTimer();
    this._timerInterval = setInterval(() => {
      this._elapsed++;
      const el = document.getElementById('br-timer-val');
      if (!el) { this._stopTimer(); return; }
      const m = Math.floor(this._elapsed / 60);
      const s = this._elapsed % 60;
      el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    }, 1000);
  },

  _stopTimer() {
    clearInterval(this._timerInterval);
    this._timerInterval = null;
  },

  // ─── Teach It (Feynman) mode ──────────────────────────

  showTeachIt(node, onPass) {
    this._node   = node;
    this._onPass = onPass;
    this._mode   = 'recall';
    const container = document.getElementById('step-content');
    if (!container) return;

    container.innerHTML = `
      <div class="br-wrapper">
        <div class="br-header">
          <div class="br-badge" style="background:rgba(240,165,0,0.15);color:var(--accent-light);">🎓 Teach It — Feynman Technique</div>
          <h3 class="br-title">Explain it like you're teaching a beginner</h3>
          <p class="br-subtitle">Imagine someone who knows <strong>nothing</strong> about <strong>${this._esc(node.title)}</strong> is sitting next to you.
          Explain everything — definitions, how it works, formulas, examples, common mistakes. Write until you'd run out of things to say.</p>
        </div>

        <div class="br-timer-row">
          <div class="br-timer"><span id="br-timer-val">0:00</span></div>
          <p class="br-struggle-tip">⏱ The gaps you hit while explaining are exactly what to study next.</p>
        </div>

        <div style="position:relative;">
          <textarea id="br-canvas" class="br-canvas"
            placeholder="Start with the basics — what is this topic? Why does it matter? Then explain how it works, step by step, as if to someone who has never heard of it… (or tap 🎤 to talk it through)"
            style="padding-right:48px;"
            autocorrect="on" autocapitalize="sentences" spellcheck="true"></textarea>
          <button id="br-mic-btn" title="Speak your explanation" style="position:absolute;right:10px;top:10px;background:none;border:1px solid var(--border);border-radius:8px;padding:4px 8px;font-size:18px;cursor:pointer;color:var(--text-secondary);">🎤</button>
        </div>

        <div class="br-meta-row">
          <span class="br-word-count" id="br-word-count">0 words</span>
          <span class="br-hint">Don't hold back — quantity reveals gaps</span>
        </div>

        <div class="br-actions">
          <button class="btn-primary" id="br-reveal-btn" ${!AIService.hasApiKey() ? 'disabled title="Configure AI first"' : ''}>
            🎓 Evaluate my explanation
          </button>
          <button class="btn-secondary" id="br-skip-btn">Skip</button>
        </div>
        ${!AIService.hasApiKey() ? '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);text-align:center;margin-top:8px;">Configure your AI key in Settings to get AI evaluation. Or use Blank Recall instead.</p>' : ''}
      </div>
    `;

    this._startTimer();
    const canvas = document.getElementById('br-canvas');
    const wc = document.getElementById('br-word-count');
    canvas?.addEventListener('input', () => {
      const w = canvas.value.trim().split(/\s+/).filter(Boolean).length;
      wc.textContent = w + ' word' + (w === 1 ? '' : 's');
    });

    // Voice input — speaking your explanation aloud is the natural way to "teach it".
    // The Android WebView can't do Web Speech, so we use the native KnowledgeNodeSTT
    // bridge when present and only fall back to the browser API for desktop testing.
    document.getElementById('br-mic-btn')?.addEventListener('click', () => {
      const btn = document.getElementById('br-mic-btn');
      const ta  = document.getElementById('br-canvas');
      if (!btn || !ta) return;

      const append = (text) => {
        if (!text) return;
        ta.value = (ta.value ? ta.value.trimEnd() + ' ' : '') + text.trim();
        ta.dispatchEvent(new Event('input'));
      };
      const setIdle  = () => { btn.textContent = '🎤'; btn.style.borderColor = 'var(--border)'; btn.dataset.listening = ''; };
      const setLive  = () => { btn.textContent = '🔴'; btn.style.borderColor = 'var(--red)'; btn.dataset.listening = '1'; };
      const friendly = (reason) => ({
        permission:      'Microphone permission is off — enable it for KnowledgeNode in your phone settings.',
        no_match:        'Didn\'t catch that — tap 🎤 and try again.',
        speech_timeout:  'Didn\'t hear anything — tap 🎤 and speak.',
        network:         'Voice typing needs an internet connection.',
        network_timeout: 'Voice typing needs an internet connection.',
        busy:            'Still finishing the last bit — give it a second.',
        unavailable:     'Speech recognition isn\'t available on this device.',
      }[reason] || 'Voice input stopped.');

      // ── Native bridge (Android) ──────────────────────────────────────────────
      const STT = window.KnowledgeNodeSTT;
      if (STT && typeof STT.start === 'function') {
        // Tapping again while live = stop
        if (btn.dataset.listening) { try { STT.stop(); } catch {} return; }

        if (typeof STT.isAvailable === 'function' && !STT.isAvailable()) {
          if (typeof STT.hasPermission === 'function' && !STT.hasPermission()) {
            Toast.info(friendly('permission'));
          } else {
            Toast.info(friendly('unavailable'));
          }
          return;
        }

        // Bind listeners once per session, then clean them up on end
        const onResult = e => append(e.detail);
        const onError  = e => { if (e.detail && e.detail !== 'no_match') Toast.info(friendly(e.detail)); };
        const onEnd    = () => {
          setIdle();
          window.removeEventListener('knstt:result', onResult);
          window.removeEventListener('knstt:error',  onError);
          window.removeEventListener('knstt:end',    onEnd);
        };
        window.addEventListener('knstt:result', onResult);
        window.addEventListener('knstt:error',  onError);
        window.addEventListener('knstt:end',    onEnd);

        setLive();
        try { STT.start('en-ZA'); }
        catch (err) { onEnd(); Toast.info(friendly('unavailable')); }
        return;
      }

      // ── Browser fallback (desktop testing only) ──────────────────────────────
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { Toast.info('Voice typing isn\'t supported here — use your keyboard\'s 🎤 instead.'); return; }
      if (btn.dataset.listening) { setIdle(); return; }
      const sr = new SpeechRecognition();
      sr.lang = 'en-ZA';
      sr.continuous = true;
      sr.interimResults = false;
      setLive();
      sr.onresult = e => {
        let text = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
        }
        append(text);
      };
      sr.onerror = () => setIdle();
      sr.onend   = () => setIdle();
      sr.start();
    });

    document.getElementById('br-reveal-btn')?.addEventListener('click', async () => {
      const attempt = canvas?.value.trim() || '';
      if (attempt.split(/\s+/).filter(Boolean).length < 10) {
        Toast.info('Write a bit more before evaluating — even a short explanation helps.');
        return;
      }
      this._stopTimer();
      await this._showTeachFeedback(attempt);
    });

    document.getElementById('br-skip-btn')?.addEventListener('click', () => {
      this._stopTimer();
      this._onPass?.();
    });
  },

  async _showTeachFeedback(attempt) {
    const node      = this._node;
    const container = document.getElementById('step-content');
    if (!container) return;

    // Loading state
    container.innerHTML = `
      <div class="br-wrapper" style="text-align:center;padding:40px 20px;">
        <div style="font-size:32px;margin-bottom:16px;">🎓</div>
        <div style="font-family:var(--font-ui);font-weight:700;font-size:16px;margin-bottom:8px;">Evaluating your explanation…</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">Checking what you covered, what you missed, and what to work on</div>
      </div>`;

    let result;
    try {
      const ctx = LearnerContext.forGuidedStudy(node).slice(0, 3000);
      const prompt = ctx + '\n\nA student was asked to teach this topic to a beginner. Evaluate their explanation.\n\n'
        + 'STUDENT\'S EXPLANATION:\n"' + attempt + '"\n\n'
        + 'Evaluate based on the source material above. Be encouraging but honest.\n'
        + 'Output ONLY valid JSON (no markdown):\n'
        + '{"score":75,"covered":["specific thing they explained well","another"],"missing":["key concept not mentioned","another"],"incorrect":["anything factually wrong — empty array if nothing wrong"],"encouragement":"one warm sentence acknowledging their effort and the most impressive part of their explanation"}';

      const raw = await AIService._callWithFunction('noteProcessing', [{ role: 'user', content: prompt }], 600);
      const clean = raw.replace(/```json|```/g, '').trim();
      result = JSON.parse(clean);
    } catch(e) {
      console.warn('[TeachIt] AI eval failed:', e);
      result = null;
    }

    if (!result) {
      // AI unavailable — show self-check comparison
      this._showComparison(attempt);
      return;
    }

    const score  = Math.max(0, Math.min(100, result.score || 0));
    const color  = score >= 75 ? 'var(--green)' : score >= 45 ? 'var(--accent)' : 'var(--red)';
    const label  = score >= 75 ? 'Strong teaching — you understand this well' : score >= 45 ? 'Solid foundation — a few gaps to fill' : 'Good start — this is exactly what practice is for';

    const listItems = arr => (arr || []).map(t => `<li style="margin-bottom:6px;">${this._esc(t)}</li>`).join('');

    container.innerHTML = `
      <div class="br-wrapper">
        <div class="br-header">
          <div class="br-badge" style="background:rgba(240,165,0,0.15);color:var(--accent-light);">🎓 Teaching Feedback</div>
          <h3 class="br-title">How well did you explain it?</h3>
        </div>

        <div class="br-score-row">
          <div class="br-score-circle" style="border-color:${color};">
            <span style="color:${color};font-size:22px;font-weight:700;">${score}%</span>
            <span style="font-size:10px;color:var(--text-muted);">coverage</span>
          </div>
          <div>
            <div style="font-family:var(--font-ui);font-size:14px;font-weight:700;color:${color};margin-bottom:4px;">${label}</div>
            ${result.encouragement ? `<div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);font-style:italic;">${this._esc(result.encouragement)}</div>` : ''}
          </div>
        </div>

        ${result.covered?.length ? `
        <div style="margin-bottom:14px;">
          <div style="font-family:var(--font-ui);font-weight:700;font-size:13px;color:var(--green);margin-bottom:6px;">✅ What you explained well</div>
          <ul style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);padding-left:18px;margin:0;">${listItems(result.covered)}</ul>
        </div>` : ''}

        ${result.missing?.length ? `
        <div style="margin-bottom:14px;">
          <div style="font-family:var(--font-ui);font-weight:700;font-size:13px;color:var(--accent-light);margin-bottom:6px;">⚠️ Key concepts you missed</div>
          <ul style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);padding-left:18px;margin:0;">${listItems(result.missing)}</ul>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:6px;">Study these before your next session.</div>
        </div>` : ''}

        ${result.incorrect?.length ? `
        <div style="margin-bottom:14px;">
          <div style="font-family:var(--font-ui);font-weight:700;font-size:13px;color:var(--red);margin-bottom:6px;">❌ Needs correction</div>
          <ul style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);padding-left:18px;margin:0;">${listItems(result.incorrect)}</ul>
        </div>` : ''}

        <div class="br-selfmark">
          <div class="br-selfmark-title">How did that feel?</div>
          <div class="br-selfmark-btns">
            <button class="br-mark-btn red"   id="brm-low">😕 Lots of gaps</button>
            <button class="br-mark-btn amber" id="brm-mid">🙂 Mostly there</button>
            <button class="br-mark-btn green" id="brm-high">😎 Nailed it</button>
          </div>
        </div>
      </div>
    `;

    ['brm-low','brm-mid','brm-high'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        const rating = id === 'brm-low' ? 1 : id === 'brm-mid' ? 2 : 3;
        node.lastRecallRating = { rating, attemptPct: score, mode: 'teach', at: Date.now() };
        nodeStore.save(node);
        this._onPass?.();
      });
    });
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
