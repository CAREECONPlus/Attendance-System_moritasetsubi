/**
 * ui-tenant.js — テナント管理（スーパー管理者）の UI 刷新
 *
 * tenant.js の renderTenantList を表形式に置き換え、テナントの作成・設定編集のシートを足す。
 * データの読み込み（showSuperAdminDashboard）とテナントへのアクセス（accessTenant）は tenant.js のまま。
 */
(function () {
  'use strict';

  const state = { tenants: [], users: {} };
  const esc = (t) => (window.UI ? UI.escapeHtml(t) : String(t == null ? '' : t));
  const db = () => firebase.firestore();

  function fmtDate(ts) {
    try { const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null); return d && !isNaN(d) ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` : '—'; } catch (e) { return '—'; }
  }

  async function countUsers(tenantId) {
    try { const snap = await db().collection('tenants').doc(tenantId).collection('users').get(); return snap.size; } catch (e) { return null; }
  }

  function renderTable() {
    const container = document.getElementById('tenant-list-container');
    if (!container) return;
    const tenants = state.tenants;
    const active = tenants.filter((t) => t.status !== 'inactive').length;
    const totalUsers = Object.values(state.users).reduce((a, b) => a + (b || 0), 0);
    const summary = document.getElementById('tenant-summary');
    if (summary) summary.textContent = `契約中 ${active}社　利用者 ${totalUsers}名　新しい会社の追加は BRANU が依頼を受けてここから作成します`;
    if (!tenants.length) {
      container.innerHTML = '<div class="ui-empty"><strong>登録されているテナントがありません</strong><span>右上の「テナントを作成」から追加できます</span></div>';
      return;
    }
    container.innerHTML = `
      <div class="attendance-table-container ui-tenant-table">
        <table>
          <thead><tr>
            <th scope="col">会社名</th><th scope="col">テナントID</th><th scope="col">管理者</th>
            <th scope="col" class="num">利用者</th><th scope="col">状態</th><th scope="col">作成日</th><th scope="col"><span class="ui-sr">操作</span></th>
          </tr></thead>
          <tbody>
            ${tenants.map((t) => {
              const inactive = t.status === 'inactive';
              const users = state.users[t.id];
              return `<tr class="${inactive ? 'is-inactive' : ''}">
                <td class="ui-tenant-name">${esc(t.companyName || t.id)}</td>
                <td><span class="ui-mono">${esc(t.id)}</span></td>
                <td>${esc(t.adminName || '')}<br><span class="ui-hint">${esc(t.adminEmail || '')}</span></td>
                <td class="num">${users == null ? '—' : users + '名'}</td>
                <td><span class="ui-status ${inactive ? 'is-off' : 'is-on'}"><span class="ui-dot"></span>${inactive ? '停止中' : '契約中'}</span></td>
                <td class="ui-hint">${fmtDate(t.createdAt)}</td>
                <td class="ui-tenant-actions">
                  <button type="button" class="ui-btn ui-btn-sm" onclick="openTenantEditSheet('${esc(t.id)}')">設定</button>
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" onclick="accessTenant('${esc(t.id)}')">開く</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function renderTenantList(tenants) {
    state.tenants = (tenants || []).slice();
    state.users = {};
    renderTable();
    await Promise.all(state.tenants.map(async (t) => { state.users[t.id] = await countUsers(t.id); }));
    renderTable();
  }

  async function reload() {
    try {
      const snap = await db().collection('tenants').orderBy('createdAt', 'desc').get();
      const tenants = []; snap.forEach((d) => tenants.push({ id: d.id, ...d.data() }));
      await renderTenantList(tenants);
    } catch (e) { console.error('テナント一覧の再読み込みに失敗:', e); }
  }

  // ---------- 作成 ----------
  function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; } }
  function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); m.style.display = 'none'; } }

  function slugify(name) {
    return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  }

  function openTenantCreateSheet() {
    const f = document.getElementById('tenant-create-form'); if (f) f.reset();
    openModal('tenant-create-modal');
    setTimeout(() => { const i = document.getElementById('tenant-create-company'); if (i) i.focus(); }, 50);
  }
  function closeTenantCreateSheet() { closeModal('tenant-create-modal'); }

  async function createTenantFromSheet(e) {
    e.preventDefault();
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const companyName = v('tenant-create-company').trim();
    const tenantId = v('tenant-create-id').trim();
    const adminName = v('tenant-create-admin-name').trim();
    const adminEmail = v('tenant-create-admin-email').trim().toLowerCase();
    const password = v('tenant-create-admin-password');
    const phone = v('tenant-create-phone').trim();
    const department = v('tenant-create-department').trim();
    if (!companyName || !tenantId || !adminName || !adminEmail || password.length < 6) { UI.toast('必須項目を入力してください（パスワードは6文字以上）', 'error'); return; }
    if (!/^[a-z0-9-]+$/.test(tenantId)) { UI.toast('テナントIDは英小文字・数字・ハイフンのみ使えます', 'error'); return; }

    const existing = await db().collection('tenants').doc(tenantId).get();
    if (existing.exists) { UI.toast('このテナントIDはすでに使われています', 'error'); return; }

    const me = firebase.auth().currentUser;
    if (!me || !me.email) { UI.toast('ログインし直してからお試しください', 'error'); return; }
    const myPassword = await UI.prompt({ title: '本人確認', message: '管理者アカウントを作成すると一度サインインが切り替わるため、あなたのパスワードで元に戻します。', label: 'あなたのパスワード', type: 'password', required: true, confirmText: '作成する', autocomplete: 'current-password' });
    if (myPassword == null) return;

    const submit = document.querySelector('#tenant-create-form button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = '作成中...'; }
    const myEmail = me.email;
    let newUid = null;
    try {
      try {
        const cred = await firebase.auth().createUserWithEmailAndPassword(adminEmail, password);
        newUid = cred.user.uid;
        await cred.user.updateProfile({ displayName: adminName });
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') newUid = 'pending-uid';
        else throw authErr;
      } finally {
        await firebase.auth().signInWithEmailAndPassword(myEmail, myPassword);
      }
      const now = firebase.firestore.FieldValue.serverTimestamp();
      await db().collection('tenants').doc(tenantId).set({ id: tenantId, tenantId, companyName, adminEmail, adminName, phone, department, status: 'active', createdAt: now, updatedAt: now, createdBy: myEmail });
      const userData = { uid: newUid, email: adminEmail, displayName: adminName, role: 'admin', tenantId, company: companyName, department, phone, createdAt: now, approvedAt: now, approvedBy: myEmail };
      await db().collection('global_users').doc(adminEmail).set(userData);
      if (newUid && newUid !== 'pending-uid') {
        await db().collection('tenants').doc(tenantId).collection('users').doc(newUid).set(userData);
        await db().collection('users').doc(newUid).set(userData);
      }
      closeTenantCreateSheet();
      await reload();
      const loginUrl = `${window.location.origin}${window.location.pathname}?tenant=${tenantId}`;
      UI.toast(`「${companyName}」を作成しました。ログインURL: ${loginUrl}`, 'success', { duration: 12000 });
      if (newUid === 'pending-uid') UI.toast('このメールアドレスは既に登録があるため、既存のアカウントに管理者権限を付けました', 'warning', { duration: 8000 });
    } catch (err) {
      console.error('テナント作成エラー:', err);
      UI.toast('テナントを作成できませんでした: ' + (err && err.message ? err.message : ''), 'error');
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = '作成する'; }
    }
  }

  // ---------- 設定編集 ----------
  function openTenantEditSheet(tenantId) {
    const t = state.tenants.find((x) => x.id === tenantId);
    if (!t) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('tenant-edit-id', t.id); set('tenant-edit-id-display', t.id); set('tenant-edit-company', t.companyName);
    set('tenant-edit-admin-name', t.adminName); set('tenant-edit-admin-email', t.adminEmail);
    set('tenant-edit-phone', t.phone); set('tenant-edit-department', t.department);
    set('tenant-edit-status', t.status === 'inactive' ? 'inactive' : 'active');
    openModal('tenant-edit-modal');
  }
  function closeTenantEditSheet() { closeModal('tenant-edit-modal'); }

  async function saveTenantEdit(e) {
    e.preventDefault();
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const id = v('tenant-edit-id');
    const companyName = v('tenant-edit-company').trim();
    if (!id || !companyName) { UI.toast('会社名を入力してください', 'error'); return; }
    const status = v('tenant-edit-status') === 'inactive' ? 'inactive' : 'active';
    const t = state.tenants.find((x) => x.id === id) || {};
    if (status === 'inactive' && t.status !== 'inactive') {
      const ok = await UI.confirm({ title: 'テナントを停止', message: `「${companyName}」を停止中にします。利用者はログインできなくなります。`, confirmText: '停止する', danger: true });
      if (!ok) return;
    }
    try {
      await db().collection('tenants').doc(id).update({ companyName, adminName: v('tenant-edit-admin-name').trim(), phone: v('tenant-edit-phone').trim(), department: v('tenant-edit-department').trim(), status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      closeTenantEditSheet();
      await reload();
      UI.toast('テナントの設定を保存しました', 'success');
    } catch (err) {
      console.error('テナント更新エラー:', err);
      UI.toast('設定を保存できませんでした', 'error');
    }
  }

  function init() {
    const cf = document.getElementById('tenant-create-form');
    if (cf && !cf.dataset.uiBound) { cf.dataset.uiBound = '1'; cf.addEventListener('submit', createTenantFromSheet); }
    const ef = document.getElementById('tenant-edit-form');
    if (ef && !ef.dataset.uiBound) { ef.dataset.uiBound = '1'; ef.addEventListener('submit', saveTenantEdit); }
    const company = document.getElementById('tenant-create-company');
    const idInput = document.getElementById('tenant-create-id');
    if (company && idInput && !company.dataset.uiBound) {
      company.dataset.uiBound = '1';
      company.addEventListener('input', () => { if (!idInput.dataset.touched) idInput.value = slugify(company.value); });
      idInput.addEventListener('input', () => { idInput.dataset.touched = '1'; });
    }
  }

  window.renderTenantList = renderTenantList;
  window.editTenant = openTenantEditSheet;
  window.openTenantCreateSheet = openTenantCreateSheet;
  window.closeTenantCreateSheet = closeTenantCreateSheet;
  window.openTenantEditSheet = openTenantEditSheet;
  window.closeTenantEditSheet = closeTenantEditSheet;
  window.reloadTenantList = reload;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
