/**
 * LearnerContext.js — Central AI context layer
 *
 * One source of truth that every AI feature draws from.
 * Instead of each tab/feature building its own context string
 * from scratch, they all call LearnerContext.forNode(node) or
 * LearnerContext.forSession() and get a consistent, complete
 * picture of the learner and the material.
 *
 * WHAT IT KNOWS:
 *   Per node  — full source material, learner profile, mastery,
 *               weak questions, session history, exam style
 *   Global    — overall weak topics, study streak, due count,
 *               cross-node patterns
 *
 * HARD RULES enforced in every context string:
 *   1. AI must only use source material — never outside knowledge
 *   2. Profile changes language/style — never content volume
 *   3. Worked examples stay faithful to source
 *   4. Questions mirror uploaded exam style where available
 */

const LearnerContext = {
  _sessionCache: null, // TTL cache — rebuilt at most every 10s

  /* ─────────────────────────────────────────────────────────
     NODE CONTEXT
     Complete context for one node — used by Notes, Questions,
     Examples, Review (per card), Guided Study, Socratic Tutor
  ───────────────────────────────────────────────────────── */
  forNode(node, options = {}) {
    if (!node) return '';

    const {
      includeSource    = true,   // full definitions, tables, procedures
      includeWeakness  = true,   // which questions the learner struggles with
      includeHistory   = true,   // past session summaries
      includeExamStyle = true,   // uploaded exam paper patterns
      maxSourceChars   = 6000,   // keep prompts from bloating
    } = options;

    const parts = [];

    // ── 1. Hard rules — injected first so model sees them immediately ──
    parts.push(this._hardRules());

    // ── 2. Learner profile ──
    parts.push(AIService.profileContext(node.learnerProfile || 'college'));

    // ── 3. Node identity ──
    parts.push(
      `TOPIC: "${node.title}"`,
      `SUBJECT: ${node.subject || 'General'}`,
      node.chapter ? `CHAPTER: ${node.chapter}` : '',
    );

    // ── 4. Full source material ──
    if (includeSource) {
      const source = this._buildSourceText(node, maxSourceChars);
      if (source) parts.push('SOURCE MATERIAL (use only this — do not add outside knowledge):\n' + source);
    }

    // ── 5. Learner weakness on this node ──
    if (includeWeakness) {
      const weak = LearnerMemory.getWeakQuestionsText(node);
      if (weak) parts.push('LEARNER STRUGGLES WITH:\n' + weak);

      const mastery = node.masteryScore ?? null;
      if (mastery !== null) {
        parts.push(`CURRENT MASTERY: ${mastery}% — ${this._masteryLabel(mastery)}`);
      }
    }

    // ── 5b. Past AI corrections — must always be included ──
    if (typeof AICorrections !== 'undefined') {
      const corrections = AICorrections.forPrompt(node);
      if (corrections) parts.push(corrections);
    }

    // ── 6. Session history — use activitySummary first, then log ──
    if (includeHistory) {
      const latest = LearnerMemory.getNodeActivitySummary(node);
      if (latest) parts.push('LAST ACTIVITY: ' + latest);

      const history = this._sessionHistory(node, 3);
      if (history) parts.push('RECENT STUDY SESSIONS:\n' + history);
    }

    // ── 7. Exam style for this subject ──
    if (includeExamStyle) {
      const examStyle = this._examStyle(node.subject);
      if (examStyle) parts.push('EXAM STYLE FOR THIS SUBJECT:\n' + examStyle);
    }

    return parts.filter(Boolean).join('\n\n');
  },

  /* ─────────────────────────────────────────────────────────
     SESSION CONTEXT
     Cross-node context — used by Review, Study Plan,
     AI Director, Gap Analysis
  ───────────────────────────────────────────────────────── */
  forSession(options = {}) {
    const { maxNodes = 10 } = options;
    const parts = [];

    parts.push(this._hardRules());

    try {
      const allNodes = nodeStore.getAll();
      if (!allNodes.length) return '';

      // Overall learner stats
      const stats        = nodeStore.getStats();
      const dueNodes     = nodeStore.getDueNodes().slice(0, maxNodes);
      const weakNodes    = allNodes
        .filter(n => (n.masteryScore ?? 100) < 60)
        .sort((a, b) => (a.masteryScore ?? 100) - (b.masteryScore ?? 100))
        .slice(0, maxNodes);
      const strongNodes  = allNodes
        .filter(n => (n.masteryScore ?? 0) >= 80)
        .slice(0, 5);

      parts.push(
        `LEARNER OVERVIEW:\n`
        + `- Total nodes: ${stats.total}\n`
        + `- Overall mastery: ${stats.mastery}%\n`
        + `- Questions due today: ${stats.due}`
      );

      if (weakNodes.length) {
        parts.push(
          'WEAK TOPICS (needs most attention):\n'
          + weakNodes.map(n =>
              `- "${n.title}" (${n.subject || 'general'}) — `
              + `mastery ${n.masteryScore ?? 0}%, `
              + `${n.dueQuestions?.().length || 0} due`
            ).join('\n')
        );
      }

      if (dueNodes.length) {
        parts.push(
          'DUE FOR REVIEW TODAY:\n'
          + dueNodes.map(n => `- "${n.title}" (${n.subject || 'general'})`).join('\n')
        );
      }

      if (strongNodes.length) {
        parts.push(
          'STRONG TOPICS (well understood):\n'
          + strongNodes.map(n => `- "${n.title}" — mastery ${n.masteryScore}%`).join('\n')
        );
      }

      // Worked examples the learner has saved (titles + counts only, to stay
      // cheap on tokens). This lets the coach actually point to specific
      // examples instead of telling the student to go hunt manually.
      const withExamples = allNodes
        .filter(n => Array.isArray(n.workedExamples) && n.workedExamples.length)
        .slice(0, maxNodes);
      if (withExamples.length) {
        const totalEx = allNodes.reduce((s, n) => s + (n.workedExamples?.length || 0), 0);
        parts.push(
          `WORKED EXAMPLES AVAILABLE (${totalEx} total — you CAN see these):\n`
          + withExamples.map(n =>
              `- "${n.title}": `
              + n.workedExamples.slice(0, 6).map(ex => `"${ex.title || 'Untitled example'}"`).join(', ')
            ).join('\n')
          + '\nWhen the student asks about examples, reference these by name and topic. '
          + 'They live in each topic\u2019s Examples tab in the Library, and Guided Study walks through them.'
        );
      } else {
        parts.push(
          'WORKED EXAMPLES: The student has not saved any worked examples yet. '
          + 'They can add them by scanning a solved example into a topic (it lands in that topic\u2019s Examples tab).'
        );
      }

      // Study plan (if one exists)
      try {
        const plan = (typeof PlanStore !== 'undefined') ? PlanStore.getActive() : null;
        if (plan) {
          const daysLeft = plan.examDate
            ? Math.ceil((new Date(plan.examDate) - new Date()) / 86400000)
            : null;
          const todayStr = new Date().toISOString().slice(0, 10);
          const todaySessions = (plan.sessions || []).filter(s => s.date === todayStr);
          parts.push(
            'STUDY PLAN: "' + plan.title + '"'
            + (plan.examDate ? ' — exam/target date: ' + plan.examDate
               + (daysLeft !== null ? ' (' + daysLeft + ' days away)' : '') : '')
            + '\nDaily study time: ' + (plan.dailyMinutes || '?') + ' min/day'
            + (todaySessions.length
                ? "\nToday's scheduled sessions: "
                  + todaySessions.map(s => '"' + s.nodeTitle + '" (' + (s.durationMinutes || '?') + ' min)').join(', ')
                : '\nNo sessions scheduled for today.')
            + '\nOverall plan progress: '
            + (plan.sessions || []).filter(s => s.completed).length
            + '/' + (plan.sessions || []).length + ' sessions completed.'
          );
        } else {
          parts.push('STUDY PLAN: No active study plan. The student can create one in the Study Plan tab.');
        }
      } catch (e) { /* plan access is optional */ }

      // Shared learner memory — Director decisions, recent Coach topics, inferred profile.
      // Both the Director and Coach write here; both read here. One source of truth.
      try {
        const sharedBlock = (typeof LearnerState !== 'undefined') ? LearnerState.toPromptBlock() : '';
        if (sharedBlock) parts.push(sharedBlock);
      } catch(e) { /* optional */ }

    } catch(e) {
      console.warn('[LearnerContext] forSession error:', e);
    }

    const _ctx = parts.filter(Boolean).join('\n\n');
    this._sessionCache = { ctx: _ctx, at: Date.now() };
    return _ctx;
  },

  /* ─────────────────────────────────────────────────────────
     SPECIALISED BUILDERS
     Thin wrappers used by specific features
  ───────────────────────────────────────────────────────── */

  /** For Review cards — lightweight, only what's needed per question */
  forReviewCard(node, question) {
    return this.forNode(node, {
      includeSource:    true,
      includeWeakness:  true,
      includeHistory:   false,  // not needed per-card
      includeExamStyle: false,
      maxSourceChars:   3000,
    }) + '\n\nCURRENT QUESTION:\n'
      + `Q: "${question.question}"\n`
      + `Model answer: "${question.answer}"`;
  },

  /** For question generation — needs full source + exam style */
  forQuestionGen(node) {
    return this.forNode(node, {
      includeSource:    true,
      includeWeakness:  true,
      includeHistory:   false,
      includeExamStyle: true,
      maxSourceChars:   6000,
    });
  },

  /** For Socratic tutor — needs source + history + weakness */
  forSocraticTutor(node, workedExample) {
    const base = this.forNode(node, {
      includeSource:    true,
      includeWeakness:  true,
      includeHistory:   true,
      includeExamStyle: false,
      maxSourceChars:   4000,
    });

    if (!workedExample) return base;

    return base + '\n\n'
      + `WORKED EXAMPLE — "${workedExample.title}":\n`
      + `Q: ${workedExample.question}\n`
      + `Solution: ${workedExample.solution}`
      + (workedExample.steps?.length
          ? '\nSteps:\n' + workedExample.steps.map((s, i) => `${i+1}. ${s}`).join('\n')
          : '');
  },

  /** For Guided Study — full context, all sections */
  forGuidedStudy(node) {
    return this.forNode(node, {
      includeSource:    true,
      includeWeakness:  true,
      includeHistory:   true,
      includeExamStyle: true,
      maxSourceChars:   6000,
    });
  },

  /** For note generation / restructure — source faithful, no weakness needed */
  forNoteGeneration(node, meta = {}) {
    return this.forNode(node, {
      includeSource:    true,
      includeWeakness:  false,
      includeHistory:   false,
      includeExamStyle: false,
      maxSourceChars:   8000,
    });
  },

  /* ─────────────────────────────────────────────────────────
     PRIVATE HELPERS
  ───────────────────────────────────────────────────────── */

  /** Hard rules injected into every single prompt */
  _hardRules() {
    return [
      'ABSOLUTE RULES — follow these in every response:',
      '1. SOURCE ONLY: Use ONLY information from the SOURCE MATERIAL provided. Never add facts, examples, or explanations from outside knowledge.',
      '2. COMPLETENESS: Never skip or summarise away content from the source. Volume must be preserved.',
      '3. PROFILE: Only the language and explanation style changes per learner level — never the content.',
      '4. EXAMPLES: Worked examples must be drawn from the source material. Do not invent scenarios.',
      '5. PLAIN TEXT: Reply in plain conversational text unless JSON is explicitly requested.',
    ].join('\n');
  },

  /** Builds a complete source text string from all content in a node */
  _buildSourceText(node, maxChars = 6000) {
    const sections = [];

    // Blocks (new format) — most complete source
    if (node.blocks?.length) {
      node.blocks.forEach(b => {
        switch (b.type) {
          case 'prose':
            if (b.html) sections.push(b.title ? `## ${b.title}\n${b.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}` : b.html.replace(/<[^>]+>/g, ' ').trim());
            break;
          case 'definition':
            if (b.items?.length) {
              sections.push((b.title ? `## ${b.title}\n` : '') + b.items.map(d => `${d.term}: ${d.description}${d.examples ? ' (e.g. ' + d.examples + ')' : ''}`).join('\n'));
            }
            break;
          case 'table':
            if (b.columns?.length && b.rows?.length) {
              sections.push((b.title ? `## ${b.title}\n` : '') + [b.columns.join(' | '), ...b.rows.map(r => r.join(' | '))].join('\n'));
            }
            break;
          case 'formula':
            if (b.items?.length) {
              sections.push((b.title ? `## ${b.title}\n` : '') + b.items.map(f => `${f.expression}: ${f.description}${f.constraints ? ' [' + f.constraints + ']' : ''}`).join('\n'));
            }
            break;
          case 'procedure':
            if (b.steps?.length) {
              sections.push((b.title ? `## ${b.title}\n` : '') + b.steps.map((s, i) => `${i+1}. ${s}`).join('\n'));
            }
            break;
          case 'callout':
            if (b.html) sections.push(b.html.replace(/<[^>]+>/g, ' ').trim());
            break;
        }
      });
    }

    // Legacy fields — fallback for older nodes
    if (!sections.length) {
      if (node.definitions?.length) {
        sections.push('DEFINITIONS:\n' + node.definitions.map(d => `${d.term}: ${d.description}${d.examples ? ' (e.g. ' + d.examples + ')' : ''}`).join('\n'));
      }
      if (node.formulas?.length) {
        sections.push('FORMULAS:\n' + node.formulas.map(f => `${f.expression}: ${f.description}`).join('\n'));
      }
      if (node.procedures?.length) {
        sections.push('PROCEDURES:\n' + node.procedures.map(p => `${p.title}:\n` + p.steps.map((s, i) => `${i+1}. ${s}`).join('\n')).join('\n\n'));
      }
      if (node.tables?.length) {
        sections.push('TABLES:\n' + node.tables.map(t => `${t.title}:\n` + [t.columns.join(' | '), ...t.rows.map(r => r.join(' | '))].join('\n')).join('\n\n'));
      }
      if (node.summary) sections.push('SUMMARY:\n' + node.summary);
    }

    // Raw OCR as last resort
    if (!sections.length && node.rawOCR) {
      sections.push('RAW SOURCE:\n' + node.rawOCR);
    }

    // The learner's own typed notes ("My Notes") are authored content and must
    // count as source material — otherwise a node whose content lives here reads
    // as empty and generators report "No source material provided."
    if (node.userNotes && node.userNotes.trim()) {
      sections.push('MY NOTES:\n' + node.userNotes.trim());
    }

    return sections.join('\n\n').slice(0, maxChars);
  },

  /** Returns a short string describing which questions the learner struggles with */
  _weakQuestions(node) {
    if (!node.questions?.length || !node.srsState) return '';
    const weak = node.questions.filter(q => {
      const s = node.srsState[q.id];
      return s && (s.easeFactor < 2.2 || s.interval <= 1);
    });
    if (!weak.length) return '';
    return weak.slice(0, 5).map(q => `- "${q.question}"`).join('\n');
  },

  /** Returns mastery label */
  _masteryLabel(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good, some gaps';
    if (score >= 50) return 'developing';
    return 'needs significant work';
  },

  /** Returns last N session summaries as a string */
  _sessionHistory(node, n = 3) {
    const log = (node.sessionLog || []).slice(-n);
    if (!log.length) return '';
    return log.map(s => `- ${s.date}: ${s.summary}`).join('\n');
  },

  /** Returns exam style patterns for a subject from localStorage */
  _examStyle(subject) {
    if (!subject) return '';
    try {
      const key    = 'kn_exam_style_' + subject.toLowerCase().replace(/\s+/g, '_');
      const stored = JSON.parse(localStorage.getItem(key) || '{"papers":[]}');
      if (!stored.papers?.length) return '';
      const latest = stored.papers[stored.papers.length - 1];
      const a      = latest.analysis;
      if (!a) return '';
      const parts = [];
      if (a.questionTypes?.length)  parts.push('Question types: ' + a.questionTypes.join(', '));
      if (a.markAllocation)         parts.push('Mark allocation: ' + a.markAllocation);
      if (a.keyThemes?.length)      parts.push('Key themes: ' + a.keyThemes.join(', '));
      if (a.difficulty)             parts.push('Difficulty: ' + a.difficulty);
      return parts.join('\n');
    } catch(e) {
      return '';
    }
  },
};
