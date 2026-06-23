/**
 * Modal.js — Properly wired modal with optional onClose cleanup hook
 */
const Modal = {
  _onClose: null,
  open(html, onClose) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    this._onClose = (typeof onClose === 'function') ? onClose : null;
  },
  close() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    overlay.classList.add('hidden');
    content.innerHTML = '';
    const cb = this._onClose;
    this._onClose = null;
    if (cb) { try { cb(); } catch (e) { /* ignore cleanup errors */ } }
  },
};
