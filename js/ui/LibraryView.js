/**
 * LibraryView.js v2 — Library with subject filter, search, add-more, delete
 */

const LibraryView = {
  _nodes: [], _filtered: [],

  init() {
    this._grid      = document.getElementById('library-grid');
    this._empty     = document.getElementById('library-empty');
    this._search    = document.getElementById('library-search');
    this._filter    = document.getElementById('library-filter');
    this._exportBtn = document.getElementById('export-all-btn');

    // Inject sort selector next to subject filter if not already present
    if (!document.getElementById('library-sort')) {
      const sel = document.createElement('select');
      sel.id = 'library-sort';
      sel.className = 'config-input';
      sel.style.cssText = 'font-size:12px;padding:7px 10px;height:auto;min-width:130px;';
      sel.innerHTML = `
        <option value="handbook">📖 Handbook order</option>
        <option value="alpha">A → Z (Name)</option>
        <option value="recent">Newest first</option>
        <option value="mastery">Mastery ↓</option>
        <option value="due">Due first</option>
      `;
      // Insert after the subject filter
      this._filter?.parentNode?.insertBefore(sel, this._filter.nextSibling);
      this._sortSelect = sel;
    } else {
      this._sortSelect = document.getElementById('library-sort');
    }

    this._search.addEventListener('input',  () => this._applyFilter());
    this._filter.addEventListener('change', () => this._applyFilter());
    this._sortSelect?.addEventListener('change', () => this._applyFilter());
    this._exportBtn.addEventListener('click', () => this._exportAll());
  },

  refresh() {
    const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    // Only re-render when data actually changed — avoids full grid rebuilds
    // on every background save (review ratings, ReactiveReshaper, etc.)
    // Use updatedAt instead of dueQuestions() — avoids O(n×q) SRS scan just to check dirty
    const fp = nodes.map(n => n.id + ':' + n.masteryScore + ':' + (n.updatedAt || 0)).join('|');
    if (fp === this._lastFingerprint && this._nodes.length === nodes.length) return;
    this._lastFingerprint = fp;
    this._nodes = nodes;
    this._updateSubjectFilter();
    this._applyFilter();
  },

  _updateSubjectFilter() {
    const subjects = nodeStore.getSubjects();
    const current  = this._filter.value;
    this._filter.innerHTML = '<option value="all">All Subjects</option>' +
      subjects.map(s=>`<option value="${s}" ${s===current?'selected':''}>${s}</option>`).join('');
  },

  _applyFilter() {
    const q    = this._search.value.toLowerCase().trim();
    const s    = this._filter.value;
    const sort = this._sortSelect?.value || 'handbook';

    this._filtered = this._nodes.filter(n => {
      const ms = s === 'all' || n.subject === s;
      const mq = !q || [n.title,n.subject,n.chapter,n.summary].some(t => t?.toLowerCase().includes(q));
      return ms && mq;
    });

    // Sort — numeric-aware so M1.2 comes before M1.10
    this._filtered.sort((a, b) => {
      if (sort === 'handbook') {
        // Strict textbook order: by page number first. Nodes with a page always
        // come before nodes without one. Ties (or no page) fall back to the
        // numeric-aware title order (M1.1, M1.2, M2.1…) so flow never shuffles.
        const pa = a.sourcePage, pb = b.sourcePage;
        if (pa != null && pb != null && pa !== pb) return pa - pb;
        if (pa != null && pb == null) return -1;
        if (pa == null && pb != null) return 1;
        return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (sort === 'alpha')   return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
      if (sort === 'mastery') return (b.masteryScore || 0) - (a.masteryScore || 0);
      if (sort === 'due')     return b.dueQuestions().length - a.dueQuestions().length;
      if (sort === 'recent')  return (b.createdAt || 0) - (a.createdAt || 0);
      return 0;
    });

    this._render();
  },

  _render() {
    if (!this._filtered.length) {
      this._grid.innerHTML = '';
      this._empty.classList.remove('hidden');
      return;
    }
    this._empty.classList.add('hidden');
    this._grid.innerHTML = this._filtered.map(n => this._nodeCard(n)).join('');

    this._grid.querySelectorAll('.node-card-body').forEach(el => {
      el.addEventListener('click', () => NodeDetailView.open(el.dataset.id));
    });
    this._grid.querySelectorAll('.card-add-btn').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); UploadView.openForNode(el.dataset.id); });
    });
    this._grid.querySelectorAll('.card-del-btn').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); this._confirmDelete(el.dataset.id); });
    });
  },

  _nodeCard(node) {
    const due      = node.dueQuestions().length;
    const newCount = node.newQuestions?.().length || 0;
    const date     = new Date(node.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'});

    // Badge logic: only show DUE if has been reviewed. Show NEW if never studied.
    const badge = due > 0
      ? `<div class="node-due-badge">${due} due</div>`
      : newCount > 0 && node.reviewCount === 0
        ? `<div class="node-due-badge" style="background:var(--bg-raised);border:1px solid var(--border);color:var(--text-muted);">${newCount} new</div>`
        : '';
    return `
      <div class="node-card" style="display:flex;flex-direction:column;">
        ${badge}
        <div class="node-card-body" data-id="${node.id}" style="flex:1;cursor:pointer;">
          <div class="node-card-subject">${node.subject||'No subject'}</div>
          <div class="node-card-title">${this._esc(node.title)}</div>
          <div class="node-card-meta">${this._esc(node.chapter||'')}${node.chapter ? ' · ' : ''}${this._esc(date)}</div>
          ${node.sourceBookmark ? `<div class="node-card-bookmark" style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-top:4px;display:flex;align-items:center;gap:4px;"><span>📖</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._esc(node.sourceBookmark)}</span></div>` : ''}
          <div class="node-card-stats">
            <div class="mastery-bar-wrap">
              <div class="mastery-bar-label"><span>Mastery</span><span>${node.masteryScore}%</span></div>
              <div class="mastery-bar-track"><div class="mastery-bar-fill" style="width:${node.masteryScore}%"></div></div>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;padding-top:12px;margin-top:12px;border-top:1px solid var(--border-soft);">
          <button class="card-add-btn btn-secondary" data-id="${node.id}" style="flex:1;font-size:11px;padding:7px 10px;">+ Add More</button>
          <button class="card-del-btn" data-id="${node.id}" style="padding:7px 12px;background:transparent;border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-muted);font-size:12px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">🗑</button>
        </div>
      </div>`;
  },

  _confirmDelete(nodeId) {
    const node = nodeStore.get(nodeId);
    if (!node) return;
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:12px;">Delete Node?</h2>
      <p style="font-family:var(--font-body);font-size:14px;color:var(--text-secondary);margin-bottom:24px;">
        This will permanently delete "<strong>${this._esc(node.title)}</strong>" including all notes, questions, and review history. This cannot be undone.
      </p>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" style="background:var(--red);box-shadow:none;" onclick="LibraryView._deleteNode('${nodeId}')">Delete Permanently</button>
        <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
      </div>
    `);
  },

  _deleteNode(nodeId) {
    nodeStore.delete(nodeId);
    Modal.close();
    Toast.success('Node deleted.');
    this.refresh();
  },

  _exportAll() {
    const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    PrintExport.showAllExportMenu(nodes);
  },

  _esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
};
