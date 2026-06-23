/**
 * Paywall.js — subscription gate for the managed-AI build (RevenueCat + Play Billing).
 *
 * SECURITY MODEL: the entitlement state here is a UX HINT only. The proxy is the
 * real authority — it independently asks RevenueCat whether this user has an
 * active entitlement before spending the API key, and returns 402 if not. So a
 * tampered client cannot get free AI; it can only mis-draw its own buttons.
 *
 * Requires the RevenueCat Capacitor plugin (@revenuecat/purchases-capacitor) in
 * the Android build. On web / when the plugin is absent, the app still runs but
 * purchases are unavailable (init no-ops). See SETUP_PAYWALL.md.
 */
const Paywall = {
  _entitled: false,
  _userId: null,
  _ready: false,

  _entId() { return (typeof AppConfig !== 'undefined' && AppConfig.ENTITLEMENT_ID) || 'premium'; },

  /** RevenueCat plugin handle, if present (Capacitor native or a web shim). */
  _rc() {
    try {
      if (typeof window === 'undefined') return null;
      return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases)
          || window.Purchases || null;
    } catch (e) { return null; }
  },

  _uuid() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },

  /** Stable, anonymous per-install id. Sent to the proxy as x-app-user-id and
   *  used as the RevenueCat appUserID so a subscription follows the install. */
  userId() {
    if (!this._userId) {
      try { this._userId = localStorage.getItem('kn_app_user_id'); } catch (e) {}
      if (!this._userId) {
        this._userId = 'knu_' + this._uuid();
        try { localStorage.setItem('kn_app_user_id', this._userId); } catch (e) {}
      }
    }
    return this._userId;
  },

  isEntitled() { return this._entitled === true; },

  async init() {
    this.userId();
    try { this._entitled = localStorage.getItem('kn_entitled_hint') === '1'; } catch (e) {}
    const RC = this._rc();
    const key = (typeof AppConfig !== 'undefined') ? AppConfig.REVENUECAT_PUBLIC_SDK_KEY : '';
    if (RC && key && key !== 'goog_REPLACE_ME') {
      try {
        await RC.configure({ apiKey: key, appUserID: this.userId() });
        await this.refresh();
        try { RC.addListener && RC.addListener('customerInfoUpdate', (info) => this._apply(info)); } catch (e) {}
      } catch (e) { console.warn('[Paywall] RevenueCat init failed:', e); }
    } else if ((typeof AppConfig !== 'undefined' && AppConfig.MANAGED_ONLY) && (!RC || key === 'goog_REPLACE_ME')) {
      console.warn('[Paywall] RevenueCat not configured (plugin missing or REVENUECAT_PUBLIC_SDK_KEY unset) — purchases disabled.');
    }
    this._ready = true;
  },

  async refresh() {
    const RC = this._rc();
    if (!RC) return this._entitled;
    try { const r = await RC.getCustomerInfo(); this._apply((r && r.customerInfo) || r); }
    catch (e) { console.warn('[Paywall] refresh failed:', e); }
    return this._entitled;
  },

  /** Apply a RevenueCat customerInfo object to local state. Pure enough to test. */
  _apply(info) {
    const active = (info && info.entitlements && info.entitlements.active) || {};
    const was = this._entitled;
    this._entitled = !!active[this._entId()];
    try { localStorage.setItem('kn_entitled_hint', this._entitled ? '1' : '0'); } catch (e) {}
    if (was !== this._entitled && typeof document !== 'undefined') {
      try { document.dispatchEvent(new CustomEvent('kn-entitlement-changed', { detail: { entitled: this._entitled } })); } catch (e) {}
    }
    return this._entitled;
  },

  /** Gate to call before an AI action. true = allowed; false = paywall shown. */
  guard(reason) {
    if (typeof AppConfig === 'undefined' || !AppConfig.MANAGED_ONLY) return true;
    if (this._entitled) return true;
    this.show(reason);
    return false;
  },

  async purchaseCurrent() {
    const RC = this._rc();
    if (!RC) { this._toast('error', 'In-app purchases aren’t available on this device.'); return false; }
    try {
      const off = await RC.getOfferings();
      const cur = (off && off.offerings && off.offerings.current) || (off && off.current) || null;
      const pkg = cur && cur.availablePackages && cur.availablePackages[0];
      if (!pkg) { this._toast('error', 'No subscription is available right now.'); return false; }
      const r = await RC.purchasePackage({ aPackage: pkg });
      this._apply((r && r.customerInfo) || r);
      return this._entitled;
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || '')) this._toast('error', 'Purchase failed: ' + ((e && e.message) || 'try again'));
      return false;
    }
  },

  async restore() {
    const RC = this._rc();
    if (!RC) return false;
    try {
      const r = await RC.restorePurchases();
      this._apply((r && r.customerInfo) || r);
      this._toast(this._entitled ? 'success' : 'info', this._entitled ? 'Subscription restored.' : 'No active subscription found.');
    } catch (e) { this._toast('error', 'Restore failed.'); }
    return this._entitled;
  },

  /** Render the upgrade screen. Uses the app's Modal if present. */
  show(reason) {
    if (typeof Modal === 'undefined' || !Modal.open) { this._toast('info', reason || 'A subscription is required.'); return; }
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    Modal.open(
      '<div style="text-align:center;">'
      + '<div style="font-size:34px;margin-bottom:8px;">⬡</div>'
      + '<h2 style="font-family:var(--font-ui);font-size:20px;font-weight:800;margin-bottom:6px;">Unlock AI Study Tools</h2>'
      + (reason ? '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);margin-bottom:14px;">' + esc(reason) + '</p>' : '')
      + '<ul style="text-align:left;display:inline-block;font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.8;margin:0 0 18px;padding-left:18px;">'
      + '<li>Turn photos &amp; PDFs into structured notes</li>'
      + '<li>Auto-generated questions, lectures &amp; slides</li>'
      + '<li>AI tutor, grading, and study planning</li>'
      + '</ul>'
      + '<div style="display:flex;flex-direction:column;gap:8px;">'
      + '<button class="btn-primary" id="pw-subscribe" style="justify-content:center;padding:13px;font-size:15px;">Subscribe</button>'
      + '<button class="btn-secondary" id="pw-restore" style="justify-content:center;">Restore purchase</button>'
      + '<button style="background:none;border:none;color:var(--text-muted);font-family:var(--font-mono);font-size:11px;cursor:pointer;margin-top:4px;" onclick="Modal.close()">Not now</button>'
      + '</div></div>'
    );
    setTimeout(() => {
      const sub = document.getElementById('pw-subscribe');
      const rest = document.getElementById('pw-restore');
      if (sub) sub.addEventListener('click', async () => {
        sub.disabled = true; sub.textContent = 'Processing…';
        const okBuy = await this.purchaseCurrent();
        if (okBuy) { try { Modal.close(); } catch (e) {} this._toast('success', 'You’re subscribed — enjoy!'); }
        else { sub.disabled = false; sub.textContent = 'Subscribe'; }
      });
      if (rest) rest.addEventListener('click', async () => {
        const okR = await this.restore();
        if (okR) { try { Modal.close(); } catch (e) {} }
      });
    }, 0);
  },

  _toast(kind, msg) { try { if (typeof Toast !== 'undefined' && Toast[kind]) return Toast[kind](msg); } catch (e) {} if (typeof console !== 'undefined') console.log('[Paywall] ' + msg); },
};
if (typeof window !== 'undefined') window.Paywall = Paywall;
if (typeof module !== 'undefined' && module.exports) module.exports = Paywall;
