/**
 * BlockEngine.js — The Adaptive Canvas core
 *
 * A node renders as an ordered list of blocks. Each block type has:
 *   render(block, node) → HTML string
 *   (optional) static behaviours wired via the global BlockEngine.* fns
 *
 * Block types:
 *   prose, callout, definition, table, formula, procedure  (static/legacy)
 *   code        — runnable SQL/JS sandbox (in-browser, sql.js for SQL)
 *   calc        — interactive calculator (formula or progressive brackets)
 *   webpreview  — live HTML/CSS/JS preview in a sandboxed iframe
 *   quiz        — multiple-choice with feedback
 *   match       — drag/tap matching game (kids)
 *   diagram     — simple horizontal flow
 *   flashcards  — quick self-test cards
 *
 * All execution is in-browser. The AI only chooses WHICH blocks to emit.
 */
const BlockEngine = {
  _sqlPromise: null,          // memoised sql.js init
  _state: {},                 // per-block transient runtime state

  esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  },

  // prose/callout blocks carry AI-generated HTML built from the user's source,
  // which could be a photographed/shared page — so a prompt-injection in the
  // source must not become live markup. Run it through the allowlist Sanitizer;
  // if that module isn't present, fail safe by escaping everything.
  _safeHtml(html) {
    if (html == null) return '';
    return (typeof Sanitizer !== 'undefined') ? Sanitizer.clean(html) : this.esc(html);
  },

  /** Render an entire node's block list. */
  renderNode(node) {
    if (!node.blocks?.length) return '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;">This node has no blocks yet. Use “＋ Add block” below.</p>';
    return node.blocks.map(b => this.renderBlock(b, node)).join('');
  },

  /** Render a single block with its chrome (move/edit/delete controls). */
  renderBlock(block, node) {
    const r = this._renderers[block.type];
    const inner = r ? r.call(this, block, node) : this._renderers.prose.call(this, { ...block, html: '⚠ Unknown block type: ' + block.type }, node);
    return `<div class="kn-block" data-block-id="${block.id}" data-block-type="${block.type}">
      <div class="kn-block-controls">
        <button class="kn-bc" title="Move up"   onclick="BlockEngine.move('${node.id}','${block.id}',-1)">▲</button>
        <button class="kn-bc" title="Move down" onclick="BlockEngine.move('${node.id}','${block.id}',1)">▼</button>
        <button class="kn-bc" title="Delete"    onclick="BlockEngine.del('${node.id}','${block.id}')">✕</button>
      </div>
      ${inner}
    </div>`;
  },

  _shell(kind, title, inner, accent) {
    const ac = accent ? ` style="--blk-accent:${accent}"` : '';
    return `<div class="kn-blk-inner"${ac}>
      <div class="kn-blk-head"><span class="kn-blk-kind">${this.esc(kind)}</span>${title ? `<span class="kn-blk-title">${this.esc(title)}</span>` : ''}</div>
      <div class="kn-blk-body">${inner}</div></div>`;
  },

  /* ════════════════════════════════════════════════════
     RENDERERS
  ════════════════════════════════════════════════════ */
  _renderers: {
    prose(b) {
      return this._shell('text', b.title, `<div class="kn-prose">${this._safeHtml(b.html)}</div>`);
    },
    callout(b) {
      const tone = b.tone === 'warn' ? 'var(--red)' : 'var(--accent)';
      return this._shell(b.tone === 'warn' ? 'caution' : 'tip', b.title || 'Note',
        `<div class="kn-callout" style="border-color:${tone}">${this._safeHtml(b.html)}</div>`);
    },
    definition(b) {
      const items = (b.items || []).map(d => {
        const corBtn = (typeof AICorrections !== 'undefined')
          ? AICorrections.renderButton('definition', d.term + ': ' + d.description)
          : '';
        return `<div class="kn-def">
          <div class="kn-def-term" style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span>${this.esc(d.term)}</span>
            ${corBtn}
          </div>
          ${d.examples ? `<div class="kn-def-ex">Examples: ${this.esc(d.examples)}</div>` : ''}
          <div class="kn-def-desc">${this.esc(d.description)}</div></div>`;
      }).join('');
      return this._shell('definitions', b.title || 'Definitions', items);
    },
    table(b) {
      const cols = b.columns || [];
      const head = '<tr>' + cols.map(c => `<th>${this.esc(c)}</th>`).join('') + '</tr>';
      const body = (b.rows || []).map(r => '<tr>' + cols.map((_, i) => `<td>${this.esc(r[i] || '')}</td>`).join('') + '</tr>').join('');
      return this._shell('table', b.title || 'Table',
        `<div class="kn-table-wrap"><table class="kn-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
    },
    formula(b) {
      const items = (b.items || []).map(f => `<div class="kn-formula">
        <div class="kn-formula-expr">${this.esc(f.expression)}</div>
        <div class="kn-formula-desc">${this.esc(f.description)}</div>
        ${f.constraints ? `<div class="kn-formula-con">Constraints: ${this.esc(f.constraints)}</div>` : ''}</div>`).join('');
      return this._shell('formulas', b.title || 'Formulas', items);
    },
    procedure(b) {
      const steps = (b.steps || []).map(s => `<li>${this.esc(s)}</li>`).join('');
      return this._shell('procedure', b.title || 'Procedure',
        `${b.appliesTo ? `<div class="kn-applies">Applies to: ${this.esc(b.appliesTo)}</div>` : ''}
         <ol class="kn-steps">${steps}</ol>
         ${b.notes ? `<div class="kn-proc-notes">${this.esc(b.notes)}</div>` : ''}`);
    },

    /* ── DYNAMIC: runnable code ── */
    code(b) {
      const id = b.id;
      this._state[id] = { orig: b.code, setup: b.setup || '', lang: b.lang };
      return this._shell(b.lang + ' · runnable', b.title || 'Try it', `
        <textarea class="kn-editor" id="kn_ed_${id}" spellcheck="false">${this.esc(b.code)}</textarea>
        <div class="kn-run-row">
          <button class="kn-btn kn-btn-go" onclick="BlockEngine.runCode('${id}')">▶ Run ${b.lang.toUpperCase()}</button>
          <button class="kn-btn kn-btn-ghost" onclick="BlockEngine.resetCode('${id}')">Reset</button>
          <span class="kn-run-hint">${b.lang === 'sql' ? 'runs against a sample DB in your browser' : 'runs in your browser'}</span>
        </div>
        <div class="kn-out" id="kn_out_${id}" style="display:none">
          <div class="kn-out-label">Output</div>
          <div class="kn-out-body" id="kn_outbody_${id}"></div>
        </div>`);
    },

    /* ── DYNAMIC: interactive calculator ── */
    calc(b) {
      const id = b.id;
      this._state[id] = b;
      const inputs = b.inputs || [];
      if (!inputs.length || !b.formula) {
        return this._shell('interactive', b.title || 'Calculator',
          `<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;padding:8px 0;">No inputs configured. Delete this block and add a new Calculator — it will auto-generate from your formulas.</p>`);
      }
      const fields = inputs.map(f =>
        `<div class="kn-calc-row"><label>${this.esc(f.label || f.key)}</label>
         <input type="number" data-key="${f.key}" value="${f.default ?? 0}" oninput="BlockEngine.recalc('${id}')"></div>`).join('');
      setTimeout(() => this.recalc(id), 0);
      return this._shell('interactive', b.title || 'Calculator', `
        <div class="kn-calc-grid">${fields}</div>
        <div class="kn-calc-result"><div class="kn-calc-lab">${this.esc(b.resultLabel || 'Result')}</div>
          <div class="kn-calc-val" id="kn_calcval_${id}">—</div>
          <div class="kn-calc-break" id="kn_calcbreak_${id}"></div></div>`);
    },

    /* ── DYNAMIC: live web preview ── */
    webpreview(b) {
      const id = b.id;
      this._state[id] = { orig: b.code };
      setTimeout(() => this.renderWeb(id), 0);
      return this._shell('live preview', b.title || 'Live preview', `
        <div class="kn-split">
          <textarea class="kn-editor" id="kn_web_${id}" spellcheck="false" oninput="BlockEngine.renderWeb('${id}')">${this.esc(b.code)}</textarea>
          <iframe class="kn-frame" id="kn_frame_${id}" sandbox="allow-scripts"></iframe>
        </div>
        <div class="kn-run-row"><span class="kn-run-hint">edit on the left — preview updates live</span>
          <button class="kn-btn kn-btn-ghost" onclick="BlockEngine.resetCode('${id}','web')">Reset</button></div>`);
    },

    /* ── DYNAMIC: quiz ── */
    quiz(b) {
      const id = b.id;
      this._state[id] = b;
      const opts = (b.options || []).map((o, i) =>
        `<button class="kn-quiz-opt" onclick="BlockEngine.answerQuiz('${id}',${i})">${this.esc(o)}</button>`).join('');
      return this._shell('check', b.title || 'Quick check',
        `<div class="kn-quiz-q">${this.esc(b.q)}</div><div id="kn_qopts_${id}">${opts}</div><div id="kn_qfb_${id}"></div>`);
    },

    /* ── DYNAMIC: cloze / fill-in-the-blank (active recall) ── */
    cloze(b) {
      const id = b.id;
      // text contains {{answer}} markers; each becomes a typed input.
      const answers = [];
      const segments = String(b.text || '').split(/(\{\{[^}]+\}\})/g).map(seg => {
        const m = seg.match(/^\{\{([^}]+)\}\}$/);
        if (!m) return this.esc(seg);
        const i = answers.length;
        answers.push(m[1].trim());
        return `<input class="kn-cloze-input" id="kn_cloze_${id}_${i}" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="?" />`;
      }).join('');
      this._state[id] = { answers, checked: false };
      return this._shell('recall', b.title || 'Fill in the blanks',
        `<div class="kn-cloze-text">${segments}</div>`
        + `<div class="kn-cloze-actions">`
        + `<button class="kn-btn kn-btn-go" onclick="BlockEngine.checkCloze('${id}')">Check</button>`
        + `<button class="kn-btn" onclick="BlockEngine.revealCloze('${id}')">Reveal</button>`
        + `</div><div id="kn_cloze_fb_${id}" class="kn-cloze-fb"></div>`);
    },

    /* ── DYNAMIC: match game ── */
    match(b) {
      const id = b.id;
      const pairs = b.pairs || [];
      this._state[id] = { pairs, sel: null, done: 0 };
      const shuf = arr => arr.map(v => [Math.random(), v]).sort((a, c) => a[0] - c[0]).map(p => p[1]);
      const left = pairs.map((p, i) => `<div class="kn-match-item" data-side="L" data-i="${i}" onclick="BlockEngine.matchPick('${id}','L',${i})">${this.esc(p[0])}</div>`).join('');
      const right = shuf(pairs.map((p, i) => ({ i, t: p[1] }))).map(o => `<div class="kn-match-item" data-side="R" data-i="${o.i}" onclick="BlockEngine.matchPick('${id}','R',${o.i})">${this.esc(o.t)}</div>`).join('');
      return this._shell('game', b.title || 'Match them up!',
        `<div class="kn-match-wrap" id="kn_match_${id}"><div class="kn-match-col">${left}</div><div class="kn-match-col">${right}</div></div>`);
    },

    /* ── diagram ── */
    diagram(b) {
      const steps = (b.steps || []).map((s, i) =>
        `<div class="kn-flownode">${this.esc(s)}</div>${i < b.steps.length - 1 ? '<span class="kn-flowarrow">→</span>' : ''}`).join('');
      return this._shell('diagram', b.title || 'Flow', `<div class="kn-flowbox">${steps}</div>`);
    },

    /* ── flashcards ── */
    flashcards(b) {
      const id = b.id;
      this._state[id] = { cards: b.cards || [], i: 0, flipped: false };
      setTimeout(() => this.renderCard(id), 0);
      return this._shell('flashcards', b.title || 'Flashcards',
        `<div class="kn-card" id="kn_card_${id}" onclick="BlockEngine.flipCard('${id}')"></div>
         <div class="kn-run-row"><button class="kn-btn kn-btn-ghost" onclick="BlockEngine.nextCard('${id}')">Next ▶</button>
           <span class="kn-run-hint" id="kn_cardcount_${id}"></span></div>`);
    },
  },

  /* ════════════════════════════════════════════════════
     BEHAVIOURS
  ════════════════════════════════════════════════════ */

  /* sql.js — lazy, memoised */
  _initSql() {
    if (this._sqlPromise) return this._sqlPromise;
    this._sqlPromise = (async () => {
      if (typeof initSqlJs === 'undefined') throw new Error('SQL engine not loaded. Check your connection.');
      return await initSqlJs({ locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/' + f });
    })();
    return this._sqlPromise;
  },

  async runCode(id) {
    const st = this._state[id];
    const code = document.getElementById('kn_ed_' + id).value;
    const out = document.getElementById('kn_out_' + id);
    const body = document.getElementById('kn_outbody_' + id);
    out.style.display = 'block'; body.classList.remove('err');

    if (st.lang === 'sql') {
      body.innerHTML = '<span class="kn-spin"></span> loading database…';
      try {
        const SQL = await this._initSql();
        const db = new SQL.Database();
        if (st.setup) db.run(st.setup);
        const res = db.exec(code);
        if (!res.length) { body.textContent = '✓ Query ran. No rows returned.'; db.close(); return; }
        const t = res[0];
        let html = '<table class="kn-res"><thead><tr>' + t.columns.map(c => `<th>${this.esc(c)}</th>`).join('') + '</tr></thead><tbody>';
        html += t.values.map(r => '<tr>' + r.map(v => `<td>${this.esc(v)}</td>`).join('') + '</tr>').join('');
        body.innerHTML = html + '</tbody></table>';
        db.close();
      } catch (e) { body.classList.add('err'); body.textContent = '✗ ' + e.message; }
    } else { // js
      try {
        const log = [];
        const orig = console.log;
        console.log = (...a) => { log.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' ')); orig(...a); };
        let ret;
        try { ret = Function('"use strict";return (function(){' + code + '})()')(); }
        finally { console.log = orig; }
        const txt = (log.join('\n') + (ret !== undefined ? '\n⇒ ' + (typeof ret === 'object' ? JSON.stringify(ret) : ret) : '')).trim();
        body.textContent = txt || '✓ ran (no output)';
      } catch (e) { body.classList.add('err'); body.textContent = '✗ ' + e.message; }
    }
  },
  resetCode(id, kind) {
    const st = this._state[id];
    if (kind === 'web') { document.getElementById('kn_web_' + id).value = st.orig; this.renderWeb(id); }
    else { document.getElementById('kn_ed_' + id).value = st.orig; }
  },

  recalc(id) {
    const b = this._state[id];
    const wrap = document.getElementById('kn_calcval_' + id)?.closest('.kn-block');
    if (!wrap) return;
    const inputs = {};
    wrap.querySelectorAll('input[data-key]').forEach(el => inputs[el.dataset.key] = parseFloat(el.value) || 0);
    let val, breakdown = [];
    if (b.brackets) {
      let income = inputs.income, tax = 0;
      b.brackets.forEach(([lo, hi, rate]) => {
        if (income > lo) {
          const slice = Math.min(income, hi) - lo, t = slice * rate; tax += t;
          if (slice > 0) breakdown.push([`${lo.toLocaleString()}–${hi > 1e8 ? '+' : hi.toLocaleString()} @ ${rate * 100}%`, Math.round(t).toLocaleString()]);
        }
      });
      val = (b.currency || 'R') + Math.round(tax).toLocaleString();
      breakdown.push(['Effective rate', income ? (tax / income * 100).toFixed(1) + '%' : '0%']);
    } else {
      try {
        val = Function(...Object.keys(inputs), 'return (' + b.formula + ')')(...Object.values(inputs));
        if (typeof val === 'number') val = (Math.round(val * 100) / 100) + (b.unit || '');
      } catch (e) { val = '—'; }
      breakdown = b.breakdownSteps ? b.breakdownSteps.map(s => {
        try { return [s.label, Function(...Object.keys(inputs), 'return (' + s.expr + ')')(...Object.values(inputs))]; }
        catch { return [s.label, '—']; }
      }) : [];
    }
    document.getElementById('kn_calcval_' + id).textContent = val;
    document.getElementById('kn_calcbreak_' + id).innerHTML =
      breakdown.map(([k, v]) => `<div class="kn-calc-step"><span>${this.esc(k)}</span><span>${this.esc(v)}</span></div>`).join('');
  },

  renderWeb(id) {
    const ta = document.getElementById('kn_web_' + id);
    const frame = document.getElementById('kn_frame_' + id);
    if (!ta || !frame) return;
    frame.srcdoc = ta.value;
  },

  answerQuiz(id, i) {
    const b = this._state[id];
    const opts = document.querySelectorAll('#kn_qopts_' + id + ' .kn-quiz-opt');
    opts.forEach((o, j) => {
      o.onclick = null;
      if (j === b.answer) o.classList.add('correct');
      if (j === i && i !== b.answer) o.classList.add('wrong');
    });
    document.getElementById('kn_qfb_' + id).innerHTML =
      `<div class="kn-quiz-fb">${i === b.answer ? '✓ ' : '✗ '}${this.esc(b.fb || '')}</div>`;
  },

  /** Normalize for forgiving comparison: case, surrounding space, trailing punctuation. */
  _normCloze(s) {
    return String(s ?? '').trim().toLowerCase().replace(/[.,;:!?]+$/, '').replace(/\s+/g, ' ');
  },

  checkCloze(id) {
    const st = this._state[id];
    if (!st) return;
    let correct = 0;
    st.answers.forEach((ans, i) => {
      const inp = document.getElementById('kn_cloze_' + id + '_' + i);
      if (!inp) return;
      // Accept any of several acceptable answers separated by | in the source marker.
      const accepted = ans.split('|').map(a => this._normCloze(a));
      const ok = accepted.includes(this._normCloze(inp.value));
      inp.classList.remove('correct', 'wrong');
      inp.classList.add(ok ? 'correct' : 'wrong');
      if (ok) correct++;
    });
    st.checked = true;
    const total = st.answers.length;
    const fb = document.getElementById('kn_cloze_fb_' + id);
    if (fb) {
      const all = correct === total;
      fb.innerHTML = `<span class="${all ? 'kn-cloze-win' : 'kn-cloze-partial'}">`
        + `${all ? '✓' : ''} ${correct} / ${total} correct`
        + `${all ? '' : ' — tap Reveal to see the answers, then try again'}</span>`;
    }
  },

  revealCloze(id) {
    const st = this._state[id];
    if (!st) return;
    st.answers.forEach((ans, i) => {
      const inp = document.getElementById('kn_cloze_' + id + '_' + i);
      if (!inp) return;
      // Show the first acceptable answer.
      inp.value = ans.split('|')[0].trim();
      inp.classList.remove('wrong');
      inp.classList.add('revealed');
    });
    const fb = document.getElementById('kn_cloze_fb_' + id);
    if (fb) fb.innerHTML = '<span class="kn-cloze-partial">Answers shown — clear them and test yourself again.</span>';
  },

  matchPick(id, side, i) {
    const st = this._state[id];
    const wrap = document.getElementById('kn_match_' + id);
    const el = wrap.querySelector(`[data-side="${side}"][data-i="${i}"]`);
    if (el.classList.contains('done')) return;
    if (!st.sel) { st.sel = { side, i, el }; el.classList.add('sel'); return; }
    if (st.sel.side === side) { st.sel.el.classList.remove('sel'); st.sel = { side, i, el }; el.classList.add('sel'); return; }
    if (st.sel.i === i) {
      st.sel.el.classList.remove('sel'); st.sel.el.classList.add('done'); el.classList.add('done'); st.done++;
      if (st.done === st.pairs.length)
        setTimeout(() => wrap.insertAdjacentHTML('afterend', '<div class="kn-quiz-fb" style="margin-top:10px">🎉 You matched them all! Great job!</div>'), 200);
    } else {
      const a = st.sel.el; a.classList.add('wrong'); el.classList.add('wrong');
      setTimeout(() => { a.classList.remove('wrong', 'sel'); el.classList.remove('wrong'); }, 500);
    }
    st.sel = null;
  },

  renderCard(id) {
    const st = this._state[id];
    const c = st.cards[st.i]; if (!c) return;
    const card = document.getElementById('kn_card_' + id);
    const count = document.getElementById('kn_cardcount_' + id);
    if (!card) return;
    card.innerHTML =
      `<div class="kn-card-face">${this.esc(st.flipped ? c.back : c.front)}</div>
       <div class="kn-card-hint">${st.flipped ? 'answer' : 'tap to flip'}</div>`;
    if (count) count.textContent = `${st.i + 1} / ${st.cards.length}`;
  },
  flipCard(id) { this._state[id].flipped = !this._state[id].flipped; this.renderCard(id); },
  nextCard(id) { const st = this._state[id]; st.i = (st.i + 1) % st.cards.length; st.flipped = false; this.renderCard(id); },

  /* ── block management (delegates to NodeDetailView for re-render) ── */
  move(nodeId, blockId, dir) {
    const node = nodeStore.get(nodeId); if (!node) return;
    node.moveBlock(blockId, dir); nodeStore.save(node);
    try { NodeDetailView._rerenderBlocks(); } catch(e) {}
  },
  del(nodeId, blockId) {
    const node = nodeStore.get(nodeId); if (!node) return;
    node.removeBlock(blockId); nodeStore.save(node);
    try { NodeDetailView._rerenderBlocks(); } catch(e) {}
  },
};
