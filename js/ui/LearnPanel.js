/**
 * LearnPanel.js — Combined Learn button: Lecture + Tutor + Study Session
 */
const LearnPanel = {

  open(node) {
    document.getElementById('learn-panel-root')?.remove();
    const examples   = node.workedExamples || [];
    const hasEx      = examples.length > 0;

    const root = document.createElement('div');
    root.id = 'learn-panel-root';
    root.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;';

    // Build HTML with plain string concat — no template literals
    let html = '<div id="learn-panel-sheet" style="position:relative;width:100%;background:var(--bg-raised);border-radius:20px 20px 0 0;padding:20px 18px 36px;max-height:82vh;overflow-y:auto;">';
    html += '<button id="lp-close-x" class="sheet-close-x" aria-label="Close">✕</button>';
    html += '<div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px;"></div>';
    html += '<div style="font-family:var(--font-ui);font-size:19px;font-weight:800;color:var(--text-primary);margin-bottom:4px;">🎓 Learn</div>';
    html += '<div style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);margin-bottom:22px;">' + this._esc(node.title) + '</div>';

    // Lecture button
    html += '<button id="lp-lecture" style="display:flex;align-items:center;gap:14px;padding:16px 18px;background:var(--bg-base);border:1px solid var(--border);border-radius:14px;cursor:pointer;text-align:left;width:100%;margin-bottom:10px;">';
    html += '<span style="font-size:28px;flex-shrink:0;">📖</span>';
    html += '<div><div style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">AI Lecture</div>';
    html += '<div style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);">Listen to your notes read aloud</div></div>';
    html += '<span style="margin-left:auto;color:var(--text-muted);font-size:20px;">›</span></button>';

    // Tutor button
    var tutorBg     = 'var(--bg-base)';
    var tutorBorder = hasEx ? 'var(--accent-dim)' : 'var(--border)';
    var tutorOpacity = '1';
    var tutorDesc   = hasEx
      ? (examples.length + ' worked example' + (examples.length > 1 ? 's' : '') + ' ready')
      : 'Tutor from your source notes';
    html += '<button id="lp-tutor" style="display:flex;align-items:center;gap:14px;padding:16px 18px;background:' + tutorBg + ';border:1px solid ' + tutorBorder + ';border-radius:14px;cursor:pointer;text-align:left;width:100%;margin-bottom:10px;opacity:' + tutorOpacity + ';">';
    html += '<span style="font-size:28px;flex-shrink:0;">⬡</span>';
    html += '<div><div style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">Tutor Me</div>';
    html += '<div style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);">' + this._esc(tutorDesc) + '</div></div>';
    html += '<span style="margin-left:auto;color:var(--text-muted);font-size:20px;">›</span></button>';

    // Study session button
    html += '<button id="lp-study" style="display:flex;align-items:center;gap:14px;padding:16px 18px;background:var(--bg-base);border:1px solid var(--border);border-radius:14px;cursor:pointer;text-align:left;width:100%;margin-bottom:0;">';
    html += '<span style="font-size:28px;flex-shrink:0;">▶</span>';
    html += '<div><div style="font-family:var(--font-ui);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">Study Session</div>';
    html += '<div style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);">6-step guided: orient, check, study, recall, practice, reflect</div></div>';
    html += '<span style="margin-left:auto;color:var(--text-muted);font-size:20px;">›</span></button>';

    html += '</div>';
    root.innerHTML = html;
    document.body.appendChild(root);

    // Close on backdrop
    root.addEventListener('click', function(e) { if (e.target === root) LearnPanel._close(); });
    // Close on X
    document.getElementById('lp-close-x').addEventListener('click', function() { LearnPanel._close(); });

    // Lecture
    document.getElementById('lp-lecture').addEventListener('click', function() {
      LearnPanel._close();
      try { LectureMode.open(node); } catch(e) { Toast.error('Lecture error: ' + e.message); }
    });

    // Tutor — works with examples OR direct from source material
    document.getElementById('lp-tutor').addEventListener('click', function() {
      LearnPanel._close();
      if (examples.length === 1) {
        try { SocraticTutor.open(node, examples[0]); } catch(e) { Toast.error('Tutor error: ' + e.message); }
      } else if (examples.length > 1) {
        LearnPanel._showPicker(node, examples);
      } else {
        // No worked examples — synthesise one from source material
        const defs = (node.definitions||[]).slice(0,3).map(d => d.term + ': ' + d.description).join('\n');
        const procs = (node.procedures||[]).slice(0,1).flatMap(p => p.steps||[]).join(' ');
        const sourceEx = {
          id:       'source_' + node.id,
          title:    node.title,
          question: 'Based on your notes for "' + node.title + '", explain the core concepts and how they apply.',
          solution: defs || node.summary || 'Use the key definitions and procedures from your notes.',
          steps:    (node.procedures||[]).slice(0,1).flatMap(p => p.steps||[]).slice(0,5),
          _fromSource: true,
        };
        try { SocraticTutor.open(node, sourceEx); } catch(e) { Toast.error('Tutor error: ' + e.message); }
      }
    });

    // Study session
    document.getElementById('lp-study').addEventListener('click', function() {
      LearnPanel._close();
      var btn = document.querySelector('.mobile-nav-btn[data-view="guided"]')
             || document.querySelector('.nav-item[data-view="guided"]');
      if (btn) btn.click();
    });
  },

  _showPicker(node, examples) {
    document.getElementById('learn-panel-root')?.remove();
    const root = document.createElement('div');
    root.id = 'learn-panel-root';
    root.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;';

    let html = '<div style="position:relative;width:100%;background:var(--bg-raised);border-radius:20px 20px 0 0;padding:20px 18px 36px;max-height:82vh;overflow-y:auto;">';
    html += '<button id="lp-close-x" class="sheet-close-x" aria-label="Close">✕</button>';
    html += '<div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 16px;"></div>';
    html += '<button id="lp-back" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-family:var(--font-ui);font-size:13px;padding:0;margin-bottom:14px;">← Back</button>';
    html += '<div style="font-family:var(--font-ui);font-size:17px;font-weight:800;color:var(--text-primary);margin-bottom:16px;">Choose Example</div>';

    examples.forEach(function(ex, i) {
      html += '<button class="lp-ex-pick" data-ex-id="' + LearnPanel._esc(ex.id) + '" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--bg-base);border:1px solid var(--border);border-radius:12px;cursor:pointer;text-align:left;width:100%;margin-bottom:10px;">';
      html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:10px;flex-shrink:0;">Ex ' + (i+1) + '</span>';
      html += '<div style="flex:1;min-width:0;"><div style="font-family:var(--font-ui);font-size:14px;font-weight:700;color:var(--text-primary);">' + LearnPanel._esc(ex.title) + '</div>';
      var preview = (ex.question || '').slice(0, 55) + (ex.question && ex.question.length > 55 ? '…' : '');
      html += '<div style="font-family:var(--font-body);font-size:12px;color:var(--text-muted);">' + LearnPanel._esc(preview) + '</div></div>';
      html += '<span style="color:var(--text-muted);font-size:18px;flex-shrink:0;">›</span></button>';
    });

    html += '</div>';
    root.innerHTML = html;
    document.body.appendChild(root);

    root.addEventListener('click', function(e) { if (e.target === root) LearnPanel._close(); });
    document.getElementById('lp-close-x').addEventListener('click', function() { LearnPanel._close(); });
    document.getElementById('lp-back').addEventListener('click', function() { LearnPanel._close(); LearnPanel.open(node); });
    root.querySelectorAll('.lp-ex-pick').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ex = examples.find(function(e) { return e.id === btn.dataset.exId; });
        if (ex) { LearnPanel._close(); SocraticTutor.open(node, ex); }
      });
    });
  },

  _close() { document.getElementById('learn-panel-root')?.remove(); },
  _esc:  function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
};
