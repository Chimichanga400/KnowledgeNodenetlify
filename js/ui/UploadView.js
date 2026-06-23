/**
 * UploadView.js — Final v14
 * Multi-image upload with drag-to-reorder, AI processes all images together
 */
const UploadView = {
  _files:       [],
  _scannedText: '',
  _targetNodeId:null,
  _dragSrcIdx:  null,

  init() {
    this._zone    = document.getElementById('upload-zone');
    this._input   = document.getElementById('file-input');
    this._preview = document.getElementById('upload-preview');
    this._config  = document.getElementById('upload-config');
    this._status  = document.getElementById('processing-status');
    this._label   = document.getElementById('processing-label');

    this._input.addEventListener('change', e => {
      if (e.target.files.length) this._handleFiles(e.target.files);
      e.target.value = '';
    });

    this._zone.addEventListener('click', e => {
      // Only a genuine tap on empty zone space should open the normal picker.
      // Ignore clicks bubbling up from the hidden file inputs (e.g. BulkImport's
      // programmatic bulk-import-input.click()) or from the action buttons/labels —
      // otherwise tapping "Bulk Import" also fires the normal file-input.
      if (e.target.closest('input, button, label')) return;
      this._input.click();
    });
    this._zone.addEventListener('dragover', e => { e.preventDefault(); this._zone.classList.add('drag-over'); });
    this._zone.addEventListener('dragleave',  () => this._zone.classList.remove('drag-over'));
    this._zone.addEventListener('drop',     e => { e.preventDefault(); this._zone.classList.remove('drag-over'); this._handleFiles(e.dataTransfer.files); });

    document.getElementById('bulk-import-btn')?.addEventListener('click', e => { e.stopPropagation(); BulkImport.trigger(); });
    document.getElementById('bulk-import-input')?.addEventListener('change', e => {
      if (e.target.files.length) BulkImport.start(e.target.files);
      e.target.value = '';
    });

    document.getElementById('process-ai-btn')       ?.addEventListener('click', () => this._processWithAI());
    document.getElementById('process-plain-btn')     ?.addEventListener('click', () => this._saveAsPlain());
    document.getElementById('scan-camera-btn')       ?.addEventListener('click', e => { e.stopPropagation(); this._openCameraCapture(); });
    document.getElementById('manual-text-btn')       ?.addEventListener('click', e => { e.stopPropagation(); this._showManualTextPanel(); });
    document.getElementById('create-empty-node-btn') ?.addEventListener('click', e => { e.stopPropagation(); this._createEmptyNode(); });
    document.getElementById('exam-paper-btn')          ?.addEventListener('click', e => { e.stopPropagation(); this._uploadExamPaper(); });

    document.getElementById('manual-text-input')?.addEventListener('input', () => {
      const words = (document.getElementById('manual-text-input').value.trim().match(/\S+/g)||[]).length;
      const el = document.getElementById('manual-word-count');
      if (el) el.textContent = words + ' words';
    });
    document.getElementById('manual-text-confirm-btn')?.addEventListener('click', () => this._confirmManualText());
    document.getElementById('manual-text-cancel-btn') ?.addEventListener('click', () => document.getElementById('manual-text-panel').classList.add('hidden'));

    // Live "what have I already created?" hint, keyed off the subject typed
    const subjEl = document.getElementById('node-subject');
    const chapEl = document.getElementById('node-chapter');
    subjEl?.addEventListener('input', () => this._updateModuleHint());
    subjEl?.addEventListener('focus', () => this._updateModuleHint());
    chapEl?.addEventListener('focus', () => this._updateModuleHint());
  },

  /** Show which module/node numbers already exist for the typed subject,
   *  so the user doesn't have to remember where they left off. */
  _updateModuleHint() {
    const hint = document.getElementById('existing-modules-hint');
    if (!hint) return;
    const subjectRaw = document.getElementById('node-subject')?.value.trim() || '';
    const subjKey = subjectRaw.toLowerCase().trim();

    const all = nodeStore.getAll();
    // If they've typed a subject, scope to it; otherwise show all subjects briefly.
    const scoped = subjKey
      ? all.filter(n => (n.subject || '').toLowerCase().trim() === subjKey)
      : all;

    if (!scoped.length) {
      hint.classList.add('hidden');
      hint.innerHTML = '';
      return;
    }

    // Group by chapter/module, list the node titles under each, sorted naturally
    const byChapter = {};
    scoped.forEach(n => {
      const ch = n.chapter || 'No module';
      (byChapter[ch] = byChapter[ch] || []).push(n.title || '(untitled)');
    });
    const chapters = Object.keys(byChapter).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    const label = subjKey
      ? 'You already have in "' + this._esc(subjectRaw) + '":'
      : 'Already in your library:';

    hint.innerHTML =
      '<div class="emh-title">📚 ' + label + '</div>'
      + chapters.map(ch => {
          const titles = byChapter[ch]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(t => this._esc(t));
          return '<div class="emh-row"><span class="emh-chapter">' + this._esc(ch) + '</span>'
            + '<span class="emh-nodes">' + titles.join(' · ') + '</span></div>';
        }).join('')
      + '<div class="emh-foot">Tip: continue the sequence (e.g. next after the highest number above).</div>';
    hint.classList.remove('hidden');
  },

  /* ─── Manual text ──────────────────────────────────── */
  _showManualTextPanel() {
    document.getElementById('manual-text-panel').classList.remove('hidden');
    setTimeout(() => document.getElementById('manual-text-input')?.focus(), 50);
  },

  _confirmManualText() {
    const text = document.getElementById('manual-text-input')?.value?.trim();
    if (!text) { Toast.info('Type or paste some notes first.'); return; }
    this._scannedText = text;
    document.getElementById('manual-text-panel').classList.add('hidden');
    document.getElementById('manual-text-input').value = '';
    this._config.classList.remove('hidden'); this._updateModuleHint();
    const words = (text.match(/\S+/g)||[]).length;
    Toast.success(words + ' words ready. Fill Subject/Chapter then choose import method.');
  },

  /* ─── Upload Past Exam Paper ──────────────────────── */
  _uploadExamPaper() {
    const subjects = [...new Set(nodeStore.getAll().map(n => n.subject).filter(Boolean))];
    Modal.open(
      '<h2 style="font-family:var(--font-ui);font-size:19px;font-weight:800;margin-bottom:6px;">📝 Past Exam Paper</h2>'
      + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:18px;">AI will analyse the exam style, question types, and mark allocation patterns. Future questions will be generated in the same style.</p>'
      + '<div class="config-row" style="margin-bottom:14px;"><label class="config-label">Subject *</label>'
      + (subjects.length
          ? '<select id="ep-subject" class="config-select"><option value="">Select or type below…</option>' + subjects.map(s=>'<option value="'+this._esc(s)+'">'+this._esc(s)+'</option>').join('') + '</select>'
          : '<input type="text" id="ep-subject-text" class="config-input" placeholder="e.g. Income Tax"/>')
      + '</div>'
      + (subjects.length ? '<div class="config-row" style="margin-bottom:14px;"><label class="config-label">Or type subject</label><input type="text" id="ep-subject-text" class="config-input" placeholder="Custom subject name…"/></div>' : '')
      + '<div class="config-row" style="margin-bottom:14px;"><label class="config-label">Exam Year / Name</label><input type="text" id="ep-name" class="config-input" placeholder="e.g. 2023 Final Exam, Midterm 2024"/></div>'
      + '<div class="config-row" style="margin-bottom:18px;"><label class="config-label">Upload Paper *</label>'
      + '<input type="file" id="ep-file" accept="image/*,.pdf" style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary);padding:8px 0;display:block;width:100%;"/></div>'
      + '<div id="ep-progress" style="display:none;text-align:center;padding:12px 0;">' + KNLoader.hex(40) + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:8px;">Analysing exam style…</p></div>'
      + '<div id="ep-actions" style="display:flex;gap:8px;">'
      + '<button class="btn-primary" id="ep-analyse-btn" style="flex:1;justify-content:center;">⬡ Analyse Exam Style</button>'
      + '<button class="btn-secondary" onclick="Modal.close()">Cancel</button></div>'
    );
    setTimeout(() => {
      document.getElementById('ep-analyse-btn')?.addEventListener('click', async () => {
        const subjectSel  = document.getElementById('ep-subject')?.value.trim();
        const subjectText = document.getElementById('ep-subject-text')?.value.trim();
        const subject = subjectText || subjectSel;
        const name    = document.getElementById('ep-name')?.value.trim() || 'Past Exam';
        const file    = document.getElementById('ep-file')?.files[0];
        if (!subject) { Toast.error('Please enter a subject.'); return; }
        if (!file)    { Toast.error('Please upload the exam paper.'); return; }
        if (!AIService.hasApiKey()) { Toast.error('Configure AI first in Settings.'); return; }
        document.getElementById('ep-actions').style.display = 'none';
        document.getElementById('ep-progress').style.display = 'block';
        try {
          const isPDF = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
          let ocrText = '';

          if (isPDF) {
            // 1) Try the PDF's text layer first (digital PDFs)
            const extracted = await this._extractPDFText(file);
            const looksEmptyOrScanned = !extracted
              || extracted.startsWith('[PDF:')
              || extracted.replace(/\s/g, '').length < 40;

            if (!looksEmptyOrScanned) {
              ocrText = extracted;
            } else {
              // 2) Scanned/image PDF — rasterise pages and OCR them with the AI
              const pageImages = await this._pdfPagesToImages(file, 5);
              if (!pageImages.length) {
                throw new Error('This PDF has no readable text and its pages could not be converted. Try uploading a clear photo of each page instead.');
              }
              const content = [];
              pageImages.forEach(b64 => content.push({ type:'image_url', image_url:{ url:'data:image/jpeg;base64,' + b64 } }));
              content.push({ type:'text', text:'These are pages of an exam paper. Extract all text exactly as it appears — every question, mark allocation, and instruction.' });
              ocrText = await AIService._callWithFunction('noteProcessing', [{ role:'user', content }], 2500);
            }
          } else {
            // Single image file — normalise to a Claude-supported type, then OCR
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
                  img.onerror = () => rej(new Error('Could not read image file. Try a JPG or PNG photo.'));
                  img.src = dataUrl;
                } else { res({base64:parts[1],mediaType:mt}); }
              };
              r.onerror = () => rej(new Error('Could not read file'));
              r.readAsDataURL(file);
            });
            const ocrMsgs = [{role:'user', content:[
              {type:'image_url', image_url:{url:'data:'+mediaType+';base64,'+base64}},
              {type:'text', text:'Extract all text from this exam paper exactly as it appears. Include all questions, marks, instructions.'}
            ]}];
            ocrText = await AIService._callWithFunction('noteProcessing', ocrMsgs, 2000);
          }

          if (!ocrText || ocrText.replace(/\s/g,'').length < 20) {
            throw new Error('Could not read any text from the paper. Try a clearer scan or photo.');
          }
          // Step 2: Analyse extracted text as JSON
          const prompt = 'Analyse this exam paper text for the subject "' + subject + '".'
            + ' Extract question types, mark allocations, topic areas, and 3 example questions with answers.'
            + ' Output ONLY raw JSON, no fences: {"questionTypes":[],"markPattern":"","topicAreas":[],"style":"","examQuestions":[{"question":"","marks":0,"modelAnswer":"","type":""}]}'
            + '\n\nEXAM TEXT:\n' + ocrText;
          const analysisMsgs = [
            {role:'user', content: prompt},
          ];
          const raw = await AIService._callWithFunction('noteProcessing', analysisMsgs, 1500);
          const analysis = AIService._parseJSON(raw);
          const key = 'kn_exam_style_' + subject.toLowerCase().replace(/\s+/g,'_');
          const existing = JSON.parse(localStorage.getItem(key) || '{"papers":[]}');
          existing.papers.push({ name, analysis, addedAt: Date.now() });
          localStorage.setItem(key, JSON.stringify(existing));
          Modal.close();
          const qCount = (analysis.examQuestions||[]).length;
          Toast.success('Exam style saved! ' + qCount + ' example questions extracted.');
        } catch(err) {
          document.getElementById('ep-actions').style.display = 'flex';
          document.getElementById('ep-progress').style.display = 'none';
          const msg = (err && err.message) ? err.message : (typeof err === 'string' ? err : 'Unknown error — check console');
          Toast.error('Analysis failed: ' + msg);
        }
      });
    }, 0);
  },

  /* ─── Create empty node ────────────────────────────── */
  _createEmptyNode() {
    Modal.open(
      '<h2 style="font-family:var(--font-ui);font-size:19px;font-weight:800;margin-bottom:6px;">Create Empty Node</h2>'
      + '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:20px;">Build structure now, add content later.</p>'
      + '<div class="config-row" style="margin-bottom:14px;"><label class="config-label">Subject *</label><input type="text" id="en-subject" class="config-input" placeholder="e.g. Income Tax Returns"/></div>'
      + '<div class="config-row" style="margin-bottom:14px;"><label class="config-label">Chapter / Module *</label><input type="text" id="en-chapter" class="config-input" placeholder="e.g. Module 1"/></div>'
      + '<div class="config-row" style="margin-bottom:14px;"><label class="config-label">Node Title</label><input type="text" id="en-title" class="config-input" placeholder="e.g. M1.1 - Gross Income (auto-generated if blank)"/></div>'
      + '<div style="background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:8px;padding:9px 12px;margin-bottom:14px;font-family:var(--font-body);font-size:12px;color:var(--text-secondary);line-height:1.5;">'
      + '💡 <strong>Tip:</strong> One node per topic works best — e.g. "M1.1 - Gross Income" as its own node, not the whole module. Aim for 3–5 pages per node.'
      + '</div>'
      + '<div class="config-row" style="margin-bottom:20px;"><label class="config-label">Initial Notes (optional)</label><textarea id="en-notes" class="config-input" rows="3" style="resize:vertical;touch-action:pan-y;" placeholder="Paste any initial text…"></textarea></div>'
      + '<div style="display:flex;gap:8px;"><button class="btn-primary" id="en-create-btn" style="flex:1;justify-content:center;">Create Node</button><button class="btn-secondary" onclick="Modal.close()">Cancel</button></div>'
    );
    setTimeout(() => {
      document.getElementById('en-subject')?.focus();
      document.getElementById('en-create-btn')?.addEventListener('click', () => {
        const subject = document.getElementById('en-subject')?.value.trim();
        const chapter = document.getElementById('en-chapter')?.value.trim();
        const title   = document.getElementById('en-title')?.value.trim() || [subject,chapter].filter(Boolean).join(' — ');
        const notes   = document.getElementById('en-notes')?.value.trim() || '';
        if (!subject||!chapter) { Toast.error('Subject and Chapter are required.'); return; }
        const node = new KnowledgeNode({ subject, chapter, title, userNotes:notes, processingStatus:'ready' });
        nodeStore.save(node);
        Modal.close();
        Toast.success('"' + title + '" created.');
        StreakTracker.recordActivity();
        App.navigateTo('library');
        setTimeout(() => NodeDetailView.open(node.id), 300);
      });
    }, 0);
  },

  /* ─── Append to existing node ──────────────────────── */
  openForNode(nodeId) {
    this._targetNodeId = nodeId;
    const node = nodeStore.get(nodeId);
    App.navigateTo('upload');
    setTimeout(() => {
      document.getElementById('upload-view-title').textContent    = 'Add More Content';
      document.getElementById('upload-view-subtitle').textContent = 'Adding to: "' + (node?.title||'node') + '"';
      const c = document.getElementById('append-badge-container');
      if (c) {
        c.innerHTML = '<div id="append-badge" style="display:inline-flex;align-items:center;gap:10px;padding:10px 18px;background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-bottom:20px;">⬡ Appending to: <strong>' + this._esc(node?.title||'') + '</strong><button id="cancel-append-btn" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button></div>';
        document.getElementById('cancel-append-btn')?.addEventListener('click', () => this.cancelAppend());
      }
    }, 50);
  },

  cancelAppend() {
    this._targetNodeId = null;
    const c = document.getElementById('append-badge-container');
    if (c) c.innerHTML = '';
    document.getElementById('upload-view-title').textContent    = 'Upload Content';
    document.getElementById('upload-view-subtitle').textContent = 'Drop images, PDFs, Word docs — AI processing or plain import.';
    this._reset();
  },

  /* ─── File handling ────────────────────────────────── */
  async _handleFiles(fileList) {
    const allowed  = Array.from(fileList).filter(f => this._isSupported(f));
    const rejected = fileList.length - allowed.length;
    if (rejected > 0) Toast.info(rejected + ' file(s) skipped — unsupported format.');
    if (!allowed.length) return;
    this._files.push(...allowed);
    await this._renderPreview();
    this._config.classList.remove('hidden'); this._updateModuleHint();
  },

  _isSupported(f) {
    return f.type.startsWith('image/')
      || f.type.includes('pdf')
      || f.type.includes('word') || f.name.endsWith('.docx') || f.name.endsWith('.doc')
      || f.type.includes('excel') || f.name.endsWith('.xlsx')
      || f.type.startsWith('text/') || f.name.endsWith('.txt') || f.name.endsWith('.md') || f.name.endsWith('.csv');
  },

  _fileIcon(f) {
    if (f.type.startsWith('image/'))  return '🖼';
    if (f.type.includes('pdf'))       return '📄';
    if (f.name.endsWith('.docx'))     return '📝';
    if (f.name.endsWith('.xlsx'))     return '📊';
    return '📃';
  },

  async _renderPreview() {
    this._preview.innerHTML = '';
    this._preview.classList.toggle('hidden', !this._files.length);
    if (!this._files.length) return;

    // Header with count and reorder hint
    const header = document.createElement('div');
    header.style.cssText = 'font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:10px;display:flex;align-items:center;gap:8px;';
    header.innerHTML = '<span>' + this._files.length + ' file' + (this._files.length > 1 ? 's' : '') + ' selected</span>'
      + (this._files.length > 1 ? '<span style="color:var(--text-muted);font-size:11px;">· Drag cards to reorder (AI reads left→right)</span>' : '');
    this._preview.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'preview-grid';
    this._preview.appendChild(grid);

    for (let i = 0; i < this._files.length; i++) {
      const f    = this._files[i];
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.draggable = true;
      item.dataset.idx = i;

      if (f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f);
        item.innerHTML = '<div class="preview-order-badge">' + (i+1) + '</div><img src="' + url + '" loading="lazy" alt="Page ' + (i+1) + '" style="width:100%;height:110px;object-fit:cover;display:block;border-radius:var(--radius-sm) var(--radius-sm) 0 0;"/><div class="preview-filename">' + f.name.slice(0,22) + '</div><button class="preview-remove" data-idx="' + i + '">✕</button>';
      } else {
        item.innerHTML = '<div class="preview-order-badge">' + (i+1) + '</div><div style="height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;"><span style="font-size:28px;">' + this._fileIcon(f) + '</span><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">' + (f.size/1024).toFixed(0) + ' KB</span></div><div class="preview-filename">' + f.name.slice(0,22) + '</div><button class="preview-remove" data-idx="' + i + '">✕</button>';
      }

      // Drag-to-reorder
      item.addEventListener('dragstart', e => { this._dragSrcIdx = i; item.style.opacity='0.4'; e.dataTransfer.effectAllowed='move'; });
      item.addEventListener('dragend',   () => { item.style.opacity='1'; });
      item.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; item.style.outline='2px solid var(--accent)'; });
      item.addEventListener('dragleave', () => { item.style.outline=''; });
      item.addEventListener('drop',      e => {
        e.preventDefault(); item.style.outline='';
        if (this._dragSrcIdx !== null && this._dragSrcIdx !== i) {
          const moved = this._files.splice(this._dragSrcIdx, 1)[0];
          this._files.splice(i, 0, moved);
          this._renderPreview();
        }
      });

      grid.appendChild(item);
    }

    grid.querySelectorAll('.preview-remove').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this._removeFile(parseInt(btn.dataset.idx)); });
    });
  },

  _removeFile(idx) {
    this._files.splice(idx, 1);
    this._renderPreview();
    if (!this._files.length && !this._scannedText) this._config.classList.add('hidden');
  },

  /* ─── Camera capture ────────────────────────────────── */
  _openCameraCapture() {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const hasAPI   = !!(navigator.mediaDevices?.getUserMedia);

    if (!hasAPI || !isSecure) {
      const ua = navigator.userAgent;
      let browserName = 'Your browser';
      let tip = 'Camera access requires HTTPS.';
      if (/SamsungBrowser/.test(ua)) { browserName='Samsung Browser'; tip='Samsung Browser requires HTTPS for camera. Use the native camera app instead.'; }
      else if (/Chrome/.test(ua) && !/Edg/.test(ua)) { browserName='Chrome'; tip='Chrome requires HTTPS for camera access. This is a security policy.'; }
      else if (/Firefox/.test(ua)) { browserName='Firefox'; tip='Firefox requires HTTPS for camera access.'; }
      else if (/Edg/.test(ua)) { browserName='Edge'; tip='Edge requires HTTPS for camera access.'; }
      else if (/Safari/.test(ua)) { browserName='Safari'; tip='Safari requires HTTPS for camera access.'; }

      Modal.open(
        '<h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:12px;">Camera Unavailable</h2>'
        + '<div style="background:var(--blue-dim);border:1px solid rgba(78,142,247,0.25);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:16px;">'
        + '<div style="font-family:var(--font-ui);font-size:12px;font-weight:700;color:var(--blue);margin-bottom:6px;">' + browserName + ' — HTTPS Required</div>'
        + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.65;">' + tip + '</p>'
        + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:6px;">Current: ' + location.host + ' (HTTP)</p>'
        + '</div>'
        + '<div style="display:flex;gap:8px;"><button class="btn-primary" id="cam-gallery-fallback-btn" style="flex:1;justify-content:center;">📁 Open Gallery Instead</button><button class="btn-secondary" onclick="Modal.close()">Cancel</button></div>'
      );
      setTimeout(() => {
        document.getElementById('cam-gallery-fallback-btn')?.addEventListener('click', () => {
          Modal.close();
          const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true;
          inp.addEventListener('change', () => { if(inp.files.length) { Array.from(inp.files).forEach(f=>this._processImageForOCR(f)); } inp.value=''; });
          inp.click();
        });
      }, 0);
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;display:flex;flex-direction:column;';
    overlay.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:rgba(0,0,0,0.9);">'
      + '<span style="font-family:var(--font-ui);font-size:14px;font-weight:700;color:#fff;">📷 Scan Document</span>'
      + '<button id="cam-close-btn" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px 8px;">✕</button>'
      + '</div>'
      + '<div id="cam-status" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#fff;z-index:2;">'
      + '<div style="font-size:32px;margin-bottom:12px;">📷</div>'
      + '<div style="font-family:var(--font-ui);font-size:14px;">Starting camera…</div>'
      + '<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;">Allow camera permission if prompted</div>'
      + '</div>'
      + '<video id="cam-video" autoplay playsinline muted style="flex:1;object-fit:cover;width:100%;display:block;background:#000;" webkit-playsinline></video>'
      + '<div style="padding:20px 16px;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;gap:20px;position:relative;">'
      + '<button id="cam-capture-btn" style="width:72px;height:72px;border-radius:50%;background:var(--accent);border:4px solid #fff;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(240,165,0,0.5);">📷</button>'
      + '<button id="cam-gallery-btn" style="position:absolute;right:20px;padding:10px 16px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:var(--radius-md);color:#fff;font-family:var(--font-ui);font-size:12px;cursor:pointer;">Gallery</button>'
      + '</div>'
      + '<canvas id="cam-canvas" style="display:none;"></canvas>';
    document.body.appendChild(overlay);

    const video  = overlay.querySelector('#cam-video');
    const canvas = overlay.querySelector('#cam-canvas');
    const status = overlay.querySelector('#cam-status');
    let stream   = null;

    const cleanup = () => { stream?.getTracks().forEach(t=>t.stop()); overlay.remove(); };

    const startCamera = async () => {
      const constraints = [
        { video:{ facingMode:{exact:'environment'} } },
        { video:{ facingMode:'environment' } },
        { video:true },
      ];
      for (const c of constraints) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
        catch(e) { if (e.name==='NotAllowedError') { cleanup(); Toast.error('Camera permission denied.'); return; } }
      }
      if (!stream) { cleanup(); Toast.info('Camera unavailable — use Gallery.'); return; }
      video.srcObject = stream;
      video.onloadedmetadata = async () => { try { await video.play(); if(status) status.style.display='none'; } catch{} };
      setTimeout(async () => { if (video.paused && stream) try { await video.play(); if(status) status.style.display='none'; } catch{} }, 800);
    };

    startCamera();

    overlay.querySelector('#cam-close-btn').addEventListener('click', cleanup);
    overlay.querySelector('#cam-capture-btn').addEventListener('click', () => {
      if (!stream || video.videoWidth===0) { Toast.error('Camera not ready yet.'); return; }
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      canvas.getContext('2d').drawImage(video,0,0);
      const capBtn = overlay.querySelector('#cam-capture-btn');
      if (capBtn) { capBtn.style.transform='scale(0.9)'; setTimeout(()=>capBtn.style.transform='',100); }
      cleanup();
      canvas.toBlob(blob => { if(blob) this._processImageForOCR(new File([blob],'scan.jpg',{type:'image/jpeg'})); }, 'image/jpeg', 0.95);
    });
    overlay.querySelector('#cam-gallery-btn').addEventListener('click', () => {
      cleanup();
      const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true;
      inp.addEventListener('change', () => { Array.from(inp.files).forEach(f=>this._handleFiles([f])); inp.value=''; });
      inp.click();
    });
  },

  async _processImageForOCR(file) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    modal.innerHTML = KNLoader.hex(56) + '<p style="font-family:var(--font-mono);font-size:14px;color:var(--accent);" id="ocr-status">Reading text…</p><div class="mastery-bar-track" style="width:240px;height:6px;"><div class="mastery-bar-fill" id="ocr-progress" style="width:0%;height:6px;"></div></div>';
    document.body.appendChild(modal);
    try {
      this._files.push(file);
      await this._renderPreview();
      this._config.classList.remove('hidden'); this._updateModuleHint();
      if (window.Tesseract) {
        const imgUrl = URL.createObjectURL(file);
        const result = await Tesseract.recognize(imgUrl, 'eng', {
          logger: m => {
            if (m.status==='recognizing text') {
              const pct = Math.round(m.progress*100);
              const el = document.getElementById('ocr-status'); if(el) el.textContent='Recognising: '+pct+'%';
              const pr = document.getElementById('ocr-progress'); if(pr) pr.style.width=pct+'%';
            }
          }
        });
        URL.revokeObjectURL(imgUrl);
        const text = result.data.text?.trim();
        if (text) {
          document.body.removeChild(modal);
          OCRReview.show(file, text, result.data?.words||[], (confirmed) => {
            this._scannedText = (this._scannedText ? this._scannedText + '\n\n---\n\n' : '') + confirmed;
            Toast.success('✓ Text confirmed. Fill Subject/Chapter and choose import method.');
          }, () => {
            this._scannedText = (this._scannedText ? this._scannedText + '\n\n---\n\n' : '') + text;
            Toast.info('Text imported as-is.');
          });
        } else {
          document.body.removeChild(modal);
          Toast.info('No text detected. Image saved — use AI Processing.');
        }
      } else {
        document.body.removeChild(modal);
        Toast.info('Image added. Use AI Processing for text extraction.');
      }
    } catch(e) {
      if (modal.parentNode) document.body.removeChild(modal);
      Toast.error('Scan error: ' + e.message);
    }
  },

  /* ─── AI Processing ────────────────────────────────── */
  async _processWithAI() {
    if (!this._files.length && !this._scannedText) { Toast.error('Add a file, scan an image, or type notes first.'); return; }
    const subject = document.getElementById('node-subject').value.trim();
    const chapter = document.getElementById('node-chapter').value.trim();
    const detail  = document.getElementById('node-detail').value;
    const meta    = { subject, chapter, detail };

    this._config.classList.add('hidden');
    this._status.classList.remove('hidden');

    const onProgress = (step, label) => {
      this._label.textContent = label;
      ['pstep-1','pstep-2','pstep-3','pstep-4'].forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = i+1 < step ? 'proc-step done' : i+1===step ? 'proc-step active' : 'proc-step';
      });
    };

    try {
      const imageFiles   = this._files.filter(f => f.type.startsWith('image/'));
      const textFiles    = this._files.filter(f => !f.type.startsWith('image/'));
      const imageData = await Promise.all(imageFiles.map(f => this._toBase64WithType(f)));
      const base64Images = imageData.map(d => d.base64);
      const mediaTypes   = imageData.map(d => d.mediaType);

      let rawText = this._scannedText || '';
      if (!rawText && textFiles.length > 0) {
        onProgress(1, 'Extracting text from ' + textFiles.length + ' file(s)…');
        const parts = await Promise.all(textFiles.map(f => this._extractFileText(f)));
        rawText = parts.join('\n\n---\n\n');
      }
      // For photo uploads, OCR up front so we can detect worked examples too.
      // The extracted text is then reused by processContent (no double OCR).
      if (!rawText && base64Images.length > 0 && AIService.hasApiKey()) {
        onProgress(1, 'Reading ' + base64Images.length + ' image' + (base64Images.length>1?'s':'') + '…');
        try {
          rawText = base64Images.length > 1
            ? await AIService._extractMultiPageText(base64Images, mediaTypes)
            : await AIService._extractSingleImageText(base64Images[0], mediaTypes[0] || 'image/jpeg');
        } catch(e) { /* fall through; processContent will OCR if needed */ }
      }

      // Detect if this looks like a worked example, and offer to file it there.
      if (this._looksLikeWorkedExample(rawText)) {
        const goExamples = await this._askExampleRouting();
        if (goExamples) {
          const filed = await this._saveAsWorkedExample(rawText, subject, chapter, base64Images);
          if (filed) { return; }
          // Extraction errored — fall through and process as notes instead
          this._status.classList.remove('hidden');
        }
      }

      let nodeData;
      if (AIService.hasApiKey()) {
        nodeData = await AIService.processContent(base64Images, rawText, meta, onProgress, mediaTypes);
      } else {
        Toast.info('No AI key configured — using demo data. Go to Settings → Configure AI.');
        nodeData = await AIService.mockProcess(meta, onProgress);
      }

      await this._saveNode(nodeData, subject, chapter, detail, base64Images);
    } catch(err) {
      console.error('[UploadView]', err);
      Toast.error('AI processing failed: ' + err.message);
      this._status.classList.add('hidden');
      this._config.classList.remove('hidden'); this._updateModuleHint();
    }
  },

  /** Cheap keyword heuristic — does this text look like a worked example?
   *  Worked examples have a question + a full solution, often labelled. */
  _looksLikeWorkedExample(text) {
    if (!text || text.length < 60) return false;
    const t = text.toLowerCase();
    let score = 0;
    // Explicit labels (your textbook uses "Learning example")
    if (/\b(learning example|worked example|example \d|exercise \d|activity \d)\b/.test(t)) score += 3;
    // Question/solution structure
    if (/\b(required|solution|answer|prepare the|calculate|draw up|show the)\b/.test(t)) score += 1;
    if (/\b(solution|answer|workings?)\b/.test(t)) score += 1;
    // Accounting working cues
    if (/\b(trial balance|trading account|profit and loss|general ledger|journal|debit|credit)\b/.test(t)) score += 1;
    return score >= 3;
  },

  /** Ask the user whether to file this as a worked example. Resolves true/false. */
  _askExampleRouting() {
    return new Promise(resolve => {
      Modal.open(
        '<div style="text-align:center;">'
        + '<div style="font-size:30px;margin-bottom:10px;">💡</div>'
        + '<h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:8px;">This looks like a worked example</h2>'
        + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:20px;">'
        + 'It has a question and a full solution. Would you like to file it under <strong>Examples</strong> (where the AI tutors you through it step by step), or keep it as regular <strong>Notes</strong>?</p>'
        + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">'
        + '<button class="btn-primary" id="route-example-btn" style="font-size:13px;padding:10px 18px;">💡 Add to Examples</button>'
        + '<button class="btn-secondary" id="route-notes-btn" style="font-size:13px;padding:10px 18px;">📋 Keep as Notes</button>'
        + '</div></div>'
      );
      setTimeout(() => {
        document.getElementById('route-example-btn')?.addEventListener('click', () => { Modal.close(); resolve(true); });
        document.getElementById('route-notes-btn')?.addEventListener('click', () => { Modal.close(); resolve(false); });
      }, 0);
    });
  },

  /** Process the text as a worked example and attach it to the chosen node. */
  async _saveAsWorkedExample(rawText, subject, chapter, base64Images = []) {
    // Pick or create a node to attach the example to:
    //   1. If we're appending to a specific node, use that one.
    //   2. Else an existing node in the same subject+chapter.
    //   3. Else the newest node in the subject.
    //   4. Else create a new node so the example always has a home.
    const all = nodeStore.getAll();
    const subjKey = (subject || '').toLowerCase().trim();
    let target = this._targetNodeId ? nodeStore.get(this._targetNodeId) : null;
    if (!target && subjKey) {
      target = all.find(n => (n.subject||'').toLowerCase().trim() === subjKey
                           && (n.chapter||'').toLowerCase().trim() === (chapter||'').toLowerCase().trim());
    }
    if (!target && subjKey) {
      target = all.filter(n => (n.subject||'').toLowerCase().trim() === subjKey)
                  .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0];
    }

    try {
      Toast.info('Extracting worked example…');
      let data = null;
      if (AIService.hasApiKey()) {
        const prompt = 'Extract this worked accounting example. Capture any ledger accounts, journals, or financial tables as structured tables — preserve columns and rows, including totals.\n'
          + 'Output ONLY valid, complete JSON (no markdown, no trailing commas, close every bracket):\n'
          + '{"title":"brief title","question":"the question/scenario","solution":"narrative explanation only","steps":["step"],"tables":[{"caption":"","columns":["col"],"rows":[["cell"]]}]}\n'
          + 'Keep numbers exactly as written. If unsure, use fewer tables rather than malformed ones.\n\nTEXT:\n' + rawText.slice(0, 16000);
        try {
          const raw = await AIService._callWithFunction('noteProcessing', [{role:'user',content:prompt}], 6000);
          data = AIService._parseJSON(raw);
        } catch(parseErr) {
          // First attempt failed — retry once asking for narrative only (no tables),
          // which produces much simpler, more reliable JSON.
          console.warn('[UploadView] example JSON failed, retrying without tables:', parseErr);
          try {
            const simplePrompt = 'Summarise this worked example. Output ONLY valid JSON:\n'
              + '{"title":"brief title","question":"the question","solution":"full solution as readable text including the figures"}\n\nTEXT:\n' + rawText.slice(0, 16000);
            const raw2 = await AIService._callWithFunction('noteProcessing', [{role:'user',content:simplePrompt}], 4000);
            data = AIService._parseJSON(raw2);
            if (data && !data.tables) data.tables = [];
          } catch(parseErr2) {
            data = null; // both failed — fall back to raw text below
          }
        }
      }

      // Fallback: if AI extraction failed or no key, save the raw text so the
      // example is never lost — the user can tidy it in the Examples tab.
      if (!data || typeof data !== 'object') {
        const lines = rawText.split('\n').map(l=>l.trim()).filter(Boolean);
        data = {
          title:    'Scanned Example',
          question: lines.slice(0, 2).join(' ') || 'Worked example',
          solution: rawText.slice(0, 4000),
          steps:    [],
          tables:   [],
        };
        Toast.info('Saved the example as text — couldn\'t structure the tables this time.');
      }

      const example = {
        id: 'ex_' + Math.random().toString(36).slice(2,9),
        title:    data.title    || 'Scanned Example',
        question: data.question || '',
        solution: data.solution || rawText.slice(0,2000),
        steps:    Array.isArray(data.steps) ? data.steps : [],
        tables:   Array.isArray(data.tables) ? data.tables : [],
        pageCount: base64Images.length || 1,
        addedAt:  Date.now(),
      };

      // No existing node to attach to → create one so the example has a home,
      // honoring the user's choice instead of silently dumping it into notes.
      if (!target) {
        target = new KnowledgeNode({
          subject: subject || 'Examples',
          chapter: chapter || '',
          title:   example.title || 'Worked Examples',
          summary: 'Worked examples for this topic.',
          processingStatus: 'ready',
          workedExamples: [example],
        });
        nodeStore.save(target);
        if (typeof Onboarding !== 'undefined') Onboarding.markUploaded();
        Toast.success('Created "' + target.title + '" with your worked example ✓');
        this._reset();
        App.navigateTo('library');
        return true;
      }

      if (!target.workedExamples) target.workedExamples = [];
      target.workedExamples.push(example);
      nodeStore.save(target);
      if (typeof Onboarding !== 'undefined') Onboarding.markUploaded();
      Toast.success('Worked example added to "' + target.title + '" → Examples tab ✓');
      this._reset();
      App.navigateTo('library');
      return true;
    } catch(e) {
      Toast.error('Could not extract example: ' + (e.message||'try again'));
      this._config.classList.remove('hidden'); this._updateModuleHint();
      return false;
    }
  },

  /* ─── Plain import ─────────────────────────────────── */
  async _saveAsPlain() {
    if (!this._files.length && !this._scannedText) { Toast.error('Add a file or type notes first.'); return; }
    const subject = document.getElementById('node-subject').value.trim();
    const chapter = document.getElementById('node-chapter').value.trim();
    this._config.classList.add('hidden');
    this._status.classList.remove('hidden');
    this._label.textContent = 'Importing…';
    document.getElementById('pstep-1').className = 'proc-step active';
    try {
      const imageFiles   = this._files.filter(f => f.type.startsWith('image/'));
      const textFiles    = this._files.filter(f => !f.type.startsWith('image/'));
      const imageData = await Promise.all(imageFiles.map(f => this._toBase64WithType(f)));
      const base64Images = imageData.map(d => d.base64);
      let rawText = this._scannedText || '';
      if (!rawText && textFiles.length > 0) {
        const parts = await Promise.all(textFiles.map(f => this._extractFileText(f)));
        rawText = parts.join('\n\n---\n\n');
      }
      document.getElementById('pstep-1').className = 'proc-step done';
      document.getElementById('pstep-4').className = 'proc-step active';
      this._label.textContent = 'Building node…';
      await this._delay(200);
      const title = chapter||subject ? [subject,chapter].filter(Boolean).join(' — ') : (this._files[0]?.name.replace(/\.[^.]+$/,'') || 'Imported Notes');
      await this._saveNode({ rawOCR:rawText, title, definitions:[], tables:[], formulas:[], procedures:[], commonMistakes:[], summary:'', userNotes:rawText, questions:[], processingStatus:'ready' }, subject, chapter, 'plain', base64Images);
    } catch(err) {
      Toast.error('Import failed: ' + err.message);
      this._status.classList.add('hidden');
      this._config.classList.remove('hidden'); this._updateModuleHint();
    }
  },

  /* ─── Save node ─────────────────────────────────────── */
  async _saveNode(nodeData, subject, chapter, detail, base64Images) {
    if (this._targetNodeId) {
      const existing = nodeStore.get(this._targetNodeId);
      if (existing) {
        existing.definitions    = [...existing.definitions,    ...(nodeData.definitions    ||[])];
        existing.tables         = [...(existing.tables||[]),   ...(nodeData.tables         ||[])];
        existing.formulas       = [...existing.formulas,       ...(nodeData.formulas       ||[])];
        existing.procedures     = [...(existing.procedures||[]),...(nodeData.procedures    ||[])];
        existing.commonMistakes = [...existing.commonMistakes, ...(nodeData.commonMistakes ||[])];
        existing.summary        = [existing.summary, nodeData.summary].filter(Boolean).join('\n\n');
        existing.userNotes      = [existing.userNotes, nodeData.userNotes].filter(Boolean).join('\n\n---\n\n');
        existing.questions      = [...existing.questions,      ...(nodeData.questions      ||[])];
        existing.sourceImages   = [...existing.sourceImages,   ...base64Images];
        existing.rawOCR         = [existing.rawOCR, nodeData.rawOCR].filter(Boolean).join('\n\n---\n\n');
        nodeStore.save(existing);
        Toast.success('Content added to "' + existing.title + '"!');
        this._targetNodeId = null;
        this._reset();
        App.navigateTo('library');
        return;
      }
    }
    const node = new KnowledgeNode({...nodeData, subject, chapter, sourceImages:base64Images, processingDetail:detail});
    nodeStore.save(node);
    StreakTracker.recordActivity();
    Onboarding.markUploaded();
    Toast.success('Node created: "' + node.title + '"');
    this._reset();
    App.navigateTo('library');
  },

  /* ─── Text extraction ───────────────────────────────── */
  async _extractFileText(file) {
    if (file.type.startsWith('text/')||file.name.endsWith('.txt')||file.name.endsWith('.md')||file.name.endsWith('.csv')) return await file.text();
    if (file.type.includes('pdf'))  return await this._extractPDFText(file);
    if (file.type.includes('word')||file.name.endsWith('.docx')) return await this._extractDocxText(file);
    return '[' + file.name + ']';
  },

  async _extractPDFText(file) {
    try {
      if (window.pdfjsLib) {
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const pageCount = Math.min(pdf.numPages, 20); // cap at 20 pages
        let text = '';
        for (let i = 1; i <= pageCount; i++) {
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n\n';
        }
        const cleaned = text.replace(/\s{3,}/g, '\n').trim();
        if (cleaned.length > 30) return cleaned;
        // PDF had no extractable text — likely a scanned document
        Toast.info('This PDF appears to be scanned. Use "Scan Example" to photograph pages directly.');
        return '[PDF: ' + file.name + ' — scanned PDF, no text layer found. Upload images of the pages instead.]';
      }
      return '[PDF: ' + file.name + ' — PDF viewer not loaded yet, try again in a moment.]';
    } catch(e) {
      console.warn('[UploadView] PDF extraction failed:', e);
      return '[PDF: ' + file.name + ' — ' + e.message + '. Try uploading a photo of the page instead.]';
    }
  },

  /** Render the first N pages of a PDF to JPEG base64 strings (for scanned PDFs). */
  async _pdfPagesToImages(file, maxPages = 5) {
    const images = [];
    try {
      if (!window.pdfjsLib) return images;
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pageCount = Math.min(pdf.numPages, maxPages);
      for (let i = 1; i <= pageCount; i++) {
        const page     = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas   = document.createElement('canvas');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        const ctx      = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const jpeg = canvas.toDataURL('image/jpeg', 0.85);
        images.push(jpeg.split(',')[1]);
      }
    } catch(e) {
      console.warn('[UploadView] PDF rasterize failed:', e);
    }
    return images;
  },

  async _extractDocxText(file) {
    try {
      if (window.mammoth) {
        const result = await mammoth.extractRawText({ arrayBuffer:await file.arrayBuffer() });
        if (result.value?.trim()) return result.value;
      }
      return '[Word: ' + file.name + ' — mammoth.js loading, try again.]';
    } catch(e) { return '[Word: ' + file.name + ' — ' + e.message + ']'; }
  },

  _toBase64(file) {
    return new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
  },

  // Returns {base64, mediaType} — normalises to Claude-supported types
  _toBase64WithType(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = r.result;
        const parts = dataUrl.split(',');
        let mt = parts[0].match(/data:([^;]+);/)?.[1] || file.type || 'image/jpeg';
        const supported = ['image/jpeg','image/png','image/gif','image/webp'];
        if (!supported.includes(mt)) {
          // Convert unsupported format (HEIC, BMP, TIFF, etc.) to JPEG via canvas
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            const jpeg = c.toDataURL('image/jpeg', 0.92);
            res({ base64: jpeg.split(',')[1], mediaType: 'image/jpeg' });
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
  },

  _reset() {
    this._files=[]; this._scannedText='';
    this._preview.innerHTML=''; this._preview.classList.add('hidden');
    this._config.classList.add('hidden');
    this._status.classList.add('hidden');
    this._input.value='';
    document.getElementById('node-subject').value='';
    document.getElementById('node-chapter').value='';
    document.getElementById('manual-text-panel')?.classList.add('hidden');
    const mt = document.getElementById('manual-text-input'); if(mt) mt.value='';
    const bc = document.getElementById('append-badge-container'); if(bc) bc.innerHTML='';
    this._targetNodeId = null;
    const hint = document.getElementById('existing-modules-hint'); if(hint){ hint.classList.add('hidden'); hint.innerHTML=''; }
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),

  _delay: ms => new Promise(r=>setTimeout(r,ms)),
};
