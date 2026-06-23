/**
 * AISettingsModal.js — Final with OpenRouter
 * Paste one key → everything works. Advanced tab for per-function model config.
 */
const AISettingsModal = {
  _tab: 'main',  // 'main' | 'functions'

  open() {
    // Managed-AI build: there is no bring-your-own-key. Show a subscription
    // panel instead of provider/key config so the paywall can't be bypassed.
    if (typeof AppConfig !== 'undefined' && AppConfig.MANAGED_ONLY) {
      this._renderSubscription();
      return;
    }
    this._tab = 'main';
    this._render();
  },

  _renderSubscription() {
    const entitled = (typeof Paywall !== 'undefined') && Paywall.isEntitled();
    const status = entitled
      ? '<div style="background:rgba(80,200,120,0.12);border:1px solid rgba(80,200,120,0.4);border-radius:var(--radius-sm);padding:12px 14px;font-family:var(--font-mono);font-size:12px;line-height:1.5;">✓ <strong>Subscription active</strong> — all AI features are unlocked.</div>'
      : '<div style="background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-sm);padding:12px 14px;font-family:var(--font-mono);font-size:12px;line-height:1.5;">AI study tools are part of the subscription. Subscribe to unlock note processing, questions, lectures, the tutor, and more.</div>';
    Modal.open(
      '<h2 style="font-family:var(--font-ui);font-size:20px;font-weight:800;margin-bottom:4px;">AI Subscription</h2>'
      + '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:16px;">Billing is handled securely by Google Play.</p>'
      + status
      + '<div style="display:flex;flex-direction:column;gap:8px;margin-top:18px;">'
      + (entitled
          ? '<button class="btn-secondary" id="ai-sub-restore" style="justify-content:center;">Restore / refresh</button>'
          : '<button class="btn-primary" id="ai-sub-subscribe" style="justify-content:center;padding:13px;font-size:15px;">Subscribe</button>'
            + '<button class="btn-secondary" id="ai-sub-restore" style="justify-content:center;">Restore purchase</button>')
      + '<button style="background:none;border:none;color:var(--text-muted);font-family:var(--font-mono);font-size:11px;cursor:pointer;margin-top:4px;" onclick="Modal.close()">Close</button>'
      + '</div>'
    );
    requestAnimationFrame(() => {
      document.getElementById('ai-sub-subscribe')?.addEventListener('click', () => { Modal.close(); Paywall.show('Subscribe to unlock the AI study tools.'); });
      document.getElementById('ai-sub-restore')?.addEventListener('click', async () => { if (typeof Paywall !== 'undefined') { await Paywall.restore(); Modal.close(); } });
    });
  },

  _render() {
    const active = AIService.getActiveProviderKey();
    const cfg    = AIService.getActiveConfig();

    Modal.open(this._buildHTML(active, cfg));
    // Use requestAnimationFrame to ensure DOM is painted before binding
    requestAnimationFrame(() => {
      this._bindEvents();
    });
  },

  _buildHTML(active, cfg) {
    const isOR = active === 'openrouter';

    // When the site owner has deployed a server proxy with a key, AI already
    // works for everyone with no setup. Make that explicit; a personal key is optional.
    const proxyNote = AIService.isUsingProxy()
      ? '<div style="background:rgba(80,200,120,0.12);border:1px solid rgba(80,200,120,0.4);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:16px;font-family:var(--font-mono);font-size:12px;line-height:1.5;">'
        + '✓ <strong>AI is provided by this site</strong> — you can start studying right away, no key needed. '
        + 'Setting your own key below is optional and will override the shared one for you only.'
        + '</div>'
      : '';

    const providerIcons = { openrouter:'🔀', claude:'🧠', openai:'💬', gemini:'✨', custom:'🔧' };
    const providers     = AIService.getProviderList();

    const providerBtns = providers.map(p =>
      '<button class="provider-btn ' + (p.id===active?'selected':'') + '" data-provider="' + p.id + '">'
      + '<span class="provider-icon">' + (providerIcons[p.id]||'🤖') + '</span>'
      + '<span class="provider-name">' + p.name + (p.id==='openrouter'?' ⭐':'') + '</span>'
      + '</button>'
    ).join('');

    // Tab bar (only show for OpenRouter)
    const tabBar = isOR
      ? '<div class="ai-tab-bar">'
        + '<button class="ai-tab ' + (this._tab==='main'?'active':'') + '" id="ai-tab-main">⚙ Setup</button>'
        + '<button class="ai-tab ' + (this._tab==='functions'?'active':'') + '" id="ai-tab-functions">🔀 Model Profiles</button>'
        + '</div>'
      : '';

    return '<h2 style="font-family:var(--font-ui);font-size:20px;font-weight:800;margin-bottom:4px;">AI Configuration</h2>'
      + '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:20px;">Keys stored only in your browser. Never sent anywhere except the AI provider.</p>'
      + proxyNote
      + '<label class="config-label" style="margin-bottom:10px;">Provider</label>'
      + '<div class="provider-grid">' + providerBtns + '</div>'
      + tabBar
      + '<div id="ai-modal-body" style="margin-top:16px;"></div>'
      + '<div style="display:flex;gap:10px;margin-top:20px;">'
      + '<button class="btn-primary" id="ai-save-btn">Save</button>'
      + '<button class="btn-secondary" onclick="Modal.close()">Cancel</button>'
      + '</div>';
  },

  _renderBody(providerId) {
    const isOR = providerId === 'openrouter';
    if (isOR && this._tab === 'functions') {
      this._renderFunctionTab();
    } else {
      this._renderMainTab(providerId);
    }
  },

  _renderMainTab(providerId) {
    const p   = AIService._providers[providerId];
    const cfg = AIService._config[providerId] || {};
    const isOR= providerId === 'openrouter';

    let html = '';

    // OpenRouter: show "paste key → works" hero section
    if (isOR) {
      html += '<div style="background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);padding:16px 20px;margin-bottom:20px;">'
        + '<div style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--accent);margin-bottom:8px;">🚀 Recommended — One key, 300+ models</div>'
        + '<ol style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.8;padding-left:20px;margin:0;">'
        + '<li>Go to <a href="https://openrouter.ai/keys" target="_blank" style="color:var(--accent);">openrouter.ai/keys</a> → Create key</li>'
        + '<li>Paste it below → click Save</li>'
        + '<li>Everything works immediately with smart defaults</li>'
        + '</ol>'
        + '</div>';
    }

    // API key field — the saved key is NEVER written into the DOM (a screenshot
    // or inspector would otherwise leak it, and it is recoverable from a password
    // field). When a key exists the field starts blank with a "saved" hint;
    // leaving it blank on Save keeps the stored key, typing a new one replaces it.
    const hasSavedKey = !!(cfg.key);
    html += '<div class="config-row" style="margin-bottom:16px;">'
      + '<label class="config-label">API Key <a href="' + (p.docsUrl||'#') + '" target="_blank" rel="noopener" style="float:right;color:var(--accent);font-family:var(--font-mono);font-size:11px;">Get key →</a></label>'
      + '<input type="password" id="ai-key-input" class="config-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"'
      + ' placeholder="' + (hasSavedKey ? '•••••••••• saved — leave blank to keep' : (p.keyPlaceholder||'api-key')) + '"'
      + ' value="" style="font-size:14px;padding:12px 14px;"/>'
      + (hasSavedKey ? '<p style="font-family:var(--font-mono);font-size:10.5px;color:var(--green);margin-top:6px;">✓ A key is saved on this device. Type a new one only to replace it.</p>' : '')
      + '</div>';

    // OpenRouter: preset picker + default model display
    if (isOR) {
      const presets = p.presets || {};
      html += '<div class="config-row" style="margin-bottom:16px;">'
        + '<label class="config-label">Preset</label>'
        + '<div class="or-preset-grid">'
        + Object.entries(presets).map(([key, preset]) =>
            '<button class="or-preset-btn" data-preset="' + key + '">'
            + '<div class="or-preset-label">' + preset.label + '</div>'
            + '<div class="or-preset-desc">' + preset.desc + '</div>'
            + '</button>'
          ).join('')
        + '</div>'
        + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:8px;">Presets auto-assign models per function. Customise in "Model Profiles" tab.</p>'
        + '</div>';

      // Show which models are currently active
      const fnLabels = AIService._functionLabels;
      const activeModels = Object.entries(fnLabels).map(([fn, info]) => {
        const model = (cfg.functionModels?.[fn]) || (p.defaults?.[fn]) || '—';
        return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-soft);">'
          + '<span style="font-family:var(--font-ui);font-size:12px;color:var(--text-secondary);">' + info.label + '</span>'
          + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">' + model.split('/').pop() + '</span>'
          + '</div>';
      }).join('');

      html += '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;">'
        + '<div style="font-family:var(--font-ui);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:10px;">Active Models</div>'
        + activeModels
        + '</div>';

    } else {
      // Direct providers: model selector
      if (p.models?.length) {
        html += '<div class="config-row" style="margin-bottom:16px;">'
          + '<label class="config-label">Model</label>'
          + '<select id="ai-model-select" class="config-select">'
          + p.models.map(m=>'<option value="'+m+'" '+(m===(cfg.model||p.defaultModel)?'selected':'')+'>'+m+'</option>').join('')
          + '</select></div>';
      }
      if (providerId === 'custom') {
        html += '<div class="config-row" style="margin-bottom:16px;">'
          + '<label class="config-label">Model Name</label>'
          + '<input type="text" id="ai-model-input" class="config-input" placeholder="llama3, mistral…" value="'+(cfg.model||'')+'"/>'
          + '</div>'
          + '<div class="config-row" style="margin-bottom:16px;">'
          + '<label class="config-label">Endpoint URL</label>'
          + '<input type="text" id="ai-endpoint-input" class="config-input" placeholder="http://localhost:11434/v1/chat/completions" value="'+(cfg.customEndpoint||'')+'"/>'
          + '</div>';
      }
    }

    document.getElementById('ai-modal-body').innerHTML = html;

    // Wire preset buttons
    document.querySelectorAll('.or-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.or-preset-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        AIService.applyPreset(btn.dataset.preset);
        // Re-render to show updated active models
        this._renderBody(providerId);
      });
    });
  },

  _renderFunctionTab() {
    const p      = AIService._providers.openrouter;
    const cfg    = AIService._config.openrouter || {};
    const labels = AIService._functionLabels;

    // Popular OpenRouter models for the dropdown
    const popularModels = [
      // ── Google Gemini 2.5 (current stable) ──
      'google/gemini-2.5-flash',              // Fast, multimodal, vision — best default
      'google/gemini-2.5-flash-lite',         // Fastest & cheapest
      'google/gemini-2.5-pro',                // Flagship: complex reasoning & coding
      // ── Anthropic Claude (current) ──
      'anthropic/claude-haiku-4-5',           // Fastest Claude, great for chat
      'anthropic/claude-sonnet-4-6',          // Best writing & reasoning
      'anthropic/claude-opus-4-7',            // Most capable Claude
      // ── OpenAI ──
      'openai/gpt-4o-mini',                   // Reliable JSON, cheap grading
      'openai/gpt-4o',
      // ── Meta Llama (open source) ──
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct',
      // ── Mistral ──
      'mistralai/mistral-7b-instruct',
      'mistralai/mixtral-8x7b-instruct',
      // ── DeepSeek ──
      'deepseek/deepseek-chat',
    ];

    const rows = Object.entries(labels).map(([fn, info]) => {
      const current = cfg.functionModels?.[fn] || p.defaults?.[fn] || 'google/gemini-2.5-flash';
      const options = [current, ...popularModels.filter(m=>m!==current)]
        .map(m => '<option value="'+m+'" '+(m===current?'selected':'')+'>'+m+'</option>').join('');
      return '<div class="fn-model-row">'
        + '<div class="fn-model-info"><div class="fn-model-label">'+info.label+'</div><div class="fn-model-desc">'+info.desc+'</div></div>'
        + '<select class="config-select fn-model-select" data-fn="'+fn+'" style="min-width:180px;font-size:12px;padding:7px 10px;">'
        + options
        + '<option value="_custom">Custom model ID…</option>'
        + '</select>'
        + '</div>';
    }).join('');

    document.getElementById('ai-modal-body').innerHTML =
      '<p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.6;">Choose which model handles each function. Smaller models are faster and cheaper. Larger models produce better results for complex tasks.</p>'
      + '<div style="display:flex;flex-direction:column;gap:8px;">' + rows + '</div>'
      + '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:14px;">Find all models at <a href="https://openrouter.ai/models" target="_blank" style="color:var(--accent);">openrouter.ai/models</a>. Paste any model ID into the dropdown as a custom option.</p>';

    // Wire custom model input
    document.querySelectorAll('.fn-model-select').forEach(sel => {
      sel.addEventListener('change', () => {
        if (sel.value === '_custom') {
          Modal.open(
            '<h2 style="font-family:var(--font-ui);font-size:17px;font-weight:800;margin-bottom:12px;">Custom Model ID</h2>'
            + '<p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:14px;">Find model IDs at openrouter.ai/models</p>'
            + '<input type="text" id="custom-model-id-input" class="config-input" placeholder="e.g. meta-llama/llama-3.1-70b-instruct" style="font-size:14px;padding:12px 14px;margin-bottom:16px;"/>'
            + '<div style="display:flex;gap:8px;">'
            + '<button class="btn-primary" id="custom-model-confirm" style="flex:1;justify-content:center;">Set Model</button>'
            + '<button class="btn-secondary" onclick="Modal.close()">Cancel</button>'
            + '</div>'
          );
          setTimeout(() => {
            const inp = document.getElementById('custom-model-id-input');
            inp?.focus();
            document.getElementById('custom-model-confirm')?.addEventListener('click', () => {
              const id = inp?.value?.trim();
              if (!id) return;
              const opt = document.createElement('option');
              opt.value = id; opt.textContent = id; opt.selected = true;
              sel.insertBefore(opt, sel.firstChild);
              sel.value = id;
              Modal.close();
            });
          }, 0);
        }
        AIService.saveFunctionModel(sel.dataset.fn, sel.value);
      });
    });
  },

  _bindEvents() {
    // Provider buttons
    document.querySelectorAll('.provider-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.provider-btn').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        const pid = btn.dataset.provider;
        // Show/hide tab bar
        const tabBar = document.querySelector('.ai-tab-bar');
        if (tabBar) tabBar.style.display = pid==='openrouter' ? 'flex' : 'none';
        this._tab = 'main';
        document.querySelectorAll('.ai-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
        this._renderBody(pid);
      });
    });

    // Tabs (OpenRouter only)
    document.getElementById('ai-tab-main')?.addEventListener('click', () => {
      this._tab='main';
      document.getElementById('ai-tab-main').classList.add('active');
      document.getElementById('ai-tab-functions').classList.remove('active');
      this._renderBody('openrouter');
    });
    document.getElementById('ai-tab-functions')?.addEventListener('click', () => {
      this._tab='functions';
      document.getElementById('ai-tab-functions').classList.add('active');
      document.getElementById('ai-tab-main').classList.remove('active');
      this._renderBody('openrouter');
    });

    // Save
    document.getElementById('ai-save-btn')?.addEventListener('click', () => this._save());

    // Render initial body - wait for ai-modal-body to be in DOM
    const bodyEl = document.getElementById('ai-modal-body');
    if (bodyEl) {
      this._renderBody(AIService.getActiveProviderKey());
    } else {
      setTimeout(() => this._renderBody(AIService.getActiveProviderKey()), 50);
    }
  },

  _save() {
    const provider = document.querySelector('.provider-btn.selected')?.dataset.provider || AIService.getActiveProviderKey();
    const existing = AIService._config[provider] || {};
    const keyInput = document.getElementById('ai-key-input');
    const typed    = keyInput?.value?.trim() || '';
    // Field is intentionally blank when a key is already saved; keep the stored
    // key unless the user typed a replacement (the real key is never in the DOM).
    const key = typed || existing.key || '';

    if (!key && provider !== 'custom') {
      Toast.error('Please enter your API key in the field above.');
      keyInput?.focus();
      return;
    }

    const model = provider==='custom'
      ? (document.getElementById('ai-model-input')?.value?.trim()||'')
      : (document.getElementById('ai-model-select')?.value||'');
    const endpoint = document.getElementById('ai-endpoint-input')?.value?.trim()||'';
    const functionModels = existing.functionModels || {};

    AIService.saveConfig(provider, key, model, endpoint, functionModels);

    Modal.close();
    document.getElementById('api-key-banner')?.remove();
    document.getElementById('main-content').style.paddingTop='';
    Toast.success((provider==='openrouter'?'OpenRouter':'AI') + ' configured! You\'re ready to study.');
  },
};
