/**
 * BackupVault.js — versioned, in-app backup store
 *
 * Keeps a rolling set of timestamped snapshots INSIDE the app
 * (IndexedDB), instead of dropping dated files into the device's
 * Downloads folder. Each snapshot is clearly labelled with an
 * incrementing number, the app version, a timestamp, the node count
 * and its size — so picking the right one to restore is unambiguous.
 *
 * Why IndexedDB and not localStorage: snapshots can be hundreds of KB
 * and localStorage (~5MB shared) is already near quota in this app.
 *
 * Public API (all async except labelOf / fileNameOf):
 *   BackupVault.snapshot(reason)   -> record   (take a snapshot now)
 *   BackupVault.maybeAuto()        -> record|null (time-gated auto snapshot)
 *   BackupVault.list()             -> [record]  (newest first)
 *   BackupVault.get(seq)           -> record|null
 *   BackupVault.remove(seq)        -> void
 *   BackupVault.clearAll()         -> void
 *   BackupVault.labelOf(record)    -> "#7 · v63.9 · 13 Jun 2026, 14:32 · 42 nodes · 0.3 MB"
 *   BackupVault.fileNameOf(record) -> "knowledgenode-v63.9-2026-06-13-1432-42nodes.json"
 */

const BackupVault = {
  VERSION:       (typeof window !== 'undefined' && window.APP_VERSION) || '63.9',
  DB_NAME:       'kn_backup_vault',
  STORE:         'snapshots',
  MAX_SNAPSHOTS: 15,                       // keep the most recent N; older ones pruned
  AUTO_INTERVAL: 6 * 60 * 60 * 1000,       // auto-snapshot at most once / 6h
  _LAST_AUTO_KEY:'kn_vault_last_auto',

  /* ── low-level db ── */
  _open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: 'seq', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  },

  _tx(mode) {
    return this._open().then(db => {
      const tx    = db.transaction(this.STORE, mode);
      const store = tx.objectStore(this.STORE);
      return { db, tx, store };
    });
  },

  /* ── build the JSON payload for a snapshot (nodes + AI config) ── */
  _buildPayload() {
    const nodes = nodeStore.getAll().map(n => n.toJSON());
    const payload = { _knBackup: 1, version: this.VERSION, exportedAt: Date.now(), nodes };
    try {
      if (typeof AIService !== 'undefined' && AIService.exportConfig) {
        const ai = AIService.exportConfig();
        if (ai) payload.ai = ai;            // includes provider + API key(s)
      }
    } catch (e) { console.warn('[BackupVault] AI config not included:', e); }
    return JSON.stringify(payload);
  },

  /* ── take a snapshot of the current data ── */
  async snapshot(reason = 'manual') {
    if (typeof nodeStore === 'undefined') throw new Error('No data to back up yet');
    const json      = this._buildPayload();
    const nodeCount = nodeStore.getAll().length;
    let hasKey = false;
    try { hasKey = !!(typeof AIService !== 'undefined' && AIService.exportConfig && AIService.exportConfig()); } catch {}
    const record = {
      ts:        Date.now(),
      version:   this.VERSION,
      reason,                              // 'manual' | 'auto' | 'pre-restore' | 'pre-import' | 'pre-purge'
      nodeCount,
      hasKey,                              // whether AI config (incl. key) is in this snapshot
      sizeBytes: json.length,
      json,
    };
    const { store, tx, db } = await this._tx('readwrite');
    return new Promise((resolve, reject) => {
      const add = store.add(record);
      add.onsuccess = () => { record.seq = add.result; };
      tx.oncomplete = async () => {
        db.close();
        try { await this._prune(); } catch {}
        resolve(record);
      };
      tx.onerror = () => reject(tx.error || new Error('Snapshot failed'));
    });
  },

  /* ── time-gated auto snapshot (called from the save path) ── */
  async maybeAuto() {
    try {
      if (typeof nodeStore === 'undefined' || nodeStore.getAll().length === 0) return null;
      const last = parseInt(localStorage.getItem(this._LAST_AUTO_KEY) || '0', 10);
      if (Date.now() - last < this.AUTO_INTERVAL) return null;
      localStorage.setItem(this._LAST_AUTO_KEY, String(Date.now()));
      return await this.snapshot('auto');
    } catch (e) {
      console.warn('[BackupVault] auto snapshot skipped:', e);
      return null;
    }
  },

  /* ── list, newest first ── */
  async list() {
    try {
      const { store, db } = await this._tx('readonly');
      return await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => { db.close(); resolve((req.result || []).sort((a, b) => b.seq - a.seq)); };
        req.onerror   = () => { db.close(); reject(req.error); };
      });
    } catch (e) {
      console.warn('[BackupVault] list failed:', e);
      return [];
    }
  },

  async get(seq) {
    const { store, db } = await this._tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(Number(seq));
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror   = () => { db.close(); reject(req.error); };
    });
  },

  async remove(seq) {
    const { store, tx, db } = await this._tx('readwrite');
    store.delete(Number(seq));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
  },

  async clearAll() {
    const { store, tx, db } = await this._tx('readwrite');
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
  },

  /* ── keep only the newest MAX_SNAPSHOTS ── */
  async _prune() {
    const all = await this.list();             // newest first
    const excess = all.slice(this.MAX_SNAPSHOTS);
    for (const rec of excess) { try { await this.remove(rec.seq); } catch {} }
  },

  /* ── display helpers ── */
  labelOf(rec) {
    const d  = new Date(rec.ts);
    const mb = (rec.sizeBytes / (1024 * 1024));
    const size = mb >= 0.1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(rec.sizeBytes / 1024)) + ' KB';
    const date = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `#${rec.seq} · v${rec.version} · ${date}, ${time} · ${rec.nodeCount} node${rec.nodeCount === 1 ? '' : 's'} · ${size}${rec.hasKey ? ' · 🔑 incl. key' : ''}`;
  },

  reasonLabel(reason) {
    return { manual: 'Manual', auto: 'Auto', 'pre-restore': 'Safety (before restore)', 'pre-import': 'Safety (before import)', 'pre-purge': 'Safety (before purge)' }[reason] || reason;
  },

  fileNameOf(rec) {
    const d = new Date(rec.ts);
    const p = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    return `knowledgenode-v${rec.version}-${stamp}-${rec.nodeCount}nodes.json`;
  },

  /** Trigger a download/share of a specific snapshot with a clear versioned name. */
  download(rec) {
    const filename = this.fileNameOf(rec);
    // KNFiles uses the native save bridge on Android (where <a download> /
    // navigator.share do nothing) and falls back to a link download in browsers.
    if (window.KNFiles) {
      KNFiles.save(filename, 'application/json', rec.json);
      return;
    }
    // Legacy fallback
    const blob = new Blob([rec.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  },
};

if (typeof window !== 'undefined') window.BackupVault = BackupVault;
