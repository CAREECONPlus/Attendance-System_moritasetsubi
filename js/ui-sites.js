/**
 * ui-sites.js — 従業員の「現場」タブ（UI刷新）
 *
 * employee.js の現場データ関数（getTenantSites / getEmployeeFavoriteSites / toggleEmployeeFavorite /
 * updateEmployeeTenantSites / loadSiteOptions）はそのまま使い、一覧の描画だけを置き換える。
 * - よく使う現場 ／ すべての現場 ／ 終わった現場 の3段
 * - 左スワイプで「終わった現場」へ、タップで現場の情報シート
 */
(function () {
  'use strict';

  const state = { sites: [], stats: {}, favorites: [], detailId: null, query: '' };

  const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 17.5 6.3 20.6l1.2-6.4L2.8 9.7l6.4-.8z"/></svg>';
  const BOX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h18v3H3zM5 10v10h14V10M10 14h4"/></svg>';

  const esc = (t) => (window.UI ? UI.escapeHtml(t) : String(t == null ? '' : t));
  const tenantId = () => (window.getCurrentTenantId ? window.getCurrentTenantId() : null);
  const uid = () => (window.currentUser && window.currentUser.uid) || (firebase.auth().currentUser || {}).uid || null;

  // ---------- データ ----------
  async function loadStats(tid) {
    const stats = {};
    const userId = uid();
    if (!tid || !userId) return stats;
    try {
      const snap = await firebase.firestore().collection('tenants').doc(tid).collection('attendance').where('userId', '==', userId).get();
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      snap.forEach((doc) => {
        const d = doc.data();
        if (!d.siteName || !d.date) return;
        const s = stats[d.siteName] || (stats[d.siteName] = { count: 0, month: 0, last: null });
        s.count += 1;
        if (String(d.date).startsWith(ym)) s.month += 1;
        if (!s.last || d.date > s.last) s.last = d.date;
      });
    } catch (e) { console.error('現場の利用状況の取得に失敗:', e); }
    return stats;
  }

  async function refresh() {
    const host = document.getElementById('employee-site-cards-grid');
    if (!host) return;
    const tid = tenantId();
    if (!tid) return;
    try {
      const [sites, stats, favorites] = await Promise.all([
        window.getTenantSites(tid),
        loadStats(tid),
        (typeof getEmployeeFavoriteSites === 'function' ? getEmployeeFavoriteSites(tid) : Promise.resolve([]))
      ]);
      state.sites = sites || [];
      state.stats = stats;
      state.favorites = favorites || [];
      render();
      if (state.detailId) fillDetail();
    } catch (e) {
      console.error('現場一覧の読み込みに失敗:', e);
      host.innerHTML = '<div class="ui-empty"><strong>現場一覧を読み込めませんでした</strong><span>通信状況を確認して、もう一度開いてください</span></div>';
    }
  }

  // ---------- 描画 ----------
  function fmtMD(dateStr) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}` : dateStr;
  }
  function fmtYM(dateLike) {
    try {
      const d = dateLike && dateLike.toDate ? dateLike.toDate() : new Date(dateLike);
      if (isNaN(d)) return '';
      return `${d.getFullYear()}/${d.getMonth() + 1}`;
    } catch (e) { return ''; }
  }
  function subText(site) {
    const s = state.stats[site.name];
    const parts = [];
    if (site.address) parts.push(site.address);
    if (s && s.month > 0) parts.push(`今月 ${s.month} 回`);
    else if (s && s.last) parts.push(`最後の利用 ${fmtMD(s.last)}`);
    return parts.join('　');
  }

  function row(site, opts) {
    const fav = state.favorites.includes(site.id);
    const done = !site.active;
    return `
      <li class="ui-siterow${done ? ' is-done' : ''}" data-site-id="${esc(site.id)}">
        ${done ? '' : `<div class="ui-siterow-under" aria-hidden="true">${BOX}<span>終わった現場に移す</span></div>`}
        <div class="ui-siterow-front">
          <button type="button" class="ui-siterow-main" onclick="openSiteDetail('${esc(site.id)}')">
            <span class="ui-siterow-name">${esc(site.name)}</span>
            <span class="ui-siterow-sub">${esc(done ? [site.address, site.updatedAt ? `${fmtYM(site.updatedAt)} に終了` : ''].filter(Boolean).join('　') : subText(site))}</span>
          </button>
          ${done
            ? `<button type="button" class="ui-btn ui-btn-sm ui-siterow-restore" onclick="setSiteActive('${esc(site.id)}', true)">また使う</button>`
            : `<button type="button" class="ui-star${fav ? ' is-on' : ''}" aria-pressed="${fav}" aria-label="${fav ? 'よく使う現場から外す' : 'よく使う現場に入れる'}" onclick="toggleEmployeeFavorite('${esc(site.id)}')">${STAR}</button>`}
        </div>
      </li>`;
  }

  function section(title, items, opts) {
    const o = opts || {};
    if (!items.length && !o.always) return '';
    const list = items.length
      ? `<ul class="ui-sitelist${o.done ? ' is-done' : ''}">${items.map(row).join('')}</ul>`
      : `<div class="ui-empty"><strong>${esc(o.emptyTitle || 'まだありません')}</strong>${o.emptyHint ? `<span>${esc(o.emptyHint)}</span>` : ''}</div>`;
    return `
      <section class="ui-sites-section">
        <div class="ui-sites-section-head"><h3>${esc(title)}</h3>${o.count != null ? `<span>${o.count}件</span>` : ''}</div>
        ${list}
        ${o.note ? `<p class="ui-hint">${esc(o.note)}</p>` : ''}
      </section>`;
  }

  function render() {
    const host = document.getElementById('employee-site-cards-grid');
    if (!host) return;
    const q = state.query.trim().toLowerCase();
    const match = (s) => !q || String(s.name || '').toLowerCase().includes(q) || String(s.address || '').toLowerCase().includes(q);
    const sites = state.sites.filter(match);
    const byUse = (a, b) => ((state.stats[b.name] || {}).count || 0) - ((state.stats[a.name] || {}).count || 0);
    const favs = sites.filter((s) => s.active && state.favorites.includes(s.id)).sort(byUse);
    const others = sites.filter((s) => s.active && !state.favorites.includes(s.id)).sort(byUse);
    const done = sites.filter((s) => !s.active);

    if (!sites.length) {
      host.innerHTML = `<div class="ui-empty"><strong>${q ? '該当する現場がありません' : 'まだ現場がありません'}</strong><span>${q ? '別の言葉で探してみてください' : '右上の「現場を追加」から登録できます'}</span></div>`;
      return;
    }
    host.innerHTML =
      section('よく使う現場', favs, { always: !q, emptyTitle: 'よく使う現場はまだありません', emptyHint: '星を付けた現場がここに出て、打刻画面の先頭にも並びます' }) +
      section('すべての現場', others, { always: true, emptyTitle: q ? '該当する現場がありません' : 'ほかの現場はありません', note: '左にスワイプすると「終わった現場」に移せます。タップすると現場の情報を見られます。' }) +
      section('終わった現場', done, { done: true, count: done.length, note: '終わった現場は打刻の候補に出ませんが、これまでの記録はそのまま残ります。' });
    bindSwipe(host);
  }

  // ---------- スワイプ ----------
  const SWIPE_W = 132;
  function bindSwipe(host) {
    host.querySelectorAll('.ui-siterow:not(.is-done) .ui-siterow-front').forEach((front) => {
      let x0 = null, y0 = null, dx = 0, dragging = false;
      const li = front.parentElement;
      const reset = () => { front.style.transition = 'transform 160ms ease-out'; front.style.transform = ''; li.classList.remove('is-swiping'); };
      front.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; dragging = false; front.style.transition = 'none'; }, { passive: true });
      front.addEventListener('touchmove', (e) => {
        if (x0 == null) return;
        const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
        if (!dragging && Math.abs(my) > Math.abs(mx)) { x0 = null; return; }
        if (mx < -6) dragging = true;
        if (!dragging) return;
        dx = Math.max(-SWIPE_W, Math.min(0, mx));
        front.style.transform = `translateX(${dx}px)`;
        li.classList.add('is-swiping');
      }, { passive: true });
      const end = async () => {
        if (x0 == null && !dragging) return;
        x0 = null;
        if (dragging && dx <= -SWIPE_W * 0.6) {
          front.style.transition = 'transform 160ms ease-out';
          front.style.transform = `translateX(${-SWIPE_W}px)`;
          const site = state.sites.find((s) => s.id === li.dataset.siteId);
          const ok = site && await UI.confirm({ title: '終わった現場に移す', message: `「${site.name}」を打刻の候補から外します。\nこれまでの記録はそのまま残り、「また使う」で戻せます。`, confirmText: '移す' });
          if (ok) await setSiteActive(site.id, false); else reset();
        } else { reset(); }
        dragging = false;
      };
      front.addEventListener('touchend', end);
      front.addEventListener('touchcancel', end);
      // タップで開いた状態からはボタンの操作へ（スワイプ中のクリックを無効化）
      front.addEventListener('click', (e) => { if (dragging) { e.stopPropagation(); e.preventDefault(); } }, true);
    });
  }

  // ---------- 現場の状態 ----------
  async function setSiteActive(siteId, active) {
    const tid = tenantId();
    const site = state.sites.find((s) => s.id === siteId);
    if (!tid || !site) return;
    try {
      const updated = state.sites.map((s) => s.id === siteId
        ? { ...s, active: active, updatedAt: new Date(), updatedBy: (window.currentUser || {}).email || 'unknown', updatedByRole: 'employee' }
        : s);
      await updateEmployeeTenantSites(tid, updated);
      await refresh();
      if (typeof loadSiteOptions === 'function') await loadSiteOptions();
      UI.toast(active ? `「${site.name}」をまた使えるようにしました` : `「${site.name}」を終わった現場に移しました`, 'success');
    } catch (e) {
      console.error('現場の状態変更に失敗:', e);
      UI.toast('現場の状態を変えられませんでした', 'error');
    }
  }

  async function deleteSite(siteId) {
    const tid = tenantId();
    const site = state.sites.find((s) => s.id === siteId);
    if (!tid || !site) return;
    const st = state.stats[site.name] || { count: 0 };
    if (st.count > 0) {
      UI.toast(`「${site.name}」には記録が ${st.count} 件あるため削除できません。「終わった現場に移す」をお使いください`, 'warning', { duration: 6000 });
      return;
    }
    const ok = await UI.confirm({ title: '現場を削除', message: `「${site.name}」を削除します。元に戻せません。`, confirmText: '削除する', danger: true });
    if (!ok) return;
    try {
      await updateEmployeeTenantSites(tid, state.sites.filter((s) => s.id !== siteId));
      closeSiteDetail();
      await refresh();
      if (typeof loadSiteOptions === 'function') await loadSiteOptions();
      UI.toast(`「${site.name}」を削除しました`, 'success');
    } catch (e) {
      console.error('現場の削除に失敗:', e);
      UI.toast('現場を削除できませんでした', 'error');
    }
  }

  async function saveMemo(siteId, memo) {
    const tid = tenantId();
    const site = state.sites.find((s) => s.id === siteId);
    if (!tid || !site || (site.description || '') === memo) return;
    try {
      const updated = state.sites.map((s) => s.id === siteId ? { ...s, description: memo, updatedAt: new Date(), updatedBy: (window.currentUser || {}).email || 'unknown', updatedByRole: 'employee' } : s);
      await updateEmployeeTenantSites(tid, updated);
      site.description = memo;
      UI.toast('メモを保存しました', 'success', { duration: 2000 });
    } catch (e) {
      console.error('メモの保存に失敗:', e);
      UI.toast('メモを保存できませんでした', 'error');
    }
  }

  // ---------- 現場の情報シート ----------
  function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; } }
  function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); m.style.display = 'none'; } }

  function fillDetail() {
    const site = state.sites.find((s) => s.id === state.detailId);
    if (!site) return;
    const st = state.stats[site.name] || { count: 0, month: 0, last: null };
    const fav = state.favorites.includes(site.id);
    document.getElementById('site-detail-name').textContent = site.name;
    document.getElementById('site-detail-address').textContent = site.address || '';
    document.getElementById('site-detail-month').textContent = st.month;
    document.getElementById('site-detail-total').textContent = st.count;
    document.getElementById('site-detail-last').textContent = st.last ? fmtMD(st.last) : '—';
    const memo = document.getElementById('site-detail-memo');
    memo.value = site.description || '';
    const favBtn = document.getElementById('site-detail-fav');
    favBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
    favBtn.classList.toggle('is-on', fav);
    favBtn.querySelector('span').textContent = fav ? 'よく使う現場から外す' : 'よく使う現場に入れる';
    document.getElementById('site-detail-punch').classList.toggle('ui-hidden', !site.active);
    favBtn.classList.toggle('ui-hidden', !site.active);
    document.getElementById('site-detail-archive-label').textContent = site.active ? '終わった現場に移す' : 'また使う';
    document.getElementById('site-detail-archive-hint').textContent = site.active ? '打刻の候補から外れます。記録は残り、「また使う」で戻せます' : '打刻の候補に戻します';
    document.getElementById('site-detail-delete-hint').textContent = st.count > 0 ? `記録が ${st.count} 件あるため削除できません。「終わった現場」への移動をお使いください` : '記録がない現場だけ削除できます';
  }

  function openSiteDetail(siteId) {
    state.detailId = siteId;
    fillDetail();
    openModal('site-detail-modal');
  }
  function closeSiteDetail() {
    const memo = document.getElementById('site-detail-memo');
    if (memo && state.detailId) saveMemo(state.detailId, memo.value.trim());
    state.detailId = null;
    closeModal('site-detail-modal');
  }
  async function toggleFavoriteFromDetail() { if (state.detailId && typeof toggleEmployeeFavorite === 'function') await toggleEmployeeFavorite(state.detailId); }
  async function toggleActiveFromDetail() {
    const site = state.sites.find((s) => s.id === state.detailId);
    if (!site) return;
    if (site.active) {
      const ok = await UI.confirm({ title: '終わった現場に移す', message: `「${site.name}」を打刻の候補から外します。\nこれまでの記録はそのまま残り、「また使う」で戻せます。`, confirmText: '移す' });
      if (!ok) return;
    }
    await setSiteActive(site.id, !site.active);
  }
  function deleteFromDetail() { if (state.detailId) deleteSite(state.detailId); }
  function punchFromSiteDetail() {
    const site = state.sites.find((s) => s.id === state.detailId);
    if (!site) return;
    const select = document.getElementById('site-name');
    if (select) {
      if (!Array.from(select.options).some((o) => o.value === site.name)) {
        const o = document.createElement('option'); o.value = site.name; o.textContent = site.name; select.appendChild(o);
      }
      select.value = site.name;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    state.detailId = null;
    closeModal('site-detail-modal');
    if (typeof switchEmployeeTab === 'function') switchEmployeeTab('attendance');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.UI) { UI.syncSiteChips(); UI.updateClockCaption(); }
  }

  // ---------- 現場を追加シート ----------
  function openSiteAddSheet() {
    const form = document.getElementById('employee-add-site-form');
    if (form) form.reset();
    openModal('site-add-modal');
    setTimeout(() => { const i = document.getElementById('employee-add-site-name'); if (i) i.focus(); }, 50);
  }
  function closeSiteAddSheet() { closeModal('site-add-modal'); }

  // ---------- 初期化 ----------
  function init() {
    const search = document.getElementById('site-search');
    if (search && !search.dataset.uiBound) {
      search.dataset.uiBound = '1';
      search.addEventListener('input', () => { state.query = search.value; render(); });
    }
    const memo = document.getElementById('site-detail-memo');
    if (memo && !memo.dataset.uiBound) {
      memo.dataset.uiBound = '1';
      memo.addEventListener('change', () => { if (state.detailId) saveMemo(state.detailId, memo.value.trim()); });
    }
  }

  // employee.js の一覧描画を置き換える（employee.js 内からの呼び出しもこちらに来る）
  window.loadEmployeeSiteList = refresh;
  window.renderEmployeeSiteList = render;
  window.setSiteActive = setSiteActive;
  window.openSiteDetail = openSiteDetail;
  window.closeSiteDetail = closeSiteDetail;
  window.toggleFavoriteFromDetail = toggleFavoriteFromDetail;
  window.toggleActiveFromDetail = toggleActiveFromDetail;
  window.deleteFromDetail = deleteFromDetail;
  window.punchFromSiteDetail = punchFromSiteDetail;
  window.openSiteAddSheet = openSiteAddSheet;
  window.closeSiteAddSheet = closeSiteAddSheet;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
