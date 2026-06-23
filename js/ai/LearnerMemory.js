/**
 * LearnerMemory.js — Writeback layer
 *
 * Every time the learner does something meaningful, a feature calls
 * LearnerMemory.record(...). This writes a structured event to the node
 * and updates the global learner state so the NEXT feature that opens
 * knows exactly what happened before.
 *
 * EVENT TYPES:
 *   review        — completed a review session (per node)
 *   guided        — completed a guided study step or full session
 *   tutor         — completed a Socratic tutor session
 *   struggle      — rated a specific question Again/Hard
 *   mastered      — rated a specific question Good/Easy consistently
 *   note_opened   — opened a node's notes (lightweight, tracks recency)
 *
 * WHAT GETS WRITTEN:
 *   node.sessionLog[]     — chronological event log per node (existing)
 *   node.weakQuestions[]  — current list of question IDs being struggled with
 *   node.lastActivity     — timestamp of last interaction
 *   node.activitySummary  — one-line plain-English summary for AI context
 *   localStorage (global) — cross-node learner state
 */

const LearnerMemory = {

  /* ─────────────────────────────────────────────────────────
     PUBLIC API — called by features after each interaction
  ───────────────────────────────────────────────────────── */

  /**
   * Record a completed review session.
   * Called by ReviewView._showComplete()
   *
   * @param {object} node      — the node reviewed
   * @param {object} stats     — { again, hard, good, easy, score }
   * @param {string[]} hardQIds — question IDs rated Again or Hard
   */
  recordReview(node, stats, hardQIds = []) {
    const { again = 0, hard = 0, good = 0, easy = 0, score = 0 } = stats;
    const total = again + hard + good + easy;
    if (!total) return;

    const performance = score >= 80 ? 'strong' : score >= 50 ? 'moderate' : 'struggling';
    const summary = `Review: ${total} cards — ${score}% (Easy ${easy}, Good ${good}, Hard ${hard}, Again ${again}). Performance: ${performance}.`;

    this._writeToNode(node, {
      type:    'review',
      score,
      total,
      stats:   { again, hard, good, easy },
      hardQIds,
      summary,
    });

    // Update weak questions list
    this._updateWeakQuestions(node, hardQIds, ['good', 'easy'], stats);

    // Update activity summary — this is what other features read first
    node.activitySummary = summary;
    node.lastActivity    = Date.now();

    nodeStore.save(node);
    this._writeGlobal(node);
  },

  /**
   * Record completion of a Guided Study session.
   * Called by GuidedView when session ends.
   *
   * @param {object} node
   * @param {object} result — { stepsCompleted, recallScore, questionsAnswered }
   */
  recordGuidedSession(node, result = {}) {
    const { stepsCompleted = 0, recallScore = null, questionsAnswered = 0 } = result;
    const summary = `Guided study: ${stepsCompleted} steps completed`
      + (recallScore !== null ? `, recall score ${recallScore}%` : '')
      + (questionsAnswered ? `, answered ${questionsAnswered} questions` : '') + '.';

    this._writeToNode(node, {
      type: 'guided',
      stepsCompleted,
      recallScore,
      questionsAnswered,
      summary,
    });

    node.activitySummary = summary;
    node.lastActivity    = Date.now();
    nodeStore.save(node);
    this._writeGlobal(node);
  },

  /**
   * Record a Socratic tutor session.
   * Called by SocraticTutor when session ends.
   *
   * @param {object} node
   * @param {string} exampleTitle
   * @param {string} aiSummary — the AI-generated summary of the session
   */
  recordTutorSession(node, exampleTitle, aiSummary) {
    const summary = `Tutor session on "${exampleTitle}": ${aiSummary}`;

    this._writeToNode(node, {
      type:    'tutor',
      example: exampleTitle,
      summary,
    });

    node.activitySummary = summary;
    node.lastActivity    = Date.now();
    nodeStore.save(node);
    this._writeGlobal(node);
  },

  /**
   * Record that a question was struggled with (Again/Hard).
   * Called per-card by ReviewView._rate()
   *
   * @param {object} node
   * @param {object} question
   * @param {number} rating  — 1=Again, 2=Hard
   */
  recordStruggle(node, question, rating) {
    if (rating > 2) return; // Only Again/Hard counts as struggle

    if (!node.weakQuestions) node.weakQuestions = [];
    const already = node.weakQuestions.find(w => w.id === question.id);
    if (already) {
      already.count   = (already.count || 1) + 1;
      already.lastAt  = Date.now();
      already.rating  = rating;
    } else {
      node.weakQuestions.push({
        id:     question.id,
        text:   question.question,
        count:  1,
        rating,
        lastAt: Date.now(),
      });
    }

    // Keep only the 10 most recent struggles
    node.weakQuestions = node.weakQuestions
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, 10);

    // Don't save here — ReviewView saves after recordRating(); avoid double-save
  },

  /**
   * Record that a note was opened — lightweight recency tracking.
   * Called by NodeDetailView.open()
   *
   * @param {object} node
   */
  recordNoteOpened(node) {
    node.lastActivity = Date.now();
    // Don't trigger a full save — just update the timestamp silently
    try {
      const all = JSON.parse(localStorage.getItem('kn_nodes_v1') || '{}');
      if (all[node.id]) {
        all[node.id].lastActivity = node.lastActivity;
        localStorage.setItem('kn_nodes_v1', JSON.stringify(all));
      }
    } catch(e) { /* non-critical */ }
  },

  /* ─────────────────────────────────────────────────────────
     GLOBAL STATE
     Cross-node learner state — read by LearnerContext.forSession()
  ───────────────────────────────────────────────────────── */

  /**
   * Read the global learner state.
   * Returns { recentNodes, overallTrend, totalSessions, lastStudied }
   */
  getGlobalState() {
    try {
      return JSON.parse(localStorage.getItem('kn_learner_state') || '{}');
    } catch(e) {
      return {};
    }
  },

  /* ─────────────────────────────────────────────────────────
     CONTEXT HELPERS — read by LearnerContext
  ───────────────────────────────────────────────────────── */

  /**
   * Returns a short plain-English summary of what the learner
   * last did with a specific node. Used by LearnerContext to
   * tell the AI what happened before.
   *
   * @param {object} node
   * @returns {string}
   */
  getNodeActivitySummary(node) {
    const clean = (s) => {
      if (!s || typeof s !== 'string') return '';
      const t = s.trim();
      // Reject AI error blobs / raw JSON that were mistakenly cached as a summary.
      if (/^[`\s]*\{/.test(t) || /"error"\s*:/i.test(t)
          || /no source material/i.test(t) || /cannot complete summary/i.test(t)
          || /please provide the source/i.test(t)) {
        return '';
      }
      return t;
    };

    const direct = clean(node.activitySummary);
    if (direct) return direct;

    // Fall back to last session log entry
    const log = (node.sessionLog || []).slice(-1)[0];
    if (log) return clean(log.summary);

    return '';
  },

  /**
   * Returns the current weak questions for a node as a readable string.
   * Used by LearnerContext._weakQuestions()
   *
   * @param {object} node
   * @returns {string}
   */
  getWeakQuestionsText(node) {
    const weak = node.weakQuestions || [];
    if (!weak.length) return '';
    return weak
      .slice(0, 5)
      .map(w => `- "${w.text}" (struggled ${w.count}x)`)
      .join('\n');
  },

  /* ─────────────────────────────────────────────────────────
     PRIVATE HELPERS
  ───────────────────────────────────────────────────────── */

  /** Write a structured event to node.sessionLog */
  _writeToNode(node, event) {
    if (!node.sessionLog) node.sessionLog = [];
    node.sessionLog.push({
      date:    new Date().toLocaleDateString(),
      ts:      Date.now(),
      ...event,
    });
    // Keep log bounded — last 30 events
    if (node.sessionLog.length > 30) {
      node.sessionLog = node.sessionLog.slice(-30);
    }
  },

  /** Update node.weakQuestions based on a session's hard/easy question IDs */
  _updateWeakQuestions(node, hardQIds, goodRatings, stats) {
    if (!node.weakQuestions) node.weakQuestions = [];

    // Questions answered well — reduce their struggle count
    const goodQIds = (node.questions || [])
      .filter(q => {
        const s = node.srsState?.[q.id];
        return s && s.easeFactor >= 2.5 && s.interval >= 3;
      })
      .map(q => q.id);

    node.weakQuestions = node.weakQuestions
      .filter(w => !goodQIds.includes(w.id)) // remove mastered questions
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },

  /** Write a summary of this node's state to the global learner state */
  _writeGlobal(node) {
    try {
      const state = this.getGlobalState();
      if (!state.recentNodes) state.recentNodes = [];

      // Update or add this node's entry
      const existing = state.recentNodes.findIndex(n => n.id === node.id);
      const entry = {
        id:      node.id,
        title:   node.title,
        subject: node.subject,
        mastery: node.masteryScore ?? 0,
        lastAt:  Date.now(),
        summary: node.activitySummary || '',
      };

      if (existing >= 0) {
        state.recentNodes[existing] = entry;
      } else {
        state.recentNodes.unshift(entry);
      }

      // Keep only the 20 most recently active nodes
      state.recentNodes = state.recentNodes
        .sort((a, b) => b.lastAt - a.lastAt)
        .slice(0, 20);

      state.lastStudied    = Date.now();
      state.totalSessions  = (state.totalSessions || 0) + 1;

      localStorage.setItem('kn_learner_state', JSON.stringify(state));
    } catch(e) {
      console.warn('[LearnerMemory] Failed to write global state:', e);
    }
  },
};
