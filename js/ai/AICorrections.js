/**
 * AICorrections.js — User correction loop
 *
 * When the AI gets something wrong, the user can tap a thumbs-down
 * button next to any AI output. They explain what was wrong. The
 * correction is:
 *
 *   1. Saved to node.aiCorrections[] (persistent per-node memory)
 *   2. Injected into all FUTURE AI prompts for that node as
 *      "previous AI mistakes — do not repeat"
 *   3. Visible to the user as a list under Settings → Corrections
 *
 * This means the AI genuinely learns from each user — corrections
 * for one node only affect that node's future generations.
 */

const AICorrections = {

  /* ─────────────────────────────────────────────────────
     RECORD A CORRECTION
  ───────────────────────────────────────────────────── */

  /**
   * Record that the AI got something wrong.
   * @param {object} node     — the node this correction belongs to
   * @param {string} category — 'definition' | 'question' | 'answer' | 'scaffold' | 'example' | 'lecture' | 'general'
   * @param {string} aiOutput — what the AI said (kept short)
   * @param {string} userNote — what the user says is wrong / correct
   */
  record(node, category, aiOutput, userNote) {
    if (!node || !userNote?.trim()) return;
    if (!node.aiCorrections) node.aiCorrections = [];

    node.aiCorrections.push({
      id:       'cor_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      ts:       Date.now(),
      category: category || 'general',
      aiOutput: (aiOutput || '').slice(0, 240),
      userNote: userNote.trim().slice(0, 480),
    });

    // Keep last 20 corrections per node — older ones get dropped
    if (node.aiCorrections.length > 20) {
      node.aiCorrections = node.aiCorrections.slice(-20);
    }

    nodeStore.save(node);

    // Also log to LearnerMemory so it shows up in session history
    if (typeof LearnerMemory !== 'undefined') {
      try {
        LearnerMemory._writeToNode(node, {
          type:    'correction',
          category,
          summary: 'User corrected AI: ' + userNote.slice(0, 100),
        });
        nodeStore.save(node);
      } catch(e) { /* non-critical */ }
    }
  },

  /**
   * Open the correction modal for the user to record what's wrong.
   * @param {object} node
   * @param {string} category
   * @param {string} aiOutput  — the offending AI output to show in the modal
   * @param {function} onSaved — optional callback after save
   */
  promptUser(node, category, aiOutput, onSaved) {
    const safe = (aiOutput || '').slice(0, 300).replace(/</g, '&lt;');
    Modal.open(`
      <div style="font-family:var(--font-ui);">
        <h2 style="font-size:18px;font-weight:800;margin-bottom:6px;">Correct the AI</h2>
        <p style="font-family:var(--font-body);font-size:13px;color:var(--text-muted);margin-bottom:18px;">
          Tell the AI what it got wrong. It will remember this for future answers on this node.
        </p>

        <div style="margin-bottom:14px;">
          <label class="config-label" style="margin-bottom:6px;">What the AI said:</label>
          <div style="background:var(--bg-base);border:1px solid var(--border);border-radius:8px;
                      padding:10px 12px;font-family:var(--font-body);font-size:13px;
                      color:var(--text-secondary);line-height:1.5;max-height:120px;overflow-y:auto;">
            ${safe || '<em style="color:var(--text-muted);">(no specific text)</em>'}
          </div>
        </div>

        <div style="margin-bottom:18px;">
          <label class="config-label" style="margin-bottom:6px;">What's wrong / what should it have said?</label>
          <textarea id="aic-note" class="config-input" rows="4" style="resize:vertical;width:100%;
                    font-family:var(--font-body);font-size:13px;line-height:1.55;"
            placeholder="e.g. 'This formula isn't in my notes — use the one on page 12 instead' or 'The answer should mention X based on the source'"></textarea>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn-secondary" id="aic-cancel" style="font-size:13px;padding:9px 16px;">Cancel</button>
          <button class="btn-primary" id="aic-save" style="font-size:13px;padding:9px 16px;">Save correction</button>
        </div>
      </div>
    `);

    setTimeout(() => document.getElementById('aic-note')?.focus(), 100);

    document.getElementById('aic-cancel')?.addEventListener('click', () => Modal.close());
    document.getElementById('aic-save')?.addEventListener('click', () => {
      const note = document.getElementById('aic-note')?.value || '';
      if (!note.trim()) {
        Toast.error('Please describe what was wrong.');
        return;
      }
      this.record(node, category, aiOutput, note);
      Modal.close();
      Toast.success('Got it — the AI will remember this for "' + node.title + '"');
      if (typeof onSaved === 'function') onSaved();
    });
  },

  /* ─────────────────────────────────────────────────────
     INJECT INTO PROMPTS — called by LearnerContext
  ───────────────────────────────────────────────────── */

  /**
   * Returns a formatted string of past corrections for a node,
   * to be injected into AI prompts.
   * Returns '' if no corrections exist.
   */
  forPrompt(node) {
    const cors = (node?.aiCorrections || []).slice(-10); // last 10 corrections
    if (!cors.length) return '';

    return 'PREVIOUS AI MISTAKES ON THIS NODE — DO NOT REPEAT:\n'
      + cors.map((c, i) => {
        const ago = this._timeAgo(c.ts);
        const aiPart = c.aiOutput ? ' (AI previously said: "' + c.aiOutput.slice(0, 120) + '")' : '';
        return (i + 1) + '. [' + c.category + ', ' + ago + '] User correction: "' + c.userNote + '"' + aiPart;
      }).join('\n')
      + '\nApply these corrections to your current response.';
  },

  /* ─────────────────────────────────────────────────────
     RENDER A CORRECTION BUTTON
  ───────────────────────────────────────────────────── */

  /**
   * Returns the HTML attributes for a "correctable" wrapper element.
   * Instead of an always-visible button (easy to misclick), the correction
   * is triggered by:
   *   - Long-press (mobile, 500ms hold)
   *   - Right-click (desktop)
   *   - Double-tap on the small ⋯ indicator in the corner
   * The element gets a subtle ⋯ indicator on hover so users discover it.
   *
   * @param {string} category — e.g. 'definition'
   * @param {string} aiOutput — what the AI said
   * @returns {string} HTML attributes to add to any element
   */
  wrapperAttrs(category, aiOutput) {
    const encoded = encodeURIComponent(aiOutput || '').slice(0, 1000);
    return `data-ai-correct="1" data-ai-correct-category="${category}" data-ai-correct-output="${encoded}"`;
  },

  /**
   * Legacy alias — kept for any existing renderButton callers.
   * Now returns nothing visible by default; the actual UI lives on the
   * parent element via wrapperAttrs and bindCorrectionButtons.
   */
  renderButton(category, aiOutput) {
    // Tiny dot indicator that fades in on hover, signalling "correctable"
    const encoded = encodeURIComponent(aiOutput || '').slice(0, 1000);
    return `<span class="ai-correct-dot"
      data-ai-correct="1"
      data-ai-correct-category="${category}"
      data-ai-correct-output="${encoded}"
      title="Long-press or right-click to correct the AI"
      style="display:inline-block;width:6px;height:6px;border-radius:50%;
             background:var(--text-muted);opacity:.25;margin-left:8px;
             vertical-align:middle;cursor:context-menu;
             transition:opacity .15s, background .15s;"></span>`;
  },

  /**
   * After rendering, activate correction triggers inside a container.
   * Triggers: long-press, right-click, and click on the small dot indicator.
   */
  bindCorrectionButtons(container, node) {
    if (!container || !node) return;

    // First-time hint — only shown once across the whole app
    if (!localStorage.getItem('kn_correct_hint_seen')) {
      const dots = container.querySelectorAll('.ai-correct-dot');
      if (dots.length > 0) {
        setTimeout(() => {
          try {
            if (typeof Toast !== 'undefined') {
              Toast.info('💡 If the AI gets something wrong, long-press the item to correct it.');
              localStorage.setItem('kn_correct_hint_seen', '1');
            }
          } catch(e) {}
        }, 1500);
      }
    }

    // Find all elements that have data-ai-correct
    container.querySelectorAll('[data-ai-correct]').forEach(el => {
      if (el.dataset.aicBound) return;
      el.dataset.aicBound = '1';

      const open = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const category = el.dataset.aiCorrectCategory || 'general';
        const output   = decodeURIComponent(el.dataset.aiCorrectOutput || '');
        this.promptUser(node, category, output);
      };

      // Right-click (desktop)
      el.addEventListener('contextmenu', open);

      // Long-press (mobile + desktop)
      let pressTimer = null;
      let pressMoved = false;

      const startPress = (e) => {
        pressMoved = false;
        pressTimer = setTimeout(() => {
          if (!pressMoved) {
            // Haptic feedback if available
            if (navigator.vibrate) navigator.vibrate(30);
            open(e);
          }
        }, 500);
      };
      const cancelPress = () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      };
      const markMoved = () => { pressMoved = true; cancelPress(); };

      el.addEventListener('touchstart', startPress, { passive: true });
      el.addEventListener('touchmove',  markMoved,  { passive: true });
      el.addEventListener('touchend',   cancelPress);
      el.addEventListener('touchcancel',cancelPress);

      el.addEventListener('mousedown',  e => { if (e.button === 0) startPress(e); });
      el.addEventListener('mousemove',  markMoved);
      el.addEventListener('mouseup',    cancelPress);
      el.addEventListener('mouseleave', cancelPress);

      // Visual hint: brighten the dot indicator on hover of the parent
      const dot = el.classList.contains('ai-correct-dot') ? el : el.querySelector('.ai-correct-dot');
      if (dot) {
        const parent = dot.classList.contains('ai-correct-dot') ? dot.parentElement : el;
        if (parent) {
          parent.addEventListener('mouseenter', () => { dot.style.opacity = '.7'; });
          parent.addEventListener('mouseleave', () => { dot.style.opacity = '.25'; });
        }
        // Tapping the dot itself also opens (for users who discover it)
        dot.addEventListener('click', open);
      }
    });
  },

  /* ─────────────────────────────────────────────────────
     LIST / DELETE — for Settings view
  ───────────────────────────────────────────────────── */

  getAll(node) {
    return (node?.aiCorrections || []).slice().reverse();
  },

  delete(node, correctionId) {
    if (!node?.aiCorrections) return;
    node.aiCorrections = node.aiCorrections.filter(c => c.id !== correctionId);
    nodeStore.save(node);
  },

  clearAll(node) {
    if (!node) return;
    node.aiCorrections = [];
    nodeStore.save(node);
  },

  /* ─────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────── */

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    const days = Math.floor(diff / 86400000);
    if (days >= 1) return days + 'd ago';
    const hrs = Math.floor(diff / 3600000);
    if (hrs >= 1)  return hrs + 'h ago';
    const mins = Math.floor(diff / 60000);
    if (mins >= 1) return mins + 'm ago';
    return 'just now';
  },
};
