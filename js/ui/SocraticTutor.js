/**
 * SocraticTutor.js — Socratic tutoring flow
 * Step 1: Ask what's confusing
 * Step 2: Explain the confusing part
 * Step 3: Simplified practice question
 * Step 4: Exam-style question
 * Step 5: Mark and save session summary
 */
const SocraticTutor = {
  _node: null, _example: null, _history: [], _saved: false, _lastChips: [],

  open(node, example) {
    this._node = node; this._example = example; this._history = []; this._saved = false;
    document.getElementById('st-root')?.remove();

    const root = document.createElement('div');
    root.id = 'st-root';
    // Full screen — header fixed, footer fixed, chat fills remaining space
    root.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:var(--bg-base);font-family:var(--font-body);';

    const headerH = '52px';
    const footerH = '130px';

    root.innerHTML =
      // ── HEADER ──────────────────────────────────────────────────
      '<div style="height:' + headerH + ';flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 14px;background:var(--bg-raised);border-bottom:1px solid var(--border);">'
        + '<button id="st-back" style="background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;padding:4px;line-height:1;flex-shrink:0;">←</button>'
        + '<div style="flex:1;min-width:0;">'
          + '<div style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⬡ ' + this._esc(example.title) + '</div>'
          + '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">' + this._esc(node.subject||'') + ' · Step <span id="st-step">1</span>/5</div>'
        + '</div>'
        + '<button id="st-show-q" style="flex-shrink:0;background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:8px;color:var(--accent);font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;font-family:var(--font-mono);">📋 Q</button>'
      + '</div>'

      // ── QUESTION PANEL (hidden by default, slides down) ──────────
      + '<div id="st-qpanel" style="flex-shrink:0;overflow:hidden;max-height:0;transition:max-height 0.3s ease;background:var(--bg-raised);border-bottom:1px solid var(--border);">'
        + '<div style="padding:12px 16px;max-height:40vh;overflow-y:auto;-webkit-overflow-scrolling:touch;">'
          + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:8px;">Question</div>'
          + '<div style="font-size:13.5px;line-height:1.7;color:var(--text-primary);">' + this._esc(example.question) + '</div>'
        + '</div>'
      + '</div>'

      // ── CHAT (fills all remaining space) ─────────────────────────
      + '<div id="st-chat" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px;display:flex;flex-direction:column;gap:12px;min-height:0;"></div>'

      // ── FOOTER (fixed height) ─────────────────────────────────────
      + '<div style="flex-shrink:0;padding:8px 12px 16px;background:var(--bg-raised);border-top:1px solid var(--border);">'
        + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
          + '<textarea id="st-input" rows="2" placeholder="Ask, answer, or say what\'s confusing…" style="flex:1;resize:none;background:var(--bg-base);border:1px solid var(--border);border-radius:12px;color:var(--text-primary);font-size:14px;line-height:1.5;padding:10px 13px;font-family:var(--font-body);"></textarea>'
          + '<button id="st-send" style="align-self:flex-end;background:var(--accent);color:#060709;border:none;border-radius:12px;font-family:var(--font-ui);font-size:14px;font-weight:800;padding:13px 18px;cursor:pointer;">Send</button>'
        + '</div>'
        + '<div id="st-chips" style="display:flex;gap:6px;flex-wrap:wrap;"></div>'
      + '</div>';

    document.body.appendChild(root);

    // Events
    document.getElementById('st-back').onclick = () => this._close();
    document.getElementById('st-send').onclick = () => this._submit();
    document.getElementById('st-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submit(); } };

    document.getElementById('st-show-q').onclick = () => {
      const panel = document.getElementById('st-qpanel');
      const btn   = document.getElementById('st-show-q');
      const open  = panel.style.maxHeight && panel.style.maxHeight !== '0px' && panel.style.maxHeight !== '0';
      panel.style.maxHeight = open ? '0' : '40vh';
      btn.textContent = open ? '📋 Q' : '📋 Hide';
    };

    document.getElementById('st-chips').addEventListener('click', e => {
      const c = e.target.closest('[data-chip]');
      if (c) { document.getElementById('st-input').value = c.dataset.chip; this._submit(); }
    });

    this._opening();
  },

  _opening() {
    this._step_n(1);
    const msg = 'Let\'s work through this together. 🎯\n\nTap **📋 Q** up top to see the question. Tell me where you\'d like to start — or just ask me anything about it.';
    this._ai(msg);
    this._history.push({ role: 'tutor', text: msg });
    this._chips(['Explain the question', 'I don\'t know how to start', 'Show me step by step', 'I\'ll try it myself']);
  },

  async _submit() {
    const inp  = document.getElementById('st-input');
    const text = inp?.value.trim();
    if (!text) return;
    inp.value = '';
    this._chips([]);
    this._student(text);
    this._history.push({ role: 'student', text });
    this._loading(true);
    try {
      await this._turn();
    } catch(e) {
      this._ai('⚠ ' + (e.message || 'Something went wrong'));
    }
    this._loading(false);
  },

  /** One conversational turn: send the running history + a rich tutor brief,
   *  let the model decide what to do, then render + update the soft UI. */
  async _turn() {
    const raw = await this._converse();
    const { text, chips, phase, done } = this._parseControls(raw);
    this._ai(text);
    this._history.push({ role: 'tutor', text });
    if (phase) this._step_n(phase);
    if (done) { this._finish(); return; }
    this._chips(chips && chips.length ? chips : this._defaultChips());
  },

  async _converse() {
    const ctx       = LearnerContext.forSocraticTutor(this._node, this._example);
    const examStyle = this._examStyle();
    const transcript = this._history.slice(-14)
      .map(h => (h.role === 'student' ? 'Student: ' : 'Tutor: ') + h.text).join('\n');

    // The static system prompt: node context + tutor role (cached across turns)
    const systemPrompt = ctx +
`\n\nYou are a warm, sharp one-on-one tutor having a REAL CONVERSATION with a student about the worked example and notes above. This is a conversation, not a script — read what the student actually says each turn and respond to THAT, like a good human tutor would.

Each turn, decide for yourself what helps most right now:
- If they ask a question or for help/guidance, answer it and teach — step by step when that helps.
- If they give a genuine ATTEMPT at the answer, mark it kindly and specifically (what's right, what's missing, the key rule), then offer the next step.
- If they want to practise, give a fitting question (simpler or exam-style as appropriate) and ask them to show their working.
- If they ask for a DIFFERENT method or approach: teach it from their notes if it's there; if it is NOT in their notes (e.g. an abacus/Soroban method, or another algorithm they didn't write down), say plainly "this isn't in your notes, but here's how it works", explain it accurately, then tie it back.
- If they're stuck, give a hint or a simpler version — don't just hand over the full answer.
- Don't re-mark or re-explain things already settled; move the conversation forward.

Rules: For THEIR specific material, teach only from the SOURCE/worked example above — never invent facts about their notes. Outside-knowledge methods are allowed only when asked, and only with the "not in your notes" flag. Be concise: a few short sentences or short numbered steps. Plain text only — no JSON, no markdown tables, no LaTeX; write maths in plain symbols (e.g. "923 - 457 = 466"). Be encouraging and direct, never robotic.${examStyle ? '\n\nThe student\'s exam style: ' + examStyle : ''}`;

    // The dynamic user message: only the transcript + reply instruction changes each turn
    const userMsg =
`CONVERSATION SO FAR:
${transcript}

Write the tutor's reply to the student's latest message.
You MAY end with these control tags on their own lines — they are hidden from the student, never shown:
[[CHIPS: short tap option | another | another]]  (2-4 genuinely useful next-tap suggestions for THIS moment)
[[PHASE: n]]  (n = 1-5, roughly how far along the suggested path: 1 orient, 2 understand, 3 practise, 4 exam-style, 5 wrapping up)
[[DONE]]  (only when the student has clearly succeeded and wants to stop)`;

    return await AIService._callClaudeWithCache(systemPrompt, [{ role: 'user', content: userMsg }], 1000);
  },

  /** Pull optional control tags out of the reply; return cleaned text + UI hints. */
  _parseControls(raw) {
    let text = String(raw || '');
    let chips = null, phase = null, done = false;
    const cm = text.match(/\[\[CHIPS:([^\]]*)\]\]/i);
    if (cm) chips = cm[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
    const pm = text.match(/\[\[PHASE:\s*(\d)\s*\]\]/i);
    if (pm) phase = Math.max(1, Math.min(5, parseInt(pm[1], 10)));
    if (/\[\[DONE\]\]/i.test(text)) done = true;
    text = text.replace(/\[\[CHIPS:[^\]]*\]\]/ig, '')
               .replace(/\[\[PHASE:[^\]]*\]\]/ig, '')
               .replace(/\[\[DONE\]\]/ig, '').trim();
    return { text, chips, phase, done };
  },

  _defaultChips() {
    return ['Explain it simpler', 'Give me a hint', 'Let me try the answer', 'Try a different method'];
  },

  /** Natural finish: save a summary and offer Done / Try another. */
  _finish() {
    this._step_n(5);
    this._saveSummaryFromHistory();
    const chips = document.getElementById('st-chips');
    if (chips) {
      chips.innerHTML =
        '<button id="st-done-btn" style="background:var(--accent);border:none;border-radius:10px;color:#060709;padding:10px 20px;font-family:var(--font-ui);font-size:13px;font-weight:700;cursor:pointer;">✓ Done</button>'
        + '<button id="st-retry-btn" style="background:var(--bg-base);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);padding:10px 18px;font-family:var(--font-ui);font-size:13px;cursor:pointer;">↩ Try another</button>';
      document.getElementById('st-done-btn').onclick  = () => this._close();
      document.getElementById('st-retry-btn').onclick = () => { const nid = this._node?.id; this._close(); setTimeout(() => { if (nid) NodeDetailView.open(nid); }, 100); };
    }
    // Keep the input available — the student can still ask follow-ups.
  },

  _ctx() {
    return LearnerContext.forSocraticTutor(this._node, this._example);
  },

  _examStyle() {
    try {
      const k = 'kn_exam_style_' + (this._node.subject||'').toLowerCase().replace(/\s+/g,'_');
      const d = JSON.parse(localStorage.getItem(k)||'null');
      if (!d?.papers?.length) return null;
      const p = d.papers[d.papers.length-1];
      return (p.analysis?.style||'') + ' — types: ' + (p.analysis?.questionTypes||[]).join(', ');
    } catch { return null; }
  },

  /** Save a session summary from the conversation (most recent student attempt
   *  + tutor reply). Captures its own refs so it is safe even if the session is
   *  closed immediately after. Runs at most once per session. */
  _saveSummaryFromHistory() {
    if (this._saved || !this._node || !this._example) return;
    if (this._history.length < 3) return;   // not enough of a session to log
    this._saved = true;
    const node = this._node, example = this._example;
    const lastStudent = [...this._history].reverse().find(h => h.role === 'student')?.text || '';
    const lastTutor   = [...this._history].reverse().find(h => h.role === 'tutor')?.text || '';
    (async () => {
      try {
        const s = await AIService._callWithFunction('noteProcessing', [{ role:'user',
          content: 'Summarise in 20 words: topic="' + node.title + '", example="' + example.title + '". Student: ' + lastStudent.slice(0,100) + '. Feedback: ' + lastTutor.slice(0,150) + '. What understood and gaps.'
        }], 80);
        if (!node.sessionLog) node.sessionLog = [];
        node.sessionLog.push({ date: new Date().toLocaleDateString(), type:'tutor', example: example.title, summary: s.trim() });
        if (node.sessionLog.length > 30) node.sessionLog = node.sessionLog.slice(-30);
        LearnerMemory.recordTutorSession(node, example.title, s.trim());
        nodeStore.save(node);
      } catch(e) { console.warn('Summary save failed:', e); }
    })();
  },

  // ── UI helpers ─────────────────────────────────────────────────
  _ai(rawText) {
    const chat = document.getElementById('st-chat');
    if (!chat) return;

    // Clean the response — strip JSON fences, extract text from JSON objects
    let text = String(rawText || '').trim();

    // Strip markdown fences
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // If it looks like a JSON object, try to extract the text value
    if (text.startsWith('{')) {
      try {
        const obj = JSON.parse(text);
        // Common keys AI might use
        text = obj.response || obj.text || obj.message || obj.explanation || obj.answer || Object.values(obj)[0] || text;
        text = String(text);
      } catch(e) {
        // Not valid JSON — use as-is but strip braces/quotes
        text = text.replace(/^[{"]|[}"]$/g, '').trim();
      }
    }

    // Convert literal \n sequences to real newlines
    text = text.replace(/\\n/g, '\n');

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;margin-bottom:2px;';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-bottom:5px;font-weight:700;letter-spacing:.04em;display:flex;align-items:center;gap:8px;';
    lbl.innerHTML = '<span>⬡ Tutor</span>'
      + (typeof AICorrections !== 'undefined' && this._node
          ? AICorrections.renderButton('tutor', text)
          : '');
    const bub = document.createElement('div');
    bub.style.cssText = 'max-width:92%;padding:12px 15px;border-radius:4px 16px 16px 16px;background:var(--bg-raised);border:1px solid var(--border);font-size:14px;line-height:1.7;color:var(--text-primary);word-break:break-word;';
    // Render markdown bold and line breaks
    bub.innerHTML = this._esc(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    wrap.appendChild(lbl);
    wrap.appendChild(bub);
    chat.appendChild(wrap);
    if (typeof AICorrections !== 'undefined' && this._node) AICorrections.bindCorrectionButtons(wrap, this._node);
    // Land at the TOP of the tutor's reply once layout settles.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (wrap.scrollIntoView) wrap.scrollIntoView({ block: 'start', behavior: 'auto' });
    }));
  },

  _student(text) {
    const chat = document.getElementById('st-chat');
    if (!chat) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:2px;';
    const bub = document.createElement('div');
    bub.style.cssText = 'max-width:82%;padding:11px 15px;border-radius:16px 16px 4px 16px;background:var(--accent-soft);border:1px solid var(--accent-dim);font-size:14px;line-height:1.65;color:var(--text-primary);word-break:break-word;';
    bub.innerHTML = this._esc(text).replace(/\n/g,'<br>');
    wrap.appendChild(bub);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  },

  _chips(options) {
    this._lastChips = options;
    const area = document.getElementById('st-chips');
    if (!area) return;
    area.innerHTML = options.map(o =>
      '<button data-chip="' + this._esc(o) + '" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:20px;color:var(--text-secondary);cursor:pointer;font-size:12px;padding:5px 13px;white-space:nowrap;">' + this._esc(o) + '</button>'
    ).join('');
  },

  _loading(on) {
    const btn = document.getElementById('st-send');
    if (btn) { btn.textContent = on ? '…' : 'Send'; btn.disabled = on; }
    document.getElementById('st-thinking')?.remove();
    if (on) {
      const d = document.createElement('div');
      d.id = 'st-thinking';
      d.style.cssText = 'color:var(--text-muted);font-family:var(--font-mono);font-size:11px;padding:2px 0;';
      d.textContent = '⬡ Tutor is thinking…';
      const chat = document.getElementById('st-chat');
      if (chat) { chat.appendChild(d); chat.scrollTop = chat.scrollHeight; }
    }
  },

  _step_n(n) {
    const el = document.getElementById('st-step');
    if (el) el.textContent = n;
  },

  _close() {
    this._saveSummaryFromHistory();   // capture the session even if they just leave
    document.getElementById('st-root')?.remove();
    this._node = null; this._example = null; this._history = []; this._saved = false;
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
};
