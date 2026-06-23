/**
 * NodeStore.js — Persistence & State Management
 *
 * Single source of truth for all KnowledgeNodes.
 * Uses localStorage for persistence. Emits events for UI updates.
 * In the future this can be swapped for a remote API with minimal changes.
 */

class NodeStore extends EventTarget {
  constructor() {
    super();
    this._storageKey = 'kn_nodes_v1';
    /** @type {Map<string, KnowledgeNode>} */
    this._nodes = new Map();
    this._load();
  }

  // ─── Public API ───────────────────────────────────────

  /** @returns {KnowledgeNode[]} All nodes, sorted by creation date desc.
   *  Cached — only rebuilt when the Map is mutated (save/delete). */
  getAll() {
    if (!this._sortedCache) {
      this._sortedCache = Array.from(this._nodes.values())
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    return this._sortedCache;
  }

  /** @returns {KnowledgeNode|undefined} */
  get(id) {
    return this._nodes.get(id);
  }

  /** Add or update a node. Emits 'change'.
   *  Merges volatile learning fields (srsState, sessionLog, weakQuestions,
   *  timestamps) to prevent concurrent saves from overwriting each other —
   *  e.g. ReviewView rating a card while ReactiveReshaper saves in background. */
  save(node) {
    if (!(node instanceof KnowledgeNode)) node = new KnowledgeNode(node);

    const existing = this._nodes.get(node.id);
    if (existing && existing !== node) {
      // SRS state: incoming wins for keys it has; preserve keys it doesn't
      node.srsState = { ...existing.srsState, ...node.srsState };

      // Session log: union by timestamp — never drop a session
      const seenTs = new Set();
      node.sessionLog = [
        ...(existing.sessionLog || []),
        ...(node.sessionLog || [])
      ].filter(e => {
        if (!e) return false;
        const k = e.ts || e.date;
        if (seenTs.has(k)) return false;
        seenTs.add(k); return true;
      }).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-20);

      // Weak questions: union
      const wqSet = new Set([
        ...(existing.weakQuestions || []),
        ...(node.weakQuestions || [])
      ]);
      node.weakQuestions = Array.from(wqSet);

      // Timestamps: always keep the most recent value
      node.lastActivity = Math.max(node.lastActivity || 0, existing.lastActivity || 0) || null;
      node.lastReviewed = Math.max(node.lastReviewed || 0, existing.lastReviewed || 0) || null;
      node.reviewCount  = Math.max(node.reviewCount  || 0, existing.reviewCount  || 0);

      // Recompute mastery from the now-merged SRS state
      if (Object.keys(node.srsState).length) node.masteryScore = node.computeMastery();

      // Guard against storage bloat
      if ((node.userImages  || []).length > 10) node.userImages  = node.userImages.slice(-10);
      if ((node.sessionLog  || []).length > 20) node.sessionLog  = node.sessionLog.slice(-20);
    }

    node.updatedAt = Date.now();
    this._nodes.set(node.id, node);
    this._sortedCache = null; // invalidate

    // Debounced persist — batches rapid saves (e.g. review ratings every 5s)
    // into one write instead of serialising all nodes on every tap.
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => this._flushPersist(), 300);

