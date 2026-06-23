/**
 * SpeechPill.js — Floating stop button for active speech
 *
 * Whenever any part of the app starts speaking, call SpeechPill.show().
 * A small pill appears in the bottom-right corner above the nav bar.
 * Tapping it cancels all speech immediately.
 * It disappears automatically when speech ends.
 */
const SpeechPill = {
  _el: null,

  show() {
    if (this._el) return; // already showing
    const pill = document.createElement('button');
    pill.id = 'speech-pill';
    pill.innerHTML = '🔊 <span>Reading…</span> <span style="opacity:.7;font-size:11px;margin-left:4px;">tap to stop</span>';
    pill.style.cssText = [
      'position:fixed',
      'bottom:calc(64px + env(safe-area-inset-bottom,0px))',
      'right:16px',
      'z-index:9100',
      'background:var(--accent)',
      'color:#000',
      'border:none',
      'border-radius:20px',
      'padding:8px 16px',
      'font-family:var(--font-ui)',
      'font-size:13px',
      'font-weight:700',
      'cursor:pointer',
      'box-shadow:0 4px 16px rgba(0,0,0,.4)',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'animation:pill-in .2s ease',
    ].join(';');

    pill.addEventListener('click', () => {
      window.speechSynthesis?.cancel();
      this.hide();
      // Notify GuidedView so its button state resets
      if (typeof GuidedView !== 'undefined') GuidedView._updateSpeechBtns(false);
      if (typeof LectureMode !== 'undefined') LectureMode._isPlaying = false;
    });

    document.body.appendChild(pill);
    this._el = pill;
  },

  hide() {
    if (!this._el) return;
    this._el.style.animation = 'pill-out .15s ease forwards';
    setTimeout(() => {
      this._el?.remove();
      this._el = null;
    }, 160);
  },
};
