/**
 * KnowledgeNode.js v2 — Core Data Model
 * Added: userImages (embedded images in notes), editableNotes fields
 */

class KnowledgeNode {
  constructor(data = {}) {
    this.id        = data.id        || KnowledgeNode._generateId();
    this.subject   = data.subject   || '';
    this.chapter   = data.chapter   || '';
    this.title     = data.title     || 'Untitled Node';
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();

    this.sourceImages = data.sourceImages || [];
    this.rawOCR       = data.rawOCR       || '';

    // Structured notes (AI-generated, user-editable)
    // definitions: [{ term, examples, description }]  (examples is new optional field)
    this.definitions     = (data.definitions || []).map(d => ({
      term: d.term || '', examples: d.examples || '', description: d.description || ''
    }));

    this.formulas        = data.formulas       || [];

    // procedures: [{ id, title, appliesTo, steps:[], notes }]  (new structured format)
    // Migrate legacy flat string array automatically
    this.procedures      = (data.procedures || []).map((p, i) => {
      if (typeof p === 'string') {
        // Legacy: flat string — wrap in first procedure group or add as step
        return null; // handled below
      }
      return p;
    }).filter(Boolean);

    // Handle legacy flat procedure strings by grouping into one procedure
    const legacySteps = (data.procedures || []).filter(p => typeof p === 'string');
    if (legacySteps.length && !this.procedures.length) {
      this.procedures = [{
        id: 'proc_' + Math.random().toString(36).slice(2,8),
        title: 'Procedure',
        appliesTo: '',
        steps: legacySteps,
        notes: '',
      }];
    }

    this.commonMistakes  = data.commonMistakes || [];

    // tables: [{ id, title, columns:[], rows:[[]] }]
    this.tables = data.tables || [];
    this.summary         = data.summary        || '';
    this.sectionOrder    = Array.isArray(data.sectionOrder) ? data.sectionOrder : [];

    // User-added content
    this.userNotes  = data.userNotes  || '';
    this.sourceBookmark = data.sourceBookmark || '';  // where the user left off in the physical handbook
    this.sourcePage = (typeof data.sourcePage === 'number' && data.sourcePage > 0) ? data.sourcePage : null;  // handbook page where this node's content starts
    // userImages: [{ id, base64, caption, width, responseBlock: { type, content, modelAnswer } }]
    this.userImages = (data.userImages || []).map(img => ({
      id: img.id, base64: img.base64 || '', caption: img.caption || '',
      width: img.width || 50,
      responseBlock: img.responseBlock || null,  // null = no response block
    }));

    // Questions (AI-generated + user-added)
    this.questions       = data.questions      || [];

    // SRS state
    this.srsState        = data.srsState       || {};

    // Mastery
    this.masteryScore    = data.masteryScore   || 0;
    this.reviewCount     = data.reviewCount    || 0;
    this.lastReviewed    = data.lastReviewed   || null;

    // Subject category (auto-detected by AI or set manually)
    // Values: 'accounting' | 'law' | 'programming' | 'science' | 'medicine' | 'history' | 'language' | 'maths' | 'general'
    this.subjectCategory = data.subjectCategory || null;

    // Note template (set by user, AI rewrites content when changed)
    this.noteTemplate    = data.noteTemplate    || 'standard';

    // Worked examples — uploaded by student for Socratic tutoring
    // [{ id, title, question, solution, steps:[], images:[], addedAt }]
    this.workedExamples  = data.workedExamples  || [];

    // Session memory — compact log of study sessions for AI context
    // [{ date, summary, strengths:[], gaps:[], score }]
    this.sessionLog      = data.sessionLog      || [];
    this.aiCorrections   = Array.isArray(data.aiCorrections)  ? data.aiCorrections  : [];
    this.weakQuestions   = Array.isArray(data.weakQuestions)  ? data.weakQuestions  : [];
    this.activitySummary = data.activitySummary || '';

    // Per-profile cached content — stores blocks/notes for each learner level
    // so switching profiles doesn't require a new API call
    // { primary: { blocks: [...] }, high: { blocks: [...] }, college: { blocks: [...] }, pro: { blocks: [...] } }
    this.profileCache    = data.profileCache    || {};
    this.cornellData     = data.cornellData     || null;
    this.outlineData     = data.outlineData     || null;
    this.feynmanData2    = data.feynmanData2    || null;

    // Processing
    this.processingDetail = data.processingDetail || 'standard';
    this.processingStatus = data.processingStatus || 'pending';
    this.processingError  = data.processingError  || null;

    // Note-taking method
    this.noteMethod          = data.noteMethod          || 'standard';
    this.feynmanData         = data.feynmanData         || null;

    // Study method data
    this.understandingAnswers = data.understandingAnswers || null;
    this.lastRecallGaps       = data.lastRecallGaps       || null;

    // Module outcomes
    this.moduleOutcomes = data.moduleOutcomes || []; // [{ id, text, achieved }]

    /* ─── BLOCK CANVAS (new core) ─────────────────────────
       A node is now an ordered list of blocks. Each block:
         { id, type, ...typeSpecificData }
       Block types: prose, callout, definition, table, formula,
         procedure, code, calc, webpreview, quiz, match, diagram, flashcards
       If a node has no blocks but has legacy fixed fields, we
       migrate those fields into blocks so nothing is ever lost. */
    this.learnerProfile = data.learnerProfile || 'college'; // primary|high|college|pro
    // Cached AI lectures keyed by learner profile, e.g. { college: "script…" }.
    // Lets us reuse a previously-generated lecture instead of re-calling the AI
    // until the user explicitly regenerates (or switches profile level).
    this.lectureCache = (data.lectureCache && typeof data.lectureCache === 'object') ? data.lectureCache : {};
    // Cached slide-format lectures, keyed by learner profile (separate from prose).
    this.lectureSlidesCache = (data.lectureSlidesCache && typeof data.lectureSlidesCache === 'object') ? data.lectureSlidesCache : {};
    this.lecturePosition = (data.lecturePosition && typeof data.lecturePosition === "object") ? data.lecturePosition : {};
    // Cached first-time guided-study intros, keyed by learner profile. Returning
    // intros are personalised and never cached.
    this.introCache = (data.introCache && typeof data.introCache === 'object') ? data.introCache : {};
    this.introReturnCache = (data.introReturnCache && typeof data.introReturnCache === 'object') ? data.introReturnCache : {};
    this.ucQuestionCache = Array.isArray(data.ucQuestionCache) ? data.ucQuestionCache : null;
    this.blocks = Array.isArray(data.blocks) ? data.blocks.map(b => ({ id: b.id || KnowledgeNode._generateBlockId(), ...b })) : [];
    if (!this.blocks.length && this._hasLegacyContent()) {
      this.blocks = this._migrateToBlocks();
    }
  }

