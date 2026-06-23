/**
 * BulkImport.js
 * Bulk photo import with manual node organisation.
 *
 * GUARDRAILS:
 *  1. Vault snapshot taken before any processing starts.
 *  2. Each node is saved to nodeStore immediately after processing — failure
 *     of a later batch never rolls back earlier ones.
 *  3. If AI structuring fails for a batch, raw OCR text is saved as a
 *     plain-text node so no photo content is ever lost.
 *  4. Worked examples are processed independently; their failure never
 *     affects the parent node's notes.
 *  5. The AI prompt instructs strict source-fidelity — only extract what is
 *     physically present on the page, no elaboration.
 */

const BulkImport = {

  /* ── State ─────────────────────────────────────────── */
  _photos:  [],   // [{ file, thumb, type:'notes'|'example' }]
  _splits:  [],   // sorted indices — split AFTER photos[i] → new segment starts at i+1
  _configs: [],   // [{ name, subject, chapter }] — one per segment

  /* ── Entry point ────────────────────────────────────── */
  trigger() {
    document.getElementById('bulk-import-input')?.click();
  },

  async start(files) {
    if (!files || !files.length) return;
    if (!AIService.hasApiKey()) {
      Toast.error('Configure AI first in Settings — needed to process each node.');
      return;
    }

    // Show loading overlay
    this._showLoading('Loading ' + files.length + ' photos…');

    this._photos  = [];
    this._splits  = [];
    this._configs = [this._emptyConfig()];

    // Pre-fill subject from the most common existing subject
    const subjects = nodeStore.getAll().map(n => n.subject).filter(Boolean);
    if (subjects.length) {
      const freq = {};
      subjects.forEach(s => { freq[s] = (freq[s] || 0) + 1; });
      this._configs[0].subject = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
    }

    // Generate thumbnails sequentially to avoid memory spikes
    const arr = Array.from(files);
    for (let i = 0; i < arr.length; i++) {
      this._showLoading('Loading photo ' + (i+1) + ' of ' + arr.length + '…');
      const { thumb, blob } = await this._prepImage(arr[i]);
      this._photos.push({ file: arr[i], thumb, blob, type: 'notes' });
    }

    this._render();
  },

  /* ── Render: organise screen ────────────────────────── */
  _render() {
    const total = this._photos.length;
    const segs  = this._segmentCount();

    // Validate all configs have names
    const missing = this._configs.filter(c => !c.name.trim()).length;

    const html = `
<div id="bi-root" data-kn-overlay data-kn-close="#bi-cancel" style="position:fixed;inset:0;background:var(--bg-base);z-index:9000;display:flex;flex-direction:column;overflow:hidden;">

  <!-- Header -->
  <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg-raised);">
    <button id="bi-cancel" style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 12px;color:var(--text-secondary);font-size:13px;cursor:pointer;">✕ Cancel</button>
    <div style="flex:1;">
      <div style="font-family:var(--font-ui);font-weight:800;font-size:15px;">📚 Bulk Import <span style="font-family:var(--font-mono);font-size:10px;color:var(--green);font-weight:600;">v3-fix</span></div>
      <div id="bi-count" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${total} photos → ${segs} node${segs!==1?'s':''}</div>
    </div>
    <button id="bi-process" class="btn-primary" style="font-size:13px;padding:8px 16px;">
      ▶ Process ${segs} node${segs!==1?'s':''}
    </button>
  </div>

  <!-- Instructions -->
  <div style="padding:10px 16px;background:rgba(240,165,0,0.08);border-bottom:1px solid var(--border);flex-shrink:0;">
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent);line-height:1.6;">
      Tap <strong>📝/🧮</strong> to toggle Notes vs Worked Example · Adjacent 🧮 pages join into <strong>one</strong> example · Tap <strong>↑↓</strong> to reorder · Tap <strong>✂ Split here</strong> to start a new node
    </div>
  </div>

  <!-- Scrollable list -->
  <div id="bi-list" style="flex:1;overflow-y:auto;padding:12px 12px 80px;">
    ${this._renderList()}
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    this._bindEvents();
  },

  _renderList() {
    let html = '';
    let seg = 0;

    for (let i = 0; i < this._photos.length; i++) {
      // Config card at start of each segment
      if (i === 0 || this._splits.includes(i - 1)) {
        if (i > 0) seg++;
        html += this._renderConfig(seg);
      }

      html += this._renderPhoto(i, seg);

      // Split button between photos
      if (i < this._photos.length - 1) {
        if (this._splits.includes(i)) {
          // Already a split here — show remove
          html += `<div data-split-at="${i}" class="bi-split-exists" style="text-align:center;margin:4px 0;">
            <button data-rmv-split="${i}" style="background:rgba(255,80,80,0.1);border:1px dashed var(--red);border-radius:6px;padding:4px 14px;font-size:11px;color:var(--red);cursor:pointer;">✕ Remove split</button>
          </div>`;
        } else {
          html += `<div style="text-align:center;margin:2px 0;">
            <button data-add-split="${i}" style="background:none;border:1px dashed var(--border);border-radius:6px;padding:3px 14px;font-size:11px;color:var(--text-muted);cursor:pointer;opacity:0.6;">✂ Split here</button>
          </div>`;
        }
      }
    }
    return html;
  },

  _renderConfig(segIdx) {
    const c = this._configs[segIdx] || this._emptyConfig();
    const segColors = ['#f0a500','#4caf50','#2196f3','#9c27b0','#ff5722','#00bcd4','#ff9800','#607d8b'];
    const col = segColors[segIdx % segColors.length];
    const subjects = [...new Set(nodeStore.getAll().map(n => n.subject).filter(Boolean))];
    const subjOpts = subjects.map(s => `<option value="${this._esc(s)}"${s===c.subject?'selected':''}>${this._esc(s)}</option>`).join('');

    return `
<div class="bi-config-card" data-seg="${segIdx}" style="background:var(--bg-raised);border:2px solid ${col};border-radius:10px;padding:12px 14px;margin:10px 0 4px;">
  <div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;color:${col};margin-bottom:8px;">📁 Node ${segIdx+1}</div>
  <input data-cfg="${segIdx}" data-field="name" class="config-input bi-cfg-name" value="${this._esc(c.name)}"
    placeholder="Node title — e.g. M1 - Accounting Cycle *" style="margin-bottom:6px;border-color:${c.name.trim()?'var(--border)':'var(--red)'};" autocorrect="on" autocapitalize="words"/>
  ${subjects.length
    ? `<select data-cfg="${segIdx}" data-field="subject" class="config-select bi-cfg-field" style="margin-bottom:6px;font-size:13px;">
        <option value="">Subject…</option>${subjOpts}
        <option value="__custom">+ Custom…</option>
       </select>`
    : `<input data-cfg="${segIdx}" data-field="subject" class="config-input bi-cfg-field" value="${this._esc(c.subject)}" placeholder="Subject / Topic" style="margin-bottom:6px;" autocorrect="on"/>`
  }
  <input data-cfg="${segIdx}" data-field="chapter" class="config-input bi-cfg-field" value="${this._esc(c.chapter)}" placeholder="Chapter / Module (optional)" autocorrect="on"/>
</div>`;
  },

  _renderPhoto(idx, segIdx) {
    const p = this._photos[idx];
    const isEx = p.type === 'example';
    const segColors = ['#f0a500','#4caf50','#2196f3','#9c27b0','#ff5722','#00bcd4','#ff9800','#607d8b'];
    const col = segColors[segIdx % segColors.length];
    return `
<div class="bi-photo-row" data-idx="${idx}" style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid ${col};border-radius:8px;margin:2px 0;">
  <button data-toggle="${idx}" title="Toggle: Notes / Worked Example" style="background:${isEx?'rgba(33,150,243,0.15)':'rgba(76,175,80,0.10)'};border:1px solid ${isEx?'#2196f3':'#4caf50'};border-radius:6px;padding:4px 7px;font-size:15px;cursor:pointer;flex-shrink:0;">${isEx?'🧮':'📝'}</button>
  <img src="${p.thumb}" data-view="${idx}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;cursor:zoom-in;" title="Tap to view full size"/>
  <div style="flex:1;min-width:0;" data-view="${idx}" style="cursor:pointer;">
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Photo ${idx+1} — ${isEx?(()=>{const info=this._exampleInfo(idx);const lbl=info?('Example '+info.exNum+(info.pages>1?' · pg '+info.page+'/'+info.pages:'')):'Worked Example';return '<span style="color:#2196f3">🧮 '+lbl+'</span>';})():'<span style="color:#4caf50">Notes</span>'} <span style="color:var(--accent);font-size:10px;">🔍 tap to expand</span></div>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(p.file.name)}</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
    <button data-up="${idx}" style="background:none;border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:12px;cursor:pointer;color:var(--text-secondary);" ${idx===0?'disabled':''}>↑</button>
    <button data-dn="${idx}" style="background:none;border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:12px;cursor:pointer;color:var(--text-secondary);" ${idx===this._photos.length-1?'disabled':''}>↓</button>
  </div>
</div>`;
  },

  _bindEvents() {
    const root = document.getElementById('bi-root');
    if (!root) return;

    root.addEventListener('click', e => {
      // Cancel
      if (e.target.id === 'bi-cancel') { this._close(); return; }

      // Process
      if (e.target.id === 'bi-process') { this._confirmAndProcess(); return; }

      // View full size
      const view = e.target.closest('[data-view]')?.dataset.view;
      if (view != null) { this._openViewer(parseInt(view)); return; }

      // Toggle Notes / Worked Example
      const toggle = e.target.closest('[data-toggle]')?.dataset.toggle;
      if (toggle != null) {
        const idx = parseInt(toggle);
        this._syncConfigsFromDOM();   // keep typed titles before rebuilding the list
        this._photos[idx].type = this._photos[idx].type === 'notes' ? 'example' : 'notes';
        this._rerender();
        return;
      }

      // Move up
      const up = e.target.dataset.up;
      if (up != null) { this._movePhoto(parseInt(up), -1); return; }

      // Move down
      const dn = e.target.dataset.dn;
      if (dn != null) { this._movePhoto(parseInt(dn), +1); return; }

      // Add split
      const addSplit = e.target.dataset.addSplit;
      if (addSplit != null) {
        const at = parseInt(addSplit);
        const segIdx = this._addSplit(at);
        // Focus the new node name field
        if (segIdx > -1) setTimeout(() => {
          const inputs = document.querySelectorAll(`.bi-cfg-name[data-cfg="${segIdx}"]`);
          inputs[0]?.focus();
        }, 100);
        return;
      }

      // Remove split
      const rmv = e.target.dataset.rmvSplit;
      if (rmv != null) {
        this._removeSplit(parseInt(rmv));
        return;
      }
    });

    // Config field changes
    root.addEventListener('input', e => {
      const cfgIdx = e.target.dataset.cfg;
      const field  = e.target.dataset.field;
      if (cfgIdx != null && field) {
        const idx = parseInt(cfgIdx);
        if (!this._configs[idx]) this._configs[idx] = this._emptyConfig();
        let val = e.target.value;
        // Propagate subject to subsequent nodes that haven't been customised
        if (field === 'subject' && val !== '__custom') {
          for (let i = idx + 1; i < this._configs.length; i++) {
            if (!this._configs[i].subject || this._configs[i].subject === this._configs[idx].subject) {
              this._configs[i].subject = val;
            }
          }
        }
        if (val !== '__custom') this._configs[idx][field] = val;
        // Live border feedback on the name field (validation happens on Process)
        if (field === 'name') {
          e.target.style.borderColor = val.trim() ? 'var(--border)' : 'var(--red)';
        }
      }
    });

    // Select → custom subject
    root.addEventListener('change', e => {
      if (e.target.dataset.field === 'subject' && e.target.value === '__custom') {
        const v = prompt('Enter subject name:');
        if (v) {
          const idx = parseInt(e.target.dataset.cfg);
          this._configs[idx].subject = v;
          e.target.outerHTML = `<input data-cfg="${idx}" data-field="subject" class="config-input bi-cfg-field" value="${this._esc(v)}" placeholder="Subject / Topic" style="margin-bottom:6px;" autocorrect="on"/>`;
        }
      }
    });
  },

  /* ── Confirm and start processing ───────────────────── */
  // Read the actual input values straight from the DOM. The live `input` event
  // can miss values on some Android keyboards/IMEs, leaving _configs stale — so
  // we never trust the cached state at process time, we re-read the fields.
  _syncConfigsFromDOM() {
    document.querySelectorAll('#bi-root [data-cfg][data-field]').forEach(el => {
      const idx = parseInt(el.dataset.cfg);
      const field = el.dataset.field;
      if (isNaN(idx) || !field) return;
      const val = el.value;
      if (val === '__custom') return; // ignore the "+ Custom…" placeholder option
      if (!this._configs[idx]) this._configs[idx] = this._emptyConfig();
      this._configs[idx][field] = val;
    });
  },

  async _confirmAndProcess() {
    // Pull the latest typed values in before validating
    this._syncConfigsFromDOM();

    const firstEmpty = this._configs.findIndex(c => !c.name.trim());
    if (firstEmpty !== -1) {
      Toast.error('Give every node a title before processing.');
      const field = document.querySelector('.bi-cfg-name[data-cfg="' + firstEmpty + '"]');
      if (field) {
        field.style.borderColor = 'var(--red)';
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => field.focus(), 300);
      }
      return;
    }

    const segs = this._buildSegments();

    // Validate: warn if any node has only worked examples (no notes)
    const notesOnly = [];
    segs.forEach((s, i) => {
      if (s.notes.length === 0 && s.exampleGroups.length > 0) {
        notesOnly.push('Node ' + (i + 1) + ' ("' + (s.config.name || 'Untitled') + '")');
      }
    });
    if (notesOnly.length) {
      const ok = confirm(notesOnly.join(', ') + ' has only worked-example photos and no notes. '
        + 'If that node should have notes, tap Cancel and check that its pages show the 📝 (green) icon, then reorder so the notes sit inside that node. '
        + 'Continue creating it from examples only?');
      if (!ok) return;
    }

    this._close();
    await this._process(segs);
  },

  /* ── Build segment data from state ─────────────────── */
  _buildSegments() {
    const segs = [];

    const segForIdx = (i) => {
      let s = 0;
      for (const sp of this._splits) {
        if (i > sp) s++;
        else break;
      }
      return s;
    };

    const segCount = this._splits.length + 1;
    for (let i = 0; i < segCount; i++) {
      // exampleGroups: array of multi-page examples; each is an array of photos.
      // Pull the config by the SAME index the list uses, falling back to an
      // empty one so a segment can never be built against a mismatched name.
      segs.push({ config: { ...(this._configs[i] || this._emptyConfig()) }, notes: [], exampleGroups: [] });
    }

    // A run of ADJACENT example photos (within the same node) = ONE worked example.
    // A notes photo, or a node boundary, ends the current example run.
    let runSeg = -1;
    let runGroup = null;
    this._photos.forEach((p, i) => {
      const s = segForIdx(i);
      if (p.type === 'example') {
        if (runGroup && runSeg === s) {
          runGroup.push(p);            // same example, next page
        } else {
          runGroup = [p];              // start a new example
          runSeg = s;
          segs[s].exampleGroups.push(runGroup);
        }
      } else {
        segs[s].notes.push(p);
        runGroup = null;               // notes page breaks the example run
        runSeg = -1;
      }
    });

    return segs;
  },

  /* ── Main processing pipeline ───────────────────────── */
  async _process(segs) {
    const total = segs.length;

    // GUARDRAIL 1: Vault snapshot before touching anything
    try {
      await BackupVault.snapshot('pre-bulk-import');
      console.log('[BulkImport] Pre-import vault snapshot taken');
    } catch(e) { console.warn('[BulkImport] Snapshot failed:', e); }

    // Processing screen
    this._ensureLoaderStyles();
    const el = document.createElement('div');
    el.id = 'bi-progress';
    el.style.cssText = 'position:fixed;inset:0;background:radial-gradient(120% 80% at 50% -10%, rgba(240,165,0,0.10), transparent 60%), var(--bg-base);z-index:9000;display:flex;flex-direction:column;overflow:hidden;';
    el.innerHTML = `
      <style>
        @keyframes bi-spin { to { transform: rotate(360deg); } }
        @keyframes bi-pulse { 0%,100% { opacity:0.55; } 50% { opacity:1; } }
        @keyframes bi-rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        #bi-progress .bi-ring { width:18px;height:18px;border:2px solid rgba(240,165,0,0.25);border-top-color:var(--accent);border-radius:50%;animation:bi-spin 0.8s linear infinite;flex-shrink:0; }
        #bi-progress .bi-node-card { animation:bi-rise 0.3s ease both; }
        #bi-progress .bi-bar-fill { transition:width 0.45s cubic-bezier(.4,0,.2,1); }
        #bi-progress .bi-active { box-shadow:0 0 0 1px var(--accent-dim), 0 8px 24px rgba(0,0,0,0.35); border-color:var(--accent-dim)!important; }
      </style>

      <!-- Header -->
      <div style="padding:22px 20px 16px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="display:flex;align-items:center;justify-content:center;flex-shrink:0;">${this._hexLoader(44)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:var(--font-ui);font-weight:800;font-size:18px;letter-spacing:-0.01em;">Building your library</div>
            <div id="bi-prog-sub" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:1px;">Preparing ${total} node${total!==1?'s':''}…</div>
          </div>
          <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--accent);"><span id="bi-prog-count">0</span>/${total}</div>
        </div>
        <!-- Progress bar -->
        <div style="margin-top:16px;height:6px;background:var(--bg-raised);border-radius:99px;overflow:hidden;">
          <div id="bi-prog-bar" class="bi-bar-fill" style="height:100%;width:0%;background:linear-gradient(90deg, var(--accent), #ffce5a);border-radius:99px;"></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:8px;display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);animation:bi-pulse 1.4s ease-in-out infinite;"></span>
          Keep the app open — each node is saved the moment it finishes.
        </div>
      </div>

      <div id="bi-prog-list" style="flex:1;overflow-y:auto;padding:4px 16px 24px;"></div>`;
    document.body.appendChild(el);

    const progList = document.getElementById('bi-prog-list');
    const setProgress = (done) => {
      const bar = document.getElementById('bi-prog-bar');
      const cnt = document.getElementById('bi-prog-count');
      if (bar) bar.style.width = Math.round((done/total)*100) + '%';
      if (cnt) cnt.textContent = done;
    };
    const results = [];

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const cfg = seg.config;
      const rowId = 'bi-row-' + i;
      const exCount = seg.exampleGroups ? seg.exampleGroups.length : 0;
      const meta = seg.notes.length + ' note' + (seg.notes.length!==1?'s':'') + (exCount ? ' · ' + exCount + ' example' + (exCount!==1?'s':'') : '');

      // Add a card for this node
      progList.insertAdjacentHTML('beforeend', `
        <div id="${rowId}" class="bi-node-card bi-active" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;">
          <div id="${rowId}-icon" style="margin-top:2px;"><div class="bi-ring"></div></div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:var(--font-ui);font-weight:700;font-size:14px;">${this._esc(cfg.name)}</div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:1px;">${meta}</div>
            <div id="${rowId}-status" style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-top:7px;">⏳ Starting…</div>
          </div>
        </div>`);
      progList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const card = document.getElementById(rowId);
      const iconEl = document.getElementById(rowId + '-icon');
      const setStatus = (msg, color='var(--accent)') => {
        const s = document.getElementById(rowId + '-status');
        if (s) s.innerHTML = `<span style="color:${color};">${msg}</span>`;
      };

      document.getElementById('bi-prog-sub').textContent = 'Node ' + (i+1) + ' of ' + total + ' — ' + cfg.name;

      try {
        const result = await this._processSegment(seg, i+1, total, setStatus);
        results.push({ name: cfg.name, status: 'ok', nodeId: result.nodeId, examplesAdded: result.examplesAdded, examplesFailed: result.examplesFailed });
        if (iconEl) iconEl.innerHTML = '<span style="font-size:18px;">✅</span>';
        card?.classList.remove('bi-active');
        setStatus('Saved'
          + (result.examplesAdded ? ' · ' + result.examplesAdded + ' example' + (result.examplesAdded!==1?'s':'') : '')
          + (result.examplesRescued ? ' (' + result.examplesRescued + ' saved as text)' : '')
          + (result.examplesFailed ? ' · ⚠️ ' + result.examplesFailed + ' failed' + (result.lastError ? ': ' + result.lastError : '') : ''),
          'var(--green)');
      } catch(err) {
        console.error('[BulkImport] Node failed:', cfg.name, err);
        results.push({ name: cfg.name, status: 'failed', error: err.message });
        if (iconEl) iconEl.innerHTML = '<span style="font-size:18px;">❌</span>';
        card?.classList.remove('bi-active');
        setStatus('Failed: ' + err.message, 'var(--red)');
      }

      setProgress(i + 1);
    }

    // Summary
    const ok      = results.filter(r => r.status === 'ok').length;
    const failed  = results.filter(r => r.status === 'failed');
    document.getElementById('bi-prog-sub').textContent = ok === segs.length ? 'All nodes ready' : 'Finished with some issues';
    progList.insertAdjacentHTML('beforeend', `
      <div class="bi-node-card" style="background:linear-gradient(135deg, ${failed.length?'rgba(240,165,0,0.08)':'rgba(52,199,123,0.08)'}, var(--bg-raised));border:1px solid ${failed.length?'var(--accent-dim)':'rgba(52,199,123,0.3)'};border-radius:16px;padding:20px;margin-top:6px;text-align:center;">
        <div style="font-size:34px;line-height:1;margin-bottom:8px;">${ok === segs.length ? '🎉' : '⚠️'}</div>
        <div style="font-family:var(--font-ui);font-weight:800;font-size:17px;margin-bottom:6px;">${ok === segs.length ? 'All done!' : 'Partially complete'}</div>
        <div style="font-family:var(--font-body);font-size:14px;color:var(--text-secondary);line-height:1.5;">${ok} node${ok!==1?'s':''} created successfully${failed.length ? '<br/>' + failed.length + ' failed (saved as plain text where possible)' : ''}.</div>
        ${failed.length ? '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:8px;">Failed: ' + failed.map(r=>this._esc(r.name)).join(', ') + '</div>' : ''}
        <button id="bi-done" class="btn-primary" style="margin-top:18px;width:100%;padding:13px;font-size:15px;">Go to Library →</button>
      </div>`);
    progList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.getElementById('bi-done')?.addEventListener('click', () => {
      document.getElementById('bi-progress')?.remove();
      App.navigateTo('library');
    });
  },

  /* ── Process a single segment ───────────────────────── */
  async _processSegment(seg, segNum, total, setStatus) {
    const cfg = seg.config;
    const meta = { subject: cfg.subject || '', chapter: cfg.chapter || '', detail: 'structured', title: cfg.name };

    // Strict anti-hallucination prompt note (injected via processContent meta flag)
    meta._strictSourceOnly = true;

    const result = { nodeId: null, examplesAdded: 0, examplesFailed: 0 };

    // ── Notes photos ──────────────────────────────────────────────────────────
    let nodeId = null;

    if (seg.notes.length > 0) {
      setStatus('📖 Reading ' + seg.notes.length + ' note photo' + (seg.notes.length>1?'s':'') + '…');
      const base64s = await Promise.all(seg.notes.map(p => this._toBase64(p.blob || p.file)));
      const types   = seg.notes.map(p => (p.blob && p.blob.type) || p.file.type || 'image/jpeg');

      let rawText = '';
      try {
        rawText = base64s.length > 1
          ? await AIService._extractMultiPageText(base64s, types)
          : await AIService._extractSingleImageText(base64s[0], types[0]);
      } catch(e) { console.warn('[BulkImport] OCR failed for notes, continuing:', e); }

      let nodeData = null;
      try {
        setStatus('🤖 Structuring notes with AI (' + segNum + '/' + total + ')…');
        nodeData = await AIService.processContent(base64s, rawText, meta, () => {});
      } catch(aiErr) {
        console.warn('[BulkImport] AI structuring failed, falling back to plain text:', aiErr);
        // GUARDRAIL 3: Never lose content — save as plain text if AI fails
        setStatus('⚠️ AI failed — saving as plain text (data preserved)…');
        nodeData = {
          title: cfg.name,
          definitions: [], tables: [], formulas: [], procedures: [],
          commonMistakes: [], summary: '',
          rawOCR: rawText,
          userNotes: rawText,
          processingStatus: 'plain',
        };
      }

      // Ensure title matches what user typed
      nodeData.title = cfg.name;

      // GUARDRAIL 2: Save immediately
      const node = new KnowledgeNode({ ...nodeData, subject: cfg.subject, chapter: cfg.chapter });
      nodeStore.save(node);
      nodeId = node.id;
      result.nodeId = nodeId;

    } else if (seg.exampleGroups.length > 0) {
      // No notes — create a stub node to attach examples to
      const node = new KnowledgeNode({
        title: cfg.name, subject: cfg.subject, chapter: cfg.chapter,
        definitions: [], tables: [], formulas: [], procedures: [],
        commonMistakes: [], summary: '', processingStatus: 'plain',
      });
      nodeStore.save(node);
      nodeId = node.id;
      result.nodeId = nodeId;
      setStatus('📁 Node created (examples only)…');
    }

    // ── Worked examples (each group = one multi-page example) ─────────────────
    if (seg.exampleGroups.length > 0 && nodeId) {
      const n = seg.exampleGroups.length;
      setStatus('🧮 Processing ' + n + ' worked example' + (n>1?'s':'') + '…');

      for (let i = 0; i < seg.exampleGroups.length; i++) {
        const pages = seg.exampleGroups[i];
        const exTitle = cfg.name + ' — Example ' + (i+1);
        try {
          setStatus('🧮 Example ' + (i+1) + '/' + n + (pages.length>1 ? ' (' + pages.length + ' pages)' : '') + '…');

          const base64s = await Promise.all(pages.map(p => this._toBase64(p.blob || p.file)));
          const types   = pages.map(p => (p.blob && p.blob.type) || p.file.type || 'image/jpeg');

          const rawEx = await (base64s.length > 1
            ? AIService._extractMultiPageText(base64s, types)
            : AIService._extractSingleImageText(base64s[0], types[0])
          ).catch(() => '');

          // All pages of this example go to the AI together as ONE example.
          // If structuring fails, we still keep the OCR'd text below.
          let exData = null;
          try {
            exData = await AIService.processContent(base64s, rawEx, {
              ...meta,
              title: exTitle,
              _isWorkedExample: true,
              _strictSourceOnly: true,
            }, () => {});
          } catch (procErr) {
            console.warn('[BulkImport] Example structuring failed, will save raw text:', procErr);
            result.lastError = (procErr && procErr.message) || 'structuring failed';
          }

          const target = nodeStore.get(nodeId);
          if (target) {
            if (!target.workedExamples) target.workedExamples = [];
            if (exData) {
              target.workedExamples.push({
                title: exTitle,
                pages: pages.length,
                raw: rawEx,
                steps: exData.procedures || [],
                summary: exData.summary || rawEx.slice(0, 300),
              });
              nodeStore.save(target);
              result.examplesAdded++;
            } else if (rawEx && rawEx.trim()) {
              // GUARDRAIL: never lose the example — save the OCR text as a
              // plain-text worked example, mirroring the notes fallback.
              target.workedExamples.push({
                title: exTitle,
                pages: pages.length,
                raw: rawEx,
                steps: [],
                summary: rawEx.slice(0, 300),
                processingStatus: 'plain',
              });
              nodeStore.save(target);
              result.examplesAdded++;
              result.examplesRescued = (result.examplesRescued || 0) + 1;
            } else {
              // Only a true failure: even OCR produced nothing usable.
              result.examplesFailed++;
              result.lastError = result.lastError || 'OCR returned no text for this example';
            }
          } else {
            result.examplesFailed++;
            result.lastError = 'node not found when attaching example';
          }
        } catch(e) {
          // GUARDRAIL 4: Example failure never kills the node
          console.warn('[BulkImport] Example', i+1, 'failed:', e);
          result.examplesFailed++;
          result.lastError = (e && e.message) || 'unknown error';
        }
      }
    }

    return result;
  },

  /* ── Full-size photo viewer ──────────────────────────── */
  _viewerIdx: 0,
  _viewerURL:  null,  // current objectURL — revoked when closed or changed

  _openViewer(idx) {
    this._viewerIdx = idx;
    this._renderViewer();
  },

  _renderViewer() {
    const idx = this._viewerIdx;
    const p   = this._photos[idx];
    if (!p) return;

    // Revoke previous objectURL to free memory
    if (this._viewerURL) { URL.revokeObjectURL(this._viewerURL); }
    this._viewerURL = URL.createObjectURL(p.blob || p.file);

    const isEx  = p.type === 'example';
    const total = this._photos.length;
    const nodeNum    = this._segForIdx(idx) + 1;
    const nodeCount  = this._segmentCount();
    const splitHere  = this._splits.includes(idx);   // split AFTER this photo
    const canSplit   = idx < total - 1;

    // Remove existing viewer if present
    document.getElementById('bi-viewer')?.remove();

    const el = document.createElement('div');
    el.id = 'bi-viewer';
    el.setAttribute('data-kn-overlay', '');
    el.setAttribute('data-kn-close', '#biv-close');
    el.style.cssText = 'position:fixed;inset:0;z-index:9300;background:rgba(0,0,0,0.96);display:flex;flex-direction:column;touch-action:none;';

    el.innerHTML = `
      <!-- Top bar -->
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;flex-shrink:0;">
        <button id="biv-close" style="background:rgba(255,255,255,0.1);border:none;border-radius:8px;padding:7px 14px;font-size:14px;color:#fff;cursor:pointer;">✕</button>
        <div style="flex:1;text-align:center;">
          <div style="font-family:var(--font-ui);font-weight:700;font-size:14px;color:#fff;">Photo ${idx+1} of ${total}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">📁 Node ${nodeNum} of ${nodeCount}</div>
          <div style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,0.45);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60vw;margin:0 auto;">${this._esc(p.file.name)}</div>
        </div>
        <button id="biv-sort" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:7px 12px;font-size:14px;color:#fff;cursor:pointer;" title="Sort all photos by file name (capture order)">⇅ Sort</button>
        <button id="biv-toggle" style="background:${isEx?'rgba(33,150,243,0.3)':'rgba(76,175,80,0.3)'};border:1px solid ${isEx?'#2196f3':'#4caf50'};border-radius:8px;padding:7px 12px;font-size:14px;color:#fff;cursor:pointer;" title="Toggle type">
          ${isEx ? '🧮 Example' : '📝 Notes'}
        </button>
      </div>

      <!-- Image -->
      <div id="biv-img-wrap" style="flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;">
        <img id="biv-img" src="${this._viewerURL}"
          onerror="this.onerror=null;if('${p.thumb||''}')this.src='${p.thumb||''}';"
          style="max-width:100%;max-height:100%;object-fit:contain;user-select:none;transition:transform 0.1s;"
          draggable="false"/>
        <!-- Pinch/zoom hint -->
        <div style="position:absolute;bottom:8px;left:0;right:0;text-align:center;pointer-events:none;">
          <span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,0.3);">Pinch to zoom · swipe left/right to navigate</span>
        </div>
      </div>

      <!-- Organize controls -->
      <div style="display:flex;align-items:center;gap:8px;padding:0 16px 4px;flex-shrink:0;">
        <button id="biv-move-left" style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:9px;font-size:13px;color:#fff;cursor:pointer;${idx===0?'opacity:0.3;':''}" ${idx===0?'disabled':''}>◀ Move</button>
        <button id="biv-split" style="flex:1.4;background:${splitHere?'rgba(255,80,80,0.18)':'rgba(240,165,0,0.15)'};border:1px ${splitHere?'solid var(--red)':'dashed var(--accent)'};border-radius:8px;padding:9px;font-size:13px;color:${splitHere?'var(--red)':'var(--accent)'};cursor:pointer;${canSplit?'':'opacity:0.3;'}" ${canSplit?'':'disabled'}>${splitHere?'✕ Remove split':'✂ Split after'}</button>
        <button id="biv-move-right" style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:9px;font-size:13px;color:#fff;cursor:pointer;${idx===total-1?'opacity:0.3;':''}" ${idx===total-1?'disabled':''}>Move ▶</button>
      </div>

      <!-- Bottom nav -->
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;flex-shrink:0;">
        <button id="biv-prev" style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;font-size:14px;color:#fff;cursor:pointer;" ${idx===0?'disabled style="opacity:0.3;"':''}>← Prev</button>
        <div style="text-align:center;min-width:60px;">
          <div style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,0.4);">${idx+1} / ${total}</div>
        </div>
        <button id="biv-next" style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;font-size:14px;color:#fff;cursor:pointer;" ${idx===total-1?'disabled style="opacity:0.3;"':''}>Next →</button>
      </div>`;

    document.body.appendChild(el);

    // Close
    document.getElementById('biv-close').onclick = () => this._closeViewer();

    // Toggle type from viewer
    document.getElementById('biv-toggle').onclick = () => {
      this._photos[this._viewerIdx].type = this._photos[this._viewerIdx].type === 'notes' ? 'example' : 'notes';
      this._rerender();     // update list behind viewer
      this._renderViewer(); // re-render viewer to show new type
    };

    // Sort ALL photos by file name (capture order) — keeps the current photo in view
    document.getElementById('biv-sort').onclick = () => this._sortByName();

    // Prev / Next
    document.getElementById('biv-prev').onclick = () => {
      if (this._viewerIdx > 0) { this._viewerIdx--; this._renderViewer(); }
    };
    document.getElementById('biv-next').onclick = () => {
      if (this._viewerIdx < this._photos.length - 1) { this._viewerIdx++; this._renderViewer(); }
    };

    // Move current photo left / right (the viewer follows the photo)
    document.getElementById('biv-move-left').onclick = () => {
      const i = this._viewerIdx;
      if (i === 0) return;
      this._movePhoto(i, -1);   // swaps photos + adjusts splits, re-renders list
      this._viewerIdx = i - 1;  // keep viewing the same photo
      this._renderViewer();
    };
    document.getElementById('biv-move-right').onclick = () => {
      const i = this._viewerIdx;
      if (i >= this._photos.length - 1) return;
      this._movePhoto(i, +1);
      this._viewerIdx = i + 1;
      this._renderViewer();
    };

    // Split / merge node boundary after this photo
    document.getElementById('biv-split').onclick = () => {
      const i = this._viewerIdx;
      if (i >= this._photos.length - 1) return;
      if (this._splits.includes(i)) this._removeSplit(i);
      else                          this._addSplit(i);
      this._renderViewer(); // refresh node label + button state (list already updated)
    };

    // Keyboard (desktop)
    this._viewerKeyHandler = (e) => {
      if (e.key === 'ArrowLeft')  document.getElementById('biv-prev')?.click();
      if (e.key === 'ArrowRight') document.getElementById('biv-next')?.click();
      if (e.key === 'Escape')     this._closeViewer();
    };
    document.addEventListener('keydown', this._viewerKeyHandler);

    // Swipe gesture (mobile)
    let touchStartX = null;
    el.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) < 40) return; // not a swipe
      if (dx < 0) document.getElementById('biv-next')?.click(); // swipe left = next
      else         document.getElementById('biv-prev')?.click(); // swipe right = prev
    }, { passive: true });

    // Pinch-to-zoom (basic)
    let scale = 1, lastDist = null;
    const img = document.getElementById('biv-img');
    el.addEventListener('touchmove', e => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (lastDist !== null) {
        scale = Math.max(1, Math.min(4, scale * (dist / lastDist)));
        img.style.transform = `scale(${scale})`;
      }
      lastDist = dist;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      if (e.touches.length < 2) lastDist = null;
      // Double-tap to reset zoom
    });
  },

  _closeViewer() {
    if (this._viewerURL) { URL.revokeObjectURL(this._viewerURL); this._viewerURL = null; }
    if (this._viewerKeyHandler) { document.removeEventListener('keydown', this._viewerKeyHandler); this._viewerKeyHandler = null; }
    document.getElementById('bi-viewer')?.remove();
  },

  _viewerKeyHandler: null,

  /* ── Helpers ─────────────────────────────────────────── */
  _segmentCount() { return this._splits.length + 1; },

  _emptyConfig() { return { name: '', subject: '', chapter: '' }; },

  // Which segment (node) a photo index currently belongs to
  _segForIdx(i) {
    let s = 0;
    for (const sp of this._splits) { if (i > sp) s++; else break; }
    return s;
  },

  // For an example photo: which example number it is within its node, plus its
  // page position within that (possibly multi-page) example. null for notes.
  _exampleInfo(idx) {
    if (this._photos[idx]?.type !== 'example') return null;
    const seg = this._segForIdx(idx);
    let exNum = 0, inRun = false, runStart = -1;
    for (let i = 0; i < this._photos.length; i++) {
      if (this._segForIdx(i) !== seg) continue;
      if (this._photos[i].type === 'example') {
        if (!inRun) { inRun = true; exNum++; runStart = i; }
        if (i === idx) {
          let pages = 0, page = 0;
          for (let j = runStart;
               j < this._photos.length && this._segForIdx(j) === seg && this._photos[j].type === 'example';
               j++) {
            pages++;
            if (j === idx) page = pages;
          }
          return { exNum, page, pages };
        }
      } else {
        inRun = false;
      }
    }
    return null;
  },

  // Sort ALL photos by file name using natural/numeric order (so 1000109885.jpg
  // sorts before 1000109886.jpg, and ...9 before ...10). Gallery exports usually
  // carry capture order in the file name, so this restores that order in one tap.
  // Splits define node boundaries by photo index — reordering invalidates them, so
  // sorting resets to a single node. We confirm first if any splits exist.
  _sortByName() {
    if (this._photos.length < 2) return;
    this._syncConfigsFromDOM();   // keep the typed title before resetting to one node

    if (this._splits.length) {
      const ok = confirm('Sorting reorders every photo by file name and resets your node splits back to one node. Continue?');
      if (!ok) return;
    }

    // Remember the photo currently on screen so we can keep viewing it after sorting
    const current = this._photos[this._viewerIdx];

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    this._photos.sort((a, b) => collator.compare(a.file.name || '', b.file.name || ''));

    // Order changed → splits/configs no longer map to anything meaningful
    this._splits = [];
    this._configs = [this._configs[0] || this._emptyConfig()];

    if (current) {
      const newIdx = this._photos.indexOf(current);
      if (newIdx !== -1) this._viewerIdx = newIdx;
    }

    this._rerender();      // refresh the list behind the viewer
    this._renderViewer();  // refresh the viewer (new position / node label)
    Toast.info('Sorted ' + this._photos.length + ' photos by name.');
  },


  // Returns the index of the newly created config, or -1 if a split already existed.
  _addSplit(at) {
    if (this._splits.includes(at)) return -1;
    this._syncConfigsFromDOM();   // capture typed titles before reindexing configs
    this._splits.push(at);
    this._splits.sort((a, b) => a - b);
    const segIdx = this._splits.indexOf(at) + 1;
    const prev = this._configs[segIdx - 1] || this._emptyConfig();
    this._configs.splice(segIdx, 0, { name: '', subject: prev.subject, chapter: '' });
    this._rerender();
    return segIdx;
  },

  // Remove the split after photo `at`, merging the two nodes back together.
  _removeSplit(at) {
    if (!this._splits.includes(at)) return;
    this._syncConfigsFromDOM();   // capture typed titles before reindexing configs
    const segIdx = this._splits.indexOf(at) + 1;
    this._splits = this._splits.filter(s => s !== at);
    this._configs.splice(segIdx, 1);
    this._rerender();
  },

  _movePhoto(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= this._photos.length) return;
    this._syncConfigsFromDOM();   // keep typed titles when the list rebuilds
    // Swap the two adjacent photos. Splits are POSITIONAL node boundaries
    // ("new node starts after photo i"), so they must stay where they are —
    // the photo simply flows across the boundary to the other node. The old
    // index-remapping here moved boundaries to the wrong place and left the
    // per-node titles (_configs) attached to the wrong group, which is what
    // made notes-filled nodes report as "0 notes / examples only".
    [this._photos[idx], this._photos[newIdx]] = [this._photos[newIdx], this._photos[idx]];
    this._rerender();
    this._highlightPhotoRow(newIdx);   // flash + scroll so the moved photo is easy to track
  },

  // Briefly glow a photo row and bring it into view (used after a reorder)
  _highlightPhotoRow(idx) {
    requestAnimationFrame(() => {
      const row = document.querySelector('.bi-photo-row[data-idx="' + idx + '"]');
      if (!row) return;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const prevBg = row.style.background;
      row.style.transition = 'box-shadow 0.2s ease, background 0.2s ease';
      row.style.boxShadow  = '0 0 0 2px var(--accent), 0 0 16px rgba(240,165,0,0.55)';
      row.style.background = 'rgba(240,165,0,0.16)';
      setTimeout(() => { row.style.boxShadow = ''; row.style.background = prevBg; }, 900);
    });
  },

  _rerender() {
    const list = document.getElementById('bi-list');
    if (!list) return;
    list.innerHTML = this._renderList();

    // Keep the header count + Process button in sync with the real node count.
    // Previously these were only set on first render, so adding splits left the
    // header stuck on "1 node" while the list showed several.
    const total = this._photos.length;
    const segs  = this._segmentCount();
    const countEl = document.getElementById('bi-count');
    if (countEl) countEl.textContent = total + ' photos → ' + segs + ' node' + (segs !== 1 ? 's' : '');
    const procBtn = document.getElementById('bi-process');
    if (procBtn) procBtn.textContent = '▶ Process ' + segs + ' node' + (segs !== 1 ? 's' : '');
    // Re-bind config events (delegated from root, should still work)
  },

  _close() {
    document.getElementById('bi-root')?.remove();
    this._photos = [];
    this._splits = [];
    this._configs = [];
  },

  _showLoading(msg) {
    this._ensureLoaderStyles();
    let el = document.getElementById('bi-loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bi-loading';
      el.style.cssText = 'position:fixed;inset:0;background:var(--bg-base);z-index:9100;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;';
      el.innerHTML = `
        <div style="position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle, rgba(240,165,0,0.16), transparent 65%);filter:blur(20px);animation:kn-aurora 6s ease-in-out infinite;pointer-events:none;"></div>
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;animation:kn-fade-rise 0.4s ease both;">
          ${this._hexLoader(78)}
          <div style="font-family:var(--font-ui);font-weight:800;font-size:17px;letter-spacing:-0.01em;margin-top:22px;">Bulk Import</div>
          <div id="bi-loading-msg" style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted);margin-top:6px;">${this._esc(msg)}</div>
        </div>`;
      document.body.appendChild(el);
    } else {
      const m = document.getElementById('bi-loading-msg');
      if (m) m.textContent = msg;
    }

    // Remove loading when switching to main UI
    setTimeout(() => {
      if (!this._photos.length) return;
      document.getElementById('bi-loading')?.remove();
    }, 100);
  },

  // Decode the picked file ONCE and hold a capped-resolution, in-memory JPEG copy.
  // Two goals at the same time:
  //   • Stability — an in-memory blob never goes stale the way the Android picker's
  //     content:// File can, so the viewer and processing stay reliable.
  //   • Memory — 40+ full-resolution phone photos (8–12 MP each) held at once will
  //     OOM a low-end WebView, which is the main cause of bulk-import crashes. The
  //     whole pipeline (OCR + the AI vision call) already downscales to ≤2000px /
  //     ≤4MB, so a ~2200px JPEG copy loses nothing downstream while using a fraction
  //     of the heap. Fall back to a lossless copy only if decoding fails.
  async _prepImage(file) {
    let blob;
    try {
      blob = await this._downscaleToBlob(file);
    } catch (e) {
      try {
        const buf = await file.arrayBuffer();
        blob = new Blob([buf], { type: file.type || 'image/jpeg' });
      } catch (e2) {
        blob = file; // extremely unlikely; fall back to the original reference
      }
    }
    const thumb = await this._thumbFromBlob(blob);
    return { thumb, blob };
  },

  // Re-encode an image File/Blob to a capped-resolution JPEG Blob held in memory.
  // Decoding happens one photo at a time (start() awaits each), so peak memory is
  // a single decode, not the whole batch.
  _downscaleToBlob(file, maxEdge = 2200, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.width, h = img.height;
        if (!w || !h) { URL.revokeObjectURL(url); reject(new Error('bad image dimensions')); return; }
        const ratio = Math.min(maxEdge / w, maxEdge / h, 1);
        const c = document.createElement('canvas');
        c.width  = Math.max(1, Math.round(w * ratio));
        c.height = Math.max(1, Math.round(h * ratio));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(
          b => b ? resolve(b) : reject(new Error('toBlob returned null')),
          'image/jpeg', quality
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
      img.src = url;
    });
  },

  _thumbFromBlob(blob) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const max = 80;
        const ratio = Math.min(max / img.width, max / img.height, 1);
        const c = document.createElement('canvas');
        c.width  = Math.max(1, Math.round(img.width  * ratio));
        c.height = Math.max(1, Math.round(img.height * ratio));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  },

  async _toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Loader visuals are shared app-wide via KNLoader
  _ensureLoaderStyles() { KNLoader.ensureStyles(); },
  _hexLoader(size = 64) { return KNLoader.hex(size); },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
