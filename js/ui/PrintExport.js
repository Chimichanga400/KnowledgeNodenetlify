/**
 * PrintExport.js v3
 *
 * Export formats:
 *  - PDF      → opens a styled print window → user clicks Save as PDF (browser native)
 *  - Word     → generates a real .docx using pure JS (no server needed)
 *  - HTML     → self-contained HTML file
 *  - JSON     → raw data backup (for re-importing)
 *
 * Works for single nodes AND all nodes (multi-node PDF / Word).
 */

const PrintExport = {

  // ─── Public: show format picker ───────────────────────

  /** Show format picker for a single node */
  showNodeExportMenu(node) {
    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:20px;font-weight:800;margin-bottom:6px;">Export Node</h2>
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:24px;">${this._esc(node.title)}</p>

      <div style="display:flex;flex-direction:column;gap:10px;">

        <button class="export-format-btn" id="exp-pdf">
          <span class="exp-icon">📄</span>
          <div>
            <div class="exp-title">PDF</div>
            <div class="exp-desc">Opens print dialog — choose "Save as PDF". Best for sharing &amp; printing.</div>
          </div>
        </button>

        <button class="export-format-btn" id="exp-word">
          <span class="exp-icon">📝</span>
          <div>
            <div class="exp-title">Word Document (.docx)</div>
            <div class="exp-desc">Downloads a .docx file you can open and edit in Microsoft Word.</div>
          </div>
        </button>

        <button class="export-format-btn" id="exp-html">
          <span class="exp-icon">🌐</span>
          <div>
            <div class="exp-title">HTML File</div>
            <div class="exp-desc">Self-contained file viewable in any browser. Easy to share.</div>
          </div>
        </button>

        <button class="export-format-btn" id="exp-json">
          <span class="exp-icon">🗄</span>
          <div>
            <div class="exp-title">JSON Backup</div>
            <div class="exp-desc">Raw data export. Use to back up or import into another device.</div>
          </div>
        </button>

      </div>
    `);

    setTimeout(() => {
      document.getElementById('exp-pdf') ?.addEventListener('click', () => { Modal.close(); PrintExport.printNode(node); });
      document.getElementById('exp-word')?.addEventListener('click', () => { Modal.close(); PrintExport.exportWord(node); });
      document.getElementById('exp-html')?.addEventListener('click', () => { Modal.close(); PrintExport.exportHTML(node); });
      document.getElementById('exp-json')?.addEventListener('click', () => { Modal.close(); PrintExport.exportJSON(node); });
    }, 0);
  },

  /** Show format picker for all nodes */
  showAllExportMenu(nodes) {
    if (!nodes.length) { Toast.info('No nodes to export.'); return; }

    Modal.open(`
      <h2 style="font-family:var(--font-ui);font-size:20px;font-weight:800;margin-bottom:6px;">Export All Nodes</h2>
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:24px;">${nodes.length} node${nodes.length > 1 ? 's' : ''}</p>

      <div style="display:flex;flex-direction:column;gap:10px;">

        <button class="export-format-btn" id="exp-all-pdf">
          <span class="exp-icon">📄</span>
          <div>
            <div class="exp-title">PDF — All Nodes</div>
            <div class="exp-desc">All nodes in one print-ready document. Each node starts on a new page.</div>
          </div>
        </button>

        <button class="export-format-btn" id="exp-all-word">
          <span class="exp-icon">📝</span>
          <div>
            <div class="exp-title">Word Document — All Nodes (.docx)</div>
            <div class="exp-desc">All nodes in one editable Word file with headings and structure.</div>
          </div>
        </button>

        <button class="export-format-btn" id="exp-all-json">
          <span class="exp-icon">🗄</span>
          <div>
            <div class="exp-title">JSON Backup (all data)</div>
            <div class="exp-desc">Full backup of all nodes. Use to restore or transfer to another device.</div>
          </div>
        </button>

      </div>
    `);

    setTimeout(() => {
      document.getElementById('exp-all-pdf') ?.addEventListener('click', () => { Modal.close(); PrintExport.printAllNodes(nodes); });
      document.getElementById('exp-all-word')?.addEventListener('click', () => { Modal.close(); PrintExport.exportAllWord(nodes); });
      document.getElementById('exp-all-json')?.addEventListener('click', () => { Modal.close(); PrintExport.exportAllJSON(nodes); });
    }, 0);
  },

  // ─── PDF / Print ──────────────────────────────────────

  printNode(node) {
    this._openPrintWindow(this._buildPrintHTML(node), node.title);
  },

  printAllNodes(nodes) {
    const body = nodes.map((n, i) => {
      return (i > 0 ? '<div style="page-break-before:always;"></div>' : '') + this._buildPrintHTML(n);
    }).join('');
    this._openPrintWindow(body, 'KnowledgeNode — All Notes');
  },

  _openPrintWindow(bodyHTML, title) {
    const html = `<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <title>${this._esc(title)} — KnowledgeNode</title>
      <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Lora',Georgia,serif;font-size:11pt;line-height:1.65;color:#111;background:#fff;padding:2.2cm 2.5cm;}
        h1{font-size:19pt;font-weight:bold;margin-bottom:5pt;letter-spacing:-0.3pt;}
        h2{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1.2pt;
           border-bottom:1.5pt solid #222;padding-bottom:4pt;margin:20pt 0 10pt;color:#222;}
        .meta{font-family:'DM Mono','Courier New',monospace;font-size:9pt;color:#555;
              margin-bottom:18pt;padding-bottom:10pt;border-bottom:2pt solid #111;}
        .def{display:grid;grid-template-columns:155pt 1fr;gap:0;border-bottom:0.5pt solid #ddd;padding:7pt 0;font-size:10pt;}
        .def-term{font-family:'DM Mono',monospace;font-weight:500;color:#222;padding-right:12pt;}
        .formula{background:#f7f7f7;border-left:3pt solid #444;padding:9pt 13pt;margin-bottom:9pt;page-break-inside:avoid;}
        .formula-expr{font-family:'DM Mono',monospace;font-size:11pt;margin-bottom:4pt;}
        .formula-desc{font-size:9.5pt;color:#444;font-style:italic;}
        .formula-con{font-size:9pt;color:#666;margin-top:3pt;font-family:'DM Mono',monospace;}
        .step{display:flex;gap:10pt;margin-bottom:6pt;font-size:10pt;page-break-inside:avoid;}
        .step-num{font-weight:700;min-width:16pt;color:#333;}
        .mistake{border:0.5pt solid #ddd;background:#fefefe;padding:7pt 11pt;margin-bottom:7pt;font-size:10pt;page-break-inside:avoid;}
        .mistake::before{content:'⚠  ';}
        .summary{background:#f9f9f9;border:0.5pt solid #ccc;border-left:3pt solid #888;padding:13pt;font-size:10.5pt;line-height:1.75;}
        .user-notes{background:#f5f8ff;border:0.5pt solid #b8cce4;border-left:3pt solid #4472c4;padding:13pt;font-size:10.5pt;white-space:pre-wrap;line-height:1.7;}
        .question{border:0.5pt solid #ccc;padding:9pt 13pt;margin-bottom:9pt;page-break-inside:avoid;font-size:10pt;}
        .q-label{font-family:'DM Mono',monospace;font-size:8pt;text-transform:uppercase;letter-spacing:0.5pt;color:#888;margin-bottom:4pt;}
        .q-answer{color:#555;font-style:italic;border-top:0.5pt solid #ddd;padding-top:7pt;margin-top:7pt;}
        @media print{body{padding:0;}@page{margin:2cm;size:A4;}}
      </style>
    </head><body>
      ${bodyHTML}
      <script>window.onload=()=>{setTimeout(()=>{try{window.print();}catch(e){}},400);}<\/script>
    </body></html>`;

    // On Android the native print dialog (with proper system-back support) opens
    // via KNFiles.print; window.open() would trap the user in a chrome-less WebView.
    if (window.KNFiles) { KNFiles.print(html, title); return; }

    const win = window.open('', '_blank');
    if (!win) { Toast.error('Pop-up blocked. Allow pop-ups for this site and try again.'); return; }
    win.document.write(html);
    win.document.close();
  },

  // ─── Word (.docx) ─────────────────────────────────────
  // Pure JS docx — uses the Open XML format directly (no library needed)
  // Generates a proper .docx with headings, tables, paragraphs.

  exportWord(node) {
    const xml = this._buildDocxXML([node]);
    this._downloadDocx(xml, this._safeFilename(node.title));
    Toast.success(`"${node.title}" exported as Word document.`);
  },

  exportAllWord(nodes) {
    const xml = this._buildDocxXML(nodes);
    this._downloadDocx(xml, 'KnowledgeNode_All_Notes');
    Toast.success(`${nodes.length} nodes exported as Word document.`);
  },

  _buildDocxXML(nodes) {
    const esc = s => String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const para = (text, style = 'Normal', bold = false, color = '000000') => {
      const run = bold
        ? `<w:r><w:rPr><w:b/><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
        : `<w:r><w:rPr><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
      return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${run}</w:p>`;
    };

    const heading1 = t => para(t, 'Heading1');
    const heading2 = t => para(t, 'Heading2');
    const heading3 = t => para(t, 'Heading3');
    const normal   = t => para(t, 'Normal');
    const mono     = t => `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
    const spacer   = () => `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
    const pageBreak= () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

    const defTable = defs => {
      if (!defs.length) return '';
      const rows = defs.map(d => `
        <w:tr>
          <w:td><w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/></w:tcPr>
            <w:p><w:r><w:rPr><w:b/><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t>${esc(d.term)}</w:t></w:r></w:p>
          </w:td>
          <w:td><w:tcPr><w:tcW w:w="5400" w:type="dxa"/></w:tcPr>
            <w:p><w:r><w:t xml:space="preserve">${esc(d.description)}</w:t></w:r></w:p>
          </w:td>
        </w:tr>`).join('');
      return `<w:tbl>
        <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
            <w:left w:val="none"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
            <w:right w:val="none"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="DDDDDD"/>
            <w:insideV w:val="none"/>
          </w:tblBorders>
        </w:tblPr>
        <w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="5400"/></w:tblGrid>
        ${rows}
      </w:tbl>`;
    };

    const body = nodes.map((node, ni) => {
      const date = new Date(node.createdAt || Date.now()).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
      const meta = [node.subject, node.chapter, date].filter(Boolean).join('  ·  ');

      let parts = (ni > 0 ? pageBreak() : '') + heading1(node.title) + normal(meta) + spacer();

      if (node.blocks?.length) {
        // ── Modern blocks format ──────────────────────
        node.blocks.forEach(b => {
          switch (b.type) {
            case 'prose':
              if (b.title) parts += heading3(b.title);
              parts += normal((b.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
              parts += spacer();
              break;
            case 'callout':
              if (b.title) parts += heading3(b.title);
              parts += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FEF9EC"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="4" w:color="F0A500"/></w:pBdr></w:pPr><w:r><w:t xml:space="preserve">${esc((b.html || '').replace(/<[^>]+>/g, ' ').trim())}</w:t></w:r></w:p>`;
              parts += spacer();
              break;
            case 'definition':
              parts += heading2(b.title || 'Definitions');
              if (b.items?.length) parts += defTable(b.items);
              parts += spacer();
              break;
            case 'formula':
              parts += heading2(b.title || 'Formulas');
              (b.items || []).forEach(f => {
                parts += mono(f.expression);
                if (f.description) parts += normal(f.description);
                if (f.constraints) parts += normal('Constraints: ' + f.constraints);
                parts += spacer();
              });
              break;
            case 'table':
              parts += heading2(b.title || 'Table');
              if (b.columns?.length && b.rows?.length) {
                const cols = b.columns;
                const colWidth = Math.floor(8200 / cols.length);
                const headerRow = '<w:tr>' + cols.map(c =>
                  `<w:td><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p></w:td>`
                ).join('') + '</w:tr>';
                const dataRows = (b.rows || []).map(row =>
                  '<w:tr>' + cols.map((_, ci) =>
                    `<w:td><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${esc(row[ci] || '')}</w:t></w:r></w:p></w:td>`
                  ).join('') + '</w:tr>'
                ).join('');
                parts += `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${cols.map(() => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;
              }
              parts += spacer();
              break;
            case 'procedure':
              parts += heading2(b.title || 'Procedure');
              if (b.appliesTo) parts += normal('Applies to: ' + b.appliesTo);
              (b.steps || []).forEach((s, i) => {
                parts += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${i+1}.  </w:t></w:r><w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r></w:p>`;
              });
              if (b.notes) parts += normal('Note: ' + b.notes);
              parts += spacer();
              break;
            case 'flashcards':
              parts += heading2(b.title || 'Flashcards');
              (b.cards || []).forEach(c => {
                parts += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(c.front)}</w:t></w:r></w:p>`;
                parts += `<w:p><w:r><w:rPr><w:color w:val="444444"/></w:rPr><w:t xml:space="preserve">→ ${esc(c.back)}</w:t></w:r></w:p>`;
                parts += spacer();
              });
              break;
            case 'quiz':
              parts += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">❓ ${esc(b.q || '')}</w:t></w:r></w:p>`;
              (b.options || []).forEach((o, i) => {
                const isAnswer = i === b.answer;
                parts += `<w:p><w:r><w:rPr>${isAnswer ? '<w:color w:val="1E8C45"/>' : '<w:color w:val="555555"/>'}</w:rPr><w:t xml:space="preserve">${isAnswer ? '✓' : '○'} ${esc(o)}</w:t></w:r></w:p>`;
              });
              parts += spacer();
              break;
            default:
              if (b.title) parts += normal('[Interactive: ' + b.title + ']');
          }
        });
      } else {
        // ── Legacy fields fallback ────────────────────
        if (node.definitions?.length) {
          parts += heading2('Key Definitions') + defTable(node.definitions) + spacer();
        }
        if (node.formulas?.length) {
          parts += heading2('Formulas & Equations');
          node.formulas.forEach(f => {
            parts += mono(f.expression);
            if (f.description)  parts += normal(f.description);
            if (f.constraints)  parts += normal('Constraints: ' + f.constraints);
            parts += spacer();
          });
        }
        if (node.procedures?.length) {
          parts += heading2('Procedures');
          node.procedures.forEach(proc => {
            if (proc.title) parts += heading3(proc.title);
            if (proc.appliesTo) parts += normal('Applies to: ' + proc.appliesTo);
            (proc.steps || []).forEach((s, i) => {
              parts += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${i+1}.  </w:t></w:r><w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r></w:p>`;
            });
            if (proc.notes) parts += normal('Note: ' + proc.notes);
            parts += spacer();
          });
        }
        if (node.tables?.length) {
          parts += heading2('Tables');
          node.tables.forEach(tbl => {
            if (tbl.title) parts += heading3(tbl.title);
            if (tbl.columns?.length && tbl.rows?.length) {
              const cols = tbl.columns;
              const colWidth = Math.floor(8200 / cols.length);
              const headerRow = '<w:tr>' + cols.map(c =>
                `<w:td><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p></w:td>`
              ).join('') + '</w:tr>';
              const dataRows = (tbl.rows || []).map(row =>
                '<w:tr>' + cols.map((_, ci) =>
                  `<w:td><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${esc(row[ci] || '')}</w:t></w:r></w:p></w:td>`
                ).join('') + '</w:tr>'
              ).join('');
              parts += `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${cols.map(() => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;
            }
            parts += spacer();
          });
        }
        if (node.commonMistakes?.length) {
          parts += heading2('Common Mistakes');
          node.commonMistakes.forEach(m => {
            parts += `<w:p><w:r><w:rPr><w:color w:val="C0392B"/></w:rPr><w:t xml:space="preserve">⚠  ${esc(m)}</w:t></w:r></w:p>`;
          });
          parts += spacer();
        }
        if (node.summary) parts += heading2('Summary') + normal(node.summary) + spacer();
      }

      if (node.userNotes) {
        parts += heading2('My Notes') + `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EEF4FB"/></w:pPr><w:r><w:t xml:space="preserve">${esc(node.userNotes)}</w:t></w:r></w:p>` + spacer();
      }

      const recall = node.questions?.filter(q => q.type === 'recall')      || [];
      const apply  = node.questions?.filter(q => q.type === 'application') || [];
      if (recall.length || apply.length) {
        parts += pageBreak() + heading2('Questions');
        if (recall.length) {
          parts += heading3('Recall Questions');
          recall.forEach((q, i) => {
            parts += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Q${i+1}: ${esc(q.question)}</w:t></w:r></w:p>`;
            parts += `<w:p><w:r><w:rPr><w:i/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">Answer: ${esc(q.answer)}</w:t></w:r></w:p>`;
            parts += spacer();
          });
        }
        if (apply.length) {
          parts += heading3('Application Questions');
          apply.forEach((q, i) => {
            parts += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Q${i+1}: ${esc(q.question)}</w:t></w:r></w:p>`;
            parts += `<w:p><w:r><w:rPr><w:i/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">Answer: ${esc(q.answer)}</w:t></w:r></w:p>`;
            parts += spacer();
          });
        }
      }
      return parts;
    }).join('');

    return body;
  },

  _downloadDocx(bodyXML, filename) {
    // Minimal valid .docx (Office Open XML) built entirely in browser
    const docXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXML}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const stylesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="22"/></w:rPr>
    <w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/>
      <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="F0A500"/></w:pBdr>
    </w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="111111"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="333333"/><w:caps/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="555555"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders></w:tblPr>
  </w:style>
</w:styles>`;

    const relsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const appRelsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

    // Build zip using a minimal zip writer (pure JS, no dependencies)
    const zip = this._buildZip({
      '[Content_Types].xml':      contentTypes,
      '_rels/.rels':              appRelsXML,
      'word/document.xml':        docXML,
      'word/styles.xml':          stylesXML,
      'word/_rels/document.xml.rels': relsXML,
    });

    this._download(`${filename}.docx`, zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  },

  // ─── HTML Export ──────────────────────────────────────

  exportHTML(node) {
    const body = this._buildPrintHTML(node);
    const full = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${this._esc(node.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;1,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>body{font-family:'Lora',Georgia,serif;font-size:12pt;line-height:1.7;max-width:820px;margin:48px auto;padding:0 24px;color:#111;}</style>
</head><body>${body}</body></html>`;
    this._download(`${this._safeFilename(node.title)}.html`, full, 'text/html');
    Toast.success('Node exported as HTML.');
  },

  // ─── JSON Export ──────────────────────────────────────

  exportJSON(node) {
    this._download(`${this._safeFilename(node.title)}.json`, JSON.stringify(node.toJSON(), null, 2), 'application/json');
    Toast.success('Node exported as JSON backup.');
  },

  exportAllJSON(nodes) {
    const data = JSON.stringify(nodes.map(n => n.toJSON()), null, 2);
    this._download('KnowledgeNode_backup.json', data, 'application/json');
    Toast.success(`${nodes.length} nodes exported as JSON backup.`);
  },

  // ─── Shared HTML builder ──────────────────────────────

  _buildPrintHTML(node) {
    const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const date = new Date(node.createdAt || Date.now()).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

    let contentHTML = '';

    // ── Prefer blocks (modern format) ────────────────────
    if (node.blocks?.length) {
      node.blocks.forEach(b => {
        switch (b.type) {
          case 'prose':
            contentHTML += '<div style="margin-bottom:14pt;">'
              + (b.title ? '<h3 style="font-size:11pt;font-weight:700;margin-bottom:6pt;">' + esc(b.title) + '</h3>' : '')
              + '<div style="font-size:10.5pt;line-height:1.7;">' + (b.html || '').replace(/<[^>]+>/g,' ').trim() + '</div></div>';
            break;
          case 'callout':
            contentHTML += '<div style="border-left:3pt solid #f0a500;background:#fef9ec;padding:10pt 14pt;margin-bottom:12pt;font-size:10pt;line-height:1.6;">'
              + (b.title ? '<strong>' + esc(b.title) + '</strong><br>' : '')
              + (b.html || '').replace(/<[^>]+>/g,' ').trim() + '</div>';
            break;
          case 'definition':
            contentHTML += '<h2>' + esc(b.title || 'Definitions') + '</h2>'
              + (b.items || []).map(d =>
                  '<div class="def"><div class="def-term">' + esc(d.term) + '</div>'
                  + '<div>'
                  + (d.examples ? '<div style="font-style:italic;color:#666;font-size:9.5pt;">Examples: ' + esc(d.examples) + '</div>' : '')
                  + esc(d.description) + '</div></div>'
                ).join('');
            break;
          case 'formula':
            contentHTML += '<h2>' + esc(b.title || 'Formulas') + '</h2>'
              + (b.items || []).map(f =>
                  '<div class="formula"><div class="formula-expr">' + esc(f.expression) + '</div>'
                  + (f.description ? '<div class="formula-desc">' + esc(f.description) + '</div>' : '')
                  + (f.constraints ? '<div class="formula-con">Constraints: ' + esc(f.constraints) + '</div>' : '')
                  + '</div>'
                ).join('');
            break;
          case 'table':
            contentHTML += '<h2>' + esc(b.title || 'Table') + '</h2>'
              + '<div style="margin-bottom:16pt;">'
              + '<table style="width:100%;border-collapse:collapse;font-size:10pt;">'
              + (b.columns?.length ? '<thead><tr>' + b.columns.map(c => '<th style="border:1pt solid #ccc;background:#f5f5f5;padding:5pt 8pt;text-align:left;font-weight:700;">' + esc(c) + '</th>').join('') + '</tr></thead>' : '')
              + '<tbody>' + (b.rows || []).map(row => '<tr>' + (b.columns || []).map((_, ci) => '<td style="border:1pt solid #ddd;padding:5pt 8pt;">' + esc(row[ci] || '') + '</td>').join('') + '</tr>').join('') + '</tbody>'
              + '</table></div>';
            break;
          case 'procedure':
            contentHTML += '<h2>' + esc(b.title || 'Procedure') + '</h2>'
              + '<div style="margin-bottom:16pt;">'
              + (b.appliesTo ? '<div style="font-size:9pt;color:#666;margin-bottom:6pt;">Applies to: ' + esc(b.appliesTo) + '</div>' : '')
              + (b.steps || []).map((s, i) => '<div class="step"><span class="step-num">' + (i+1) + '.</span><span>' + esc(s) + '</span></div>').join('')
              + (b.notes ? '<div style="font-size:9.5pt;color:#555;margin-top:5pt;font-style:italic;">Note: ' + esc(b.notes) + '</div>' : '')
              + '</div>';
            break;
          case 'flashcards':
            contentHTML += '<h2>' + esc(b.title || 'Flashcards') + '</h2>'
              + (b.cards || []).map(c =>
                  '<div style="border:1pt solid #ddd;border-radius:4pt;padding:8pt 12pt;margin-bottom:8pt;">'
                  + '<div style="font-weight:700;font-size:10pt;margin-bottom:4pt;">' + esc(c.front) + '</div>'
                  + '<div style="font-size:10pt;color:#444;border-top:0.5pt solid #eee;padding-top:4pt;">' + esc(c.back) + '</div>'
                  + '</div>'
                ).join('');
            break;
          case 'quiz':
            contentHTML += '<div style="border:1pt solid #ddd;padding:10pt 14pt;margin-bottom:10pt;">'
              + '<div style="font-weight:700;font-size:10pt;margin-bottom:6pt;">❓ ' + esc(b.q || '') + '</div>'
              + (b.options || []).map((o, i) =>
                  '<div style="font-size:10pt;padding:3pt 0;' + (i === b.answer ? 'color:#1a7a3c;font-weight:700;' : 'color:#555;') + '">'
                  + (i === b.answer ? '✓ ' : '○ ') + esc(o) + '</div>'
                ).join('')
              + (b.fb ? '<div style="font-size:9.5pt;color:#666;margin-top:5pt;font-style:italic;">' + esc(b.fb) + '</div>' : '')
              + '</div>';
            break;
          // code, calc, webpreview, match, diagram — print as description only
          default:
            if (b.title) contentHTML += '<div style="border:1pt solid #eee;border-radius:4pt;padding:8pt 12pt;margin-bottom:10pt;color:#888;font-size:9.5pt;font-style:italic;">[Interactive block: ' + esc(b.title) + ']</div>';
        }
      });
    } else {
      // ── Fallback: legacy fields ───────────────────────
      contentHTML += node.definitions?.length ? '<h2>Key Definitions</h2>'
        + node.definitions.map(d =>
            '<div class="def"><div class="def-term">' + esc(d.term) + '</div>'
            + '<div>' + (d.examples ? '<div style="font-style:italic;color:#666;font-size:9.5pt;">Examples: ' + esc(d.examples) + '</div>' : '') + esc(d.description) + '</div></div>'
          ).join('') : '';
      contentHTML += node.formulas?.length ? '<h2>Formulas &amp; Equations</h2>'
        + node.formulas.map(f =>
            '<div class="formula"><div class="formula-expr">' + esc(f.expression) + '</div>'
            + (f.description ? '<div class="formula-desc">' + esc(f.description) + '</div>' : '')
            + (f.constraints ? '<div class="formula-con">Constraints: ' + esc(f.constraints) + '</div>' : '')
            + '</div>'
          ).join('') : '';
      contentHTML += node.procedures?.length ? '<h2>Procedures</h2>'
        + node.procedures.map(proc =>
            '<div style="margin-bottom:16pt;">'
            + '<div style="font-weight:700;font-size:11pt;margin-bottom:4pt;">' + esc(proc.title || '') + '</div>'
            + (proc.appliesTo ? '<div style="font-size:9pt;color:#666;margin-bottom:6pt;">Applies to: ' + esc(proc.appliesTo) + '</div>' : '')
            + (proc.steps || []).map((s, i) => '<div class="step"><span class="step-num">' + (i+1) + '.</span><span>' + esc(s) + '</span></div>').join('')
            + '</div>'
          ).join('') : '';
      contentHTML += node.tables?.length ? '<h2>Tables</h2>'
        + node.tables.map(tbl =>
            '<div style="margin-bottom:16pt;">'
            + (tbl.title ? '<div style="font-weight:700;font-size:10.5pt;margin-bottom:6pt;">' + esc(tbl.title) + '</div>' : '')
            + '<table style="width:100%;border-collapse:collapse;font-size:10pt;">'
            + (tbl.columns?.length ? '<thead><tr>' + tbl.columns.map(c => '<th style="border:1pt solid #ccc;background:#f5f5f5;padding:5pt 8pt;text-align:left;font-weight:700;">' + esc(c) + '</th>').join('') + '</tr></thead>' : '')
            + '<tbody>' + (tbl.rows || []).map(row => '<tr>' + (tbl.columns || []).map((_, ci) => '<td style="border:1pt solid #ddd;padding:5pt 8pt;">' + esc(row[ci] || '') + '</td>').join('') + '</tr>').join('') + '</tbody>'
            + '</table></div>'
          ).join('') : '';
      contentHTML += node.commonMistakes?.length ? '<h2>Common Mistakes</h2>' + node.commonMistakes.map(m => '<div class="mistake">' + esc(m) + '</div>').join('') : '';
      contentHTML += node.summary ? '<h2>Summary</h2><div class="summary">' + esc(node.summary) + '</div>' : '';
    }

    contentHTML += node.userNotes ? '<h2>My Notes</h2><div class="user-notes">' + esc(node.userNotes) + '</div>' : '';

    const recall = node.questions?.filter(q => q.type === 'recall')      || [];
    const apply  = node.questions?.filter(q => q.type === 'application') || [];
    const questions = (recall.length || apply.length) ?
      '<div style="page-break-before:always;"></div><h2>Questions</h2>'
      + (recall.length ? '<h3 style="font-size:11pt;margin:14pt 0 8pt;">Recall Questions</h3>'
          + recall.map((q, i) => '<div class="question"><div class="q-label">Recall ' + (i+1) + '</div><div>' + esc(q.question) + '</div><div class="q-answer"><strong>Answer:</strong> ' + esc(q.answer) + '</div></div>').join('') : '')
      + (apply.length ? '<h3 style="font-size:11pt;margin:14pt 0 8pt;">Application Questions</h3>'
          + apply.map((q, i) => '<div class="question"><div class="q-label">Application ' + (i+1) + '</div><div>' + esc(q.question) + '</div><div class="q-answer"><strong>Answer:</strong> ' + esc(q.answer) + '</div></div>').join('') : '') : '';

    return '<h1>' + esc(node.title) + '</h1>'
      + '<div class="meta">' + [node.subject, node.chapter, date, 'Mastery: ' + (node.masteryScore || 0) + '%'].filter(Boolean).join('  \xb7  ') + '</div>'
      + contentHTML + questions;
  },
  // ─── Minimal ZIP writer (pure JS, no deps) ────────────

  _buildZip(files) {
    const enc   = new TextEncoder();
    const parts = [];
    const centralDir = [];
    let offset = 0;

    for (const [name, content] of Object.entries(files)) {
      const nameBytes    = enc.encode(name);
      const contentBytes = enc.encode(content);
      const crc          = this._crc32(contentBytes);
      const size         = contentBytes.length;

      // Local file header
      const local = new Uint8Array(30 + nameBytes.length + size);
      const lv = new DataView(local.buffer);
      lv.setUint32(0,  0x04034b50, true); // signature
      lv.setUint16(4,  20,         true); // version needed
      lv.setUint16(6,  0,          true); // flags
      lv.setUint16(8,  0,          true); // compression (stored)
      lv.setUint16(10, 0,          true); // mod time
      lv.setUint16(12, 0,          true); // mod date
      lv.setUint32(14, crc,        true); // crc32
      lv.setUint32(18, size,       true); // compressed size
      lv.setUint32(22, size,       true); // uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0,          true); // extra length
      local.set(nameBytes, 30);
      local.set(contentBytes, 30 + nameBytes.length);
      parts.push(local);

      // Central directory entry
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0,  0x02014b50, true);
      cv.setUint16(4,  20,         true);
      cv.setUint16(6,  20,         true);
      cv.setUint16(8,  0,          true);
      cv.setUint16(10, 0,          true);
      cv.setUint16(12, 0,          true);
      cv.setUint16(14, 0,          true);
      cv.setUint32(16, crc,        true);
      cv.setUint32(20, size,       true);
      cv.setUint32(24, size,       true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0,          true);
      cv.setUint16(32, 0,          true);
      cv.setUint16(34, 0,          true);
      cv.setUint16(36, 0,          true);
      cv.setUint32(38, 0,          true);
      cv.setUint32(42, offset,     true);
      cd.set(nameBytes, 46);
      centralDir.push(cd);

      offset += local.length;
    }

    const cdBytes  = this._concat(centralDir);
    const eocd     = new Uint8Array(22);
    const ev       = new DataView(eocd.buffer);
    ev.setUint32(0,  0x06054b50,      true);
    ev.setUint16(4,  0,               true);
    ev.setUint16(6,  0,               true);
    ev.setUint16(8,  centralDir.length, true);
    ev.setUint16(10, centralDir.length, true);
    ev.setUint32(12, cdBytes.length,  true);
    ev.setUint32(16, offset,          true);
    ev.setUint16(20, 0,               true);

    return this._concat([...parts, cdBytes, eocd]);
  },

  _crc32(data) {
    const table = this._crc32Table || (this._crc32Table = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
      }
      return t;
    })());
    let crc = 0xffffffff;
    for (const b of data) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  },

  _concat(arrays) {
    const total  = arrays.reduce((s, a) => s + a.length, 0);
    const result = new Uint8Array(total);
    let offset   = 0;
    for (const a of arrays) { result.set(a, offset); offset += a.length; }
    return result;
  },

  // ─── Helpers ──────────────────────────────────────────

  _download(filename, content, type) {
    const blob = new Blob([content], { type });
    // Native save on Android (where <a download>/navigator.share don't work),
    // browser link download otherwise — both handled by KNFiles.
    if (window.KNFiles) { KNFiles.save(filename, type, blob); return; }

    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  _safeFilename: name => String(name || 'export').replace(/[^a-z0-9_\-]/gi, '_').slice(0, 60),
  _esc: s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