  /* ─── BLOCK HELPERS ─────────────────────────────────── */
  _hasLegacyContent() {
    return (this.definitions?.length || this.formulas?.length ||
            this.procedures?.length || this.tables?.length ||
            this.commonMistakes?.length || this.summary);
  }

  /** Convert old fixed-field content into blocks (lossless). */
  _migrateToBlocks() {
    const out = [];
    const mk = (type, data) => out.push({ id: KnowledgeNode._generateBlockId(), type, ...data });
    if (this.definitions?.length)
      mk('definition', { title: 'Key Definitions', items: this.definitions });
    (this.tables || []).forEach(t =>
      mk('table', { title: t.title || 'Table', columns: t.columns || [], rows: t.rows || [] }));
    if (this.formulas?.length)
      mk('formula', { title: 'Formulas & Equations', items: this.formulas });
    (this.procedures || []).forEach(p =>
      mk('procedure', { title: p.title || 'Procedure', appliesTo: p.appliesTo || '', steps: p.steps || [], notes: p.notes || '' }));
    if (this.commonMistakes?.length)
      mk('callout', { title: 'Common Mistakes', tone: 'warn', html: '<ul>' + this.commonMistakes.map(m => '<li>' + m + '</li>').join('') + '</ul>' });
    if (this.summary)
      mk('prose', { title: 'Summary', html: this.summary });
    return out;
  }

