/**
 * ImageResponseBlock.js
 * Pairs a response area (text/procedure/table) with an image inside a node.
 * Renders below each image that has a responseBlock attached.
 */
const ImageResponseBlock = {

  /* Render an image with its response block below */
  render(img, node, editable) {
    const rb = img.responseBlock;
    const hasRB = rb && (rb.type);

    const imageHTML =
      '<div class="img-block img-with-response" data-img-id="' + img.id + '" style="width:' + (img.width||80) + '%;min-width:180px;">'
      + '<div class="img-wrap">'
      + '<img src="data:image/jpeg;base64,' + img.base64 + '" alt="' + this._esc(img.caption||'Image') + '" loading="lazy" style="width:100%;display:block;border-radius:var(--radius-sm) var(--radius-sm) 0 0;"/>'
      + (editable
          ? '<div class="img-resize-handle">⟺</div>'
          + '<button class="img-delete-btn" data-img-id="' + img.id + '">✕</button>'
          : '')
      + '</div>'
      + (img.caption ? '<div class="img-caption">' + this._esc(img.caption) + '</div>' : '')

      // Response block area
      + (hasRB || editable
          ? '<div class="img-response-block" data-img-id="' + img.id + '">'
          + (!hasRB && editable
              ? this._renderAddResponseBtn(img.id)
              : this._renderResponseContent(img, node, editable))
          + '</div>'
          : '')
      + '</div>';

    return imageHTML;
  },

  _renderAddResponseBtn(imgId) {
    return '<div class="irb-add-row">'
      + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Add a response area below this image:</span>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">'
      + '<button class="irb-type-btn" data-img-id="' + imgId + '" data-type="text">✍ Answer text</button>'
      + '<button class="irb-type-btn" data-img-id="' + imgId + '" data-type="procedure">📋 Working steps</button>'
      + '<button class="irb-type-btn" data-img-id="' + imgId + '" data-type="table">📊 Computation table</button>'
      + '</div>'
      + '</div>';
  },

  _renderResponseContent(img, node, editable) {
    const rb  = img.responseBlock;
    if (!rb)  return this._renderAddResponseBtn(img.id);

    const type = rb.type;
    let contentHTML = '';

    if (type === 'text') {
      contentHTML = editable
        ? '<textarea class="config-input irb-text-area" data-img-id="' + img.id + '" rows="4" style="width:100%;resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.65;" placeholder="Write your answer here…">' + this._esc(rb.content||'') + '</textarea>'
        : '<div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.65;padding:10px 0;white-space:pre-wrap;">' + (rb.content ? this._esc(rb.content) : '<span style="color:var(--text-muted);font-style:italic;">No answer yet.</span>') + '</div>';
    }

    if (type === 'procedure') {
      const steps = rb.steps || [];
      contentHTML = editable
        ? '<div class="irb-proc-list" data-img-id="' + img.id + '">'
          + steps.map((s,i) =>
              '<div class="edit-row irb-step-row" style="gap:8px;">'
              + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:20px;padding-top:10px;">' + (i+1) + '.</span>'
              + '<input type="text" class="config-input irb-step-input" value="' + this._esc(s) + '" placeholder="Step…" data-img-id="' + img.id + '" style="flex:1;font-size:13px;padding:9px 12px;"/>'
              + '<button class="edit-del-btn">✕</button>'
              + '</div>'
            ).join('')
          + '</div>'
          + '<button class="btn-secondary irb-add-step-btn" data-img-id="' + img.id + '" style="font-size:11px;padding:6px 12px;margin-top:6px;">+ Add Step</button>'
        : '<div style="display:flex;flex-direction:column;gap:4px;padding:8px 0;">'
          + (steps.length
              ? steps.map((s,i)=>'<div class="procedure-step"><div class="procedure-num">'+(i+1)+'</div><div class="procedure-text">'+this._esc(s)+'</div></div>').join('')
              : '<span style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;">No steps yet.</span>')
          + '</div>';
    }

    if (type === 'table') {
      const cols = rb.columns || ['Item','Amount','Notes'];
      const rows = rb.rows    || [['','','']];
      contentHTML = editable
        ? '<div style="overflow-x:auto;">'
          + '<table style="width:100%;border-collapse:collapse;">'
          + '<thead><tr>' + cols.map((c,ci)=>'<th style="padding:6px 8px;background:var(--bg-raised);border:1px solid var(--border);font-family:var(--font-ui);font-size:11px;font-weight:700;text-transform:uppercase;"><input type="text" class="irb-col-input" value="'+this._esc(c)+'" data-img-id="'+img.id+'" data-col-idx="'+ci+'" style="border:none;background:transparent;font-family:inherit;font-size:inherit;font-weight:inherit;text-transform:inherit;width:80px;color:var(--text-muted);"/></th>').join('') + '</tr></thead>'
          + '<tbody class="irb-table-body" data-img-id="' + img.id + '">'
          + rows.map((row,ri)=>'<tr>' + cols.map((_,ci)=>'<td style="padding:4px;border:1px solid var(--border-soft);"><input type="text" class="config-input irb-cell-input" value="'+this._esc(row[ci]||'')+'" data-img-id="'+img.id+'" data-row-idx="'+ri+'" data-col-idx="'+ci+'" style="width:100%;min-width:60px;font-size:13px;padding:7px 8px;border:none;"/></td>').join('') + '<td style="padding:4px;border:1px solid var(--border-soft);"><button class="edit-del-btn irb-row-del" data-img-id="'+img.id+'" data-row-idx="'+ri+'">✕</button></td></tr>').join('')
          + '</tbody></table></div>'
          + '<button class="btn-secondary irb-add-tbl-row-btn" data-img-id="' + img.id + '" style="font-size:11px;padding:6px 12px;margin-top:6px;">+ Add Row</button>'
        : '<div style="overflow-x:auto;"><table class="node-table"><thead><tr>'
          + cols.map(c=>'<th>'+this._esc(c)+'</th>').join('')
          + '</tr></thead><tbody>'
          + rows.map(row=>'<tr>'+cols.map((_,ci)=>'<td>'+this._esc(row[ci]||'')+'</td>').join('')+'</tr>').join('')
          + '</tbody></table></div>';
    }

    const modelAns = rb.modelAnswer
      ? '<details class="irb-model-answer"><summary>Show model answer</summary><div class="irb-model-text">' + this._esc(rb.modelAnswer) + '</div></details>'
      : (editable
          ? '<div style="margin-top:10px;"><input type="text" class="config-input irb-model-input" placeholder="Model answer (optional — shown after student answers)…" value="' + this._esc(rb.modelAnswer||'') + '" data-img-id="' + img.id + '" style="font-size:12px;padding:8px 12px;"/></div>'
          : '');

    const header = '<div class="irb-header">'
      + '<span class="irb-label">' + { text:'✍ Answer', procedure:'📋 Working Steps', table:'📊 Computation' }[type] + '</span>'
      + (editable ? '<button class="irb-remove-btn" data-img-id="' + img.id + '">Remove</button>' : '')
      + '</div>';

    // AI grading — only in read mode, only when the student has actually answered.
    // Grades the typed answer against BOTH the image and the model answer via vision.
    const gradeUI = (!editable && this._hasStudentAnswer(rb))
      ? '<div class="irb-grade-wrap" style="margin-top:10px;">'
        + '<button class="btn-secondary irb-grade-btn" data-img-id="' + img.id + '" style="font-size:12px;padding:8px 14px;">🤖 Check my answer with AI</button>'
        + '<div class="irb-grade-feedback" data-img-id="' + img.id + '" style="display:none;margin-top:10px;"></div>'
        + '</div>'
      : '';

    return header + contentHTML + modelAns + gradeUI;
  },

  /** True if the student has entered any answer content for this response block. */
  _hasStudentAnswer(rb) {
    if (!rb) return false;
    if (rb.type === 'text')      return !!(rb.content && rb.content.trim());
    if (rb.type === 'procedure') return (rb.steps || []).some(s => s && s.trim());
    if (rb.type === 'table')     return (rb.rows || []).some(row => (row||[]).some(c => c && c.trim()));
    return false;
  },

  /** Flatten a response block's student answer into plain text for grading. */
  _answerToText(rb) {
    if (!rb) return '';
    if (rb.type === 'text')      return rb.content || '';
    if (rb.type === 'procedure') return (rb.steps || []).map((s,i) => (i+1) + '. ' + s).join('\n');
    if (rb.type === 'table') {
      const cols = rb.columns || [];
      const head = cols.join(' | ');
      const body = (rb.rows || []).map(r => (r||[]).join(' | ')).join('\n');
      return head + '\n' + body;
    }
    return '';
  },

  /* Bind all response block events inside a container */
  bindEvents(container, node) {
    // Add response block type
    container.addEventListener('click', e => {
      if (e.target.classList.contains('irb-type-btn')) {
        const imgId = e.target.dataset.imgId;
        const type  = e.target.dataset.type;
        const img   = node.userImages?.find(i => i.id === imgId);
        if (!img) return;
        img.responseBlock = { type, content:'', steps:[], columns:['Item','Amount','Notes'], rows:[['','','']], modelAnswer:'' };
        nodeStore.save(node);
        NodeDetailView._renderSection();
      }
      if (e.target.classList.contains('irb-remove-btn')) {
        const imgId = e.target.dataset.imgId;
        const img   = node.userImages?.find(i => i.id === imgId);
        if (img) { img.responseBlock = null; nodeStore.save(node); NodeDetailView._renderSection(); }
      }
      if (e.target.classList.contains('irb-add-step-btn')) {
        const imgId = e.target.dataset.imgId;
        const list  = container.querySelector('.irb-proc-list[data-img-id="' + imgId + '"]');
        if (!list) return;
        const idx = list.querySelectorAll('.irb-step-row').length;
        const div = document.createElement('div');
        div.className = 'edit-row irb-step-row';
        div.style.gap = '8px';
        div.innerHTML = '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:20px;padding-top:10px;">' + (idx+1) + '.</span><input type="text" class="config-input irb-step-input" placeholder="Step…" data-img-id="' + imgId + '" style="flex:1;font-size:13px;padding:9px 12px;"/><button class="edit-del-btn">✕</button>';
        list.appendChild(div);
        div.querySelector('input').focus();
      }
      if (e.target.classList.contains('irb-add-tbl-row-btn')) {
        const imgId  = e.target.dataset.imgId;
        const tbody  = container.querySelector('.irb-table-body[data-img-id="' + imgId + '"]');
        const cols   = container.querySelectorAll('.irb-col-input[data-img-id="' + imgId + '"]').length || 3;
        const ri     = tbody?.querySelectorAll('tr').length || 0;
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = Array.from({length:cols}).map((_,ci)=>'<td style="padding:4px;border:1px solid var(--border-soft);"><input type="text" class="config-input irb-cell-input" data-img-id="'+imgId+'" data-row-idx="'+ri+'" data-col-idx="'+ci+'" style="width:100%;min-width:60px;font-size:13px;padding:7px 8px;border:none;"/></td>').join('')+'<td style="padding:4px;border:1px solid var(--border-soft);"><button class="edit-del-btn irb-row-del" data-img-id="'+imgId+'" data-row-idx="'+ri+'">✕</button></td>';
        tbody.appendChild(tr);
        tr.querySelector('input').focus();
      }
      if (e.target.classList.contains('irb-row-del')) {
        e.target.closest('tr')?.remove();
      }
      if (e.target.classList.contains('edit-del-btn') && e.target.closest('.irb-step-row')) {
        e.target.closest('.irb-step-row')?.remove();
      }
      if (e.target.classList.contains('irb-grade-btn')) {
        this._gradeAnswer(e.target, node);
      }
    });
  },

  /** Grade a student's image-response answer against the image + model answer. */
  async _gradeAnswer(btn, node) {
    const imgId = btn.dataset.imgId;
    const img   = node.userImages?.find(i => i.id === imgId);
    if (!img || !img.responseBlock) return;
    const rb     = img.responseBlock;
    const answer = this._answerToText(rb).trim();
    if (!answer) { Toast.info('Write your answer first.'); return; }

    const fb = btn.parentElement.querySelector('.irb-grade-feedback[data-img-id="' + imgId + '"]');

    if (!AIService.hasApiKey()) {
      if (fb) {
        fb.style.display = 'block';
        fb.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">Configure AI in Settings to grade your answer.</div>';
      }
      return;
    }

    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Grading…';
    try {
      const useVision = AIService.supportsVision();
      const result = await AIService.gradeImageAnswer(
        useVision ? img.base64 : null,
        answer,
        rb.modelAnswer || '',
        node.subject || 'general'
      );
      const score = Number.isFinite(result?.score) ? result.score : 0;
      const color = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--accent)' : 'var(--red)';
      const missed = (result?.keyPointsMissed || []).filter(Boolean);
      if (fb) {
        fb.style.display = 'block';
        fb.innerHTML =
          '<div style="background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:14px 18px;">'
          + '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + color + ';margin-bottom:6px;">' + score + '/100</div>'
          + '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.65;">' + this._esc(result?.feedback || '') + '</p>'
          + (missed.length
              ? '<div style="margin-top:10px;"><div style="font-family:var(--font-ui);font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Key points missed</div>'
                + '<ul style="margin:0;padding-left:18px;font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.6;">'
                + missed.map(p => '<li>' + this._esc(p) + '</li>').join('') + '</ul></div>'
              : '')
          + '</div>';
      }
    } catch (err) {
      if (fb) {
        fb.style.display = 'block';
        fb.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--red);">Grading failed: ' + this._esc(err.message) + '</div>';
      } else {
        Toast.error('Grading failed: ' + err.message);
      }
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  },

  /* Save all response block data from DOM back to node */
  saveAll(container, node) {
    (node.userImages||[]).forEach(img => {
      const rb = img.responseBlock;
      if (!rb) return;
      if (rb.type === 'text') {
        const ta = container.querySelector('.irb-text-area[data-img-id="' + img.id + '"]');
        if (ta) rb.content = ta.value;
      }
      if (rb.type === 'procedure') {
        const inputs = container.querySelectorAll('.irb-step-input[data-img-id="' + img.id + '"]');
        rb.steps = Array.from(inputs).map(i=>i.value.trim()).filter(Boolean);
      }
      if (rb.type === 'table') {
        const colInputs  = container.querySelectorAll('.irb-col-input[data-img-id="' + img.id + '"]');
        const cols       = Array.from(colInputs).map(c=>c.value.trim()||'Column');
        rb.columns       = cols;
        const tbody      = container.querySelector('.irb-table-body[data-img-id="' + img.id + '"]');
        const rows       = [];
        tbody?.querySelectorAll('tr').forEach(tr => {
          const row = cols.map((_,ci) => tr.querySelector('[data-col-idx="'+ci+'"]')?.value.trim()||'');
          if (row.some(c=>c)) rows.push(row);
        });
        rb.rows = rows;
      }
      const modelInput = container.querySelector('.irb-model-input[data-img-id="' + img.id + '"]');
      if (modelInput) rb.modelAnswer = modelInput.value.trim();
    });
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
};
