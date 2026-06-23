/**
 * AINodeTools.js
 * In-node AI actions: generate from image, restructure notes, generate exam question
 * Called from NodeDetailView's AI floater and section buttons
 */
const AINodeTools = {

  /* ─── Generate content from a new image ───────────── */
  async generateFromImage(node, targetSection) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = false;
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      input.value = '';

      const overlay = this._showSpinner('AI is reading the image…');
      try {
        const b64 = await this._toBase64(file);
        const result = await AIService.generateFromImage(b64, node, targetSection || 'auto');
        overlay.remove();
        this._showGeneratedPreview(result, node, file);
      } catch(e) {
        overlay.remove();
        Toast.error('AI image read failed: ' + e.message);
      }
    });
    input.click();
  },

  /* ─── Restructure existing raw notes ───────────────── */
  async restructureNotes(node) {
    if (!node.rawOCR && !node.userNotes && !node.definitions.length) {
      Toast.info('No raw content to restructure. Add some notes first.');
      return;
    }
    const overlay = this._showSpinner('AI is restructuring your notes…');
    try {
      const result = await AIService.restructureNotes(node);
      overlay.remove();
      this._showGeneratedPreview(result, node, null);
    } catch(e) {
      overlay.remove();
      Toast.error('Restructure failed: ' + e.message);
    }
  },

  /* ─── Generate exam-style question ─────────────────── */
  async generateExamQuestion(node) {
    const overlay = this._showSpinner('Generating exam question…');
    try {
      const q = await AIService.generateExamQuestion(node);
      overlay.remove();
      this._showExamQuestion(q, node);
    } catch(e) {
      overlay.remove();
      Toast.error('Exam question generation failed: ' + e.message);
    }
  },

  /* ─── Show preview of AI-generated content ─────────── */
  _showGeneratedPreview(result, node, imageFile) {
    const sections = [];
    if (result.definitions?.length)    sections.push({ key:'definitions',    label:'Definitions ('      + result.definitions.length    + ')', count:result.definitions.length });
    if (result.tables?.length)         sections.push({ key:'tables',         label:'Tables ('           + result.tables.length         + ')', count:result.tables.length });
    if (result.formulas?.length)       sections.push({ key:'formulas',       label:'Formulas ('         + result.formulas.length        + ')', count:result.formulas.length });
    if (result.procedures?.length)     sections.push({ key:'procedures',     label:'Procedures ('       + result.procedures.length      + ')', count:result.procedures.length });
    if (result.commonMistakes?.length) sections.push({ key:'commonMistakes', label:'Common Mistakes ('  + result.commonMistakes.length  + ')', count:result.commonMistakes.length });
    if (result.summary)                sections.push({ key:'summary',        label:'Summary', count:1 });

    if (!sections.length) {
      Toast.info('AI did not detect structured content in this image. Try a clearer photo.');
      return;
    }

    const checklist = sections.map(s =>
      '<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-ui);font-size:13px;font-weight:500;color:var(--text-primary);">'
      + '<input type="checkbox" checked class="ai-gen-check" value="' + s.key + '" style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;"/>'
      + s.label
      + '</label>'
    ).join('');

    // Mini preview of detected content
    const preview = sections.slice(0,3).map(s => {
      if (s.key==='definitions' && result.definitions[0]) return '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);padding:6px 0;border-bottom:1px solid var(--border-soft);">📌 ' + result.definitions[0].term + '</div>';
      if (s.key==='tables'      && result.tables[0])      return '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);padding:6px 0;border-bottom:1px solid var(--border-soft);">📊 ' + (result.tables[0].title||'Table') + ' (' + result.tables[0].columns?.join(', ') + ')</div>';
      if (s.key==='procedures'  && result.procedures[0])  return '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);padding:6px 0;border-bottom:1px solid var(--border-soft);">📋 ' + (result.procedures[0].title||'Procedure') + ' — ' + (result.procedures[0].steps?.length||0) + ' steps</div>';
      if (s.key==='formulas'    && result.formulas[0])    return '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);padding:6px 0;border-bottom:1px solid var(--border-soft);">⚗ ' + result.formulas[0].expression + '</div>';
      return '';
    }).join('');

    Modal.open(
      '<h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:6px;">AI Found ' + sections.length + ' Section' + (sections.length>1?'s':'') + '</h2>'
      + '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:16px;">Select which sections to add to this node. Existing content is preserved.</p>'
      + (preview ? '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;">' + preview + '</div>' : '')
      + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">' + checklist + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn-primary" id="ai-gen-apply-btn" style="flex:1;justify-content:center;">Add to Node</button>'
      + '<button class="btn-secondary" onclick="Modal.close()">Cancel</button>'
      + '</div>'
    );

    setTimeout(() => {
      document.getElementById('ai-gen-apply-btn')?.addEventListener('click', () => {
        const selected = Array.from(document.querySelectorAll('.ai-gen-check:checked')).map(c => c.value);
        if (!selected.length) { Toast.info('Select at least one section.'); return; }

        selected.forEach(key => {
          if (key === 'definitions' && result.definitions) {
            result.definitions.forEach(d => {
              node.definitions.push({ term:d.term||'', examples:d.examples||'', description:d.description||'' });
            });
          }
          if (key === 'tables' && result.tables) {
            node.tables = node.tables || [];
            result.tables.forEach(t => node.tables.push({...t, id:'tbl_'+Math.random().toString(36).slice(2,8)}));
          }
          if (key === 'formulas' && result.formulas) {
            result.formulas.forEach(f => node.formulas.push(f));
          }
          if (key === 'procedures' && result.procedures) {
            node.procedures = node.procedures || [];
            result.procedures.forEach(p => node.procedures.push({...p, id:'proc_'+Math.random().toString(36).slice(2,8)}));
          }
          if (key === 'commonMistakes' && result.commonMistakes) {
            node.commonMistakes = [...node.commonMistakes, ...result.commonMistakes];
          }
          if (key === 'summary' && result.summary) {
            node.summary = node.summary ? node.summary + '\n\n' + result.summary : result.summary;
          }
        });

        nodeStore.save(node);
        Modal.close();
        Toast.success('Added ' + selected.length + ' section' + (selected.length>1?'s':'') + ' to node!');
        NodeDetailView._renderSection();
      });
    }, 0);
  },

  /* ─── Show exam question ────────────────────────────── */
  _showExamQuestion(q, node) {
    Modal.open(
      '<h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:16px;">🏆 Exam Question — ' + (node.title||'') + '</h2>'
      + '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:18px 20px;margin-bottom:16px;">'
      + '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">' + (q.marks||'') + ' marks</div>'
      + '<div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.7;margin-bottom:12px;">' + this._esc(q.scenario||'') + '</div>'
      + '<div style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--accent);">' + this._esc(q.requirement||'') + '</div>'
      + '</div>'
      + '<div class="config-row" style="margin-bottom:12px;">'
      + '<label class="config-label">Your Answer</label>'
      + '<textarea id="exam-q-answer" class="config-input" rows="5" style="resize:vertical;touch-action:pan-y;font-size:14px;line-height:1.65;" placeholder="Write your answer and working here…"></textarea>'
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-bottom:0;">'
      + '<button class="btn-primary" id="exam-q-submit-btn" style="flex:1;justify-content:center;">Submit for AI Grading</button>'
      + '<button class="btn-secondary" id="exam-q-reveal-btn">Show Model Answer</button>'
      + '</div>'
      + '<div id="exam-q-model" style="display:none;margin-top:16px;background:var(--green-dim);border:1px solid rgba(52,199,123,0.2);border-radius:var(--radius-md);padding:16px;">'
      + '<div style="font-family:var(--font-ui);font-size:12px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Model Answer</div>'
      + '<div style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;">' + this._esc(q.modelAnswer||'') + '</div>'
      + (q.markingGuidance?.length ? '<div style="margin-top:12px;"><div style="font-family:var(--font-ui);font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Marking Guidance</div>' + q.markingGuidance.map(g=>'<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);padding:3px 0;">· '+this._esc(g)+'</div>').join('') + '</div>' : '')
      + '</div>'
      + '<div id="exam-q-feedback" style="display:none;margin-top:16px;"></div>'
    );

    setTimeout(() => {
      document.getElementById('exam-q-reveal-btn')?.addEventListener('click', () => {
        document.getElementById('exam-q-model').style.display='block';
      });
      document.getElementById('exam-q-submit-btn')?.addEventListener('click', async () => {
        const answer = document.getElementById('exam-q-answer')?.value.trim();
        if (!answer) { Toast.info('Write your answer first.'); return; }
        const btn = document.getElementById('exam-q-submit-btn');
        if (btn) { btn.disabled=true; btn.textContent='Grading…'; }
        try {
          const result = AIService.hasApiKey()
            ? await AIService.checkAnswer(q.requirement||q.scenario, q.modelAnswer, answer, node.subject)
            : { score:Math.floor(Math.random()*40+50), feedback:'Configure AI in Settings for real grading.', correct:false };
          const color  = result.score>=70?'var(--green)':result.score>=50?'var(--accent)':'var(--red)';
          const fb = document.getElementById('exam-q-feedback');
          if (fb) {
            fb.style.display='block';
            fb.innerHTML = '<div style="background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid '+color+';border-radius:var(--radius-md);padding:14px 18px;"><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:'+color+';margin-bottom:6px;">'+result.score+'/100</div><p style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);line-height:1.65;">'+this._esc(result.feedback||'')+'</p></div>';
          }
        } catch(e) { Toast.error('Grading failed: '+e.message); }
        if (btn) { btn.disabled=false; btn.textContent='Submit for AI Grading'; }
      });
    }, 0);
  },

  /* ─── Helpers ───────────────────────────────────────── */
  _showSpinner(label) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    el.innerHTML = '<div class="hex-ring"></div><p style="font-family:var(--font-mono);font-size:14px;color:var(--accent);">' + label + '</p>';
    document.body.appendChild(el);
    return el;
  },

  _toBase64(file) {
    return new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
