/**
 * SpacedRepetition.js — SM-2 Algorithm Implementation
 *
 * Based on the SuperMemo 2 algorithm.
 * Rating scale: 1=Again, 2=Hard, 3=Good, 4=Easy
 *
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

const SpacedRepetition = {
  /**
   * Update a card's SRS state based on a rating.
   * @param {SRSCard} card
   * @param {1|2|3|4} rating
   * @returns {SRSCard} Updated card (new object)
   */
  update(card, rating) {
    // Map our 1-4 scale to SM-2's 0-5 quality scale
    const qualityMap = { 1: 1, 2: 2, 3: 4, 4: 5 };
    const q = qualityMap[rating] ?? 4;

    let { ease, interval, repetitions } = card;

    if (q < 3) {
      // Failed — reset repetition
      repetitions = 0;
      interval = 1;
    } else {
      // Passed
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * ease);
      }
      repetitions += 1;
    }

    // Update ease factor
    ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ease = Math.max(1.3, ease);   // never drop below 1.3

    const nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;

    return { ease, interval, repetitions, nextReview };
  },

  /**
   * Get all due question-node pairs for a review session.
   * @param {KnowledgeNode[]} nodes
   * @returns {{ node: KnowledgeNode, question: object, state: SRSCard|null }[]}
   */
  buildSession(nodes) {
    const now = Date.now();
    const items = [];

    nodes.forEach(node => {
      node.questions.forEach(q => {
        const state = node.srsState[q.id] || null;
        const isDue = !state || state.nextReview <= now;
        if (isDue) {
          items.push({ node, question: q, state });
        }
      });
    });

    // Shuffle
    return SpacedRepetition._shuffle(items);
  },

  /**
   * Prioritize new cards and overdue first, then by how overdue they are.
   * @param {KnowledgeNode[]} nodes
   */
  buildPrioritizedSession(nodes) {
    const now = Date.now();
    const items = SpacedRepetition.buildSession(nodes);

    return items.sort((a, b) => {
      const aOverdue = !a.state ? -Infinity : a.state.nextReview - now;
      const bOverdue = !b.state ? -Infinity : b.state.nextReview - now;
      return aOverdue - bOverdue;   // most overdue first
    });
  },

  /** Fisher-Yates shuffle */
  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  /**
   * Days until next review for a card.
   * @param {SRSCard} state
   * @returns {number}
   */
  daysUntil(state) {
    if (!state) return 0;
    const ms = state.nextReview - Date.now();
    return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  },

  /**
   * Human-readable interval label.
   */
  intervalLabel(state) {
    if (!state || state.repetitions === 0) return 'New';
    const days = SpacedRepetition.daysUntil(state);
    if (days === 0) return 'Due today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `${days} days`;
    if (days < 30) return `${Math.round(days / 7)}w`;
    return `${Math.round(days / 30)}mo`;
  },
};
