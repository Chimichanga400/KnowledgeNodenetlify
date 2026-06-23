/**
 * NotesRenderer.js — Final
 * Renders structured procedures (multi-group), definitions with examples, tables
 */
const NotesRenderer = {

  renderFullNotes(node) {
    // If the scan captured the handbook's section order, render in that exact
    // sequence so the digital notes mirror the textbook's flow. Each section type
    // is emitted the first time it's referenced, then skipped afterwards.
    const order = node.sectionOrder;
    if (Array.isArray(order) && order.length) {
      const out = [];
      const done = new Set();
      const emit = kind => {
        if (done.has(kind)) return '';
        done.add(kind);
        switch (kind) {
          case 'definition': return this.renderDefinitions(node.definitions);
          case 'table':      return this.renderTables(node.tables);
          case 'formula':    return this.renderFormulas(node.formulas);
          case 'procedure':  return this.renderProcedures(node.procedures);
          default:           return '';
        }
      };
      order.forEach(b => { const html = emit((b.kind || '').toLowerCase()); if (html) out.push(html); });
      // Append any section types the order map didn't mention, so nothing is lost
      ['definition','table','formula','procedure'].forEach(k => { const html = emit(k); if (html) out.push(html); });
      out.push(this.renderMistakes(node.commonMistakes));
      out.push(this.renderSummary(node.summary));
      out.push(this.renderUserSection(node));
      return out.join('');
    }

    // Fallback: fixed type order (older nodes without a captured sequence)
    return [
      this.renderDefinitions(node.definitions),
      this.renderTables(node.tables),
      this.renderFormulas(node.formulas),
      this.renderProcedures(node.procedures),
      this.renderMistakes(node.commonMistakes),
      this.renderSummary(node.summary),
      this.renderUserSection(node),
    ].join('');
  },

  /* ─── DEFINITIONS with examples ────────────────────── */
  renderDefinitions(defs) {
    if (!defs?.length) return '';
    return '<div class="notes-section" id="section-definitions"><div class="notes-section-title">Key Definitions</div>'
      + defs.map(d => {
          const examples = d.examples?.trim();
          return '<div class="definition-item">'
            + '<div class="definition-term">' + this._esc(d.term) + '</div>'
            + (examples ? '<div class="definition-examples">Examples: ' + this._esc(examples) + '</div>' : '')
            + '<div class="definition-desc">' + this._esc(d.description) + '</div>'
            + '</div>';
        }).join('')
      + '</div>';
  },

  /* ─── TABLES ────────────────────────────────────────── */
  renderTables(tables) {
    if (!tables?.length) return '';
    return tables.map(tbl => {
      const cols = tbl.columns || ['Name','Type','Example'];
      const rows = tbl.rows    || [];
      return '<div class="notes-section" id="section-tables">'
        + '<div class="notes-section-title">' + this._esc(tbl.title || 'Table') + '</div>'
        + '<div class="node-table-wrap"><table class="node-table">'
        + '<thead><tr>' + cols.map(c => '<th>' + this._esc(c) + '</th>').join('') + '</tr></thead>'
        + '<tbody>'
        + (rows.length
            ? rows.map(row => '<tr>' + cols.map((_, ci) => '<td>' + this._esc(row[ci] || '') + '</td>').join('') + '</tr>').join('')
            : '<tr><td colspan="' + cols.length + '" style="text-align:center;color:var(--text-muted);font-style:italic;">No rows yet</td></tr>')
        + '</tbody></table></div></div>';
    }).join('');
  },

  /* ─── FORMULAS ──────────────────────────────────────── */
  renderFormulas(formulas) {
    if (!formulas?.length) return '';
    return '<div class="notes-section" id="section-formulas"><div class="notes-section-title">Formulas &amp; Equations</div>'
      + formulas.map(f =>
          '<div class="formula-block">'
          + '<div class="formula-expr">'   + this._esc(f.expression)  + '</div>'
          + '<div class="formula-desc">'   + this._esc(f.description) + '</div>'
          + (f.constraints ? '<div class="formula-constraints">Constraints: ' + this._esc(f.constraints) + '</div>' : '')
          + '</div>'
        ).join('')
      + '</div>';
  },

  /* ─── PROCEDURES — structured multi-group ────────────── */
  renderProcedures(procedures) {
    if (!procedures?.length) return '';
    return '<div class="notes-section" id="section-procedures"><div class="notes-section-title">Procedures</div>'
      + procedures.map((proc, idx) => {
          const steps = proc.steps || [];
          const notes = proc.notes?.trim();
          const appliesTo = proc.appliesTo?.trim();
          return '<details class="proc-card">'
            + '<summary class="proc-card-summary">'
            + '<span class="proc-card-num">' + (idx + 1) + '</span>'
            + '<span class="proc-card-title">' + this._esc(proc.title || 'Procedure') + '</span>'
            + (appliesTo ? '<span class="proc-card-applies">Applies to: ' + this._esc(appliesTo) + '</span>' : '')
            + '</summary>'
            + '<div class="proc-card-body">'
            + (steps.length
                ? steps.map((s, i) => '<div class="procedure-step"><div class="procedure-num">' + (i+1) + '</div><div class="procedure-text">' + this._esc(s) + '</div></div>').join('')
                : '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;">No steps yet.</p>')
            + (notes
                ? '<div class="proc-notes-section"><div class="proc-notes-title">📌 Notes &amp; Reminders</div><div class="proc-notes-text">' + this._esc(notes) + '</div></div>'
                : '')
            + '</div></details>';
        }).join('')
      + '</div>';
  },

  /* ─── MISTAKES ──────────────────────────────────────── */
  renderMistakes(mistakes) {
    if (!mistakes?.length) return '';
    return '<div class="notes-section" id="section-mistakes"><div class="notes-section-title">Common Mistakes</div>'
      + mistakes.map(m => '<div class="mistake-item">' + this._esc(m) + '</div>').join('')
      + '</div>';
  },

  /* ─── SUMMARY ───────────────────────────────────────── */
  renderSummary(summary) {
    if (!summary) return '';
    return '<div class="notes-section" id="section-summary"><div class="notes-section-title">Summary</div><div class="summary-block">' + this._esc(summary) + '</div></div>';
  },

  /* ─── USER NOTES + IMAGES ───────────────────────────── */
  renderUserSection(node) {
    const hasNotes  = node.userNotes?.trim();
    const hasImages = node.userImages?.length;
    if (!hasNotes && !hasImages) return '';
    let html = '<div class="notes-section" id="section-usernotes"><div class="notes-section-title">My Notes</div>';
    if (hasImages) {
      html += '<div class="user-images-area">';
      (node.userImages || []).forEach(img => {
        html += ImageResponseBlock.render(img, node, false);
      });
      html += '</div>';
    }
    if (hasNotes) html += '<div class="user-notes-block" style="margin-top:' + (hasImages ? '16px' : '0') + ';">' + this._esc(node.userNotes) + '</div>';
    html += '</div>';
    return html;
  },

  /* ─── QUESTIONS ─────────────────────────────────────── */
  renderQuestions(questions) {
    if (!questions?.length) return '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:13px;">No questions.</p>';
    const recall = questions.filter(q => q.type === 'recall');
    const apply  = questions.filter(q => q.type === 'application');
    return [
      recall.length ? '<div class="notes-section"><div class="notes-section-title">Recall Questions</div>'   + recall.map(q => this._qCard(q)).join('') + '</div>' : '',
      apply.length  ? '<div class="notes-section"><div class="notes-section-title">Application Questions</div>' + apply.map(q => this._qCard(q)).join('') + '</div>' : '',
    ].join('');
  },

  _qCard(q) {
    return '<div class="question-card" data-qid="' + q.id + '">'
      + '<div class="question-label">' + (q.type === 'recall' ? '🔁 Recall' : '🧩 Application') + '</div>'
      + '<div class="question-text">'  + this._esc(q.question) + '</div>'
      + '<button class="question-answer-toggle" onclick="NotesRenderer._toggleAnswer(this)">Show Answer</button>'
      + '<div class="question-answer hidden">' + this._esc(q.answer) + '</div>'
      + '</div>';
  },

  _toggleAnswer(btn) {
    const ans = btn.closest('.question-card').querySelector('.question-answer');
    const vis = !ans.classList.contains('hidden');
    ans.classList.toggle('hidden', vis);
    btn.textContent = vis ? 'Show Answer' : 'Hide Answer';
  },

  renderSummaryText(summary) { return this.renderSummary(summary); },

  _esc(s = '') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
