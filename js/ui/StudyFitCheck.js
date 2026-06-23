/**
 * StudyFitCheck.js — "Does this content fit the Study step?"
 *
 * When the learner reaches the Study (read & absorb) step, the AI quietly
 * reviews the node's blocks. If some content reads poorly there — e.g. a
 * worked example dumped into prose — it does NOT silently change anything.
 * Instead it asks the learner: "This looks like a worked example. Want me
 * to show it as step-by-step instead?" and only reshapes on confirmation.
 *
 * Analysis is cached on the node for the session and the learner's
 * dismissals are remembered, so it never nags.
 *
 * Entry point: StudyFitCheck.run(node, container, onReshaped)
 *   - container: the #step-content element of the Study step
 *   - onReshaped: callback to re-render the Study step after a change
 */
const StudyFitCheck = {
  _TARGETS: ['procedure', 'table', 'flashcards', 'callout'],
  _LABELS:  {
    procedure:  'step-by-step',
    table:      'a table',
    flashcards: 'flashcards',
    callout:    'a highlighted note',
  },

  async run(node, container, onReshaped) {
    try {
      if (!node || !node.blocks || !node.blocks.length) return;
      if (!AIService.hasApiKey()) return;            // AI off → silent
      if (node._studyFitDismissed) return;           // learner said "no thanks"

      const anchor = container?.querySelector('#gf-fit-check');
      if (!anchor) return;

      // Use the cached analysis if we already ran it this session.
      let suggestions = node._studyFitSuggestions;
      if (!suggestions) {
        anchor.innerHTML = this._thinkingHTML();
        let res;
        try { res = await AIService.analyzeStudyFit(node); }
        catch (e) { anchor.innerHTML = ''; return; }  // fail quietly
        suggestions = (res.suggestions || []).filter(s =>
          this._TARGETS.includes(s.suggestedType) &&
          node.blocks.some(b => b.id === s.blockId) &&
          // never suggest the format a block already is
          node.blocks.find(b => b.id === s.blockId).type !== s.suggestedType
        ).slice(0, 2);
        node._studyFitSuggestions = suggestions;     // runtime-only cache
      }

      if (!suggestions.length) { anchor.innerHTML = ''; return; }
      this._render(node, container, anchor, suggestions, onReshaped);
    } catch (e) {
      console.error('[StudyFitCheck] run failed:', e);
    }
  },

  _thinkingHTML() {
    return '<div class="sfc-card sfc-thinking">'
      + '<span class="sfc-orb">⬡</span>'
      + '<span class="sfc-thinking-text">Checking how this content reads…</span>'
      + '</div>';
  },

  _render(node, container, anchor, suggestions, onReshaped) {
    const rows = suggestions.map((s, i) => {
      const label  = this._esc(s.label || 'some content');
      const target = this._LABELS[s.suggestedType] || s.suggestedType;
      const reason = this._esc(s.reason || '');
      return '<div class="sfc-row" data-sfc-i="' + i + '">'
        + '<div class="sfc-row-text">'
        +   '<div class="sfc-row-q">This looks like <strong>' + label + '</strong>. '
        +     'Show it as <strong>' + this._esc(target) + '</strong>?</div>'
        +   (reason ? '<div class="sfc-row-why">' + reason + '</div>' : '')
        + '</div>'
        + '<div class="sfc-row-btns">'
        +   '<button class="sfc-btn sfc-yes" data-sfc-yes="' + i + '">Yes, reshape</button>'
        +   '<button class="sfc-btn sfc-no" data-sfc-no="' + i + '">Keep as-is</button>'
        + '</div>'
        + '</div>';
    }).join('');

    anchor.innerHTML =
      '<div class="sfc-card">'
      + '<div class="sfc-head">'
      +   '<span class="sfc-orb">⬡</span>'
      +   '<span class="sfc-title">A quick formatting check</span>'
      +   '<button class="sfc-dismiss" id="sfc-dismiss" aria-label="Dismiss">✕</button>'
      + '</div>'
      + rows
      + '</div>';

    // Per-suggestion handlers
    suggestions.forEach((s, i) => {
      anchor.querySelector('[data-sfc-yes="' + i + '"]')
        ?.addEventListener('click', () => this._reshape(node, s, anchor, i, onReshaped));
      anchor.querySelector('[data-sfc-no="' + i + '"]')
        ?.addEventListener('click', () => this._dismissOne(node, anchor, i));
    });

    // Dismiss the whole check (don't ask again this session)
    document.getElementById('sfc-dismiss')?.addEventListener('click', () => {
      node._studyFitDismissed = true;
      anchor.innerHTML = '';
    });
  },

  async _reshape(node, suggestion, anchor, index, onReshaped) {
    const row = anchor.querySelector('[data-sfc-i="' + index + '"]');
    const block = node.blocks.find(b => b.id === suggestion.blockId);
    if (!block) { this._dismissOne(node, anchor, index); return; }

    if (row) row.innerHTML = '<div class="sfc-working"><span class="sfc-orb">⬡</span> Reshaping into '
      + this._esc(this._LABELS[suggestion.suggestedType] || suggestion.suggestedType) + '…</div>';

    try {
      const fresh = await AIService.reshapeBlockTo(block, suggestion.suggestedType, node);
      const idx = node.blocks.findIndex(b => b.id === suggestion.blockId);
      if (idx === -1) throw new Error('Block no longer exists.');

      // Keep the original id + position so nothing else breaks.
      const newBlock = Object.assign({}, fresh, {
        id: block.id,
        type: suggestion.suggestedType,
        title: fresh.title || block.title || '',
      });
      node.blocks[idx] = newBlock;

      // Drop this (and any now-stale) suggestion from the session cache.
      node._studyFitSuggestions = (node._studyFitSuggestions || [])
        .filter(x => x.blockId !== suggestion.blockId);

      nodeStore.save(node);
      Toast.success('Reshaped into ' + (this._LABELS[suggestion.suggestedType] || suggestion.suggestedType) + '.');

      // Re-render the whole Study step so the new block shows in place.
      if (typeof onReshaped === 'function') onReshaped();
    } catch (e) {
      if (row) row.innerHTML = '<div class="sfc-error">Couldn\'t reshape that — ' + this._esc(e.message)
        + ' <button class="sfc-btn sfc-no" id="sfc-err-dismiss">Dismiss</button></div>';
      document.getElementById('sfc-err-dismiss')
        ?.addEventListener('click', () => this._dismissOne(node, anchor, index));
    }
  },

  _dismissOne(node, anchor, index) {
    const row = anchor.querySelector('[data-sfc-i="' + index + '"]');
    if (row) row.remove();
    // If no rows remain, clear the card and stop asking this session.
    if (!anchor.querySelector('.sfc-row')) {
      node._studyFitDismissed = true;
      anchor.innerHTML = '';
    }
  },

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
