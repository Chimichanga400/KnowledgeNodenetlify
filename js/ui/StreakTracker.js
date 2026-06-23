/**
 * StreakTracker.js — Daily study streak
 * Tracks consecutive days of activity (any review or node creation).
 */
const StreakTracker = {
  _key: 'kn_streak_v1',

  _data() {
    try { return JSON.parse(localStorage.getItem(this._key)) || { streak: 0, longest: 0, lastDate: null, history: {} }; }
    catch { return { streak: 0, longest: 0, lastDate: null, history: {} }; }
  },

  _save(d) { localStorage.setItem(this._key, JSON.stringify(d)); },

  /** Call on any study activity */
  recordActivity() {
    const d    = this._data();
    const today = this._today();
    if (d.lastDate === today) return;          // already recorded today

    const yesterday = this._daysAgo(1);
    d.streak   = d.lastDate === yesterday ? d.streak + 1 : 1;
    d.longest  = Math.max(d.longest, d.streak);
    d.lastDate = today;
    d.history[today] = (d.history[today] || 0) + 1;
    this._save(d);
    this.render();
  },

  getStats() {
    const d = this._data();
    const today = this._today();
    const isActive = d.lastDate === today || d.lastDate === this._daysAgo(1);
    return {
      streak:  isActive ? d.streak : 0,
      longest: d.longest,
      history: d.history,
      lastDate: d.lastDate,
    };
  },

  render() {
    const s = this.getStats();
    document.querySelectorAll('.streak-count').forEach(el => el.textContent = s.streak);
    document.querySelectorAll('.streak-fire').forEach(el => {
      el.textContent = s.streak >= 7 ? '🔥' : s.streak >= 3 ? '⚡' : '📅';
    });
  },

  /** Build a 7-column heatmap grid for the past 12 weeks */
  buildHeatmap() {
    const d = this._data();
    const weeks = 12;
    const days  = weeks * 7;
    const cells = [];
    for (let i = days - 1; i >= 0; i--) {
      const date  = this._daysAgo(i);
      const count = d.history[date] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3;
      cells.push(`<div class="heatmap-cell level-${level}" title="${date}: ${count} activities"></div>`);
    }
    return `<div class="heatmap-grid">${cells.join('')}</div>`;
  },

  _today()        { return new Date().toISOString().slice(0, 10); },
  _daysAgo(n)     { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); },
};
