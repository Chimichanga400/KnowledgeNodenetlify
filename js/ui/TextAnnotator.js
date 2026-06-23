/**
 * TextAnnotator.js — Persistent text highlights stored per-node
 * Highlights are stored in node.annotations = [{ id, selector, color, note }]
 */
const TextAnnotator = {
  _colors: ['#f0a500','#3ecf82','#5a9cf5','#f0615a','#9b7ef5'],
  _colorIdx: 0,

  /** Restore saved highlights in a container */
  restoreHighlights(container, node) {
    if (!node.annotations?.length) return;
    // Simple approach: restore by matching text snippets
    node.annotations.forEach(ann => {
      this._highlightText(container, ann.text, ann.color, ann.id);
    });
  },

  _highlightText(container, searchText, color, id) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(searchText);
      if (idx === -1) continue;
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + searchText.length);
      const mark = document.createElement('mark');
      mark.className = 'kn-highlight';
      mark.dataset.annId = id;
      mark.style.background = color + '40';
      mark.style.borderBottom = `2px solid ${color}`;
      try { range.surroundContents(mark); } catch { /* skip cross-element */ }
      break;
    }
  },
};