    this.dispatchEvent(new CustomEvent('change', { detail: { type: 'save', node } }));
    return node;
  }

  /** Delete a node by id. Emits 'change'. */
  delete(id) {
    const node = this._nodes.get(id);
    if (!node) return false;
    this._nodes.delete(id);
    this._sortedCache = null;
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => this._flushPersist(), 300);
    this.dispatchEvent(new CustomEvent('change', { detail: { type: 'delete', id } }));
    return true;
  }

  /** @returns {KnowledgeNode[]} Nodes that have at least one question due.
   *  Inlines the due check rather than calling dueQuestions() to avoid creating
   *  an intermediate array per node — O(q) check without O(q) allocation. */
  getDueNodes() {
    const now = Date.now();
    return this.getAll().filter(n =>
      n.questions.some(q => {
        const s = n.srsState[q.id];
        return s && s.repetitions > 0 && s.nextReview <= now;
      })
    );
  }

  /** @returns {{ total: number, mastery: number, due: number }}
   *  Single pass — avoids calling getAll() twice (once here, once in getDueNodes). */
  getStats() {
    const all = this.getAll();
    if (!all.length) return { total: 0, mastery: 0, due: 0 };
    const now = Date.now();
    let totalMastery = 0, due = 0;
    for (const n of all) {
      totalMastery += n.masteryScore;
      if (n.questions.some(q => {
        const s = n.srsState[q.id];
        return s && s.repetitions > 0 && s.nextReview <= now;
      })) due++;
    }
    return { total: all.length, mastery: Math.round(totalMastery / all.length), due };
  }

  /** Return all unique subjects */
  getSubjects() {
    const subjects = new Set(this.getAll().map(n => n.subject).filter(Boolean));
    return Array.from(subjects);
  }

  // ─── Private ──────────────────────────────────────────

  _load() {
    this._nodes.clear();
    this._sortedCache = null; // invalidate sort cache on reload
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) { console.warn('[NodeStore] Invalid data format'); return; }
      let loaded = 0;
      arr.forEach(obj => {
        try {
          if (!obj || !obj.id) return; // skip corrupt entries
          const node = KnowledgeNode.fromJSON(obj);
          this._nodes.set(node.id, node);
          loaded++;
        } catch(e2) {
          console.warn('[NodeStore] Skipping corrupt node:', e2);
        }
      });
      if (loaded > 0) console.log('[NodeStore] Loaded ' + loaded + ' nodes');
    } catch (e) {
      console.warn('[NodeStore] Failed to load from localStorage:', e);
      // Try to recover from backup
      try {
        const backup = localStorage.getItem(this._storageKey + '_backup');
        if (backup) {
          const arr = JSON.parse(backup);
          arr.forEach(obj => { if (obj?.id) this._nodes.set(obj.id, KnowledgeNode.fromJSON(obj)); });
          console.log('[NodeStore] Recovered from backup');
        }
      } catch {}
    }
  }

  /** Shim for importJSON and any legacy callers — flushes immediately. */
  _persist() { this._flushPersist(); }

  _flushPersist() {
    try {
      const data = this.getAll().map(n => n.toJSON());
      const json = JSON.stringify(data);
      localStorage.setItem(this._storageKey, json);

      this._saveCount = (this._saveCount || 0) + 1;

      // Rolling in-browser backup every 10 saves (silent, no download)
      if (this._saveCount % 10 === 0) {
        try { localStorage.setItem(this._storageKey + '_backup', json); } catch {}
      }

      // Versioned snapshot into the in-app Backup Vault (IndexedDB).
      // Self-gated to at most once / 6h, so this is safe to call on every save.
      // Replaces the old behaviour of dropping dated files into Downloads.
      if (typeof BackupVault !== 'undefined') { BackupVault.maybeAuto(); }
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn('[NodeStore] localStorage quota exceeded — trying to free space');
        ['kn_nodes_backup', 'kn_nodes_old'].forEach(k => localStorage.removeItem(k));
        try { localStorage.setItem(this._storageKey, JSON.stringify(this.getAll().map(n => n.toJSON()))); }
        catch(e2) {
          console.error('[NodeStore] Could not persist:', e2);
          if (typeof Toast !== 'undefined') Toast.error('⚠ Storage full — export your data now from Settings.');
        }
      } else {
        console.warn('[NodeStore] Failed to persist to localStorage:', e);
      }
    }
  }

  /** Export all data as JSON string — use for backup */
  exportJSON() {
    return JSON.stringify(this.getAll().map(n => n.toJSON()), null, 2);
  }

  /** Parse a backup string in either format:
   *    - legacy: a bare array of node objects
   *    - current: { _knBackup, nodes:[...], ai:{...} }
   *  Returns { nodes:[...], ai:obj|null }. */
  _parseBackup(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (Array.isArray(data)) return { nodes: data, ai: null };
    if (data && Array.isArray(data.nodes)) return { nodes: data.nodes, ai: data.ai || null };
    throw new Error('Unrecognised backup format');
  }

  /** Import data from JSON string — merges with existing nodes (re-import overwrites by id).
   *  Also restores AI configuration if the backup contains it. */
  importJSON(jsonStr) {
    try {
      const { nodes, ai } = this._parseBackup(jsonStr);
      nodes.forEach(obj => {
        const node = KnowledgeNode.fromJSON(obj);
        this._nodes.set(node.id, node);
      });
      this._sortedCache = null;
      this._flushPersist();
      if (ai && typeof AIService !== 'undefined') { try { AIService.importConfig(ai); } catch {} }
      this.dispatchEvent(new CustomEvent('change', { detail: { type: 'import' } }));
      return nodes.length;
    } catch(e) {
      throw new Error('Invalid backup file: ' + e.message);
    }
  }

  /** Replace ALL current data with the contents of a snapshot (true restore).
   *  Unlike importJSON (which merges), this clears existing nodes first so the
   *  result exactly matches the chosen version. Also restores AI config if present. */
  replaceAllFromJSON(jsonStr) {
    const { nodes, ai } = this._parseBackup(jsonStr);   // validate before clearing
    this._nodes.clear();
    let loaded = 0;
    nodes.forEach(obj => {
      try { if (obj?.id) { this._nodes.set(obj.id, KnowledgeNode.fromJSON(obj)); loaded++; } }
      catch(e) { console.warn('[NodeStore] Skipping corrupt node on restore:', e); }
    });
    this._sortedCache = null;
    this._flushPersist();
    if (ai && typeof AIService !== 'undefined') { try { AIService.importConfig(ai); } catch {} }
    this.dispatchEvent(new CustomEvent('change', { detail: { type: 'restore' } }));
    return loaded;
  }
}

// Singleton
const nodeStore = new NodeStore();