  /** Add a block, persisting nothing (caller saves). */
  addBlock(type, data = {}, index = -1) {
    const block = { id: KnowledgeNode._generateBlockId(), type, ...data };
    if (index < 0 || index >= this.blocks.length) this.blocks.push(block);
    else this.blocks.splice(index, 0, block);
    this.updatedAt = Date.now();
    return block;
  }
  removeBlock(id) {
    this.blocks = this.blocks.filter(b => b.id !== id);
    this.updatedAt = Date.now();
  }
  moveBlock(id, dir) {
    const i = this.blocks.findIndex(b => b.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= this.blocks.length) return;
    [this.blocks[i], this.blocks[j]] = [this.blocks[j], this.blocks[i]];
    this.updatedAt = Date.now();
  }
  updateBlock(id, patch) {
    const b = this.blocks.find(x => x.id === id);
    if (b) { Object.assign(b, patch); this.updatedAt = Date.now(); }
  }

  computeMastery() {
    const cards = Object.values(this.srsState);
    if (!cards.length) return 0; // no SRS history → genuinely 0, never stale stored value

    // Mastery blends three signals per card, then averages across cards:
    //   • durability  — how many successful repetitions (capped at 4 → full credit).
    //                    A card answered correctly once is NOT mastered; it needs to
    //                    survive several spaced reviews. This is the main fix: ease
    //                    alone treated a single "Good" as ~100%.
    //   • difficulty  — the SM-2 ease factor, normalised (1.3→0, 2.5→~1). A card the
    //                    learner keeps finding hard scores lower even if repeated.
    //   • freshness   — a card whose review is badly overdue has likely decayed, so
    //                    it loses a little credit until re-reviewed.
    const now = Date.now();
    const per = cards.map(c => {
      const reps       = Math.max(0, c.repetitions || 0);
      const durability = Math.min(1, reps / 4);                 // 0..1, full at 4 reps
      const difficulty = Math.min(1, Math.max(0, (c.ease - 1.3) / 1.2)); // 0..1
      // Weight durability more heavily than raw ease — knowing it over time matters most.
      let score = 0.65 * durability + 0.35 * difficulty;
      // Decay: if more than one interval overdue, shave up to 20%.
      if (reps > 0 && c.nextReview && c.interval) {
        const overdueDays = (now - c.nextReview) / 86400000;
        if (overdueDays > c.interval) score *= 0.8;
      }
      return Math.min(1, Math.max(0, score));
    });

    const avg = per.reduce((s, v) => s + v, 0) / per.length;
    return Math.min(100, Math.max(0, Math.round(avg * 100)));
  }

  dueQuestions() {
    const now = Date.now();
    return this.questions.filter(q => {
      const s = this.srsState[q.id];
      // Never reviewed — NOT due yet. Only becomes due after first rating.
      if (!s || s.repetitions === 0) return false;
      return s.nextReview <= now;
    });
  }

  /** Questions that have never been reviewed — shown as "New" not "Due" */
  newQuestions() {
    return this.questions.filter(q => {
      const s = this.srsState[q.id];
      return !s || s.repetitions === 0;
    });
  }

  recordRating(questionId, rating) {
    const card = this.srsState[questionId] || SRSCard.initial();
    this.srsState[questionId] = SpacedRepetition.update(card, rating);
    this.reviewCount++;
    this.lastReviewed = Date.now();
    this.masteryScore = this.computeMastery();
    this.updatedAt = Date.now();
  }

  /** Reset all progress — mastery, SRS state, review history, weak questions */
  resetProgress() {
    this.srsState      = {};
    this.masteryScore  = 0;
    this.reviewCount   = 0;
    this.lastReviewed  = null;
    this.weakQuestions = [];
    this.sessionLog    = [];
    this.activitySummary = '';
    this.updatedAt     = Date.now();
  }

