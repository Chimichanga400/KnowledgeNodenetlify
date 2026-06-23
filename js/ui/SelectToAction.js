/**
 * SelectToAction.js — Final
 * Desktop: floating toolbar with Recall, Apply, Define, Highlight, + Question (quick add)
 * Mobile: bottom bar (avoids Samsung conflict)
 */

const SelectToAction = {
  _toolbar:     null,
  _mobileBar:   null,
  _currentNode: null,
  _selectedText:'',
  _isMobile:    false,

  init() {
    this._toolbar  = document.getElementById('select-toolbar');
    this._isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (this._isMobile) this._initMobileBar();
    else this._initDesktop();
  },

  setNode(node) { this._currentNode = node; },

  _initDesktop() {
    document.addEventListener('mouseup', e => {
      if (this._toolbar?.contains(e.target)) return;
      setTimeout(() => this._checkSelection(), 10);
    });
    document.addEventListener('mousedown', e => {
      if (!this._toolbar?.contains(e.target)) this._hide();
    });
    this._bindButtons();
  },

  _checkSelection() {
    const sel  = window.getSelection();
    const text = sel?.toString().trim();
    const inNotes = sel?.anchorNode?.parentElement?.closest(
      '#notes-display,.step-content,.detail-body,.user-notes-block,.summary-block,.definition-desc,.procedure-text'
    );
    if (!text || text.length < 3 || !inNotes) { this._hide(); return; }
    this._selectedText = text;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    this._showDesktop(rect);
  },

  _showDesktop(rect) {
    if (!this._toolbar) return;
    this._toolbar.classList.remove('hidden');
    const top  = rect.top  + window.scrollY - this._toolbar.offsetHeight - 10;
    const left = rect.left + window.scrollX + rect.width / 2 - 130;
    this._toolbar.style.top  = Math.max(8, top) + 'px';
    this._toolbar.style.left = Math.max(8, Math.min(window.innerWidth - 280, left)) + 'px';
  },

  _hide() {
    this._toolbar?.classList.add('hidden');
    this._mobileBar?.classList.add('hidden');
    this._selectedText = '';
  },

  _bindButtons() {
    document.getElementById('sel-recall')     ?.addEventListener('click', () => this._createItem('recall'));
    document.getElementById('sel-apply')      ?.addEventListener('click', () => this._createItem('application'));
    document.getElementById('sel-define')     ?.addEventListener('click', () => this._createItem('definition'));
    document.getElementById('sel-highlight')  ?.addEventListener('click', () => this._highlightSelection());
    document.getElementById('sel-question')   ?.addEventListener('click', () => this._quickQuestion());
    document.getElementById('sel-correct')    ?.addEventListener('click', () => this._correctAI());
  },

  _correctAI() {
    const text = this._selectedText;
    this._hide();
    if (!this._currentNode) { Toast.info('Open a node first.'); return; }
    if (typeof AICorrections === 'undefined') { Toast.error('AI Corrections not loaded.'); return; }
    AICorrections.promptUser(this._currentNode, 'content', text);
  },

  _initMobileBar() {
    this._mobileBar = document.createElement('div');
    this._mobileBar.id = 'mobile-select-bar';
    this._mobileBar.className = 'mobile-select-bar hidden';
    this._mobileBar.innerHTML = `
      <div class="msb-title">With selected text:</div>
      <div class="msb-btns">
        <button class="msb-btn" id="msb-recall">🔁 Recall</button>
        <button class="msb-btn" id="msb-apply">🧩 Apply</button>
        <button class="msb-btn" id="msb-define">📖 Define</button>
        <button class="msb-btn" id="msb-question">❓ Question</button>
        <button class="msb-btn" id="msb-correct" title="Correct the AI on this text">✏️ Correct AI</button>
        <button class="msb-btn" id="msb-close" style="flex:0;padding:10px 14px;">✕</button>
      </div>`;
    document.body.appendChild(this._mobileBar);
    document.getElementById('msb-recall')   ?.addEventListener('click', () => this._createItem('recall'));
    document.getElementById('msb-apply')    ?.addEventListener('click', () => this._createItem('application'));
    document.getElementById('msb-define')   ?.addEventListener('click', () => this._createItem('definition'));
    document.getElementById('msb-question') ?.addEventListener('click', () => this._quickQuestion());
    document.getElementById('msb-correct')  ?.addEventListener('click', () => this._correctAI());
    document.getElementById('msb-close')    ?.addEventListener('click', () => this._hide());

    document.addEventListener('selectionchange', () => {
      clearTimeout(this._selTimer);
      this._selTimer = setTimeout(() => {
        const sel  = window.getSelection();
        const text = sel?.toString().trim();
        const inNotes = sel?.anchorNode?.parentElement?.closest('#notes-display,.step-content,.detail-body');
        if (text && text.length >= 3 && inNotes) {
          this._selectedText = text;
          this._mobileBar?.classList.remove('hidden');
        } else if (!text) {
          this._mobileBar?.classList.add('hidden');
        }
      }, 300);
    });
  },

  /* ─── Quick Question — picks type automatically ─── */
  _quickQuestion() {
    const text = this._selectedText;
    this._hide();
    if (!this._currentNode || !text) { Toast.info('Open a node first.'); return; }

    // Auto-detect type: if text contains numbers/formulas → application, otherwise recall
    const hasNumbers = /\d|=|formula|calculate|compute|apply/i.test(text);
    const type = hasNumbers ? 'application' : 'recall';

    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:16px;">Quick Question</h2>
      <div style="background:var(--bg-raised);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;font-family:var(--font-body);font-size:13px;color:var(--text-secondary);font-style:italic;">
        "${this._esc(text.slice(0,100))}${text.length>100?'…':''}"
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="mode-btn ${type==='recall'?'active':''}" id="qt-recall-btn">🔁 Recall</button>
        <button class="mode-btn ${type==='application'?'active':''}" id="qt-apply-btn">🧩 Application</button>
      </div>
      <div class="config-row" style="margin-bottom:12px;">
        <label class="config-label">Question</label>
        <textarea id="qt-question" class="config-input" rows="2" style="resize:vertical;"
          placeholder="What is…? Define…? How would you…?"></textarea>
      </div>
      <div class="config-row" style="margin-bottom:16px;">
        <label class="config-label">Answer</label>
        <textarea id="qt-answer" class="config-input" rows="3" style="resize:vertical;">${this._esc(text)}</textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary" id="qt-save-btn">Add Question</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>`);

    setTimeout(() => {
      let selectedType = type;
      document.getElementById('qt-recall-btn')?.addEventListener('click', () => {
        selectedType = 'recall';
        document.getElementById('qt-recall-btn').classList.add('active');
        document.getElementById('qt-apply-btn').classList.remove('active');
      });
      document.getElementById('qt-apply-btn')?.addEventListener('click', () => {
        selectedType = 'application';
        document.getElementById('qt-apply-btn').classList.add('active');
        document.getElementById('qt-recall-btn').classList.remove('active');
      });
      document.getElementById('qt-question')?.focus();
      document.getElementById('qt-save-btn')?.addEventListener('click', () => {
        const question = document.getElementById('qt-question').value.trim();
        const answer   = document.getElementById('qt-answer').value.trim();
        if (!question||!answer) { Toast.error('Fill in both fields.'); return; }
        this._currentNode.questions.push({ id:KnowledgeNode._generateQuestionId(), type:selectedType, question, answer });
        nodeStore.save(this._currentNode);
        Modal.close();
        Toast.success('Question added!');
        if (NodeDetailView._currentNode?.id === this._currentNode.id && NodeDetailView._currentSection === 'questions') NodeDetailView._renderSection();
      });
    }, 0);
  },

  /* ─── Create definition or typed question ─── */
  _createItem(type) {
    const text = this._selectedText;
    this._hide();
    if (!this._currentNode || !text) { Toast.info('Open a node first.'); return; }

    if (type === 'definition') {
      Modal.open(`
        <h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:16px;">Add Definition</h2>
        <div class="config-row" style="margin-bottom:12px;">
          <label class="config-label">Term</label>
          <input type="text" id="sel-def-term" class="config-input" value="${this._esc(text.slice(0,60))}"/>
        </div>
        <div class="config-row" style="margin-bottom:16px;">
          <label class="config-label">Description</label>
          <textarea id="sel-def-desc" class="config-input" rows="3" placeholder="What does this mean?"></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" id="sel-def-save">Add Definition</button>
          <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
        </div>`);
      setTimeout(() => {
        document.getElementById('sel-def-desc').focus();
        document.getElementById('sel-def-save')?.addEventListener('click', () => {
          const term = document.getElementById('sel-def-term').value.trim();
          const desc = document.getElementById('sel-def-desc').value.trim();
          if (!term||!desc) { Toast.error('Fill in both fields.'); return; }
          this._currentNode.definitions.push({ term, description: desc });
          nodeStore.save(this._currentNode);
          Modal.close();
          Toast.success('Definition added!');
          if (NodeDetailView._currentNode?.id === this._currentNode.id) NodeDetailView._renderSection();
        });
      }, 0);
      return;
    }

    const label = type === 'recall' ? 'Recall Question' : 'Application Question';
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:16px;">Create ${label}</h2>
      <div style="background:var(--bg-raised);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;font-family:var(--font-body);font-size:13px;color:var(--text-secondary);font-style:italic;">
        "${this._esc(text.slice(0,120))}${text.length>120?'…':''}"
      </div>
      <div class="config-row" style="margin-bottom:12px;">
        <label class="config-label">Question</label>
        <textarea id="sel-q-question" class="config-input" rows="2" style="resize:vertical;"
          placeholder="${type==='recall'?'What is / Define / State…':'Given a scenario where…'}"></textarea>
      </div>
      <div class="config-row" style="margin-bottom:16px;">
        <label class="config-label">Answer</label>
        <textarea id="sel-q-answer" class="config-input" rows="3" style="resize:vertical;">${this._esc(text)}</textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary" id="sel-q-save">Add Question</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>`);
    setTimeout(() => {
      document.getElementById('sel-q-question')?.focus();
      document.getElementById('sel-q-save')?.addEventListener('click', () => {
        const question = document.getElementById('sel-q-question').value.trim();
        const answer   = document.getElementById('sel-q-answer').value.trim();
        if (!question||!answer) { Toast.error('Fill in both fields.'); return; }
        this._currentNode.questions.push({ id:KnowledgeNode._generateQuestionId(), type, question, answer });
        nodeStore.save(this._currentNode);
        Modal.close();
        Toast.success(`${label} added!`);
        if (NodeDetailView._currentNode?.id === this._currentNode.id) NodeDetailView._renderSection();
      });
    }, 0);
  },

  _highlightSelection() {
    if (this._isMobile) { Toast.info('Use browser highlighting on mobile.'); this._hide(); return; }
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const mark  = document.createElement('mark');
    mark.className = 'kn-highlight';
    mark.title = 'Click to remove';
    mark.addEventListener('click', () => { const p=mark.parentNode; while(mark.firstChild) p.insertBefore(mark.firstChild,mark); p.removeChild(mark); });
    try { range.surroundContents(mark); } catch { Toast.info('Select within one paragraph to highlight.'); }
    sel.removeAllRanges();
    this._hide();
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
