/**
 * AIService.js — Final with OpenRouter
 *
 * OpenRouter is the default provider. One key, 300+ models.
 * Each function (note processing, questions, chat, grading…) uses
 * its own model — pre-configured with sensible defaults.
 * User just pastes their OpenRouter key and everything works.
 *
 * Function → default model mapping (all via OpenRouter):
 *   noteProcessing   → google/gemini-2.5-flash    (vision, fast, current)
 *   questionGen      → google/gemini-2.5-flash    (structured JSON output)
 *   chat             → anthropic/claude-haiku-4-5        (fast, responsive)
 *   lecture          → anthropic/claude-sonnet-4-6       (best writing)
 *   grading          → openai/gpt-4o-mini               (reliable scoring JSON)
 *   examGeneration   → anthropic/claude-sonnet-4-6       (domain knowledge)
 *   restructure      → google/gemini-2.5-flash-lite      (fastest structuring)
 *   gapAnalysis      → anthropic/claude-haiku-4-5        (cross-topic reasoning)
 */

const AIService = {

  /* ═══════════════════════════════════════════════════════
     PROVIDER REGISTRY
  ═══════════════════════════════════════════════════════ */
  _providers: {
    openrouter: {
      name:           'OpenRouter (Recommended)',
      endpoint:       'https://openrouter.ai/api/v1/chat/completions',
      keyPlaceholder: 'sk-or-v1-...',
      docsUrl:        'https://openrouter.ai/keys',
      supportsVision: true,
      isOpenRouter:   true,
      // Default model for each function — user can override in Settings
      defaults: {
        noteProcessing: 'google/gemini-2.5-flash',
        questionGen:    'google/gemini-2.5-flash',
        chat:           'anthropic/claude-haiku-4-5',
        lecture:        'anthropic/claude-sonnet-4-6',
        grading:        'openai/gpt-4o-mini',
        examGeneration: 'anthropic/claude-sonnet-4-6',
        restructure:    'google/gemini-2.5-flash-lite',
        gapAnalysis:    'anthropic/claude-haiku-4-5',
        slideGen:       'google/gemini-2.5-flash',
        director:       'anthropic/claude-haiku-4-5', // default: will be overridden by presets
      },
      presets: {
        budget: {
          label: '💰 Budget',
          desc:  'Cheapest models. Great for most tasks.',
          models: {
            noteProcessing: 'google/gemini-2.5-flash-lite',
            questionGen:    'google/gemini-2.5-flash-lite',
            chat:           'google/gemini-2.5-flash-lite',
            lecture:        'google/gemini-2.5-flash',
            grading:        'openai/gpt-4o-mini',
            examGeneration: 'google/gemini-2.5-flash',
            restructure:    'google/gemini-2.5-flash-lite',
            gapAnalysis:    'google/gemini-2.5-flash-lite',
            director:       'google/gemini-2.5-flash',     // budget: flash handles the reasoning
          },
        },
        balanced: {
          label: '⚖ Balanced',
          desc:  'Smart defaults. Best value for studying.',
          models: {
            noteProcessing: 'google/gemini-2.5-flash',
            questionGen:    'google/gemini-2.5-flash',
            chat:           'anthropic/claude-haiku-4-5',
            lecture:        'anthropic/claude-sonnet-4-6',
            grading:        'openai/gpt-4o-mini',
            examGeneration: 'anthropic/claude-sonnet-4-6',
            restructure:    'google/gemini-2.5-flash-lite',
            gapAnalysis:    'anthropic/claude-haiku-4-5',
            director:       'anthropic/claude-sonnet-4-6',  // balanced: Sonnet for cross-topic reasoning
          },
        },
        premium: {
          label: '🚀 Premium',
          desc:  'Best models for every task. Higher cost.',
          models: {
            noteProcessing: 'google/gemini-2.5-pro',
            questionGen:    'google/gemini-2.5-pro',
            chat:           'anthropic/claude-sonnet-4-6',
            lecture:        'anthropic/claude-opus-4-7',
            grading:        'openai/gpt-4o',
            examGeneration: 'anthropic/claude-opus-4-7',
            restructure:    'google/gemini-2.5-flash',
            gapAnalysis:    'anthropic/claude-sonnet-4-6',
            director:       'anthropic/claude-opus-4-7',    // premium: Opus for deepest evaluation
          },
        },
      },
    },
    claude: {
      name:           'Claude (Anthropic Direct)',
      models:         ['claude-sonnet-4-6','claude-opus-4-7','claude-haiku-4-5-20251001'],
      defaultModel:   'claude-sonnet-4-6',
      keyPlaceholder: 'sk-ant-...',
      docsUrl:        'https://console.anthropic.com',
      supportsVision: true,
    },
    openai: {
      name:           'ChatGPT (OpenAI Direct)',
      models:         ['gpt-4o','gpt-4o-mini','gpt-4-turbo'],
      defaultModel:   'gpt-4o',
      keyPlaceholder: 'sk-...',
      docsUrl:        'https://platform.openai.com',
      supportsVision: true,
    },
    gemini: {
      name:           'Gemini (Google Direct)',
      models:         [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
      ],
      defaultModel:   'gemini-2.5-flash',
      keyPlaceholder: 'AIza...',
      docsUrl:        'https://aistudio.google.com',
      supportsVision: true,
    },
    custom: {
      name:           'Custom Endpoint',
      models:         [],
      defaultModel:   '',
      keyPlaceholder: 'api-key',
      docsUrl:        '',
      supportsVision: false,
    },
  },

  /* ─── Function labels for UI ─── */
  _functionLabels: {
    noteProcessing: { label:'📄 Note Processing',     desc:'Structuring uploaded notes and images into nodes' },
    questionGen:    { label:'❓ Question Generation', desc:'Creating recall and application questions' },
    chat:           { label:'💬 AI Assistant Chat',   desc:'Floater chat, explanations, simplification' },
    lecture:        { label:'🎓 Lecture Scripts',     desc:'Generating lecture and study scripts' },
    grading:        { label:'✅ Answer Grading',       desc:'Grading quiz and exam answers' },
    examGeneration: { label:'🏆 Exam Questions',      desc:'Generating scenario-based exam questions' },
    restructure:    { label:'⬡ Restructure Notes',    desc:'Reorganising raw notes into structured format' },
    gapAnalysis:    { label:'🔍 Gap Analysis',        desc:'Analysing weak areas after study sessions' },
    director:       { label:'⬡ AI Director',          desc:'Full cross-topic evaluation and study reshaping' },
  },

  // OpenRouter is the recommended bring-your-own-key provider and the default.
  _activeProvider: 'openrouter',
  _config: {},

  // Server-side proxy state. When a serverless proxy (Netlify/Vercel) is
  // deployed WITH an ANTHROPIC_API_KEY env var, every visitor can use AI with
  // zero configuration — requests are routed through the proxy and the owner's
  // key never touches the browser. Detected once at startup by loadConfig().
  _proxyAvailable: false,
  _proxyEndpoint: null,
  _proxyChecked: false,

  /* ═══════════════════════════════════════════════════════
     CONFIG
  ═══════════════════════════════════════════════════════ */
  /** Set active learner profile — affects all AI responses */
  setProfile(profile) {
    this._activeProfile = profile || 'college';
  },

  loadConfig() {
    try {
      const s = localStorage.getItem('kn_ai_config_v2');
      if (s) this._config = JSON.parse(s);
      this._activeProvider = localStorage.getItem('kn_ai_provider') || 'openrouter';
    } catch(e) {}
    // Kick off proxy detection (non-blocking). The app works regardless of result.
    this.detectProxy();
  },

  /**
   * Detect whether a serverless Claude proxy is deployed and has a key.
   * Tries the Netlify and Vercel routes with a tiny probe request.
   * If found, all AI calls route through it using the OWNER's server key —
   * users need no key of their own. Falls back silently to BYO-key mode.
   */
  async detectProxy() {
    if (this._proxyChecked) return this._proxyAvailable;
    this._proxyChecked = true;
    // Where the serverless proxy lives. In the installed Android app the proxy is
    // on a different origin (your Vercel/Netlify deploy), so it must be an ABSOLUTE
    // url from AppConfig.PROXY_BASE_URL. On the web build (same origin) we probe
    // relative paths.
    const base = (typeof AppConfig !== 'undefined' && AppConfig.PROXY_BASE_URL)
      ? String(AppConfig.PROXY_BASE_URL).replace(/\/$/, '') : '';
    // With no base set, only probe when served over http(s) (a file:// origin has
    // no backend). With an absolute base, always probe.
    if (!base && (typeof location === 'undefined' || !/^https?:$/.test(location.protocol))) return false;
    const candidates = base
      ? [base + '/api/claude-proxy', base + '/.netlify/functions/claude-proxy']
      : ['/.netlify/functions/claude-proxy', '/api/claude-proxy'];
    for (const url of candidates) {
      try {
        const res = await this._fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Minimal valid Anthropic payload — proxy adds the key server-side.
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        }, 5000); // 5s probe — don't hang startup
        // 404/405 → no proxy at this route. Try next.
        if (res.status === 404 || res.status === 405) continue;
        const data = await res.json().catch(() => ({}));
        // Proxy exists but owner hasn't set a key → not usable, keep looking/BYO.
        const msg = data?.error?.message || '';
        if (/api key not (set|configured)|config error/i.test(msg)) continue;
        // Anything else (200 with content, or a real Anthropic error like
        // overloaded/invalid-model) means the proxy is live AND keyed.
        this._proxyAvailable = true;
        this._proxyEndpoint  = url;
        document.dispatchEvent(new CustomEvent('kn-proxy-detected', { detail: { url } }));
        return true;
      } catch (e) { /* network/route error — try next candidate */ }
    }
    return false;
  },

  saveConfig(provider, key, model, customEndpoint='', functionModels={}) {
    this._activeProvider = provider;
    this._config[provider] = { key, model, customEndpoint, functionModels };
    localStorage.setItem('kn_ai_config_v2', JSON.stringify(this._config));
    localStorage.setItem('kn_ai_provider', provider);
  },

  /** Snapshot the full AI configuration (provider + keys + models) for backups. */
  exportConfig() {
    const hasAny = this._config && Object.keys(this._config).length > 0;
    if (!hasAny) return null;
    return { provider: this._activeProvider, config: this._config };
  },

  /** Restore AI configuration from a backup payload produced by exportConfig().
   *  Backups can come from a file anyone could have edited, so the payload is
   *  treated as untrusted: unknown providers are dropped, only known fields are
   *  copied, and a `custom` endpoint (which controls where notes + keys are sent)
   *  is accepted only if it is a valid HTTPS URL and is flagged for re-confirmation. */
  importConfig(obj) {
    if (!obj || typeof obj !== 'object') return false;
    try {
      const known    = Object.keys(this._providers);
      const incoming = (obj.config && typeof obj.config === 'object') ? obj.config : {};
      const clean    = {};
      for (const [provider, cfg] of Object.entries(incoming)) {
        if (!known.includes(provider) || !cfg || typeof cfg !== 'object') continue;
        const safe = {
          key:            typeof cfg.key === 'string' ? cfg.key : '',
          model:          typeof cfg.model === 'string' ? cfg.model : '',
          functionModels: (cfg.functionModels && typeof cfg.functionModels === 'object') ? cfg.functionModels : {},
          customEndpoint: '',
        };
        if (provider === 'custom' && typeof cfg.customEndpoint === 'string') {
          try {
            const u = new URL(cfg.customEndpoint);
            if (u.protocol === 'https:') {
              safe.customEndpoint        = cfg.customEndpoint;
              safe._endpointNeedsConfirm = true; // UI should ask before first use
            }
          } catch (e) { /* invalid URL → leave endpoint blank */ }
        }
        clean[provider] = safe;
      }
      this._config = clean;
      if (obj.provider && known.includes(obj.provider)) this._activeProvider = obj.provider;
      localStorage.setItem('kn_ai_config_v2', JSON.stringify(this._config));
      localStorage.setItem('kn_ai_provider', this._activeProvider);
      return true;
    } catch (e) { console.warn('[AIService] importConfig failed:', e); return false; }
  },

  saveFunctionModel(fn, model) {
    const cfg = this._config[this._activeProvider] || {};
    cfg.functionModels = cfg.functionModels || {};
    cfg.functionModels[fn] = model;
    this._config[this._activeProvider] = cfg;
    localStorage.setItem('kn_ai_config_v2', JSON.stringify(this._config));
  },

  applyPreset(presetKey) {
    const p = this._providers.openrouter?.presets?.[presetKey];
    if (!p) return;
    const cfg = this._config.openrouter || {};
    cfg.functionModels = { ...p.models };
    this._config.openrouter = cfg;
    localStorage.setItem('kn_ai_config_v2', JSON.stringify(this._config));
  },

  getActiveProvider()    { return this._providers[this._activeProvider]; },
  getActiveProviderKey() { return this._activeProvider; },
  getActiveConfig()      { return this._config[this._activeProvider] || {}; },
  getProviderList()      { return Object.entries(this._providers).map(([id,p]) => ({id,...p})); },
  /** True if AI is usable — either via the server proxy OR a user-supplied key. */
  hasApiKey()    {
    if (this._proxyAvailable) return true;
    const c = this._config[this._activeProvider];
    return !!(c && c.key);
  },

  /** Returns a profile instruction string to inject into any AI prompt */
  profileContext(profile) {
    // CRITICAL RULE for all profiles: cover EVERY piece of information from the source.
    // The profile only changes HOW things are explained — never WHAT is included.
    // Volume and completeness must be identical across all profiles.
    const base = 'VOLUME RULE: Include ALL definitions, formulas, procedures, tables, and concepts from the source — do not skip or summarise anything just because of the level. The amount of content must be the same as college level. Only the language and explanation style changes. ';
    const map = {
      primary: base + 'STYLE: The student is PRIMARY SCHOOL level (age 6-11). Explain every concept using the simplest possible everyday words and analogies. No jargon — replace every technical term with a plain-English explanation AND still include the technical term in brackets so they learn it. Use short sentences. Be encouraging and warm. Give a simple real-life example for every concept.',
      high:    base + 'STYLE: The student is HIGH SCHOOL level (age 14-18). Use straightforward language. Define technical terms clearly when first used. Relate every concept to something real-world. Include all the detail but make it accessible.',
      college: base + 'STYLE: The student is COLLEGE/UNIVERSITY level. Use precise academic language. Include technical terms with definitions. Expect some prior knowledge but still explain each concept fully.',
      pro:     base + 'STYLE: The student is a WORKING PROFESSIONAL. Be concise but comprehensive — cover everything, just cut unnecessary explanation. Use industry terminology. Surface practical implications, edge cases, and real-world application for every concept.',
    };
    return map[profile] || map.college;
  },
  isUsingProxy() { return this._proxyAvailable === true; },
  supportsVision() {
    // Proxy uses Claude (vision-capable). Otherwise depends on the chosen provider + key.
    if (this._proxyAvailable) return true;
    return this._providers[this._activeProvider]?.supportsVision && this.hasApiKey();
  },

  /* Get the model for a specific function — falls back to default or global model */
  _getModelForFunction(fn) {
    const provider = this._providers[this._activeProvider];
    const cfg      = this._config[this._activeProvider] || {};

    // OpenRouter: use per-function model
    if (provider?.isOpenRouter) {
      return cfg.functionModels?.[fn]
          || provider.defaults?.[fn]
          || (fn === 'director' ? provider.defaults?.['gapAnalysis'] : null) // director → gapAnalysis fallback
          || provider.defaults?.noteProcessing
          || 'google/gemini-2.5-flash';
    }

    // Direct providers: use the global model selection
    return cfg.model || provider?.defaultModel || '';
  },

  /* ═══════════════════════════════════════════════════════
     CORE PROCESSING PIPELINE
  ═══════════════════════════════════════════════════════ */
  async processContent(base64Images=[], rawText='', meta={}, onProgress=()=>{}, mediaTypes=[]) {
    let ocrText = rawText;
    if (base64Images.length > 0 && !rawText) {
      onProgress(1, 'Reading ' + base64Images.length + ' image' + (base64Images.length>1?'s':'') + '…');
      ocrText = base64Images.length > 1
        ? await this._extractMultiPageText(base64Images, mediaTypes)
        : await this._extractSingleImageText(base64Images[0], mediaTypes[0] || 'image/jpeg');
    } else {
      onProgress(1, 'Reading content…'); await this._delay(200);
    }
    onProgress(2, 'Structuring notes from your source…');

    // Worked examples only consume `procedures` + `summary`. Skip subject
    // detection and question generation entirely — they aren't used, and
    // every extra API call is another chance for a transient failure to
    // drop the whole example.
    if (meta._isWorkedExample) {
      const cat = await this._detectSubjectCategory(ocrText, meta).catch(() => 'general');
      const exNotes = await this._generateFullStructure(ocrText, meta, cat, onProgress);
      onProgress(4, 'Building example…');
      return {
        rawOCR: ocrText,
        subjectCategory: cat,
        title: exNotes.title || meta.title || 'Worked Example',
        definitions: [], tables: [],
        formulas: exNotes.formulas || [],
        procedures: (exNotes.procedures||[]).map(p => typeof p==='string'
          ? {id:'proc_'+Math.random().toString(36).slice(2,8),title:'Step',appliesTo:'',steps:[p],notes:''}
          : p),
        commonMistakes: [],
        summary: exNotes.summary || '',
        questions: [],
        processingStatus: 'ready',
      };
    }

    // Detect subject category in parallel with structuring (saves ~1-2s)
    const [subjectCategory, ] = await Promise.all([
      this._detectSubjectCategory(ocrText, meta),
      this._delay(50),
    ]);
    const notes = await this._generateFullStructure(ocrText, meta, subjectCategory, onProgress);
    onProgress(3, 'Generating questions…');
    const qData = await this._generateQuestions(notes, meta, subjectCategory);
    onProgress(4, 'Building node…');
    const questions = [
      ...(qData.recall||[]).map(q => ({ id:KnowledgeNode._generateQuestionId(), type:'recall', question:q.question, answer:q.answer })),
      ...(qData.application||[]).map(q => ({ id:KnowledgeNode._generateQuestionId(), type:'application', question:q.question, answer:q.answer })),
    ];
    return {
      rawOCR: ocrText,
      subjectCategory,
      title:  notes.title || meta.chapter || 'Untitled',
      definitions:    (notes.definitions||[]).map(d=>({term:d.term||'',examples:d.examples||'',description:d.description||''})),
      tables:          notes.tables          || [],
      formulas:        notes.formulas        || [],
      procedures:     (notes.procedures||[]).map(p => typeof p==='string'
        ? {id:'proc_'+Math.random().toString(36).slice(2,8),title:'Procedure',appliesTo:'',steps:[p],notes:''}
        : p),
      commonMistakes:  notes.commonMistakes  || [],
      summary:         notes.summary         || '',
      sectionOrder:    Array.isArray(notes.blocks) ? notes.blocks : [],
      questions,
      processingStatus:'ready',
    };
  },

  /* ─── Subject category detection ──────────────────── */
  async _detectSubjectCategory(text, meta) {
    const hint = ((meta.subject||'') + ' ' + (meta.chapter||'')).toLowerCase();
    // Fast keyword detection first — no API call needed
    const rules = [
      { cat:'accounting', words:['debit','credit','ledger','balance sheet','income statement','vat','tax','depreciation','journal','trial balance','assets','liabilities','equity','profit','loss','revenue','expense','accrual','invoice'] },
      { cat:'law',        words:['section','act','statute','court','plaintiff','defendant','judgment','legislation','constitution','regulation','clause','contract','tort','criminal','civil','liability','jurisdiction'] },
      { cat:'programming',words:['function','variable','class','array','loop','algorithm','database','api','html','css','javascript','python','sql','code','syntax','runtime','compiler','framework','library','object','method'] },
      { cat:'science',    words:['hypothesis','experiment','element','molecule','reaction','force','energy','velocity','cell','organism','evolution','atom','bond','photosynthesis','nucleus','wave','current','voltage'] },
      { cat:'medicine',   words:['diagnosis','symptom','treatment','patient','anatomy','pathology','pharmacology','dose','clinical','syndrome','anatomy','physiology','drug','therapy','prognosis','infection'] },
      { cat:'maths',      words:['equation','derivative','integral','matrix','vector','probability','theorem','proof','function','limit','calculus','algebra','geometry','trigonometry','coefficient'] },
      { cat:'history',    words:['century','war','empire','revolution','dynasty','colonialism','treaty','parliament','monarchy','republic','president','independence','reform','civilization'] },
      { cat:'language',   words:['grammar','syntax','vocabulary','conjugation','tense','verb','noun','adjective','phonetics','semantics','discourse','linguistic','prose','poetry','literature'] },
    ];
    const combined = (hint + ' ' + text.slice(0, 800)).toLowerCase();
    let best = null; let bestCount = 0;
    for (const r of rules) {
      const count = r.words.filter(w => combined.includes(w)).length;
      if (count > bestCount) { bestCount = count; best = r.cat; }
    }
    if (bestCount >= 3) return best;
    // Fall back to AI detection if keyword match is weak
    try {
      const prompt = 'Classify this academic content into ONE category. Content: "'
        + text.slice(0,400) + '" Subject hint: "' + (meta.subject||'') + '"'
        + '\nCategories: accounting, law, programming, science, medicine, maths, history, language, general'
        + '\nOutput ONLY the single category word, nothing else.';
      const raw = (await this._callWithFunction('chat', [{role:'user',content:prompt}], 20)).trim().toLowerCase();
      const valid = ['accounting','law','programming','science','medicine','maths','history','language','general'];
      return valid.includes(raw) ? raw : (best || 'general');
    } catch { return best || 'general'; }
  },

  /* ═══════════════════════════════════════════════════════
     IN-NODE AI ACTIONS
  ═══════════════════════════════════════════════════════ */
  async generateFromImage(base64Image, node, targetSection='auto') {
    const hint = {
      auto:      'Detect what this image contains and generate the most appropriate structure.',
      definitions:'Extract all terms and definitions.',
      table:     'Extract the tabular data and structure as a table.',
      procedure: 'Extract the step-by-step procedure.',
      formulas:  'Extract all formulas and equations.',
    }[targetSection] || 'Generate the most appropriate structure.';

    const ctx = LearnerContext.forNoteGeneration(node);
    const prompt = ctx + '\n\n' + hint
      + '\n\nOutput ONLY valid JSON (no markdown):\n{"definitions":[{"term":"","examples":"","description":""}],"tables":[{"title":"","columns":["Name","Type","Example"],"rows":[["","",""]]}],"formulas":[{"expression":"","description":"","constraints":""}],"procedures":[{"title":"","appliesTo":"","steps":[""],"notes":""}],"commonMistakes":[],"summary":""}'
      + '\n\nOnly include items present in the image. Empty arrays for anything not shown.';

    const msgs = [{ role:'user', content:[
      { type:'image_url', image_url:{ url:'data:image/jpeg;base64,' + base64Image } },
      { type:'text', text:prompt }
    ]}];
    const raw = await this._callWithFunction('noteProcessing', msgs, 3000);
    return this._parseJSON(raw);
  },

  async restructureNotes(node) {
    const ctx = LearnerContext.forNoteGeneration(node);
    const prompt = ctx
      + '\n\nReorganise the SOURCE MATERIAL above into the structured JSON format below.'
      + '\nDO NOT add or remove content. Preserve every definition, formula, procedure, and value from the source.'
      + '\n\nOutput ONLY valid JSON:'
      + '\n{"title":"","definitions":[{"term":"","examples":"","description":""}],"tables":[{"title":"","columns":[],"rows":[[]]}],"formulas":[{"expression":"","description":"","constraints":""}],"procedures":[{"title":"","appliesTo":"","steps":[""],"notes":""}],"commonMistakes":[],"summary":""}';
    const raw = await this._callWithFunction('restructure', [{role:'user',content:prompt}], 3000);
    return this._parseJSON(raw);
  },

  /* ═══════════════════════════════════════════════════════
     STUDY-FIT CHECK — does each block display well for focused
     reading? Flags content (e.g. worked examples) that would be
     clearer in a structured format, and asks before reshaping.
  ═══════════════════════════════════════════════════════ */
  async analyzeStudyFit(node) {
    const preview = (b) => {
      if (b.html) return String(b.html).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0, 320);
      if (b.steps) return 'Steps: ' + (b.steps||[]).join(' | ').slice(0, 320);
      if (b.items) return (b.items||[]).map(i => i.term || i.expression || '').join('; ').slice(0, 320);
      if (b.rows)  return 'Table with ' + (b.rows||[]).length + ' rows';
      return '';
    };
    const blockList = (node.blocks || []).map(b =>
      '[id=' + b.id + ' | type=' + b.type + ' | title=' + (b.title || '(none)') + '] ' + preview(b)
    ).join('\n');

    const prompt =
      'You are reviewing a student\'s study notes, shown below as content blocks for the "Study / read & absorb" step.\n'
      + 'Some blocks may be WORKED EXAMPLES or illustrative examples that read poorly as plain prose during focused study — they would be clearer in a structured format.\n\n'
      + 'For each block, decide ONLY if it would display MORE CLEARLY in a different format. Flag a block only when switching genuinely helps:\n'
      + '  - a worked example / step-by-step solution → "procedure" (numbered steps)\n'
      + '  - a comparison or set of paired facts → "table"\n'
      + '  - a list of question/answer facts to memorise → "flashcards"\n'
      + '  - an important warning or key takeaway buried in prose → "callout"\n'
      + 'Do NOT flag well-formed definitions, formulas, tables, diagrams, or short clean prose. Be conservative.\n\n'
      + 'BLOCKS:\n' + blockList + '\n\n'
      + 'Output ONLY valid JSON, at most 2 suggestions:\n'
      + '{"suggestions":[{"blockId":"","suggestedType":"procedure|table|flashcards|callout","label":"short human label e.g. a worked example","reason":"one short sentence why it would read better"}]}\n'
      + 'If nothing needs changing, return {"suggestions":[]}.';

    const raw = await this._callWithFunction('chat', [{role:'user',content:prompt}], 700);
    const data = this._parseJSON(raw);
    return { suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [] };
  },

  /** Convert ONE existing block into a different display format.
   *  Returns a block object WITHOUT id (caller assigns id + position). */
  async reshapeBlockTo(block, targetType, node) {
    const schemas = {
      procedure:  '{"type":"procedure","title":"","appliesTo":"","steps":["step 1","step 2"],"notes":""}',
      table:      '{"type":"table","title":"","columns":["Col A","Col B"],"rows":[["",""]]}',
      flashcards: '{"type":"flashcards","title":"","cards":[{"front":"question","back":"answer"}]}',
      callout:    '{"type":"callout","title":"","tone":"tip","html":"<p>...</p>"}',
    };
    const schema = schemas[targetType] || schemas.procedure;

    const source = JSON.stringify({
      type: block.type, title: block.title || '',
      html: block.html || '', steps: block.steps || undefined,
      items: block.items || undefined, rows: block.rows || undefined,
      columns: block.columns || undefined, notes: block.notes || undefined,
    });

    const prompt =
      'Convert the SOURCE content block below into a "' + targetType + '" block.\n'
      + 'Preserve every fact, number, and step from the source — do not invent or drop content. '
      + 'Reorganise it so it reads clearly in the new format.\n\n'
      + 'SOURCE BLOCK:\n' + source + '\n\n'
      + 'Output ONLY valid JSON matching exactly this shape:\n' + schema;

    const raw = await this._callWithFunction('chat', [{role:'user',content:prompt}], 1500);
    const out = this._parseJSON(raw);
    if (!out || typeof out !== 'object') throw new Error('Could not reshape this block.');
    out.type = targetType; // force, in case the model echoed the old type
    return out;
  },

  /* ═══════════════════════════════════════════════════════
     UNDERSTANDING CHECK — assess-first teaching.
     Generates questions specific to THIS node's content, then
     evaluates the learner's answers gently against the source.
  ═══════════════════════════════════════════════════════ */
  async generateUnderstandingQuestions(node) {
    const ctx = LearnerContext.forQuestionGen(node);
    const prompt = ctx
      + '\n\nYou are a warm teacher checking what the student already knows BEFORE they read the notes.'
      + '\nGenerate exactly 3 short diagnostic questions about THIS specific topic, based only on the source material.'
      + '\nThe questions should surface the most important things to understand — the core concept, when it applies, and the easiest thing to get wrong.'
      + '\nMake them specific to the actual content, not generic. Each question one sentence.'
      + '\n\nOutput ONLY valid JSON:\n{"questions":[{"q":"","hint":"a short placeholder example answer to guide them"}]}';
    const raw = await this._callWithFunction('questionGen', [{ role:'user', content: prompt }], 700);
    return this._parseJSON(raw);
  },

  async evaluateUnderstanding(node, qaPairs) {
    const ctx = LearnerContext.forQuestionGen(node);
    const prompt = ctx
      + '\n\nYou are a warm, encouraging teacher. The student answered these diagnostic questions from memory BEFORE reading the notes.'
      + '\nTheir answers: ' + JSON.stringify(qaPairs)
      + '\n\nFor each answer, following these teaching rules:'
      + '\n- Praise what they got right and their reasoning, specifically (not generic praise).'
      + '\n- Gently note what is missing or slightly off — explain WHY, do not just say wrong.'
      + '\n- Base everything ONLY on the source material. Never introduce outside facts.'
      + '\n- Keep each piece of feedback to 2-3 short sentences. Simple language.'
      + '\nThen identify the 1-3 things they should focus on most while reading.'
      + '\n\nOutput ONLY valid JSON:\n{"perAnswer":[{"q":"","feedback":"","gotRight":"","toImprove":""}],"focusAreas":["",""],"encouragement":"one warm sentence"}';
    const raw = await this._callWithFunction('grading', [{ role:'user', content: prompt }], 1200);
    return this._parseJSON(raw);
  },

  /** Find how this node connects to other nodes in the same subject.
   *  Given the current node's source and a list of {id,title,summary} for
   *  sibling nodes, returns links the learner should be aware of. */
  async findConnections(node, otherNodes) {
    if (!otherNodes.length) return { connections: [] };
    const ctx = LearnerContext.forNode(node, { includeWeakness: false, includeHistory: false, maxSourceChars: 3000 });
    const list = otherNodes.map(n => '- [' + n.id + '] ' + n.title + (n.summary ? ': ' + n.summary.slice(0, 120) : '')).join('\n');
    const prompt = ctx
      + '\n\nHere are OTHER topics the student is studying in this subject:\n' + list
      + '\n\nIdentify up to 4 genuine connections between THIS topic and the others — where this topic builds on, depends on, contrasts with, or is applied by another. Base links ONLY on the actual content; do not invent relationships.'
      + '\nFor each, give the other topic id, a short relationship label (e.g. "builds on", "prerequisite for", "contrasts with"), and one plain sentence explaining the link.'
      + '\n\nOutput ONLY valid JSON:\n{"connections":[{"id":"","title":"","relationship":"","explanation":""}]}';
    const raw = await this._callWithFunction('chat', [{ role:'user', content: prompt }], 900);
    return this._parseJSON(raw);
  },

  async generateExamQuestion(node) {
    const ctx = LearnerContext.forQuestionGen(node);
    const prompt = ctx
      + '\n\nGenerate ONE realistic exam-style scenario question for this topic. Use only values, scenarios, and concepts that appear in the SOURCE MATERIAL above.'
      + '\n\nOutput ONLY valid JSON:\n{"scenario":"Full scenario with specific values from source…","requirement":"Required: Calculate/Explain…","marks":10,"modelAnswer":"Full worked answer using only source content…","markingGuidance":["1 mark for…"]}';
    const raw = await this._callWithFunction('examGeneration', [{role:'user',content:prompt}], 1500);
    return this._parseJSON(raw);
  },

  async analyzeSessionGaps(sessionData, allNodes) {
    const sessionCtx = LearnerContext.forSession();
    const prompt = sessionCtx
      + '\n\nThis session\'s data: ' + JSON.stringify(sessionData)
      + '\n\nAnalyse what happened. Reference real node names from the learner overview above.'
      + '\n\nOutput ONLY valid JSON:\n{"sessionSummary":"","strongAreas":[],"weakAreas":[],"nextSessionFocus":[],"examReadiness":"68%","dailyRecommendation":"45 min/day"}';
    const raw = await this._callWithFunction('gapAnalysis', [{role:'user',content:prompt}], 600);
    return this._parseJSON(raw);
  },

  async generateLecture(node) {
    const ctx = LearnerContext.forGuidedStudy(node);
    const prompt = ctx
      + '\n\nYou are a professional audiobook narrator and university lecturer. Write a lecture script (800-1200 words) using ONLY the SOURCE MATERIAL above.'
      + '\n\nWriting style for natural narration:'
      + '\n- Write in clear, complete sentences of moderate length. Avoid very long run-on sentences.'
      + '\n- Use short paragraphs (2-4 sentences each), separated by a blank line. Each paragraph covers one idea.'
      + '\n- Use natural spoken transitions ("Now,", "Next,", "Here\'s the key part,").'
      + '\n- Punctuate carefully — commas where a speaker would pause, full stops at every idea boundary.'
      + '\n- Conversational and warm, like reading a great textbook aloud to one student.'
      + '\n- End with three review questions whose answers are in the source.'
      + '\n\nDo NOT introduce facts, examples, or explanations not present in the source.'
      + '\nDo NOT use markdown, bullet points, or headers — write flowing prose meant to be read aloud.'
      + '\n\nLecture:';
    return await this._callWithFunction('lecture', [{role:'user',content:prompt}], 2000);
  },

  /** Slide-format lecture: structured JSON of teaching slides, drawn ONLY from
   *  the source material. Each slide is one idea: a title, a few bullet points,
   *  and a short spoken explanation meant to be read aloud. Activity slides are
   *  interleaved as break points where the learner does something. */
  async generateLectureSlides(node) {
    const ctx = LearnerContext.forGuidedStudy(node);
    const prompt = ctx
      + '\n\nYou are a university lecturer building a slide deck to teach this topic, using ONLY the SOURCE MATERIAL above.'
      + '\n\nBreak the material into a logical sequence of slides (aim for 5-10 teaching slides, more only if the source is large). There are TWO kinds of slide:'
      + '\n\n1. A TEACHING slide ("kind":"teach") covers ONE idea and has:'
      + '\n   - "title": a short slide heading (3-7 words).'
      + '\n   - "bullets": 2-4 concise bullet points (each a short phrase, the key facts for this slide).'
      + '\n   - "explanation": 2-4 sentences a lecturer would SAY aloud to explain this slide in plain, warm language. Complete sentences, well punctuated for natural narration.'
      + '\n\n2. An ACTIVITY slide ("kind":"activity") is a BREAK POINT where the learner does something before continuing:'
      + '\n   - "title": a short heading like "Your turn" or "Quick check".'
      + '\n   - "prompt": a clear question or short task the learner answers, based on what the PRECEDING slides just taught.'
      + '\n   - "answer": the correct/model answer, taken from the source — used to give the learner feedback.'
      + '\n   - "activityType": one of "recall" (state a fact/definition), "apply" (work a small problem/scenario), or "reflect" (explain in their own words).'
      + '\n\nSTRUCTURE: After every 2-3 teaching slides, insert ONE activity slide that checks what was just taught. Include a final activity near the end that pulls the topic together. So the deck flows: teach, teach, activity, teach, teach, activity, …'
      + '\n\nRULES:'
      + '\n- Use ONLY facts, definitions, formulas, and examples present in the source. Never add outside knowledge. Activity answers must be supported by the source.'
      + '\n- Cover the whole topic across the teaching slides — do not skip source content.'
      + '\n- The first slide should orient the learner; a teaching slide near the end should summarise the key takeaways.'
      + '\n- Bullets are for the eye; the explanation is for the ear. Do not just repeat the bullets verbatim in the explanation.'
      + '\n\nOutput ONLY valid JSON in exactly this shape (no markdown, no prose, no code fences):'
      + '\n{"slides":[{"kind":"teach","title":"","bullets":["",""],"explanation":""},{"kind":"activity","title":"","prompt":"","answer":"","activityType":"recall"}]}';
    // slideGen is a JSON-mode function, so the model is instructed to return raw
    // JSON on every provider path. Retry once if the first response won't parse.
    let raw = await this._callWithFunction('slideGen', [{role:'user',content:prompt}], 4000);
    try {
      return this._normalizeSlides(this._parseJSON(raw));
    } catch (e) {
      raw = await this._callWithFunction('slideGen', [
        {role:'user', content: prompt},
        {role:'assistant', content: raw},
        {role:'user', content: 'That was not valid JSON. Reply with ONLY the JSON object — start with { and end with } — no prose, no markdown, no code fences.'},
      ], 4000);
      return this._normalizeSlides(this._parseJSON(raw));
    }
  },

  /** Validate + clean a raw {slides:[...]} object into safe slide records.
   *  Handles both teaching slides and activity (break-point) slides.
   *  Pure and synchronous so it can be unit-tested. Throws if nothing usable. */
  _normalizeSlides(data) {
    const slides = Array.isArray(data?.slides) ? data.slides : [];
    const clean = slides.map(s => {
      if (s && s.kind === 'activity') {
        return {
          kind: 'activity',
          title: String(s.title || '').trim() || 'Your turn',
          prompt: String(s.prompt || s.question || '').trim(),
          answer: String(s.answer || '').trim(),
          activityType: ['recall','apply','reflect'].includes(s.activityType) ? s.activityType : 'recall',
        };
      }
      return {
        kind: 'teach',
        title: String(s?.title || '').trim() || 'Untitled slide',
        bullets: Array.isArray(s?.bullets) ? s.bullets.map(b => String(b || '').trim()).filter(Boolean).slice(0, 6) : [],
        explanation: String(s?.explanation || '').trim(),
      };
    }).filter(s => s.kind === 'activity' ? !!s.prompt : (s.bullets.length || s.explanation));
    if (!clean.length) throw new Error('The AI did not return any usable slides. Try again.');
    return clean;
  },

  /* ═══════════════════════════════════════════════════════
     REACTIVE RESHAPING — called automatically when a learner
     struggles with a question during review/practice. Produces
     a simpler breakdown plus an easier follow-up question, which
     the app injects into the node as a scaffold block.
  ═══════════════════════════════════════════════════════ */
  async generateScaffold(node, question) {
    const ctx = LearnerContext.forReviewCard(node, question);
    const prompt = ctx
      + '\n\nThe student is STRUGGLING with this question. Build a scaffold to help them understand.'
      + '\n\nWrite a SIMPLER breakdown using ONLY content from the source: 3-4 short plain-language sentences, ideally with a concrete analogy drawn from the source material. Then ONE easier, scaffolded practice question with its answer (also from source).'
      + '\n\nOutput ONLY valid JSON:\n{"scaffold":"the simpler breakdown","easierQuestion":{"question":"","answer":""}}';
    const raw = await this._callWithFunction('gapAnalysis', [{ role: 'user', content: prompt }], 700);
    return this._parseJSON(raw);
  },

  /* ═══════════════════════════════════════════════════════
     AI DIRECTOR — the AI takes the wheel. It evaluates the
     learner across all nodes and DICTATES a coordinated set of
     changes: per-node note method + learner profile + which
     blocks to emphasise, an overall study method, and study-plan
     guidance. Returns a structured directive the app applies.
  ═══════════════════════════════════════════════════════ */
  /** Study coach — answers questions about HOW the learner is studying
   *  (where to start, what's weak, what the plan is), using the full
   *  cross-node brain. Read-only: it advises, it doesn't change settings. */
  async studyCoach(question, history = [], exampleContext = null) {
    const ctx = LearnerContext.forSession();
    const toolkit =
      '\n\nYou also have a toolkit of proven techniques to draw on WHEN the question calls for it (do not dump the whole list — pick what fits, and tie it to their actual situation):'
      + '\n\nLEARNING & MEMORY:'
      + '\n- Active recall: test yourself from memory instead of re-reading. In this app: use the Review tab and the Recall step in Guided Study. You can also use the AI Lecture slideshow (tap the Study tab on any topic — it generates slides with narration and can be presented full-screen or played automatically).'
      + '\n- Spaced repetition: review just before you would forget; revisit weak cards more often. The Review tab schedules this automatically.'
      + '\n- The Feynman technique: explain a topic in plain words as if teaching it; the gaps you hit are what to study.'
      + '\n- Interleaving: mix related topics in a session rather than blocking one for hours — better for telling similar ideas apart (useful for accounting where formats look alike).'
      + '\n- Worked-example study: for accounting, study a full solved example, then redo it covered-up before attempting a new one.'
      + '\nTIME MANAGEMENT:'
      + '\n- Pomodoro: 25 min focused, 5 min break; longer break every 4 rounds. Good for starting when motivation is low.'
      + '\n- Time-blocking: assign topics to specific slots so decisions are made in advance.'
      + '\n- Eat-the-frog: do the hardest/most-dreaded topic first while energy is highest.'
      + '\n- 2-minute start: commit to just 2 minutes; starting is the hard part.'
      + '\nSTRESS & WELLBEING:'
      + '\n- Box breathing (4-4-4-4) or slow exhales to settle pre-exam nerves.'
      + '\n- Reframe: some arousal sharpens performance; "I am prepared" beats "I must not fail".'
      + '\n- Protect sleep before an exam — cramming past exhaustion loses more than it gains. No all-nighters.'
      + '\n- Break overwhelm into the single next small action rather than the whole mountain.'
      + '\nEXAM TECHNIQUE:'
      + '\n- Skim the paper, do easiest marks first, watch mark allocations for time-per-question.'
      + '\n- For accounting: lay out the format first (account/statement headings), then fill figures.'
      + '\n- Practise under timed, closed-book conditions before the exam, not just open review.';
    let streakLine = '';
    try {
      if (typeof StreakTracker !== 'undefined') {
        const st = StreakTracker.getStats();
        const studiedToday = st.lastDate === new Date().toISOString().slice(0, 10);
        streakLine = '\n\nSTREAK: ' + st.streak + '-day streak (longest ' + st.longest + '). They have ' + (studiedToday ? 'already studied today' : 'NOT studied yet today') + '.'
          + '\nIf they have not studied today and it fits the conversation, you may gently note that one small session keeps the streak alive — but never guilt-trip, and do not bring it up every turn.';
      }
    } catch {}
    const sys = ctx
      + '\n\nCURRENT DATE & TIME on the student\'s device: ' + this._nowContext() + '.'
      + '\nUse this to gauge urgency against any exam date, to frame what is due today, and to fit suggestions to the time of day (e.g. a shorter recall-focused session late at night). It is context for better advice only — do NOT comment on the time, the day, or tell them to rest/sleep unless they raise it themselves.'
      + streakLine
      + '\n\nYou are the student\'s personal study coach. You can see their whole library: every topic, mastery level, weak spots, study history, and plan.'
      + '\nAnswer questions about HOW they should study — where to start, what to prioritise, what they keep getting wrong, how to manage time, and how to handle stress.'
      + '\n\nAPP FEATURES (always current — read from AppFeatures.js):\n'
      + (typeof AppFeatures !== 'undefined'
          ? AppFeatures.map(f =>
              '- ' + f.name + ' [' + f.where + ']: ' + f.what
              + (f.coachTip ? ' Coach tip: ' + f.coachTip : '')
            ).join('\n')
          : '(feature list unavailable)')
      + toolkit
      + '\n\nBe specific and reference their actual topics, numbers, and weak areas. When you give a technique, briefly say how to apply it to THEIR situation, and point to the app feature that helps where relevant. Be warm and direct. Keep replies SHORT — at most 2-3 short paragraphs or 4-5 brief bullet-style points, and always finish your final sentence. Do not pad. A complete short answer is far better than a long one that gets cut off.'
      + '\nFORMATTING: Write in plain text suitable for a phone chat bubble. Do NOT use LaTeX or math delimiters ($$, \\frac, \\text, \\times) — write maths in plain words and symbols, e.g. "R414 000 / 1.15 = R360 000" and "R360 000 x 10% = R36 000". Do NOT use markdown tables (no | pipes |), markdown headers (no ##), or HTML tags (no <br/>). For step layouts, use short labelled lines or simple numbered steps. Keep figures readable in prose.'
      + '\nYou mainly advise. You may also PROPOSE an action (see below) which the student must confirm before anything happens — you never change things directly or silently.'
      + '\nNever invent topics or numbers not in the data above. You are not a medical professional; for serious or persistent distress, gently suggest they reach out to a person they trust or a campus counsellor.'
      + '\n\nACTIONS: if (and only if) the student clearly wants you to DO something you are able to do, you may propose ONE action for them to confirm. Append it on the VERY LAST line, alone, in this exact format:'
      + '\n[[ACTION:startGuided|node=EXACT NODE TITLE]] — begin a guided study session at that topic'
      + '\n[[ACTION:openExamples|node=EXACT NODE TITLE]] — open that topic\u2019s Examples tab in the Library so they can work through its worked examples'
      + '\n[[ACTION:teachExample|node=EXACT NODE TITLE]] — pull up that topic\u2019s worked example and teach it step by step right here in the chat'
      + '\n[[ACTION:openReview]] — open the Review tab'
      + '\n[[ACTION:openLibrary]] — open the Library'
      + '\n[[ACTION:openStudyPlan]] — open the Study Plan tab so they can view or create a study plan'
      + '\n[[ACTION:runDirector]] — trigger a full AI assessment (the Director) that reshapes the student\'s entire study approach based on their current evidence. Use this when they ask for a deep evaluation or feel lost.'
      + '\n[[ACTION:setLoad|level=light|reason=SHORT REASON]] — set how heavy THIS study session should be. Levels: light (tired/busy/short on time — fewer cards, focused), normal (default), deep (energised/free time — more cards, draws in any deferred backlog). CRITICAL: never assume the level from their mood. CONFIRM first in your reply — e.g. ask \u201cWant me to keep tonight light, or push through?\u201d — and only append this action once they have actually chosen. The student owns this lever, not you. Skipped work on a light day is not lost — review cards stay due and plan tasks roll forward.'
      + '\nRules for actions: only use a node title that appears in the data above; propose at most one; never propose an action they did not ask for; if they are only asking for advice, do NOT append an action. Write your normal helpful answer first, THEN the action line if warranted.'
      + '\nSIGNAL: After your answer (and action if any), append ONE final line in this exact format — this is for internal memory, never shown to the student:'
      + '\n[[SIGNAL:one sentence — what this student seems confused about, worried about, or needs, based on their question. e.g. "Student confused about VAT output tax distinction." or "Student anxious about exam time management." or "Student asked about Gross Income deductions — seems to understand basics." Be specific, name topics.]]'
      + '\nABOUT EXAMPLES: In normal turns you see only example TITLES, not their full content, so do not invent figures. But you CAN teach an example: if the student wants to work through one, propose [[ACTION:teachExample|node=...]] — confirming it loads that example\u2019s full saved content into the chat so you can walk through it step by step. Or propose [[ACTION:openExamples|node=...]] to open the topic\u2019s Examples tab in the Library. Prefer teachExample when they want you to explain an example, openExamples when they just want to find and read it themselves.';
    // Pass the large system prompt separately so Claude can cache it.
    // The user message contains only the question + recent history (changes every turn).
    const userMsg = 'The student asks: "' + question + '"'
      + (history.length
          ? '\n\nRecent conversation:\n'
            + history.slice(-4).map(h => (h.role === 'user' ? 'Student: ' : 'Coach: ') + h.text).join('\n')
          : '');
    const messages = [{ role: 'user', content: userMsg }];
    let cap = 1100;
    if (exampleContext) {
      messages[0].content += '\n\nThe student is working through this specific worked example from their own material. '
        + 'Teach directly from it — explain the method step by step, reference the actual figures, and after explaining, prompt them to redo it covered-up.\n\n'
        + exampleContext;
      cap = 1500;
    }
    return await this._callClaudeWithCache(sys, messages, cap);
  },

  async directLearning(nodes, opts = {}) {
    const profile = opts.statedLevel || 'unknown';
    const global  = opts.globalState || {};
    const evidence = nodes.map(n => {
      const ratings    = (n.questions || []).flatMap(q => q._perf?.attempts || []);
      const avgRating  = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : 'none';
      const lastAct    = LearnerMemory.getNodeActivitySummary(n);
      const weakQs     = LearnerMemory.getWeakQuestionsText(n);
      const exCount = (n.workedExamples || []).length;
      return `- "${n.title}" (${n.subject || 'general'}) — mastery ${n.masteryScore}%, ${n.questions?.length || 0} questions, ${n.dueQuestions?.().length || 0} due, reviews ${n.reviewCount || 0}, avg self-rating ${avgRating}/4, profile "${n.learnerProfile || 'college'}"${exCount ? ', ' + exCount + ' worked example(s) saved' : ''}${lastAct ? ', last session: "' + lastAct + '"' : ''}${weakQs ? ', struggles: ' + weakQs.replace(/\n/g,'; ') : ''}`;
    }).join('\n');

    const globalSummary = global.totalSessions
      ? `\nLEARNER HISTORY: ${global.totalSessions} total sessions. Last studied: ${global.lastStudied ? new Date(global.lastStudied).toLocaleDateString() : 'unknown'}.`
      : '';

    // Build plan block — same detail level the Coach receives via LearnerContext
    const pc = opts.planContext;
    const planSummary = pc
      ? `\nSTUDY PLAN: "${pc.title}"${pc.daysToExam !== null ? ` — exam in ${pc.daysToExam} day${pc.daysToExam === 1 ? '' : 's'}` : ''}`
        + (pc.dailyMinutes ? ` — ${pc.dailyMinutes} min/day budgeted` : '')
        + (pc.progressFraction ? ` — progress: ${pc.progressFraction} tasks done (${pc.progressPct}%)` : '')
        + (pc.todayTasks?.length
            ? `\nToday's scheduled tasks: ${pc.todayTasks.join(', ')}`
            : `\nNo tasks scheduled for today.`)
      : opts.daysToExam !== null && opts.daysToExam !== undefined
        ? `\nDays to exam: ${opts.daysToExam} (no study plan set)`
        : `\nNo exam date or study plan set.`;

    const methods = '"standard" (definitions/formulas/blocks), "cornell" (cue/notes/summary — good for lectures), "outline" (nested hierarchy — good for structured theory), "feynman" (explain-it-simply — good for concepts you struggle to articulate)';
    const profiles = '"primary", "high", "college", "pro"';

    // Include shared memory so Director sees what Coach recently learned about this student
    const sharedMemory = (typeof LearnerState !== 'undefined') ? LearnerState.toPromptBlock() : '';

    const prompt =
`You are the lead tutor and learning director inside a study app. You are given the learner's whole library with hard performance evidence INCLUDING cross-session history. Your job is to EVALUATE them and then DICTATE concrete changes — you decide, don't ask.

Stated level (may be "unknown" — infer from evidence if so): ${profile}${globalSummary}${planSummary}${sharedMemory ? '\n\n' + sharedMemory : ''}

TODAY on the learner's device: ${this._nowContext()}. Use this together with the days-to-exam figure to judge real urgency and pacing.

LIBRARY & EVIDENCE (includes last session activity and struggle patterns):
${evidence}

Decide, per node, the single best note method from: ${methods}.
Decide the best learner profile from: ${profiles} (match it to how they're actually performing, not just the stated level).
Pick ONE overall study method to push right now: "review" (they're forgetting — spaced repetition), "guided" (shaky understanding — step-by-step), "blank-recall" (decent but passive — active recall), or "exam" (strong — test under pressure).
Flag the nodes that need urgent attention based on struggle patterns and mastery.

Output ONLY valid JSON:
{
  "assessment": "2-3 sentences: your honest read of where this learner is and why, referencing real node names, numbers, and session history",
  "overallStudyMethod": "review|guided|blank-recall|exam",
  "studyMethodWhy": "one sentence",
  "nodeDirectives": [
    { "title": "exact node title", "noteMethod": "standard|cornell|outline|feynman", "profile": "primary|high|college|pro", "why": "short reason referencing their actual performance", "urgent": true }
  ],
  "planGuidance": "2-3 sentences of study-plan direction. If a plan exists, reference today's scheduled tasks and plan progress directly. If behind on plan, say so. If a weak topic needs pulling forward, name it.",
  "startNodeTitle": "the EXACT title of the single node the learner should begin with right now",
  "firstAction": "one specific next step the learner should take right now"
}`;

    // 2500 tokens: at 50 nodes the output JSON needs ~1700 tokens. 1600 caused silent
    // truncation of nodeDirectives — later nodes simply missing from the evaluation.
    // 'director' function uses a stronger model than gapAnalysis — cross-topic reasoning
    // needs more capacity than a simple gap scan. Falls back to gapAnalysis model if unset.
    const raw = await this._callWithFunction('director', [{ role: 'user', content: prompt }], 2500);
    return this._parseJSON(raw);
  },

  async checkAnswer(question, correctAnswer, studentAnswer, subject, node = null) {
    // If we have the node, use full LearnerContext for source-faithful grading
    const ctx = node ? LearnerContext.forReviewCard(node, { question, answer: correctAnswer })
                     : LearnerContext._hardRules();
    const prompt = ctx
      + '\n\nGrade this student answer against the model answer and the source material.'
      + '\nStudent answer: "' + studentAnswer + '"'
      + '\nSubject: ' + (subject || 'general')
      + '\n\nIMPORTANT: Mark based on whether the student\'s answer matches what the SOURCE MATERIAL says — not your own knowledge of the topic.'
      + '\nIf the student gives a correct-sounding answer that contradicts the source, mark it partially correct and quote the source.'
      + '\n\nOutput ONLY valid JSON: {"correct":true,"score":0,"feedback":"","keyPointsMissed":[]}';
    const raw = await this._callWithFunction('grading', [{role:'user',content:prompt}], 500);
    return this._parseJSON(raw);
  },

  async gradeImageAnswer(imageBase64, studentAnswer, modelAnswer, subject) {
    const prompt = 'Grade this answer for ' + subject + '.\nModel: ' + (modelAnswer||'none') + '\nStudent: ' + studentAnswer + '\n\nOutput ONLY valid JSON: {"score":0,"feedback":"","keyPointsMissed":[],"correct":false}';
    const msgs = imageBase64 && this.supportsVision()
      ? [{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+imageBase64}},{type:'text',text:prompt}]}]
      : [{role:'user',content:prompt}];
    const raw = await this._callWithFunction('grading', msgs, 400);
    return this._parseJSON(raw);
  },

  /* ═══════════════════════════════════════════════════════
     BLOCK PLANNER — the new adaptive core.
     Given a topic + learner profile, the model returns an
     ordered list of blocks. The renderer draws whatever it gets.
  ═══════════════════════════════════════════════════════ */
  async generateBlocks(topic, profile = 'college', node = null) {
    const profileGuide = {
      primary: 'a primary-school child (age 6-11). Explain every concept in the simplest possible words. Use everyday analogies, include the technical term in brackets. Use match games and flashcards alongside prose.',
      high:    'a high-school student. Use plain language, define every technical term, give one real-world example per concept.',
      college: 'a college/university student. Use precise academic language. Include technical terms with definitions.',
      pro:     'a working professional. Be concise. Use industry terminology, surface practical implications and edge cases.',
    }[profile] || 'a college student.';

    // Build source text from node if available
    const sourceText = node
      ? [
          node.rawOCR || '',
          node.summary || '',
          (node.definitions||[]).slice(0,8).map(d => d.term + ': ' + d.description).join('\n'),
          (node.formulas||[]).slice(0,4).map(f => f.expression + ' — ' + f.description).join('\n'),
          (node.procedures||[]).slice(0,2).flatMap(p => [p.title, ...(p.steps||[])]).join('\n'),
        ].filter(Boolean).join('\n\n').slice(0, 5000)
      : '';

    const sourceConstraint = sourceText
      ? 'SOURCE MATERIAL (use ONLY this — do not add facts from outside knowledge):\n---\n' + sourceText + '\n---\n\n'
        + 'FAITHFULNESS RULE: Every definition, formula, procedure step, and fact in your blocks must be directly supported by the source material above. Do not add explanations, examples, or values not present in the source.\n\n'
      : '';

    const prompt =
`${LearnerContext._hardRules()}

You are an adaptive learning designer. Restructure the material for "${topic}" shaped for ${profileGuide}

${sourceConstraint}Choose the BEST mix of blocks for THIS topic and THIS learner. Block types:

- prose:      {"type":"prose","title":"","html":"explanatory HTML using <b> <code> <em>"}
- callout:    {"type":"callout","title":"","tone":"tip|warn","html":""}
- definition: {"type":"definition","title":"","items":[{"term":"","examples":"","description":""}]}
- formula:    {"type":"formula","title":"","items":[{"expression":"","description":"","constraints":""}]}
- table:      {"type":"table","title":"","columns":[],"rows":[[]]}
- procedure:  {"type":"procedure","title":"","appliesTo":"","steps":[""],"notes":""}
- code:       {"type":"code","title":"","lang":"sql|js","setup":"SQL to create+seed tables (sql only)","code":"starter code"}
- calc:       {"type":"calc","title":"","resultLabel":"","inputs":[{"key":"x","label":"","default":0}],"formula":"x*2","breakdownSteps":[{"label":"","expr":"x*2"}]}
- quiz:       {"type":"quiz","title":"","q":"","options":["",""],"answer":0,"fb":"why"}
- cloze:      {"type":"cloze","title":"","text":"A sentence from the source with the key term written as {{term}}. Use 1-4 blanks. For synonyms use {{net|net amount}}."}
- match:      {"type":"match","title":"","pairs":[["left","right"]]}
- flashcards: {"type":"flashcards","title":"","cards":[{"front":"","back":""}]}
- diagram:    {"type":"diagram","title":"","steps":["a","b","c"]}

RULES:
- 3 to 6 blocks ordered as a lesson flows.
- Include at least one active-recall block (cloze or quiz) so the learner tests themselves, not just reads. Prefer cloze for definitions and key terms.
- Only use information from the source material.
- Output ONLY a JSON array of blocks. No markdown, no prose.

JSON array:`;

    const raw = await this._callWithFunction('noteProcessing', [{ role: 'user', content: prompt }], 3500);
    let parsed;
    try {
      parsed = this._parseJSON(raw.trim().startsWith('[') ? '{"blocks":' + raw + '}' : raw);
    } catch(e) {
      throw new Error('AI returned invalid block data. Try regenerating again.');
    }
    const blocks = Array.isArray(parsed) ? parsed : (parsed.blocks || []);
    if (!blocks.length) throw new Error('AI returned no blocks. Try regenerating again.');
    return blocks;
  },

  /* ─── Internal: full structure generation ─── */
  async _generateFullStructure(ocrText, meta, subjectCategory='general', onProgress=()=>{}) {
    const detail      = {quick:'Be concise.',standard:'Be thorough.'}[meta.detail||'standard'] || 'Be thorough.';
    const profileNote = this.profileContext(this._activeProfile || meta.profile || 'college');
    const hardRules   = LearnerContext._hardRules();

    const subjectGuide = {
      accounting: 'Extract: T-accounts, debits/credits, formulas, journal entry formats, account types, financial statement items. Create tables for any account comparisons or classifications in the source.',
      law:        'Extract: section numbers verbatim, legal definitions word-for-word, case names, requirements lists, exceptions and qualifications, procedural steps.',
      programming:'Extract: syntax rules, function/method signatures, code examples exactly as written, algorithms, data structures, input/output rules.',
      science:    'Extract: definitions with units, formulas exactly as written, experimental steps, measurements and values from the source.',
      medicine:   'Extract: anatomical terms, drug names and dosages as written, diagnostic criteria lists, treatment protocol steps.',
      maths:      'Extract: theorems verbatim, formulas exactly as written with all variable definitions, worked example steps and values.',
      history:    'Extract: dates, event names, key figures, causes and consequences exactly as described in the source.',
      language:   'Extract: grammar rules, vocabulary with definitions, conjugation tables, example sentences from the source.',
      general:    'Extract all definitions, facts, formulas, procedures, and key points exactly as written.',
    }[subjectCategory] || 'Extract all definitions, facts, formulas, procedures, and key points exactly as written.';

    // ── PASS 1: strict verbatim extraction ──────────────────────────
    const extractPrompt = hardRules + '\n\n'
      + 'TASK: You are a transcription system. Extract EVERY piece of information from the source below. Do not stop early. Do not skip anything.\n\n'
      + 'SUBJECT: ' + (meta.subject||'this subject') + '. CHAPTER: ' + (meta.chapter||'Unspecified') + '.\n'
      + profileNote + '\n'
      + 'EXTRACTION RULES FOR ' + (subjectCategory||'general').toUpperCase() + ':\n' + subjectGuide + '\n\n'
      + 'COMPLETENESS IS THE MOST IMPORTANT RULE:\n'
      + 'EVERY definition, formula, table, and procedure step in the source MUST appear in the output.\n'
      + 'If you are running low on space, use shorter descriptions — but NEVER skip an item.\n'
      + 'A missing item is a worse error than a slightly short description.\n\n'
      + 'NON-NEGOTIABLE CONSTRAINTS:\n'
      + '1. Every definition description must be a direct quote or close paraphrase from the source.\n'
      + '2. Every formula must appear in the source — do not derive or infer formulas not written.\n'
      + '3. Every procedure step must be taken from the source word-for-word.\n'
      + '4. Table rows must contain only values that appear in the source.\n'
      + '5. The summary must only contain points explicitly made in the source.\n'
      + '6. If a field has nothing in the source, leave it as an empty array. Do NOT fill it.\n'
      + '7. Common mistakes: only include if explicitly mentioned in the source.\n\n'
      + 'Output ONLY this JSON (no markdown, no fences).\n'
      + 'CRITICAL ORDERING: the "blocks" array must list content in the EXACT order it appears in the source — do not regroup or reorder. If the source goes definition, then procedure, then table, the blocks array must follow that same sequence. Each block: {"kind":"prose|definition|formula|procedure|table","ref":"matching title or term"}.\n'
      + 'Procedures and tables are ordered first to prevent truncation:\n'
      + '{"title":"","blocks":[{"kind":"","ref":""}],"procedures":[{"title":"","appliesTo":"","steps":[""],"notes":""}],'
      + '"tables":[{"title":"","columns":[],"rows":[[]]}],'
      + '"formulas":[{"expression":"","description":"","constraints":""}],'
      + '"definitions":[{"term":"","examples":"comma-separated examples from source","description":""}],'
      + '"commonMistakes":[],"summary":""}\n\n'
      + 'SOURCE MATERIAL:\n---\n' + ocrText.slice(0, 12000) + '\n---\n\n'
      + 'Respond with ONLY the JSON object starting with {';

    const msgs = [{role:'user', content:extractPrompt}];
    // Raised token limit — dense notes can easily exceed 4000 tokens
    const raw  = await this._callWithFunction('noteProcessing', msgs, 6000);

    let extracted;
    try {
      extracted = this._parseJSON(raw);
    } catch(e) {
      console.warn('JSON parse failed on first attempt, retrying extraction:', e.message);
      try {
        const start = raw.indexOf('{');
        const end   = raw.lastIndexOf('}');
        if (start !== -1 && end > start) extracted = this._parseJSON(raw.slice(start, end + 1));
      } catch(e2) { /* fall through to clean fallback */ }
    }

    if (!extracted) {
      const cleanSummary = raw
        .replace(/```json[\s\S]*?```/gi, '')
        .replace(/```[\s\S]*?```/gi, '')
        .replace(/^\s*[\[{][\s\S]*[\]}]\s*$/m, '')
        .replace(/\s+/g, ' ').trim().slice(0, 500);
      return {
        title: meta.chapter || meta.subject || 'Untitled',
        definitions: [], tables: [], formulas: [],
        procedures: [], commonMistakes: [],
        summary: cleanSummary || 'Notes could not be fully processed. Try scanning again.',
      };
    }

    // ── PASS 2: faithfulness check — FLAG only, never delete ────────
    // Changed: Pass 2 no longer removes content. It only flags items that appear
    // to be outside the source. Removing in Pass 2 was silently dropping
    // legitimate content that was phrased differently from the OCR.
    const hasContent = (extracted.definitions?.length || extracted.formulas?.length ||
                        extracted.procedures?.length || extracted.tables?.length);
    if (hasContent && ocrText.length > 200) {
      onProgress(2, 'Checking faithfulness to source…');
      try {
        const checkPrompt =
          'Check if this extraction added anything NOT in the source.\n\n'
          + 'SOURCE:\n---\n' + ocrText.slice(0, 6000) + '\n---\n\n'
          + 'EXTRACTION:\n' + JSON.stringify({
              definitions: (extracted.definitions||[]).slice(0, 15),
              formulas:    (extracted.formulas||[]).slice(0, 8),
              procedures:  (extracted.procedures||[]).slice(0, 5),
            }) + '\n\n'
          + 'For each item: is it supported by the source (KEEP) or clearly invented (FLAG)?\n'
          + 'If unsure, KEEP it. Only FLAG items that clearly do not appear in the source at all.\n'
          + 'Do NOT flag items just because wording differs from source.\n'
          + 'Output ONLY: {"flagged":[{"type":"definition|formula|procedure","term_or_title":"","reason":"one line"}]}\n'
          + 'If nothing flagged: {"flagged":[]}\n\nJSON:';

        const checkRaw = await this._callWithFunction('noteProcessing',
          [{role:'user', content:checkPrompt}], 800);
        const checked  = this._parseJSON(checkRaw);

        // Store flags for visibility — but KEEP all extracted content
        if (checked?.flagged?.length) {
          extracted._faithfulnessFlags = checked.flagged;
          console.info('[AIService] Faithfulness flags (content kept):', checked.flagged);
        }
      } catch(e) {
        console.warn('[AIService] Faithfulness check failed, using raw extraction:', e.message);
      }
    }
    return extracted;
  },

  async _generateQuestions(notes, meta, subjectCategory='general') {
    // Load past exam style if available
    const examKey = 'kn_exam_style_' + (meta.subject||'').toLowerCase().replace(/\s+/g,'_');
    let examStyleNote = '';
    try {
      const stored = JSON.parse(localStorage.getItem(examKey) || '{"papers":[]}');
      if (stored.papers?.length) {
        const latest = stored.papers[stored.papers.length - 1];
        const a = latest.analysis;
        examStyleNote = '\n\nPAST EXAM STYLE for this subject: Question types: ' + (a.questionTypes||[]).join(', ')
          + '. Mark pattern: ' + (a.markPattern||'') + '. Style: ' + (a.style||'')
          + '. Generate questions in the same style and difficulty as this exam.';
      }
    } catch {}
    const nr = meta.detail==='quick'?3:5;
    const na = meta.detail==='quick'?2:3;
    const qProfileNote = this.profileContext(this._activeProfile || meta.profile || 'college');
    const hardRules = LearnerContext._hardRules();

    const questionStyle = {
      accounting: 'For recall: ask students to define terms, state rules, give formulas. For application: give a transaction scenario and ask them to journalise, calculate, or classify it.',
      law:        'For recall: ask for definitions of legal terms, section numbers, requirements. For application: give a factual scenario and ask whether a rule applies and why.',
      programming:'For recall: ask for syntax, what a function/method does, data type differences. For application: give a coding problem or buggy code and ask them to solve/fix it.',
      science:    'For recall: ask for definitions, units, laws. For application: give a problem with numbers to calculate, or describe an experiment outcome.',
      medicine:   'For recall: ask for anatomical terms, drug classes, diagnostic criteria. For application: give a patient case and ask for diagnosis or treatment.',
      maths:      'For recall: ask for theorem statements, formula definitions. For application: give a numerical problem to solve step by step.',
      general:    'Mix recall (definitions, key points) with application (scenarios, problem-solving).',
    }[subjectCategory] || 'Mix recall (definitions, key points) with application (scenarios, problem-solving).';

    const prompt = hardRules + '\n\nYou are an exam question writer. Your ONLY job is to write questions whose answers are directly and explicitly stated in the SOURCE MATERIAL below.\n\n'
      + 'SUBJECT: ' + (meta.subject||'academic study') + '. ' + qProfileNote + '\n'
      + 'Question style: ' + questionStyle + '\n'
      + 'Generate exactly ' + nr + ' recall questions and ' + na + ' application questions.\n\n'
      + 'STRICT RULES:\n'
      + '1. Every question answer must be a direct quote or close paraphrase from the source — not from your own knowledge.\n'
      + '2. Before writing each question, find the exact sentence or value in the source that answers it. If you cannot find it, do not write the question.\n'
      + '3. For application questions: use only values, scenarios, and examples that appear in the source.\n'
      + '4. CRITICAL — Data-dependent questions: If an application question asks the student to calculate, compute, or analyse using specific figures (e.g. from a financial statement, a table, or a dataset), you MUST include all the necessary data/figures directly in the question text itself. The student has no other way to access the data during practice. Example: instead of "Using Tuscany Dealers\' statement, calculate gross profit %", write "Tuscany Dealers had revenue of R450,000 and cost of sales of R270,000. Calculate the gross profit percentage." Never ask a calculation question that references data without including that data.\n'
      + '5. Do NOT write questions testing knowledge that is not in the source.\n'
      + '6. If the source has fewer facts than the requested question count, write fewer questions — quality over quantity.\n\n'
      + 'Output ONLY raw JSON (no markdown, no fences):\n'
      + '{"recall":[{"question":"","answer":""}],"application":[{"question":"","answer":""}]}'
      + examStyleNote
      + '\n\nSOURCE MATERIAL:\n' + JSON.stringify({
          title:       notes.title,
          definitions: (notes.definitions||[]).slice(0,12),
          formulas:    (notes.formulas||[]).slice(0,6),
          procedures:  (notes.procedures||[]).slice(0,4),
          tables:      (notes.tables||[]).slice(0,4),
          summary:     notes.summary,
        })
      + '\n\nRespond with ONLY the JSON object starting with {"recall":';
    const msgs = [{role:'user', content:prompt}];
    const raw = await this._callWithFunction('questionGen', msgs, 2500);
    try {
      return this._parseJSON(raw);
    } catch(e) {
      console.warn('Questions JSON failed, returning empty:', e.message);
      return { recall: [], application: [] };
    }
  },

  /* ─── Template rewriting: AI restructures content into chosen method ─── */
  async rewriteAsTemplate(node, templateId) {
    const ctx = LearnerContext.forNoteGeneration(node);
    if (!ctx.includes('SOURCE MATERIAL')) throw new Error('No source content to rewrite.');

    const subject = node.subject || 'this subject';
    const title   = node.title || 'this topic';

    if (templateId === 'cornell') {
      const prompt = ctx
        + '\n\nRestructure the SOURCE MATERIAL above into Cornell format for: "' + title + '" (' + subject + ').'
        + '\n\nCornell format has 3 parts:'
        + '\n- CUES: Short keywords, questions, and prompts (left column). One cue per key concept.'
        + '\n- NOTES: Detailed explanations from the source (right column). Must match the cues.'
        + '\n- SUMMARY: 3-4 sentences that capture the topic in plain language using only source content.'
        + '\n\nOutput ONLY raw JSON: {"cues":"","notes":"","summary":""}';
      const msgs = [{role:'user',content:prompt}];
      const raw = await this._callWithFunction('restructure', msgs, 2000);
      return { type:'cornell', data: this._parseJSON(raw) };

    } else if (templateId === 'outline') {
      const prompt = ctx
        + '\n\nRestructure the SOURCE MATERIAL above into a hierarchical outline for: "' + title + '" (' + subject + ').'
        + '\nOutline format: numbered main sections (1., 2., 3.) with lettered sub-points (a., b., c.) and details (i., ii.).'
        + '\nUse ONLY content from the source. Where source is thin, reflect that honestly.'
        + '\n\nOutput ONLY raw JSON: {"outline":"<the full numbered outline as plain text, use \\n for line breaks>"}';
      const msgs = [{role:'user',content:prompt}];
      const raw = await this._callWithFunction('restructure', msgs, 2000);
      return { type:'outline', data: this._parseJSON(raw) };

    } else if (templateId === 'feynman') {
      const prompt = ctx
        + '\n\nRestructure the SOURCE MATERIAL above into a Feynman explanation for: "' + title + '" (' + subject + ').'
        + '\nFeynman format: explain the topic as if teaching a complete beginner. Use simple language and analogies drawn from source examples.'
        + ' Then identify the gaps — the parts hard to explain simply (these are what to study more).'
        + '\nBase the explanation ONLY on the source. Quote directly where uncertain.'
        + '\n\nOutput ONLY raw JSON: {"explanation":"","analogies":"","gaps":"","keyTakeaway":""}';
      const msgs = [{role:'user',content:prompt}];
      const raw = await this._callWithFunction('restructure', msgs, 2000);
      return { type:'feynman', data: this._parseJSON(raw) };
    }

    throw new Error('Unknown template: ' + templateId);
  },

  async _extractSingleImageText(base64, mediaType='image/jpeg') {
    // Claude has a 5MB image limit — always resize to fit before sending
    const safeBase64 = await this._resizeImageForClaude(base64, mediaType);
    const msgs = [{role:'user',content:[
      {type:'image_url',image_url:{url:'data:image/jpeg;base64,'+safeBase64}},
      {type:'text',text:'You are an OCR system. Extract ALL text from this image EXACTLY as it appears — word for word, character for character. Do NOT interpret, summarise, correct, or add anything. Do NOT use your own knowledge. Do NOT wrap the output in JSON or code fences. Output ONLY the raw extracted text, preserving all numbers, formulas, tables, and formatting.'}
    ]}];
    return await this._callWithFunction('ocr', msgs, 3000);
  },

  /** Resize image to stay under Claude 5MB limit — maintains readability for OCR */
  _resizeImageForClaude(base64, mediaType='image/jpeg') {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Max 2000px on longest side — enough for clear text OCR
        const MAX = 2000;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // Try quality 0.92 first, reduce only if still over 4MB
        let quality = 0.92;
        let result = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        while (result.length > 4000000 && quality > 0.5) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        }
        resolve(result);
      };
      img.onerror = () => resolve(base64);
      img.src = 'data:' + mediaType + ';base64,' + base64;
    });
  },

  async _extractMultiPageText(base64Images, mediaTypes=[]) {
    // Resize all images in parallel first
    const resized = await Promise.all(
      base64Images.map((b64, i) => this._resizeImageForClaude(b64, mediaTypes[i] || 'image/jpeg'))
    );

    // For 3 or fewer pages: send all in one request (fastest)
    if (resized.length <= 3) {
      const content = [
        ...resized.map((b64,i) => [
          {type:'text', text:'[Page '+(i+1)+' of '+resized.length+']'},
          {type:'image_url', image_url:{url:'data:image/jpeg;base64,'+b64}},
        ]).flat(),
        {type:'text', text:'Extract all text from ALL pages in order. Mark page breaks with [PAGE BREAK]. Do NOT wrap the output in JSON or code fences. Output ONLY extracted text:'},
      ];
      return await this._callWithFunction('ocr', [{role:'user',content}], 6000);
    }

    // For 4+ pages: extract all pages in parallel (much faster than sequential)
    const pageTexts = await Promise.all(
      resized.map((b64, i) => this._callWithFunction('ocr', [{role:'user',content:[
        {type:'image_url', image_url:{url:'data:image/jpeg;base64,'+b64}},
        {type:'text', text:'Extract ALL text from this page exactly as it appears. Do NOT wrap the output in JSON or code fences. Output ONLY the extracted text.'}
      ]}], 2000))
    );

    return pageTexts.join('\n\n[PAGE BREAK]\n\n');
  },

  /* ═══════════════════════════════════════════════════════
     HTTP LAYER — routes to correct provider + model
  ═══════════════════════════════════════════════════════ */

  /** Main entry: call with a function name so correct model is selected */
  async _callWithFunction(fn, messages, maxTokens=1000) {
    // Managed-AI build: AI is gated behind an active subscription. Check the
    // local entitlement hint first so we show the paywall instantly instead of
    // making a request the server would reject with 402. (The proxy re-verifies.)
    if (typeof AppConfig !== 'undefined' && AppConfig.MANAGED_ONLY
        && typeof Paywall !== 'undefined' && !Paywall.isEntitled()) {
      try { Paywall.show('Subscribe to use the AI study features.'); } catch (e) {}
      const err = new Error('Subscription required to use AI.'); err.code = 'SUBSCRIPTION_REQUIRED'; throw err;
    }
    if (!this.hasApiKey()) throw new Error('No API key configured. Go to Settings → Configure AI.');

    // JSON-producing functions
    const jsonFunctions = ['noteProcessing','questionGen','grading','examGeneration','restructure','gapAnalysis','slideGen','director'];
    const isJson = jsonFunctions.includes(fn);

    // One attempt against whichever provider path is active.
    const attempt = async () => {
      // 1) Server proxy (owner's key) takes priority when deployed — zero user config.
      if (this._proxyAvailable) {
        return await this._callProxy(messages, maxTokens, isJson);
      }
      // 2) Bring-your-own-key paths.
      const provider = this._providers[this._activeProvider];
      if (provider?.isOpenRouter) {
        return await this._callOpenRouter(messages, maxTokens, this._getModelForFunction(fn), isJson);
      }
      return await this._callDirect(messages, maxTokens, isJson);
    };

    // Retry transient failures (rate limits, timeouts, 5xx, flaky network)
    // with exponential backoff. Without this a single 429 during a bulk
    // import permanently drops whatever was being processed (e.g. worked
    // examples, which are the last calls per node and most likely to hit it).
    const backoffs = [800, 2000, 4500];
    let result;
    for (let tryNum = 0; ; tryNum++) {
      try {
        result = await attempt();
        break;
      } catch (e) {
        const msg = (e && e.message) || '';
        // Don't retry permanent failures — auth, missing key, credits, config.
        const permanent = /api key|invalid key|not configured|insufficient credits|unauthoriz|\b401\b|\b402\b|unknown provider|no source/i.test(msg);
        if (permanent || tryNum >= backoffs.length) throw e;
        await this._delay(backoffs[tryNum]);
      }
    }

    // For non-JSON functions (chat, tutoring etc.), strip any JSON wrapping the AI adds
    if (!isJson && typeof result === 'string') {
      result = this._stripJsonWrapper(result);
    }
    return result;
  },

  /**
   * Call the deployed serverless proxy. The proxy injects the owner's
   * ANTHROPIC_API_KEY server-side, so nothing sensitive is sent from the
   * browser. Payload is Anthropic-native (built by _buildClaudePayload).
   */
  async _callProxy(messages, maxTokens, jsonMode=false) {
    const payload = this._buildClaudePayload(messages, maxTokens, jsonMode);
    // Identify the subscriber so the proxy can verify entitlement + meter usage.
    const headers = { 'Content-Type': 'application/json' };
    try { if (typeof Paywall !== 'undefined') headers['x-app-user-id'] = Paywall.userId(); } catch (e) {}
    try { if (typeof AppConfig !== 'undefined' && AppConfig.PROXY_APP_TOKEN) headers['x-app-token'] = AppConfig.PROXY_APP_TOKEN; } catch (e) {}
    const res = await this._fetchWithTimeout(this._proxyEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }, this._timeoutFor(maxTokens));
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) {
      const msg = d.error?.message || res.statusText || 'Proxy request failed';
      // 402 = the server says this user has no active subscription. The proxy is
      // the authority (the client flag is only a hint), so surface the paywall.
      if (res.status === 402) {
        try { if (typeof Paywall !== 'undefined') { Paywall._entitled = false; Paywall.show && Paywall.show('Your subscription isn’t active. Subscribe to keep using AI.'); } } catch (e) {}
        const err = new Error('Subscription required to use AI.'); err.code = 'SUBSCRIPTION_REQUIRED'; throw err;
      }
      if (res.status === 429) throw new Error(msg || 'Rate limit reached. Wait a moment and try again.');
      // If the proxy lost its key mid-session, fall back to BYO mode for future calls.
      if (/api key not (set|configured)|config error/i.test(msg)) {
        this._proxyAvailable = false;
        throw new Error('Server AI is unavailable. Configure your own key in Settings → Configure AI.');
      }
      throw new Error(msg);
    }
    return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  },

  /** Strip JSON fences and extract plain text if AI wrapped response in JSON */
  _stripJsonWrapper(text) {
    if (!text) return text;
    let t = text.trim();
    // Strip markdown fences
    t = t.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    // If it looks like a JSON object with a text field, extract it
    if (t.startsWith('{') && t.includes('"')) {
      try {
        const obj = JSON.parse(t);
        const val = obj.response || obj.text || obj.message || obj.explanation || obj.answer || obj.content;
        if (val && typeof val === 'string') t = val;
      } catch(e) {
        // Not valid JSON — strip outer braces/quotes if present
        const m = t.match(/^[{]\s*"[^"]+?":\s*"([\s\S]*?)"\s*[}]$/);
        if (m) t = m[1];
      }
    }
    // Convert escaped \n to real newlines
    t = t.replace(/\\n/g, '\n');
    return t;
  },

  async _callDirect(messages, maxTokens, jsonMode=false) {
    switch(this._activeProvider) {
      case 'claude':  return this._callClaude(messages, maxTokens, jsonMode);
      case 'openai':  return this._callOpenAI(messages, maxTokens);
      case 'gemini':  return this._callGemini(messages, maxTokens);
      case 'custom':  return this._callCustom(messages, maxTokens);
      default: throw new Error('Unknown provider.');
    }
  },

  /**
   * Legacy entry for backwards compat. Delegates to _callWithFunction so it
   * inherits proxy routing, provider selection, and JSON handling. Treated as a
   * plain-text ('chat') call. New code should call _callWithFunction directly.
   */
  async _call(messages, maxTokens=1000) {
    return this._callWithFunction('chat', messages, maxTokens);
  },

  /** Build the OpenRouter (OpenAI-format) message array, including the shared
   *  source-fidelity system prompt. Sync + pure, so it can be unit-tested. */
  _buildOpenRouterMessages(messages, jsonMode=false) {
    const normalized = messages.map(m => {
      if (typeof m.content === 'string') return {role:m.role, content:m.content};
      const content = m.content.map(c => {
        if (c.type === 'text')  return {type:'text', text:c.text};
        if (c.type === 'image') return {type:'image_url', image_url:{url:'data:'+c.source.media_type+';base64,'+c.source.data}};
        if (c.type === 'image_url') return c;  // already correct format
        return {type:'text', text:JSON.stringify(c)};
      });
      return {role:m.role, content};
    });
    // Prepend the shared guardrail so OpenRouter/Gemini get the same
    // "use ONLY the source material" rule as the Claude paths.
    return [{ role:'system', content:this._systemPrompt(jsonMode) }, ...normalized];
  },

  /** Human-readable current date/time + timezone from the device clock.
   *  Shared by the coach and the Director so both reason about "now". */
  _nowContext() {
    const now = new Date();
    const str = now.toLocaleString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
    return str + (tz ? ' (' + tz + ')' : '');
  },

  /** Heavier generations (lectures, slide decks, full nodes) legitimately take
   *  longer than a quick classify. Scale the request timeout with the requested
   *  token budget, clamped to a sane 45s–180s band, so short calls still fail
   *  fast on a stalled network while long ones get the headroom they need. */
  _timeoutFor(maxTokens) {
    const ms = 30000 + (maxTokens || 1000) * 22;   // ~22ms/token of headroom
    return Math.min(Math.max(ms, 45000), 180000);
  },

  /** Fetch with AbortController timeout — prevents indefinite hangs on
   *  mobile networks where stalled connections never reject.
   *  Default 45s is generous but bounded. */
  async _fetchWithTimeout(url, options, ms = 45000) {
    // On Android (Capacitor), use native HTTP to bypass WebView CORS restrictions.
    // The CapacitorHttp plugin is compiled into the app and handles HTTPS natively.
    if (typeof window !== 'undefined' &&
        window.Capacitor &&
        typeof window.Capacitor.nativePromise === 'function' &&
        window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android') {
      try {
        const headers = {};
        if (options && options.headers) {
          const h = (options.headers instanceof Headers)
            ? options.headers
            : new Headers(options.headers);
          h.forEach((v, k) => { headers[k] = v; });
        }
        const result = await window.Capacitor.nativePromise('CapacitorHttp', 'request', {
          url,
          method:         (options && options.method) || 'GET',
          headers,
          data:           (options && options.body) || undefined,
          connectTimeout: ms,
          readTimeout:    ms,
        });
        const payload = result.data;
        return {
          ok:      result.status >= 200 && result.status < 300,
          status:  result.status,
          headers: new Headers(result.headers || {}),
          json:    async () => (typeof payload === 'string' ? JSON.parse(payload) : payload),
          text:    async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
        };
      } catch (e) {
        throw new Error((e && e.message) ? e.message : 'Native HTTP request failed. Check your connection and API key.');
      }
    }
    // Browser / desktop fallback — standard fetch with abort timeout
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('Request timed out after ' + (ms / 1000) + 's. Check your connection and try again.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  async _callOpenRouter(messages, maxTokens, model, jsonMode=false) {
    const cfg = this._config.openrouter;
    const withSystem = this._buildOpenRouterMessages(messages, jsonMode);

    const res = await this._fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'Authorization':   'Bearer ' + cfg.key,
        'HTTP-Referer':    'https://knowledgenode.app',
        'X-Title':         'KnowledgeNode Study App',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages:   withSystem,
      }),
    }, this._timeoutFor(maxTokens));

    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      const msg = e.error?.message || res.statusText;
      // Helpful error messages for common issues
      if (res.status === 401) throw new Error('Invalid OpenRouter API key. Check Settings → Configure AI.');
      if (res.status === 402) throw new Error('OpenRouter account has insufficient credits. Top up at openrouter.ai/credits.');
      if (res.status === 429) throw new Error('Rate limit reached. Wait a moment and try again.');
      throw new Error('OpenRouter ' + res.status + ': ' + msg);
    }

    const d = await res.json();
    const text = d.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('OpenRouter returned an empty response. Try again.');
    return text;
  },

  /**
   * Build an Anthropic-native /v1/messages payload from internal messages.
   * Shared by direct-Claude calls and the server proxy so both behave identically.
   */
  /** The source-fidelity system prompt, shared across every provider path so
   *  the "use ONLY the source material" guardrail is applied uniformly. */
  _systemPrompt(jsonMode = false) {
    const _profile = this._activeProfile || 'college';
    return "You are a study assistant inside KnowledgeNode. Your most important rule: ONLY use information explicitly stated in the SOURCE MATERIAL provided. "
      + "NEVER add facts, definitions, examples, or explanations from your own training data. "
      + "NEVER assume, infer, or extrapolate beyond what is written in the source. "
      + "If the source does not contain enough information to answer something, say exactly: 'This is not covered in the provided source material.' "
      + "If unsure whether something is in the source, quote the exact sentence that supports it. "
      + "A wrong answer based on invented facts is always worse than admitting the source does not cover it. "
      + "Be precise, honest, and grounded only in what the student has actually studied. "
      + this.profileContext(_profile)
      + (jsonMode ? " CRITICAL: Output ONLY raw JSON. No markdown, no ```json fences, no explanation. Start with { or [ and end with } or ]." : "");
  },

  _buildClaudePayload(messages, maxTokens, jsonMode=false, model=null) {
    const SYS = this._systemPrompt(jsonMode);

    // Convert image_url format to Anthropic native format
    const _supportedMime = ['image/jpeg','image/png','image/gif','image/webp'];
    const claudeMsgs = messages.map(m => {
      if (typeof m.content === 'string') return m;
      const parts = m.content.map(c => {
        if (c.type === 'image_url') {
          const [meta, data] = c.image_url.url.split(',');
          let mediaType = meta.split(':')[1].split(';')[0];
          if (!_supportedMime.includes(mediaType)) mediaType = 'image/jpeg';
          return {type:'image', source:{type:'base64', media_type:mediaType, data}};
        }
        return c;
      });
      return {role:m.role, content:parts};
    });

    return {
      model: model || (this._config.claude || {}).model || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYS,
      messages: claudeMsgs,
    };
  },

  /** Call Claude directly with prompt caching on the system prompt.
   *  Only activates when the active provider is Claude (Anthropic Direct) —
   *  other providers don't support the cache_control extension.
   *  The `systemPrompt` is marked ephemeral and cached for 5 minutes;
   *  subsequent calls with the same system prefix pay ~10% of normal input cost.
   *  Falls back to a regular _callWithFunction call for non-Claude providers. */
  async _callClaudeWithCache(systemPrompt, messages, maxTokens) {
    // Only Claude supports Anthropic's prompt caching
    if (this._activeProvider !== 'claude' && this._activeProvider !== 'proxy') {
      // For other providers, prepend system to first user message as before
      const augmented = messages.map((m, i) => i === 0
        ? { ...m, content: systemPrompt + '\n\n' + m.content }
        : m);
      return await this._callWithFunction('chat', augmented, maxTokens);
    }

    const cfg   = this._config.claude || {};
    const model = cfg.model || 'claude-sonnet-4-6';

    const payload = {
      model,
      max_tokens: maxTokens,
      // System prompt as a structured block with cache_control.
      // Anthropic caches this for 5 min; reads cost 90% less than normal input.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    };

    const endpoint = cfg.key
      ? 'https://api.anthropic.com/v1/messages'
      : this._proxyEndpoint;

    const headers = {
      'Content-Type':      'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
    };
    if (cfg.key) {
      headers['x-api-key']                             = cfg.key;
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    const res = await this._fetchWithTimeout(endpoint, {
      method: 'POST', headers, body: JSON.stringify(payload),
    }, this._timeoutFor(maxTokens));

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      const msg = e.error?.message || res.statusText;
      if (res.status === 401) throw new Error('Invalid API key. Check Settings.');
      if (res.status === 429) throw new Error('Rate limit reached. Wait a moment and try again.');
      throw new Error('Claude ' + res.status + ': ' + msg);
    }

    const d = await res.json();
    if (d.error) throw new Error(d.error.message || 'API error');
    return d.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  },

  async _callClaude(messages, maxTokens, jsonMode=false) {
    const cfg = this._config.claude || {};
    const payload = this._buildClaudePayload(messages, maxTokens, jsonMode, cfg.model);

    const res = await this._fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(payload),
      }, this._timeoutFor(maxTokens));

    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      const msg = e.error?.message || res.statusText;
      if (res.status === 401) throw new Error('Invalid API key. Check Settings.');
      if (res.status === 429) throw new Error('Rate limit reached. Wait a moment and try again.');
      throw new Error('Claude ' + res.status + ': ' + msg);
    }

    const d = await res.json();
    if (d.error) throw new Error(d.error.message || 'API error');
    return d.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  },

  async _callOpenAI(messages, maxTokens) {
    const cfg = this._config.openai;
    const res = await this._fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},
      body:JSON.stringify({model:cfg.model||'gpt-4o',max_tokens:maxTokens,messages}),
    }, this._timeoutFor(maxTokens));
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error('OpenAI '+res.status+': '+(e.error?.message||res.statusText)); }
    const d = await res.json();
    return d.choices[0]?.message?.content?.trim()||'';
  },

  async _callGemini(messages, maxTokens) {
    const cfg   = this._config.gemini;
    const model = cfg.model||'gemini-2.5-flash';
    const url   = 'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+cfg.key;
    const parts = [];
    for (const msg of messages) {
      if (typeof msg.content==='string') { parts.push({text:msg.content}); continue; }
      for (const c of msg.content) {
        if (c.type==='text') parts.push({text:c.text});
        if (c.type==='image_url') {
          const p = c.image_url.url.split(',');
          const mt= p[0].split(':')[1].split(';')[0];
          parts.push({inline_data:{mime_type:mt, data:p[1]}});
        }
      }
    }
    const res = await this._fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}],generationConfig:{maxOutputTokens:maxTokens}})}, this._timeoutFor(maxTokens));
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error('Gemini '+res.status+': '+(e.error?.message||res.statusText)); }
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()||'';
  },

  async _callCustom(messages, maxTokens) {
    const cfg = this._config.custom;
    if (!cfg.customEndpoint) throw new Error('Custom endpoint URL not configured.');
    // Notes + the API key are POSTed to this URL, so refuse plaintext HTTP to any
    // remote host — http is tolerated only for a local dev model (e.g. Ollama).
    let u;
    try { u = new URL(cfg.customEndpoint); } catch (e) { throw new Error('Custom endpoint URL is invalid.'); }
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal)) {
      throw new Error('Custom endpoint must use HTTPS (plain http is allowed only for localhost).');
    }
    const oaiMsgs = messages.map(m=>({role:m.role,content:typeof m.content==='string'?m.content:m.content.map(c=>c.text||'').join('\n')}));
    const res = await this._fetchWithTimeout(cfg.customEndpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(cfg.key||'none')},body:JSON.stringify({model:cfg.model||'local-model',max_tokens:maxTokens,messages:oaiMsgs})}, this._timeoutFor(maxTokens));
    if (!res.ok) throw new Error('Custom API '+res.status+': '+res.statusText);
    const d = await res.json();
    return (d.choices?.[0]?.message?.content||d.content?.[0]?.text||'').trim();
  },

  _parseJSON(raw) {
    if (!raw || !raw.trim()) throw new Error('AI returned empty response. Try again.');
    let clean = raw.trim();
    // Strip ALL variations of markdown code fences aggressively
    clean = clean.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/i, '').trim();
    // If that made it empty, use original
    if (!clean) clean = raw.trim();
    // Strip any leading prose before first { or [
    const fi = Math.min(
      clean.indexOf('{') === -1 ? Infinity : clean.indexOf('{'),
      clean.indexOf('[') === -1 ? Infinity : clean.indexOf('[')
    );
    if (fi > 0 && fi < Infinity) clean = clean.slice(fi);
    // Strip trailing prose after last } or ]
    const li = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
    if (li !== -1 && li < clean.length - 1) clean = clean.slice(0, li + 1);
    // Attempt 1: direct parse
    try { return JSON.parse(clean); } catch {}
    // Attempt 2: greedy object
    const obj = clean.match(/\{[\s\S]*\}/);
    if (obj) try { return JSON.parse(obj[0]); } catch {}
    // Attempt 3: greedy array
    const arr = clean.match(/\[[\s\S]*\]/);
    if (arr) try { return JSON.parse(arr[0]); } catch {}
    // Attempt 4: binary search for the longest valid parseable prefix.
    // Bracket-counting was wrong — it counts brackets inside string values,
    // producing a validly-parsing but semantically corrupted object.
    // Binary search always returns a structurally correct (if truncated) result.
    try {
      let lo = 1, hi = clean.length, best = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        try { best = JSON.parse(clean.slice(0, mid)); lo = mid + 1; }
        catch { hi = mid - 1; }
      }
      if (best !== null) return best;
    } catch {}
    // Attempt 5: repair truncation. A token-limit cutoff leaves valid JSON that
    // simply stops partway (a common bulk-import failure mode), which the prefix
    // search above can't recover because no prefix is itself valid. Close any
    // dangling string and the unclosed brackets, then parse.
    try {
      const repaired = this._closeTruncatedJSON(clean);
      if (repaired) return JSON.parse(repaired);
    } catch {}
    throw new Error('AI returned invalid JSON. Try again.');
  },

  /** Close an open string and any unclosed {}/[] in a truncated JSON string.
   *  Pure + synchronous so it can be unit-tested. Returns a candidate string. */
  _closeTruncatedJSON(s) {
    const scan = (str) => {
      const stack = []; let inStr = false, esc = false;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
      }
      return { stack, inStr };
    };
    const close = (str, st) => {
      let out = str;
      if (st.inStr) out += '"';        // close a string cut mid-value
      out = out.replace(/,\s*$/, '');  // drop a dangling comma
      for (let i = st.stack.length - 1; i >= 0; i--) out += st.stack[i] === '{' ? '}' : ']';
      return out;
    };
    let st = scan(s);
    let candidate = close(s, st);
    try { JSON.parse(candidate); return candidate; } catch {}
    // Retry once after dropping a trailing key that never got a value
    // (e.g. {"a":1,"b": or {"a":1,"b").
    const trimmed = s.replace(/[,{]\s*"[^"]*"\s*:?\s*$/, m => (m.trim()[0] === '{' ? '{' : ''));
    st = scan(trimmed);
    return close(trimmed, st);
  },

  async mockProcess(meta, onProgress=()=>{}) {
    const steps=[[1,'Reading…'],[2,'Structuring…'],[3,'Questions…'],[4,'Building…']];
    for(const[s,l]of steps){onProgress(s,l);await this._delay(500);}
    const Q=(t,q,a)=>({id:KnowledgeNode._generateQuestionId(),type:t,question:q,answer:a});
    return {rawOCR:'[Demo]',title:"Newton's Laws of Motion",definitions:[{term:'Force',examples:'Push, Pull, Gravity, Friction',description:'Push or pull causing change in motion. Measured in Newtons (N).'},{term:'Mass',examples:'1 kg of water, 70 kg person',description:'Amount of matter in kg. Determines resistance to acceleration.'},{term:'Inertia',examples:'Car skidding, book staying on table',description:'Tendency to resist changes in motion. Proportional to mass.'}],tables:[{id:'tbl_demo',title:"Newton's Laws Summary",columns:['Law','Statement','Formula'],rows:[['First','Object at rest stays at rest','F_net = 0'],['Second','Net force = mass × acceleration','F = ma'],['Third','Equal and opposite reaction','F₁ = −F₂']]}],formulas:[{expression:'F = ma',description:"Newton's Second Law",constraints:'Constant mass. F in N, m in kg, a in m/s².'}],procedures:[{id:'proc_demo',title:'Solving Force Problems',appliesTo:'Any Newton\'s Law calculation',steps:['Draw a free-body diagram.','Choose coordinate system.','Resolve forces into components.','Apply ΣF = ma.','Solve for the unknown.','Verify units.'],notes:'Always draw the diagram first. Missing a force is the #1 mistake.'}],commonMistakes:['Confusing mass (kg) with weight (N).','Missing forces in diagram.'],summary:"Newton's Three Laws are the foundation of classical mechanics. F=ma is the most applied equation.",questions:[Q('recall',"State Newton's Second Law.","F = ma. Net force equals mass times acceleration."),Q('recall','SI unit of force?','Newton (N). 1 N = 1 kg·m/s².'),Q('recall','What is inertia?','Resistance to changes in motion. Proportional to mass.'),Q('application','5 kg block, 20 N net force. Acceleration?','a = F/m = 20/5 = 4 m/s².'),Q('application','1000 kg rocket needs 15 m/s². Thrust?','F = 1000×15 = 15,000 N.')],processingStatus:'ready'};
  },

  _delay: ms => new Promise(r=>setTimeout(r,ms)),
};