  /** Clear AI-generated content that derives from this node's source/blocks,
   *  so it regenerates after the content is edited. Call after content edits. */
  invalidateContentCaches() {
    this.introCache      = {};    // Prime step intro regenerates
    this.introReturnCache = {}; // returning-visit intro regenerates too
    this.profileCache    = {};    // block layouts per level regenerate
    this.lectureCache    = {};    // lecture script regenerates
    this.lectureSlidesCache = {}; // slide lecture regenerates too
    this.ucQuestionCache = null;  // understanding-check questions regenerate
    // Clear saved lecture playback position (the script will change)
    try {
      const all = JSON.parse(localStorage.getItem('kn_lecture_pos') || '{}');
      Object.keys(all).forEach(k => { if (k.startsWith(this.id + ':')) delete all[k]; });
      localStorage.setItem('kn_lecture_pos', JSON.stringify(all));
    } catch(e) { /* best-effort */ }
    this.updatedAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id, subject: this.subject, chapter: this.chapter,
      title: this.title, summary: this.summary, userNotes: this.userNotes,
      sourceBookmark: this.sourceBookmark,
      sourcePage: this.sourcePage,
      sectionOrder: this.sectionOrder,
      rawOCR: this.rawOCR, subjectCategory: this.subjectCategory,
      noteTemplate: this.noteTemplate, cornellData: this.cornellData,
      outlineData: this.outlineData, feynmanData2: this.feynmanData2,
      definitions: this.definitions, tables: this.tables,
      formulas: this.formulas, procedures: this.procedures,
      commonMistakes: this.commonMistakes, questions: this.questions,
      blocks: this.blocks, moduleOutcomes: this.moduleOutcomes,
      workedExamples: this.workedExamples, sessionLog: this.sessionLog,
      aiCorrections: this.aiCorrections, weakQuestions: this.weakQuestions,
      activitySummary: this.activitySummary,
      profileCache: this.profileCache,
      lectureCache: this.lectureCache,
      lectureSlidesCache: this.lectureSlidesCache,
      lecturePosition: this.lecturePosition,
      introCache: this.introCache,
      introReturnCache: this.introReturnCache,
      ucQuestionCache: this.ucQuestionCache,
      processingStatus: this.processingStatus, processingDetail: this.processingDetail,
      learnerProfile: this.learnerProfile, imageAnswers: this.imageAnswers,
      annotations: this.annotations, imageRefs: this.imageRefs,
      createdAt: this.createdAt, updatedAt: this.updatedAt,
      lastStudied: this.lastStudied, masteryScore: this.masteryScore,
      totalAttempts: this.totalAttempts, correctAttempts: this.correctAttempts,
      difficulty: this.difficulty, tags: this.tags,
    };
  }
  static fromJSON(o) {
    const node = new KnowledgeNode(o);
    // Recompute mastery on load so stored value never drifts from srsState.
    // Catches drift from concurrent-save races or failed writes in past sessions.
    if (Object.keys(node.srsState).length) {
      node.masteryScore = node.computeMastery();
    }
    return node;
  }

  static _generateId() {
    return 'kn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
  }
  static _generateQuestionId() {
    return 'q_' + Math.random().toString(36).slice(2,9);
  }
  static _generateImageId() {
    return 'img_' + Math.random().toString(36).slice(2,9);
  }
  static _generateBlockId() {
    return 'blk_' + Math.random().toString(36).slice(2,9);
  }

  /**
   * Sanitize source text for display. Some older nodes accidentally stored the
   * model's JSON-wrapped output in rawOCR (e.g. ```json {"title":...,"body":...}).
   * This unwraps that to readable text. Safe to call on already-clean text.
   */
  static cleanSourceText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let t = raw.trim();
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    t = t.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    // If it parses as a notes object, pull out the human-readable fields
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const obj = JSON.parse(t);
        const o   = Array.isArray(obj) ? (obj[0] || {}) : obj;
        const parts = [];
        if (o.title) parts.push(String(o.title));
        const bodyVal = o.body || o.text || o.content || o.summary || o.rawOCR;
        if (bodyVal) parts.push(String(bodyVal));
        if (parts.length) t = parts.join('\n\n');
      } catch (e) {
        // Not valid JSON (often truncated). Best-effort: pull a "body"/"text" field.
        const m = t.match(/"(?:body|text|content)"\s*:\s*"([\s\S]*?)"\s*[,}]/);
        if (m) t = m[1];
      }
    }
    // Un-escape literal \n sequences
    t = t.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    return t;
  }
}

const SRSCard = {
  initial() { return { ease:2.5, interval:0, repetitions:0, nextReview:Date.now() }; }
};
