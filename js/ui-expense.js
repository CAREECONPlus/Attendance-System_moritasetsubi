/**
 * ui-expense.js — 従業員の「経費」タブ（UI刷新）
 *
 * expense.js の保存・削除・モーダル制御はそのまま使い、一覧の描画と月送り、
 * 登録シートの見た目（経費項目の選択ボタン・現場の初期値）だけを足す。
 */
(function () {
  'use strict';

  const CATEGORY = { parking: '駐車場代', tools: '工具代', highway: '高速代', other: 'その他' };
  const esc = (t) => (window.UI ? UI.escapeHtml(t) : String(t == null ? '' : t));
  const tenantId = () => (window.getCurrentTenantId ? window.getCurrentTenantId() : null);

  // ---------- 月送り ----------
  function monthValue() {
    const input = document.getElementById('expense-month-filter');
    if (!input) return '';
    if (!input.value) {
      const now = new Date();
      input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return input.value;
  }
  function updateMonthLabel() {
    const v = monthValue();
    const label = document.getElementById('expense-month-label');
    if (label && v) label.textContent = `${v.slice(0, 4)}年${parseInt(v.slice(5, 7), 10)}月`;
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const sum = document.querySelector('.ui-expense-summary > span:first-child');
    if (sum) sum.firstChild.textContent = (v === cur ? '今月の合計 ' : 'この月の合計 ');
  }
  function shiftExpenseMonth(delta) {
    const input = document.getElementById('expense-month-filter');
    if (!input) return;
    const v = monthValue();
    const d = new Date(parseInt(v.slice(0, 4), 10), parseInt(v.slice(5, 7), 10) - 1 + delta, 1);
    input.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    updateMonthLabel();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- 一覧 ----------
  function fmtDate(dateStr) {
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return dateStr || '';
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${parseInt(m[2], 10)}/${m[3]}（${w}）`;
  }
  function setSummary(total, count) {
    const t = document.getElementById('expense-total-amount');
    const c = document.getElementById('expense-count');
    if (t) t.textContent = '¥' + Number(total || 0).toLocaleString('ja-JP');
    if (c) { c.textContent = String(count || 0); c.insertAdjacentText('afterend', ''); }
    const cWrap = c && c.parentElement;
    if (cWrap && !cWrap.querySelector('.ui-expense-unit')) { const u = document.createElement('span'); u.className = 'ui-expense-unit'; u.textContent = ' 件'; cWrap.appendChild(u); }
  }

  async function loadExpenseList() {
    const host = document.getElementById('expense-cards-grid');
    const tid = tenantId();
    const user = window.currentUser || firebase.auth().currentUser;
    if (!host || !tid || !user) return;
    updateMonthLabel();
    const month = monthValue();
    const site = (document.getElementById('expense-site-filter') || {}).value || '';
    try {
      const snap = await firebase.firestore().collection('tenants').doc(tid).collection('expenses').where('userId', '==', user.uid).get();
      let items = [];
      snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
      items = items.filter((e) => (!month || String(e.date || '').startsWith(month)) && (!site || e.siteName === site));
      items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt && a.createdAt && b.createdAt.seconds - a.createdAt.seconds) || 0);
      const total = items.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      setSummary(total, items.length);
      if (!items.length) {
        host.innerHTML = `<div class="ui-empty"><strong>${site ? 'この現場の経費はありません' : 'この月の経費はまだありません'}</strong><span>下の「経費を追加」から記録できます</span></div>`;
        return;
      }
      host.innerHTML = items.map((e) => `
        <button type="button" class="ui-expense-row" onclick="openEditExpenseModal('${esc(e.id)}')">
          <span class="ui-expense-row-main">
            <span class="ui-expense-row-head"><span class="ui-expense-row-date">${esc(fmtDate(e.date))}</span><span class="ui-badge ui-cat-${esc(e.category || 'other')}">${esc(CATEGORY[e.category] || e.category || 'その他')}</span></span>
            <span class="ui-expense-row-sub">${esc([e.siteName, e.description].filter(Boolean).join('　'))}</span>
          </span>
          <span class="ui-expense-row-amount">¥${Number(e.amount || 0).toLocaleString('ja-JP')}</span>
        </button>`).join('');
    } catch (err) {
      console.error('経費一覧の読み込みに失敗:', err);
      host.innerHTML = '<div class="ui-empty"><strong>経費一覧を読み込めませんでした</strong><span>通信状況を確認して、もう一度開いてください</span></div>';
      setSummary(0, 0);
    }
  }

  // ---------- 登録・編集シート ----------
  function afterOpen() {
    const id = (document.getElementById('expense-id') || {}).value || '';
    const title = document.getElementById('expense-modal-title');
    if (title) title.textContent = id ? '経費を編集' : '経費を追加';
    const submit = document.getElementById('expense-submit-btn');
    if (submit) submit.textContent = '保存';
    const del = document.getElementById('expense-delete-btn');
    if (del) del.classList.toggle('ui-hidden', !id);
    const cat = document.getElementById('expense-category');
    if (cat) {
      if (!id && !cat.value) cat.value = 'parking';
      if (window.UI) UI.selectTypeValue('expense-category', cat.value);
    }
    const hint = document.getElementById('expense-site-hint');
    const siteSel = document.getElementById('expense-site-name');
    if (hint) hint.textContent = '';
    if (!id && siteSel) {
      const today = window.todayAttendanceData;
      const todaySite = today && today.siteName;
      // 現場リストは非同期で入るので、少し待ってから初期値を入れる
      setTimeout(() => {
        if (todaySite && Array.from(siteSel.options).some((o) => o.value === todaySite)) {
          siteSel.value = todaySite;
          if (hint) hint.textContent = '今日出勤を記録した現場が選ばれています';
        }
      }, 400);
    }
  }

  function wrap(name) {
    const orig = window[name];
    if (typeof orig !== 'function' || orig.__uiWrapped) return;
    const wrapped = async function () { const r = await orig.apply(this, arguments); afterOpen(); return r; };
    wrapped.__uiWrapped = true;
    window[name] = wrapped;
  }

  function openExpenseSheet() { if (typeof window.openExpenseModal === 'function') window.openExpenseModal(); }
  async function deleteFromExpenseSheet() {
    const id = (document.getElementById('expense-id') || {}).value;
    if (!id) return;
    const ok = await UI.confirm({ title: '経費を削除', message: 'この経費を削除します。元に戻せません。', confirmText: '削除する', danger: true });
    if (!ok) return;
    const nativeConfirm = window.confirm;
    window.confirm = () => true; // expense.js の confirm を通す
    try {
      if (typeof window.closeExpenseModal === 'function') window.closeExpenseModal();
      await window.deleteExpense(id);
    } finally { window.confirm = nativeConfirm; }
  }

  function init() {
    monthValue();
    updateMonthLabel();
    wrap('openExpenseModal');
    wrap('openEditExpenseModal');
    if (window.UI) UI.initTypeGroups(document);
  }

  window.loadExpenseList = loadExpenseList;
  window.shiftExpenseMonth = shiftExpenseMonth;
  window.openExpenseSheet = openExpenseSheet;
  window.deleteFromExpenseSheet = deleteFromExpenseSheet;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
