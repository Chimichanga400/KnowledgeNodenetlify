/**
 * NodeDetailView.js — Main note canvas (4 tabs: Notes, Questions, Examples, Mastery)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * METHOD INDEX — search for these markers (▶) to jump to each section
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   ▶ ENTRY              line ~14    open(), refresh(), _renderSection()
 *   ▶ NOTES TAB          line ~57    _renderNotes()
 *   ▶ PROFILE BAR        line ~307   _renderProfileBar(), _bindProfileBar()
 *   ▶ ADD BLOCK          line ~396   _renderAddBlock(), _bindAddBlock()
 *   ▶ OUTCOMES PANEL     line ~520   _renderOutcomes(), scan, add
 *   ▶ TEMPLATE PICKER    line ~904   _openTemplatePanel()
 *   ▶ EDIT MODE          line ~1021  _toggleEditMode(), _renderEditForm(),
 *                                    _bindEditEvents(), _saveEdits()
 *   ▶ ADD IMAGE          line ~1354  _addUserImage() — 3-option modal
 *   ▶ AI FLOATER         line ~1584  _showAIFloater()
 *   ▶ QUESTIONS TAB      line ~1740  _renderQuestions(), _renderQList()
 *   ▶ EXAMPLES TAB       line ~1890  _renderExamples(), _scanExampleFromImage(),
 *                                    _openAddExampleModal()
 *   ▶ MASTERY TAB        line ~2214  _renderMastery()
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE
 *   _currentNode    — the open node
 *   _currentSection — 'notes' | 'questions' | 'examples' | 'mastery'
 *   _editMode       — true when Edit mode is active for the notes tab
 *   _body           — cached reference to #detail-body
 * ═══════════════════════════════════════════════════════════════════════════
 */
