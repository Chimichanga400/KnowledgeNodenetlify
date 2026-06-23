/**
 * Guide.js — In-app comprehensive guide
 *
 * The first-run tour (Onboarding.showTour) stays short on purpose.
 * This is the *full* reference: opened on demand from Settings, the
 * More menu, the header "how it works" link, and the welcome screen.
 *
 * Renders a full-screen scrollable overlay that reuses the app's
 * existing CSS custom properties (--accent, --bg-*, --font-*), so it
 * always matches the active theme. Styles are scoped under
 * #kng-guide-overlay and injected once.
 *
 * Public API:
 *   Guide.open()   — show the guide
 *   Guide.close()  — hide it
 */

const Guide = {
  _stylesInjected: false,

  open() {
    if (document.getElementById('kng-guide-overlay')) return;
    this._injectStyles();

    const ov = document.createElement('div');
    ov.id = 'kng-guide-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'KnowledgeNode guide');
    ov.innerHTML = `
      <div class="kng-bar">
        <div class="kng-bar-title"><span class="kng-hex">⬡</span> The Complete Guide</div>
        <button class="kng-close" id="kng-guide-close" aria-label="Close guide">✕</button>
      </div>
      <div class="kng-scroll">${this._content()}</div>`;
    document.body.appendChild(ov);
    // Background scroll is locked automatically by ScrollLock (detects #kng-guide-overlay).

    const close = () => this.close();
    document.getElementById('kng-guide-close')?.addEventListener('click', close);
    this._escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', this._escHandler);

    // Smooth-scroll the inner anchors
    ov.querySelectorAll('[data-jump]').forEach(b => {
      b.addEventListener('click', () => {
        const t = ov.querySelector('#' + b.dataset.jump);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  },

  close() {
    const ov = document.getElementById('kng-guide-overlay');
    if (!ov) return;
    ov.style.opacity = '0';
    if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
    setTimeout(() => ov.remove(), 200);
  },

  /* ───────────────────────── content ───────────────────────── */
  _content() {
    return `
    <div class="kng-wrap">

      <header class="kng-hero">
        <div class="kng-mark"><span>K</span></div>
        <div class="kng-eyebrow">Study smarter · remember more</div>
        <h1 class="kng-h1">How KnowledgeNode works</h1>
        <p class="kng-lede">Everything the app does — and how to use it from your very first note.</p>
      </header>

      <div class="kng-thesis">
        <p><span class="kng-dim">Most students re-read and highlight. It feels productive but barely builds memory.</span> KnowledgeNode is built on one finding research keeps confirming: <strong class="kng-acc">you learn by retrieving, not reviewing.</strong> Every feature exists to make you pull knowledge out of your head before you ever see the answer.</p>
      </div>

      <!-- 01 -->
      <section class="kng-sec" id="kng-loop">
        <div class="kng-shead"><span class="kng-num">01</span><h2>The study loop</h2></div>
        <p class="kng-sub">One method, repeated. The engine under everything else.</p>
        <div class="kng-loop">
          <div class="kng-lstep"><span class="kng-lic">📖</span><span class="kng-llb">Read</span></div>
          <div class="kng-lstep"><span class="kng-lic">💡</span><span class="kng-llb">Understand</span></div>
          <div class="kng-lstep"><span class="kng-lic">✍</span><span class="kng-llb">Recall</span></div>
          <div class="kng-lstep"><span class="kng-lic">❓</span><span class="kng-llb">Test</span></div>
          <div class="kng-lstep kng-acc-step"><span class="kng-lic">🔁</span><span class="kng-llb">Repeat</span></div>
        </div>
        <p>You don't have to memorise it — the app walks you through it. But it explains why KnowledgeNode keeps asking you to <strong>write before you read</strong>, and why some cards vanish for days while others keep returning.</p>
      </section>

      <!-- 02 -->
      <section class="kng-sec">
        <div class="kng-shead"><span class="kng-num">02</span><h2>Three steps to get started</h2></div>
        <p class="kng-sub">A checklist at the bottom of the screen tracks these until all three are done.</p>
        <div class="kng-steps">
          <div class="kng-step"><div class="kng-sn">1</div><div><div class="kng-st">Add your first notes</div><div class="kng-sd">Photograph a page, drag in a PDF, or type. The AI builds your first <strong>node</strong>. Scan <strong>one topic at a time</strong> — e.g. "Gross Income" as one node, not a whole module.</div></div></div>
          <div class="kng-step"><div class="kng-sn">2</div><div><div class="kng-st">Set your exam date</div><div class="kng-sd">Open <strong>Study Plan</strong> and enter your deadline. The app builds a day-by-day schedule backward from it, balancing new topics against review.</div></div></div>
          <div class="kng-step"><div class="kng-sn">3</div><div><div class="kng-st">Do your first study session</div><div class="kng-sd">Tap <strong>Study</strong> and follow the guided flow — Orient → Read → Recall → Practice. That's the whole loop, on rails.</div></div></div>
        </div>
      </section>

      <!-- 03 -->
      <section class="kng-sec">
        <div class="kng-shead"><span class="kng-num">03</span><h2>Getting around</h2></div>
        <p class="kng-sub">Six destinations. The bottom bar holds the daily ones; the rest live under More (≡).</p>
        <div class="kng-grid">
          <div class="kng-card"><div class="kng-ct"><span>↑</span>Add Notes</div><p>Turn a photo, PDF, or text into a structured node.</p></div>
          <div class="kng-card"><div class="kng-ct"><span>▶</span>Study Session</div><p>The guided loop for whatever you should learn next.</p></div>
          <div class="kng-card"><div class="kng-ct"><span>↺</span>Review</div><p>Spaced-repetition cards — only what's due today.</p></div>
          <div class="kng-card"><div class="kng-ct"><span>⊞</span>Library</div><p>Every node. Open one to read, edit, reshape, or print.</p></div>
          <div class="kng-card"><div class="kng-ct"><span>📅</span>Study Plan</div><p>Exam countdown, schedule, and competency by topic.</p></div>
          <div class="kng-card"><div class="kng-ct"><span>◉</span>Progress</div><p>Mastery, streak, and where your weak spots hide.</p></div>
        </div>
      </section>

      <!-- 04 -->
      <section class="kng-sec">
        <div class="kng-shead"><span class="kng-num">04</span><h2>Inside a node</h2></div>
        <p class="kng-sub">The AI doesn't dump text — it pulls your notes into the pieces you actually study.</p>
        <div class="kng-rows">
          <div class="kng-row"><span class="kng-ric">📖</span><div><div class="kng-rt">Definitions, formulas, tables &amp; procedures</div><div class="kng-rd">Terms with examples, formulas with constraints, step-by-step procedures and tables — kept faithful to your source.</div></div></div>
          <div class="kng-row"><span class="kng-ric">⚠️</span><div><div class="kng-rt">Common mistakes &amp; summary</div><div class="kng-rd">The traps on this topic, plus a tight summary to skim before an exam.</div></div></div>
          <div class="kng-row"><span class="kng-ric">❓</span><div><div class="kng-rt">Auto-generated questions</div><div class="kng-rd">Recall questions (from the material) and application questions (use it somewhere new) for every node.</div></div></div>
          <div class="kng-row"><span class="kng-ric">🛡️</span><div><div class="kng-rt">Faithfulness check</div><div class="kng-rd">If the AI adds anything not grounded in your source it <strong>flags it</strong> rather than inventing facts — and never silently deletes your content.</div></div></div>
          <div class="kng-row"><span class="kng-ric">🎓</span><div><div class="kng-rt">Your level</div><div class="kng-rd">Primary, High School, College, or Professional — same content, explained at your depth.</div></div></div>
          <div class="kng-row"><span class="kng-ric">🗂️</span><div><div class="kng-rt">Note templates</div><div class="kng-rd">Switch any node between <strong>Standard, Cornell, Outline, or Feynman</strong> — the AI rewrites it in place.</div></div></div>
        </div>
        <div class="kng-tip"><span class="kng-tk">Select to act</span><p>Highlight text in a node and a toolbar appears: make a <strong>Question</strong>, <strong>Recall</strong> or <strong>Apply</strong> card, add a <strong>Definition</strong>, <strong>Mark</strong> it, or <strong>Correct the AI</strong>.</p></div>
      </section>

      <!-- 05 -->
      <section class="kng-sec">
        <div class="kng-shead"><span class="kng-num">05</span><h2>Ways to study</h2></div>
        <p class="kng-sub">A guided session strings these together, but each is worth knowing.</p>
        <div class="kng-rows">
          <div class="kng-row"><span class="kng-ric">🧭</span><div><div class="kng-rt">Guided session</div><div class="kng-rd">The full loop on rails — Orient → Read → Recall → Practice. Keep tapping forward.</div></div></div>
          <div class="kng-row"><span class="kng-ric">✍</span><div><div class="kng-rt">Blank recall</div><div class="kng-rd">Write everything you remember <em>before</em> seeing the notes. That effort is where memory is built.</div></div></div>
          <div class="kng-row"><span class="kng-ric">💡</span><div><div class="kng-rt">Understanding check</div><div class="kng-rd">Quick questions that confirm a concept clicked before you move on.</div></div></div>
          <div class="kng-row"><span class="kng-ric">🎙️</span><div><div class="kng-rt">Lecture mode</div><div class="kng-rd">The AI writes a flowing, plain-language lecture on the node — like a tutor talking it through.</div></div></div>
          <div class="kng-row"><span class="kng-ric">🗣️</span><div><div class="kng-rt">Socratic tutor</div><div class="kng-rd">Instead of answers, it asks the questions that lead you to the answer yourself.</div></div></div>
          <div class="kng-row"><span class="kng-ric">↺</span><div><div class="kng-rt">Review (spaced repetition)</div><div class="kng-rd">SM-2 decides when each card returns. Rate how it felt; the app handles the timing.</div></div></div>
        </div>
        <div class="kng-ratings">
          <div class="kng-rate"><span class="kng-dot" style="background:var(--red)"></span><b>Again</b> — forgot, comes back soon</div>
          <div class="kng-rate"><span class="kng-dot" style="background:var(--accent)"></span><b>Hard</b> — shaky, short interval</div>
          <div class="kng-rate"><span class="kng-dot" style="background:var(--blue)"></span><b>Good</b> — got it, interval grows</div>
          <div class="kng-rate"><span class="kng-dot" style="background:var(--green)"></span><b>Easy</b> — instant, fades out</div>
        </div>
      </section>

      <!-- 06 -->
      <section class="kng-sec">
        <div class="kng-shead"><span class="kng-num">06</span><h2>Let the AI take the wheel</h2></div>
        <p class="kng-sub">When you don't want to decide what to study, hand it over — both under More (≡).</p>
        <div class="kng-grid">
          <div class="kng-card"><div class="kng-ct"><span>⬡</span>AI Director</div><p>Reads your whole library, weighs your exam date and weak spots, and dictates what to study today.</p></div>
          <div class="kng-card"><div class="kng-ct"><span>💬</span>Study coach</div><p>Ask anything — "what should I do with 20 minutes?", "am I on track?" It knows your progress.</p></div>
        </div>
        <div class="kng-rows" style="margin-top:14px">
          <div class="kng-row"><span class="kng-ric">🧩</span><div><div class="kng-rt">Adaptive blocks</div><div class="kng-rd">Restructures a topic into the best mix of study blocks for how you learn it — more practice where you're weak.</div></div></div>
          <div class="kng-row"><span class="kng-ric">🌱</span><div><div class="kng-rt">Reactive reshaping</div><div class="kng-rd">Struggling mid-review? The node grows a simpler scaffold and an easier question on the spot.</div></div></div>
        </div>
      </section>

      <!-- 07 -->
      <section class="kng-sec">
        <div class="kng-shead"><span class="kng-num">07</span><h2>Your data &amp; setup</h2></div>
        <p class="kng-sub">Everything stays on your device. A few things worth knowing.</p>
        <div class="kng-rows">
          <div class="kng-row"><span class="kng-ric">💾</span><div><div class="kng-rt">Stored in your browser</div><div class="kng-rd">Your nodes live in this browser only — nothing uploaded to an account. Rolling backups happen as you go.</div></div></div>
          <div class="kng-row"><span class="kng-ric">📤</span><div><div class="kng-rt">Backup &amp; moving devices</div><div class="kng-rd">No auto-sync. Use <strong>Settings → Export</strong> for a JSON file, then <strong>Import</strong> it elsewhere to carry everything over.</div></div></div>
          <div class="kng-row"><span class="kng-ric">🤖</span><div><div class="kng-rt">How AI is powered</div><div class="kng-rd">Works out of the box if a key ships with the app. Otherwise add your own in <strong>Settings → Configure AI</strong> (kept in your browser). No key? A full <strong>demo mode</strong> still lets you explore.</div></div></div>
          <div class="kng-row"><span class="kng-ric">📶</span><div><div class="kng-rt">Offline · timer · streak · themes</div><div class="kng-rd">Installable and usable offline, with a built-in study timer, a streak, and a light/dark theme toggle — all under More.</div></div></div>
        </div>
      </section>

      <!-- 08 -->
      <section class="kng-sec">
        <div class="kng-shead"><span class="kng-num">08</span><h2>Quick answers</h2></div>
        <details><summary>How big should one node be?</summary><div class="kng-ans">One topic — about what a single sub-heading covers. Small nodes are easier to recall, schedule, and master.</div></details>
        <details><summary>What do I do each day?</summary><div class="kng-ans">Open <strong>Study Session</strong> for new material and <strong>Review</strong> for what's due. Or tap <strong>AI Director</strong> and follow its plan. Ten focused minutes beats an hour of re-reading.</div></details>
        <details><summary>Why write before seeing the answer?</summary><div class="kng-ans">Trying to retrieve — even failing — is what cements memory. Reading first feels easier but teaches little. Trust the struggle.</div></details>
        <details><summary>The AI got something wrong — can I fix it?</summary><div class="kng-ans">Yes. Highlight the text and tap <strong>Correct AI</strong>, or edit the node in the Library. Your corrections stick.</div></details>
        <details><summary>Will I lose my work?</summary><div class="kng-ans">It saves continuously in your browser. Before clearing data or switching devices, run <strong>Settings → Export</strong> for a backup.</div></details>
      </section>

      <footer class="kng-foot">
        <div class="kng-fhex">⬡</div>
        <p>Add a node · set your date · study the loop. That's it.</p>
      </footer>

    </div>`;
  },

  /* ───────────────────────── styles ───────────────────────── */
  _injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;
    const css = `
#kng-guide-overlay{position:fixed;inset:0;z-index:100000;background:var(--bg-base);display:flex;flex-direction:column;transition:opacity .2s ease;animation:kng-fade .25s ease;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);}
@keyframes kng-fade{from{opacity:0}to{opacity:1}}
#kng-guide-overlay .kng-bar{flex:none;display:flex;align-items:center;justify-content:space-between;
  padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg-surface);}
#kng-guide-overlay .kng-bar-title{font-family:var(--font-ui);font-weight:700;font-size:15px;color:var(--text-primary);display:flex;align-items:center;gap:8px;}
#kng-guide-overlay .kng-hex{color:var(--accent);font-size:16px;}
#kng-guide-overlay .kng-close{background:transparent;border:1px solid var(--border);color:var(--text-secondary);
  width:34px;height:34px;border-radius:9px;font-size:15px;cursor:pointer;line-height:1;transition:all .15s;}
#kng-guide-overlay .kng-close:hover{border-color:var(--border-bright);color:var(--text-primary);}
#kng-guide-overlay .kng-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:env(safe-area-inset-bottom);}
#kng-guide-overlay .kng-wrap{max-width:680px;margin:0 auto;padding:0 22px;font-family:var(--font-body);color:var(--text-primary);line-height:1.7;font-size:16px;}

#kng-guide-overlay .kng-hero{text-align:center;padding:42px 0 14px;}
#kng-guide-overlay .kng-mark{width:52px;height:52px;margin:0 auto 18px;background:var(--accent);border-radius:13px;
  display:flex;align-items:center;justify-content:center;box-shadow:0 6px 22px var(--accent-glow);
  font-family:var(--font-ui);font-weight:900;font-size:24px;color:#000;}
#kng-guide-overlay .kng-eyebrow{font-family:var(--font-mono);font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:12px;}
#kng-guide-overlay .kng-h1{font-family:var(--font-ui);font-weight:900;letter-spacing:-.02em;font-size:clamp(28px,7vw,40px);line-height:1.08;margin-bottom:12px;}
#kng-guide-overlay .kng-lede{color:var(--text-secondary);font-style:italic;font-size:16.5px;max-width:34ch;margin:0 auto;}

#kng-guide-overlay .kng-thesis{border:1px solid var(--border);border-radius:18px;background:linear-gradient(180deg,var(--bg-raised),var(--bg-surface));padding:22px 20px;margin-top:14px;}
#kng-guide-overlay .kng-thesis p{font-size:16.5px;}
#kng-guide-overlay .kng-dim{color:var(--text-muted);}
#kng-guide-overlay .kng-acc{color:var(--accent-light);font-family:var(--font-ui);font-weight:700;}

#kng-guide-overlay .kng-sec{padding:38px 0 2px;}
#kng-guide-overlay .kng-shead{display:flex;align-items:baseline;gap:12px;}
#kng-guide-overlay .kng-num{font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--accent);border:1px solid var(--accent-dim);border-radius:6px;padding:2px 7px;flex:none;}
#kng-guide-overlay h2{font-family:var(--font-ui);font-weight:800;font-size:clamp(21px,5.5vw,27px);letter-spacing:-.01em;line-height:1.15;}
#kng-guide-overlay .kng-sub{color:var(--text-secondary);font-style:italic;margin:6px 0 20px;font-size:15.5px;}
#kng-guide-overlay p+p{margin-top:12px;}
#kng-guide-overlay strong{color:var(--text-primary);font-weight:700;}

#kng-guide-overlay .kng-loop{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;margin:18px 0 18px;}
#kng-guide-overlay .kng-lstep{flex:1 1 78px;min-width:74px;text-align:center;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);padding:13px 6px;}
#kng-guide-overlay .kng-lic{font-size:21px;display:block;margin-bottom:6px;}
#kng-guide-overlay .kng-llb{font-family:var(--font-ui);font-size:12px;font-weight:700;}
#kng-guide-overlay .kng-acc-step{border-color:var(--accent-dim);background:var(--accent-soft);}
#kng-guide-overlay .kng-acc-step .kng-llb{color:var(--accent-light);}

#kng-guide-overlay .kng-steps{display:flex;flex-direction:column;gap:15px;}
#kng-guide-overlay .kng-step{display:flex;gap:14px;align-items:flex-start;}
#kng-guide-overlay .kng-sn{flex:none;width:32px;height:32px;border-radius:9px;background:var(--accent);color:#000;font-family:var(--font-ui);font-weight:900;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px var(--accent-glow);}
#kng-guide-overlay .kng-st{font-family:var(--font-ui);font-weight:700;font-size:16px;margin-bottom:2px;}
#kng-guide-overlay .kng-sd{color:var(--text-secondary);font-size:15px;}

#kng-guide-overlay .kng-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
#kng-guide-overlay .kng-card{border:1px solid var(--border);border-radius:10px;background:var(--bg-surface);padding:15px 15px;}
#kng-guide-overlay .kng-ct{display:flex;align-items:center;gap:9px;font-family:var(--font-ui);font-weight:700;font-size:15px;margin-bottom:6px;}
#kng-guide-overlay .kng-ct span{font-size:17px;color:var(--accent);}
#kng-guide-overlay .kng-card p{font-size:14px;color:var(--text-secondary);line-height:1.55;}

#kng-guide-overlay .kng-rows .kng-row{display:flex;gap:14px;padding:15px 0;border-bottom:1px solid var(--border-soft);}
#kng-guide-overlay .kng-rows .kng-row:last-child{border-bottom:none;}
#kng-guide-overlay .kng-ric{font-size:20px;flex:none;width:28px;text-align:center;margin-top:1px;}
#kng-guide-overlay .kng-rt{font-family:var(--font-ui);font-weight:700;font-size:15.5px;margin-bottom:2px;}
#kng-guide-overlay .kng-rd{color:var(--text-secondary);font-size:14.5px;}

#kng-guide-overlay .kng-tip{border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 10px 10px 0;padding:13px 16px;margin-top:18px;}
#kng-guide-overlay .kng-tk{font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);display:block;margin-bottom:4px;}
#kng-guide-overlay .kng-tip p{font-size:14.5px;}

#kng-guide-overlay .kng-ratings{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:18px;}
#kng-guide-overlay .kng-rate{border:1px solid var(--border);border-radius:9px;padding:11px 13px;background:var(--bg-surface);font-family:var(--font-mono);font-size:12px;color:var(--text-muted);}
#kng-guide-overlay .kng-rate b{font-family:var(--font-ui);color:var(--text-primary);font-size:14px;}
#kng-guide-overlay .kng-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle;}

#kng-guide-overlay details{border-bottom:1px solid var(--border-soft);}
#kng-guide-overlay summary{cursor:pointer;list-style:none;padding:14px 28px 14px 0;position:relative;font-family:var(--font-ui);font-weight:600;font-size:15.5px;color:var(--text-primary);}
#kng-guide-overlay summary::-webkit-details-marker{display:none;}
#kng-guide-overlay summary::after{content:'+';position:absolute;right:2px;top:11px;font-size:20px;color:var(--accent);}
#kng-guide-overlay details[open] summary::after{content:'\\2013';}
#kng-guide-overlay .kng-ans{padding:0 0 15px;color:var(--text-secondary);font-size:15px;}

#kng-guide-overlay .kng-foot{text-align:center;padding:40px 0 60px;border-top:1px solid var(--border);margin-top:44px;}
#kng-guide-overlay .kng-fhex{color:var(--accent);font-size:19px;margin-bottom:10px;}
#kng-guide-overlay .kng-foot p{font-family:var(--font-mono);font-size:12px;color:var(--text-muted);}

@media(max-width:540px){#kng-guide-overlay .kng-grid,#kng-guide-overlay .kng-ratings{grid-template-columns:1fr;}}
@media(prefers-reduced-motion:reduce){#kng-guide-overlay{animation:none;}}
`;
    const tag = document.createElement('style');
    tag.id = 'kng-guide-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  },
};
