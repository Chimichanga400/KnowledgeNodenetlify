/**
 * AppFeatures.js — Single source of truth for what the app can do.
 *
 * KEEP THIS UP TO DATE when you add a new feature.
 * The study coach reads this automatically — no other changes needed.
 *
 * Each entry:
 *   name        — short display name
 *   where       — where to find it in the app
 *   what        — one sentence: what it does for the student
 *   coachTip    — optional: how the coach should recommend it
 */
const AppFeatures = [
  {
    name: 'Guided Study',
    where: 'Study tab → select a topic',
    what: 'A 5-step walkthrough: orient, check prior knowledge, read notes, blank-recall, and practice questions.',
    coachTip: 'Best for first-time study of a topic or revisiting something weak.',
  },
  {
    name: 'Lecture Slides',
    where: 'Study tab → select a topic → tap "Lecture" or "Slides"',
    what: 'AI generates a full slide deck with bullet points and narration for the topic. Can be played automatically (auto-advances with narration) or presented full-screen.',
    coachTip: 'Good for visual learners or when the student wants a structured overview before diving into notes.',
  },
  {
    name: 'Review / Spaced Repetition',
    where: 'Review tab',
    what: 'Flashcard-style review of all topics. Cards are scheduled automatically — weak cards come back sooner. Modes: Due, All, Weak Spots.',
    coachTip: 'Best for consolidation and exam prep. Should be done daily once topics are initially learned.',
  },
  {
    name: 'Library',
    where: 'Library tab',
    what: 'All topics with their notes, examples, questions, and mastery scores. Each topic has tabs: Notes, Examples, Questions, Mastery.',
    coachTip: 'Where the student reads and manages their source material.',
  },
  {
    name: 'Worked Examples',
    where: 'Library → topic → Examples tab',
    what: 'Solved accounting examples the student has scanned in. Can be read directly or taught step-by-step by the coach.',
    coachTip: 'For accounting, studying a worked example then redoing it covered-up is one of the most effective techniques.',
  },
  {
    name: 'Add / Scan Content',
    where: 'Add tab (+ button)',
    what: 'Scan photos of handbook pages or upload PDFs. AI extracts the content into structured notes. Worked examples are detected and offered to save separately.',
  },
  {
    name: 'Study Plan',
    where: 'Study Plan tab or Dashboard → Create Study Plan',
    what: 'Creates a day-by-day study schedule based on exam date, daily available time, and topic difficulty. Tracks session completion.',
    coachTip: 'If the student has an exam date, building a plan removes the daily "what should I study?" decision.',
  },
  {
    name: 'AI Study Coach (this)',
    where: 'More menu → Talk to your coach',
    what: 'Conversational coach that sees the whole library — topics, mastery, examples, plan. Advises on study strategy, technique, and what to prioritise.',
  },
  {
    name: 'Understanding Check',
    where: 'Study tab → topic → Check step',
    what: 'AI asks questions about the topic and evaluates your answers, giving feedback on gaps.',
  },
  {
    name: 'PowerPoint Export',
    where: 'Study tab → topic → Lecture Slides → ↓ PowerPoint',
    what: 'Downloads the generated slide deck as a real .pptx file.',
  },
];