const NodeDetailView = {
  _currentNode:    null,
  _currentSection: 'notes',
  _editMode:       false,

  init() { this._body = document.getElementById('detail-body'); },
  _escStr: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),

  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ ENTRY
  // ═══════════════════════════════════════════════════════════════════════════

  open(nodeId, section = 'notes') {
    // Clean up any previous document click handler
    if (this._docClickHandler) { document.removeEventListener('click', this._docClickHandler); this._docClickHandler = null; }
    const node = nodeStore.get(nodeId);
    if (!node) { Toast.error('Node not found.'); return; }
    this._currentNode    = node;
    this._currentSection = ['notes','examples','questions','mastery'].includes(section) ? section : 'notes';
    this._editMode       = false;
    // Set global AI profile from this node's setting
    AIService.setProfile(node.learnerProfile || 'college');
    // Track recency
    LearnerMemory.recordNoteOpened(node);
    // Persist so refresh returns to this exact node
    localStorage.setItem('kn_last_node', node.id);
    // Always sync tab buttons to match _currentSection
    document.querySelectorAll('.detail-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.section === this._currentSection)
    );
    document.querySelectorAll('.detail-nav-btn, .detail-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.section === this._currentSection));
    SelectToAction.setNode(node);
    ImageManager.setNode(node);
    App.showView('node-detail');
    this._renderSection();
    this._showAIFloater();
  },

  _renderSection() {
    const node = this._currentNode;
    if (!node) return;
    // Guard: ensure section is valid, default to notes
    const valid = ['notes','examples','questions','mastery'];
    if (!valid.includes(this._currentSection)) this._currentSection = 'notes';
    // Sync tab active state to match current section
    document.querySelectorAll('.detail-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.section === this._currentSection)
    );
    switch (this._currentSection) {
      case 'notes':     this._renderNotes(node);     break;
      case 'examples':  this._renderExamples(node);  break;
      case 'questions': this._renderQuestions(node); break;
      case 'mastery':   this._renderMastery(node);   break;
    }
  },

  /* ─── NOTES VIEW ──────────────────────────────────── */
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ NOTES TAB
  // ═══════════════════════════════════════════════════════════════════════════
  _renderNotes(node) {
    const tmpl         = node.noteTemplate || 'standard';
    const templateDisp = tmpl !== 'standard' ? NoteTemplates.renderDisplay(node) : null;
    const stdDisplay   = NotesRenderer.renderFullNotes(node);
    const outcomes     = node.moduleOutcomes || [];
    const outcomeCount = outcomes.length;

    this._body.innerHTML =
      // ── Header ───────────────────────────────────────────────
      '<div style="margin-bottom:20px;">'

      // Title
      + '<h2 style="font-family:var(--font-ui);font-size:22px;font-weight:800;margin:0 0 4px;letter-spacing:-0.02em;line-height:1.25;word-break:break-word;">' + this._esc(node.title) + '</h2>'

      // Subject · Chapter breadcrumb
      + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin:0 0 14px;">'
      + [node.subject].filter(Boolean).join(' · ')
      + (tmpl !== 'standard' ? ' · <span style="color:var(--accent);">' + (NoteTemplates.TEMPLATES[tmpl]?.icon || '') + ' ' + (NoteTemplates.TEMPLATES[tmpl]?.name || '') + '</span>' : '')
      + '</p>'

      // Action buttons row — labelled, consistent size
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button class="btn-secondary" id="template-btn" style="font-size:12px;padding:8px 14px;display:flex;align-items:center;gap:5px;"><span>📐</span><span>Template</span></button>'
      + '<button class="btn-secondary" id="edit-toggle-btn" style="font-size:12px;padding:8px 14px;display:flex;align-items:center;gap:5px;"><span>✏️</span><span>Edit</span></button>'
      + '<button class="btn-secondary" id="add-image-btn" style="font-size:12px;padding:8px 14px;display:flex;align-items:center;gap:5px;"><span>🖼️</span><span>Add image</span></button>'
      + '</div>'

      // ── Textbook bookmark — where you left off in the physical handbook ──
      + '<div id="bookmark-bar" style="margin-top:12px;background:var(--bg-raised);border:1px solid var(--border-soft);border-left:3px solid var(--accent);border-radius:8px;padding:10px 12px;">'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span style="font-size:15px;">📖</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);margin-bottom:2px;">Handbook bookmark' + (node.sourcePage ? ' · p.' + node.sourcePage : '') + '</div>'
      + (node.sourceBookmark
          ? '<div id="bookmark-display" style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.4;word-break:break-word;">' + this._esc(node.sourceBookmark) + '</div>'
          : '<div id="bookmark-display" style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);font-style:italic;">Tap edit to note where you left off (page, section…)</div>')
      + '</div>'
      + '<button class="btn-secondary" id="bookmark-edit-btn" style="font-size:11px;padding:5px 10px;flex-shrink:0;">' + (node.sourceBookmark || node.sourcePage ? '✏️' : '+ Add') + '</button>'
      + '</div>'
      + '<div id="bookmark-editor" style="display:none;margin-top:10px;">'
      + '<label style="font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);display:block;margin-bottom:4px;">Handbook page (for ordering)</label>'
      + '<input type="number" id="bookmark-page-input" class="config-input" placeholder="e.g. 81" value="' + (node.sourcePage || '') + '" style="font-size:13px;margin-bottom:10px;" min="1"/>'
      + '<label style="font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);display:block;margin-bottom:4px;">Where you left off (free text)</label>'
      + '<input type="text" id="bookmark-input" class="config-input" placeholder="e.g. Halfway through Year-End Procedures" value="' + this._esc(node.sourceBookmark) + '" style="font-size:13px;"/>'
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
      + '<button class="btn-primary" id="bookmark-save-btn" style="font-size:12px;padding:7px 14px;">Save</button>'
      + '<button class="btn-secondary" id="bookmark-cancel-btn" style="font-size:12px;padding:7px 14px;">Cancel</button>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div>'

      // ── Table of Contents ─────────────────────────────────────
      + '<div class="outcomes-panel" id="outcomes-panel">'
      + '<div class="outcomes-summary" id="outcomes-toggle" style="cursor:pointer;">'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);">📑 Table of Contents</span>'
      + (outcomeCount > 0 ? '<span class="outcomes-count" style="font-family:var(--font-mono);font-size:10px;background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:20px;">' + outcomeCount + ' section' + (outcomeCount!==1?'s':'') + '</span>' : '<span class="outcomes-count"></span>')
      + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + (AIService.hasApiKey() ? '<button class="btn-secondary" id="outcomes-from-image-btn" style="font-size:11px;padding:5px 10px;" title="Scan image to extract table of contents">📷 Scan</button>' : '')
      + (outcomes.some(o => o.text && (o.text.includes('"') || o.text.startsWith('{'))) ? '<button class="btn-secondary" id="outcomes-cleanup-btn" style="font-size:11px;padding:5px 10px;background:var(--red-dim);color:var(--red,#e54);">🔧 Fix</button>' : '')
      + '<span id="outcomes-chevron" style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">▶</span>'
      + '</div>'
      + '</div>'
      + '<div class="outcomes-body" id="outcomes-body" style="display:none;">' + this._renderOutcomes(node) + '</div>'
      + '</div>'

      // ── Adapt to / Profile bar + Notes content ────────────────
      + '<div id="notes-display">'
      + this._renderProfileBar(node)
      + (tmpl !== 'standard' && templateDisp
          ? templateDisp
          : (node.blocks?.length
              ? '<div id="kn-canvas" class="' + (node.learnerProfile === 'primary' ? 'kn-kid' : '') + '">' + BlockEngine.renderNode(node) + '</div>'
                + this._renderAddBlock()
              : stdDisplay))
      + '</div>';

    ImageManager.bindEvents(this._body, node);
    ImageResponseBlock.bindEvents(this._body, node);
    TextAnnotator.restoreHighlights(this._body, node);
    this._bindProfileBar(node);
    this._bindAddBlock(node);
    if (typeof AICorrections !== 'undefined') AICorrections.bindCorrectionButtons(this._body, node);

    document.getElementById('template-btn').addEventListener('click',    () => this._openTemplatePanel());
    document.getElementById('outcomes-toggle')?.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const body = document.getElementById('outcomes-body');
      const chev = document.getElementById('outcomes-chevron');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? 'block' : 'none';
      if (chev) chev.textContent = collapsed ? '▼' : '▶';
    });
    document.getElementById('edit-toggle-btn').addEventListener('click', () => this._toggleEditMode());
    document.getElementById('add-image-btn').addEventListener('click',   () => this._addUserImage());

    // Textbook bookmark
    const bmEdit   = document.getElementById('bookmark-edit-btn');
    const bmEditor = document.getElementById('bookmark-editor');
    bmEdit?.addEventListener('click', () => {
      bmEditor.style.display = bmEditor.style.display === 'none' ? 'block' : 'none';
      if (bmEditor.style.display === 'block') document.getElementById('bookmark-input')?.focus();
    });
    document.getElementById('bookmark-cancel-btn')?.addEventListener('click', () => {
      bmEditor.style.display = 'none';
      document.getElementById('bookmark-input').value = node.sourceBookmark || '';
    });
    document.getElementById('bookmark-save-btn')?.addEventListener('click', () => {
      const val = document.getElementById('bookmark-input').value.trim();
      const pageRaw = document.getElementById('bookmark-page-input')?.value.trim();
      const pageNum = pageRaw ? parseInt(pageRaw, 10) : null;
      node.sourceBookmark = val;
      node.sourcePage = (pageNum && pageNum > 0) ? pageNum : null;
      node.updatedAt = Date.now();
      nodeStore.save(node);
      const disp = document.getElementById('bookmark-display');
      if (disp) {
        if (val) { disp.textContent = val; disp.style.color = 'var(--text-primary)'; disp.style.fontStyle = 'normal'; }
        else { disp.textContent = 'Tap edit to note where you left off (page, section…)'; disp.style.color = 'var(--text-muted)'; disp.style.fontStyle = 'italic'; }
      }
      if (bmEdit) bmEdit.textContent = (val || node.sourcePage) ? '✏️' : '+ Add';
      bmEditor.style.display = 'none';
      Toast.success(val || node.sourcePage ? 'Bookmark saved 📖' : 'Bookmark cleared');
    });

    // Use document-level delegation so outcomes panel (outside _body) also works
    this._docClickHandler = e => {
      if (!this._currentNode) return;
      if (e.target.id === 'add-outcome-btn')              this._addOutcome();
      if (e.target.id === 'outcomes-from-image-btn')     { e.stopPropagation(); this._scanOutcomesFromImage(); return; }
      if (e.target.id === 'outcomes-cleanup-btn') {
        e.stopPropagation();
        // Remove all entries that look like raw JSON fragments
        const node = this._currentNode;
        const before = (node.moduleOutcomes||[]).length;
        node.moduleOutcomes = (node.moduleOutcomes||[]).filter(o => {
          const t = (o.text||'').trim();
          // Keep only clean text entries — reject anything with JSON syntax
          return t.length > 0
            && !t.startsWith('"')
            && !t.startsWith('{')
            && !t.startsWith('[')
            && !t.includes('": "')
            && !t.includes('": [');
        });
        nodeStore.save(node);
        this._refreshOutcomesBody(node);
        Toast.success('Removed ' + (before - node.moduleOutcomes.length) + ' corrupt entries. Tap Scan to re-add.');
        return;
      }

      // Per-module scan
      const scanBtn = e.target.closest('.outcome-scan-btn');
      if (scanBtn?.dataset.outcomeId) {
        e.stopPropagation();
        const o = (this._currentNode.moduleOutcomes||[]).find(x => x.id === scanBtn.dataset.outcomeId);
        if (o) this._scanOutcomeForModule(o);
        return;
      }
      if (e.target.id === 'outcomes-structure-btn')       { e.stopPropagation(); this._structureNotesFromToC(); return; }

      // Navigate to linked node
      const gotoBtn = e.target.closest('.outcome-goto-btn');
      if (gotoBtn?.dataset.nodeId) { NodeDetailView.open(gotoBtn.dataset.nodeId); return; }

      // Collapse/expand outcome row — tap chevron OR row title/badge
      const collapseBtn = e.target.closest('.outcome-collapse-btn');
      const rowHeader   = e.target.closest('.toc-row__header');
      const rowId = collapseBtn?.dataset.rowId || (rowHeader && !e.target.closest('.toc-row__check') && !e.target.closest('.toc-row__icon') && rowHeader.closest('.toc-row')?.dataset.rowId);
      if (rowId) {
        const expandable = document.querySelector('.toc-expandable[data-expand-id="' + rowId + '"]');
        const chevron    = document.querySelector('.outcome-collapse-btn[data-row-id="' + rowId + '"]');
        if (expandable) {
          const computedDisplay = window.getComputedStyle(expandable).display;
          const isOpen = computedDisplay !== 'none' && expandable.style.display !== 'none';
          expandable.style.display = isOpen ? 'none' : 'flex';
          if (chevron) { chevron.textContent = isOpen ? '▶' : '▼'; chevron.title = isOpen ? 'Expand' : 'Collapse'; }
        }
        if (collapseBtn) return;
      }

      // Scroll to section within current node
      const scrollBtn = e.target.closest('.outcome-scroll-btn');
      if (scrollBtn?.dataset.anchor) {
        const detailBody = document.getElementById('detail-body');
        const target = document.getElementById(scrollBtn.dataset.anchor);
        if (target && detailBody) {
          const offset = target.offsetTop - detailBody.offsetTop - 16;
          detailBody.scrollTo({ top: offset, behavior: 'smooth' });
        } else if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }



      // Create new node for this outcome — with duplicate guard
      const createBtn = e.target.closest('.outcome-create-btn');
      if (createBtn?.dataset.outcomeId) {
        const node = this._currentNode;
        const o = (node.moduleOutcomes||[]).find(x => x.id === createBtn.dataset.outcomeId);
        if (o) {
          const moduleLabel = 'Module ' + (o.moduleNum || '') + ' — ' + o.text.slice(0, 60);
          // Check if a node already exists with this exact chapter/title to prevent duplicates
          const existing = nodeStore.getAll().find(n =>
            n.id !== node.id && (
              n.chapter === moduleLabel ||
              n.title === o.text.slice(0, 80) ||
              (n.chapter||'').toLowerCase() === (o.text||'').toLowerCase().slice(0,60)
            )
          );
          if (existing) {
            Toast.info('Node already exists — opening it.');
            setTimeout(() => NodeDetailView.open(existing.id), 200);
            return;
          }
          // Copy all module outcomes from the parent node into the new node
          // so every node in the subject shares the same module map
          // Copy outcomes — preserve moduleNum and text but reset achieved state
          // Keep linkedNodeId so "Go to" buttons work immediately on the new node
          const copiedOutcomes = (node.moduleOutcomes || []).map(x => ({
            id: 'oc_' + Math.random().toString(36).slice(2,8),
            text: x.text,
            moduleNum: x.moduleNum,
            linkedNodeId: x.linkedNodeId || null,
            achieved: false,
          }));
          const newNode = new KnowledgeNode({
            subject: node.subject,
            chapter: moduleLabel,
            title: o.text.slice(0, 80),
            processingStatus: 'ready',
            moduleOutcomes: copiedOutcomes,
            definitions: [], tables: [], formulas: [], procedures: [], commonMistakes: [], summary: '', questions: [],
          });
          nodeStore.save(newNode);
          // Update the new node's own outcome for this module to point to itself
          const selfOutcome = newNode.moduleOutcomes?.find(x =>
            x.text.toLowerCase().trim() === o.text.toLowerCase().trim()
          );
          if (selfOutcome) { selfOutcome.linkedNodeId = newNode.id; nodeStore.save(newNode); }
          // Store link on the parent outcome
          o.linkedNodeId = newNode.id;
          nodeStore.save(node);
          // Also update the same outcome on all other nodes in the same subject
          // so the link is shared across the whole subject
          nodeStore.getAll()
            .filter(n => n.id !== node.id && n.id !== newNode.id && n.subject && node.subject &&
              n.subject.toLowerCase().trim() === node.subject.toLowerCase().trim() &&
              Array.isArray(n.moduleOutcomes)
            )
            .forEach(n => {
              const match = n.moduleOutcomes.find(x =>
                x.text.toLowerCase().trim() === o.text.toLowerCase().trim()
              );
              if (match) { match.linkedNodeId = newNode.id; nodeStore.save(n); }
            });
          Toast.success('Node created!');
          // Small delay ensures store has fully persisted before opening
          setTimeout(() => NodeDetailView.open(newNode.id), 300);
        }
        return;
      }

      // Rename module label inline
      const moduleLabel = e.target.closest('.outcome-module-label');
      if (moduleLabel?.dataset.outcomeId) {
        const oId = moduleLabel.dataset.outcomeId;
        const o = (this._currentNode.moduleOutcomes||[]).find(x => x.id === oId);
        if (!o) return;
        const current = 'Module ' + o.moduleNum;
        const input = document.createElement('input');
        input.value = current;
        input.style.cssText = 'font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:10px;padding:2px 7px;width:80px;';
        moduleLabel.replaceWith(input);
        input.focus(); input.select();
        const save = () => {
          const val = input.value.trim() || current;
          // Extract number or just store as text
          const numMatch = val.match(/\d+/);
          o.moduleNum = numMatch ? parseInt(numMatch[0]) : val;
          nodeStore.save(this._currentNode);
          this._refreshOutcomesBody(this._currentNode);
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e2 => { if (e2.key === 'Enter') { e2.preventDefault(); save(); } });
        return;
      }
      if (e.target.dataset?.deleteOutcome)                this._deleteOutcome(e.target.dataset.deleteOutcome);
      if (e.target.classList.contains('outcome-check'))   this._toggleOutcomeAchieved(e.target.dataset.outcomeId, e.target.checked);
    };
    document.addEventListener('click', this._docClickHandler);
  },

  /* ─── BLOCK CANVAS: profile bar ───────────────────── */
  _PROFILES: [
    { k: 'primary', label: '🧒 Primary' },
    { k: 'high',    label: '🎒 High school' },
    { k: 'college', label: '🎓 College' },
    { k: 'pro',     label: '💼 Professional' },
  ],
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ PROFILE BAR
  // ═══════════════════════════════════════════════════════════════════════════
  _renderProfileBar(node) {
    return '<div class="kn-profile-bar">'
      + '<div style="display:flex;flex-direction:column;gap:6px;width:100%;">'
      // Label row
      + '<div style="display:flex;align-items:center;justify-content:space-between;">'
      + '<span class="pl" style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Adapt explanation level</span>'
      + '<button class="kn-pchip" id="kn-regen" title="Regenerate notes for the selected level" '
      + 'style="margin:0;border-color:var(--accent-dim);color:var(--accent);font-size:11px;padding:4px 10px;display:flex;align-items:center;gap:4px;"><span>⟳</span><span>Regenerate</span></button>'
      + '</div>'
      // Chips row
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + this._PROFILES.map(p => {
        const isCached  = !!(node.profileCache?.[p.k]?.length);
        const isActive  = node.learnerProfile === p.k;
        const cacheIcon = (!isActive && isCached) ? ' <span style="font-size:8px;opacity:.6;" title="Cached">●</span>' : '';
        return '<button class="kn-pchip' + (isActive ? ' active' : '') + '" data-profile="' + p.k + '">' + p.label + cacheIcon + '</button>';
      }).join('')
      + '</div>'
      + '</div>'
      + '</div>';
  },
  _bindProfileBar(node) {
    this._body.querySelectorAll('.kn-pchip[data-profile]').forEach(chip => {
      chip.addEventListener('click', () => {
        const prevProfile = node.learnerProfile || 'college';
        const newProfile  = chip.dataset.profile;
        if (prevProfile === newProfile) return;

        // Save current blocks to cache before switching
        if (node.blocks?.length) {
          if (!node.profileCache) node.profileCache = {};
          node.profileCache[prevProfile] = JSON.parse(JSON.stringify(node.blocks));
        }

        // Restore from cache if we've been here before
        node.learnerProfile = newProfile;
        AIService.setProfile(newProfile);

        if (node.profileCache?.[newProfile]?.length) {
          // Instant restore from cache — no API call needed
          node.blocks = JSON.parse(JSON.stringify(node.profileCache[newProfile]));
          nodeStore.save(node);
          this._renderNotes(node);
          Toast.success('Restored ' + chip.textContent + ' view ✓');
        } else {
          // First time on this profile — save and prompt to regenerate
          nodeStore.save(node);
          this._renderNotes(node);
          Toast.info('Switched to ' + chip.textContent + ' level. Tap ⟳ Regenerate to adapt content.');
        }
      });
    });
    this._body.querySelector('#kn-regen')?.addEventListener('click', () => this._regenerateForProfile(node));
  },
  async _regenerateForProfile(node) {
    if (!AIService.hasApiKey()) {
      Toast.error('Configure AI first to regenerate. The canvas still adapts styling without it.');
      return;
    }
    const btn = this._body.querySelector('#kn-regen');
    if (btn) { btn.textContent = '⟳ Generating…'; btn.disabled = true; }
    try {
      const blocks = await AIService.generateBlocks(node.title, node.learnerProfile, node);
      node.blocks = blocks.map(b => ({ id: KnowledgeNode._generateBlockId(), ...b }));
      // Cache this result so switching back doesn't need another API call
      if (!node.profileCache) node.profileCache = {};
      node.profileCache[node.learnerProfile] = JSON.parse(JSON.stringify(node.blocks));
      nodeStore.save(node);
      this._renderNotes(node);
      Toast.success('Regenerated for ' + node.learnerProfile + ' level — saved to cache ✓');
    } catch (e) {
      Toast.error(e.message || 'Regeneration failed.');
      if (btn) { btn.textContent = '⟳ Regenerate'; btn.disabled = false; }
    }
  },

  /* ─── BLOCK CANVAS: add-block palette ─────────────── */
  _BLOCK_PALETTE: [
    { type: 'prose',      label: '📝 Text' },
    { type: 'callout',    label: '💡 Callout' },
    { type: 'code',       label: '▶ Code runner' },
    { type: 'calc',       label: '🧮 Calculator' },
    { type: 'webpreview', label: '🎨 Live preview' },
    { type: 'quiz',       label: '✅ Quiz' },
    { type: 'cloze',      label: '✏ Fill the blanks' },
    { type: 'match',      label: '🎮 Match game' },
    { type: 'flashcards', label: '🃏 Flashcards' },
    { type: 'diagram',    label: '➡ Diagram' },
    { type: 'table',      label: '▦ Table' },
  ],
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ ADD BLOCK
  // ═══════════════════════════════════════════════════════════════════════════
  _renderAddBlock() {
    return '<div class="kn-add-block"><button class="kn-add-btn" id="kn-add-toggle">＋ Add block</button>'
      + '<div class="kn-add-palette" id="kn-palette">'
      + this._BLOCK_PALETTE.map(p => '<div class="kn-pal-item" data-add="' + p.type + '">' + p.label + '</div>').join('')
      + '</div></div>';
  },
  _bindAddBlock(node) {
    this._body.querySelector('#kn-add-toggle')?.addEventListener('click', () =>
      this._body.querySelector('#kn-palette')?.classList.toggle('open'));
    this._body.querySelectorAll('.kn-pal-item[data-add]').forEach(item =>
      item.addEventListener('click', () => {
        const blockType = item.dataset.add;
        const aiBlocks = ['flashcards', 'quiz', 'cloze', 'match', 'calc'];
        if (AIService.hasApiKey() && aiBlocks.includes(blockType)) {
          this._generateAIBlock(this._currentNode, blockType);
        } else {
          node.addBlock(blockType, this._defaultBlockData(blockType));
          nodeStore.save(node);
          this._renderSection();
        }
        nodeStore.save(node);
        this._renderNotes(node);
      }));
  },
  async _generateAIBlock(node, blockType) {
    Toast.info('Generating ' + blockType + ' from your notes…');
    const subject = node.subject || node.title || 'this subject';
    const defs = (node.definitions || []).slice(0, 8).map(d => d.term + ': ' + d.description).join('\n');
    const formulas = (node.formulas || []).slice(0, 5).map(f => f.expression + ' — ' + f.description).join('\n');
    const summary = node.summary || '';
    const source = [defs, formulas, summary].filter(Boolean).join('\n\n').slice(0, 3000);

    let prompt = '', fallback;

    if (blockType === 'flashcards') {
      prompt = 'Create 6 flashcards for a student studying "' + subject + '". Use ONLY the source material below.\n'
        + 'Output ONLY raw JSON: {"title":"Flashcards","cards":[{"front":"term or question","back":"definition or answer"}]}\n'
        + 'Each card front is a key term or concept. Each back is its definition from the source.\n\nSOURCE:\n' + source;
      fallback = { title: 'Flashcards', cards: [{ front: 'Front', back: 'Back' }] };

    } else if (blockType === 'quiz') {
      prompt = 'Create a multiple-choice question for a student studying "' + subject + '". Use ONLY the source material below.\n'
        + 'Output ONLY raw JSON: {"title":"Quick check","q":"question text","options":["A","B","C","D"],"answer":0,"fb":"explanation"}\n'
        + '"answer" is the index (0-3) of the correct option. Make it challenging but fair.\n\nSOURCE:\n' + source;
      fallback = this._defaultBlockData('quiz');

    } else if (blockType === 'cloze') {
      prompt = 'Create a fill-in-the-blank exercise for a student studying "' + subject + '". Use ONLY the source material below.\n'
        + 'Output ONLY raw JSON: {"title":"Fill in the blanks","text":"A sentence from the source where 1-4 key terms are wrapped as {{term}}."}\n'
        + 'Blank out the most important terms — definitions, key numbers, names. For terms with an accepted synonym use {{net|net amount}}.\n\nSOURCE:\n' + source;
      fallback = this._defaultBlockData('cloze');

    } else if (blockType === 'match') {
      prompt = 'Create a matching exercise for a student studying "' + subject + '". Use ONLY the source material below.\n'
        + 'Output ONLY raw JSON: {"title":"Match them up!","pairs":[["term","definition"],["term2","definition2"]]}\n'
        + 'Create 4-6 pairs of terms and their matching definitions from the source.\n\nSOURCE:\n' + source;
      fallback = this._defaultBlockData('match');

    } else if (blockType === 'calc') {
      const srcFormulas = formulas || defs;
      prompt = 'Create an interactive calculator for a student studying "' + subject + '".\n'
        + 'IMPORTANT: You MUST include at least 2 input fields. The calculator must have visible inputs the student can type into.\n'
        + 'Output ONLY this exact JSON structure:\n'
        + '{"title":"Tax Calculator","resultLabel":"Tax Payable","inputs":[{"key":"income","label":"Taxable Income (R)","default":100000},{"key":"rate","label":"Tax Rate (%)","default":18}],"formula":"income * rate / 100","breakdownSteps":[{"label":"Income × Rate","expr":"income * rate / 100"}]}\n'
        + 'Rules: every "key" must be a simple word (no spaces, no special chars). "formula" must be valid JavaScript using those key names. Include 2-4 inputs.\n'
        + '\nSource formulas from notes:\n' + (srcFormulas || 'Use a relevant formula for: ' + subject);
      fallback = this._defaultBlockData('calc');
    }

    try {
      const raw = await AIService._callWithFunction('noteProcessing', [{role:'user', content: prompt}], 800);
      const data = AIService._parseJSON(raw);
      if (!data) throw new Error('Empty response');
      node.addBlock(blockType, data);
      nodeStore.save(node);
      Toast.success(blockType.charAt(0).toUpperCase() + blockType.slice(1) + ' generated from your notes!');
      this._renderSection();
    } catch(err) {
      node.addBlock(blockType, fallback);
      nodeStore.save(node);
      Toast.info('Using default — edit to customise. (' + err.message + ')');
      this._renderSection();
    }
  },

  _defaultBlockData(type) {
    switch (type) {
      case 'prose':      return { title: 'New note', html: 'Write here…' };
      case 'callout':    return { title: 'Tip', html: 'Key thing to remember.' };
      case 'code':       return { title: 'Try it', lang: 'sql', setup: "CREATE TABLE t(id,name);INSERT INTO t VALUES(1,'a'),(2,'b');", code: 'SELECT * FROM t;' };
      case 'calc':       return { title: 'Calculator', resultLabel: 'Result', inputs: [{ key: 'a', label: 'Value A', default: 0 }, { key: 'b', label: 'Value B', default: 0 }], formula: 'a + b', breakdownSteps: [{ label: 'A + B', expr: 'a + b' }] };
      case 'webpreview': return { title: 'Live preview', code: '<h1 style="font-family:sans-serif">Hello</h1>\n<p>Edit me — the preview updates.</p>' };
      case 'quiz':       return { title: 'Quick check', q: 'Your question?', options: ['Option A', 'Option B', 'Option C'], answer: 0, fb: 'Explanation here.' };
      case 'cloze':      return { title: 'Fill in the blanks', text: 'The capital of France is {{Paris}}, and it sits on the river {{Seine}}.' };
      case 'match':      return { title: 'Match them up!', pairs: [['A', '1'], ['B', '2'], ['C', '3']] };
      case 'flashcards': return { title: 'Flashcards', cards: [{ front: 'Front', back: 'Back' }] };
      case 'diagram':    return { title: 'Flow', steps: ['Step 1', 'Step 2', 'Step 3'] };
      case 'table':      return { title: 'Table', columns: ['Col 1', 'Col 2'], rows: [['', '']] };
      default:           return {};
    }
  },

  /** Re-render just the canvas in place (called by BlockEngine after move/delete). */
  _rerenderBlocks() {
    if (!this._currentNode) return;
    // Re-render just the block canvas without full page reload
    const canvas = document.getElementById('kn-canvas');
    if (canvas) {
      canvas.innerHTML = BlockEngine.renderNode(this._currentNode);
      if (typeof AICorrections !== 'undefined') AICorrections.bindCorrectionButtons(canvas, this._currentNode);
      return;
    }
    // Fallback: full notes re-render
    if (this._currentSection === 'notes') {
      this._renderNotes(this._currentNode);
    }
  },

  /* ─── MODULE OUTCOMES ─────────────────────────────── */
  _refreshOutcomesBody(node) {
    const body = document.getElementById('outcomes-body');
    if (!body) return;
    // Preserve current collapsed/expanded state — never force open
    const isOpen = body.style.display !== 'none';
    body.innerHTML = this._renderOutcomes(node);
    if (!isOpen) body.style.display = 'none';
    const cnt = document.querySelector('.outcomes-count');
    const count = (node.moduleOutcomes||[]).length;
    if (cnt) cnt.textContent = count > 0 ? count + ' section' + (count!==1?'s':'') : '';
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ OUTCOMES PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  _renderOutcomes(node) {
    const outcomes = node.moduleOutcomes || [];
    // Only match within the same subject — outcomes belong to a subject, not a single node
    const sameSubjectNodes = nodeStore.getAll().filter(n =>
      n.id !== node.id &&
      n.subject &&
      node.subject &&
      n.subject.toLowerCase().trim() === node.subject.toLowerCase().trim()
    );

    const rows = outcomes.length === 0
      ? '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);padding:4px 0 10px;">No sections yet. Tap 📷 Scan to extract from a module guide.</p>'
      : outcomes.map((o, i) => {
          // Auto-assign module number if missing
          if (!o.moduleNum) o.moduleNum = i + 1;
          const outcomeText = o.text.toLowerCase().trim();
          const moduleLabel = ('module ' + (o.moduleNum||'')).toLowerCase();

          // Find linked node — same subject only
          // Priority: (1) stored linkedNodeId, (2) exact title match, (3) chapter contains outcome, (4) module number prefix
          const linked = o.linkedNodeId
            ? sameSubjectNodes.find(n => n.id === o.linkedNodeId)
            : (
                sameSubjectNodes.find(n =>
                  (n.title||'').toLowerCase() === outcomeText ||
                  outcomeText === (n.title||'').toLowerCase()
                ) ||
                sameSubjectNodes.find(n =>
                  (n.chapter||'').toLowerCase().includes(outcomeText) ||
                  outcomeText.includes((n.title||'').toLowerCase().trim()) && (n.title||'').length > 4
                ) ||
                (o.moduleNum ? sameSubjectNodes.find(n =>
                  (n.chapter||'').toLowerCase().startsWith(moduleLabel)
                ) : null)
              );
          const modLabel = 'Module ' + o.moduleNum;

          // Check if this outcome refers to the current node itself
          // (by stored linkedNodeId, or by title/chapter match)
          const isCurrentNode = (
            (o.linkedNodeId && o.linkedNodeId === node.id) ||
            (linked && linked.id === node.id) ||
            (node.title || '').toLowerCase().trim() === outcomeText ||
            (node.chapter || '').toLowerCase().includes(outcomeText) ||
            outcomeText.includes((node.title || '').toLowerCase().trim()) && (node.title || '').length > 4
          );

          // Determine what action button to show
          let actionBtn = '';
          if (isCurrentNode) {
            actionBtn = '<span style="font-family:var(--font-mono);font-size:10px;color:var(--accent);padding:3px 8px;background:var(--accent-soft);border-radius:8px;border:1px solid var(--accent-dim);">📍 You are here</span>';
          } else if (linked) {
            actionBtn = '<button class="btn-secondary outcome-goto-btn" data-node-id="' + linked.id + '" style="font-size:11px;padding:4px 10px;">📖 Go to: ' + this._esc((linked.title||linked.chapter||'').slice(0,30)) + '</button>';
          } else {
            actionBtn = '<button class="btn-secondary outcome-create-btn" data-outcome-id="' + o.id + '" style="font-size:11px;padding:4px 10px;opacity:.75;">+ Create node for this</button>';
          }

          const hasSubContent = true; // every row has a Go to / Create node button
          return '<div class="toc-row' + (o.achieved ? ' achieved' : '') + (isCurrentNode ? ' toc-row--current' : '') + '" data-row-id="' + o.id + '">'
            + '<div class="toc-row__header">'
            + '<input type="checkbox" class="outcome-check toc-row__check" data-outcome-id="' + o.id + '" ' + (o.achieved ? 'checked' : '') + '/>'
            + '<span class="toc-row__badge' + (isCurrentNode ? ' toc-row__badge--current' : '') + '">' + this._esc(modLabel) + '</span>'
            + '<span class="toc-row__title' + (isCurrentNode ? ' toc-row__title--current' : '') + '">' + this._esc(o.text) + '</span>'
            + '<div class="toc-row__actions">'
            + (hasSubContent ? '<button class="toc-row__chevron outcome-collapse-btn" data-row-id="' + o.id + '" title="Expand">▶</button>' : '')
            + (AIService.hasApiKey() ? '<button class="toc-row__icon outcome-scan-btn" data-outcome-id="' + o.id + '" title="Scan outcomes">📷</button>' : '')
            + '<button class="toc-row__icon toc-row__delete" data-delete-outcome="' + o.id + '" title="Remove">✕</button>'
            + '</div>'
            + '</div>'
            + '<div class="toc-expandable" data-expand-id="' + o.id + '" style="display:none;">'
            + '<div class="toc-action">' + actionBtn + (o.achieved ? '<span class="toc-achieved-badge">✓ Achieved</span>' : '') + '</div>'
            + ((o.subOutcomes && o.subOutcomes.length)
                ? '<div class="toc-suboutcomes">'
                  + '<div class="toc-suboutcomes__label">Module Outcomes</div>'
                  + o.subOutcomes.map(function(s,si){ return '<div class="toc-suboutcome-item">'
                    + '<span class="toc-suboutcome-num">'+(si+1)+'.</span>'
                    + '<span class="toc-suboutcome-text">'+NodeDetailView._escStr(s)+'</span>'
                    + '</div>'; }).join('')
                  + '</div>'
                : '')
            + '</div>'
            + '</div>';
        }).join('');

    const nextModNum = (outcomes.length > 0 ? Math.max(...outcomes.map(o => o.moduleNum||0)) + 1 : 1);
    return rows
      + '<div class="toc-add-panel">'
      + '<div class="toc-add-panel__label">Add to Table of Contents</div>'
      + '<div class="toc-add-panel__inputs">'
      + '<input type="text" id="new-outcome-module" class="config-input toc-add-panel__mod" placeholder="Module 1" value="Module ' + nextModNum + '"/>'
      + '<input type="text" id="new-outcome-input" class="config-input toc-add-panel__text" placeholder="e.g. Gross Income, Allowable Deductions…"/>'
      + '</div>'
      + '<button class="btn-primary toc-add-panel__btn" id="add-outcome-btn">+ Add</button>'
      + '</div>';
  },

  _scanOutcomeForModule(outcome) {
    // Guard against re-entry
    if (this._scanningOutcomes) return;
    this._scanningOutcomes = true;
    const node = this._currentNode;
    const modLabel = 'Module ' + outcome.moduleNum + ' — ' + outcome.text;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('cancel', () => { this._scanningOutcomes = false; });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { this._scanningOutcomes = false; return; }
      Toast.info('Reading image for ' + modLabel + '…');
      // Normalise MIME type
      const { base64, mediaType } = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => {
          const dataUrl = r.result;
          const parts = dataUrl.split(',');
          let mt = parts[0].match(/data:([^;]+);/)?.[1] || file.type || 'image/jpeg';
          const supported = ['image/jpeg','image/png','image/gif','image/webp'];
          if (!supported.includes(mt)) {
            const img = new Image();
            img.onload = () => { const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d').drawImage(img,0,0); const j=c.toDataURL('image/jpeg',0.92); res({base64:j.split(',')[1],mediaType:'image/jpeg'}); };
            img.onerror = rej; img.src = dataUrl;
          } else { res({base64:parts[1],mediaType:mt}); }
        };
        r.onerror = rej; r.readAsDataURL(file);
      });
      try {
        // Step 1: OCR
        const ocrMsgs = [
          { role:'user', content:[
            {type:'image_url',image_url:{url:'data:'+mediaType+';base64,'+base64}},
            {type:'text',text:'Extract ALL text from this image exactly as it appears. Output only the raw text.'}
          ]}
        ];
        const ocrText = await AIService._callWithFunction('noteProcessing', ocrMsgs, 1500);

        // Step 2: Extract module outcomes for this specific module
        const extractPrompt = 'From the following text, extract ONLY the learning outcomes or objectives that belong to "'
          + modLabel + '". These are the specific things a student should know or be able to do for this module.'
          + ' If you cannot find specific outcomes for this module, extract the main topics covered.'
          + ' Return ONLY a JSON array of strings, no explanation:\n\n' + ocrText;
        const extractMsgs = [
          {role:'user', content:extractPrompt},
        ];
        const raw = await AIService._callWithFunction('noteProcessing', extractMsgs, 800);
        let outcomes = [];
        try { outcomes = JSON.parse('[' + raw); } catch {
          try { outcomes = AIService._parseJSON('{"outcomes":[' + raw).outcomes || []; } catch {}
        }
        if (!outcomes.length && ocrText.trim()) {
          outcomes = ocrText.split('\n').map(l => l.replace(/^[\s\-•\*\d\.]+/,'').trim()).filter(l => l.length > 8 && l.length < 300);
        }
        if (!outcomes.length) { Toast.error('No outcomes found for this module.'); this._scanningOutcomes = false; return; }

        // Store outcomes as a sub-list on the outcome object
        if (!outcome.subOutcomes) outcome.subOutcomes = [];
        outcomes.forEach(text => {
          if (!outcome.subOutcomes.find(x => x.toLowerCase().trim() === text.toLowerCase().trim())) {
            outcome.subOutcomes.push(String(text).trim());
          }
        });
        nodeStore.save(node);
        this._refreshOutcomesBody(node);
        Toast.success(outcomes.length + ' outcomes added to ' + modLabel + '!');
        this._scanningOutcomes = false;
      } catch(err) { Toast.error('Error: ' + err.message); this._scanningOutcomes = false; }
    };
    input.click();
  },

  _scanOutcomesFromImage() {
    // Guard against re-entry (prevents gallery opening multiple times)
    if (this._scanningOutcomes) return;
    this._scanningOutcomes = true;
    const node = this._currentNode;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    // Reset flag when user cancels or finishes
    input.addEventListener('cancel', () => { this._scanningOutcomes = false; });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { this._scanningOutcomes = false; return; }
      Toast.info('Reading image for outcomes…');
      // Normalise to Claude-supported MIME type
      const { base64, mediaType } = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => {
          const dataUrl = r.result;
          const parts = dataUrl.split(',');
          let mt = parts[0].match(/data:([^;]+);/)?.[1] || file.type || 'image/jpeg';
          const supported = ['image/jpeg','image/png','image/gif','image/webp'];
          if (!supported.includes(mt)) {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              c.getContext('2d').drawImage(img, 0, 0);
              const j = c.toDataURL('image/jpeg', 0.92);
              res({ base64: j.split(',')[1], mediaType: 'image/jpeg' });
            };
            img.onerror = rej;
            img.src = dataUrl;
          } else {
            res({ base64: parts[1], mediaType: mt });
          }
        };
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      try {
        // Step 1: OCR — extract all text from the image first
        const ocrPrompt = 'Extract ALL text from this image exactly as it appears. Include every word, bullet point, number, and line. Output only the raw text, nothing else.';
        const ocrMsgs = [
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: 'data:' + mediaType + ';base64,' + base64 } },
            { type: 'text', text: ocrPrompt }
          ]}
        ];
        const ocrText = await AIService._callWithFunction('noteProcessing', ocrMsgs, 1500);

        // Step 2: Extract module titles
        const extractPrompt = 'Look at this text and find all the learning module topics. For each module, give me just the topic name (not the module number). '
          + 'Return a JSON array of strings. Example: ["Introduction to Income Tax", "Gross Income", "Exempt Income"]. '
          + 'Output ONLY the array, nothing else.'
          + '\n\nTEXT:\n' + ocrText;
        const extractMsgs = [
          { role: 'user', content: extractPrompt }
        ];
        // Use 'chat' not 'noteProcessing' — avoids forcing JSON-only system prompt
        const raw = await AIService._callWithFunction('chat', extractMsgs, 800);
        let outcomes = [];
        let cleanRaw = raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
        if (cleanRaw.startsWith('{')) {
          try { const obj = JSON.parse(cleanRaw); const v = Object.values(obj)[0]; cleanRaw = Array.isArray(v) ? JSON.stringify(v) : cleanRaw; } catch {}
        }
        try {
          const parsed = JSON.parse(cleanRaw);
          outcomes = Array.isArray(parsed) ? parsed : [];
        } catch {
          try { outcomes = AIService._parseJSON(raw).outcomes || []; } catch {}
        }
        // If still empty, split the OCR text into lines as fallback
        if (!outcomes.length && ocrText.trim()) {
          outcomes = ocrText
            .split('\n')
            .map(l => l.replace(/^[\s\-•\*\d\.]+/, '').trim())
            .filter(l => l.length > 10 && l.length < 300);
        }
        if (!outcomes.length) {
          Toast.error('Could not find outcomes. Please add them manually below.');
          return;
        }
        if (!node.moduleOutcomes) node.moduleOutcomes = [];
        const startNum = node.moduleOutcomes.length + 1;
        outcomes.forEach((text, i) => {
          node.moduleOutcomes.push({ id: 'oc_' + Math.random().toString(36).slice(2,8), text: String(text).trim(), achieved: false, moduleNum: startNum + i });
        });
        nodeStore.save(node);
        // Share outcomes with all nodes of the same subject
        if (node.subject) {
          nodeStore.getAll()
            .filter(n => n.id !== node.id && n.subject &&
              n.subject.toLowerCase().trim() === node.subject.toLowerCase().trim()
            )
            .forEach(n => {
              if (!n.moduleOutcomes) n.moduleOutcomes = [];
              node.moduleOutcomes.forEach(o => {
                if (!n.moduleOutcomes.find(x => x.text.toLowerCase().trim() === o.text.toLowerCase().trim())) {
                  n.moduleOutcomes.push({ ...o, id: 'oc_' + Math.random().toString(36).slice(2,8) });
                  nodeStore.save(n);
                }
              });
            });
        }
        this._refreshOutcomesBody(node);
        const count = node.moduleOutcomes.length;
        const cnt = document.querySelector('.outcomes-count');
        if (cnt) cnt.textContent = count + ' outcome' + (count !== 1 ? 's' : '');
        Toast.success(outcomes.length + ' outcomes added and shared across ' + node.subject + ' nodes!');
        this._scanningOutcomes = false;
      } catch(err) { Toast.error('Error: ' + err.message); this._scanningOutcomes = false; }
    };
    input.click();
  },

  /* ─── STRUCTURE NOTES FROM TABLE OF CONTENTS ─────── */
  async _structureNotesFromToC() {
    const node = this._currentNode;
    const toc = (node.moduleOutcomes || []).map(o => o.text).filter(Boolean);
    if (!toc.length) {
      Toast.error('Add sections to your Table of Contents first.');
      return;
    }
    if (!AIService.hasApiKey()) {
      Toast.error('Configure AI first in Settings.');
      return;
    }
    // Show progress in the outcomes panel
    const structureBtn = document.getElementById('outcomes-structure-btn');
    if (structureBtn) { structureBtn.textContent = '⟳ Working…'; structureBtn.disabled = true; }
    Toast.info('AI is structuring your notes…');
    try {
      const sourceContext = [
        node.rawOCR || '',
        node.summary || '',
        (node.definitions||[]).map(d => d.term + ': ' + d.description).join('\n'),
        (node.formulas||[]).map(f => f.expression + ' — ' + f.description).join('\n'),
        (node.procedures||[]).flatMap(p => [p.title, ...(p.steps||[])]).join('\n'),
        node.userNotes || '',
      ].filter(Boolean).join('\n\n').slice(0, 7000);

      const tocList = toc.map((t, i) => (i+1) + '. ' + t).join('\n');

      const prompt = 'You are restructuring study notes for "' + node.title + '" (' + (node.subject||'') + ').'
        + '\n\nThe student has defined these sections in their Table of Contents:\n' + tocList
        + '\n\nUsing ONLY the source material below, write detailed study notes organised under each section heading.'
        + ' For each section, include: key definitions relevant to that section, important rules or formulas, and a brief explanation.'
        + ' ONLY use information from the source. If the source has nothing for a section, write "No content available in source material."'
        + '\n\nFormat the output as plain text with each section clearly labelled as:\n=== [Section Name] ===\n[content]'
        + '\n\nSOURCE MATERIAL:\n' + sourceContext;

      const raw = await AIService._callWithFunction('restructure',
        [{role:'user', content: prompt}], 3000);

      // Parse sections from the response and update node's userNotes
      node.userNotes = raw.trim();
      nodeStore.save(node);
      Toast.success('Notes structured from Table of Contents!');
      this._renderSection();
    } catch(err) {
      Toast.error('Could not structure: ' + err.message);
    } finally {
      if (structureBtn) { structureBtn.textContent = '⬡ Structure'; structureBtn.disabled = false; }
    }
  },

  _addOutcome() {
    const input     = document.getElementById('new-outcome-input');
    const modInput  = document.getElementById('new-outcome-module');
    const text      = input?.value.trim();
    if (!text) { input?.focus(); return; }
    if (!this._currentNode.moduleOutcomes) this._currentNode.moduleOutcomes = [];
    // Parse module number from the module label input (e.g. "Module 3" → 3, or keep as string)
    const modRaw    = (modInput?.value || '').trim();
    const numMatch  = modRaw.match(/\d+/);
    const moduleNum = numMatch ? parseInt(numMatch[0]) : (this._currentNode.moduleOutcomes.length + 1);
    this._currentNode.moduleOutcomes.push({
      id: 'oc_' + Math.random().toString(36).slice(2,8),
      text,
      achieved: false,
      moduleNum,
    });
    // Sort by module number so they stay in order
    this._currentNode.moduleOutcomes.sort((a,b) => (a.moduleNum||0) - (b.moduleNum||0));
    nodeStore.save(this._currentNode);
    // Sync to same-subject nodes
    if (this._currentNode.subject) {
      nodeStore.getAll()
        .filter(n => n.id !== this._currentNode.id && n.subject &&
          n.subject.toLowerCase().trim() === this._currentNode.subject.toLowerCase().trim()
        )
        .forEach(n => {
          if (!n.moduleOutcomes) n.moduleOutcomes = [];
          const exists = n.moduleOutcomes.find(x => x.text.toLowerCase().trim() === text.toLowerCase().trim());
          if (!exists) { n.moduleOutcomes.push({ id:'oc_'+Math.random().toString(36).slice(2,8), text, achieved:false, moduleNum }); n.moduleOutcomes.sort((a,b)=>(a.moduleNum||0)-(b.moduleNum||0)); nodeStore.save(n); }
        });
    }
    this._refreshOutcomesBody(this._currentNode);
    if (input) input.value = '';
  },

  _deleteOutcome(id) {
    this._currentNode.moduleOutcomes = (this._currentNode.moduleOutcomes||[]).filter(o => o.id !== id);
    nodeStore.save(this._currentNode);
    this._refreshOutcomesBody(this._currentNode);
  },

  _toggleOutcomeAchieved(id, achieved) {
    const o = this._currentNode.moduleOutcomes?.find(o => o.id === id);
    if (o) { o.achieved = achieved; nodeStore.save(this._currentNode); }
    const row = document.querySelector('.outcome-row [data-outcome-id="' + id + '"]')?.closest('.outcome-row');
    if (row) row.classList.toggle('achieved', achieved);
  },

  /* ─── TEMPLATE PICKER (AI-driven, inline) ─────────── */
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ TEMPLATE PICKER
  // ═══════════════════════════════════════════════════════════════════════════
  _openTemplatePanel() {
    const node = this._currentNode;
    const current = node.noteTemplate || 'standard';
    const hasAI = AIService.hasApiKey();

    const templates = [
      { id:'standard', icon:'📋', name:'Standard',      desc:'AI-structured definitions, tables, formulas and procedures.' },
      { id:'cornell',  icon:'🗒',  name:'Cornell Method', desc:'Cues column + Notes column + Summary. Great for all subjects.' },
      { id:'outline',  icon:'≡',  name:'Outline Method', desc:'Numbered hierarchy. Best for law, tax, procedures.' },
      { id:'feynman',  icon:'💡', name:'Feynman Method', desc:'Explain it simply. Gaps in explanation = gaps in knowledge.' },
    ];

    // Suggest best template based on subject category
    const suggestions = {
      accounting: 'cornell',
      law: 'outline',
      programming: 'standard',
      science: 'cornell',
      medicine: 'outline',
      maths: 'standard',
      history: 'outline',
      language: 'cornell',
      general: 'standard',
    };
    const suggested = suggestions[node.subjectCategory] || 'standard';

    Modal.open(
      '<h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:4px;">Change Note Format</h2>'
      + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:16px;">'
      + (hasAI ? 'AI will rewrite your notes into the chosen format using your source material.' : 'Select a format to apply.')
      + (node.subjectCategory ? ' · Suggested for ' + node.subjectCategory + ': <strong style="color:var(--accent);">' + templates.find(t=>t.id===suggested)?.name + '</strong>' : '')
      + '</p>'
      + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">'
      + templates.map(t =>
          '<button class="nt-option' + (current === t.id ? ' active' : '') + (t.id === suggested && current !== t.id ? ' suggested' : '') + '" data-template="' + t.id + '" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:var(--radius-md);border:1px solid ' + (current===t.id?'var(--accent)':t.id===suggested?'var(--accent-dim)':'var(--border)') + ';background:' + (current===t.id?'var(--accent-soft)':'var(--bg-raised)') + ';cursor:pointer;text-align:left;width:100%;">'
          + '<span style="font-size:20px;flex-shrink:0;">' + t.icon + '</span>'
          + '<div><div style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--text-primary);">' + t.name
          + (t.id === suggested && current !== t.id ? ' <span style="font-family:var(--font-mono);font-size:10px;color:var(--accent);font-weight:400;">· recommended</span>' : '')
          + '</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:2px;">' + t.desc + '</div></div>'
          + '</button>'
        ).join('')
      + '</div>'
      + '<div id="nt-warning" style="display:none;padding:10px 14px;background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);margin-bottom:16px;font-family:var(--font-mono);font-size:11px;color:var(--accent);">⬡ AI will restructure your notes into this format. This may take 15-30 seconds.</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn-primary" id="nt-apply-btn" style="flex:1;justify-content:center;">' + (hasAI ? '⬡ Apply with AI' : 'Apply') + '</button>'
      + '<button class="btn-secondary" onclick="Modal.close()">Cancel</button>'
      + '</div>'
      + '<div id="nt-progress" style="display:none;margin-top:14px;text-align:center;"><div class="aif-loading" style="justify-content:center;"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div><p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:8px;">AI is restructuring your notes…</p></div>'
    );

    setTimeout(() => {
      let selectedTemplate = current;

      document.querySelectorAll('.nt-option').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.nt-option').forEach(b => {
            b.style.border = '1px solid var(--border)';
            b.style.background = 'var(--bg-raised)';
          });
          btn.style.border = '1px solid var(--accent)';
          btn.style.background = 'var(--accent-soft)';
          selectedTemplate = btn.dataset.template;
          const warn = document.getElementById('nt-warning');
          if (warn) warn.style.display = (selectedTemplate !== current && selectedTemplate !== 'standard' && hasAI) ? 'block' : 'none';
        });
      });

      document.getElementById('nt-apply-btn')?.addEventListener('click', async () => {
        if (selectedTemplate === current) { Modal.close(); return; }

        if (selectedTemplate === 'standard') {
          node.noteTemplate = 'standard';
          nodeStore.save(node);
          Modal.close();
          Toast.success('Reset to Standard format.');
          this._editMode = false;
          this._renderSection();
          return;
        }

        if (!hasAI) {
          node.noteTemplate = selectedTemplate;
          nodeStore.save(node);
          Modal.close();
          Toast.success('Template: ' + (templates.find(t=>t.id===selectedTemplate)?.name || selectedTemplate));
          this._editMode = false;
          this._renderSection();
          return;
        }

        // AI rewrite
        const applyBtn = document.getElementById('nt-apply-btn');
        const progress = document.getElementById('nt-progress');
        if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Rewriting…'; }
        if (progress) progress.style.display = 'block';

        try {
          const result = await AIService.rewriteAsTemplate(node, selectedTemplate);
          node.noteTemplate = selectedTemplate;
          if (result.type === 'cornell')  node.cornellData = result.data;
          if (result.type === 'outline')  node.outlineData = result.data;
          if (result.type === 'feynman')  node.feynmanData2 = result.data;
          nodeStore.save(node);
          Modal.close();
          Toast.success('Notes restructured as ' + (templates.find(t=>t.id===selectedTemplate)?.name || selectedTemplate) + '.');
          this._editMode = false;
          this._renderSection();
        } catch(err) {
          if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = '⬡ Apply with AI'; }
          if (progress) progress.style.display = 'none';
          Toast.error('Could not rewrite: ' + err.message);
        }
      });
    }, 0);
  },

  /* ─── EDIT MODE ───────────────────────────────────── */
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ EDIT MODE
  // ═══════════════════════════════════════════════════════════════════════════
  _toggleEditMode() {
    this._editMode = !this._editMode;
    const btn = document.getElementById('edit-toggle-btn');
    if (this._editMode) {
      if (btn) { btn.textContent = '✓ Save'; btn.className = 'btn-primary'; btn.style.fontSize = '12px'; btn.style.padding = '8px 14px'; }
      // Route to block editor for modern nodes, legacy form for old ones
      const node = this._currentNode;
      if (node.blocks?.length) {
        this._renderBlockEditor(node);
      } else {
        this._renderEditForm(node);
      }
    } else {
      const node = this._currentNode;
      if (node.blocks?.length) {
        this._saveBlockEdits();
      } else {
        this._saveEdits();
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ BLOCK EDITOR — inline editing for nodes with blocks[]
  // ═══════════════════════════════════════════════════════════════════════════
  _renderBlockEditor(node) {
    const esc = this._esc.bind(this);
    let html = '<div id="block-editor">';

    // Title
    html += '<div class="edit-section">'
      + '<label class="config-label">Title</label>'
      + '<input type="text" id="edit-title" class="config-input" value="' + esc(node.title) + '" style="font-family:var(--font-ui);font-size:15px;font-weight:700;padding:12px 14px;"/>'
      + '</div>';

    // Blocks
    node.blocks.forEach((b, idx) => {
      html += '<div class="edit-section block-edit-block" data-block-idx="' + idx + '" style="position:relative;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
        + '<label class="config-label" style="margin:0;text-transform:uppercase;font-size:9px;letter-spacing:.1em;color:var(--accent);">' + esc(b.type) + (b.title ? ' — ' + esc(b.title) : '') + '</label>'
        + '<button class="edit-del-btn block-del-btn" data-block-idx="' + idx + '" title="Remove this block">✕</button>'
        + '</div>';

      switch (b.type) {
        case 'prose':
        case 'callout':
          html += '<input type="text" class="config-input bef-title" data-idx="' + idx + '" placeholder="Title (optional)" value="' + esc(b.title || '') + '" style="margin-bottom:8px;font-size:13px;"/>';
          html += '<textarea class="config-input bef-html" data-idx="' + idx + '" rows="5" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.65;">' + esc((b.html || '').replace(/<[^>]+>/g, '')) + '</textarea>';
          break;
        case 'definition':
          html += '<input type="text" class="config-input bef-title" data-idx="' + idx + '" placeholder="Block title" value="' + esc(b.title || '') + '" style="margin-bottom:10px;font-size:13px;"/>';
          html += '<div class="bef-def-list" data-idx="' + idx + '">';
          (b.items || []).forEach((d, di) => {
            html += '<div class="bef-def-row" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;">'
              + '<div style="display:flex;gap:8px;align-items:flex-start;">'
              + '<div style="flex:1;display:flex;flex-direction:column;gap:6px;">'
              + '<input type="text" class="config-input bef-def-term" data-idx="' + idx + '" data-di="' + di + '" placeholder="Term" value="' + esc(d.term) + '" style="font-weight:600;font-size:13px;"/>'
              + '<input type="text" class="config-input bef-def-ex" data-idx="' + idx + '" data-di="' + di + '" placeholder="Examples (optional)" value="' + esc(d.examples || '') + '" style="font-size:12px;color:var(--text-secondary);"/>'
              + '<textarea class="config-input bef-def-desc" data-idx="' + idx + '" data-di="' + di + '" rows="2" style="resize:vertical;font-size:13px;line-height:1.5;">' + esc(d.description) + '</textarea>'
              + '</div>'
              + '<button class="edit-del-btn bef-del-def" data-idx="' + idx + '" data-di="' + di + '">✕</button>'
              + '</div></div>';
          });
          html += '</div>';
          html += '<button class="btn-secondary bef-add-def" data-idx="' + idx + '" style="font-size:11px;padding:5px 12px;margin-top:4px;">+ Add definition</button>';
          break;
        case 'formula':
          html += '<input type="text" class="config-input bef-title" data-idx="' + idx + '" placeholder="Block title" value="' + esc(b.title || '') + '" style="margin-bottom:10px;font-size:13px;"/>';
          (b.items || []).forEach((f, fi) => {
            html += '<div class="bef-formula-row" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;">'
              + '<div style="display:flex;gap:8px;margin-bottom:6px;">'
              + '<input type="text" class="config-input bef-f-expr" data-idx="' + idx + '" data-fi="' + fi + '" placeholder="Expression" value="' + esc(f.expression) + '" style="flex:1;font-family:var(--font-mono);font-size:13px;"/>'
              + '<button class="edit-del-btn bef-del-formula" data-idx="' + idx + '" data-fi="' + fi + '">✕</button>'
              + '</div>'
              + '<input type="text" class="config-input bef-f-desc" data-idx="' + idx + '" data-fi="' + fi + '" placeholder="Description" value="' + esc(f.description || '') + '" style="margin-bottom:6px;font-size:13px;"/>'
              + '<input type="text" class="config-input bef-f-con" data-idx="' + idx + '" data-fi="' + fi + '" placeholder="Constraints" value="' + esc(f.constraints || '') + '" style="font-size:13px;"/>'
              + '</div>';
          });
          html += '<button class="btn-secondary bef-add-formula" data-idx="' + idx + '" style="font-size:11px;padding:5px 12px;margin-top:4px;">+ Add formula</button>';
          break;
        case 'procedure':
          html += '<input type="text" class="config-input bef-title" data-idx="' + idx + '" placeholder="Procedure title" value="' + esc(b.title || '') + '" style="margin-bottom:6px;font-size:13px;"/>';
          html += '<input type="text" class="config-input bef-applies" data-idx="' + idx + '" placeholder="Applies to (optional)" value="' + esc(b.appliesTo || '') + '" style="margin-bottom:10px;font-size:12px;color:var(--text-secondary);"/>';
          html += '<div class="bef-steps-list" data-idx="' + idx + '">';
          (b.steps || []).forEach((s, si) => {
            html += '<div class="bef-step-row" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;">'
              + '<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--accent);padding-top:10px;min-width:18px;">' + (si + 1) + '.</span>'
              + '<textarea class="config-input bef-step" data-idx="' + idx + '" data-si="' + si + '" rows="2" style="flex:1;resize:vertical;font-size:13px;line-height:1.5;">' + esc(s) + '</textarea>'
              + '<button class="edit-del-btn bef-del-step" data-idx="' + idx + '" data-si="' + si + '" style="margin-top:4px;">✕</button>'
              + '</div>';
          });
          html += '</div>';
          html += '<input type="text" class="config-input bef-notes" data-idx="' + idx + '" placeholder="Notes (optional)" value="' + esc(b.notes || '') + '" style="font-size:12px;color:var(--text-secondary);margin-top:4px;"/>';
          html += '<button class="btn-secondary bef-add-step" data-idx="' + idx + '" style="font-size:11px;padding:5px 12px;margin-top:8px;">+ Add step</button>';
          break;
        case 'table':
          html += '<input type="text" class="config-input bef-title" data-idx="' + idx + '" placeholder="Table title" value="' + esc(b.title || '') + '" style="margin-bottom:8px;font-size:13px;"/>';
          html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:8px;">Table editing: use Edit → Plain Import to modify complex tables.</div>';
          break;
        default:
          html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Interactive block — title editable only.</div>';
          html += '<input type="text" class="config-input bef-title" data-idx="' + idx + '" placeholder="Block title" value="' + esc(b.title || '') + '" style="font-size:13px;"/>';
      }

      html += '</div>';
    });

    html += '<div class="edit-section"><label class="config-label">My Notes</label>'
      + '<textarea id="edit-user-notes" class="config-input" rows="4" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.65;" placeholder="Personal notes, mnemonics…">' + esc(node.userNotes || '') + '</textarea></div>';

    html += '</div>';
    document.getElementById('notes-display').innerHTML = html;
    this._bindBlockEditorEvents(node);
  },

  _bindBlockEditorEvents(node) {
    const container = document.getElementById('block-editor');
    if (!container) return;

    // Delete a whole block
    container.querySelectorAll('.block-del-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.blockIdx);
        node.blocks.splice(idx, 1);
        nodeStore.save(node);
        this._renderBlockEditor(node);
      });
    });

    // Delete a definition item
    container.querySelectorAll('.bef-del-def').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const di  = parseInt(btn.dataset.di);
        node.blocks[idx].items?.splice(di, 1);
        nodeStore.save(node);
        this._renderBlockEditor(node);
      });
    });

    // Add a definition item
    container.querySelectorAll('.bef-add-def').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (!node.blocks[idx].items) node.blocks[idx].items = [];
        node.blocks[idx].items.push({ term: '', examples: '', description: '' });
        nodeStore.save(node);
        this._renderBlockEditor(node);
      });
    });

    // Delete a formula item
    container.querySelectorAll('.bef-del-formula').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const fi  = parseInt(btn.dataset.fi);
        node.blocks[idx].items?.splice(fi, 1);
        nodeStore.save(node);
        this._renderBlockEditor(node);
      });
    });

    // Add a formula item
    container.querySelectorAll('.bef-add-formula').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (!node.blocks[idx].items) node.blocks[idx].items = [];
        node.blocks[idx].items.push({ expression: '', description: '', constraints: '' });
        nodeStore.save(node);
        this._renderBlockEditor(node);
      });
    });

    // Delete a procedure step
    container.querySelectorAll('.bef-del-step').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const si  = parseInt(btn.dataset.si);
        node.blocks[idx].steps?.splice(si, 1);
        nodeStore.save(node);
        this._renderBlockEditor(node);
      });
    });

    // Add a procedure step
    container.querySelectorAll('.bef-add-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (!node.blocks[idx].steps) node.blocks[idx].steps = [];
        node.blocks[idx].steps.push('');
        nodeStore.save(node);
        this._renderBlockEditor(node);
      });
    });
  },

  _saveBlockEdits() {
    const node = this._currentNode;
    if (!node) { Toast.error('No node to save.'); return; }

    const snapshot = JSON.stringify(node.toJSON ? node.toJSON() : node);
    try {
      // Title
      const titleEl = document.getElementById('edit-title');
      if (titleEl) node.title = titleEl.value.trim() || node.title;

      // User notes
      const notesEl = document.getElementById('edit-user-notes');
      if (notesEl) node.userNotes = notesEl.value;

      // Walk each block and read updated values
      document.querySelectorAll('.block-edit-block').forEach(blockEl => {
        const idx = parseInt(blockEl.dataset.blockIdx);
        const b   = node.blocks[idx];
        if (!b) return;

        // Title applies to all block types
        const titleInput = blockEl.querySelector('.bef-title');
        if (titleInput) b.title = titleInput.value.trim();

        switch (b.type) {
          case 'prose':
          case 'callout': {
            const htmlEl = blockEl.querySelector('.bef-html');
            if (htmlEl) b.html = htmlEl.value.replace(/\n/g, '<br>');
            break;
          }
          case 'definition': {
            const rows = blockEl.querySelectorAll('.bef-def-row');
            b.items = Array.from(rows).map(row => ({
              term:        row.querySelector('.bef-def-term')?.value.trim() || '',
              examples:    row.querySelector('.bef-def-ex')?.value.trim()   || '',
              description: row.querySelector('.bef-def-desc')?.value.trim() || '',
            })).filter(d => d.term || d.description);
            break;
          }
          case 'formula': {
            const rows = blockEl.querySelectorAll('.bef-formula-row');
            b.items = Array.from(rows).map(row => ({
              expression:  row.querySelector('.bef-f-expr')?.value.trim() || '',
              description: row.querySelector('.bef-f-desc')?.value.trim() || '',
              constraints: row.querySelector('.bef-f-con')?.value.trim()  || '',
            })).filter(f => f.expression);
            break;
          }
          case 'procedure': {
            const appEl = blockEl.querySelector('.bef-applies');
            if (appEl) b.appliesTo = appEl.value.trim();
            const notesEl2 = blockEl.querySelector('.bef-notes');
            if (notesEl2) b.notes = notesEl2.value.trim();
            const steps = blockEl.querySelectorAll('.bef-step');
            b.steps = Array.from(steps).map(s => s.value.trim()).filter(Boolean);
            break;
          }
        }
      });

      node.invalidateContentCaches();
      nodeStore.save(node);
      Toast.success('Notes saved!');
      const btn = document.getElementById('edit-toggle-btn');
      if (btn) { btn.textContent = '✏️ Edit'; btn.className = 'btn-secondary'; btn.style.fontSize = '12px'; btn.style.padding = '8px 14px'; }
      this._editMode = false;
      this._renderNotes(node);
    } catch(e) {
      console.error('[NodeDetailView] Block save failed, rolling back:', e);
      try { Object.assign(node, JSON.parse(snapshot)); nodeStore.save(node); } catch(e2) {}
      Toast.error('Save failed — your last edit was not stored. Try again.');
    }
  },

  _renderEditForm(node) {
    const tmpl = node.noteTemplate || 'standard';
    const templateForm = tmpl !== 'standard' ? NoteTemplates.renderEditForm(node) : null;

    document.getElementById('notes-display').innerHTML =
      (templateForm
        ? '<div class="edit-section"><label class="config-label" style="margin-bottom:12px;">' + (NoteTemplates.TEMPLATES[tmpl]?.icon||'') + ' ' + (NoteTemplates.TEMPLATES[tmpl]?.name||'') + '</label>' + templateForm + '</div>'
        : '')

      + '<div class="edit-section">'
      + '<label class="config-label">Title</label>'
      + '<input type="text" id="edit-title" class="config-input" value="' + this._esc(node.title) + '" style="font-family:var(--font-ui);font-size:15px;font-weight:700;padding:12px 14px;"/>'
      + '</div>'

      // ── DEFINITIONS with examples ──
      + '<div class="edit-section">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<label class="config-label" style="margin:0;">Definitions</label>'
      + '<button class="btn-secondary" style="font-size:11px;padding:5px 12px;" id="add-def-btn">+ Add</button>'
      + '</div>'
      + '<div id="edit-defs" style="display:flex;flex-direction:column;gap:12px;">'
      + node.definitions.map(d =>
          '<div class="edit-def-row">'
          + '<div style="display:flex;gap:8px;align-items:flex-start;">'
          + '<div style="flex:1;display:flex;flex-direction:column;gap:6px;">'
          + '<input type="text" class="config-input edit-def-term" placeholder="Term" value="' + this._esc(d.term) + '" style="font-family:var(--font-mono);font-size:13px;font-weight:600;padding:10px 12px;"/>'
          + '<input type="text" class="config-input edit-def-examples" placeholder="Examples (optional): e.g. Cash, Equipment, Land…" value="' + this._esc(d.examples||'') + '" style="font-size:12px;padding:8px 12px;color:var(--text-secondary);"/>'
          + '<textarea class="config-input edit-def-desc" placeholder="Definition / description…" rows="3" style="font-family:var(--font-body);font-size:14px;line-height:1.65;padding:10px 12px;resize:vertical;touch-action:pan-y;">' + this._esc(d.description) + '</textarea>'
          + '</div>'
          + '<button class="edit-del-btn" style="margin-top:4px;">✕</button>'
          + '</div></div>'
        ).join('')
      + '</div></div>'

      // ── TABLES ──
      + '<div class="edit-section">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<label class="config-label" style="margin:0;">Tables</label>'
      + '<button class="btn-secondary" style="font-size:11px;padding:5px 12px;" id="add-table-btn">+ Add Table</button>'
      + '</div>'
      + '<div id="edit-tables" style="display:flex;flex-direction:column;gap:14px;">'
      + (node.tables||[]).map((tbl, ti) => this._renderTableEditor(tbl, ti)).join('')
      + '</div></div>'

      // ── FORMULAS ──
      + '<div class="edit-section">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<label class="config-label" style="margin:0;">Formulas</label>'
      + '<button class="btn-secondary" style="font-size:11px;padding:5px 12px;" id="add-formula-btn">+ Add</button>'
      + '</div>'
      + '<div id="edit-formulas" style="display:flex;flex-direction:column;gap:10px;">'
      + node.formulas.map(f =>
          '<div class="edit-row" style="flex-direction:column;gap:6px;align-items:stretch;padding:14px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);">'
          + '<div style="display:flex;gap:8px;"><input type="text" class="config-input edit-f-expr" placeholder="Expression" value="' + this._esc(f.expression) + '" style="flex:1;font-family:var(--font-mono);font-size:13px;"/><button class="edit-del-btn">✕</button></div>'
          + '<input type="text" class="config-input edit-f-desc" placeholder="Description" value="' + this._esc(f.description) + '" style="font-size:13px;"/>'
          + '<input type="text" class="config-input edit-f-con"  placeholder="Constraints"  value="' + this._esc(f.constraints||'') + '" style="font-size:13px;"/>'
          + '</div>'
        ).join('')
      + '</div></div>'

      // ── STRUCTURED PROCEDURES ──
      + '<div class="edit-section">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<label class="config-label" style="margin:0;">Procedures</label>'
      + '<button class="btn-secondary" style="font-size:11px;padding:5px 12px;" id="add-proc-group-btn">+ Add Procedure</button>'
      + '</div>'
      + '<div id="edit-proc-groups" style="display:flex;flex-direction:column;gap:14px;">'
      + (node.procedures||[]).map((proc, gi) => this._renderProcEditor(proc, gi)).join('')
      + '</div></div>'

      // ── COMMON MISTAKES ──
      + '<div class="edit-section">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<label class="config-label" style="margin:0;">Common Mistakes</label>'
      + '<button class="btn-secondary" style="font-size:11px;padding:5px 12px;" id="add-mistake-btn">+ Add</button>'
      + '</div>'
      + '<div id="edit-mistakes" style="display:flex;flex-direction:column;gap:8px;">'
      + node.commonMistakes.map(m =>
          '<div class="edit-row"><input type="text" class="config-input edit-mistake" placeholder="Mistake…" value="' + this._esc(m) + '" style="flex:1;font-size:13px;padding:10px 12px;"/><button class="edit-del-btn">✕</button></div>'
        ).join('')
      + '</div></div>'

      + '<div class="edit-section"><label class="config-label">Summary</label>'
      + '<textarea id="edit-summary" class="config-input" rows="4" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.65;">' + this._esc(node.summary) + '</textarea></div>'

      + '<div class="edit-section"><label class="config-label">My Notes</label>'
      + '<textarea id="edit-user-notes" class="config-input" rows="5" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.65;" placeholder="Personal notes, mnemonics…">' + this._esc(node.userNotes||'') + '</textarea></div>';

    if (tmpl === 'outline') NoteTemplates.bindOutlineEditor();
    ImageManager.bindEvents(this._body, node);
    this._bindEditEvents(node);
  },

  /* ─── PROCEDURE EDITOR ────────────────────────────── */
  _renderProcEditor(proc, gi) {
    const steps = proc.steps || [];
    const id    = proc.id || 'proc_' + gi;
    return '<div class="proc-edit-group" data-proc-id="' + id + '">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">'
      + '<input type="text" class="config-input proc-title-input" placeholder="Procedure title…" value="' + this._esc(proc.title||'') + '" style="flex:1;font-size:14px;font-weight:700;padding:10px 12px;"/>'
      + '<button class="edit-del-btn proc-del-btn" data-proc-id="' + id + '">✕ Remove</button>'
      + '</div>'
      + '<input type="text" class="config-input proc-applies-input" placeholder="Applies to / related concept (optional)…" value="' + this._esc(proc.appliesTo||'') + '" style="font-size:12px;padding:8px 12px;margin-bottom:10px;color:var(--text-secondary);"/>'
      + '<div class="proc-steps-list" data-proc-id="' + id + '">'
      + steps.map((s, si) =>
          '<div class="edit-row proc-step-row" data-proc-id="' + id + '">'
          + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:22px;padding-top:12px;">' + (si+1) + '.</span>'
          + '<input type="text" class="config-input proc-step-input" placeholder="Step…" value="' + this._esc(s) + '" style="flex:1;font-size:13px;padding:10px 12px;" data-proc-id="' + id + '"/>'
          + '<button class="edit-del-btn">✕</button>'
          + '</div>'
        ).join('')
      + '</div>'
      + '<button class="btn-secondary add-step-btn" data-proc-id="' + id + '" style="font-size:11px;padding:6px 12px;margin-top:6px;">+ Add Step</button>'
      + '<details style="margin-top:10px;">'
      + '<summary style="cursor:pointer;font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--text-muted);list-style:none;padding:6px 0;user-select:none;">📌 Procedure Notes &amp; Reminders</summary>'
      + '<textarea class="config-input proc-notes-input" placeholder="Reminders, exceptions, warnings, tips…" rows="3" style="margin-top:8px;resize:vertical;touch-action:pan-y;font-size:13px;" data-proc-id="' + id + '">' + this._esc(proc.notes||'') + '</textarea>'
      + '</details>'
      + '</div>';
  },

  /* ─── TABLE EDITOR ────────────────────────────────── */
  _renderTableEditor(tbl, ti) {
    const cols = tbl.columns || ['Name','Type','Example'];
    const rows = tbl.rows    || [];
    const id   = tbl.id || 'tbl_' + ti;
    return '<div class="table-edit-group" data-tbl-id="' + id + '">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
      + '<input type="text" class="config-input tbl-title-input" placeholder="Table title…" value="' + this._esc(tbl.title||'') + '" style="flex:1;font-size:14px;font-weight:700;padding:10px 12px;" data-tbl-id="' + id + '"/>'
      + '<button class="edit-del-btn tbl-del-btn" data-tbl-id="' + id + '">✕</button>'
      + '</div>'
      // Column headers (editable)
      + '<div style="display:grid;grid-template-columns:repeat(' + cols.length + ',1fr) 40px;gap:4px;margin-bottom:4px;">'
      + cols.map((c, ci) => '<input type="text" class="config-input tbl-col-input" value="' + this._esc(c) + '" style="font-size:11px;font-weight:700;padding:6px 8px;" data-tbl-id="' + id + '" data-col-idx="' + ci + '"/>').join('')
      + '<div></div>'
      + '</div>'
      // Rows
      + '<div class="tbl-rows-list" data-tbl-id="' + id + '" style="display:flex;flex-direction:column;gap:4px;">'
      + rows.map((row, ri) =>
          '<div class="tbl-row-wrap" style="display:grid;grid-template-columns:repeat(' + cols.length + ',1fr) 40px;gap:4px;" data-tbl-id="' + id + '">'
          + cols.map((_, ci) => '<input type="text" class="config-input tbl-cell-input" value="' + this._esc(row[ci]||'') + '" style="font-size:13px;padding:8px 10px;" data-tbl-id="' + id + '" data-col-idx="' + ci + '" data-row-idx="' + ri + '"/>').join('')
          + '<button class="edit-del-btn tbl-row-del-btn" data-tbl-id="' + id + '" data-row-idx="' + ri + '">✕</button>'
          + '</div>'
        ).join('')
      + '</div>'
      + '<button class="btn-secondary add-tbl-row-btn" data-tbl-id="' + id + '" style="font-size:11px;padding:6px 12px;margin-top:6px;">+ Add Row</button>'
      + '</div>';
  },

  /* ─── BIND EDIT EVENTS ────────────────────────────── */
  _bindEditEvents(node) {
    const editDefs = document.getElementById('edit-defs');
    const editProcs = document.getElementById('edit-proc-groups');
    const editTables = document.getElementById('edit-tables');

    // Add definition
    document.getElementById('add-def-btn')?.addEventListener('click', () => {
      const div = document.createElement('div');
      div.className = 'edit-def-row';
      div.innerHTML = '<div style="display:flex;gap:8px;align-items:flex-start;"><div style="flex:1;display:flex;flex-direction:column;gap:6px;"><input type="text" class="config-input edit-def-term" placeholder="Term" style="font-family:var(--font-mono);font-size:13px;font-weight:600;padding:10px 12px;"/><input type="text" class="config-input edit-def-examples" placeholder="Examples (optional)…" style="font-size:12px;padding:8px 12px;color:var(--text-secondary);"/><textarea class="config-input edit-def-desc" placeholder="Definition…" rows="3" style="font-family:var(--font-body);font-size:14px;line-height:1.65;padding:10px 12px;resize:vertical;touch-action:pan-y;"></textarea></div><button class="edit-del-btn" style="margin-top:4px;">✕</button></div>';
      editDefs.appendChild(div);
      div.querySelector('.edit-def-term').focus();
    });

    // Add procedure group
    document.getElementById('add-proc-group-btn')?.addEventListener('click', () => {
      const newProc = { id:'proc_' + Date.now().toString(36), title:'', appliesTo:'', steps:[], notes:'' };
      node.procedures = node.procedures || [];
      node.procedures.push(newProc);
      const div = document.createElement('div');
      div.innerHTML = this._renderProcEditor(newProc, node.procedures.length - 1);
      editProcs.appendChild(div.firstElementChild);
      editProcs.querySelector('.proc-edit-group:last-child .proc-title-input')?.focus();
    });

    // Add table
    document.getElementById('add-table-btn')?.addEventListener('click', () => {
      const newTbl = { id:'tbl_' + Date.now().toString(36), title:'', columns:['Name','Type','Example'], rows:[[]] };
      node.tables = node.tables || [];
      node.tables.push(newTbl);
      const div = document.createElement('div');
      div.innerHTML = this._renderTableEditor(newTbl, node.tables.length - 1);
      editTables.appendChild(div.firstElementChild);
      editTables.querySelector('.table-edit-group:last-child .tbl-title-input')?.focus();
    });

    // Delegate: add step, add table row, delete rows/procs/tables
    editProcs.addEventListener('click', e => {
      if (e.target.classList.contains('add-step-btn')) {
        const procId = e.target.dataset.procId;
        const list   = editProcs.querySelector('.proc-steps-list[data-proc-id="' + procId + '"]');
        const si     = list.querySelectorAll('.proc-step-row').length;
        const div = document.createElement('div');
        div.className = 'edit-row proc-step-row';
        div.dataset.procId = procId;
        div.innerHTML = '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:22px;padding-top:12px;">' + (si+1) + '.</span><input type="text" class="config-input proc-step-input" placeholder="Step…" style="flex:1;font-size:13px;padding:10px 12px;" data-proc-id="' + procId + '"/><button class="edit-del-btn">✕</button>';
        list.appendChild(div);
        div.querySelector('input').focus();
      }
      if (e.target.classList.contains('edit-del-btn')) {
        const row = e.target.closest('.proc-step-row,.proc-edit-group');
        if (row) row.remove();
      }
    });

    editTables.addEventListener('click', e => {
      if (e.target.classList.contains('add-tbl-row-btn')) {
        const tblId = e.target.dataset.tblId;
        const list  = editTables.querySelector('.tbl-rows-list[data-tbl-id="' + tblId + '"]');
        const colCount = list.closest('.table-edit-group').querySelectorAll('.tbl-col-input').length;
        const ri    = list.querySelectorAll('.tbl-row-wrap').length;
        const div   = document.createElement('div');
        div.className = 'tbl-row-wrap';
        div.dataset.tblId = tblId;
        div.style.cssText = 'display:grid;grid-template-columns:repeat(' + colCount + ',1fr) 40px;gap:4px;';
        div.innerHTML = Array.from({length:colCount}).map((_, ci) =>
          '<input type="text" class="config-input tbl-cell-input" style="font-size:13px;padding:8px 10px;" data-tbl-id="' + tblId + '" data-col-idx="' + ci + '" data-row-idx="' + ri + '"/>'
        ).join('') + '<button class="edit-del-btn tbl-row-del-btn" data-tbl-id="' + tblId + '">✕</button>';
        list.appendChild(div);
        div.querySelector('input').focus();
      }
      if (e.target.classList.contains('tbl-row-del-btn')) {
        e.target.closest('.tbl-row-wrap')?.remove();
      }
      if (e.target.classList.contains('tbl-del-btn')) {
        e.target.closest('.table-edit-group')?.remove();
      }
    });

    // Add formula
    document.getElementById('add-formula-btn')?.addEventListener('click', () => {
      const div = document.createElement('div');
      div.className = 'edit-row';
      div.style.cssText = 'flex-direction:column;gap:6px;align-items:stretch;padding:14px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);';
      div.innerHTML = '<div style="display:flex;gap:8px;"><input type="text" class="config-input edit-f-expr" placeholder="Expression" style="flex:1;font-family:var(--font-mono);font-size:13px;"/><button class="edit-del-btn">✕</button></div><input type="text" class="config-input edit-f-desc" placeholder="Description" style="font-size:13px;"/><input type="text" class="config-input edit-f-con" placeholder="Constraints" style="font-size:13px;"/>';
      div.querySelector('.edit-del-btn').addEventListener('click', () => div.remove());
      document.getElementById('edit-formulas').appendChild(div);
      div.querySelector('.edit-f-expr').focus();
    });

    // Add mistake
    document.getElementById('add-mistake-btn')?.addEventListener('click', () => {
      const div = document.createElement('div'); div.className = 'edit-row';
      div.innerHTML = '<input type="text" class="config-input edit-mistake" placeholder="Mistake…" style="flex:1;font-size:13px;padding:10px 12px;"/><button class="edit-del-btn">✕</button>';
      document.getElementById('edit-mistakes').appendChild(div);
      div.querySelector('input').focus();
    });

    // Delegate delete from definition rows + formula rows + mistakes
    document.getElementById('notes-display').addEventListener('click', e => {
      if (e.target.classList.contains('edit-del-btn') && !e.target.closest('#edit-proc-groups') && !e.target.closest('#edit-tables')) {
        e.target.closest('.edit-row, .edit-def-row')?.remove();
      }
    });
  },

  /* ─── SAVE EDITS ──────────────────────────────────── */
  _saveEdits() {
    const node = this._currentNode;
    if (!node) { Toast.error('No node to save.'); return; }
    const tmpl = node.noteTemplate || 'standard';

    // Take a snapshot before editing so we can roll back if save fails
    const snapshot = JSON.stringify(node.toJSON ? node.toJSON() : node);

    try {
    node.title    = document.getElementById('edit-title')?.value.trim()      || node.title;
    node.summary  = document.getElementById('edit-summary')?.value.trim()    || '';
    node.userNotes= document.getElementById('edit-user-notes')?.value        || '';

    // Definitions with examples
    node.definitions = Array.from(document.querySelectorAll('#edit-defs .edit-def-row')).map(r => ({
      term:        r.querySelector('.edit-def-term')?.value.trim()     || '',
      examples:    r.querySelector('.edit-def-examples')?.value.trim() || '',
      description: r.querySelector('.edit-def-desc')?.value.trim()    || '',
    })).filter(d => d.term || d.description);

    // Tables
    node.tables = [];
    document.querySelectorAll('#edit-tables .table-edit-group').forEach(tblEl => {
      const tblId  = tblEl.dataset.tblId;
      const title  = tblEl.querySelector('.tbl-title-input')?.value.trim() || '';
      const colEls = Array.from(tblEl.querySelectorAll('.tbl-col-input'));
      const cols   = colEls.map(c => c.value.trim() || 'Column');
      const rowEls = Array.from(tblEl.querySelectorAll('.tbl-row-wrap'));
      const rows   = rowEls.map(rowEl =>
        cols.map((_, ci) => rowEl.querySelector('[data-col-idx="' + ci + '"]')?.value.trim() || '')
      ).filter(r => r.some(c => c));
      if (title || rows.length) node.tables.push({ id:tblId, title, columns:cols, rows });
    });

    // Structured procedures
    node.procedures = [];
    document.querySelectorAll('#edit-proc-groups .proc-edit-group').forEach(grpEl => {
      const procId   = grpEl.dataset.procId;
      const title    = grpEl.querySelector('.proc-title-input')?.value.trim()   || '';
      const appliesTo= grpEl.querySelector('.proc-applies-input')?.value.trim() || '';
      const steps    = Array.from(grpEl.querySelectorAll('.proc-step-input')).map(i => i.value.trim()).filter(Boolean);
      const notes    = grpEl.querySelector('.proc-notes-input')?.value.trim()   || '';
      if (title || steps.length) node.procedures.push({ id:procId, title, appliesTo, steps, notes });
    });

    node.formulas    = Array.from(document.querySelectorAll('#edit-formulas .edit-row')).map(r => ({
      expression:  r.querySelector('.edit-f-expr')?.value.trim() || '',
      description: r.querySelector('.edit-f-desc')?.value.trim() || '',
      constraints: r.querySelector('.edit-f-con')?.value.trim()  || '',
    })).filter(f => f.expression);

    node.commonMistakes = Array.from(document.querySelectorAll('.edit-mistake')).map(i => i.value.trim()).filter(Boolean);

    if (tmpl === 'cornell') NoteTemplates.saveCornell(node);
    if (tmpl === 'outline') NoteTemplates.saveOutline(node);
    if (tmpl === 'feynman') NoteTemplates.saveFeynman(node);

    document.querySelectorAll('.img-caption-input').forEach(inp => {
      const img = node.userImages?.find(i => i.id === inp.dataset.imgId);
      if (img) img.caption = inp.value.trim();
    });

    ImageResponseBlock.saveAll(document.getElementById('notes-display'), node);
    node.invalidateContentCaches();
    nodeStore.save(node);
    Toast.success('Notes saved!');
    const btn = document.getElementById('edit-toggle-btn');
    if (btn) { btn.textContent='✏️ Edit'; btn.className='btn-secondary'; btn.style.fontSize='12px'; btn.style.padding='8px 14px'; }
    this._editMode = false;
    this._renderNotes(node);

    } catch(e) {
      // Rollback to snapshot
      console.error('[NodeDetailView] Save failed, rolling back:', e);
      try {
        const snap = JSON.parse(snapshot);
        Object.assign(node, snap);
        nodeStore.save(node);
      } catch(e2) { /* snapshot rollback failed, nothing we can do */ }
      Toast.error('Save failed — your last edit was not stored. Try again.');
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ ADD IMAGE
  // ═══════════════════════════════════════════════════════════════════════════
  _addUserImage() {
    const node   = this._currentNode;
    const hasAI     = AIService.hasApiKey();
    const hasVision = AIService.supportsVision();

    Modal.open(`
      <div style="font-family:var(--font-ui);">
        <h2 style="font-size:18px;font-weight:800;margin-bottom:6px;">Add Image</h2>
        <p style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);margin-bottom:20px;">
          What do you want to do with this image?
        </p>

        <div style="display:flex;flex-direction:column;gap:10px;">

          <button id="img-opt-extract" style="display:flex;align-items:center;gap:14px;padding:16px;
            background:${hasVision ? 'var(--accent-soft)' : 'var(--bg-raised)'};
            border:1px solid ${hasVision ? 'var(--accent-dim)' : 'var(--border)'};
            border-radius:14px;cursor:pointer;text-align:left;width:100%;
            opacity:${hasVision ? '1' : '0.5'};">
            <span style="font-size:26px;flex-shrink:0;">⬡</span>
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:3px;">
                Extract &amp; add to notes
              </div>
              <div style="font-family:var(--font-body);font-size:12px;color:var(--text-muted);">
                AI reads the image and adds the content to this node — definitions, tables, formulas, questions.
                ${!hasVision ? '<br><em>Requires a vision-capable AI provider (OpenRouter or Claude).</em>' : ''}
              </div>
            </div>
          </button>

          <button id="img-opt-question" style="display:flex;align-items:center;gap:14px;padding:16px;
            background:var(--bg-raised);
            border:1px solid var(--border);
            border-radius:14px;cursor:pointer;text-align:left;width:100%;
            opacity:${hasVision ? '1' : '0.5'};">
            <span style="font-size:26px;flex-shrink:0;">❓</span>
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:3px;">
                Generate questions from image
              </div>
              <div style="font-family:var(--font-body);font-size:12px;color:var(--text-muted);">
                AI reads the image and adds practice questions to this node's question bank.
                ${!hasVision ? '<br><em>Requires a vision-capable AI provider (OpenRouter or Claude).</em>' : ''}
              </div>
            </div>
          </button>

          <button id="img-opt-reference" style="display:flex;align-items:center;gap:14px;padding:16px;
            background:var(--bg-raised);border:1px solid var(--border);
            border-radius:14px;cursor:pointer;text-align:left;width:100%;">
            <span style="font-size:26px;flex-shrink:0;">🖼️</span>
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:3px;">
                Add as visual reference only
              </div>
              <div style="font-family:var(--font-body);font-size:12px;color:var(--text-muted);">
                Attach the image to these notes as a diagram, chart, or reference photo.
              </div>
            </div>
          </button>

        </div>
      </div>
    `);

    const pickFile = () => new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = false;
      inp.addEventListener('change', async () => {
        if (!inp.files[0]) return resolve(null);
        const file = inp.files[0];
        const b64  = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        resolve(b64);
      });
      inp.click();
    });

    // ── Option 1: extract & merge into node ──────────────────
    document.getElementById('img-opt-extract')?.addEventListener('click', async () => {
      if (!hasVision) {
        Toast.error('Your current AI provider does not support image reading. Switch to OpenRouter or Claude in Settings.');
        return;
      }
      Modal.close();
      const b64 = await pickFile();
      if (!b64) return;

      Toast.info('⬡ Reading image and extracting content…');
      try {
        // Reuse processContent — treats image as additional source material
        const meta = { subject: node.subject, chapter: node.chapter, detail: 'standard', profile: node.learnerProfile };
        const extracted = await AIService.processContent([b64], '', meta, () => {});

        // Merge definitions
        if (extracted.definitions?.length) {
          node.definitions = node.definitions || [];
          extracted.definitions.forEach(d => {
            if (!node.definitions.find(e => e.term === d.term)) node.definitions.push(d);
          });
        }
        // Merge tables
        if (extracted.tables?.length) {
          node.tables = node.tables || [];
          extracted.tables.forEach(t => node.tables.push(t));
        }
        // Merge formulas
        if (extracted.formulas?.length) {
          node.formulas = node.formulas || [];
          extracted.formulas.forEach(f => {
            if (!node.formulas.find(e => e.expression === f.expression)) node.formulas.push(f);
          });
        }
        // Merge procedures
        if (extracted.procedures?.length) {
          node.procedures = node.procedures || [];
          extracted.procedures.forEach(p => node.procedures.push(p));
        }
        // Merge questions
        if (extracted.questions?.length) {
          node.questions = node.questions || [];
          extracted.questions.forEach(q => node.questions.push({ ...q, id: KnowledgeNode._generateQuestionId() }));
        }
        // Also merge into blocks if node uses them
        if (node.blocks?.length && extracted.definitions?.length) {
          const newDefs = extracted.definitions.filter(d =>
            !node.blocks.some(b => b.type === 'definition' &&
              b.items?.some(i => i.term === d.term))
          );
          if (newDefs.length) {
            node.blocks.push({
              id: KnowledgeNode._generateBlockId(),
              type: 'definition',
              title: 'From image',
              items: newDefs,
            });
          }
        }
        // Store the image as a visual reference too
        node.userImages = node.userImages || [];
        node.userImages.push({ id: KnowledgeNode._generateImageId(), base64: b64, caption: extracted.title || 'Image', width: 60 });

        node.invalidateContentCaches();
        nodeStore.save(node);
        this._renderSection();
        const count = (extracted.definitions?.length||0) + (extracted.formulas?.length||0)
                    + (extracted.procedures?.length||0) + (extracted.questions?.length||0);
        Toast.success('Extracted ' + count + ' items from image and added to notes ✓');
      } catch(e) {
        Toast.error('Extraction failed: ' + (e.message || 'Try again'));
      }
    });

    // ── Option 2: generate questions only ────────────────────
    document.getElementById('img-opt-question')?.addEventListener('click', async () => {
      if (!hasAI) { Toast.info('Configure AI in Settings first.'); return; }
      if (!AIService.supportsVision()) {
        Toast.error('Your current AI provider does not support image reading. Switch to OpenRouter or Claude in Settings.');
        return;
      }
      Modal.close();
      const b64 = await pickFile();
      if (!b64) return;

      Toast.info('⬡ Generating questions from image…');
      try {
        const prompt = LearnerContext.forQuestionGen(node)
          + '\n\nAdditional image provided. Read the image and generate 3-5 practice questions '
          + 'based on what is shown in it. Questions must be answerable from the image content. '
          + 'Output ONLY JSON: {"recall":[{"question":"","answer":""}],"application":[{"question":"","answer":""}]}';

        const msgs = [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } },
            { type: 'text', text: prompt },
          ],
        }];
        const raw  = await AIService._callWithFunction('questionGen', msgs, 1200);
        const data = AIService._parseJSON(raw);

        const newQs = [
          ...(data.recall||[]).map(q => ({ id: KnowledgeNode._generateQuestionId(), type: 'recall',      question: q.question, answer: q.answer })),
          ...(data.application||[]).map(q => ({ id: KnowledgeNode._generateQuestionId(), type: 'application', question: q.question, answer: q.answer })),
        ];

        node.questions = node.questions || [];
        node.questions.push(...newQs);

        // Store image as reference
        node.userImages = node.userImages || [];
        node.userImages.push({ id: KnowledgeNode._generateImageId(), base64: b64, caption: 'Question source', width: 60 });

        nodeStore.save(node);
        this._renderSection();
        Toast.success(newQs.length + ' questions generated from image ✓');
      } catch(e) {
        Toast.error('Question generation failed: ' + (e.message || 'Try again'));
      }
    });

    // ── Option 3: visual reference only (original behaviour) ─
    document.getElementById('img-opt-reference')?.addEventListener('click', async () => {
      Modal.close();
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.addEventListener('change', async () => {
        for (const file of Array.from(inp.files)) {
          const b64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          node.userImages = node.userImages || [];
          node.userImages.push({ id: KnowledgeNode._generateImageId(), base64: b64, caption: '', width: 50 });
        }
        nodeStore.save(node);
        this._renderSection();
        Toast.success('Image added to notes.');
      });
      inp.click();
    });
  },

  /* ─── AI FLOATER — Redesigned ─────────────────────── */
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ AI FLOATER
  // ═══════════════════════════════════════════════════════════════════════════
  _showAIFloater() {
    // Remove any existing floaters (guards against double-render)
    document.querySelectorAll('#ai-floater, .ai-floater').forEach(el => el.remove());
    const floater = document.createElement('div');
    floater.id = 'ai-floater';
    floater.innerHTML =
      // Toggle button
      '<button id="ai-floater-btn" title="AI Study Assistant" aria-label="Open AI Assistant">'
      + '<span id="ai-floater-icon">⬡</span>'
      + '</button>'

      // Panel
      + '<div id="ai-floater-panel" class="hidden">'

      // Header
      + '<div class="aif-header">'
      + '<span class="aif-title">⬡ Ask AI</span>'
      + '<button id="ai-floater-close" class="aif-close-btn" aria-label="Close">✕</button>'
      + '</div>'

      // Simplified 2-column grid — only the most useful actions
      + '<div id="aif-home">'
      + '<div class="aif-card-grid" style="grid-template-columns:repeat(2,1fr);gap:8px;padding:4px 0;">'
      + '<button class="aif-card" id="aif-explain"><span class="aif-card-icon">💡</span><span class="aif-card-text">Explain<br><small>Why it matters</small></span></button>'
      + '<button class="aif-card" id="aif-simplify"><span class="aif-card-icon">🔤</span><span class="aif-card-text">Simplify<br><small>Plain language</small></span></button>'
      + '<button class="aif-card" id="aif-quiz"><span class="aif-card-icon">❓</span><span class="aif-card-text">Quick Quiz<br><small>Test yourself</small></span></button>'
      + '<button class="aif-card" id="aif-gaps"><span class="aif-card-icon">🔍</span><span class="aif-card-text">My Gaps<br><small>What to focus on</small></span></button>'
      + '<button class="aif-card" id="aif-adapt-to"><span class="aif-card-icon">📐</span><span class="aif-card-text">Adapt Format<br><small>Change style</small></span></button>'
      + '<button class="aif-card" id="aif-gen-image"><span class="aif-card-icon">📷</span><span class="aif-card-text">From Image<br><small>Scan & add</small></span></button>'
      + '</div>'

      // Ask anything
      + '<div class="aif-section-label">Ask Anything</div>'
      + '<div class="aif-ask-row">'
      + '<input type="text" id="aif-custom-input" class="aif-custom-input" placeholder="Ask a question about this topic…"/>'
      + '<button id="aif-custom-send" class="aif-send-btn" aria-label="Send">→</button>'
      + '</div>'

      + '</div>' // end #aif-home

      // RESULT SCREEN
      + '<div id="aif-result-screen" class="hidden">'
      + '<div class="aif-result-label" id="aif-result-label">Response</div>'
      + '<div id="ai-floater-text" class="ai-floater-text"></div>'
      + '<button class="aif-back-btn" id="aif-back">← Back</button>'
      + '</div>'

      + '</div>'; // end panel

    document.body.appendChild(floater);

    const btn    = document.getElementById('ai-floater-btn');
    const panel  = document.getElementById('ai-floater-panel');
    const home   = document.getElementById('aif-home');
    const result = document.getElementById('aif-result-screen');
    const textEl = document.getElementById('ai-floater-text');

    // Toggle panel
    btn.addEventListener('click', () => {
      const hidden = panel.classList.toggle('hidden');
      btn.classList.toggle('active', !hidden);
    });
    document.getElementById('ai-floater-close').addEventListener('click', () => {
      panel.classList.add('hidden'); btn.classList.remove('active');
    });

    // Show result screen with label
    const showResult = async (promptText, label) => {
      home.classList.add('hidden');
      result.classList.remove('hidden');
      document.getElementById('aif-result-label').textContent = label || 'Response';
      textEl.textContent = '';

      // Spinner
      textEl.innerHTML = '<div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div>';

      try {
        const node = this._currentNode;
        // Route through the central brain — same context every other AI feature uses.
        // This gives the floater hard rules, full source, the learner's weak areas,
        // history, and any corrections the user has recorded for this node.
        const ctx = LearnerContext.forNode(node);

        const response = AIService.hasApiKey()
          ? await AIService._callWithFunction('chat', [{role:'user', content: ctx + '\n\n' + promptText}], 800)
          : this._mockAI(promptText, node);

        // Render as formatted paragraphs (split on newlines)
        textEl.innerHTML = response
          .split('\n')
          .filter(l => l.trim())
          .map(l => '<p style="margin:0 0 10px;font-family:var(--font-body);font-size:14px;line-height:1.7;color:var(--text-primary);">' + this._esc(l) + '</p>')
          .join('');

      } catch(e) {
        textEl.innerHTML = '<p style="font-family:var(--font-mono);font-size:13px;color:var(--red);">'
          + this._esc(e.message || 'Something went wrong. Check your AI settings.') + '</p>'
          + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);margin-top:8px;">Go to More → Settings → Configure AI to set up your key.</p>';
      }
    };

    // Wire action cards
    document.getElementById('aif-explain')    ?.addEventListener('click', () => showResult(
      'Explain this topic clearly. Cover: (1) what it is, (2) why it matters, (3) how it connects to real-world accounting/tax scenarios. Be thorough — 3-4 paragraphs.',
      '💡 Explanation'));
    document.getElementById('aif-simplify')   ?.addEventListener('click', () => showResult(
      'Explain this topic as if talking to a 16-year-old with no accounting background. Use a simple real-world analogy. Avoid all jargon. Keep it conversational.',
      '🔤 Simple Version'));
    document.getElementById('aif-example')    ?.addEventListener('click', () => showResult(
      'Give one detailed worked example applying this topic. Include: (1) a realistic scenario with specific numbers, (2) step-by-step working, (3) the final answer and interpretation. Format clearly.',
      '🧩 Worked Example'));
    document.getElementById('aif-quiz')       ?.addEventListener('click', () => showResult(
      'Create 3 questions to test my understanding: 1 definition/recall, 1 application, 1 "what if" scenario question. Number them clearly. Include the answer below each question (labelled "Answer:").',
      '❓ Quick Quiz'));
    document.getElementById('aif-gaps')       ?.addEventListener('click', () => showResult(
      'Identify the 3 most common gaps or mistakes students make on this topic. For each gap: (1) describe it clearly, (2) explain why it happens, (3) give the correct understanding. Be specific to this subject.',
      '🔍 Common Gaps'));
    document.getElementById('aif-exam-q')     ?.addEventListener('click', () => { panel.classList.add('hidden'); btn.classList.remove('active'); AINodeTools.generateExamQuestion(this._currentNode); });
    document.getElementById('aif-gen-image')  ?.addEventListener('click', () => { panel.classList.add('hidden'); btn.classList.remove('active'); AINodeTools.generateFromImage(this._currentNode, 'auto'); });
    document.getElementById('aif-restructure') ?.addEventListener('click', () => { panel.classList.add('hidden'); btn.classList.remove('active'); AINodeTools.restructureNotes(this._currentNode); });
    document.getElementById('aif-adapt-to')    ?.addEventListener('click', () => { panel.classList.add('hidden'); btn.classList.remove('active'); this._openTemplatePanel(); });

    // Ask anything — inline input, no native prompt()
    const sendCustom = () => {
      const q = document.getElementById('aif-custom-input')?.value?.trim();
      if (!q) return;
      document.getElementById('aif-custom-input').value = '';
      showResult(q, '✏ ' + q.slice(0, 30) + (q.length > 30 ? '…' : ''));
    };
    document.getElementById('aif-custom-send')?.addEventListener('click', sendCustom);
    document.getElementById('aif-custom-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCustom(); }
    });

    // Back button
    document.getElementById('aif-back')?.addEventListener('click', () => {
      result.classList.add('hidden');
      home.classList.remove('hidden');
      textEl.innerHTML = '';
    });
  },

  _mockAI(prompt, node) {
    if (prompt.includes('example'))  return 'Example: Given a scenario involving ' + node.title + ':\n1. Identify the relevant values\n2. Apply the rule\n3. Check exceptions\n4. Interpret the result\n\n(Configure AI in Settings for personalised examples.)';
    if (prompt.includes('quiz'))     return 'Q1: Define ' + node.title + ' in your own words.\nQ2: When would you apply this concept?\nQ3: What is the most common mistake here?\n\n(Configure AI for personalised questions.)';
    if (prompt.includes('gaps'))     return 'Common gap areas: 1. Confusing when to apply vs not apply\n2. Missing exceptions\n3. Formula variable meanings\n\n(Configure AI for personalised gap analysis.)';
    return node.title + ' is a core concept in ' + node.subject + '. ' + (node.summary || 'Study the definitions and procedures carefully.') + '\n\n(Configure AI in Settings for personalised explanations.)';
  },

  /* ─── QUESTIONS ───────────────────────────────────── */
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ QUESTIONS TAB
  // ═══════════════════════════════════════════════════════════════════════════
  _renderQuestions(node) {
    const hasAI = AIService.hasApiKey();
    this._body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">'
      + '<h2 style="font-family:var(--font-ui);font-size:21px;font-weight:800;letter-spacing:-0.02em;">Questions</h2>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + (hasAI ? '<button class="btn-secondary" id="regen-q-btn" style="font-size:12px;">⟳ Regenerate</button>' : '')
      + '<button class="btn-secondary" id="add-q-btn" style="font-size:12px;">+ Add Question</button>'
      + '</div>'
      + '</div>'
      + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:18px;">💡 Select text in Notes to create a question instantly. Edit or delete any question using the buttons below.</p>'
      + '<div id="questions-list">' + this._renderQList(node) + '</div>'
      + '<div id="add-q-form" style="display:none;margin-top:18px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-lg);padding:22px;">'
      + '<div class="notes-section-title" style="margin-bottom:14px;">New Question</div>'
      + '<div class="config-row" style="margin-bottom:12px;"><label class="config-label">Type</label><select id="new-q-type" class="config-select"><option value="recall">🔁 Recall</option><option value="application">🧩 Application</option></select></div>'
      + '<div class="config-row" style="margin-bottom:12px;"><label class="config-label">Question</label><textarea id="new-q-question" class="config-input" rows="2" style="resize:vertical;touch-action:pan-y;"></textarea></div>'
      + '<div class="config-row" style="margin-bottom:16px;"><label class="config-label">Answer</label><textarea id="new-q-answer" class="config-input" rows="3" style="resize:vertical;touch-action:pan-y;"></textarea></div>'
      + '<div style="display:flex;gap:8px;"><button class="btn-primary" id="save-q-btn">Add Question</button><button class="btn-secondary" id="cancel-q-btn">Cancel</button></div>'
      + '</div>';

    document.getElementById('regen-q-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('regen-q-btn');
      if (btn) { btn.textContent = '⟳ Regenerating…'; btn.disabled = true; }
      try {
        const meta = { subject: node.subject, chapter: node.chapter, detail: 'standard', profile: node.learnerProfile };
        const src  = LearnerContext._buildSourceText(node, 8000);
        const notes = {
          title:       node.title,
          definitions: node.definitions || [],
          formulas:    node.formulas    || [],
          procedures:  node.procedures  || [],
          tables:      node.tables      || [],
          summary:     node.summary     || src.slice(0, 500),
        };
        const qData = await AIService._generateQuestions(notes, meta);
        const newQs = [
          ...(qData.recall      || []).map(q => ({ id: KnowledgeNode._generateQuestionId(), type: 'recall',      question: q.question, answer: q.answer })),
          ...(qData.application || []).map(q => ({ id: KnowledgeNode._generateQuestionId(), type: 'application', question: q.question, answer: q.answer })),
        ];
        if (newQs.length) {
          node.questions = newQs;
          node.ucQuestionCache = null; // content emphasis changed — regenerate UC questions next time
          nodeStore.save(node);
          document.getElementById('questions-list').innerHTML = this._renderQList(node);
          Toast.success(newQs.length + ' questions regenerated from source ✓');
        } else {
          Toast.error('No questions returned. Try again.');
        }
      } catch(e) {
        Toast.error('Regeneration failed: ' + (e.message || 'Try again'));
      } finally {
        if (btn) { btn.textContent = '⟳ Regenerate'; btn.disabled = false; }
      }
    });
    document.getElementById('add-q-btn').addEventListener('click',    () => { document.getElementById('add-q-form').style.display='block'; document.getElementById('new-q-question').focus(); });
    document.getElementById('save-q-btn').addEventListener('click',   () => this._saveNewQuestion());
    document.getElementById('cancel-q-btn').addEventListener('click', () => { document.getElementById('add-q-form').style.display='none'; });
    document.getElementById('questions-list').addEventListener('click', e => {
      // Delete
      const del = e.target.closest('[data-delete-q]');
      if (del && !del.dataset.editQ) { this._deleteQuestion(del.dataset.deleteQ); return; }

      // Toggle answer
      const tog = e.target.closest('.question-answer-toggle');
      if (tog) {
        const qid = tog.dataset.qid;
        const ans = document.getElementById('qa-' + qid);
        if (ans) {
          const hidden = ans.classList.toggle('hidden');
          tog.textContent = hidden ? 'Show Answer' : 'Hide Answer';
        }
        return;
      }

      // Open edit form
      const edit = e.target.closest('[data-edit-q]');
      if (edit) {
        const qid = edit.dataset.editQ;
        const form = document.getElementById('qef-' + qid);
        // Close any other open forms first
        document.querySelectorAll('.question-edit-form').forEach(f => {
          if (f.id !== 'qef-' + qid) f.classList.add('hidden');
        });
        form?.classList.toggle('hidden');
        if (!form?.classList.contains('hidden')) form.querySelector('.qef-question')?.focus();
        return;
      }

      // Save edit
      const save = e.target.closest('.qef-save-btn');
      if (save) {
        const qid = save.dataset.qid;
        const q   = this._currentNode.questions.find(q => q.id === qid);
        if (!q) return;
        const qText  = document.querySelector('.qef-question[data-qid="' + qid + '"]')?.value.trim();
        const aText  = document.querySelector('.qef-answer[data-qid="' + qid + '"]')?.value.trim();
        const qType  = document.querySelector('.qef-type[data-qid="' + qid + '"]')?.value;
        if (!qText || !aText) { Toast.error('Question and answer cannot be empty.'); return; }
        q.question = qText; q.answer = aText; q.type = qType;
        nodeStore.save(this._currentNode);
        Toast.success('Question updated!');
        document.getElementById('questions-list').innerHTML = this._renderQList(this._currentNode);
        return;
      }

      // Cancel edit
      const cancel = e.target.closest('.qef-cancel-btn');
      if (cancel) {
        const qid = cancel.dataset.qid;
        document.getElementById('qef-' + qid)?.classList.add('hidden');
        return;
      }
    });
  },

  _renderQList(node) {
    if (!node.questions?.length) {
      return '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:13px;">No questions yet. Use + Add Question or select text in Notes.</p>';
    }
    return node.questions.map(q => {
      const typeLabel = q.type === 'recall' ? '🔁 Recall' : '🧩 Application';
      const qe = this._esc;
      return ''
        + '<div class="question-card" data-qid="' + q.id + '">'

        // Header row: type pill + edit/delete buttons
        + '<div class="question-card-header">'
        + '<span class="question-label">' + typeLabel + '</span>'
        + '<div class="question-card-actions">'
        + '<button class="qc-action-btn" data-edit-q="' + q.id + '">✏ Edit</button>'
        + '<button class="qc-action-btn danger" data-delete-q="' + q.id + '">✕</button>'
        + '</div>'
        + '</div>'

        // Question body
        + '<div class="question-text">' + this._esc(q.question) + '</div>'

        // Answer toggle + answer box
        + '<button class="question-answer-toggle" data-qid="' + q.id + '">Show Answer</button>'
        + '<div class="question-answer hidden" id="qa-' + q.id + '">' + this._esc(q.answer) + '</div>'

        // Inline edit form — starts hidden
        + '<div class="question-edit-form hidden" id="qef-' + q.id + '">'
        + '<div style="margin-bottom:10px;">'
        + '<label class="config-label">Type</label>'
        + '<select class="config-select qef-type" data-qid="' + q.id + '">'
        + '<option value="recall"'      + (q.type === 'recall'      ? ' selected' : '') + '>🔁 Recall</option>'
        + '<option value="application"' + (q.type === 'application' ? ' selected' : '') + '>🧩 Application</option>'
        + '</select>'
        + '</div>'
        + '<div style="margin-bottom:10px;">'
        + '<label class="config-label">Question</label>'
        + '<textarea class="config-input qef-question" data-qid="' + q.id + '" rows="3" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.6;">' + this._esc(q.question) + '</textarea>'
        + '</div>'
        + '<div style="margin-bottom:14px;">'
        + '<label class="config-label">Answer</label>'
        + '<textarea class="config-input qef-answer" data-qid="' + q.id + '" rows="3" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.6;">' + this._esc(q.answer) + '</textarea>'
        + '</div>'
        + '<div style="display:flex;gap:8px;">'
        + '<button class="btn-primary qef-save-btn" data-qid="' + q.id + '" style="font-size:12px;padding:8px 18px;">✓ Save</button>'
        + '<button class="btn-secondary qef-cancel-btn" data-qid="' + q.id + '" style="font-size:12px;padding:8px 14px;">Cancel</button>'
        + '</div>'
        + '</div>'

        + '</div>';
    }).join('');
  },

  _saveNewQuestion() {
    const type=document.getElementById('new-q-type').value;
    const q=document.getElementById('new-q-question').value.trim();
    const a=document.getElementById('new-q-answer').value.trim();
    if(!q||!a){Toast.error('Fill in both fields.');return;}
    this._currentNode.questions.push({id:KnowledgeNode._generateQuestionId(),type,question:q,answer:a});
    nodeStore.save(this._currentNode);
    Toast.success('Question added!');
    this._renderQuestions(this._currentNode);
  },

  _deleteQuestion(qId) {
    this._currentNode.questions=this._currentNode.questions.filter(q=>q.id!==qId);
    delete this._currentNode.srsState[qId];
    nodeStore.save(this._currentNode);
    document.getElementById('questions-list').innerHTML=this._renderQList(this._currentNode);
    Toast.success('Question removed.');
  },

  /* ─── EXAMPLES TAB ──────────────────────────────────── */
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ EXAMPLES TAB
  // ═══════════════════════════════════════════════════════════════════════════
  _renderExamples(node) {
    const examples = node.workedExamples || [];
    const hasAI = AIService.hasApiKey();
    let html = '<div>';
    html += '<h2 style="font-family:var(--font-ui);font-size:21px;font-weight:800;margin-bottom:6px;letter-spacing:-0.02em;">💡 Worked Examples</h2>';
    html += '<p style="font-family:var(--font-body);font-size:14px;color:var(--text-secondary);margin-bottom:18px;">Upload worked examples with full solutions. The AI tutors you through them step by step.</p>';
    html += '<div style="display:flex;gap:8px;margin-bottom:20px;">';
    html += '<button class="btn-primary" id="ex-add-text-btn" style="font-size:13px;">+ Type Example</button>';
    html += '<button class="btn-secondary" id="ex-add-image-btn" style="font-size:13px;">📷 Scan Example</button>';
    html += '</div>';
    if (examples.length === 0) {
      html += '<div style="padding:32px;text-align:center;border:1px dashed var(--border);border-radius:var(--radius-lg);">';
      html += '<div style="font-size:32px;margin-bottom:12px;">📖</div>';
      html += '<div style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">No examples yet</div>';
      html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">Add a worked example and the AI will teach you how to solve similar problems.</div>';
      html += '</div>';
    } else {
      examples.forEach((ex, i) => {
        // ── Example card — clean layout ────────────────────────
        html += '<div class="ex-card" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:16px;margin-bottom:16px;overflow:hidden;">';

        // Header bar — two rows: [chevron · badge · pages · delete] then [full-width title]
        html += '<div class="ex-collapse-hdr" data-ex-id="' + ex.id + '" style="padding:10px 14px 10px;background:var(--bg-elevated,var(--bg-base));border-bottom:1px solid var(--border-soft);cursor:pointer;">';
        // Row 1: meta row
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
        html += '<span class="ex-chevron" data-ex-id="' + ex.id + '" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);transition:transform .2s;display:inline-block;flex-shrink:0;">▶</span>';
        html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:800;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-dim);padding:2px 10px;border-radius:20px;flex-shrink:0;">Example ' + (i+1) + '</span>';
        if (ex.pageCount > 1) html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);flex-shrink:0;">' + ex.pageCount + ' pages</span>';
        html += '<span style="flex:1;"></span>'; // spacer
        html += '<button class="ex-rename-btn" data-ex-id="' + ex.id + '" title="Rename" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:2px 6px;line-height:1;flex-shrink:0;">✏️</button>';
        html += '<button class="ex-delete-btn" data-ex-id="' + ex.id + '" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:15px;padding:2px 4px;line-height:1;flex-shrink:0;">✕</button>';
        html += '</div>';
        // Row 2: title — full width, wraps freely (tapping collapses, not renames)
        html += '<span class="ex-title-display" data-ex-id="' + ex.id + '" style="font-family:var(--font-ui);font-size:15px;font-weight:800;color:var(--text-primary);line-height:1.35;display:block;word-break:break-word;">' + this._esc(ex.title || 'Worked Example') + '</span>';
        html += '<input class="ex-title-input config-input" data-ex-id="' + ex.id + '" value="' + this._esc(ex.title || 'Worked Example') + '" style="display:none;width:100%;font-family:var(--font-ui);font-size:15px;font-weight:800;padding:4px 8px;box-sizing:border-box;" />';
        html += '</div>';

        // Collapsible body — COLLAPSED by default
        html += '<div class="ex-body" data-ex-id="' + ex.id + '" style="display:none;">';
        html += '<div style="padding:14px 16px 0;">';

        // Question block
        html += '<div style="background:var(--bg-base);border:1px solid var(--border-soft);border-radius:10px;padding:14px;margin-bottom:12px;">';
        html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px;">Question</div>';
        html += '<div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.7;">' + this._esc(ex.question) + '</div>';
        html += '</div>';

        // Solution (collapsible)
        if (ex.solution) {
          html += '<details style="margin-bottom:4px;">';
          html += '<summary style="display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;list-style:none;">';
          html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);">▶▶ Show Solution</span>';
          html += '</summary>';

          // Steps if available
          if (ex.steps && ex.steps.length) {
            html += '<div style="margin-top:4px;">';
            ex.steps.forEach((step, si) => {
              html += '<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border-soft);">';
              html += '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">';
              html += '<span style="width:24px;height:24px;border-radius:50%;background:var(--accent-soft);border:1px solid var(--accent-dim);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--accent);">' + (si+1) + '</span>';
              if (si < ex.steps.length - 1) html += '<div style="width:1px;flex:1;background:var(--border-soft);min-height:8px;margin-top:3px;"></div>';
              html += '</div>';
              html += '<div style="padding-top:3px;">';
              html += '<span style="font-family:var(--font-body);font-size:13.5px;color:var(--text-primary);line-height:1.65;">' + this._esc(step) + '</span>';
              html += '</div></div>';
            });
            html += '</div>';
          } else {
            html += '<div style="font-family:var(--font-body);font-size:13.5px;color:var(--text-secondary);line-height:1.7;padding:10px 0;white-space:pre-wrap;">' + this._esc(ex.solution) + '</div>';
          }

          // Structured tables (ledger accounts, journals) — rendered as the textbook shows
          if (ex.tables && ex.tables.length) {
            ex.tables.forEach(tbl => {
              html += '<div style="margin:14px 0;overflow-x:auto;">';
              if (tbl.caption) html += '<div style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">' + this._esc(tbl.caption) + '</div>';
              html += '<table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:12px;">';
              if (tbl.columns && tbl.columns.length) {
                html += '<thead><tr>';
                tbl.columns.forEach(c => { html += '<th style="border:1px solid var(--border);padding:6px 8px;text-align:left;background:var(--bg-raised);color:var(--text-primary);font-weight:700;white-space:nowrap;">' + this._esc(c) + '</th>'; });
                html += '</tr></thead>';
              }
              html += '<tbody>';
              (tbl.rows || []).forEach(row => {
                html += '<tr>';
                (row || []).forEach(cell => { html += '<td style="border:1px solid var(--border-soft);padding:6px 8px;color:var(--text-secondary);white-space:nowrap;">' + this._esc(cell) + '</td>'; });
                html += '</tr>';
              });
              html += '</tbody></table></div>';
            });
          }
          html += '</details>';
        }

        html += '</div>'; // end padding div

        // Tutor button — full width at bottom
        if (hasAI) {
          html += '<div style="padding:12px 16px 14px;border-top:1px solid var(--border-soft);margin-top:8px;">';
          html += '<button class="btn-primary ex-tutor-btn" data-ex-id="' + ex.id + '" style="width:100%;justify-content:center;font-size:14px;padding:12px;">⬡ Tutor me through this</button>';
          html += '</div>';
        }

        html += '</div>'; // end ex-body
        html += '</div>'; // end ex-card
      });
    }
    // Session history
    const tutorLog = (node.sessionLog||[]).filter(s => s.type === 'tutor').slice(-5).reverse();
    if (tutorLog.length) {
      html += '<div style="margin-top:24px;">';
      html += '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">📊 Recent Tutor Sessions</div>';
      tutorLog.forEach(s => {
        html += '<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border-soft);">';
        html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);flex-shrink:0;padding-top:1px;">' + this._esc(s.date) + '</span>';
        html += '<div>';
        html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-bottom:2px;">' + this._esc(s.example||'') + '</div>';
        html += '<div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.5;">' + this._esc(s.summary) + '</div>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    html += '</div>';
    this._body.innerHTML = html;
    document.getElementById('ex-add-text-btn')?.addEventListener('click', () => this._openAddExampleModal(node));
    document.getElementById('ex-add-image-btn')?.addEventListener('click', () => this._scanExampleFromImage(node));

    // ── Collapse/expand ──────────────────────────────────────
    document.querySelectorAll('.ex-collapse-hdr').forEach(hdr => {
      hdr.addEventListener('click', e => {
        // Don't collapse when clicking delete, rename, or the rename input
        if (e.target.closest('.ex-delete-btn') || e.target.closest('.ex-rename-btn') || e.target.closest('.ex-title-input')) return;
        const id   = hdr.dataset.exId;
        const body = this._body.querySelector(`.ex-body[data-ex-id="${id}"]`);
        const chev = this._body.querySelector(`.ex-chevron[data-ex-id="${id}"]`);
        if (!body) return;
        const collapsed = body.style.display === 'none';
        body.style.display  = collapsed ? 'block' : 'none';
        if (chev) chev.style.transform = collapsed ? 'rotate(90deg)' : '';
      });
    });

    // ── Rename (explicit pencil button → show input) ─────────
    document.querySelectorAll('.ex-rename-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation(); // don't trigger collapse
        const id    = btn.dataset.exId;
        const label = this._body.querySelector(`.ex-title-display[data-ex-id="${id}"]`);
        const input = this._body.querySelector(`.ex-title-input[data-ex-id="${id}"]`);
        if (!input || !label) return;
        label.style.display = 'none';
        input.style.display = 'block';
        input.focus();
        input.select();
      });
    });
    document.querySelectorAll('.ex-title-input').forEach(input => {
      const save = () => {
        const id    = input.dataset.exId;
        const label = this._body.querySelector(`.ex-title-display[data-ex-id="${id}"]`);
        const ex    = (node.workedExamples || []).find(x => x.id === id);
        if (!ex) return;
        const newTitle = input.value.trim() || 'Worked Example';
        ex.title        = newTitle;
        label.textContent = newTitle;
        label.style.display = '';
        input.style.display  = 'none';
        nodeStore.save(node);
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') {
          const id    = input.dataset.exId;
          const label = this._body.querySelector(`.ex-title-display[data-ex-id="${id}"]`);
          label.style.display = '';
          input.style.display  = 'none';
        }
      });
      input.addEventListener('click', e => e.stopPropagation());
    });

    // Wire tutor buttons — show progress bar then open tutor
    document.querySelectorAll('.ex-tutor-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ex = (node.workedExamples||[]).find(x => x.id === btn.dataset.exId);
        if (!ex) return;

        // Show progress bar inside button
        btn.disabled = true;
        btn.innerHTML =
          '<div style="width:100%;display:flex;flex-direction:column;gap:6px;align-items:center;">'
          + '<span style="font-size:13px;font-weight:700;">⬡ Starting tutor…</span>'
          + '<div style="width:100%;height:4px;background:rgba(0,0,0,.2);border-radius:2px;overflow:hidden;">'
          + '<div id="tutor-progress-bar" style="height:100%;background:#060709;border-radius:2px;width:0%;transition:width .4s ease;"></div>'
          + '</div>'
          + '</div>';

        // Animate progress bar
        const bar = btn.querySelector('#tutor-progress-bar');
        let pct = 0;
        const tick = setInterval(() => {
          pct = Math.min(pct + 15, 90);
          if (bar) bar.style.width = pct + '%';
        }, 80);

        setTimeout(() => {
          clearInterval(tick);
          if (bar) bar.style.width = '100%';
          setTimeout(() => {
            SocraticTutor.open(node, ex);
            btn.disabled = false;
            btn.innerHTML = '⬡ Tutor me through this';
          }, 300);
        }, 600);
      });
    });

    // Wire delete buttons
    document.querySelectorAll('.ex-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this example?')) return;
        node.workedExamples = (node.workedExamples||[]).filter(x => x.id !== btn.dataset.exId);
        nodeStore.save(node);
        this._renderExamples(node);
      });
    });
  },

  _scanExampleFromImage(node) {
    // Open gallery with multiple selection — same as main upload
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.addEventListener('change', async () => {
      const files = Array.from(inp.files);
      if (!files.length) return;
      Toast.info('Reading ' + files.length + ' image' + (files.length > 1 ? 's' : '') + '…');

      // Read all files as base64
      const readFile = function(file) {
        return new Promise(function(res, rej) {
          const r = new FileReader();
          r.onload = function() {
            const d = r.result, parts = d.split(',');
            let mt = parts[0].match(/data:([^;]+);/)?.[1] || 'image/jpeg';
            const sup = ['image/jpeg','image/png','image/gif','image/webp'];
            if (!sup.includes(mt)) {
              const img = new Image();
              img.onload = function() {
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                c.getContext('2d').drawImage(img, 0, 0);
                res({ base64: c.toDataURL('image/jpeg', .92).split(',')[1], mediaType: 'image/jpeg' });
              };
              img.src = d;
            } else {
              res({ base64: parts[1], mediaType: mt });
            }
          };
          r.onerror = rej;
          r.readAsDataURL(file);
        });
      };

      try {
        // Step 1: Read files
        Toast.info('📖 Step 1/3 — Reading ' + files.length + ' image' + (files.length > 1 ? 's' : '') + '…');
        const images = await Promise.all(files.map(readFile));
        const b64s   = images.map(function(i) { return i.base64; });
        const mts    = images.map(function(i) { return i.mediaType; });

        // Step 2: OCR
        Toast.info('🔍 Step 2/3 — Extracting text' + (files.length > 1 ? ' from ' + files.length + ' pages in parallel' : '') + '…');
        const ocrText = files.length === 1
          ? await AIService._extractSingleImageText(b64s[0], mts[0])
          : await AIService._extractMultiPageText(b64s, mts);

        // Step 3: Structure — scale limits to the number of pages so 4+ page
        // examples aren't truncated to the first few pages.
        Toast.info('⬡ Step 3/3 — Structuring example…');
        const inputChars = Math.min(20000, Math.max(6000, files.length * 4000));
        const outputTokens = Math.min(8000, Math.max(1500, files.length * 1200));
        const prompt = 'Extract the worked accounting/exam example from this text. It may span multiple pages — process EVERY page, do not stop after the first few. Capture any ledger accounts, journals, or financial tables as STRUCTURED tables — preserve every column (e.g. Date, Details, Fol, Debit, Credit) and every row exactly as shown, including totals.\n'
          + 'Output ONLY raw JSON:\n'
          + '{"title":"brief title","question":"full question","solution":"full solution text (narrative parts only)","steps":["step 1","step 2"],'
          + '"tables":[{"caption":"e.g. Trading account","columns":["col1","col2"],"rows":[["",""]]}]}\n'
          + 'Include a separate table for EACH account/ledger found across ALL pages. If there are no tables, use an empty array. Keep numbers exactly as written.\n\nTEXT:\n' + ocrText.slice(0, inputChars);
        const raw = await AIService._callWithFunction('noteProcessing', [{ role: 'user', content: prompt }], outputTokens);

        let data = null;
        try { data = AIService._parseJSON(raw); } catch(e) {}

        if (!data || !data.question) {
          const ocrLines = ocrText.split('\n').filter(function(l) { return l.trim().length > 10; });
          data = { title: 'Scanned Example', question: ocrLines.slice(0, 3).join(' '), solution: ocrText.slice(0, 2000), steps: [] };
          Toast.info('✓ Saved — you can edit the question and solution.');
        } else {
          Toast.success('✓ Example saved from ' + files.length + ' image' + (files.length > 1 ? 's' : '') + '!');
        }

        if (!node.workedExamples) node.workedExamples = [];
        node.workedExamples.push({
          id: 'ex_' + Math.random().toString(36).slice(2, 9),
          title:    data.title    || 'Scanned Example',
          question: data.question || '',
          solution: data.solution || ocrText,
          steps:    data.steps    || [],
          tables:   Array.isArray(data.tables) ? data.tables : [],
          pageCount: files.length,
          addedAt:  Date.now(),
        });
        nodeStore.save(node);
        NodeDetailView._renderExamples(node);
      } catch(err) {
        Toast.error('✗ Failed: ' + err.message);
      }
    });
    inp.click();
  },

  _openAddExampleModal(node) {
    Modal.open(
      '<h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:16px;">Add Worked Example</h2>'
      + '<div class="config-row" style="margin-bottom:12px;"><label class="config-label">Title</label><input type="text" id="ex-title" class="config-input" placeholder="e.g. Calculate Tax Liability"/></div>'
      + '<div class="config-row" style="margin-bottom:12px;"><label class="config-label">Question *</label><textarea id="ex-question" class="config-input" placeholder="Paste the full question here..." style="height:100px;resize:vertical;"></textarea></div>'
      + '<div class="config-row" style="margin-bottom:12px;"><label class="config-label">Full Solution *</label><textarea id="ex-solution" class="config-input" placeholder="Paste the complete worked solution..." style="height:120px;resize:vertical;"></textarea></div>'
      + '<div class="config-row" style="margin-bottom:18px;"><label class="config-label">Key Steps (one per line)</label><textarea id="ex-steps" class="config-input" placeholder="Step 1: Identify gross income&#10;Step 2: Apply deductions" style="height:80px;resize:vertical;"></textarea></div>'
      + '<div style="display:flex;gap:8px;"><button class="btn-primary" id="ex-save-btn" style="flex:1;justify-content:center;">Save Example</button><button class="btn-secondary" onclick="Modal.close()">Cancel</button></div>'
    );
    setTimeout(() => {
      document.getElementById('ex-save-btn')?.addEventListener('click', () => {
        const question = document.getElementById('ex-question')?.value.trim();
        if (!question) { Toast.error('Please enter the question.'); return; }
        const solution = document.getElementById('ex-solution')?.value.trim() || '';
        const stepsRaw = document.getElementById('ex-steps')?.value.trim();
        const steps = stepsRaw ? stepsRaw.split('\n').map(s=>s.trim()).filter(Boolean) : [];
        if (!node.workedExamples) node.workedExamples = [];
        node.workedExamples.push({ id:'ex_'+Math.random().toString(36).slice(2,9), title:document.getElementById('ex-title')?.value.trim()||'Example '+(node.workedExamples.length+1), question, solution, steps, addedAt:Date.now() });
        nodeStore.save(node); Modal.close(); Toast.success('Example saved!'); this._renderExamples(node);
      });
    }, 0);
  },


  _openSocraticTutor(node, ex) {
    SocraticTutor.open(node, ex);
  },

  /* ─── MASTERY ─────────────────────────────────────── */
  // ═══════════════════════════════════════════════════════════════════════════
  // ▶ MASTERY TAB
  // ═══════════════════════════════════════════════════════════════════════════
  _renderMastery(node) {
    const stats=[{value:node.masteryScore+'%',label:'Mastery'},{value:node.reviewCount,label:'Reviews'},{value:node.dueQuestions().length,label:'Due Today'},{value:node.questions.length,label:'Questions'}];
    const rows=node.questions.map(q=>{const s=node.srsState[q.id];const preview=q.question.length>60?q.question.slice(0,60)+'…':q.question;return'<tr><td style="padding:10px 12px;font-family:var(--font-body);font-size:13px;border-bottom:1px solid var(--border-soft);max-width:180px;"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;" title="'+this._esc(q.question)+'">'+this._esc(preview)+'</div></td><td style="padding:10px 12px;font-family:var(--font-mono);font-size:11px;color:var(--'+(q.type==='recall'?'blue':'green')+');border-bottom:1px solid var(--border-soft);">'+q.type+'</td><td style="padding:10px 12px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);border-bottom:1px solid var(--border-soft);">'+SpacedRepetition.intervalLabel(s)+'</td><td style="padding:10px 12px;border-bottom:1px solid var(--border-soft);"><div class="mastery-bar-track" style="width:80px"><div class="mastery-bar-fill" style="width:'+(s?Math.min(100,s.repetitions*20):0)+'%"></div></div></td></tr>';}).join('');
    this._body.innerHTML='<h2 style="font-family:var(--font-ui);font-size:21px;font-weight:800;margin-bottom:26px;letter-spacing:-0.02em;">Mastery</h2><div class="mastery-overview">'+stats.map(s=>'<div class="mastery-stat-card"><span class="mastery-stat-value">'+s.value+'</span><span class="mastery-stat-label">'+s.label+'</span></div>').join('')+'</div><div class="notes-section"><div class="notes-section-title">Question Progress</div><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border);"><th style="padding:8px 12px;text-align:left;font-family:var(--font-ui);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);">Question</th><th style="padding:8px 12px;text-align:left;font-family:var(--font-ui);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);">Type</th><th style="padding:8px 12px;text-align:left;font-family:var(--font-ui);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);">Next Review</th><th style="padding:8px 12px;text-align:left;font-family:var(--font-ui);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);">Reps</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text-muted);font-family:var(--font-mono);font-size:13px;">No reviews yet.</td></tr>')+'</tbody></table></div></div>'
      + '<div class="notes-section" style="margin-top:20px;"><div class="notes-section-title">🔗 Connections</div>'
      + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">See how this topic links to others in <strong>' + this._esc(node.subject || 'this subject') + '</strong> — what it builds on and what builds on it.</p>'
      + '<div id="connections-area"><button class="btn-secondary" id="find-connections-btn" style="font-size:12px;">🔗 Find connections</button></div>'
      + '</div>'
      + '<div class="notes-section" style="margin-top:20px;"><div class="notes-section-title">Reset</div>'
      + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">If your mastery went up by accident (e.g. flipping through questions), you can reset all progress for this node back to zero. This clears mastery, review history, and spaced-repetition scheduling. Your notes and questions are kept.</p>'
      + '<button class="btn-secondary" id="reset-mastery-btn" style="font-size:12px;color:var(--red,#f87171);border-color:rgba(248,113,113,.3);">↺ Reset progress for this node</button>'
      + '</div>';

    document.getElementById('find-connections-btn')?.addEventListener('click', async () => {
      const area = document.getElementById('connections-area');
      if (!AIService.hasApiKey()) {
        area.innerHTML = '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">Configure AI in Settings to find connections.</p>';
        return;
      }
      area.innerHTML = '<div class="aif-loading"><div class="aif-dot"></div><div class="aif-dot"></div><div class="aif-dot"></div></div>';
      try {
        const subjKey = (node.subject || '').toLowerCase().trim();
        const siblings = nodeStore.getAll()
          .filter(n => n.id !== node.id && n.processingStatus === 'ready'
            && (n.subject || '').toLowerCase().trim() === subjKey && subjKey)
          .map(n => ({ id: n.id, title: n.title, summary: n.summary || '' }));
        if (!siblings.length) {
          area.innerHTML = '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">No other topics in this subject yet. Add more nodes to see connections.</p>';
          return;
        }
        const result = await AIService.findConnections(node, siblings);
        const conns = result?.connections || [];
        if (!conns.length) {
          area.innerHTML = '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">No strong connections found yet.</p>';
          return;
        }
        area.innerHTML = conns.map(c => {
          const target = nodeStore.getAll().find(n => n.id === c.id);
          return '<div style="background:var(--bg-base);border:1px solid var(--border-soft);border-radius:10px;padding:12px 14px;margin-bottom:10px;">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">'
            + '<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-dim);padding:2px 8px;border-radius:12px;">' + this._esc(c.relationship || 'related') + '</span>'
            + '<span style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--text-primary);">' + this._esc(c.title || (target?.title) || 'Related topic') + '</span>'
            + '</div>'
            + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.5;margin:0;">' + this._esc(c.explanation || '') + '</p>'
            + (target ? '<button class="btn-secondary conn-open" data-node-id="' + target.id + '" style="font-size:11px;margin-top:8px;padding:5px 10px;">Open →</button>' : '')
            + '</div>';
        }).join('');
        area.querySelectorAll('.conn-open').forEach(btn => {
          btn.addEventListener('click', () => {
            const target = nodeStore.getAll().find(n => n.id === btn.dataset.nodeId);
            if (target) this.open(target);
          });
        });
      } catch(e) {
        area.innerHTML = '<p style="font-family:var(--font-mono);font-size:12px;color:var(--red);">Could not load connections. ' + this._esc(e.message||'') + '</p>';
      }
    });

    document.getElementById('reset-mastery-btn')?.addEventListener('click', () => {
      Modal.open(`
        <div style="font-family:var(--font-ui);text-align:center;">
          <div style="font-size:32px;margin-bottom:12px;">↺</div>
          <h2 style="font-size:18px;font-weight:800;margin-bottom:8px;">Reset progress?</h2>
          <p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:20px;">
            This sets mastery back to 0% and clears all review history for <strong>${this._esc(node.title)}</strong>.
            Your notes, questions, and examples stay exactly as they are. This can't be undone.
          </p>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button class="btn-danger" id="confirm-reset-btn" style="font-size:13px;padding:9px 18px;">Yes, reset to 0%</button>
            <button class="btn-secondary" onclick="Modal.close()" style="font-size:13px;padding:9px 18px;">Cancel</button>
          </div>
        </div>
      `);
      setTimeout(() => {
        document.getElementById('confirm-reset-btn')?.addEventListener('click', () => {
          node.resetProgress();
          nodeStore.save(node);
          Modal.close();
          Toast.success('Progress reset for "' + node.title + '"');
          this._renderMastery(node);
        });
      }, 0);
    });
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
};
