/**
 * ImageManager.js
 * Handles resizable images in node notes.
 * Images are stored as { id, base64, caption, width } in node.userImages.
 * Width is a percentage (20–100). User drags a resize handle.
 */

const ImageManager = {
  _currentNode: null,

  setNode(node) { this._currentNode = node; },

  /** Render user images with resize handles */
  renderImages(images) {
    if (!images?.length) return '';
    return `<div class="user-images-grid" id="user-images-grid">
      ${images.map(img => this._imageBlock(img)).join('')}
    </div>`;
  },

  _imageBlock(img) {
    const w = img.width || 50;
    return `
      <div class="img-block" data-img-id="${img.id}" style="width:${w}%;min-width:120px;">
        <div class="img-wrap">
          <img src="data:image/jpeg;base64,${img.base64}" alt="${img.caption||'Image'}" loading="lazy"
               style="width:100%;display:block;border-radius:var(--radius-sm);" />
          <div class="img-resize-handle" title="Drag to resize"></div>
          <button class="img-delete-btn" data-img-id="${img.id}" title="Remove image">✕</button>
        </div>
        <div class="img-caption-wrap">
          <input type="text" class="img-caption-input" data-img-id="${img.id}"
                 value="${this._esc(img.caption||'')}" placeholder="Add caption…"/>
        </div>
      </div>`;
  },

  /** Wire resize handles and caption/delete events after render */
  bindEvents(container, node) {
    this._currentNode = node;

    // Delete buttons
    container.querySelectorAll('.img-delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.imgId;
        node.userImages = node.userImages.filter(i => i.id !== id);
        nodeStore.save(node);
        btn.closest('.img-block').remove();
        Toast.success('Image removed.');
      });
    });

    // Caption autosave
    container.querySelectorAll('.img-caption-input').forEach(input => {
      input.addEventListener('change', () => {
        const id  = input.dataset.imgId;
        const img = node.userImages?.find(i => i.id === id);
        if (img) { img.caption = input.value.trim(); nodeStore.save(node); }
      });
    });

    // Resize handles
    container.querySelectorAll('.img-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => this._startResize(e, handle, node));
      handle.addEventListener('touchstart', e => this._startResize(e, handle, node), { passive: false });
    });
  },

  _startResize(e, handle, node) {
    e.preventDefault();
    const block     = handle.closest('.img-block');
    const imgId     = block.dataset.imgId;
    const container = block.parentElement;
    const startX    = e.touches ? e.touches[0].clientX : e.clientX;
    const startW    = block.offsetWidth;
    const contW     = container.offsetWidth;

    const onMove = ev => {
      const x      = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const newPx  = Math.max(80, Math.min(contW, startW + (x - startX)));
      const newPct = Math.round((newPx / contW) * 100);
      block.style.width = newPct + '%';
    };

    const onUp = () => {
      const pct = Math.round((block.offsetWidth / contW) * 100);
      const img = node.userImages?.find(i => i.id === imgId);
      if (img) { img.width = pct; nodeStore.save(node); }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onUp);
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
