/**
 * SettingsPanel.js
 * Full settings modal: AI config, reset data, onboarding replay, session prefs
 */

const SettingsPanel = {
  open() {
    const stats = nodeStore.getStats();
    const streak = StreakTracker.getStats();

    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:19px;font-weight:800;margin-bottom:20px;">⚙ Settings</h2>

      <!-- AI Provider -->
      <div class="settings-section">
        <div class="settings-section-title">AI Provider</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-family:var(--font-ui);font-size:13px;font-weight:600;color:var(--text-primary);">
              ${AIService.hasApiKey() ? `✓ ${AIService.getActiveProvider()?.name || 'Configured'}` : '⚠ Not configured (demo mode)'}
            </div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:2px;">
              ${AIService.hasApiKey() ? 'Click to change provider or model' : 'Configure to enable AI processing'}
            </div>
          </div>
          <button class="btn-secondary" style="font-size:12px;" id="settings-ai-btn">Configure AI</button>
        </div>
      </div>

      <!-- AI Corrections -->
      <div class="settings-section" id="settings-corrections-section">
        <div class="settings-section-title">AI Corrections</div>
        <p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
          Things you've told the AI it got wrong. These are sent with every future prompt for that node.
        </p>
        <div id="settings-corrections-list">${this._renderCorrectionsPanel()}</div>
      </div>

      <!-- Your Data -->
      <div class="settings-section">
        <div class="settings-section-title">Your Data</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
          <div class="mastery-stat-card"><span class="mastery-stat-value">${stats.total}</span><span class="mastery-stat-label">Nodes</span></div>
          <div class="mastery-stat-card"><span class="mastery-stat-value">${stats.mastery}%</span><span class="mastery-stat-label">Mastery</span></div>
          <div class="mastery-stat-card"><span class="mastery-stat-value">${streak.streak}</span><span class="mastery-stat-label">Streak</span></div>
        </div>

        <div style="background:rgba(240,165,0,0.1);border:1px solid var(--accent-dim);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
          <div style="font-family:var(--font-ui);font-weight:700;font-size:13px;color:var(--accent-light);margin-bottom:4px;">⚠ Keep your data safe</div>
          <div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.6;">
            Uninstalling this app <strong>permanently deletes all your nodes</strong>. Export your data to a file and keep it somewhere safe (Google Drive, email, cloud storage) — especially before any app update.
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary" style="font-size:12px;" id="settings-export-btn">⎙ Export All Nodes</button>
          <button class="btn-secondary" style="font-size:12px;" id="settings-import-btn">↑ Import Backup</button>
          <button class="btn-secondary" style="font-size:12px;" id="settings-copy-btn" title="Copy all data as JSON — paste into any text editor and save as .json">📋 Copy to clipboard</button>
          <input type="file" id="import-file-input" accept=".json" hidden/>
        </div>
      </div>

      <!-- Backups (in-app vault) -->
      <div class="settings-section">
        <div class="settings-section-title">Backups</div>
        <p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
          Versioned snapshots kept inside the app — including your AI provider &amp; API&nbsp;key, so a restore brings back your setup too. The newest ${BackupVault.MAX_SNAPSHOTS} are kept automatically (once every 6&nbsp;hours). Restore any one, or download it as a file.
        </p>
        <p style="font-family:var(--font-body);font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.55;">
          ⚠ These live in <em>this browser</em>. They survive an in-app purge, but clearing your browser's site data, uninstalling, or switching devices will remove them. For real safety, <strong>Download</strong> one occasionally and keep it somewhere off this device. Note a downloaded file contains your <strong>API key in plain text</strong> — store it somewhere private.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button class="btn-secondary" style="font-size:12px;" id="settings-backup-now-btn">💾 Back up now</button>
          <button class="btn-secondary" style="font-size:12px;color:var(--red);border-color:rgba(240,86,74,0.3);" id="settings-backup-clear-btn">Clear all backups</button>
        </div>
        <div id="settings-backup-list" style="display:flex;flex-direction:column;gap:8px;">
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Loading backups…</div>
        </div>
      </div>

      <!-- Onboarding -->
      <div class="settings-section">
        <div class="settings-section-title">Onboarding & Help</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary" style="font-size:12px;" id="settings-guide-btn">📘 Full Guide</button>
          <button class="btn-secondary" style="font-size:12px;" id="settings-tour-btn">📖 Replay Tour</button>
          <button class="btn-secondary" style="font-size:12px;" id="settings-shortcuts-btn">⌨ Keyboard Shortcuts</button>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="settings-section" style="border-color:rgba(240,86,74,0.2);">
        <div class="settings-section-title" style="color:var(--red);">⚠ Danger Zone</div>
        <p style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
          These actions cannot be undone. Export your data first if you want a backup.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary" style="font-size:12px;border-color:rgba(240,86,74,0.3);color:var(--red);" id="reset-onboarding-btn">
            Reset Onboarding
          </button>
          <button class="btn-danger" style="font-size:12px;" id="purge-all-btn">
            🗑 Purge All Data
          </button>
        </div>
      </div>

      <div style="margin-top:8px;">
        <button class="btn-secondary" onclick="Modal.close()" style="width:100%;justify-content:center;">Close</button>
      </div>

    `);

    setTimeout(() => {
      document.getElementById('settings-ai-btn')?.addEventListener('click', () => { Modal.close(); AISettingsModal.open(); });

      document.getElementById('settings-guide-btn')?.addEventListener('click', () => { Modal.close(); Guide.open(); });

      document.getElementById('settings-tour-btn')?.addEventListener('click', () => { Modal.close(); Onboarding.showTour(); });

      // Corrections delete/clear
      document.getElementById('settings-corrections-list')?.addEventListener('click', e => {
        const delBtn   = e.target.closest('[data-cor-del]');
        const clearBtn = e.target.closest('[data-node-clear]');
        if (delBtn) {
          const node = nodeStore.get(delBtn.dataset.corNode);
          if (node) { AICorrections.delete(node, delBtn.dataset.corDel); }
          document.getElementById('settings-corrections-list').innerHTML = this._renderCorrectionsPanel();
        }
        if (clearBtn) {
          const node = nodeStore.get(clearBtn.dataset.nodeClear);
          if (node) { AICorrections.clearAll(node); }
          document.getElementById('settings-corrections-list').innerHTML = this._renderCorrectionsPanel();
        }
      });

      document.getElementById('settings-export-btn')?.addEventListener('click', () => {
        const nodes = nodeStore.getAll();
        if (!nodes.length) { Toast.error('No nodes to export.'); return; }
        try {
          PrintExport.showAllExportMenu(nodes);
          Toast.success('Export started — choose where to save the file when prompted.');
        } catch(e) {
          Toast.error('Export failed. Use "Copy to clipboard" instead.');
        }
      });

      document.getElementById('settings-copy-btn')?.addEventListener('click', async () => {
        const nodes = nodeStore.getAll();
        if (!nodes.length) { Toast.error('No nodes to copy.'); return; }
        const json = nodeStore.exportJSON();
        try {
          await navigator.clipboard.writeText(json);
          Toast.success('All data copied to clipboard. Paste into a text file and save as .json — this is your backup.');
        } catch(e) {
          Toast.error('Clipboard failed. Try the Export button or Settings → Backups → Download.');
        }
      });

      document.getElementById('settings-import-btn')?.addEventListener('click', () => {
        document.getElementById('import-file-input').click();
      });
      document.getElementById('import-file-input')?.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          try { await BackupVault.snapshot('pre-import'); } catch {}
          nodeStore.importJSON(text);
          Modal.close();
          Toast.success('Nodes imported successfully!');
          App.updateSidebarStats();
        } catch(err) {
          Toast.error('Import failed: ' + err.message);
        }
      });

      // ── Backups (in-app vault) ──
      const refreshBackups = () => { try { this._renderBackupList(); } catch {} };
      refreshBackups();

      document.getElementById('settings-backup-now-btn')?.addEventListener('click', async () => {
        try {
          const rec = await BackupVault.snapshot('manual');
          Toast.success('Backup #' + rec.seq + ' saved');
          refreshBackups();
        } catch (err) { Toast.error('Backup failed: ' + err.message); }
      });

      document.getElementById('settings-backup-clear-btn')?.addEventListener('click', async () => {
        if (!confirm('Delete ALL saved backups? This cannot be undone.')) return;
        try { await BackupVault.clearAll(); Toast.success('All backups cleared'); refreshBackups(); }
        catch (err) { Toast.error('Failed: ' + err.message); }
      });

      document.getElementById('settings-backup-list')?.addEventListener('click', async e => {
        const restoreBtn = e.target.closest('[data-bk-restore]');
        const dlBtn      = e.target.closest('[data-bk-dl]');
        const delBtn     = e.target.closest('[data-bk-del]');

        if (restoreBtn) {
          const seq = Number(restoreBtn.dataset.bkRestore);
          if (!confirm('Restore backup #' + seq + '?\n\nYour current data will be replaced with this version. A safety backup of the current state is taken first, so this can be undone.')) return;
          try {
            const rec = await BackupVault.get(seq);
            if (!rec) { Toast.error('Backup not found'); return; }
            await BackupVault.snapshot('pre-restore');
            const n = nodeStore.replaceAllFromJSON(rec.json);
            Toast.success('Restored ' + n + ' node' + (n === 1 ? '' : 's') + ' from #' + seq);
            App.updateSidebarStats?.();
            refreshBackups();
          } catch (err) { Toast.error('Restore failed: ' + err.message); }
        }

        if (dlBtn) {
          const rec = await BackupVault.get(Number(dlBtn.dataset.bkDl));
          if (rec) BackupVault.download(rec);
        }

        if (delBtn) {
          const seq = Number(delBtn.dataset.bkDel);
          if (!confirm('Delete backup #' + seq + '? This cannot be undone.')) return;
          try { await BackupVault.remove(seq); refreshBackups(); }
          catch (err) { Toast.error('Delete failed: ' + err.message); }
        }
      });

      document.getElementById('reset-onboarding-btn')?.addEventListener('click', () => {
        Onboarding.reset();
        Modal.close();
        Toast.success('Onboarding reset. Reload the page to see the welcome screen.');
      });

      document.getElementById('purge-all-btn')?.addEventListener('click', () => {
        this._confirmPurge();
      });
    }, 0);
  },

  _confirmPurge() {
    Modal.open(`
      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:48px;margin-bottom:16px;">⚠</div>
        <h2 style="font-family:var(--font-ui);font-size:20px;font-weight:800;margin-bottom:10px;color:var(--red);">Purge All Data?</h2>
        <p style="font-family:var(--font-body);font-size:14px;color:var(--text-secondary);margin-bottom:16px;line-height:1.65;">
          This will delete <strong>all nodes, study plans, streaks, and settings</strong> from this device.
          A safety backup is taken first, so you can restore afterwards from <strong>Settings → Backups</strong>.
        </p>
        <label style="display:flex;align-items:flex-start;gap:9px;text-align:left;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:11px 13px;margin-bottom:20px;cursor:pointer;">
          <input type="checkbox" id="purge-backups-chk" style="margin-top:3px;flex:none;"/>
          <span style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);line-height:1.5;">Also delete saved backups (a true clean slate — this <strong>cannot</strong> be undone)</span>
        </label>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="btn-danger" id="confirm-purge-btn">Delete</button>
          <button class="btn-secondary" onclick="Modal.close()">Cancel</button>
        </div>
      </div>`);
    setTimeout(() => {
      document.getElementById('confirm-purge-btn')?.addEventListener('click', async () => {
        const alsoBackups = document.getElementById('purge-backups-chk')?.checked;
        try {
          if (typeof BackupVault !== 'undefined') {
            if (alsoBackups) { try { await BackupVault.clearAll(); } catch {} }
            else             { try { await BackupVault.snapshot('pre-purge'); } catch {} }
          }
        } catch {}
        // Clear all localStorage keys used by the app
        const keysToRemove = Object.keys(localStorage).filter(k =>
          k.startsWith('kn_') || k.startsWith('knowledge')
        );
        keysToRemove.forEach(k => localStorage.removeItem(k));
        Modal.close();
        Toast.success(alsoBackups ? 'All data and backups purged. Reloading…' : 'Data purged — backups kept. Reloading…');
        setTimeout(() => location.reload(), 1200);
      });
    }, 0);
  },
  async _renderBackupList() {
    const el = document.getElementById('settings-backup-list');
    if (!el) return;
    let list = [];
    try { list = await BackupVault.list(); } catch (e) { console.warn(e); }
    if (!el.isConnected) return;
    if (!list.length) {
      el.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">No backups yet — tap “Back up now”, or one will be saved automatically as you study.</div>';
      return;
    }
    el.innerHTML = list.map(rec => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:var(--bg-surface);">
        <div style="font-family:var(--font-ui);font-size:12.5px;font-weight:600;color:var(--text-primary);line-height:1.4;">${BackupVault.labelOf(rec)}</div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin:2px 0 9px;">${BackupVault.reasonLabel(rec.reason)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn-secondary" style="font-size:11px;padding:4px 11px;" data-bk-restore="${rec.seq}">↺ Restore</button>
          <button class="btn-secondary" style="font-size:11px;padding:4px 11px;" data-bk-dl="${rec.seq}">⤓ Download</button>
          <button class="btn-secondary" style="font-size:11px;padding:4px 11px;color:var(--red);border-color:rgba(240,86,74,0.3);" data-bk-del="${rec.seq}" aria-label="Delete backup">✕</button>
        </div>
      </div>`).join('');
  },

  _renderCorrectionsPanel() {
    if (typeof AICorrections === 'undefined') return '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">No corrections yet.</p>';
    const nodes = nodeStore.getAll().filter(n => n.aiCorrections?.length > 0);
    if (!nodes.length) return '<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">No corrections yet. Long-press any AI-generated item in your notes to record one.</p>';

    let html = '';
    nodes.forEach(node => {
      const cors = AICorrections.getAll(node);
      html += `<div style="margin-bottom:16px;">
        <div style="font-family:var(--font-ui);font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:8px;">
          <span>${String(node.title||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>
          <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);">${cors.length} correction${cors.length !== 1 ? 's' : ''}</span>
          <button class="btn-secondary" data-node-clear="${node.id}" style="font-size:10px;padding:2px 8px;margin-left:auto;">Clear all</button>
        </div>`;
      cors.forEach(c => {
        html += `<div style="background:var(--bg-base);border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;align-items:flex-start;gap:10px;">
          <div style="flex:1;min-width:0;">
            <div style="font-family:var(--font-mono);font-size:9px;color:var(--accent);margin-bottom:3px;text-transform:uppercase;">${c.category} · ${AICorrections._timeAgo(c.ts)}</div>
            <div style="font-family:var(--font-body);font-size:12px;color:var(--text-primary);line-height:1.5;">${c.userNote}</div>
            ${c.aiOutput ? `<div style="font-family:var(--font-body);font-size:11px;color:var(--text-muted);margin-top:3px;font-style:italic;">AI said: "${c.aiOutput.slice(0, 120)}${c.aiOutput.length > 120 ? '…' : ''}"</div>` : ''}
          </div>
          <button class="btn-secondary" data-cor-del="${c.id}" data-cor-node="${node.id}" style="font-size:10px;padding:3px 8px;flex-shrink:0;color:var(--red);">✕</button>
        </div>`;
      });
      html += '</div>';
    });
    return html;
  },
};
