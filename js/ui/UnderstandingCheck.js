/**
 * UnderstandingCheck.js — AI-powered assess-first diagnostic
 *
 * Before reading notes, the AI:
 *   1. Generates 3 questions SPECIFIC to this node's content
 *   2. Evaluates the student's answers against the source — gently,
 *      praising reasoning, explaining gaps, never just "wrong"
 *   3. Tells the student exactly what to focus on while reading
 *
 * Falls back to generic questions if no AI key is configured.
 */
const UnderstandingCheck = {
  _node: null, _onPass: null, _questions: null,

  show(node, onPass) {
    this._node = node;
    this._onPass = onPass;
    this._questions = null;
    this._render();
  },

  _genericQuestions(node) {
    return [
      { q: `What problem does ${(node.title||"").replace(/[<>"']/g,"")} solve? What is it trying to do?`, hint: 'e.g. It calculates… / it records…' },
      { q: 'When would you use this — and when would you not use it?', hint: 'e.g. Use when… but not when…' },
      { q: 'What mistakes could you make when applying this?', hint: 'e.g. Forgetting to…, confusing X with Y…' },
    ];
  },

  _render() {
    const node = this._node;
    const container = document.getElementById('step-content');
    if (!container) return;

    const hasAI = AIService.hasApiKey();

    // Show loading state while AI generates questions
    container.innerHTML = `
      <div class="uc-wrapper">
        <div class="uc-header">
          <div class="uc-badge">Step 1.5 — Understanding Check</div>
          <h3 class="uc-title">Before you read your notes</h3>
          <p class="uc-subtitle">Answer from memory or your initial reading. No wrong answers — this surfaces gaps before you study.</p>
        </div>
        <div id="uc-q-area">
          ${hasAI ? `
            <div class="aif-loading" style="padding:30px;justify-content:center;">
              <div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div>
            </div>
            <p style="text-align:center;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Preparing questions about this topic…</p>
          ` : ''}
        </div>
      </div>`;

    if (hasAI) {
      // Use cached questions if we've generated them before for this node.
      // They only depend on the node's content, so they're stable across visits.
      if (node.ucQuestionCache?.length) {
        this._questions = node.ucQuestionCache.slice(0, 3);
        this._renderQuestions();
        return;
      }
      AIService.generateUnderstandingQuestions(node)
        .then(data => {
          this._questions = (data?.questions?.length ? data.questions : this._genericQuestions(node)).slice(0, 3);
          // Cache for next time
          node.ucQuestionCache = this._questions;
          try { nodeStore.save(node); } catch(e) { /* best-effort */ }
          this._renderQuestions();
        })
        .catch(() => {
          this._questions = this._genericQuestions(node);
          this._renderQuestions();
        });
    } else {
      this._questions = this._genericQuestions(node);
      this._renderQuestions();
    }
  },

  _renderQuestions() {
    const node = this._node;
    const qArea = document.getElementById('uc-q-area');
    if (!qArea) return;

    const src = KnowledgeNode.cleanSourceText(node.rawOCR);
    const showSource = src && src !== '[Demo]' && src !== '[Demo mode]';

    qArea.innerHTML = `
      <div class="uc-questions">
        ${this._questions.map((item, i) => `
          <div class="uc-question">
            <div class="uc-q-label">
              <span class="uc-q-num">${i + 1}</span>
              <span>${this._esc(item.q)}</span>
            </div>
            <textarea id="uc-q${i}" class="config-input uc-textarea" rows="3"
              placeholder="${this._esc(item.hint || 'Your answer…')}"></textarea>
          </div>
        `).join('')}
      </div>

      ${showSource ? `
        <details class="uc-source">
          <summary>📄 Re-read source text before answering</summary>
          <div class="uc-source-text">${this._esc(src.slice(0, 2000))}${src.length > 2000 ? '…' : ''}</div>
        </details>` : ''}

      <div class="uc-actions">
        <button class="btn-primary" id="uc-proceed-btn" style="flex:1;justify-content:center;">✓ Check my understanding</button>
        <button class="btn-secondary" id="uc-skip-btn">Skip</button>
      </div>

      <div class="uc-tip">
        💡 Even partial answers are valuable. The gap between what you wrote and the notes tells you exactly what to focus on.
      </div>`;

    document.getElementById('uc-proceed-btn').addEventListener('click', () => {
      const answers = this._questions.map((item, i) => ({
        q: item.q,
        a: document.getElementById('uc-q' + i)?.value.trim() || '',
      }));
      if (answers.every(a => !a.a)) {
        Toast.info('Try answering at least one question — even a few words helps.');
        document.getElementById('uc-q0')?.focus();
        return;
      }
      node.understandingCheck = { answeredAt: Date.now(), answers };
      nodeStore.save(node);
      this._evaluate(answers);
    });

    document.getElementById('uc-skip-btn').addEventListener('click', () => this._onPass?.());
  },

  _evaluate(answers) {
    const node = this._node;
    const container = document.getElementById('step-content');
    const hasAI = AIService.hasApiKey();

    if (!hasAI) { this._showStaticComparison(answers); return; }

    // Loading state
    container.innerHTML = `
      <div class="uc-wrapper">
        <div class="uc-header">
          <div class="uc-badge">Checking…</div>
          <h3 class="uc-title">Reviewing your answers</h3>
        </div>
        <div class="aif-loading" style="padding:30px;justify-content:center;">
          <div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div>
        </div>
        <p style="text-align:center;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Your teacher is reviewing what you wrote…</p>
      </div>`;

    AIService.evaluateUnderstanding(node, answers)
      .then(result => {
        if (result && result.perAnswer) {
          this._showAIFeedback(answers, result);
        } else {
          // AI returned nothing usable — fall back gracefully
          this._showStaticComparison(answers);
        }
      })
      .catch(err => {
        console.warn('[UnderstandingCheck] AI evaluation failed:', err);
        this._showStaticComparison(answers);
      });
  },

  _showAIFeedback(answers, result) {
    const container = document.getElementById('step-content');
    const per   = result?.perAnswer || [];
    const focus = result?.focusAreas || [];
    const enc   = result?.encouragement || '';

    const cards = answers.map((a, i) => {
      const fb = per[i] || {};
      const answered = a.a.length > 0;
      return `
        <div class="uc-compare-row" style="display:block;">
          <div class="uc-compare-q" style="margin-bottom:8px;">
            <span class="uc-q-num" style="flex-shrink:0;">${i + 1}</span>
            <span style="font-family:var(--font-ui);font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.4;">${this._esc(a.q)}</span>
          </div>
          <div style="background:var(--bg-base);border:1px solid var(--border-soft);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
            <div style="font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:${answered?'var(--green)':'var(--text-muted)'};margin-bottom:5px;">${answered?'✓ Your answer':'○ Not answered'}</div>
            <div style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.55;">${answered ? this._esc(a.a) : '<em style="color:var(--text-muted)">Skipped</em>'}</div>
          </div>
          ${fb.gotRight ? `<div style="display:flex;gap:8px;margin-bottom:6px;"><span style="flex-shrink:0;">✅</span><div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.55;">${this._esc(fb.gotRight)}</div></div>` : ''}
          ${fb.toImprove ? `<div style="display:flex;gap:8px;"><span style="flex-shrink:0;">🎯</span><div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.55;">${this._esc(fb.toImprove)}</div></div>` : ''}
          ${!fb.gotRight && !fb.toImprove && fb.feedback ? `<div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.55;">${this._esc(fb.feedback)}</div>` : ''}
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="uc-wrapper">
        <div class="uc-header">
          <div class="uc-badge">⬡ Your Teacher's Feedback</div>
          <h3 class="uc-title">Here's what I noticed</h3>
          ${enc ? `<p class="uc-subtitle">${this._esc(enc)}</p>` : ''}
        </div>

        <div class="uc-compare">${cards}</div>

        ${focus.length ? `
          <div class="uc-gap-tip" style="background:var(--accent-soft);border:1px solid var(--accent-dim);">
            <strong>📌 Focus on these as you read:</strong>
            <ul style="margin:8px 0 0;padding-left:18px;">
              ${focus.map(f => `<li style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.6;margin-bottom:4px;">${this._esc(f)}</li>`).join('')}
            </ul>
          </div>` : ''}

        <div style="margin-top:20px;">
          <button class="btn-primary" id="uc-viewnotes-btn" style="width:100%;justify-content:center;padding:14px;">📋 View Notes Now</button><div style="text-align:center;font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-top:8px;">build v63-22</div>
        </div>
      </div>`;

    // Save focus areas to the node so the Notes step / AI can use them
    if (focus.length) {
      this._node.understandingCheck = { ...(this._node.understandingCheck || {}), focusAreas: focus };
      nodeStore.save(this._node);
    }

    document.getElementById('uc-viewnotes-btn').addEventListener('click', () => {
      let advanced = false;
      try {
        if (this._onPass) { this._onPass(); advanced = true; }
      } catch(e) { console.warn('[UnderstandingCheck] onPass failed:', e); }
      if (!advanced && typeof GuidedView !== 'undefined') {
        try { GuidedView._advance(); } catch(e) { console.error('[UnderstandingCheck] advance failed:', e); }
      }
    });
  },

  /* Fallback when no AI — the old static note comparison */
  _showStaticComparison(answers) {
    const node = this._node;
    const container = document.getElementById('step-content');
    const noteAnswers = [
      node.summary || node.definitions?.[0]?.description || 'See your notes below.',
      node.formulas?.map(f => f.constraints).filter(Boolean).join('; ') || 'Check constraints in your notes.',
      node.commonMistakes?.slice(0, 2).join('; ') || 'Check your notes for common mistakes.',
    ];

    const rows = answers.map((a, i) => {
      const has = a.a.length > 0;
      return `
        <div class="uc-compare-row">
          <div class="uc-compare-q">
            <span class="uc-q-num" style="flex-shrink:0;">${i + 1}</span>
            <span style="font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--text-muted);">${this._esc(a.q)}</span>
          </div>
          <div class="uc-compare-cols">
            <div class="uc-compare-col yours">
              <div class="uc-col-label" style="color:${has ? 'var(--green)' : 'var(--text-muted)'};">${has ? '✓' : '○'} Your answer</div>
              <div class="uc-col-text">${has ? this._esc(a.a) : '<em style="color:var(--text-muted)">Not answered</em>'}</div>
            </div>
            <div class="uc-compare-col notes">
              <div class="uc-col-label">📋 From your notes</div>
              <div class="uc-col-text">${this._esc(noteAnswers[i] || 'See notes.')}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="uc-wrapper">
        <div class="uc-header">
          <div class="uc-badge">Gap Analysis</div>
          <h3 class="uc-title">Your answers vs. your notes</h3>
          <p class="uc-subtitle">The gaps you see here are exactly what to focus on as you study now.</p>
        </div>
        <div class="uc-compare">${rows}</div>
        <div class="uc-gap-tip"><strong>Gaps = your highest priority topics.</strong> Keep them in mind as you read the notes.</div>
        <div style="margin-top:20px;">
          <button class="btn-primary" id="uc-viewnotes-btn" style="width:100%;justify-content:center;padding:14px;">📋 View Notes Now</button><div style="text-align:center;font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-top:8px;">build v63-22</div>
        </div>
      </div>`;

    document.getElementById('uc-viewnotes-btn').addEventListener('click', () => {
      let advanced = false;
      try {
        if (this._onPass) { this._onPass(); advanced = true; }
      } catch(e) { console.warn('[UnderstandingCheck] onPass failed:', e); }
      if (!advanced && typeof GuidedView !== 'undefined') {
        try { GuidedView._advance(); } catch(e) { console.error('[UnderstandingCheck] advance failed:', e); }
      }
    });
  },

  _esc: s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
};
