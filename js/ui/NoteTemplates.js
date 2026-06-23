/**
 * NoteTemplates.js
 * Four note-taking method templates for the node editor.
 * Templates change how the note editor and display renders.
 * Stored as node.noteTemplate: 'standard' | 'cornell' | 'outline' | 'feynman'
 */

const NoteTemplates = {

  TEMPLATES: {
    standard: {
      id:    'standard',
      name:  'Standard',
      icon:  '📋',
      desc:  'AI-structured blocks. Best for first reading and reference.',
      badge: null,
    },
    feynman: {
      id:    'feynman',
      name:  'Feynman Method',
      icon:  '💡',
      desc:  'Explain it in plain English as if teaching someone else. Gaps become obvious.',
      badge: '⭐ Best for understanding',
    },
    cornell: {
      id:    'cornell',
      name:  'Cornell Method',
      icon:  '🗒',
      desc:  'Cues column + Notes column + Summary. Good for lecture-style notes.',
      badge: null,
    },
    outline: {
      id:    'outline',
      name:  'Outline Method',
      icon:  '≡',
      desc:  'Hierarchical numbered structure. Good for law, tax, and procedures.',
      badge: null,
    },
  },

  /** Render template picker UI */
  renderPicker(currentTemplate) {
    return `
      <div class="nt-picker">
        ${Object.values(this.TEMPLATES).map(t => `
          <button class="nt-option ${(currentTemplate||'standard') === t.id ? 'active' : ''}"
                  data-template="${t.id}">
            <span class="nt-icon">${t.icon}</span>
            <div>
              <div class="nt-name">${t.name}${t.badge ? ' <span style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:2px 6px;border-radius:10px;vertical-align:middle;">' + t.badge + '</span>' : ''}</div>
              <div class="nt-desc">${t.desc}</div>
            </div>
          </button>`).join('')}
      </div>`;
  },

  /** Render the edit form for a given template */
  renderEditForm(node) {
    const template = node.noteTemplate || 'standard';
    switch (template) {
      case 'cornell':  return this._cornellForm(node);
      case 'outline':  return this._outlineForm(node);
      case 'feynman':  return this._feynmanForm(node);
      default:         return null; // standard uses NodeDetailView's existing form
    }
  },

  /** Render display (read-only) for a given template */
  renderDisplay(node) {
    const template = node.noteTemplate || 'standard';
    switch (template) {
      case 'cornell':  return this._cornellDisplay(node);
      case 'outline':  return this._outlineDisplay(node);
      case 'feynman':  return this._feynmanDisplay(node);
      default:         return null;
    }
  },

  // ─── CORNELL ──────────────────────────────────────────

  _cornellForm(node) {
    const c = node.cornellData || { cues: '', notes: '', summary: '' };
    return `
      <div class="cornell-editor">
        <div class="cornell-top">
          <div class="cornell-cues">
            <div class="cornell-label">🔑 Cues / Keywords</div>
            <textarea id="cn-cues" class="config-input" rows="12"
              placeholder="Key terms, questions, headings…&#10;&#10;e.g.&#10;What is taxable income?&#10;Formula?&#10;Exceptions?"
              style="resize:none;height:100%;font-size:13px;">${this._esc(c.cues)}</textarea>
          </div>
          <div class="cornell-notes">
            <div class="cornell-label">📝 Notes</div>
            <textarea id="cn-notes" class="config-input" rows="12"
              placeholder="Main content — explanations, examples, details…"
              style="resize:none;height:100%;font-size:13px;">${this._esc(c.notes)}</textarea>
          </div>
        </div>
        <div class="cornell-summary">
          <div class="cornell-label">📄 Summary (bottom)</div>
          <textarea id="cn-summary" class="config-input" rows="3"
            placeholder="Summarise the page in 2-3 sentences in your own words…"
            style="resize:none;font-size:13px;">${this._esc(c.summary)}</textarea>
        </div>
      </div>`;
  },

  _cornellDisplay(node) {
    const c = node.cornellData || {};
    if (!c.cues && !c.notes && !c.summary) return '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:13px;">No Cornell notes yet. Click 📐 Adapt Format to generate.</p>';

    // Split cues and notes into individual lines/items for aligned display
    const splitLines = str => (str||'').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const cueLines  = splitLines(c.cues);
    const noteLines = splitLines(c.notes);
    const maxRows   = Math.max(cueLines.length, noteLines.length, 1);

    // Build paired rows so cue and note align side by side
    let rows = '';
    for (let i = 0; i < maxRows; i++) {
      const cue  = cueLines[i]  || '';
      const note = noteLines[i] || '';
      const isLast = i === maxRows - 1;
      rows += '<div class="cn-row' + (isLast ? ' cn-row-last' : '') + '">'
        + '<div class="cn-cue">' + (cue  ? this._esc(cue)  : '') + '</div>'
        + '<div class="cn-note">' + (note ? this._esc(note) : '') + '</div>'
        + '</div>';
    }

    return '<div class="cornell-display">'
      + '<div class="cn-header-row">'
      + '<div class="cornell-label cn-label-cue">🔑 Cues</div>'
      + '<div class="cornell-label cn-label-note">📝 Notes</div>'
      + '</div>'
      + '<div class="cn-body">' + rows + '</div>'
      + (c.summary
          ? '<div class="cornell-summary-display"><div class="cornell-label" style="margin-bottom:10px;">📄 Summary</div><div style="font-family:var(--font-body);font-size:14.5px;line-height:1.75;color:var(--text-primary);">' + this._esc(c.summary) + '</div></div>'
          : '')
      + '</div>';
  },

  saveCornell(node) {
    node.cornellData = {
      cues:    document.getElementById('cn-cues')?.value    || '',
      notes:   document.getElementById('cn-notes')?.value   || '',
      summary: document.getElementById('cn-summary')?.value || '',
    };
  },

  // ─── OUTLINE ──────────────────────────────────────────

  _outlineForm(node) {
    const items = node.outlineData?.items || [{ level:0, text:'' }];
    return `
      <div style="margin-bottom:12px;">
        <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:10px;">
          Use Tab to indent, Shift+Tab to outdent. Each line is a topic level.
        </p>
        <div id="outline-editor" class="outline-editor">
          ${items.map((item,i) => `
            <div class="outline-item" data-level="${item.level}" style="padding-left:${item.level*24}px;">
              <span class="outline-bullet">${this._outlineBullet(item.level)}</span>
              <input type="text" class="outline-input config-input"
                     value="${this._esc(item.text)}"
                     placeholder="${item.level===0?'Main topic':'Sub-point…'}"
                     data-idx="${i}"/>
            </div>`).join('')}
        </div>
        <button class="btn-secondary" id="outline-add-btn" style="margin-top:8px;font-size:12px;padding:7px 14px;">+ Add line</button>
      </div>`;
  },

  _outlineBullet(level) {
    return ['I.','A.','1.','a.','i.'][Math.min(level, 4)];
  },

  _outlineDisplay(node) {
    const items = node.outlineData?.items || [];
    if (!items.length) return '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:13px;">No outline notes yet. Click Edit to add.</p>';
    return `<div class="outline-display">
      ${items.filter(i=>i.text).map(item => `
        <div class="outline-display-item" style="padding-left:${item.level*24}px;">
          <span class="outline-bullet">${this._outlineBullet(item.level)}</span>
          <span>${this._esc(item.text)}</span>
        </div>`).join('')}
    </div>`;
  },

  bindOutlineEditor() {
    const editor = document.getElementById('outline-editor');
    if (!editor) return;

    editor.addEventListener('keydown', e => {
      const input = e.target;
      if (!input.classList.contains('outline-input')) return;
      const item  = input.closest('.outline-item');

      if (e.key === 'Tab') {
        e.preventDefault();
        let level = parseInt(item.dataset.level) || 0;
        level = e.shiftKey ? Math.max(0, level-1) : Math.min(4, level+1);
        item.dataset.level = level;
        item.style.paddingLeft = `${level*24}px`;
        item.querySelector('.outline-bullet').textContent = this._outlineBullet(level);
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const newItem = document.createElement('div');
        const level   = parseInt(item.dataset.level) || 0;
        newItem.className = 'outline-item';
        newItem.dataset.level = level;
        newItem.style.paddingLeft = `${level*24}px`;
        newItem.innerHTML = `<span class="outline-bullet">${this._outlineBullet(level)}</span><input type="text" class="outline-input config-input" placeholder="Sub-point…"/>`;
        item.after(newItem);
        newItem.querySelector('input').focus();
      }
    });

    document.getElementById('outline-add-btn')?.addEventListener('click', () => {
      const newItem = document.createElement('div');
      newItem.className = 'outline-item';
      newItem.dataset.level = 0;
      newItem.innerHTML = `<span class="outline-bullet">I.</span><input type="text" class="outline-input config-input" placeholder="Main topic"/>`;
      editor.appendChild(newItem);
      newItem.querySelector('input').focus();
    });
  },

  saveOutline(node) {
    const items = Array.from(document.querySelectorAll('.outline-item')).map(item => ({
      level: parseInt(item.dataset.level) || 0,
      text:  item.querySelector('input')?.value || '',
    }));
    node.outlineData = { items };
  },

  // ─── FEYNMAN ──────────────────────────────────────────

  _feynmanForm(node) {
    const f = node.feynmanData || { simple:'', gaps:'', refined:'' };
    return `
      <div style="display:flex;flex-direction:column;gap:16px;">

        <div class="feynman-phase">
          <div class="feynman-phase-label">
            <span class="feynman-num">1</span>
            Explain it simply — as if teaching a 12-year-old
          </div>
          <textarea id="fn-simple" class="config-input" rows="5"
            placeholder="In simple terms, ${this._esc(node.title)} is about…"
            style="resize:vertical;">${this._esc(f.simple)}</textarea>
        </div>

        <div class="feynman-phase">
          <div class="feynman-phase-label">
            <span class="feynman-num">2</span>
            Where did you get stuck or use jargon? (your gaps)
          </div>
          <textarea id="fn-gaps" class="config-input" rows="3"
            placeholder="I wasn't sure about… I used a technical word for…"
            style="resize:vertical;">${this._esc(f.gaps)}</textarea>
        </div>

        <div class="feynman-phase">
          <div class="feynman-phase-label">
            <span class="feynman-num">3</span>
            Refined explanation (after reviewing your notes)
          </div>
          <textarea id="fn-refined" class="config-input" rows="5"
            placeholder="Now I understand it as…"
            style="resize:vertical;">${this._esc(f.refined)}</textarea>
        </div>

      </div>`;
  },

  _outlineDisplay(node) {
    const data = node.outlineData || {};
    const text = data.outline || '';
    if (!text) return '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:13px;">No outline yet. Click 📐 Template to generate one.</p>';
    const lines = text.split('\n').filter(l => l.trim());
    const html = lines.map(line => {
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      const level = Math.floor(indent / 2);
      const isMain = /^\d+\./.test(trimmed);
      const isSub  = /^[a-z]\./.test(trimmed);
      const isDetail = /^[ivx]+\./.test(trimmed);
      const style = isMain
        ? 'font-weight:700;color:var(--text-primary);font-size:14px;margin-top:14px;'
        : isSub
          ? 'color:var(--text-secondary);font-size:13px;margin-left:20px;margin-top:4px;'
          : 'color:var(--text-muted);font-size:12px;margin-left:40px;margin-top:2px;';
      return '<div style="font-family:var(--font-body);line-height:1.6;' + style + '">' + this._esc(trimmed) + '</div>';
    }).join('');
    return '<div style="padding:4px 0;">' + html + '</div>';
  },

  /* ── Display for AI-rewritten Feynman ──────────────── */
  _feynmanDisplay(node) {
    const data = node.feynmanData2 || node.feynmanData || {};
    const explanation = data.explanation || data.explanation2 || '';
    const analogies   = data.analogies   || '';
    const gaps        = data.gaps        || '';
    const takeaway    = data.keyTakeaway || data.takeaway || '';
    if (!explanation && !takeaway) return '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:13px;">No Feynman notes yet. Click 📐 Template to generate.</p>';
    let html = '';
    if (explanation) html += '<div style="margin-bottom:18px;"><div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:8px;">💡 Plain Explanation</div><div style="font-family:var(--font-body);font-size:14px;line-height:1.75;color:var(--text-primary);">' + this._esc(explanation) + '</div></div>';
    if (analogies) html += '<div style="margin-bottom:18px;padding:14px 16px;background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);"><div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:6px;">🔗 Analogies</div><div style="font-family:var(--font-body);font-size:13px;line-height:1.65;color:var(--text-secondary);">' + this._esc(analogies) + '</div></div>';
    if (gaps) html += '<div style="margin-bottom:18px;padding:14px 16px;background:var(--red-dim, rgba(255,80,80,0.08));border:1px solid rgba(255,80,80,0.2);border-radius:var(--radius-md);"><div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--red, #ff5050);margin-bottom:6px;">⚠ Knowledge Gaps to Study</div><div style="font-family:var(--font-body);font-size:13px;line-height:1.65;color:var(--text-secondary);">' + this._esc(gaps) + '</div></div>';
    if (takeaway) html += '<div style="padding:14px 16px;background:var(--green-dim);border:1px solid rgba(52,199,123,0.2);border-radius:var(--radius-md);"><div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--green);margin-bottom:6px;">✓ Key Takeaway</div><div style="font-family:var(--font-body);font-size:13px;font-weight:600;line-height:1.65;color:var(--text-primary);">' + this._esc(takeaway) + '</div></div>';
    return html;
  },

    _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
