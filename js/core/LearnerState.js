/**
 * LearnerState.js — Single shared memory for the Director and Coach.
 *
 * Both systems read from and write to this store. Neither has private
 * memory the other can't see. This is the source of truth for:
 *
 *   director   — last Director run: assessment, decisions, urgent nodes
 *   coach      — recent coach topics and last insight
 *   profile    — inferred student profile that both systems update
 *
 * localStorage key: kn_learner_state_v1
 */
const LearnerState = {
  _key: 'kn_learner_state_v1',

  _defaults() {
    return {
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
      director:    null,   // set by AIDirector._apply()
      coach:       null,   // set by StudyCoach after exchanges
      profile:     null,   // inferred by either system
      sessionLoad: null,   // { level:'light'|'normal'|'deep', at, reason, deferred:[] }
    };
  },

  /** Read the full state object. Always returns a valid object. */
  get() {
    try {
      const raw = localStorage.getItem(this._key);
      if (!raw) return this._defaults();
      return { ...this._defaults(), ...JSON.parse(raw) };
    } catch { return this._defaults(); }
  },

  /** Merge a patch into the state. Only the keys you pass are changed. */
  update(patch) {
    try {
      const next = { ...this.get(), ...patch, updatedAt: Date.now() };
      localStorage.setItem(this._key, JSON.stringify(next));
      return next;
    } catch(e) {
      console.warn('[LearnerState] write failed:', e);
      return this.get();
    }
  },

  /**
   * Set how heavy the next study session should be.
   * The student controls this — the Coach sets it only after confirming.
   *   level:  'light' | 'normal' | 'deep'
   *   reason: short natural-language note (e.g. "hectic work day")
   * Returns the multiplier callers use to scale session volume.
   */
  setSessionLoad(level, reason = '') {
    const valid = ['light', 'normal', 'deep'];
    if (!valid.includes(level)) level = 'normal';
    return this.update({
      sessionLoad: {
        level,
        reason: (reason || '').slice(0, 120),
        at:     Date.now(),
      }
    });
  },

  /**
   * Read the current load level. Resets to 'normal' automatically if the
   * last setting is stale (older than 18h) so a tired Tuesday doesn't
   * silently shrink your sessions for the rest of the week.
   */
  getSessionLoad() {
    const sl = this.get().sessionLoad;
    if (!sl || !sl.level) return { level: 'normal', reason: '', stale: true };
    const ageHours = (Date.now() - (sl.at || 0)) / 3600000;
    if (ageHours > 18) return { level: 'normal', reason: '', stale: true };
    return { ...sl, stale: false };
  },

  /** Volume multiplier for the current load. light=0.4, normal=1, deep=1.8 */
  loadMultiplier() {
    const lvl = this.getSessionLoad().level;
    return lvl === 'light' ? 0.4 : lvl === 'deep' ? 1.8 : 1.0;
  },

  /**
   * Defer skipped study-plan tasks so they come back rather than vanish.
   * Stores task references; PlanEngine.rebalance() pulls these into upcoming days.
   */
  deferTasks(taskRefs = []) {
    if (!taskRefs.length) return this.get();
    const prev = this.get().sessionLoad || { level: 'normal', at: Date.now() };
    const deferred = (prev.deferred || []).concat(
      taskRefs.map(t => ({ ...t, deferredAt: Date.now() }))
    ).slice(-50); // cap so it can't grow unbounded
    return this.update({ sessionLoad: { ...prev, deferred } });
  },

  /** Pull and clear deferred tasks — called on a deep day to draw down backlog. */
  drainDeferred() {
    const sl = this.get().sessionLoad;
    const deferred = (sl && sl.deferred) || [];
    if (sl) this.update({ sessionLoad: { ...sl, deferred: [] } });
    return deferred;
  },

  /** How many tasks are currently deferred (the backlog the student owes). */
  deferredCount() {
    const sl = this.get().sessionLoad;
    return (sl && sl.deferred && sl.deferred.length) || 0;
  },

  /**
   * Called by AIDirector when it applies a directive.
   * Stores the full assessment so the Coach can reference it.
   */
  saveDirectorRun({ assessment, overallStudyMethod, studyMethodWhy,
                    startNodeTitle, urgentNodes, planGuidance, firstAction, reshapedCount }) {
    return this.update({
      director: {
        at:                 Date.now(),
        assessment:         assessment         || '',
        overallStudyMethod: overallStudyMethod || '',
        studyMethodWhy:     studyMethodWhy     || '',
        startNodeTitle:     startNodeTitle     || null,
        urgentNodes:        urgentNodes        || [],
        planGuidance:       planGuidance       || '',
        firstAction:        firstAction        || '',
        reshapedCount:      reshapedCount      || 0,
      }
    });
  },

  /**
   * Called by StudyCoach after a meaningful exchange.
   * Stores a lightweight record so the Director and future Coach sessions
   * know what the student has recently discussed and struggled with.
   */
  saveCoachExchange({ question, signal, insight }) {
    const prev   = this.get().coach || {};
    // Keep last 6 signals — circular buffer of what the student has struggled with.
    // These are distilled by the AI (e.g. "Student confused about VAT output tax"),
    // not raw answer slices. The Director reads these before evaluating.
    const signals = (prev.signals || []).slice(-5);
    if (signal) signals.push({ at: Date.now(), text: signal.slice(0, 200) });
    const topics  = (prev.recentTopics || []).slice(-4);
    topics.push({ at: Date.now(), q: (question || '').slice(0, 120) });
    return this.update({
      coach: {
        lastAt:       Date.now(),
        lastQuestion: (question || '').slice(0, 200),
        lastInsight:  (signal || insight || '').slice(0, 300),
        signals,           // structured signals the Director can act on
        recentTopics: topics,
      }
    });
  },

  /**
   * Human-readable summary for prompts.
   * Both Director and Coach call this to get a shared context block.
   */
  toPromptBlock() {
    const s = this.get();
    const parts = [];

    if (s.director) {
      const d = s.director;
      const daysAgo  = Math.floor((Date.now() - d.at) / 86400000);
      const when     = daysAgo === 0 ? 'today'
                     : daysAgo === 1 ? 'yesterday'
                     : daysAgo + ' days ago';
      let block = 'AI DIRECTOR LAST RAN: ' + when;
      if (d.assessment)         block += '\n  Assessment: '         + d.assessment;
      if (d.overallStudyMethod) block += '\n  Recommended method: ' + d.overallStudyMethod
                                       + (d.studyMethodWhy ? ' (' + d.studyMethodWhy + ')' : '');
      if (d.startNodeTitle)     block += '\n  Told student to start with: "' + d.startNodeTitle + '"';
      if (d.firstAction)       block += '\n  Specific first action given: ' + d.firstAction;
      if (d.urgentNodes?.length) block += '\n  Flagged urgent: ' + d.urgentNodes.join(', ');
      if (d.planGuidance)       block += '\n  Plan guidance: ' + d.planGuidance;
      block += '\n  Reshaped ' + d.reshapedCount + ' topic(s).';
      parts.push(block);
    }

    if (s.coach) {
      const c = s.coach;
      const daysAgo = Math.floor((Date.now() - c.lastAt) / 86400000);
      const when    = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : daysAgo + ' days ago';
      let block = 'COACH LAST USED: ' + when;
      if (c.lastQuestion) block += '\n  Last question: "' + c.lastQuestion + '"';
      // Structured signals are AI-distilled (e.g. "Student confused about VAT output tax").
      // These are far more useful for decisions than raw answer slices.
      if (c.signals?.length) {
        const recent = c.signals.slice(-3);
        block += '\n  What the student has been struggling with (from recent coach exchanges):\n'
               + recent.map(sig => {
                   const d = Math.floor((Date.now() - sig.at) / 86400000);
                   const w = d === 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago';
                   return '    - [' + w + '] ' + sig.text;
                 }).join('\n');
      } else if (c.lastInsight) {
        block += '\n  Last insight: ' + c.lastInsight;
      }
      if (c.recentTopics?.length > 1) {
        block += '\n  Recent topics discussed: '
               + c.recentTopics.slice(-3).map(t => '"' + t.q + '"').join('; ');
      }
      parts.push(block);
    }

    // Current session-load lever — Director stays AWARE of it but does not act
    // on it directly; the session builder and PlanEngine do the scaling.
    const sl = this.getSessionLoad();
    if (!sl.stale && sl.level && sl.level !== 'normal') {
      let lb = 'CURRENT SESSION LOAD: ' + sl.level
        + (sl.level === 'light' ? ' (student asked to keep it lighter today'
         : sl.level === 'deep'  ? ' (student wants a heavier session today' : ' (');
      if (sl.reason) lb += ' — "' + sl.reason + '"';
      lb += ').';
      const deferred = this.deferredCount();
      if (deferred > 0) lb += ' ' + deferred + ' task(s) are deferred and owed.';
      parts.push(lb);
    }

    return parts.length
      ? 'SHARED LEARNER MEMORY:\n' + parts.join('\n\n')
      : '';
  },

  /** Migrate data from the old kn_last_directive key on first run. */
  migrate() {
    try {
      if (this.get().director) return; // already have data
      const old = localStorage.getItem('kn_last_directive');
      if (!old) return;
      const d = JSON.parse(old);
      this.update({
        director: {
          at:                 d.appliedAt         || Date.now(),
          assessment:         '',
          overallStudyMethod: d.overallStudyMethod || '',
          studyMethodWhy:     '',
          startNodeTitle:     d.startNodeTitle    || null,
          urgentNodes:        d.urgentNodes        || [],
          planGuidance:       d.planGuidance       || '',
          reshapedCount:      d.reshapedCount      || 0,
        }
      });
      localStorage.removeItem('kn_last_directive');
    } catch(e) { /* migration is best-effort */ }
  },
};
