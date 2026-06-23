/**
 * StudyPlan.js — Core data model for study plans
 *
 * A StudyPlan contains:
 *  - metadata (exam date, daily budget, difficulty)
 *  - an array of StudyDay objects (one per calendar day)
 *  - each StudyDay has StudyTask objects (node + activity type)
 *
 * The plan engine allocates tasks by:
 *  1. Ranking nodes by urgency = (1 - mastery/100) * daysUntilExam weighting
 *  2. Spreading them across available days within daily time budget
 *  3. Respecting difficulty curve (hardest material earlier)
 */

class StudyPlan {
  constructor(data = {}) {
    this.id          = data.id          || StudyPlan._id();
    this.title       = data.title       || 'Study Plan';
    this.examDate    = data.examDate    || null;        // ISO date string
    this.dailyMins   = data.dailyMins   || 60;          // minutes per day
    this.difficulty  = data.difficulty  || 'balanced';  // 'easy-first'|'balanced'|'hard-first'
    this.subjects    = data.subjects    || [];           // subject strings to include ([] = all)
    this.createdAt   = data.createdAt   || Date.now();
    this.updatedAt   = data.updatedAt   || Date.now();
    this.days        = (data.days || []).map(d => new StudyDay(d));
    this.aiGenerated = data.aiGenerated || false;
    this.aiRationale = data.aiRationale || '';
    this.isActive    = data.isActive    !== undefined ? data.isActive : true;
  }

  /** Total tasks across all days */
  get totalTasks()     { return this.days.reduce((s,d) => s + d.tasks.length, 0); }
  get completedTasks() { return this.days.reduce((s,d) => s + d.tasks.filter(t=>t.done).length, 0); }
  get progressPct()    { return this.totalTasks ? Math.round((this.completedTasks/this.totalTasks)*100) : 0; }

