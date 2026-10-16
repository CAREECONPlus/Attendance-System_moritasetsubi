/**
 * ui-csv.js — CSV のプレビュー（ダウンロード前に内容を確認する）
 *
 * UI.csvPreview(csvText, filename, options) を呼ぶと、先頭数行を表にして確認ダイアログを出し、
 * 「この内容でダウンロード」で保存する。「次回からプレビューを省略」は端末に記憶する。
 * admin.js / expense-report.js の downloadCSV はこの関数を通るように差し替えてある。
 */
(function () {
  'use strict';

  const SKIP_KEY = 'ui_csv_preview_skip';
  const PREVIEW_ROWS = 50;

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    const src = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
  }

  function saveFile(csvText, filename, withBom) {
    const body = (withBom === false || /^﻿/.test(csvText)) ? csvText : '﻿' + csvText;
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (window.UI && typeof UI.toast === 'function') UI.toast(`${filename} を保存しました`, 'success');
  }

  // 列名を表計算ソフトと同じ A, B, …, Z, AA, AB … にする
  function columnLetter(i) {
    let n = i + 1, s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function skipPreview() { try { return localStorage.getItem(SKIP_KEY) === '1'; } catch (e) { return false; } }

  function csvPreview(csvText, filename, options) {
    const o = options || {};
    const esc = (t) => (window.UI ? UI.escapeHtml(t) : String(t == null ? '' : t));
    if (skipPreview() && !o.force) { saveFile(csvText, filename, o.bom); return Promise.resolve(true); }
    const rows = parseCSV(csvText);
    const header = rows[0] || [];
    const body = rows.slice(1);
    const shown = body.slice(0, PREVIEW_ROWS);
    const cols = Math.max(header.length, ...rows.map((r) => r.length), 0);
    const isNum = (v) => /^-?[\d,]+(\.\d+)?%?$/.test(String(v).trim()) && String(v).trim() !== '';
    const title = o.title || `${String(filename).replace(/\.csv$/i, '')} の内容を確認`;
    const metaParts = [];
    if (o.subtitle) metaParts.push(o.subtitle);
    metaParts.push(`${body.length}行`, `${cols}列`, `ファイル名 <span class="ui-mono">${esc(filename)}</span>`, `文字コード UTF-8（BOM付き、Excelでそのまま開けます）`);

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ui ui-overlay ui-csv-overlay';
      overlay.innerHTML = `
        <section class="ui-csv-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-csv-title">
          <div class="ui-csv-head">
            <div>
              <h2 id="ui-csv-title">${esc(title)}</h2>
              <span class="ui-csv-meta">${metaParts.join('　')}</span>
            </div>
            <button type="button" class="ui-close-btn" data-act="cancel" aria-label="閉じる"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
          ${o.warning ? `<div class="ui-csv-warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/></svg><span>${esc(o.warning)}</span></div>` : ''}
          <div class="ui-csv-table ui-sheet-grid">
            ${rows.length ? `<table>
              <thead><tr><th class="ui-sheet-corner" aria-hidden="true"></th>${Array.from({ length: cols }, (_, i) => `<th class="ui-sheet-col" scope="col">${columnLetter(i)}</th>`).join('')}</tr></thead>
              <tbody>
                <tr class="ui-sheet-header-row"><th class="ui-sheet-rownum" scope="row">1</th>${Array.from({ length: cols }, (_, i) => `<td>${esc(header[i] == null ? '' : header[i])}</td>`).join('')}</tr>
                ${shown.map((r, ri) => `<tr><th class="ui-sheet-rownum" scope="row">${ri + 2}</th>${Array.from({ length: cols }, (_, i) => `<td class="${isNum(r[i]) ? 'num' : ''}">${esc(r[i] == null ? '' : r[i])}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>` : '<div class="ui-empty"><strong>出力する行がありません</strong></div>'}
          </div>
          <div class="ui-csv-foot-note">
            <span>${body.length > shown.length ? `先頭 ${shown.length} 行を表示しています（見出しを除いて全 ${body.length} 行）。` : `見出しを除いて全 ${body.length} 行です。`}1 行目は見出しです。</span>
            <span>${esc(o.note || '')}</span>
          </div>
          <div class="ui-csv-actions">
            <label class="ui-csv-skip"><input type="checkbox" data-skip> 次回からプレビューを省略してすぐ保存する</label>
            <div class="ui-csv-buttons">
              <button type="button" class="ui-btn ui-btn-secondary" data-act="cancel">キャンセル</button>
              <button type="button" class="ui-btn ui-btn-primary" data-act="ok"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>この内容でダウンロード</button>
            </div>
          </div>
        </section>`;
      document.body.appendChild(overlay);
      const done = (ok) => {
        if (ok) {
          try { if (overlay.querySelector('[data-skip]').checked) localStorage.setItem(SKIP_KEY, '1'); } catch (e) { /* ignore */ }
          saveFile(csvText, filename, o.bom);
        }
        overlay.remove(); document.removeEventListener('keydown', onKey); resolve(ok);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey);
      overlay.querySelectorAll('[data-act="cancel"]').forEach((b) => b.addEventListener('click', () => done(false)));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
      overlay.querySelector('[data-act="ok"]').focus();
    });
  }

  function resetCsvPreviewSkip() { try { localStorage.removeItem(SKIP_KEY); } catch (e) { /* ignore */ } }

  window.UI = window.UI || {};
  window.UI.csvPreview = csvPreview;
  window.UI.parseCSV = parseCSV;
  window.UI.resetCsvPreviewSkip = resetCsvPreviewSkip;
})();
