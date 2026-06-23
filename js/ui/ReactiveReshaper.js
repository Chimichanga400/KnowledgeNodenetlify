/**
 * ReactiveReshaper.js — Adaptation as a consequence of studying.
 *
 * The canvas reshapes itself in response to performance, with no
 * "regenerate" button. When a learner struggles with a question during
 * review or practice, the node grows a scaffold block (a simpler
 * breakdown + an easier follow-up question) right where they're stuck.
 * When they master it, the scaffold collapses away.
 *
 * A persistent, pulsing "reshaping" bar shows what the AI is doing in
 * real time, so the adaptation is visible and felt.
 *
 * Hooks: ReviewView._rate() calls ReactiveReshaper.onRating(node, question, rating).
 */
const ReactiveReshaper = {
  _bar: null,
  _busy: false,

  /* ─── Live reshaping bar ─────────────────────────── */
  _ensureBar() {
    if (this._bar && document.body.contains(this._bar)) return this._bar;
    const bar = document.createElement('div');
    bar.id = 'reshaping-bar';
    bar.className = 'reshaping-bar hidden';
    bar.innerHTML = '<span class="reshaping-orb">⬡</span><span class="reshaping-msg"></span>';
    document.body.appendChild(bar);
    this._bar = bar;
    return bar;
  },
  show(msg) {
    const bar = this._ensureBar();
    bar.querySelector('.reshaping-msg').textContent = msg;
    bar.classList.remove('hidden');
  },
  hide(delay = 0) {
    if (!this._bar) return;
    const doHide = () => this._bar && this._bar.classList.add('hidden');
    if (delay) setTimeout(doHide, delay); else doHide();
  },

  /* ─── The reactive loop ──────────────────────────── */
  /**
   * Called after every rating. Decides whether to reshape.
   * rating: 1=again 2=hard 3=good 4=easy
   */
  async onRating(node, question, rating) {
    if (!node || !question) return;

    // Track per-question performance so repeated struggle escalates.
    question._perf = question._perf || { attempts: [], scaffolded: false };
    question._perf.attempts.push(rating);
    const recent = question._perf.attempts.slice(-3);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

    // MASTERED — collapse any scaffold that was added to help.
    if (rating === 4 && question._perf.scaffoldBlockId) {
      this._collapseScaffold(node, question);
      this.show('Collapsing help for "' + this._short(question.question) + '" — mastered ✓');
      nodeStore.save(node);
      this.hide(1300);
      return;
    }

    // STRUGGLING — only reshape on a clear struggle signal, and only once
    // per question until they've moved on, to avoid spamming the AI.
    const struggling = rating <= 2 && avg <= 2.2;
    if (!struggling || question._perf.scaffolded || this._busy) return;

    if (!AIService.hasApiKey()) {
      // Without AI we can still flag the topic visually.
      question._perf.flagged = true;
      nodeStore.save(node);
      this.show('Flagged "' + this._short(question.question) + '" as a focus area');
      this.hide(1400);
      return;
    }

    this._busy = true;
    this.show('Expanding "' + this._short(question.question) + '" — you found this tricky');
    try {
      const res = await AIService.generateScaffold(node, question);
      const scaffoldBlock = node.addBlock('callout', {
        title: '✦ Simpler breakdown — added to help',
        tone: 'tip',
        html: this._esc(res.scaffold || '') + this._renderEasierQ(res.easierQuestion),
        _scaffoldFor: question.id,
      });
      question._perf.scaffolded = true;
      question._perf.scaffoldBlockId = scaffoldBlock.id;

      // Also add the easier question to the node so it surfaces in review.
      if (res.easierQuestion?.question) {
        const eq = {
          id: KnowledgeNode._generateQuestionId(),
          type: 'recall',
          question: res.easierQuestion.question,
          answer: res.easierQuestion.answer || '',
          _scaffoldFor: question.id,
        };
        node.questions.push(eq);
      }
      nodeStore.save(node);
      this.show('Added a simpler breakdown for "' + this._short(question.question) + '"');
      this.hide(1600);
      Toast.success('The canvas reshaped — a simpler breakdown was added to this node.');
    } catch (e) {
      this.show('Couldn\'t reshape — ' + (e.message || 'try again'));
      this.hide(1800);
    } finally {
      this._busy = false;
    }
  },

  _collapseScaffold(node, question) {
    const bid = question._perf.scaffoldBlockId;
    if (bid) node.removeBlock(bid);
    // remove the easier auto-question too
    node.questions = node.questions.filter(q => q._scaffoldFor !== question.id || q.id === question.id);
    question._perf.scaffolded = false;
    question._perf.scaffoldBlockId = null;
  },

  _renderEasierQ(eq) {
    if (!eq?.question) return '';
    return '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);">'
      + '<div style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:4px;">Try this easier one:</div>'
      + '<div style="font-size:13.5px;">' + this._esc(eq.question) + '</div>'
      + '<details style="margin-top:6px;"><summary style="font-size:12px;color:var(--text-muted);cursor:pointer;">Show answer</summary>'
      + '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">' + this._esc(eq.answer || '') + '</div></details></div>';
  },

  _short(s) { s = String(s || ''); return s.length > 42 ? s.slice(0, 40) + '…' : s; },
  _esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); },
};