  /** Days remaining until exam */
  get daysRemaining() {
    if (!this.examDate) return null;
    const diff = new Date(this.examDate) - new Date();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  /** Today's StudyDay (or null) */
  todayPlan() {
    const today = StudyPlan._dateStr(new Date());
    return this.days.find(d => d.date === today) || null;
  }

  toJSON() { return { ...this, days: this.days.map(d => d.toJSON()) }; }
  static fromJSON(o) { return new StudyPlan(o); }
  static _id()       { return 'sp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }
  static _dateStr(d) {
    // Use LOCAL date to avoid UTC off-by-one in timezones east of UTC
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
  }
}

class StudyDay {
  constructor(data = {}) {
    this.date   = data.date  || '';
    this.tasks  = (data.tasks || []).map(t => new StudyTask(t));
    this.breaks = data.breaks || [];   // [{ afterTaskIndex, durationMins }]
    this.note   = data.note  || '';
  }
  get totalMins()  { return this.tasks.reduce((s,t) => s + t.estimatedMins, 0); }
  get doneMins()   { return this.tasks.filter(t=>t.done).reduce((s,t)=>s+t.estimatedMins,0); }
  get isComplete() { return this.tasks.length > 0 && this.tasks.every(t=>t.done); }
  toJSON() { return { ...this, tasks: this.tasks.map(t=>({...t})) }; }
}

class StudyBreak {
  constructor(data = {}) {
    this.id           = data.id           || StudyPlan._id();
    this.type         = 'break';
    this.durationMins = data.durationMins || 10;
    this.label        = data.label        || 'Break';
  }
}

class StudyTask {
  constructor(data = {}) {
    this.id             = data.id             || StudyPlan._id();
    this.nodeId         = data.nodeId         || '';
    this.nodeTitle      = data.nodeTitle      || '';
    this.subject        = data.subject        || '';
    this.activityType   = data.activityType   || 'review';
    // 'review'|'recall'|'application'|'summary'|'lecture'|'competency'
    this.estimatedMins  = data.estimatedMins  || 15;
    this.done           = data.done           || false;
    this.doneAt         = data.doneAt         || null;
    this.priority       = data.priority       || 1;  // 1=low, 2=medium, 3=high
  }
}

/** PlanStore — persists one active plan per localStorage slot */
const PlanStore = {
  _key: 'kn_study_plans_v1',

  getAll() {
    try {
      const raw = localStorage.getItem(this._key);
      return raw ? JSON.parse(raw).map(StudyPlan.fromJSON) : [];
    } catch { return []; }
  },

  getActive() { return this.getAll().find(p => p.isActive) || null; },

  save(plan) {
    const all = this.getAll().filter(p => p.id !== plan.id);
    all.unshift(plan);
    localStorage.setItem(this._key, JSON.stringify(all.slice(0,5).map(p=>p.toJSON())));
    return plan;
  },

  delete(id) {
    const all = this.getAll().filter(p => p.id !== id);
    localStorage.setItem(this._key, JSON.stringify(all.map(p=>p.toJSON())));
  },

  setActive(id) {
    const all = this.getAll().map(p => { p.isActive = p.id === id; return p; });
    localStorage.setItem(this._key, JSON.stringify(all.map(p=>p.toJSON())));
  },
};

/** PlanEngine — builds task allocations from nodes */
const PlanEngine = {
  /**
   * Build a StudyPlan from user settings + node list.
   * @param {{ title, examDate, dailyMins, difficulty, subjects }} settings
   * @param {KnowledgeNode[]} nodes
   * @param {string} aiRationale
   */
  build(settings, nodes, aiRationale = '') {
    const plan = new StudyPlan({
      ...settings,
      aiRationale,
      aiGenerated: !!aiRationale,
    });

    if (!nodes.length || !settings.examDate) return plan;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // midnight LOCAL time
    const examDay  = new Date(settings.examDate);
    examDay.setHours(23,59,59,0);
    const totalDays = Math.max(1, Math.ceil((examDay - today) / 86400000));

    // Score nodes by urgency (lower mastery + closer to exam = higher priority)
    const daysLeft   = totalDays;
    const scoredNodes = nodes.map(n => {
      const masteryGap = 1 - (n.masteryScore / 100);
      const urgency    = masteryGap * (1 + (1 / Math.max(1, daysLeft)));
      return { node: n, urgency };
    });

    // Sort by difficulty setting
    if (settings.difficulty === 'hard-first') {
      scoredNodes.sort((a,b) => b.urgency - a.urgency);
    } else if (settings.difficulty === 'easy-first') {
      scoredNodes.sort((a,b) => a.urgency - b.urgency);
    } else {
      // balanced: interleave hard and easy
      scoredNodes.sort((a,b) => b.urgency - a.urgency);
      const half   = Math.ceil(scoredNodes.length / 2);
      const hard   = scoredNodes.slice(0, half);
      const easy   = scoredNodes.slice(half).reverse();
      scoredNodes.splice(0, scoredNodes.length, ...hard.flatMap((h,i) => easy[i] ? [h, easy[i]] : [h]));
    }

    // Activity types per pass (each node gets multiple passes across days)
    const activityCycle = ['review', 'recall', 'application', 'summary'];
    const minsPerActivity = { review: 20, recall: 15, application: 20, summary: 10, lecture: 25, competency: 30 };

    // Build task list
    const allTasks = [];
    scoredNodes.forEach(({ node, urgency }) => {
      const priority = urgency > 0.7 ? 3 : urgency > 0.4 ? 2 : 1;
      const passes   = priority === 3 ? 3 : priority === 2 ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        const actType = activityCycle[pass % activityCycle.length];
        allTasks.push(new StudyTask({
          nodeId:        node.id,
          nodeTitle:     node.title,
          subject:       node.subject,
          activityType:  actType,
          estimatedMins: minsPerActivity[actType],
          priority,
        }));
      }
    });

    // Add one competency test per subject near end (last 20% of days)
    const subjects = [...new Set(nodes.map(n=>n.subject).filter(Boolean))];
    subjects.forEach(subj => {
      allTasks.push(new StudyTask({
        nodeId: 'competency_' + subj,
        nodeTitle: `${subj} — Competency Test`,
        subject: subj,
        activityType: 'competency',
        estimatedMins: 30,
        priority: 3,
      }));
    });

    // Distribute tasks across days respecting dailyMins budget
    let dayIdx  = 0;
    let taskIdx = 0;
    const compTasks = allTasks.filter(t => t.activityType === 'competency');
    const regTasks  = allTasks.filter(t => t.activityType !== 'competency');

    // Place competency tests in last 20% of days
    const compStartDay = Math.max(0, Math.floor(totalDays * 0.8));

    // Fill regular days
    while (taskIdx < regTasks.length && dayIdx < compStartDay) {
      const date    = new Date(today);
      date.setDate(date.getDate() + dayIdx);
      const dayPlan = new StudyDay({ date: StudyPlan._dateStr(date) });
      let minsUsed  = 0;

      while (taskIdx < regTasks.length && minsUsed + regTasks[taskIdx].estimatedMins <= settings.dailyMins) {
        dayPlan.tasks.push(regTasks[taskIdx]);
        minsUsed += regTasks[taskIdx].estimatedMins;
        taskIdx++;
      }
      if (dayPlan.tasks.length) {
        // Add a break after every sessionMins worth of tasks
        const sessionMins = settings.sessionMins || 45;
        // Match StudySession break schedule including short sessions
        const breakMins = sessionMins < 5  ? 0
                        : sessionMins <= 10 ? 2
                        : sessionMins <= 20 ? 3
                        : sessionMins <= 25 ? 5
                        : sessionMins <= 45 ? 10
                        : sessionMins <= 60 ? 15 : 20;
        let accumulated = 0;
        const breaks = [];
        dayPlan.tasks.forEach((task, idx) => {
          accumulated += task.estimatedMins;
          if (accumulated >= sessionMins && idx < dayPlan.tasks.length - 1) {
            breaks.push({ afterTaskIndex: idx, durationMins: breakMins });
            accumulated = 0;
          }
        });
        dayPlan.breaks = breaks;
        plan.days.push(dayPlan);
      }
      dayIdx++;
    }

    // Fill competency days
    let compIdx = 0;
    for (let d = compStartDay; d < totalDays && compIdx < compTasks.length; d++) {
      const date    = new Date(today);
      date.setDate(date.getDate() + d);
      const dayPlan = new StudyDay({ date: StudyPlan._dateStr(date) });
      let minsUsed  = 0;
      while (compIdx < compTasks.length && minsUsed + compTasks[compIdx].estimatedMins <= settings.dailyMins) {
        dayPlan.tasks.push(compTasks[compIdx]);
        minsUsed += compTasks[compIdx].estimatedMins;
        compIdx++;
      }
      // Also add remaining regular tasks if any
      while (taskIdx < regTasks.length && minsUsed + regTasks[taskIdx].estimatedMins <= settings.dailyMins) {
        dayPlan.tasks.push(regTasks[taskIdx]);
        minsUsed += regTasks[taskIdx].estimatedMins;
        taskIdx++;
      }
      if (dayPlan.tasks.length) plan.days.push(dayPlan);
    }

    return plan;
  },

  /**
   * Rebalance an existing plan based on updated mastery.
   * Returns proposed changes without saving.
   */
  rebalance(plan, nodes) {
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const changes = [];

    plan.days.forEach(day => {
      if (day.date < StudyPlan._dateStr(new Date())) return; // skip past days
      day.tasks.forEach(task => {
        const node = nodeMap[task.nodeId];
        if (!node) return;

        // Mastered → upgrade to application
        if (node.masteryScore >= 80 && task.activityType === 'review') {
          changes.push({
            dayDate: day.date,
            taskId:  task.id,
            from:    'review',
            to:      'application',
            reason:  `"${node.title}" mastery now ${node.masteryScore}% — upgrading to application tasks`,
          });
        }

        // Struggling (weak questions exist + mastery < 50) → downgrade to guided
        const hasWeakQuestions = node.weakQuestions?.length > 0;
        if (hasWeakQuestions && (node.masteryScore ?? 100) < 50 && task.activityType === 'application') {
          changes.push({
            dayDate: day.date,
            taskId:  task.id,
            from:    'application',
            to:      'review',
            reason:  `"${node.title}" mastery ${node.masteryScore ?? 0}% with active struggle areas — stepping back to review`,
          });
        }

        // Not studied recently (no activity in 7+ days) → flag as urgent
        const lastAt = node.lastActivity;
        const daysSince = lastAt ? Math.floor((Date.now() - lastAt) / 86400000) : 999;
        if (daysSince >= 7 && task.activityType !== 'urgent-review') {
          changes.push({
            dayDate: day.date,
            taskId:  task.id,
            from:    task.activityType,
            to:      'review',
            reason:  `"${node.title}" not studied in ${daysSince} days — scheduling review`,
          });
        }
      });
    });

    // Deduplicate by taskId — only one change per task
    const seen = new Set();
    return changes.filter(c => {
      if (seen.has(c.taskId)) return false;
      seen.add(c.taskId);
      return true;
    });
  },

  /**
   * Check whether the student's deferred backlog still fits before the exam.
   * Returns { fits, deferred, daysLeft, message } — the caller decides how to
   * surface it. This is the safety valve so light days can't silently sink prep.
   */
  checkDeferredFit(plan) {
    let deferred = 0;
    try { if (typeof LearnerState !== 'undefined') deferred = LearnerState.deferredCount(); } catch (_) {}
    if (!deferred) return { fits: true, deferred: 0 };

    const daysLeft = plan && plan.daysUntilExam != null
      ? plan.daysUntilExam
      : (plan && plan.examDate ? Math.ceil((new Date(plan.examDate) - Date.now()) / 86400000) : null);

    // Rough capacity: assume ~3 deferred tasks can be absorbed per remaining day.
    const fits = daysLeft == null || deferred <= daysLeft * 3;
    return {
      fits,
      deferred,
      daysLeft,
      message: fits
        ? `${deferred} deferred task(s) — still room to catch up before your exam.`
        : `You have ${deferred} deferred task(s) and only ${daysLeft} day(s) left. The next few sessions need to go deep, or some topics won't be covered.`,
    };
  },

  applyRebalance(plan, changes) {
    changes.forEach(ch => {
      const day  = plan.days.find(d => d.date === ch.dayDate);
      const task = day?.tasks.find(t => t.id === ch.taskId);
      if (task) task.activityType = ch.to;
    });
    plan.updatedAt = Date.now();
    return plan;
  },
};
