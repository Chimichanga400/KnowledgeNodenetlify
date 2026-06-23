/**
 * ScrollLock.js — automatic background scroll lock for overlays
 *
 * Goal: when any popup/overlay is on screen (coach chat, settings, the
 * More sheet, the guide, the scan view, etc.) the page BEHIND it must not
 * scroll. Background scroll-through (“scroll bleed”) is a classic tell that
 * an app isn’t polished.
 *
 * How it works — no per-popup wiring needed:
 *   A MutationObserver watches the DOM. Whenever something changes, we scan
 *   the <body>’s direct children for a fixed, full-bleed, high-z-index
 *   element (i.e. an overlay). If one is visible, we add `scroll-locked` to
 *   <html>/<body>; when it closes, we remove it. New overlays added in the
 *   future are covered automatically.
 *
 * We lock with `overflow:hidden` (not position:fixed), matching the rest of
 * the app — position:fixed was found to cause page-jump on mobile here.
 *
 * Persistent fixed UI that is NOT an overlay (sidebar, bottom nav, the API-key
 * banner, toasts, the selection toolbar, and LectureMode which locks itself)
 * is excluded.
 */

const ScrollLock = {
  EXCLUDE_IDS:     ['api-key-banner', 'lm-present'],
  EXCLUDE_CLASSES: ['sidebar', 'mobile-nav', 'toast-container', 'mobile-select-bar'],
  _locked: false,
  _scheduled: false,
  _obs: null,

  _isOverlay(el) {
    if (!el || el.nodeType !== 1) return false;
    if (this.EXCLUDE_IDS.includes(el.id)) return false;
    for (const c of this.EXCLUDE_CLASSES) if (el.classList.contains(c)) return false;
    let cs;
    try { cs = getComputedStyle(el); } catch { return false; }
    if (cs.position !== 'fixed') return false;
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if ((parseInt(cs.zIndex, 10) || 0) < 200) return false;     // overlays sit high; nav/banners are excluded anyway
    const r  = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // Full-bleed sheets and dialogs: most of the width, a meaningful slice of height.
    return r.width >= vw * 0.8 && r.height >= vh * 0.2;
  },

  _anyOpen() {
    const kids = document.body ? document.body.children : [];
    for (let i = 0; i < kids.length; i++) if (this._isOverlay(kids[i])) return true;
    return false;
  },

  apply() {
    const lock = this._anyOpen();
    if (lock === this._locked) return;
    this._locked = lock;
    document.documentElement.classList.toggle('scroll-locked', lock);
    document.body.classList.toggle('scroll-locked', lock);
  },

  schedule() {
    if (this._scheduled) return;
    this._scheduled = true;
    requestAnimationFrame(() => { this._scheduled = false; this.apply(); });
  },

  init() {
    if (this._obs || !document.body) return;
    try {
      this._obs = new MutationObserver((muts) => {
        for (let i = 0; i < muts.length; i++) {
          const m = muts[i];
          // Ignore our own html/body class toggles — prevents a feedback loop.
          if (m.type === 'attributes' && m.attributeName === 'class' &&
              (m.target === document.body || m.target === document.documentElement)) continue;
          this.schedule();
          return;
        }
      });
      this._obs.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });
      this.apply();
    } catch (e) { console.warn('[ScrollLock] init failed:', e); }
    // Coverage math depends on viewport size.
    window.addEventListener('resize', () => this.schedule());
    window.addEventListener('orientationchange', () => this.schedule());
  },
};

if (typeof window !== 'undefined') {
  window.ScrollLock = ScrollLock;
  if (document.body) ScrollLock.init();
  else document.addEventListener('DOMContentLoaded', () => ScrollLock.init());
}
