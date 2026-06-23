/**
 * app.js v5 — Fixed routing, mobile more menu, detail tab bar, theme toggle
 */
const App = {
  _currentView: 'upload',
  _initialized: false,

  init() {
    // Small wrapper so one failing subsystem can't abort the whole init()
    // (which previously left navigation unbound — "nav buttons don't work").
    const safe = (fn, label) => {
      try { fn(); }
      catch (e) {
        console.error('[init] ' + label + ' failed:', e);
        try {
          const b = document.getElementById('kn-error-banner');
          if (b) { b.style.display = 'block'; b.textContent += '[init] ' + label + ' failed: ' + (e && e.message || e) + '\n'; }
        } catch (_) {}
      }
    };

    // ── Bind navigation FIRST ──────────────────────────────────────────────
    // Wire nav before any view init runs, so even if a later subsystem throws,
    // the tabs always work.
    this._bindNavigation();

    // Migrate old kn_last_directive → LearnerState on first run
    if (typeof LearnerState !== 'undefined') safe(() => LearnerState.migrate(), 'LearnerState.migrate');

    // SERVICE WORKER DISABLED — a broken SW from an earlier build (v63-27 had
    // non-existent files in its precache list) can get stuck controlling the page
    // and serve stale/broken assets, making the app appear dead. Actively
    // unregister any installed SW and clear its caches so files always load fresh.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      }).catch(()=>{});
      if (typeof caches !== 'undefined') {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(()=>{});
      }
    }

    // Init views — each isolated so one failure can't break the rest or nav.
    safe(() => UploadView.init(), 'UploadView');
    safe(() => GuidedView.init(), 'GuidedView');
    safe(() => LibraryView.init(), 'LibraryView');
    safe(() => NodeDetailView.init(), 'NodeDetailView');
    safe(() => ReviewView.init(), 'ReviewView');
    safe(() => Dashboard.init(), 'Dashboard');
    safe(() => StudyPlanView.init(), 'StudyPlanView');
    safe(() => StudySession.requestNotifications(), 'StudySession.requestNotifications');
    safe(() => StreakTracker.render(), 'StreakTracker.render');

    // Theme toggle — ThemeToggle.js removed, inlined here
    safe(() => {
      const _tkey = 'kn_theme';
      const _apply = t => {
        document.documentElement.classList.toggle('light-theme', t === 'light');
        const icon = t === 'dark' ? '☀' : '🌙';
        document.querySelectorAll('[data-theme-toggle]').forEach(b => {
          const iconEl = b.querySelector('[data-theme-icon]');
          if (iconEl) iconEl.textContent = icon;   // preserve any label markup
          else        b.textContent = icon;          // icon-only buttons (e.g. header)
          b.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        });
      };
      window.ThemeToggle = { toggle() {
        const next = document.documentElement.classList.contains('light-theme') ? 'dark' : 'light';
        _apply(next); localStorage.setItem(_tkey, next);
      }};
      _apply(localStorage.getItem(_tkey) || 'dark');
      document.querySelectorAll('[data-theme-toggle]').forEach(b =>
        b.addEventListener('click', () => ThemeToggle.toggle()));
    }, 'ThemeToggle');

    safe(() => SelectToAction.init(), 'SelectToAction');

    // Remaining (non-navigation) UI bindings — isolated so a missing element
    // can't break init.
    safe(() => this._bindChrome(), 'chrome bindings');

    safe(() => {
      // When any node changes, invalidate the LearnerContext session cache.
      nodeStore.addEventListener('change', () => {
        if (typeof LearnerContext !== 'undefined') LearnerContext._sessionCache = null;
      });
      // Store changes — debounced UI refresh.
      let _uiRefreshTimer;
      nodeStore.addEventListener('change', () => {
        clearTimeout(_uiRefreshTimer);
        _uiRefreshTimer = setTimeout(() => {
          this.updateSidebarStats();
          if (this._currentView === 'library')   LibraryView.refresh();
          if (this._currentView === 'guided')    GuidedView.refresh();
          if (this._currentView === 'review')    ReviewView.refresh();
          if (this._currentView === 'dashboard') Dashboard.refresh();
          if (this._currentView === 'studyplan') StudyPlanView.refresh();
        }, 350);
      });
    }, 'nodeStore listeners');

    safe(() => AIService.loadConfig(), 'AIService.loadConfig');
    safe(() => { if (typeof Paywall !== 'undefined') Paywall.init(); }, 'Paywall.init');
    safe(() => this._checkApiKey(), '_checkApiKey');
    safe(() => this.updateSidebarStats(), 'updateSidebarStats');

    // Enable autocorrect, spell-check and text prediction on all text inputs —
    // Android's WebView doesn't activate these by default. A MutationObserver
    // covers dynamically-created inputs (modals, question boxes, chat, etc.).
    safe(() => {
      const patchInputs = () => {
        document.querySelectorAll(
          'textarea:not([data-ime]),input[type="text"]:not([data-ime]),input:not([type]):not([data-ime])'
        ).forEach(el => {
          el.dataset.ime = '1';
          if (!el.hasAttribute('autocorrect'))   el.setAttribute('autocorrect', 'on');
          if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'sentences');
          if (!el.hasAttribute('spellcheck'))    el.setAttribute('spellcheck', 'true');
        });
      };
      patchInputs();
      new MutationObserver(patchInputs).observe(document.body, { childList: true, subtree: true });
    }, 'ime patch');

    // Data safety reminder — shown once every 7 days if the user has nodes
    // but hasn't exported recently. Prevents silent data loss.
    safe(() => {
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      const lastReminder = parseInt(localStorage.getItem('kn_last_backup_reminder') || '0', 10);
      const hasNodes = nodeStore.getAll().length > 0;
      if (hasNodes && Date.now() - lastReminder > WEEK) {
        setTimeout(() => {
          localStorage.setItem('kn_last_backup_reminder', String(Date.now()));
          Toast.info('💾 Back up your nodes — go to Settings → Export All Nodes or Settings → Backups → Download. Uninstalling the app deletes everything.', 8000);
        }, 3000);
      }
    }, 'backup reminder');

    // Smart start view — reduce friction for returning users
    safe(() => {
      const lastView   = localStorage.getItem('kn_last_view');
      const lastNodeId = localStorage.getItem('kn_last_node');
      if (lastView === 'node-detail' && lastNodeId && nodeStore.get(lastNodeId)) {
        this.navigateTo('node-detail');
        NodeDetailView.open(lastNodeId);
      } else {
        this.navigateTo(this._smartStartView(lastView));
      }
    }, 'smart start view');

    // Mark init complete — the on-screen failsafe relies on this flag to decide
    // whether navigation got bound. (Do NOT use _currentView for this; it's
    // preset in the object literal and is always truthy.)
    this._initialized = true;

    setTimeout(() => { try { Onboarding.checkFirstLaunch(); } catch (e) {} }, 600);
  },

  /** Bind all navigation handlers. Runs first in init() so tabs always work,
   *  even if a later subsystem throws. Idempotent via a guard flag per element. */
  _bindNavigation() {
    const bind = (el, fn) => {
      if (!el || el._navBound) return;
      el._navBound = true;
      el.addEventListener('click', fn);
    };

    // Desktop sidebar nav
    document.querySelectorAll('.nav-item').forEach(btn =>
      bind(btn, () => this.navigateTo(btn.dataset.view)));

    // Mobile bottom nav
    document.querySelectorAll('.mobile-nav-btn').forEach(btn =>
      bind(btn, () => {
        const view = btn.dataset.view;
        if (view === 'more-menu') { this._toggleMoreMenu(); }
        else { this._closeMoreMenu(); this.navigateTo(view); }
      }));

    // More menu items
    document.querySelectorAll('.more-menu-item[data-view]').forEach(btn =>
      bind(btn, () => { this._closeMoreMenu(); this.navigateTo(btn.dataset.view); }));

    bind(document.getElementById('more-menu-close'), () => this._closeMoreMenu());
  },

  /** Non-navigation chrome (sidebar collapse, modals, detail topbar, etc.).
   *  Each binding individually guarded so a missing element can't abort. */
  _bindChrome() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

    on('sidebar-toggle', 'click', () => {
      const s = document.getElementById('sidebar');
      if (!s) return;
      const c = s.classList.toggle('collapsed');
      const t = document.getElementById('sidebar-toggle');
      if (t) t.textContent = c ? '▶' : '◀';
    });

    on('ai-settings-sidebar-btn', 'click', () => SettingsPanel.open());
    on('ai-director-btn', 'click', () => AIDirector.run());
    on('more-menu-aidirector', 'click', () => { this._closeMoreMenu(); AIDirector.run(); });
    on('more-menu-coach', 'click', () => { this._closeMoreMenu(); StudyCoach.open(); });
    on('start-timer-btn', 'click', () => { StudySession.requestNotifications(); StudySession.open(); });
    on('more-menu-settings', 'click', () => { this._closeMoreMenu(); SettingsPanel.open(); });
    on('more-menu-guide', 'click', () => { this._closeMoreMenu(); Guide.open(); });
    on('more-menu-timer', 'click', () => { this._closeMoreMenu(); StudySession.open(); });

    // Node detail topbar buttons
    on('detail-back', 'click', () => this.navigateTo('library'));
    on('detail-export-btn', 'click', () =>
      NodeDetailView._currentNode && PrintExport.showNodeExportMenu(NodeDetailView._currentNode));
    on('detail-print-btn', 'click', () =>
      NodeDetailView._currentNode && PrintExport.printNode(NodeDetailView._currentNode));
    on('detail-learn-btn', 'click', () => {
      try {
        const node = NodeDetailView._currentNode;
        if (!node) { Toast.info('Open a node first.'); return; }
        LearnPanel.open(node);
      } catch (e) {
        Toast.error('Error: ' + e.message);
        console.error('LearnPanel error:', e);
      }
    });

    // Node detail tab buttons (mobile + desktop)
    document.querySelectorAll('.detail-tab-btn, .detail-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.toggle('active', b === btn || b.dataset.section === btn.dataset.section));
        document.querySelectorAll('.detail-nav-btn').forEach(b => b.classList.toggle('active', b === btn || b.dataset.section === btn.dataset.section));
        NodeDetailView._currentSection = btn.dataset.section;
        NodeDetailView._editMode = false;
        NodeDetailView._renderSection();
      });
    });

    // Modal close
    on('modal-close', 'click', () => Modal.close());
    on('modal-overlay', 'click', e => {
      if (e.target === document.getElementById('modal-overlay')) Modal.close();
    });

    // Plan header button
    on('new-plan-header-btn', 'click', () => StudyPlanBuilder.open());

    // Competency view back button
    on('competency-back', 'click', () => this.navigateTo('studyplan'));
  },

  navigateTo(view) {
    this._currentView = view;
    // Reset guided session state when navigating away, so the next visit
    // shows the filter/start screen rather than resuming mid-session.
    if (view !== 'guided' && typeof GuidedView !== 'undefined') {
      GuidedView._inSession = false;
    }
    // Save lecture position before stopping speech, so it can resume later
    if (typeof LectureMode !== 'undefined' && LectureMode._savePosition) {
      try { LectureMode._savePosition(); } catch(e) {}
    }
    // Stop any active speech when navigating
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    SpeechPill.hide();
    // Persist view — now includes node-detail
    localStorage.setItem('kn_last_view', view);
    // Clear last node when leaving node-detail
    if (view !== 'node-detail') localStorage.removeItem('kn_last_node');
    // Clean up AI floater when leaving node detail
    if (view !== 'node-detail') document.getElementById('ai-floater')?.remove();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add('active');
    switch (view) {
      case 'guided':    GuidedView.refresh();    break;
      case 'library':   LibraryView.refresh();   break;
      case 'review':    ReviewView.refresh();     break;
      case 'dashboard': Dashboard.refresh();      break;
      case 'studyplan': StudyPlanView.refresh();  break;
      case 'competency': CompetencyView.refresh(); break;
    }
    const mc = document.getElementById('main-content');
    if (mc) mc.scrollTop = 0;
    window.scrollTo(0, 0);
  },

  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewId}`)?.classList.add('active');
  },

  updateSidebarStats() {
    const s = nodeStore.getStats();
    document.getElementById('stat-nodes').textContent   = s.total;
    document.getElementById('stat-mastery').textContent = s.mastery + '%';
    document.getElementById('stat-due').textContent     = s.due;
  },

  _toggleMoreMenu() {
    document.getElementById('more-menu-panel')?.classList.toggle('hidden');
  },
  _closeMoreMenu() {
    document.getElementById('more-menu-panel')?.classList.add('hidden');
  },

  _checkApiKey() {
    // Re-run automatically once async proxy detection completes.
    document.addEventListener('kn-proxy-detected', () => {
      document.getElementById('api-key-banner')?.remove();
      const mc = document.getElementById('main-content');
      if (mc) mc.style.paddingTop = '';
    }, { once: true });

    if (AIService.hasApiKey()) return;
    // Detection may still be in flight; give it a brief moment before showing the banner.
    setTimeout(() => {
      if (AIService.hasApiKey() || document.getElementById('api-key-banner')) return;
      this._showApiKeyBanner();
    }, 1200);
  },

  /** Pick the most valuable screen for this user right now.
   *  New users → upload. Returning + due cards → review. Otherwise → resume or guided. */
  _smartStartView(lastView) {
    const stats = nodeStore.getStats();
    // New user with no content — always upload first
    if (!stats.total) return 'upload';
    // Was somewhere useful — resume it (but not upload, which is a task not a view)
    if (lastView && !['upload', 'node-detail'].includes(lastView)) return lastView;
    // Has due cards — review is the highest-value action
    if (stats.due > 0) return 'review';
    // Nodes exist but nothing due — start a guided session
    return 'guided';
  },

  _showApiKeyBanner() {
    const banner = document.createElement('div');
    banner.id = 'api-key-banner';
    banner.innerHTML = `
      <span>⬡ Demo mode — <strong style="color:var(--accent)">no AI configured</strong>.</span>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button id="banner-configure-btn" style="padding:6px 14px;background:var(--accent);color:#060709;border:none;border-radius:var(--radius-sm);font-family:var(--font-ui);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Configure AI</button>
        <button id="banner-dismiss-btn" style="padding:6px 10px;background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;cursor:pointer;">✕</button>
      </div>`;
    document.body.prepend(banner);
    document.getElementById('banner-configure-btn').addEventListener('click', () => AISettingsModal.open());
    document.getElementById('banner-dismiss-btn').addEventListener('click', () => {
      banner.remove();
      document.getElementById('main-content').style.paddingTop = '';
    });
    document.getElementById('main-content').style.paddingTop = '46px';
  },
};

// Emergency SW reset: add ?reset=1 to URL to unregister SW and reload clean
if (location.search.includes('reset=1') && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    Promise.all(regs.map(r => r.unregister())).then(() => {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => {
        location.replace(location.pathname);
      });
    });
  });
} else {
  // If the DOM is already parsed (scripts at end of body often run after
  // DOMContentLoaded has fired), init immediately. Otherwise wait for the event.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
}

// ── Cross-tab sync ────────────────────────────────────────────────────────
// When another tab saves nodes, reload the store and refresh the current view.
window.addEventListener('storage', e => {
  if (e.key === 'kn_nodes_v1' && e.newValue) {
    try {
      nodeStore._load();
      App.updateSidebarStats();
      const view = App._currentView;
      if (view === 'library')    LibraryView.refresh();
      if (view === 'review')     ReviewView.refresh();
      if (view === 'dashboard')  Dashboard.refresh?.();
      if (view === 'studyplan')  StudyPlanView.refresh?.();
    } catch(e2) {
      console.warn('[App] Cross-tab sync failed:', e2);
    }
  }
});

// ── Visibility change — reload if data may have changed ──────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Tab is being backgrounded — save lecture position so it can resume
    if (typeof LectureMode !== 'undefined' && LectureMode._savePosition) {
      try { LectureMode._savePosition(); } catch(e) {}
    }
  }
  if (document.visibilityState === 'visible') {
    try {
      nodeStore._load();
      App.updateSidebarStats();
    } catch(e) {}
  }
});

