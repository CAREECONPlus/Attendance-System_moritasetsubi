/**
 * ui.js — UI刷新の共通部品
 *
 * - UI.toast / UI.confirm / UI.prompt: ブラウザの alert / confirm / prompt の置き換え
 *   （window.alert は toast に差し替える。confirm / prompt は同期APIのため既存コードはそのまま動き、
 *     新しいコードから UI.confirm / UI.prompt（Promise）を使う）
 * - 勤務種別・経費項目の選択ボタン（.ui-type-group）と隠し input の同期
 * - 管理者サイドバーのたたむ／開く
 * - 打刻画面の主ボタン下の説明文の更新
 */
(function () {
  'use strict';

  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4 4L19 7"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  // 絵文字で始まる既存メッセージから種類を推定し、絵文字は取り除く
  function classify(message) {
    const m = String(message || '');
    if (/失敗|エラー|できません|見つかりません|問題|不正|無効|❌|⚠️ /.test(m)) return 'error';
    if (/^⚠️|注意|確認してください/.test(m)) return 'warning';
    if (/完了|しました|成功|✅|登録|保存|削除|出力/.test(m)) return 'success';
    return 'info';
  }
  function stripEmoji(message) {
    return String(message || '').replace(/^[\s✅❌⚠️🌙📅🔄💾📥📋📨🎉👋🏢☕]+/, '').replace(/^\s*[！!]\s*/, '');
  }

  // ---------- トースト ----------
  let host = null;
  function getHost() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement('div');
    host.className = 'ui-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
  }

  function toast(message, type, options) {
    const opts = options || {};
    const kind = type && ICONS[type] ? type : classify(message);
    const el = document.createElement('div');
    el.className = `ui-toast ui-toast-${kind}`;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = `${ICONS[kind]}<span class="ui-toast-text"></span><button type="button" class="ui-toast-close" aria-label="閉じる">×</button>`;
    el.querySelector('.ui-toast-text').textContent = stripEmoji(message);
    const remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    el.querySelector('.ui-toast-close').addEventListener('click', remove);
    if (opts.action && typeof opts.action.onClick === 'function') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-btn ui-btn-sm';
      b.textContent = opts.action.label || '元に戻す';
      b.addEventListener('click', () => { opts.action.onClick(); remove(); });
      el.insertBefore(b, el.querySelector('.ui-toast-close'));
    }
    const h = getHost();
    // 同じ内容が連続したら増やさない
    Array.from(h.children).forEach((c) => { if (c.textContent === el.textContent) h.removeChild(c); });
    h.appendChild(el);
    while (h.children.length > 3) h.removeChild(h.firstChild);
    const duration = opts.duration != null ? opts.duration : (kind === 'error' ? 6000 : 3500);
    if (duration > 0) setTimeout(remove, duration);
    return el;
  }

  // ---------- 確認ダイアログ ----------
  function openOverlay(contentHtml, extraClass) {
    const overlay = document.createElement('div');
    overlay.className = 'ui ui-overlay' + (extraClass ? ' ' + extraClass : '');
    overlay.innerHTML = contentHtml;
    document.body.appendChild(overlay);
    return overlay;
  }

  function confirmDialog(options) {
    const o = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise((resolve) => {
      const overlay = openOverlay(`
        <div class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dlg-title">
          <h3 id="ui-dlg-title">${escapeHtml(o.title || '確認')}</h3>
          ${o.message ? `<p>${escapeHtml(o.message)}</p>` : ''}
          <div class="ui-dialog-actions">
            <button type="button" class="ui-btn ui-btn-secondary" data-act="cancel">${escapeHtml(o.cancelText || 'キャンセル')}</button>
            <button type="button" class="ui-btn ${o.danger ? 'ui-btn-danger-solid' : 'ui-btn-primary'}" data-act="ok">${escapeHtml(o.confirmText || 'OK')}</button>
          </div>
        </div>`);
      const done = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey);
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
      overlay.querySelector('[data-act="ok"]').focus();
    });
  }

  function promptDialog(options) {
    const o = typeof options === 'string' ? { label: options } : (options || {});
    return new Promise((resolve) => {
      const multiline = !!o.multiline;
      const overlay = openOverlay(`
        <div class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dlg-title">
          <h3 id="ui-dlg-title">${escapeHtml(o.title || '入力')}</h3>
          ${o.message ? `<p>${escapeHtml(o.message)}</p>` : ''}
          <div class="ui-field">
            <label class="ui-label" for="ui-dlg-input">${escapeHtml(o.label || '')}${o.required ? ' <span style="color:#B3123F">必須</span>' : ''}</label>
            ${multiline
              ? `<textarea id="ui-dlg-input" class="ui-textarea" placeholder="${escapeHtml(o.placeholder || '')}">${escapeHtml(o.value || '')}</textarea>`
              : `<input id="ui-dlg-input" class="ui-input" type="${escapeHtml(o.type || 'text')}" value="${escapeHtml(o.value || '')}" placeholder="${escapeHtml(o.placeholder || '')}" autocomplete="${escapeHtml(o.autocomplete || 'off')}">`}
            <span class="ui-hint" data-err style="color:#B3123F; display:none">入力してください</span>
          </div>
          <div class="ui-dialog-actions">
            <button type="button" class="ui-btn ui-btn-secondary" data-act="cancel">${escapeHtml(o.cancelText || 'キャンセル')}</button>
            <button type="button" class="ui-btn ${o.danger ? 'ui-btn-danger-solid' : 'ui-btn-primary'}" data-act="ok">${escapeHtml(o.confirmText || 'OK')}</button>
          </div>
        </div>`);
      const input = overlay.querySelector('#ui-dlg-input');
      const done = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const submit = () => {
        const v = input.value.trim();
        if (o.required && !v) { overlay.querySelector('[data-err]').style.display = ''; input.focus(); return; }
        done(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && !multiline) submit(); };
      document.addEventListener('keydown', onKey);
      overlay.querySelector('[data-act="ok"]').addEventListener('click', submit);
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => done(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null); });
      setTimeout(() => input.focus(), 0);
    });
  }

  // ---------- 選択ボタン（.ui-type-group） ----------
  function selectTypeValue(name, value) {
    const groups = document.querySelectorAll(`.ui-type-group[data-for="${name}"]`);
    groups.forEach((g) => {
      g.querySelectorAll('.ui-type-btn').forEach((b) => {
        const on = b.dataset.value === value;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    const hidden = document.getElementById(name);
    if (hidden && hidden.value !== value) {
      hidden.value = value;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function initTypeGroups(root) {
    (root || document).querySelectorAll('.ui-type-group[data-for]').forEach((g) => {
      if (g.dataset.uiBound) return;
      g.dataset.uiBound = '1';
      g.addEventListener('click', (e) => {
        const btn = e.target.closest('.ui-type-btn');
        if (!btn || !g.contains(btn)) return;
        selectTypeValue(g.dataset.for, btn.dataset.value);
        // 「その他の勤務」から選んだときは開いたままにし、4種類から選んだら閉じる
        const details = g.closest('details.ui-more');
        document.querySelectorAll(`.ui-type-group[data-for="${g.dataset.for}"]`).forEach((other) => {
          const d = other.closest('details.ui-more');
          if (d && d !== details) d.open = false;
        });
      });
    });
  }

  // ---------- 打刻画面: 主ボタンの説明文と現場チップの選択表示 ----------
  const TYPE_LABEL = { normal: '通常', holiday_work: '休日出勤', night_only: '夜間', through_night: '通し夜間', paid_leave: '有給休暇', compensatory_leave: '代休', absence: '欠勤' };
  const LEAVE_TYPES = ['paid_leave', 'compensatory_leave', 'absence'];

  function updateClockCaption() {
    const caption = document.getElementById('clock-in-caption');
    const btn = document.getElementById('clock-in-btn');
    if (!caption) return;
    const type = (document.getElementById('work-type') || {}).value || 'normal';
    const site = (document.getElementById('site-name') || {}).value || '';
    const breakMin = parseInt((document.getElementById('break-minutes') || {}).value, 10);
    const breakText = isNaN(breakMin) ? '休憩 60分' : `休憩 ${breakMin}分`;
    if (LEAVE_TYPES.includes(type)) {
      caption.textContent = `今日を「${TYPE_LABEL[type]}」として記録します（現場の選択は不要）`;
      if (btn && !btn.disabled) btn.textContent = `${TYPE_LABEL[type]}を記録する`;
    } else {
      caption.textContent = `${site ? site + '　' : ''}${TYPE_LABEL[type] || ''}　8:00〜17:00（${breakText}）で登録されます`;
      if (btn && !btn.disabled && /を記録する$/.test(btn.textContent)) btn.textContent = '出勤を記録する';
    }
    const siteCard = document.getElementById('site-field');
    if (siteCard) siteCard.classList.toggle('ui-muted', LEAVE_TYPES.includes(type));
  }

  function syncSiteChips() {
    const select = document.getElementById('site-name');
    const chips = document.querySelectorAll('#site-history-buttons .site-history-btn');
    if (!select) return;
    chips.forEach((c) => {
      const name = c.textContent.replace(/^[\s🏢]+/, '').trim();
      const on = name === select.value;
      c.classList.toggle('is-selected', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function initPunchScreen() {
    const select = document.getElementById('site-name');
    const breakSel = document.getElementById('break-minutes');
    const typeHidden = document.getElementById('work-type');
    if (select && !select.dataset.uiBound) {
      select.dataset.uiBound = '1';
      select.addEventListener('change', () => { syncSiteChips(); updateClockCaption(); });
    }
    if (breakSel && !breakSel.dataset.uiBound) { breakSel.dataset.uiBound = '1'; breakSel.addEventListener('change', updateClockCaption); }
    if (typeHidden && !typeHidden.dataset.uiBound) { typeHidden.dataset.uiBound = '1'; typeHidden.addEventListener('change', updateClockCaption); }
    const chipsHost = document.getElementById('site-history-buttons');
    if (chipsHost && !chipsHost.dataset.uiBound) {
      chipsHost.dataset.uiBound = '1';
      // employee.js が履歴ボタンを描き直すたびに選択表示を合わせる
      new MutationObserver(() => syncSiteChips()).observe(chipsHost, { childList: true });
      chipsHost.addEventListener('click', () => setTimeout(() => { syncSiteChips(); updateClockCaption(); }, 0));
    }
    updateClockCaption();
  }

  // ---------- 管理者サイドバー ----------
  function initAdminSidebar() {
    const page = document.getElementById('admin-page');
    const toggle = document.getElementById('admin-nav-toggle');
    if (!page || !toggle || toggle.dataset.uiBound) return;
    toggle.dataset.uiBound = '1';
    const apply = (collapsed) => {
      page.classList.toggle('ui-nav-collapsed', collapsed);
      toggle.setAttribute('aria-label', collapsed ? 'メニューを開く' : 'メニューをたたむ');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      try { localStorage.setItem('ui_admin_nav_collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    };
    let collapsed = false;
    try { collapsed = localStorage.getItem('ui_admin_nav_collapsed') === '1'; } catch (e) { /* ignore */ }
    apply(collapsed);
    toggle.addEventListener('click', () => apply(!page.classList.contains('ui-nav-collapsed')));
  }

  // ---------- ログアウト（アカウント設定モーダルから） ----------
  function logoutFromModal() {
    if (typeof window.closeAccountModal === 'function') window.closeAccountModal();
    const adminPage = document.getElementById('admin-page');
    const onAdmin = adminPage && !adminPage.classList.contains('hidden');
    const btn = document.getElementById(onAdmin ? 'admin-logout-btn' : 'logout-btn');
    if (btn) btn.click();
  }

  // ---------- パスワードの表示／非表示 ----------
  function bindPasswordToggles(root) {
    (root || document).querySelectorAll('.ui-pw-toggle[data-for]').forEach((btn) => {
      if (btn.dataset.uiBound) return;
      btn.dataset.uiBound = '1';
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.for);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
        btn.classList.toggle('is-on', show);
      });
    });
  }

  // ---------- アカウント（モーダル）: ユーザーカードとパスワード変更 ----------
  function fillAccountCard() {
    const u = window.currentUser || {};
    const name = u.displayName || (u.email ? u.email.split('@')[0] : '') || '—';
    const roleLabel = { employee: '従業員', admin: '管理者', super_admin: 'スーパー管理者' }[u.role] || '';
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('account-user-name', name);
    set('account-user-email', u.email || '');
    set('account-user-role', roleLabel);
    set('account-avatar', String(name).trim().charAt(0) || '？');
  }

  async function changePasswordFromAccount() {
    const user = firebase.auth().currentUser;
    if (!user || !user.email) { toast('ログインし直してからお試しください', 'error'); return; }
    const current = await promptDialog({ title: 'パスワードを変更', message: '確認のため、今のパスワードを入力してください。', label: '今のパスワード', type: 'password', required: true, confirmText: '次へ', autocomplete: 'current-password' });
    if (current == null) return;
    const next = await promptDialog({ title: '新しいパスワード', message: '6文字以上で入力してください。変更すると、他の端末はすべてログアウトされます。', label: '新しいパスワード', type: 'password', required: true, confirmText: '変更する', autocomplete: 'new-password' });
    if (next == null) return;
    if (next.length < 6) { toast('パスワードは6文字以上で入力してください', 'error'); return; }
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(next);
      if (window.sessionManager && typeof sessionManager.logoutOtherSessions === 'function') {
        try { await sessionManager.logoutOtherSessions(); if (typeof window.refreshSessionList === 'function') window.refreshSessionList(); } catch (e) { console.warn('他の端末のログアウトに失敗:', e); }
      }
      toast('パスワードを変更しました。他の端末はログアウトされます', 'success');
    } catch (e) {
      console.error('パスワード変更エラー:', e);
      if (e && (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-login-credentials')) toast('今のパスワードが違います', 'error');
      else if (e && e.code === 'auth/weak-password') toast('そのパスワードは使えません。別のものにしてください', 'error');
      else if (e && e.code === 'auth/too-many-requests') toast('しばらく時間をおいてからもう一度お試しください', 'error');
      else toast('パスワードを変更できませんでした', 'error');
    }
  }

  function wrapAccountModal() {
    const orig = window.openAccountModal;
    if (typeof orig !== 'function' || orig.__uiWrapped) return;
    const wrapped = function () { fillAccountCard(); return orig.apply(this, arguments); };
    wrapped.__uiWrapped = true;
    window.openAccountModal = wrapped;
  }

  // ---------- 初期化 ----------
  function init() {
    // alert → トースト（既存コードの 190 箇所をそのまま活かす）
    window.alert = function (message) { toast(message); };
    // missing-functions.js の通知も新しいトーストへ
    window.showNotification = function (message, type) { return toast(message, type); };
    window.showInfo = (m) => toast(m, 'info');
    window.showSuccess = (m) => toast(m, 'success');
    window.showError = (m) => toast(m, 'error');
    if (typeof window.showToast === 'function') window.showToast = (m, type) => toast(m, type);

    initTypeGroups(document);
    initPunchScreen();
    initAdminSidebar();
    bindPasswordToggles(document);
    wrapAccountModal();
  }

  window.UI = { toast, confirm: confirmDialog, prompt: promptDialog, selectTypeValue, initTypeGroups, updateClockCaption, syncSiteChips, initPunchScreen, initAdminSidebar, logoutFromModal, bindPasswordToggles, fillAccountCard, changePasswordFromAccount, escapeHtml };
  window.changePasswordFromAccount = changePasswordFromAccount;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
