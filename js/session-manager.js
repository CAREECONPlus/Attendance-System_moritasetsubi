/**
 * 勤怠管理システム - 端末セッション管理
 *
 * ログイン中の端末を Firestore（tenants/{tenantId}/sessions/{sessionId}）に記録し、
 * 「この端末 / 他の端末 / すべての端末」からのログアウトを可能にする。
 *
 * 仕組み:
 * - ログイン後、端末ごとに一意の sessionId を localStorage に持ち、同じ ID で Firestore に台帳を作る
 * - 各端末は自分の台帳を onSnapshot で監視し、台帳が消されたら自動的にサインアウトする
 * - 「他の端末からログアウト」= その端末の台帳を削除するだけ（Cloud Functions 不要）
 *
 * 注意:
 * - Firebase Auth の ID トークン自体は失効しない（最長1時間有効）。
 *   アプリ側で台帳の存在を必須にすることでログアウトを実現している。
 * - 既存の Firestore ルール（テナント配下のサブコレクションは同一テナントのユーザーが読み書き可）で動作する。
 */
(function () {
    'use strict';

    const SESSION_ID_KEY = 'attendance_session_id';
    const LOGOUT_REASON_KEY = 'attendance_logout_reason';
    const ACTIVE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // lastActiveAt の更新間隔
    const ENSURE_POLL_MS = 500;
    const ENSURE_MAX_ATTEMPTS = 120; // 最大60秒待つ（ログイン直後に currentUser が揃うまで）

    let unsubscribeWatcher = null;
    let ensureTimer = null;
    let lastActiveRefreshAt = 0;
    let isEndingSession = false;

    const log = (...args) => { if (window.logger && window.logger.log) window.logger.log(...args); };
    const warn = (...args) => { if (window.logger && window.logger.warn) window.logger.warn(...args); else console.warn(...args); };

    // ---------- localStorage ----------
    function getSessionId() {
        try { return localStorage.getItem(SESSION_ID_KEY); } catch (e) { return null; }
    }
    function setSessionId(id) {
        try { localStorage.setItem(SESSION_ID_KEY, id); } catch (e) { /* ignore */ }
    }
    function clearSessionId() {
        try { localStorage.removeItem(SESSION_ID_KEY); } catch (e) { /* ignore */ }
    }

    function generateSessionId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    // ---------- 端末の表示名 ----------
    function describeDevice() {
        const ua = navigator.userAgent || '';
        let os = '不明な端末';
        if (/iPhone/.test(ua)) os = 'iPhone';
        else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) os = 'iPad';
        else if (/Android/.test(ua)) os = 'Android';
        else if (/Windows/.test(ua)) os = 'Windows';
        else if (/Mac OS X/.test(ua)) os = 'Mac';
        else if (/CrOS/.test(ua)) os = 'Chromebook';
        else if (/Linux/.test(ua)) os = 'Linux';

        let browser = 'ブラウザ';
        if (/Line\//i.test(ua)) browser = 'LINE';
        else if (/Edg\//.test(ua)) browser = 'Edge';
        else if (/OPR\//.test(ua)) browser = 'Opera';
        else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
        else if (/Chrome\//.test(ua)) browser = 'Chrome';
        else if (/Firefox\//.test(ua)) browser = 'Firefox';
        else if (/Safari\//.test(ua)) browser = 'Safari';

        return `${os} / ${browser}`;
    }

    // ---------- Firestore ----------
    function sessionsCollection(tenantId) {
        return firebase.firestore().collection('tenants').doc(tenantId).collection('sessions');
    }

    /**
     * 認証済みかつテナントが確定している場合のみコンテキストを返す
     * （super_admin がテナント未選択の場合などは null）
     */
    function getContext() {
        if (!window.firebase || !firebase.auth) return null;
        const authUser = firebase.auth().currentUser;
        const cu = window.currentUser;
        if (!authUser || !cu || typeof cu !== 'object' || cu.uid !== authUser.uid) return null;
        const tenantId = cu.tenantId || (window.getCurrentTenantId ? window.getCurrentTenantId() : null);
        if (!tenantId) return null;
        return { uid: authUser.uid, email: authUser.email || cu.email || '', tenantId };
    }

    /**
     * この端末の台帳を作成または更新し、監視を開始する
     * @returns {Promise<boolean>} 台帳が有効なら true
     */
    async function ensureSession() {
        const ctx = getContext();
        if (!ctx) return false;

        const coll = sessionsCollection(ctx.tenantId);
        const now = firebase.firestore.FieldValue.serverTimestamp();
        let sessionId = getSessionId();

        if (sessionId) {
            try {
                const snap = await coll.doc(sessionId).get();
                if (snap.exists && snap.data().userId === ctx.uid) {
                    await coll.doc(sessionId).update({ lastActiveAt: now, deviceLabel: describeDevice() });
                    lastActiveRefreshAt = Date.now();
                    startWatching(ctx.tenantId, sessionId);
                    log('📱 端末セッション確認:', sessionId);
                    return true;
                }
                if (!snap.exists) {
                    // sessionId は台帳作成に成功したときにしか保存しないので、
                    // 台帳が無い = 他の端末からログアウトされた
                    await forceLocalSignOut('別の端末からログアウトされました。再度ログインしてください。');
                    return false;
                }
                // 別アカウントの台帳（同じ端末でアカウントを切り替えた）→ 作り直す
                sessionId = null;
            } catch (error) {
                // 通信不可などは致命的にしない（次回アクセス時に再確認）
                warn('端末セッションの確認に失敗:', error);
                return false;
            }
        }

        sessionId = generateSessionId();
        try {
            await coll.doc(sessionId).set({
                userId: ctx.uid,
                userEmail: ctx.email,
                tenantId: ctx.tenantId,
                deviceLabel: describeDevice(),
                userAgent: (navigator.userAgent || '').slice(0, 300),
                createdAt: now,
                lastActiveAt: now
            });
            setSessionId(sessionId);
            lastActiveRefreshAt = Date.now();
            startWatching(ctx.tenantId, sessionId);
            log('📱 端末セッション作成:', sessionId);
            return true;
        } catch (error) {
            warn('端末セッションの作成に失敗:', error);
            return false;
        }
    }

    function startWatching(tenantId, sessionId) {
        stopWatching();
        unsubscribeWatcher = sessionsCollection(tenantId).doc(sessionId).onSnapshot(
            (snap) => {
                if (!snap.exists && !isEndingSession) {
                    forceLocalSignOut('別の端末からログアウトされました。再度ログインしてください。');
                }
            },
            (error) => warn('端末セッションの監視エラー:', error)
        );
    }

    function stopWatching() {
        if (typeof unsubscribeWatcher === 'function') {
            try { unsubscribeWatcher(); } catch (e) { /* ignore */ }
        }
        unsubscribeWatcher = null;
    }

    /**
     * 台帳が消されたとき: この端末をサインアウトしてログイン画面へ
     */
    async function forceLocalSignOut(message) {
        stopWatching();
        clearSessionId();
        try {
            localStorage.setItem(LOGOUT_REASON_KEY, message);
            localStorage.removeItem('currentUser'); // login.js の復元対象を消して再表示を防ぐ
        } catch (e) { /* ignore */ }
        window.explicitLogout = true;
        window.currentUser = null;
        try {
            await firebase.auth().signOut();
        } catch (error) {
            warn('強制サインアウトに失敗:', error);
        }
        if (typeof window.showPage === 'function') window.showPage('login');
        showPendingLogoutReason();
    }

    function showPendingLogoutReason() {
        let message = null;
        try {
            message = localStorage.getItem(LOGOUT_REASON_KEY);
            if (message) localStorage.removeItem(LOGOUT_REASON_KEY);
        } catch (e) { /* ignore */ }
        if (!message) return;
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, 'warning');
        } else {
            alert(message);
        }
    }

    /**
     * 通常のログアウト前に呼ぶ: この端末の台帳を削除する（認証が必要なので signOut より前に）
     */
    async function endCurrentSession() {
        isEndingSession = true;
        stopWatching();
        const sessionId = getSessionId();
        const ctx = getContext();
        clearSessionId();
        if (sessionId && ctx) {
            try {
                await sessionsCollection(ctx.tenantId).doc(sessionId).delete();
                log('📱 端末セッション削除:', sessionId);
            } catch (error) {
                warn('端末セッションの削除に失敗（ログアウトは続行）:', error);
            }
        }
        isEndingSession = false;
    }

    /**
     * 自分のログイン中端末の一覧（この端末が先頭、以降は最終利用が新しい順）
     */
    async function listSessions() {
        const ctx = getContext();
        if (!ctx) return [];
        const snap = await sessionsCollection(ctx.tenantId).where('userId', '==', ctx.uid).get();
        const mySessionId = getSessionId();
        const toMillis = (ts) => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : 0;
        return snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data(), isCurrent: doc.id === mySessionId }))
            .sort((a, b) => {
                if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
                return toMillis(b.lastActiveAt) - toMillis(a.lastActiveAt);
            });
    }

    /** 指定した端末（台帳）をログアウトさせる */
    async function logoutSession(sessionId) {
        const ctx = getContext();
        if (!ctx) throw new Error('ログイン情報を取得できません');
        if (sessionId === getSessionId()) {
            await endCurrentSession();
            return;
        }
        await sessionsCollection(ctx.tenantId).doc(sessionId).delete();
    }

    /** この端末以外をすべてログアウトさせる */
    async function logoutOtherSessions() {
        const ctx = getContext();
        if (!ctx) throw new Error('ログイン情報を取得できません');
        const sessions = await listSessions();
        const others = sessions.filter((s) => !s.isCurrent);
        if (others.length === 0) return 0;
        const batch = firebase.firestore().batch();
        others.forEach((s) => batch.delete(sessionsCollection(ctx.tenantId).doc(s.id)));
        await batch.commit();
        return others.length;
    }

    /** この端末も含めてすべてログアウトさせる */
    async function logoutAllSessions() {
        const ctx = getContext();
        if (!ctx) throw new Error('ログイン情報を取得できません');
        isEndingSession = true;
        stopWatching();
        const sessions = await listSessions();
        if (sessions.length > 0) {
            const batch = firebase.firestore().batch();
            sessions.forEach((s) => batch.delete(sessionsCollection(ctx.tenantId).doc(s.id)));
            await batch.commit();
        }
        isEndingSession = false;
        await forceLocalSignOut('すべての端末からログアウトしました。');
    }

    /** 画面を再表示したときに lastActiveAt を更新（間隔を空けて） */
    async function touchSession() {
        const ctx = getContext();
        const sessionId = getSessionId();
        if (!ctx || !sessionId) return;
        if (Date.now() - lastActiveRefreshAt < ACTIVE_REFRESH_INTERVAL_MS) return;
        lastActiveRefreshAt = Date.now();
        try {
            await sessionsCollection(ctx.tenantId).doc(sessionId).update({
                lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            // 台帳が消えていた場合は監視側で処理されるので無視
        }
    }

    /**
     * ログイン直後は window.currentUser / tenantId が揃うまで少し待つ
     */
    function scheduleEnsure() {
        if (ensureTimer) clearInterval(ensureTimer);
        let attempts = 0;
        ensureTimer = setInterval(async () => {
            attempts++;
            if (getContext()) {
                clearInterval(ensureTimer);
                ensureTimer = null;
                await ensureSession();
            } else if (attempts >= ENSURE_MAX_ATTEMPTS) {
                clearInterval(ensureTimer);
                ensureTimer = null;
                log('📱 端末セッション: テナント未確定のため登録をスキップ');
            }
        }, ENSURE_POLL_MS);
    }

    // ============================================================
    // アカウント設定モーダル（ログイン中の端末）
    // ============================================================

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function toDate(ts) {
        if (!ts) return null;
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (ts instanceof Date) return ts;
        return null;
    }

    function formatRelative(ts) {
        const date = toDate(ts);
        if (!date) return '-';
        const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
        if (diffMin < 1) return 'たった今';
        if (diffMin < 60) return `${diffMin}分前`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour}時間前`;
        const diffDay = Math.floor(diffHour / 24);
        if (diffDay < 30) return `${diffDay}日前`;
        return date.toLocaleDateString('ja-JP');
    }

    function formatDateTime(ts) {
        const date = toDate(ts);
        if (!date) return '-';
        return date.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function openAccountModal() {
        const modal = document.getElementById('account-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        refreshSessionList();
    }

    function closeAccountModal() {
        const modal = document.getElementById('account-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function refreshSessionList() {
        const list = document.getElementById('session-list');
        if (!list) return;
        list.innerHTML = '<li class="session-item session-loading">読み込み中...</li>';

        if (!getContext()) {
            list.innerHTML = '<li class="session-item session-loading">この画面では端末情報を利用できません</li>';
            return;
        }

        try {
            // 自分の台帳が無い（旧バージョンでログインしたまま等）場合はここで作る
            if (!getSessionId()) await ensureSession();

            const sessions = await listSessions();
            if (sessions.length === 0) {
                list.innerHTML = '<li class="session-item session-loading">ログイン中の端末はありません</li>';
                return;
            }
            list.innerHTML = sessions.map((s) => `
                <li class="session-item${s.isCurrent ? ' current' : ''}" data-session-id="${escapeHtml(s.id)}">
                    <div class="session-info">
                        <div class="session-device">
                            📱 ${escapeHtml(s.deviceLabel || '不明な端末')}
                            ${s.isCurrent ? '<span class="session-current-badge">この端末</span>' : ''}
                        </div>
                        <div class="session-meta">
                            最終利用: ${escapeHtml(formatRelative(s.lastActiveAt))} ／ ログイン: ${escapeHtml(formatDateTime(s.createdAt))}
                        </div>
                    </div>
                    ${s.isCurrent ? '' : `<button class="btn btn-secondary btn-small" onclick="logoutDevice('${escapeHtml(s.id)}')">ログアウト</button>`}
                </li>
            `).join('');
        } catch (error) {
            console.error('端末一覧の取得に失敗:', error);
            list.innerHTML = '<li class="session-item session-loading">端末一覧の取得に失敗しました</li>';
        }
    }

    async function logoutDevice(sessionId) {
        if (!confirm('この端末をログアウトさせますか？')) return;
        try {
            await logoutSession(sessionId);
            if (typeof window.showNotification === 'function') window.showNotification('端末をログアウトさせました', 'success');
            refreshSessionList();
        } catch (error) {
            console.error('端末のログアウトに失敗:', error);
            alert('端末のログアウトに失敗しました: ' + error.message);
        }
    }

    async function logoutOtherDevices() {
        if (!confirm('この端末以外のすべての端末をログアウトさせますか？')) return;
        try {
            const count = await logoutOtherSessions();
            if (typeof window.showNotification === 'function') {
                window.showNotification(count > 0 ? `${count}台の端末をログアウトさせました` : '他にログイン中の端末はありません', 'success');
            }
            refreshSessionList();
        } catch (error) {
            console.error('他端末のログアウトに失敗:', error);
            alert('他端末のログアウトに失敗しました: ' + error.message);
        }
    }

    async function logoutAllDevices() {
        if (!confirm('この端末も含めて、すべての端末からログアウトします。よろしいですか？')) return;
        try {
            closeAccountModal();
            await logoutAllSessions();
        } catch (error) {
            console.error('全端末のログアウトに失敗:', error);
            alert('全端末のログアウトに失敗しました: ' + error.message);
        }
    }

    // ============================================================
    // 初期化
    // ============================================================
    function init() {
        if (!window.firebase || !firebase.auth) return;
        try {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    scheduleEnsure();
                } else {
                    stopWatching();
                    if (ensureTimer) { clearInterval(ensureTimer); ensureTimer = null; }
                }
            });
        } catch (error) {
            warn('端末セッション管理の初期化に失敗:', error);
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') touchSession();
        });

        // 前回「別の端末からログアウト」された場合のメッセージ
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showPendingLogoutReason);
        } else {
            showPendingLogoutReason();
        }
    }

    window.sessionManager = {
        ensureSession,
        endCurrentSession,
        listSessions,
        logoutSession,
        logoutOtherSessions,
        logoutAllSessions,
        getSessionId,
        describeDevice
    };
    window.openAccountModal = openAccountModal;
    window.closeAccountModal = closeAccountModal;
    window.refreshSessionList = refreshSessionList;
    window.logoutDevice = logoutDevice;
    window.logoutOtherDevices = logoutOtherDevices;
    window.logoutAllDevices = logoutAllDevices;

    init();
})();
