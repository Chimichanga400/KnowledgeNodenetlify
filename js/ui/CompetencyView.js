/**
 * CompetencyView.js — Subject competency test + effectiveness report
 *
 * Three combined formats:
 *  1. Timed Quiz — mock exam with a countdown timer
 *  2. AI Graded  — open-answer questions graded by AI with detailed feedback
 *  3. Report Card — visual strengths vs gaps across all subjects
 */

const CompetencyView = {
  _mode: 'report',       // 'report'|'timed'|'ai-quiz'
  _subject: 'all',
  _session: [],          // questions for current test
  _idx: 0,
  _answers: [],
  _timer: null,
  _timeLeft: 0,
  _started: false,

  init() { /* called from app.js */ },

  /** Entry point used by Study Plan / Dashboard "🏆 Test" buttons.
   *  Navigates to the competency view with a subject preselected and shows
   *  the report card scoped to that subject. The user can then run a timed
   *  quiz or AI exam from the mode buttons. */
  open(subject, mode) {
    this._subject = subject || 'all';
    this._mode    = mode || 'report';
    if (typeof App !== 'undefined' && App.navigateTo) App.navigateTo('competency');
    else this.refresh(); // fallback if router unavailable
    try {
      const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
      const filtered = this._subject === 'all' ? nodes : nodes.filter(n => n.subject === this._subject);
      if (!filtered.length) { Toast.error('No notes found for this subject yet.'); return; }
      if (this._mode === 'report') this._showReport(filtered, nodes);
    } catch (e) {
      console.error('CompetencyView.open failed:', e);
    }
  },

  refresh() {
    const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    this._renderShell(nodes);
  },

  _renderShell(nodes) {
    const container = document.getElementById('competency-body');
    if (!container) return;

    const subjects = [...new Set(nodes.map(n=>n.subject).filter(Boolean))];
    const subjectOptions = ['all', ...subjects].map(s =>
      `<option value="${s}" ${s===this._subject?'selected':''}>${s==='all'?'All Subjects':s}</option>`
    ).join('');

    container.innerHTML = `
      <!-- Mode selector -->
      <div class="competency-modes">
        <button class="comp-mode-btn ${this._mode==='report'?'active':''}"  data-mode="report">📊 Report Card</button>
        <button class="comp-mode-btn ${this._mode==='timed'?'active':''}"   data-mode="timed">⏱ Timed Quiz</button>
        <button class="comp-mode-btn ${this._mode==='ai-quiz'?'active':''}" data-mode="ai-quiz">⬡ AI Exam</button>
      </div>

      <div class="competency-toolbar">
        <select id="comp-subject" class="config-select" style="max-width:220px;">${subjectOptions}</select>
        <button class="btn-primary" id="comp-start-btn">
          ${this._mode==='report'?'Generate Report':this._mode==='timed'?'▶ Start Timed Quiz':'▶ Start AI Exam'}
        </button>
      </div>

      <div id="comp-content"></div>
    `;

    container.querySelectorAll('.comp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        container.querySelectorAll('.comp-mode-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('comp-start-btn').textContent =
          this._mode==='report'?'Generate Report':this._mode==='timed'?'▶ Start Timed Quiz':'▶ Start AI Exam';
        document.getElementById('comp-content').innerHTML = '';
      });
    });

    document.getElementById('comp-subject').addEventListener('change', e => { this._subject = e.target.value; });

    document.getElementById('comp-start-btn').addEventListener('click', () => {
      this._subject = document.getElementById('comp-subject').value;
      const filtered = this._subject==='all' ? nodes : nodes.filter(n=>n.subject===this._subject);
      if (!filtered.length) { Toast.error('No nodes in selected subject.'); return; }
      if (this._mode==='report')   this._showReport(filtered, nodes);
      else if (this._mode==='timed')   this._startTimedQuiz(filtered);
      else if (this._mode==='ai-quiz') this._startAIExam(filtered);
    });

    // Show report by default if nodes exist
    if (nodes.length && !this._started) { this._showReport(nodes, nodes); }
  },

  // ─── 1. REPORT CARD ───────────────────────────────────

  _showReport(filteredNodes, allNodes) {
    const el = document.getElementById('comp-content');

    // Per-subject breakdown
    const subjects = {};
    filteredNodes.forEach(n => {
      const s = n.subject || 'Uncategorised';
      if (!subjects[s]) subjects[s] = { nodes:[], totalQ:0, masterySum:0, due:0, weakTopics:[] };
      subjects[s].nodes.push(n);
      subjects[s].totalQ   += n.questions.length;
      subjects[s].masterySum += n.masteryScore;
      subjects[s].due      += n.dueQuestions().length;
      if (n.masteryScore < 50) subjects[s].weakTopics.push(n.title);
    });

    const overallMastery = filteredNodes.length
      ? Math.round(filteredNodes.reduce((s,n)=>s+n.masteryScore,0)/filteredNodes.length)
      : 0;

    const grade = this._grade(overallMastery);

    const subjectCards = Object.entries(subjects).map(([subj, data]) => {
      const avg = Math.round(data.masterySum / data.nodes.length);
      const g   = this._grade(avg);
      return `
        <div class="comp-subject-card">
          <div class="comp-subject-header">
            <div>
              <div class="comp-subject-name">${this._esc(subj)}</div>
              <div class="comp-subject-meta">${data.nodes.length} nodes · ${data.totalQ} questions</div>
            </div>
            <div class="comp-grade ${g.cls}">${g.letter}</div>
          </div>
          <div class="comp-bar-row">
            <div class="mastery-bar-track" style="flex:1;height:8px;">
              <div class="mastery-bar-fill" style="width:${avg}%;height:8px;"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);min-width:36px;text-align:right;">${avg}%</span>
          </div>
          ${data.weakTopics.length ? `
            <div class="comp-weak-topics">
              <span style="color:var(--red);font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;">Needs attention:</span>
              ${data.weakTopics.map(t=>`<span class="comp-topic-pill weak">${this._esc(t)}</span>`).join('')}
            </div>` : `
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--green);margin-top:8px;">✓ All topics above 50% mastery</div>`}
          ${data.due > 0 ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--accent);margin-top:6px;">⚠ ${data.due} cards due for review</div>` : ''}
          <div class="comp-node-list">
            ${data.nodes.sort((a,b)=>a.masteryScore-b.masteryScore).map(n=>`
              <div class="comp-node-row">
                <span class="comp-node-name">${this._esc(n.title)}</span>
                <div class="mastery-bar-track" style="width:80px;height:4px;"><div class="mastery-bar-fill" style="width:${n.masteryScore}%;height:4px;background:${n.masteryScore<40?'var(--red)':n.masteryScore<70?'var(--accent)':'var(--green)'};"></div></div>
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:28px;">${n.masteryScore}%</span>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');

    // Recommendations
    const weakSubjects = Object.entries(subjects).filter(([,d])=>Math.round(d.masterySum/d.nodes.length)<50).map(([s])=>s);
    const recommendations = weakSubjects.length
      ? `Focus immediate attention on: <strong>${weakSubjects.join(', ')}</strong>. These subjects are below 50% mastery and should be prioritised in your study plan.`
      : overallMastery >= 80
        ? 'Excellent preparation! Keep up the spaced repetition reviews to maintain retention before your exam.'
        : 'Good progress. Continue with daily reviews and focus on application questions to push mastery higher.';

    el.innerHTML = `
      <div class="comp-overall-card">
        <div class="comp-overall-left">
          <div class="comp-overall-grade ${grade.cls}">${grade.letter}</div>
          <div>
            <div style="font-family:var(--font-ui);font-size:22px;font-weight:800;">${grade.label}</div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">Overall Mastery: ${overallMastery}%</div>
          </div>
        </div>
        <canvas id="comp-radar" width="200" height="200"></canvas>
      </div>
      <div class="comp-recommendation">${recommendations}</div>
      <div class="comp-subjects-grid">${subjectCards}</div>
    `;

    // Draw radar / bar chart
    setTimeout(() => this._drawRadar(subjects), 50);
  },

  _drawRadar(subjects) {
    const canvas = document.getElementById('comp-radar');
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const cx   = 100, cy = 100, r = 75;
    const entries = Object.entries(subjects);
    if (!entries.length) return;

    ctx.clearRect(0, 0, 200, 200);

    // Draw grid circles
    [25,50,75,100].forEach(pct => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * pct/100, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    if (entries.length < 3) {
      // Fall back to horizontal bars for fewer than 3 subjects
      entries.forEach(([s,d], i) => {
        const avg = Math.round(d.masterySum / d.nodes.length);
        const y   = 30 + i * 50;
        ctx.fillStyle = 'rgba(240,165,0,0.15)';
        ctx.fillRect(10, y, (180 * avg/100), 28);
        ctx.fillStyle = 'var(--accent)';
        ctx.font = '11px DM Mono, monospace';
        ctx.fillText(`${s.slice(0,12)}: ${avg}%`, 14, y+18);
      });
      return;
    }

    const step = (Math.PI * 2) / entries.length;

    // Draw spokes
    entries.forEach((_, i) => {
      const a = -Math.PI/2 + i*step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();
    });

    // Draw data polygon
    ctx.beginPath();
    entries.forEach(([,d], i) => {
      const avg = Math.round(d.masterySum / d.nodes.length);
      const a   = -Math.PI/2 + i*step;
      const pr  = r * avg/100;
      i===0 ? ctx.moveTo(cx+Math.cos(a)*pr, cy+Math.sin(a)*pr)
            : ctx.lineTo(cx+Math.cos(a)*pr, cy+Math.sin(a)*pr);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(240,165,0,0.2)';
    ctx.fill();
    ctx.strokeStyle = 'var(--accent)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Labels
    ctx.fillStyle = document.documentElement.classList.contains('light-theme') ? '#333' : '#ccc';
    ctx.font = '10px DM Mono, monospace';
    ctx.textAlign = 'center';
    entries.forEach(([s,d], i) => {
      const avg = Math.round(d.masterySum / d.nodes.length);
      const a   = -Math.PI/2 + i*step;
      const lx  = cx + Math.cos(a)*(r+14);
      const ly  = cy + Math.sin(a)*(r+14);
      ctx.fillText(s.slice(0,8), lx, ly);
      ctx.fillText(`${avg}%`, lx, ly+12);
    });
  },

  // ─── 2. TIMED QUIZ ────────────────────────────────────

  _startTimedQuiz(nodes) {
    this._session = this._buildSession(nodes, 10);
    if (!this._session.length) { Toast.error('No questions available.'); return; }
    this._idx     = 0;
    this._answers = [];
    this._started = true;

    const totalSeconds = this._session.length * 60; // 1 min per question
    this._timeLeft = totalSeconds;
    this._renderTimedQuiz();
  },

  _buildSession(nodes, max) {
    const all = nodes.flatMap(n => n.questions.map(q => ({ q, node: n })));
    const shuffled = all.sort(()=>Math.random()-0.5).slice(0, max);
    return shuffled;
  },

  _renderTimedQuiz() {
    const el  = document.getElementById('comp-content');
    const total = this._session.length;
    el.innerHTML = `
      <div class="quiz-shell">
        <div class="quiz-header">
          <span class="quiz-counter" id="quiz-counter">Question ${this._idx+1} of ${total}</span>
          <div class="quiz-timer" id="quiz-timer">⏱ ${this._formatTime(this._timeLeft)}</div>
        </div>
        <div class="quiz-progress-track"><div class="quiz-progress-fill" id="quiz-prog" style="width:${(this._idx/total)*100}%"></div></div>
        <div id="quiz-card" class="quiz-card"></div>
      </div>`;
    this._renderTimedQuestion();
    this._startTimer();
  },

  _renderTimedQuestion() {
    const el  = document.getElementById('quiz-card');
    const item = this._session[this._idx];
    if (!item) { this._clearTimer(); this._showTimedResults(); return; }

    el.innerHTML = `
      <div class="quiz-node-tag">${this._esc(item.node.title)}</div>
      <div class="quiz-question">${this._esc(item.q.question)}</div>
      <textarea id="timed-answer" class="config-input" rows="4" placeholder="Type your answer…"></textarea>
      <div class="quiz-actions">
        <button class="btn-primary" id="timed-submit">Submit →</button>
        <button class="btn-secondary" id="timed-skip">Skip</button>
      </div>`;

    document.getElementById('timed-submit').addEventListener('click', () => {
      const ans = document.getElementById('timed-answer').value.trim();
      this._answers.push({ item, answer: ans, skipped: false });
      this._idx++;
      this._renderTimedQuestion();
    });
    document.getElementById('timed-skip').addEventListener('click', () => {
      this._answers.push({ item, answer: '', skipped: true });
      this._idx++;
      this._renderTimedQuestion();
    });
  },

  _startTimer() {
    this._clearTimer();
    this._timer = setInterval(() => {
      this._timeLeft--;
      const el = document.getElementById('quiz-timer');
      if (el) {
        el.textContent = `⏱ ${this._formatTime(this._timeLeft)}`;
        el.classList.toggle('low', this._timeLeft <= 30); // red + pulse in final 30s
      }
      if (this._timeLeft <= 0) { this._clearTimer(); this._showTimedResults(); }
    }, 1000);
  },

  _clearTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } },
  _formatTime(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; },

  async _showTimedResults() {
    this._clearTimer();
    const el = document.getElementById('comp-content');
    el.innerHTML = `<div style="text-align:center;padding:40px 20px;"><div class="hex-ring" style="margin:0 auto 20px;"></div><p style="font-family:var(--font-mono);color:var(--accent);">Grading your answers…</p></div>`;

    // Grade each answer
    const graded = [];
    for (const a of this._answers) {
      if (a.skipped || !a.answer) { graded.push({ ...a, result: { score:0, feedback:'Skipped.', correct:false, keyPointsMissed:[] } }); continue; }
      try {
        const r = AIService.hasApiKey()
          ? await AIService.checkAnswer(a.item.q.question, a.item.q.answer, a.answer, a.item.node.subject)
          : this._mockGrade(a.answer, a.item.q.answer);
        graded.push({ ...a, result: r });
      } catch { graded.push({ ...a, result: { score:50, feedback:'Could not grade — check answer manually.', correct: null, keyPointsMissed:[] } }); }
    }

    this._renderGradedResults(graded, 'Timed Quiz Results');
  },

  // ─── 3. AI EXAM ───────────────────────────────────────

  async _startAIExam(nodes) {
    this._session = this._buildSession(nodes, 8);
    if (!this._session.length) { Toast.error('No questions available.'); return; }
    this._idx     = 0;
    this._answers = [];
    this._started = true;
    this._renderAIExamQuestion();
  },

  _renderAIExamQuestion() {
    const el   = document.getElementById('comp-content');
    const item = this._session[this._idx];
    if (!item) { this._finishAIExam(); return; }
    const total = this._session.length;

    el.innerHTML = `
      <div class="quiz-shell">
        <div class="quiz-header">
          <span class="quiz-counter">Question ${this._idx+1} of ${total}</span>
          <span class="quiz-node-tag">${this._esc(item.node.title)}</span>
        </div>
        <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${(this._idx/total)*100}%"></div></div>
        <div class="quiz-card">
          <div class="quiz-question">${this._esc(item.q.question)}</div>
          <textarea id="ai-answer" class="config-input" rows="5" placeholder="Write a thorough answer…"></textarea>
          <div class="quiz-actions">
            <button class="btn-primary" id="ai-submit">Submit for Grading</button>
            <button class="btn-secondary" id="ai-skip">Skip</button>
          </div>
          <div id="ai-feedback" style="display:none;margin-top:20px;"></div>
        </div>
      </div>`;

    document.getElementById('ai-submit').addEventListener('click', async () => {
      const ans = document.getElementById('ai-answer').value.trim();
      if (!ans) { Toast.info('Please write an answer first.'); return; }
      const btn = document.getElementById('ai-submit');
      btn.disabled = true; btn.textContent = 'Grading…';

      let result;
      try {
        result = AIService.hasApiKey()
          ? await AIService.checkAnswer(item.q.question, item.q.answer, ans, item.node.subject)
          : this._mockGrade(ans, item.q.answer);
      } catch { result = { score:50, feedback:'Could not grade.', correct:null, keyPointsMissed:[] }; }

      this._answers.push({ item, answer: ans, skipped:false, result });

      const color = result.score>=70?'var(--green)':result.score>=40?'var(--accent)':'var(--red)';
      const fb = document.getElementById('ai-feedback');
      fb.style.display = 'block';
      fb.innerHTML = `
        <div style="background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid ${color};border-radius:var(--radius-md);padding:16px 20px;">
          <div style="font-family:var(--font-ui);font-weight:700;color:${color};margin-bottom:8px;">Score: ${result.score}/100</div>
          <p style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);margin-bottom:10px;">${this._esc(result.feedback)}</p>
          ${result.keyPointsMissed?.length?`<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Missing: ${result.keyPointsMissed.map(k=>this._esc(k)).join(', ')}</div>`:''}
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);font-family:var(--font-body);font-size:13px;color:var(--text-secondary);font-style:italic;">
            Model answer: ${this._esc(item.q.answer)}
          </div>
          <button class="btn-primary" id="ai-next" style="margin-top:16px;">${this._idx+1<this._session.length?'Next Question →':'View Results'}</button>
        </div>`;
      document.getElementById('ai-next').addEventListener('click', () => { this._idx++; this._renderAIExamQuestion(); });
    });

    document.getElementById('ai-skip').addEventListener('click', () => {
      this._answers.push({ item, answer:'', skipped:true, result:{score:0,feedback:'Skipped.',correct:false,keyPointsMissed:[]} });
      this._idx++;
      this._renderAIExamQuestion();
    });
  },

  async _finishAIExam() { this._renderGradedResults(this._answers, 'AI Exam Results'); },

  // ─── Shared results renderer ──────────────────────────

  _renderGradedResults(graded, title) {
    const el      = document.getElementById('comp-content');
    const total   = graded.length;
    const avg     = total ? Math.round(graded.reduce((s,a)=>s+(a.result?.score||0),0)/total) : 0;
    const passed  = graded.filter(a=>(a.result?.score||0)>=70).length;
    const grade   = this._grade(avg);

    const rows = graded.map((a, i) => {
      const score = a.result?.score || 0;
      const color = score>=70?'var(--green)':score>=40?'var(--accent)':'var(--red)';
      return `
        <div style="background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid ${color};border-radius:var(--radius-md);padding:14px 18px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);flex:1;">${i+1}. ${this._esc(a.item.q.question)}</div>
            <span style="font-family:var(--font-mono);font-size:13px;color:${color};font-weight:600;flex-shrink:0;">${score}/100</span>
          </div>
          ${a.skipped?'<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Skipped</span>':''}
          ${!a.skipped&&a.answer?`<div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);font-style:italic;margin-bottom:6px;">"${this._esc(a.answer.slice(0,120))}${a.answer.length>120?'…':''}"</div>`:''}
          ${a.result?.feedback?`<div style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);">${this._esc(a.result.feedback)}</div>`:''}
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="comp-overall-card" style="margin-bottom:24px;">
        <div class="comp-overall-left">
          <div class="comp-grade comp-grade-lg ${grade.cls}">${grade.letter}</div>
          <div>
            <div style="font-family:var(--font-ui);font-size:20px;font-weight:800;">${title}</div>
            <div style="font-family:var(--font-mono);font-size:13px;color:var(--accent);">${avg}/100 average · ${passed}/${total} passed (≥70%)</div>
          </div>
        </div>
        <button class="btn-secondary" id="comp-retry-btn">↺ Try Again</button>
      </div>
      <div class="notes-section-title">Question Breakdown</div>
      ${rows}
    `;
    document.getElementById('comp-retry-btn').addEventListener('click', () => {
      this._started = false; this.refresh();
    });
  },

  // ─── Helpers ──────────────────────────────────────────

  _grade(pct) {
    if (pct >= 90) return { letter:'A+', label:'Outstanding',  cls:'grade-a-plus' };
    if (pct >= 80) return { letter:'A',  label:'Excellent',    cls:'grade-a'      };
    if (pct >= 70) return { letter:'B',  label:'Good',         cls:'grade-b'      };
    if (pct >= 60) return { letter:'C',  label:'Satisfactory', cls:'grade-c'      };
    if (pct >= 50) return { letter:'D',  label:'Needs Work',   cls:'grade-d'      };
    return                { letter:'F',  label:'Critical Gap', cls:'grade-f'      };
  },

  _mockGrade(student, correct) {
    const words  = correct.toLowerCase().split(/\s+/);
    const hits   = words.filter(w => w.length>3 && student.toLowerCase().includes(w)).length;
    const score  = Math.min(100, Math.round((hits / Math.max(words.length, 1)) * 130));
    return {
      correct:       score >= 60,
      score,
      feedback:      score>=70 ? 'Good answer — key concepts covered.' : score>=40 ? 'Partially correct. See model answer for gaps.' : 'Needs improvement. Review this topic carefully.',
      keyPointsMissed: score < 70 ? ['See model answer above'] : [],
    };
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
