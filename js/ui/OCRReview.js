/**
 * OCRReview.js
 * Split-screen review of scanned images before saving.
 * Left: original image, Right: editable extracted text.
 * Highlights low-confidence words, lets user correct before import.
 */

const OCRReview = {
  /**
   * Show the split-screen review modal.
   * @param {File} imageFile  - original scanned image
   * @param {string} rawText  - OCR extracted text
   * @param {Array} words     - Tesseract word data with confidence scores
   * @param {function} onConfirm(text) - called when user confirms
   * @param {function} onSkip         - called when user skips review
   */
  show(imageFile, rawText, words, onConfirm, onSkip) {
    const imageURL  = URL.createObjectURL(imageFile);
    const annotated = this._annotateText(rawText, words);

    const html = '<div id="ocr-review-modal" style="display:flex;flex-direction:column;height:100%;">'

      // Header
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">'
      + '<div>'
      + '<h2 style="font-family:var(--font-ui);font-size:18px;font-weight:800;margin-bottom:3px;">Review Scanned Notes</h2>'
      + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Edit the extracted text before saving. <span style="color:var(--red);">Red text</span> = low confidence.</p>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn-primary" id="ocr-confirm-btn">✓ Save Notes</button>'
      + '<button class="btn-secondary" id="ocr-skip-btn">Skip Review</button>'
      + '</div>'
      + '</div>'

      // Split panel
      + '<div id="ocr-split" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1;min-height:0;">'

      // Left — original image
      + '<div style="display:flex;flex-direction:column;gap:8px;">'
      + '<div style="font-family:var(--font-ui);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);">Original Image</div>'
      + '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;flex:1;display:flex;align-items:flex-start;justify-content:center;min-height:300px;">'
      + '<img src="' + imageURL + '" style="width:100%;height:auto;display:block;" onload="URL.revokeObjectURL(this.src)" alt="Scanned page"/>'
      + '</div>'
      + '</div>'

      // Right — extracted text editor
      + '<div style="display:flex;flex-direction:column;gap:8px;">'
      + '<div style="font-family:var(--font-ui);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);">Extracted Text <span id="ocr-word-count" style="font-weight:400;color:var(--text-muted);"></span></div>'
      + '<textarea id="ocr-text-editor" class="config-input" style="flex:1;min-height:300px;resize:none;font-family:var(--font-body);font-size:14px;line-height:1.7;touch-action:pan-y;white-space:pre-wrap;">' + this._esc(rawText) + '</textarea>'
      + '</div>'
      + '</div>'

      // Low confidence hints
      + (annotated.lowConfidenceWords.length > 0 ? (
        '<div style="margin-top:14px;background:var(--red-dim);border:1px solid rgba(240,86,74,0.2);border-radius:var(--radius-md);padding:12px 16px;">'
        + '<div style="font-family:var(--font-ui);font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;">⚠ Low Confidence Words — check these:</div>'
        + '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);line-height:1.8;">'
        + annotated.lowConfidenceWords.slice(0, 12).map(w =>
            '<span style="background:var(--red-dim);border:1px solid rgba(240,86,74,0.3);border-radius:3px;padding:1px 6px;margin:2px;">' + this._esc(w.text) + ' (' + w.confidence + '%)</span>'
          ).join(' ')
        + '</div>'
        + '</div>'
      ) : '')

      + '</div>';

    Modal.open(html);

    // Word counter
    setTimeout(() => {
      const editor  = document.getElementById('ocr-text-editor');
      const counter = document.getElementById('ocr-word-count');
      if (editor && counter) {
        const updateCount = () => {
          const words = (editor.value.trim().match(/\S+/g) || []).length;
          counter.textContent = '(' + words + ' words)';
        };
        updateCount();
        editor.addEventListener('input', updateCount);
      }

      document.getElementById('ocr-confirm-btn')?.addEventListener('click', () => {
        const text = document.getElementById('ocr-text-editor')?.value?.trim() || '';
        Modal.close();
        onConfirm(text);
      });

      document.getElementById('ocr-skip-btn')?.addEventListener('click', () => {
        Modal.close();
        onSkip?.();
      });
    }, 0);
  },

  _annotateText(text, words) {
    const LOW_CONFIDENCE = 70;
    const lowConfidenceWords = (words || [])
      .filter(w => w.confidence < LOW_CONFIDENCE && w.text?.trim().length > 2)
      .map(w => ({ text: w.text, confidence: Math.round(w.confidence) }));
    return { lowConfidenceWords };
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
};
