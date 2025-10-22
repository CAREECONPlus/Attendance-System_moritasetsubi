// employee.js - 従業員ページの機能（完全版 - 日付修正版）


// 現在のユーザー情報とグローバル変数
let currentUser = null;
let dailyLimitProcessing = false;

// テナント対応のFirestoreコレクション取得関数（main.jsの統一関数を使用）
function getAttendanceCollection() {
    return window.getTenantFirestore ? window.getTenantFirestore('attendance') : firebase.firestore().collection('attendance');
}

function getBreaksCollection() {
    return window.getTenantFirestore ? window.getTenantFirestore('breaks') : firebase.firestore().collection('breaks');
}

// 変数監視用のプロキシ設定
let _todayAttendanceData = null;
let _currentAttendanceId = null;

// todayAttendanceDataの監視
Object.defineProperty(window, 'todayAttendanceData', {
    get: function() {
        return _todayAttendanceData;
    },
    set: function(value) {
        _todayAttendanceData = value;
    }
});

// currentAttendanceIdの監視
Object.defineProperty(window, 'currentAttendanceId', {
    get: function() {
        return _currentAttendanceId;
    },
    set: function(value) {
        _currentAttendanceId = value;
    }
});

// 🆕 日本時間で確実に今日の日付を取得する関数
function getTodayJST() {
    const now = new Date();
    
    // 日本時間で確実に計算（UTC + 9時間）
    const jstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 3600000));
    const today = jstDate.toISOString().split('T')[0];
    
    
    return today;
}

// 🔧 日付と現場設定の復元機能
function restoreDateAndSiteSettings() {
    
    try {
        // LocalStorageから最後に選択した現場名を復元
        const savedSiteName = localStorage.getItem('lastSelectedSite');
        if (savedSiteName) {
            const siteSelect = document.getElementById('site-name');
            if (siteSelect) {
                // 保存された現場名がオプションに存在するかチェック
                const option = Array.from(siteSelect.options).find(opt => opt.value === savedSiteName);
                if (option) {
                    siteSelect.value = savedSiteName;
                } else {
                }
            }
        }
        
        // LocalStorageから最後に入力したメモを復元
        const savedNotes = localStorage.getItem('lastWorkNotes');
        if (savedNotes) {
            const notesTextarea = document.getElementById('work-notes');
            if (notesTextarea) {
                notesTextarea.value = savedNotes;
            }
        }
        
        
    } catch (error) {
    }
}

// 🔧 設定を保存する関数
function saveDateAndSiteSettings() {
    try {
        // 現在選択されている現場名を保存
        const siteSelect = document.getElementById('site-name');
        if (siteSelect && siteSelect.value && siteSelect.value !== '') {
            localStorage.setItem('lastSelectedSite', siteSelect.value);
        }
        
        // 現在のメモを保存
        const notesTextarea = document.getElementById('work-notes');
        if (notesTextarea && notesTextarea.value.trim()) {
            localStorage.setItem('lastWorkNotes', notesTextarea.value);
        }
        
    } catch (error) {
    }
}

// 🔧 現場選択変更の処理
function handleSiteSelection() {
    
    try {
        const siteSelect = document.getElementById('site-name');
        const manualInput = document.getElementById('site-name-manual');
        
        if (!siteSelect || !manualInput) {
            return;
        }
        
        if (siteSelect.value === 'manual-input') {
            // 手動入力モードの場合
            manualInput.style.display = 'block';
            manualInput.required = true;
            manualInput.focus();
        } else {
            // 選択モードの場合
            manualInput.style.display = 'none';
            manualInput.required = false;
            manualInput.value = '';
            
            // 選択した現場名を保存
            saveDateAndSiteSettings();
        }
        
    } catch (error) {
    }
}

// 注意: initEmployeePage関数はファイル末尾で定義されています

// 🔧 修正版 restoreTodayAttendanceState関数（日付修正）
async function restoreTodayAttendanceState() {
    
    try {
        if (!currentUser) {
            return;
        }
        
        // 🎯 修正: JST確実取得
        const today = getTodayJST();
        
        
        // 今日のデータのみを検索
        const todayQuery = getAttendanceCollection()
            .where('userId', '==', currentUser.uid)
            .where('date', '==', today);
        
        const todaySnapshot = await todayQuery.get();
        
        
        if (!todaySnapshot.empty) {
            // 今日のデータが見つかった場合
            let latestRecord = null;
            let latestDoc = null;
            
            todaySnapshot.docs.forEach(doc => {
                const data = doc.data();
                
                if (!latestRecord || 
                    (data.createdAt && (!latestRecord.createdAt || data.createdAt > latestRecord.createdAt))) {
                    latestRecord = data;
                    latestDoc = doc;
                }
            });
            
            // 今日のデータを復元
            currentAttendanceId = latestDoc.id;
            todayAttendanceData = {
                id: latestDoc.id,
                ...latestRecord
            };
            
            await restoreCurrentState(latestRecord);
            
        } else {
            // 今日のデータがない場合は新規出勤待ち状態
            
            currentAttendanceId = null;
            todayAttendanceData = null;
            updateClockButtons('waiting');
            updateStatusDisplay('waiting', null);
        }
        
        // データ設定後の確認
        setTimeout(() => {
            // Debug info available if needed
        }, 100);
        
    } catch (error) {
        
        // エラー時はデフォルト状態
        currentAttendanceId = null;
        todayAttendanceData = null;
        updateClockButtons('waiting');
        updateStatusDisplay('waiting', null);
    }
}

// 現在の状態を復元
async function restoreCurrentState(recordData) {
    
    try {
        // 勤務完了チェック
        if (recordData.endTime || recordData.status === 'completed') {
            updateClockButtons('completed');
            updateStatusDisplay('completed', recordData);
            return;
        }
        
        // 休憩中かどうかチェック
        const breakQuery = getBreaksCollection()
            .where('attendanceId', '==', currentAttendanceId)
            .where('userId', '==', currentUser.uid);
        
        const breakSnapshot = await breakQuery.get();
        
        // アクティブな休憩を検索
        let activeBreakData = null;
        breakSnapshot.docs.forEach(doc => {
            const breakData = doc.data();
            if (!breakData.endTime) {
                activeBreakData = breakData;
            }
        });
        
        if (activeBreakData) {
            updateClockButtons('break');
            updateStatusDisplay('break', recordData, activeBreakData);
        } else {
            updateClockButtons('working');
            updateStatusDisplay('working', recordData);
        }
        
        // 🎯 重要：状態復元後に強制的にボタン表示を更新
        setTimeout(() => {
            const currentStatus = activeBreakData ? 'break' : 'working';
            updateClockButtons(currentStatus);
        }, 100);
        
    } catch (error) {
        updateClockButtons('working');
        updateStatusDisplay('working', recordData);
    }
}

// 🔧 複数現場対応：同一現場での未完了勤務・短時間再出勤チェック
async function checkSiteLimit(userId, siteName) {
    
    try {
        // 1. 同一現場での未完了勤務をチェック
        const activeQuery = getAttendanceCollection()
            .where('userId', '==', userId)
            .where('siteName', '==', siteName)
            .where('status', 'in', ['working', 'break']);
        
        const activeSnapshot = await activeQuery.get();
        
        if (!activeSnapshot.empty) {
            // 同一現場で未完了の勤務がある場合
            const activeRecord = activeSnapshot.docs[0].data();
            logger.log('🚨 同一現場で未完了の勤務を検出:', siteName);
            
            // グローバル変数を更新
            todayAttendanceData = {
                id: activeSnapshot.docs[0].id,
                ...activeRecord
            };
            currentAttendanceId = activeSnapshot.docs[0].id;
            
            await restoreCurrentState(activeRecord);
            return { canClockIn: false, reason: 'active_work' };
        }
        
        // 2. 同一現場での最近の完了勤務をチェック（短時間再出勤）
        const recentQuery = getAttendanceCollection()
            .where('userId', '==', userId)
            .where('siteName', '==', siteName)
            .where('status', '==', 'completed')
            .orderBy('updatedAt', 'desc')
            .limit(1);
        
        const recentSnapshot = await recentQuery.get();
        
        if (!recentSnapshot.empty) {
            const recentRecord = recentSnapshot.docs[0].data();
            const now = new Date();
            const lastEndTime = recentRecord.updatedAt?.toDate();
            
            if (lastEndTime) {
                const timeDifference = (now - lastEndTime) / (1000 * 60); // 分単位
                const timeThreshold = 60; // 1時間以内の再出勤は確認が必要
                
                if (timeDifference <= timeThreshold) {
                    logger.log('⚠️ 短時間での再出勤を検出:', siteName, `${Math.round(timeDifference)}分前に退勤`);
                    
                    return {
                        canClockIn: false,
                        reason: 'recent_clock_out',
                        lastRecord: recentRecord,
                        timeDifference: Math.round(timeDifference),
                        siteName: siteName
                    };
                }
            }
        }
        
        // 今日の勤務データを復元（現場が異なる場合は許可）
        await restoreTodayAttendanceState();
        
        return { canClockIn: true }; // 出勤許可
        
    } catch (error) {
        console.error('現場制限チェック中にエラーが発生しました:', error);
        return { canClockIn: true }; // エラー時も打刻を許可
    }
}

// 🆕 夜勤対応：勤務日判定（4時間ルール）
function getWorkingDate() {
    const now = new Date();
    const currentHour = now.getHours();
    
    // 午前4時より前は前日の勤務日とみなす
    if (currentHour < 4) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Asia/Tokyo'
        }).replace(/\//g, '-');
    }
    
    return getTodayJST();
}

// 🆕 短時間再出勤確認モーダル
function showReClockInModal(checkResult) {
    return new Promise((resolve) => {
        // モーダル用のHTMLを動的作成
        const modalHtml = `
            <div id="reclock-modal" class="reclock-modal-overlay">
                <div class="reclock-modal">
                    <div class="reclock-modal-header">
                        <h3>⚠️ 短時間での再出勤確認</h3>
                    </div>
                    <div class="reclock-modal-body">
                        <p><strong>${checkResult.siteName}</strong>で${checkResult.timeDifference}分前に退勤したばかりです。</p>
                        <p>本当に再度出勤しますか？</p>
                        <div class="last-work-info">
                            <p><small>前回の勤務:</small></p>
                            <p><small>出勤: ${checkResult.lastRecord.startTime}</small></p>
                            <p><small>退勤: ${checkResult.lastRecord.endTime}</small></p>
                        </div>
                    </div>
                    <div class="reclock-modal-footer">
                        <button id="reclock-cancel" class="btn btn-secondary">❌ キャンセル</button>
                        <button id="reclock-confirm" class="btn btn-primary">✅ 出勤する</button>
                    </div>
                </div>
            </div>
        `;
        
        // モーダルをページに追加
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modal = document.getElementById('reclock-modal');
        const cancelBtn = document.getElementById('reclock-cancel');
        const confirmBtn = document.getElementById('reclock-confirm');
        
        // モーダルを表示
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // モーダルを閉じる関数
        function closeModal(result) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 300);
        }
        
        // イベントリスナー
        cancelBtn.addEventListener('click', () => closeModal(false));
        confirmBtn.addEventListener('click', () => closeModal(true));
        
        // 背景クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(false);
            }
        });
    });
}

// 🆕 複数現場対応：勤務日ごとの現場データを取得
async function getTodayMultiSiteAttendance(userId) {
    try {
        const workingDate = getWorkingDate();
        
        // 勤務日ベースでデータを取得
        const query = getAttendanceCollection()
            .where('userId', '==', userId)
            .where('workingDate', '==', workingDate)
            .orderBy('createdAt', 'desc');
        
        const snapshot = await query.get();
        
        const sites = [];
        snapshot.docs.forEach(doc => {
            sites.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return sites;
        
    } catch (error) {
        console.error('❌ 複数現場データ取得エラー:', error);
        return [];
    }
}

// 🆕 現場ごとの勤怠データ表示
function displayMultiSiteAttendance(sites) {
    const multiSiteContainer = document.getElementById('multi-site-attendance');
    if (!multiSiteContainer) return;
    
    if (sites.length === 0) {
        multiSiteContainer.innerHTML = `
            <div class="no-sites">
                <p>📍 今日はまだ勤務していません</p>
            </div>
        `;
        return;
    }
    
    let html = '<h3>📋 今日の現場別勤務状況</h3>';
    
    sites.forEach(site => {
        const statusIcon = site.status === 'completed' ? '✅' : 
                          site.status === 'working' ? '🔄' : 
                          site.status === 'break' ? '⏸️' : '❓';
        
        const statusText = site.status === 'completed' ? '勤務完了' : 
                          site.status === 'working' ? '勤務中' : 
                          site.status === 'break' ? '休憩中' : '不明';
        
        html += `
            <div class="site-attendance-card ${site.status}">
                <div class="site-header">
                    <h4>${statusIcon} ${site.siteName}</h4>
                    <span class="site-status">${statusText}</span>
                </div>
                <div class="site-details">
                    <div class="time-info">
                        <span>⏰ 出勤: ${site.startTime}</span>
                        ${site.endTime ? `<span>⏰ 退勤: ${site.endTime}</span>` : '<span class="working-indicator">勤務中...</span>'}
                    </div>
                    ${site.notes ? `<div class="site-notes">📝 ${site.notes}</div>` : ''}
                </div>
                ${site.status !== 'completed' ? `
                    <div class="site-actions">
                        <button onclick="switchToSite('${site.id}', '${site.siteName}')" class="switch-site-btn">
                            この現場に切り替え
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    multiSiteContainer.innerHTML = html;
}

// 🆕 現場切り替え機能
async function switchToSite(attendanceId, siteName) {
    try {
        logger.log('🔄 現場切り替え開始:', siteName);
        
        // 指定された勤怠レコードを取得
        const doc = await getAttendanceCollection().doc(attendanceId).get();
        
        if (!doc.exists) {
            alert('勤怠データが見つかりません');
            return;
        }
        
        const attendanceData = doc.data();
        
        // グローバル変数を更新
        currentAttendanceId = attendanceId;
        todayAttendanceData = {
            id: attendanceId,
            ...attendanceData
        };
        
        // 状態を復元
        await restoreCurrentState(attendanceData);
        
        // 現場選択を更新
        const siteSelect = document.getElementById('site-name');
        if (siteSelect) {
            siteSelect.value = siteName;
        }
        
        alert(`${siteName}に切り替えました`);
        logger.log('✅ 現場切り替え完了:', siteName);
        
    } catch (error) {
        console.error('❌ 現場切り替えエラー:', error);
        alert('現場の切り替えに失敗しました');
    }
}

// 🆕 複数現場データの更新
async function updateMultiSiteDisplay() {
    if (!currentUser) return;
    
    try {
        const sites = await getTodayMultiSiteAttendance(currentUser.uid);
        displayMultiSiteAttendance(sites);
    } catch (error) {
        console.error('❌ 複数現場表示更新エラー:', error);
    }
}

// 状態テキスト変換
function getStatusText(status) {
    
    const statusMap = {
        'working': '勤務中',
        'break': '休憩中', 
        'completed': '勤務完了',
        'pending': '処理中',
        'unknown': '不明',
        '': '不明',
        null: '不明',
        undefined: '不明'
    };
    
    // より堅牢な日本語化処理
    if (!status) {
        return '不明';
    }
    
    const lowerStatus = String(status).toLowerCase();
    const result = statusMap[lowerStatus] || statusMap[status] || '不明';
    
    return result;
}

// ユーザー名の表示
function displayUserName() {
    const userNameElement = document.getElementById('user-name');
    if (userNameElement && currentUser) {
        userNameElement.textContent = currentUser.displayName || currentUser.email || 'ユーザー';
    }
}

// 現在時刻の更新
function updateCurrentTime() {
    const now = new Date();
    
    const dateElement = document.getElementById('current-date');
    const timeElement = document.getElementById('current-time');
    
    if (dateElement) {
        dateElement.textContent = now.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    }
    
    if (timeElement) {
        timeElement.textContent = now.toLocaleTimeString('ja-JP');
    }
}

// イベントリスナーの設定
function setupEmployeeEventListeners() {
    
    const clockInBtn = document.getElementById('clock-in-btn');
    const clockOutBtn = document.getElementById('clock-out-btn');
    const breakStartBtn = document.getElementById('break-start-btn');
    const breakEndBtn = document.getElementById('break-end-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (clockInBtn) clockInBtn.addEventListener('click', handleClockIn);
    if (clockOutBtn) clockOutBtn.addEventListener('click', handleClockOut);
    if (breakStartBtn) breakStartBtn.addEventListener('click', handleBreakStart);
    if (breakEndBtn) breakEndBtn.addEventListener('click', handleBreakEnd);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
}

// 現場選択の設定（直接入力対応）
function setupSiteSelection() {
    // 直接入力に変更したため、特別な設定は不要
}

// サイト一覧を読み込み（テナント設定から）
async function loadSiteOptions() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) {
            return;
        }
        
        const sites = await window.getTenantSites(tenantId);
        logger.log('loadSiteOptions - 取得した現場データ:', sites);
        
        const siteSelect = document.getElementById('site-name');
        logger.log('loadSiteOptions - セレクト要素:', siteSelect);
        logger.log('loadSiteOptions - 現在のオプション数:', siteSelect?.children.length);
        
        if (siteSelect && sites && sites.length > 0) {
            // 既存のオプションをクリア（最初の1つ「現場を選択してください」のみ残す）
            while (siteSelect.children.length > 1) {
                siteSelect.removeChild(siteSelect.lastChild);
            }
            
            // アクティブなサイトのみを追加（重複チェック付き）
            const activeSites = sites.filter(site => site.active);
            const addedSiteNames = new Set(); // 重複チェック用
            
            activeSites.forEach(site => {
                // 重複チェック
                if (!addedSiteNames.has(site.name)) {
                    addedSiteNames.add(site.name);
                    
                    const option = document.createElement('option');
                    option.value = site.name;
                    option.textContent = `🏢 ${site.name}`;
                    if (site.address) {
                        option.textContent += ` (${site.address})`;
                    }
                    siteSelect.appendChild(option);
                }
            });

        }

        // 履歴を表示
        displaySiteHistory();

    } catch (error) {
    }
}

/**
 * 現場を履歴に追加
 */
function addSiteToHistory(siteName) {
    try {
        const userId = currentUser?.uid || window.currentUser?.uid;
        if (!userId || !siteName) return;

        const key = `siteHistory_${userId}`;
        let history = JSON.parse(localStorage.getItem(key) || '[]');

        // 既存の履歴から同じ現場を削除
        history = history.filter(name => name !== siteName);

        // 最新の現場を先頭に追加
        history.unshift(siteName);

        // 最大5件まで保持
        if (history.length > 5) {
            history = history.slice(0, 5);
        }

        localStorage.setItem(key, JSON.stringify(history));
    } catch (error) {
        console.error('履歴保存エラー:', error);
    }
}

/**
 * 現場履歴を取得
 */
function getSiteHistory() {
    try {
        const userId = currentUser?.uid || window.currentUser?.uid;
        if (!userId) return [];

        const key = `siteHistory_${userId}`;
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (error) {
        console.error('履歴取得エラー:', error);
        return [];
    }
}

/**
 * 現場履歴を表示
 */
function displaySiteHistory() {
    const historySection = document.getElementById('site-history-section');
    const historyButtons = document.getElementById('site-history-buttons');

    if (!historySection || !historyButtons) return;

    const history = getSiteHistory();

    if (history.length === 0) {
        historySection.style.display = 'none';
        return;
    }

    historySection.style.display = 'block';

    const buttonsHTML = history.map(siteName => `
        <button type="button" class="site-history-btn" onclick="selectSiteFromHistory('${escapeHtmlEmployee(siteName)}')">
            🏢 ${escapeHtmlEmployee(siteName)}
        </button>
    `).join('');

    historyButtons.innerHTML = buttonsHTML;
}

/**
 * 履歴から現場を選択
 */
function selectSiteFromHistory(siteName) {
    const siteSelect = document.getElementById('site-name');
    if (!siteSelect) return;

    siteSelect.value = siteName;

    // 視覚的フィードバック
    siteSelect.style.background = 'var(--careecon-background-blue)';
    setTimeout(() => {
        siteSelect.style.background = '';
    }, 500);
}

// サイト選択の変更イベント（手動入力は削除済み）
function setupSiteSelection() {
    // 手動入力機能は削除されました
    // 管理者が事前に設定した現場のみ選択可能
}

// 現場名取得関数（管理者設定現場のみ）
function getSiteNameFromSelection() {
    const siteSelect = document.getElementById('site-name');
    
    if (!siteSelect) {
        alert('現場名選択フォームに問題があります。\nページを再読み込みしてください。');
        return null;
    }
    
    const siteName = siteSelect.value.trim();
    if (!siteName) {
        alert('⚠️ 現場を選択してください');
        siteSelect.focus();
        return null;
    }
    
    return siteName;
}

// 🔧 修正版 handleClockIn関数（日付修正完全版）
async function handleClockIn() {
    
    // 二重実行防止
    if (dailyLimitProcessing) {
        alert('処理中です。しばらくお待ちください。');
        return;
    }
    
    dailyLimitProcessing = true;
    
    // ボタンを即座に無効化
    const clockInBtn = document.getElementById('clock-in-btn');
    const originalText = clockInBtn ? clockInBtn.textContent : '出勤';
    
    // ボタン状態を保存・変更する関数
    function setButtonProcessing() {
        if (clockInBtn) {
            clockInBtn.disabled = true;
            clockInBtn.textContent = '処理中...';
            clockInBtn.style.opacity = '0.5';
        }
    }
    
    // ボタン状態を復元する関数
    function restoreButton() {
        if (clockInBtn) {
            clockInBtn.disabled = false;
            clockInBtn.textContent = originalText;
            clockInBtn.style.opacity = '1';
        }
        dailyLimitProcessing = false;
    }
    
    setButtonProcessing();

    try {
        if (!currentUser) {
            throw new Error('ユーザーが認証されていません');
        }

        // 現場選択チェック
        const siteName = getSiteNameFromSelection();

        if (!siteName) {
            restoreButton();
            return;
        }

        // 日付生成
        const now = new Date();
        const today = getTodayJST();

        const workNotesElement = document.getElementById('work-notes');
        const workNotes = workNotesElement ? workNotesElement.value.trim() : '';

        const attendanceData = {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            date: today,
            siteName: siteName,
            startTime: now.toLocaleTimeString('ja-JP'),
            status: 'working',
            notes: workNotes,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: now.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };

        // Firestoreに保存
        const docRef = await getAttendanceCollection()
            .add(attendanceData);

        // グローバル変数更新
        currentAttendanceId = docRef.id;
        todayAttendanceData = {
            id: docRef.id,
            ...attendanceData,
            createdAt: now,
            updatedAt: now
        };

        // UI更新
        updateClockButtons('working');
        updateStatusDisplay('working', todayAttendanceData);

        // 現場を履歴に追加
        addSiteToHistory(siteName);

        alert(`✅ 出勤しました！\n現場: ${siteName}\n時刻: ${attendanceData.startTime}\n日付: ${today}`);

        // フォームをクリア
        if (workNotesElement) workNotesElement.value = '';

        // 最近の記録を更新
        loadRecentRecordsSafely();

        // 履歴を更新
        displaySiteHistory();

        // 処理完了
        dailyLimitProcessing = false;

    } catch (error) {
        alert('出勤処理中にエラーが発生しました。\n' + error.message);

        restoreButton();
    }
}

// 退勤処理（1日1回制限対応）
async function handleClockOut() {
    
    try {
        if (!currentUser || !currentAttendanceId) {
            alert('出勤記録が見つかりません');
            return;
        }
        
        const now = new Date();
        
        const updateData = {
            endTime: now.toLocaleTimeString('ja-JP'),
            status: 'completed',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        
        await getAttendanceCollection()
            .doc(currentAttendanceId)
            .update(updateData);
        
        
        // グローバル変数更新
        todayAttendanceData = {
            ...todayAttendanceData,
            endTime: now.toLocaleTimeString('ja-JP'),
            status: 'completed'
        };
        
        // UI更新
        updateClockButtons('completed');
        updateStatusDisplay('completed', todayAttendanceData);

        alert('お疲れさまでした！');

        // 最近の記録を更新
        loadRecentRecordsSafely();
        
    } catch (error) {
        alert('退勤記録でエラーが発生しました: ' + error.message);
    }
}

// 🔧 修正版 休憩開始処理（日付修正）
async function handleBreakStart() {
    
    try {
        if (!currentUser || !currentAttendanceId) {
            alert('出勤記録が見つかりません');
            return;
        }
        
        // 既存の休憩記録チェック
        const breakQuery = getBreaksCollection()
            .where('attendanceId', '==', currentAttendanceId)
            .where('userId', '==', currentUser.uid);
        
        const breakSnapshot = await breakQuery.get();
        
        // アクティブな休憩があるかチェック
        let hasActiveBreak = false;
        breakSnapshot.docs.forEach(doc => {
            const breakData = doc.data();
            if (!breakData.endTime) {
                hasActiveBreak = true;
            }
        });
        
        if (hasActiveBreak) {
            alert('既に休憩中です');
            return;
        }
        
        const now = new Date();
        
        const breakData = {
            attendanceId: currentAttendanceId,
            userId: currentUser.uid,
            startTime: now.toLocaleTimeString('ja-JP'),
            date: getTodayJST(), // 🎯 修正: JST確実取得
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await getBreaksCollection()
            .add(breakData);
        
        // 勤怠記録のステータスを更新
        await getAttendanceCollection()
            .doc(currentAttendanceId)
            .update({ 
                status: 'break',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        // グローバル変数更新
        todayAttendanceData.status = 'break';
        
        alert('休憩を開始しました');
        updateClockButtons('break');
        updateStatusDisplay('break', todayAttendanceData, breakData);

    } catch (error) {
        alert('休憩記録でエラーが発生しました: ' + error.message);
    }
}

// 休憩終了処理
async function handleBreakEnd() {
    
    try {
        if (!currentUser || !currentAttendanceId) {
            alert('出勤記録が見つかりません');
            return;
        }
        
        const breakQuery = getBreaksCollection()
            .where('attendanceId', '==', currentAttendanceId)
            .where('userId', '==', currentUser.uid);
        
        const breakSnapshot = await breakQuery.get();
        
        // アクティブな休憩記録を探す
        let activeBreakDoc = null;
        breakSnapshot.docs.forEach(doc => {
            const breakData = doc.data();
            if (!breakData.endTime) {
                activeBreakDoc = doc;
            }
        });
        
        if (activeBreakDoc) {
            const now = new Date();
            
            await activeBreakDoc.ref.update({
                endTime: now.toLocaleTimeString('ja-JP'),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
        } else {
            alert('休憩記録が見つかりませんでした');
            return;
        }
        
        // 勤怠記録のステータスを勤務中に戻す
        await getAttendanceCollection()
            .doc(currentAttendanceId)
            .update({ 
                status: 'working',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        // グローバル変数更新
        todayAttendanceData.status = 'working';
        
        alert('休憩を終了しました');
        updateClockButtons('working');
        updateStatusDisplay('working', todayAttendanceData);

    } catch (error) {
        alert('休憩終了記録でエラーが発生しました: ' + error.message);
    }
}

// updateClockButtons関数
function updateClockButtons(status) {
    
    const clockInBtn = document.getElementById('clock-in-btn');
    const clockOutBtn = document.getElementById('clock-out-btn');
    const breakStartBtn = document.getElementById('break-start-btn');
    const breakEndBtn = document.getElementById('break-end-btn');
    
    // 全ボタンの特殊クラスをリセット
    [clockInBtn, clockOutBtn, breakStartBtn, breakEndBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('break-active', 'processing');
            btn.disabled = false;
        }
    });
    
    switch (status) {
        case 'waiting':
            // 出勤ボタンのみ有効
            if (clockInBtn) {
                clockInBtn.disabled = false;
                clockInBtn.textContent = '出勤';
            }
            if (clockOutBtn) {
                clockOutBtn.disabled = true;
                clockOutBtn.textContent = '退勤';
            }
            if (breakStartBtn) {
                breakStartBtn.disabled = true;
                breakStartBtn.textContent = '休憩開始';
            }
            if (breakEndBtn) {
                breakEndBtn.disabled = true;
                breakEndBtn.textContent = '休憩終了';
            }
            break;
            
        case 'working':
            // 出勤済み、退勤・休憩開始が有効
            if (clockInBtn) {
                clockInBtn.disabled = true;
                clockInBtn.textContent = '出勤済み';
            }
            if (clockOutBtn) {
                clockOutBtn.disabled = false;
                clockOutBtn.textContent = '退勤';
            }
            if (breakStartBtn) {
                breakStartBtn.disabled = false;
                breakStartBtn.textContent = '休憩開始';
            }
            if (breakEndBtn) {
                breakEndBtn.disabled = true;
                breakEndBtn.textContent = '休憩終了';
            }
            break;
            
        case 'break':
            // 出勤済み、退勤・休憩終了が有効
            if (clockInBtn) {
                clockInBtn.disabled = true;
                clockInBtn.textContent = '出勤済み';
            }
            if (clockOutBtn) {
                clockOutBtn.disabled = false;
                clockOutBtn.textContent = '退勤';
            }
            if (breakStartBtn) {
                breakStartBtn.disabled = true;
                breakStartBtn.textContent = '休憩中';
                breakStartBtn.classList.add('break-active'); // 🎨 特殊スタイル適用
            }
            if (breakEndBtn) {
                breakEndBtn.disabled = false;
                breakEndBtn.textContent = '休憩終了';
            }
            break;
            
        case 'completed':
            // 退勤完了後、再度出勤可能に
            if (clockInBtn) {
                clockInBtn.disabled = false;
                clockInBtn.textContent = '出勤';
            }
            if (clockOutBtn) {
                clockOutBtn.disabled = true;
                clockOutBtn.textContent = '退勤';
            }
            if (breakStartBtn) {
                breakStartBtn.disabled = true;
                breakStartBtn.textContent = '休憩開始';
            }
            if (breakEndBtn) {
                breakEndBtn.disabled = true;
                breakEndBtn.textContent = '休憩終了';
            }
            break;
    }
    
    // 🎯 強制的にスタイルを再適用（キャッシュ問題対策）
    setTimeout(() => {
        [clockInBtn, clockOutBtn, breakStartBtn, breakEndBtn].forEach(btn => {
            if (btn) {
                // フォーカスを一瞬当てて外してスタイル更新を強制
                const originalTabIndex = btn.tabIndex;
                btn.tabIndex = -1;
                btn.focus();
                btn.blur();
                btn.tabIndex = originalTabIndex;
            }
        });
    }, 50);
    
}

// ステータス表示更新
function updateStatusDisplay(status, attendanceData, breakData = null) {
    const clockStatus = document.getElementById('clock-status');
    
    if (clockStatus) {
        let statusHtml = '';
        
        switch (status) {
            case 'working':
                statusHtml = `
                    <div class="status-working">
                        <h4>💼 勤務中です</h4>
                        <p>現場: ${attendanceData.siteName}</p>
                        <p>出勤時刻: ${attendanceData.startTime}</p>
                    </div>
                `;
                break;
                
            case 'break':
                statusHtml = `
                    <div class="status-break">
                        <h4>⏸️ 休憩中です</h4>
                        <p>現場: ${attendanceData.siteName}</p>
                        <p>休憩開始: ${breakData ? breakData.startTime : '不明'}</p>
                    </div>
                `;
                break;
                
            case 'completed':
                statusHtml = `
                    <div class="status-completed">
                        <h4>✅ 退勤しました</h4>
                        <p>現場: ${attendanceData.siteName}</p>
                        <p>勤務時間: ${attendanceData.startTime} - ${attendanceData.endTime}</p>
                        <p>お疲れさまでした。再度出勤する場合は出勤ボタンを押してください。</p>
                    </div>
                `;
                break;
                
            default:
                statusHtml = `
                    <div class="status-waiting">
                        <h4>⏰ 出勤ボタンを押してください</h4>
                        <p>現場を選択して出勤してください</p>
                    </div>
                `;
        }
        
        clockStatus.innerHTML = statusHtml;
    }
}

// 最近の記録を安全に読み込み（直近3日間のみ）
async function loadRecentRecordsSafely() {
    logger.log('loadRecentRecordsSafely called');
    
    const recentList = document.getElementById('recent-list');
    if (!recentList) {
        console.error('recent-list element not found');
        return;
    }
    
    try {
        if (!currentUser) {
            logger.log('currentUser not set, showing welcome message');
            showWelcomeMessage();
            return;
        }
        
        logger.log('Loading records for user:', currentUser.uid);
        
        // 直近3日間の日付範囲を計算
        const today = getTodayJST();
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 2); // 今日含めて3日間
        const threeDaysAgoString = threeDaysAgo.toISOString().split('T')[0];
        
        
        // インデックス不要の簡素化クエリ（ユーザーIDのみでフィルター）
        const query = getAttendanceCollection()
            .where('userId', '==', currentUser.uid)
            .limit(20); // 多めに取得してクライアント側でフィルター
        
        const snapshot = await query.get();
        logger.log('Query completed, docs found:', snapshot.size);
        
        // クライアント側で直近3日間でフィルター
        const filteredDocs = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const recordDate = data.date;
            logger.log('Processing record:', { id: doc.id, date: recordDate });
            if (recordDate && recordDate >= threeDaysAgoString && recordDate <= today) {
                filteredDocs.push(doc);
            }
        });
        
        logger.log('Filtered docs:', filteredDocs.length);
        
        // 擬似的なsnapshot作成
        const filteredSnapshot = {
            empty: filteredDocs.length === 0,
            size: filteredDocs.length,
            docs: filteredDocs
        };
        
        if (filteredSnapshot.empty) {
            logger.log('No recent records found, showing welcome message');
            showWelcomeMessage();
            return;
        }
        
        logger.log('Displaying records');
        displayRecentRecords(filteredSnapshot);
        
    } catch (error) {
        console.error('Error loading recent records:', error);
        handleRecordLoadError(error);
    }
}

// ウェルカムメッセージの表示
function showWelcomeMessage() {
    const recentList = document.getElementById('recent-list');
    if (recentList) {
        recentList.innerHTML = `
            <div class="welcome-message">
                <h4>🎯 勤怠システムへようこそ</h4>
                <p>まだ勤怠記録がありません</p>
                <p><strong>出勤ボタンを押して勤務を開始しましょう</strong></p>
                <div class="usage-tips">
                    <h5>📝 使い方:</h5>
                    <ol>
                        <li>現場を選択してください</li>
                        <li>出勤ボタンをクリック</li>
                        <li>休憩時は休憩ボタンを使用</li>
                        <li>退勤時は退勤ボタンをクリック</li>
                    </ol>
                    <p><strong>🔒 注意: 1日1回のみ出勤可能です</strong></p>
                </div>
            </div>
        `;
    }
}

// 最近の記録を表示
function displayRecentRecords(snapshot) {
    const recentList = document.getElementById('recent-list');
    if (!recentList) return;
    
    const records = [];
    // カスタムスナップショットオブジェクトに対応
    if (snapshot.docs && Array.isArray(snapshot.docs)) {
        snapshot.docs.forEach(doc => {
            records.push({ id: doc.id, ...doc.data() });
        });
    } else if (snapshot.forEach) {
        // 元のFirestoreスナップショット形式
        snapshot.forEach(doc => {
            records.push({ id: doc.id, ...doc.data() });
        });
    }
    
    // 日付でソート
    records.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
    });

    let html = '';
    records.forEach(record => {
        const statusText = getStatusText(record.status);
        
        html += `
            <div class="record-item">
                <div class="record-header">
                    <span class="record-date">${record.date || '日付不明'}</span>
                    <span class="record-status status-${record.status || 'unknown'}">${statusText}</span>
                </div>
                <div class="record-details">
                    <div class="record-site">📍 ${record.siteName || '現場不明'}</div>
                    <div class="record-time">
                        ⏰ 出勤: ${record.startTime || '不明'}
                        ${record.endTime ? ` / 退勤: ${record.endTime}` : ' (勤務中)'}
                    </div>
                    ${record.notes ? `<div class="record-notes">📝 ${record.notes}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    recentList.innerHTML = html;
}

// 記録読み込みエラーの処理
function handleRecordLoadError(error) {
    
    const recentList = document.getElementById('recent-list');
    if (recentList) {
        recentList.innerHTML = `
            <div class="error-message">
                <h4>⚠️ データ読み込みエラー</h4>
                <p>記録の読み込みで問題が発生しました</p>
                <p><strong>出勤・退勤機能は正常に動作します</strong></p>
                <button onclick="loadRecentRecordsSafely()" class="retry-btn">🔄 再試行</button>
                <details class="error-details">
                    <summary>エラー詳細</summary>
                    <code>${error.message || 'Unknown error'}</code>
                </details>
            </div>
        `;
    }
}

// エラーメッセージの表示
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-notification';
    errorDiv.innerHTML = `
        <div class="error-content">
            <h4>⚠️ エラー</h4>
            <p>${message}</p>
        </div>
    `;
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fee;
        border: 1px solid #fcc;
        border-radius: 8px;
        padding: 15px;
        max-width: 300px;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// ログアウト処理
function handleLogout() {
    if (confirm('ログアウトしますか？')) {
        // 🎯 明示的なログアウトフラグを設定
        window.explicitLogout = true;
        
        firebase.auth().signOut()
            .then(() => {
                // 変数クリアは onAuthStateChanged で実行される
                if (typeof window.showPage === 'function') {
                    window.showPage('login');
                } else {
                    window.location.href = 'index.html';
                }
            })
            .catch((error) => {
                alert('ログアウトでエラーが発生しました');
                window.explicitLogout = false; // エラー時はフラグをリセット
            });
    }
}

// データ取得を強制実行する関数
async function forceDataReload() {
    
    // 現在の変数をクリア
    currentAttendanceId = null;
    todayAttendanceData = null;
    
    // 状態復元を実行
    await restoreTodayAttendanceState();
    
    // 結果確認
    setTimeout(() => {
        // Debug info available if needed
    }, 200);
}

// グローバルエラーハンドリング
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.code) {
        
        // インデックスエラーなどを無視
        if (event.reason.code === 'failed-precondition' || 
            event.reason.code === 'permission-denied') {
            event.preventDefault();
        }
    }
});

// 初期化実行
document.addEventListener('DOMContentLoaded', function() {
    // Firebase が読み込まれるまで少し待つ
    setTimeout(initEmployeePage, 500);
});

// デバッグ用関数
function debugCurrentState() {
    
    // ボタンの現在の状態を確認
    const clockInBtn = document.getElementById('clock-in-btn');
    const clockOutBtn = document.getElementById('clock-out-btn');
    const breakStartBtn = document.getElementById('break-start-btn');
    const breakEndBtn = document.getElementById('break-end-btn');
    
    // Button state info available if needed
    
    // 🆕 正確な今日の日付チェック
    const today = getTodayJST();
}

// 強制的に勤務中状態に修正する緊急関数
function forceWorkingState() {
    
    if (todayAttendanceData) {
        updateClockButtons('working');
        updateStatusDisplay('working', todayAttendanceData);
    } else {
        
        // todayAttendanceDataがない場合は再取得を試行
        restoreTodayAttendanceState();
    }
}

// 状態を強制リセットして再初期化する関数
function forceStateReset() {
    
    // グローバル変数をクリア
    currentAttendanceId = null;
    todayAttendanceData = null;
    
    // 状態を再取得
    setTimeout(() => {
        restoreTodayAttendanceState();
    }, 100);
}

// 🆕 管理者向け：従業員の勤怠状態を強制リセットする関数
async function adminResetEmployeeAttendance(userId, targetDate) {
    try {
        if (!targetDate) {
            targetDate = getTodayJST();
        }
        
        logger.log('🔄 管理者による勤怠状態リセット開始:', userId, targetDate);
        
        // 対象日の勤怠レコードを取得
        const attendanceQuery = getAttendanceCollection()
            .where('userId', '==', userId)
            .where('date', '==', targetDate);
        
        const attendanceSnapshot = await attendanceQuery.get();
        
        if (!attendanceSnapshot.empty) {
            // 勤怠レコードを未完了状態に変更
            const updatePromises = attendanceSnapshot.docs.map(doc => {
                return doc.ref.update({
                    status: 'working',
                    endTime: firebase.firestore.FieldValue.delete(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    adminResetBy: window.currentUser?.email || 'admin',
                    adminResetAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            await Promise.all(updatePromises);
            
            logger.log('✅ 勤怠状態リセット完了:', attendanceSnapshot.docs.length, '件');
            
            // 管理者ログに記録
            const adminLog = {
                action: 'reset_attendance_state',
                targetUserId: userId,
                targetDate: targetDate,
                adminId: window.currentUser?.uid || 'unknown',
                adminEmail: window.currentUser?.email || 'unknown',
                recordCount: attendanceSnapshot.docs.length,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await firebase.firestore().collection('admin_logs').add(adminLog);
            
            return { success: true, message: '勤怠状態をリセットしました' };
        } else {
            return { success: false, message: '対象日の勤怠データが見つかりません' };
        }
        
    } catch (error) {
        console.error('❌ 勤怠状態リセットエラー:', error);
        return { success: false, message: 'リセット処理でエラーが発生しました' };
    }
}

// 🆕 正確な日付でのテスト関数
function testTodayDate() {
    const today = getTodayJST();
    
    // 今日のデータを検索
    const query = getAttendanceCollection()
        .where('userId', '==', currentUser.uid)
        .where('date', '==', today);
    
    query.get().then(snapshot => {
        if (snapshot.empty) {
        } else {
            snapshot.docs.forEach(doc => {
            });
        }
    });
}

/**
 * 従業員ページの初期化関数
 */
async function initEmployeePage() {

    try {
        // 現在のユーザーを設定
        const user = firebase.auth().currentUser;
        if (user) {
            currentUser = user;
            window.currentUser = user;
        }

        // 時刻表示の開始
        updateDateTime();
        setInterval(updateDateTime, 1000);

        // 現場オプションを読み込み
        await loadSiteOptions();

        // 日付と現場設定の復元
        restoreDateAndSiteSettings();

        // 今日の勤怠状態を復元
        restoreTodayAttendanceState();

        // UI要素の設定
        setupEmployeeEventListeners();

        // 従業員用現場管理機能の初期化
        initEmployeeSiteManagement();

        // 最近の記録を読み込み
        setTimeout(() => {
            loadRecentRecordsSafely();
        }, 1000);

    } catch (error) {
        showErrorMessage('従業員ページの初期化に失敗しました');
    }
}

/**
 * 従業員ページのイベントリスナー設定
 */
function setupEmployeeEventListeners() {
    // 出勤ボタン
    const clockInBtn = document.getElementById('clock-in-btn');
    if (clockInBtn && !clockInBtn.hasAttribute('data-listener-set')) {
        clockInBtn.addEventListener('click', handleClockIn);
        clockInBtn.setAttribute('data-listener-set', 'true');
    }

    // 退勤ボタン
    const clockOutBtn = document.getElementById('clock-out-btn');
    if (clockOutBtn && !clockOutBtn.hasAttribute('data-listener-set')) {
        clockOutBtn.addEventListener('click', handleClockOut);
        clockOutBtn.setAttribute('data-listener-set', 'true');
    }

    // 休憩開始ボタン
    const breakStartBtn = document.getElementById('break-start-btn');
    if (breakStartBtn && !breakStartBtn.hasAttribute('data-listener-set')) {
        breakStartBtn.addEventListener('click', handleBreakStart);
        breakStartBtn.setAttribute('data-listener-set', 'true');
    }

    // 休憩終了ボタン
    const breakEndBtn = document.getElementById('break-end-btn');
    if (breakEndBtn && !breakEndBtn.hasAttribute('data-listener-set')) {
        breakEndBtn.addEventListener('click', handleBreakEnd);
        breakEndBtn.setAttribute('data-listener-set', 'true');
    }

    // 現場選択の変更
    const siteSelect = document.getElementById('site-name');
    if (siteSelect && !siteSelect.hasAttribute('data-listener-set')) {
        siteSelect.addEventListener('change', handleSiteSelection);
        siteSelect.setAttribute('data-listener-set', 'true');
    }

    // ログアウトボタン
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && !logoutBtn.hasAttribute('data-listener-set')) {
        logoutBtn.addEventListener('click', handleLogout);
        logoutBtn.setAttribute('data-listener-set', 'true');
    }

    // タブ切り替えボタン
    setupEmployeeTabSwitching();
}

// ================== 従業員用タブ切り替え機能 ==================

/**
 * 従業員ページのタブ切り替え設定
 */
function setupEmployeeTabSwitching() {
    const tabButtons = document.querySelectorAll('.employee-tab-btn');

    tabButtons.forEach(button => {
        if (!button.hasAttribute('data-listener-set')) {
            button.addEventListener('click', function() {
                const targetTab = this.getAttribute('data-tab');
                switchEmployeeTab(targetTab);
            });
            button.setAttribute('data-listener-set', 'true');
        }
    });
}

/**
 * 従業員タブ切り替え処理
 */
function switchEmployeeTab(tabName) {
    // 全てのタブボタンとコンテンツを取得
    const tabButtons = document.querySelectorAll('.employee-tab-btn');
    const tabContents = document.querySelectorAll('.employee-tab-content');

    // 全てのタブボタンからactiveクラスを削除
    tabButtons.forEach(btn => btn.classList.remove('active'));

    // 全てのタブコンテンツからactiveクラスを削除
    tabContents.forEach(content => content.classList.remove('active'));

    // クリックされたタブボタンをアクティブに
    const activeButton = document.querySelector(`.employee-tab-btn[data-tab="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // 対応するタブコンテンツを表示
    const targetContent = document.getElementById(`${tabName}-content`);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    // 現場管理タブを開いた時、現場一覧を読み込む
    if (tabName === 'employee-site-management') {
        loadEmployeeSiteList();
    }
}

// ================== 従業員用現場管理機能 ==================

/**
 * 従業員用現場管理機能の初期化
 */
function initEmployeeSiteManagement() {
    // 現場追加フォームのイベント
    const addSiteForm = document.getElementById('employee-add-site-form');
    if (addSiteForm && !addSiteForm.hasAttribute('data-listener-set')) {
        addSiteForm.addEventListener('submit', handleEmployeeAddSite);
        addSiteForm.setAttribute('data-listener-set', 'true');
    }

    // 現場更新ボタンのイベント
    const refreshSitesBtn = document.getElementById('employee-refresh-sites-btn');
    if (refreshSitesBtn && !refreshSitesBtn.hasAttribute('data-listener-set')) {
        refreshSitesBtn.addEventListener('click', loadEmployeeSiteList);
        refreshSitesBtn.setAttribute('data-listener-set', 'true');
    }
}

/**
 * 従業員による新規現場追加処理
 */
async function handleEmployeeAddSite(e) {
    e.preventDefault();

    const siteName = document.getElementById('employee-add-site-name')?.value?.trim() || '';
    const siteAddress = document.getElementById('employee-add-site-address')?.value?.trim() || '';
    const siteDescription = document.getElementById('employee-add-site-description')?.value?.trim() || '';

    if (!siteName) {
        alert('現場名を入力してください');
        return;
    }

    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) {
            alert('テナント情報が取得できません');
            return;
        }

        // 現場名の重複チェック
        const existingSites = await window.getTenantSites(tenantId);
        const duplicateCheck = existingSites.some(site =>
            site.name?.trim() === siteName?.trim()
        );

        if (duplicateCheck) {
            alert(`現場名「${siteName}」は既に存在します。別の名前を入力してください。`);
            return;
        }

        // 現場データを作成
        const siteData = {
            id: `site_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: siteName,
            address: siteAddress || '',
            description: siteDescription || '',
            active: true,
            createdAt: new Date(),
            createdBy: currentUser?.email || 'unknown',
            createdByRole: 'employee'
        };

        // テナント設定に現場を追加
        const tenantSettingsRef = firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('settings')
            .doc('config');

        // 現在の設定を取得
        const settingsDoc = await tenantSettingsRef.get();
        const currentSettings = settingsDoc.exists ? settingsDoc.data() : {};

        // 現場設定を更新
        const updatedSites = currentSettings.sites || { enabled: true, requireSiteSelection: true, sites: [] };
        updatedSites.sites = updatedSites.sites || [];
        updatedSites.sites.push(siteData);

        // ドキュメントが存在しない場合はsetを使用、存在する場合はupdateを使用
        const updateData = {
            ...currentSettings,
            sites: updatedSites,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (settingsDoc.exists) {
            await tenantSettingsRef.update(updateData);
        } else {
            await tenantSettingsRef.set(updateData);
        }

        // フォームをリセット
        document.getElementById('employee-add-site-form').reset();

        // 現場一覧を更新
        await loadEmployeeSiteList();

        // 勤怠打刻画面の現場選択リストも更新
        await loadSiteOptions();

        alert('現場を追加しました');

    } catch (error) {
        console.error('現場追加エラー:', error);
        alert('現場の追加に失敗しました');
    }
}

/**
 * 従業員用現場一覧を読み込み表示（カードグリッド版）
 */
async function loadEmployeeSiteList() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) return;

        const sites = await window.getTenantSites(tenantId);
        const cardsGrid = document.getElementById('employee-site-cards-grid');

        if (!cardsGrid) return;

        if (sites.length === 0) {
            cardsGrid.innerHTML = '<div class="no-data" style="text-align:center;padding:3rem;color:var(--text-secondary);">現場が登録されていません</div>';
            return;
        }

        // 現場の使用状況を取得
        const siteUsageStats = await getEmployeeSiteUsageStats(tenantId);

        // お気に入り現場を取得
        const favoriteSites = await getEmployeeFavoriteSites(tenantId);

        // お気に入り順、有効/無効順でソート
        const sortedSites = sites.sort((a, b) => {
            const aFav = favoriteSites.includes(a.id) ? 1 : 0;
            const bFav = favoriteSites.includes(b.id) ? 1 : 0;
            if (aFav !== bFav) return bFav - aFav; // お気に入りが先
            if (a.active !== b.active) return b.active ? 1 : -1; // 有効が先
            return 0;
        });

        const siteCards = sortedSites.map(site => {
            const usage = siteUsageStats[site.name] || { count: 0, lastUsed: null };
            const isFavorite = favoriteSites.includes(site.id);

            const statusBadge = site.active ?
                '<span class="status-badge status-active">有効</span>' :
                '<span class="status-badge status-inactive">無効</span>';

            const usageBadge = usage.count > 0 ?
                `<span class="site-usage-badge">${usage.count}回使用</span>` :
                '<span class="site-usage-badge unused">未使用</span>';

            const createdDate = site.createdAt ?
                new Date(site.createdAt.toDate ? site.createdAt.toDate() : site.createdAt).toLocaleDateString('ja-JP') :
                '不明';

            return `
                <div class="site-card-item ${isFavorite ? 'favorite' : ''}" data-site-id="${site.id}">
                    <div class="site-card-header-row">
                        <h3 class="site-card-title">🏢 ${escapeHtmlEmployee(site.name)}</h3>
                        <div class="site-card-status">${statusBadge}</div>
                    </div>

                    <div class="site-card-body-info">
                        ${site.address ? `
                            <div class="site-info-row">
                                <span class="site-info-icon">📍</span>
                                <span class="site-info-text">${escapeHtmlEmployee(site.address)}</span>
                            </div>
                        ` : ''}

                        <div class="site-info-row">
                            <span class="site-info-icon">📅</span>
                            <span class="site-info-text">作成日: ${createdDate}</span>
                        </div>

                        <div class="site-info-row">
                            <span class="site-info-icon">📊</span>
                            <span class="site-info-text">${usageBadge}</span>
                        </div>

                        ${site.description ? `
                            <div class="site-info-row">
                                <span class="site-info-icon">📝</span>
                                <span class="site-info-text">${escapeHtmlEmployee(site.description)}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="site-card-footer">
                        <button class="btn btn-favorite ${isFavorite ? 'active' : ''}" onclick="toggleEmployeeFavorite('${site.id}')">
                            ${isFavorite ? '⭐' : '☆'} お気に入り
                        </button>
                        <button class="btn btn-secondary btn-small" onclick="editEmployeeSite('${site.id}')">
                            ✏️ 編集
                        </button>
                        <button class="btn btn-${site.active ? 'danger' : 'success'} btn-small" onclick="toggleEmployeeSiteStatus('${site.id}', ${!site.active})">
                            ${site.active ? '無効化' : '有効化'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        cardsGrid.innerHTML = siteCards;

    } catch (error) {
        console.error('現場一覧読み込みエラー:', error);
        const cardsGrid = document.getElementById('employee-site-cards-grid');
        if (cardsGrid) {
            cardsGrid.innerHTML = '<div class="error" style="text-align:center;padding:3rem;color:var(--danger-color);font-weight:600;">現場一覧の読み込みに失敗しました</div>';
        }
    }
}

/**
 * 現場の使用状況統計を取得（従業員用）
 */
async function getEmployeeSiteUsageStats(tenantId) {
    try {
        const attendanceRef = firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('attendance');

        const snapshot = await attendanceRef.get();
        const stats = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.siteName) {
                if (!stats[data.siteName]) {
                    stats[data.siteName] = { count: 0, lastUsed: null };
                }
                stats[data.siteName].count++;

                const recordDate = new Date(data.date);
                if (!stats[data.siteName].lastUsed || recordDate > stats[data.siteName].lastUsed) {
                    stats[data.siteName].lastUsed = recordDate;
                }
            }
        });

        return stats;

    } catch (error) {
        console.error('現場使用状況取得エラー:', error);
        return {};
    }
}

/**
 * 従業員による現場編集処理
 */
async function editEmployeeSite(siteId) {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        const sites = await window.getTenantSites(tenantId);
        const site = sites.find(s => s.id === siteId);

        if (!site) {
            alert('現場が見つかりません');
            return;
        }

        const newName = prompt('現場名を入力してください:', site.name);
        if (!newName || newName.trim() === '') return;

        const newAddress = prompt('住所を入力してください:', site.address || '');
        const newDescription = prompt('説明・備考を入力してください:', site.description || '');

        // 名前変更の場合は重複チェック
        if (newName !== site.name) {
            if (sites.some(s => s.name === newName && s.id !== siteId)) {
                alert('同じ名前の現場が既に存在します');
                return;
            }
        }

        // 現場データを更新
        const updatedSite = {
            ...site,
            name: newName.trim(),
            address: newAddress ? newAddress.trim() : '',
            description: newDescription ? newDescription.trim() : '',
            updatedAt: new Date(),
            updatedBy: currentUser?.email || 'unknown',
            updatedByRole: 'employee'
        };

        // テナント設定を更新
        const updatedSites = sites.map(s => s.id === siteId ? updatedSite : s);
        await updateEmployeeTenantSites(tenantId, updatedSites);

        // 現場一覧を更新
        await loadEmployeeSiteList();

        // 勤怠打刻画面の現場選択リストも更新
        await loadSiteOptions();

        alert('現場情報を更新しました');

    } catch (error) {
        console.error('現場編集エラー:', error);
        alert('現場情報の更新に失敗しました');
    }
}

/**
 * 従業員による現場の有効/無効切り替え
 */
async function toggleEmployeeSiteStatus(siteId, newStatus) {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        const sites = await window.getTenantSites(tenantId);
        const site = sites.find(s => s.id === siteId);

        if (!site) {
            alert('現場が見つかりません');
            return;
        }

        const action = newStatus ? '有効化' : '無効化';
        if (!confirm(`現場「${site.name}」を${action}しますか？`)) {
            return;
        }

        // 現場データを更新
        const updatedSite = {
            ...site,
            active: newStatus,
            updatedAt: new Date(),
            updatedBy: currentUser?.email || 'unknown',
            updatedByRole: 'employee'
        };

        // テナント設定を更新
        const updatedSites = sites.map(s => s.id === siteId ? updatedSite : s);
        await updateEmployeeTenantSites(tenantId, updatedSites);

        // 現場一覧を更新
        await loadEmployeeSiteList();

        // 勤怠打刻画面の現場選択リストも更新
        await loadSiteOptions();

        alert(`現場を${action}しました`);

    } catch (error) {
        console.error('現場ステータス更新エラー:', error);
        alert('現場ステータスの更新に失敗しました');
    }
}

/**
 * テナントの現場設定を更新（従業員用）
 */
async function updateEmployeeTenantSites(tenantId, sites) {
    const tenantSettingsRef = firebase.firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('settings')
        .doc('config');

    const settingsDoc = await tenantSettingsRef.get();
    const currentSettings = settingsDoc.exists ? settingsDoc.data() : {};

    const updatedSites = currentSettings.sites || { enabled: true, requireSiteSelection: true, sites: [] };
    updatedSites.sites = sites;

    const updateData = {
        ...currentSettings,
        sites: updatedSites,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (settingsDoc.exists) {
        await tenantSettingsRef.update(updateData);
    } else {
        await tenantSettingsRef.set(updateData);
    }
}

/**
 * お気に入り現場を取得
 */
async function getEmployeeFavoriteSites(tenantId) {
    try {
        const userId = currentUser?.uid || window.currentUser?.uid;
        if (!userId) return [];

        const key = `favoriteSites_${userId}_${tenantId}`;
        const favorites = localStorage.getItem(key);
        return favorites ? JSON.parse(favorites) : [];
    } catch (error) {
        console.error('お気に入り取得エラー:', error);
        return [];
    }
}

/**
 * お気に入り現場の切り替え
 */
async function toggleEmployeeFavorite(siteId) {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        const userId = currentUser?.uid || window.currentUser?.uid;
        if (!tenantId || !userId) return;

        const key = `favoriteSites_${userId}_${tenantId}`;
        let favorites = await getEmployeeFavoriteSites(tenantId);

        if (favorites.includes(siteId)) {
            // お気に入りから削除
            favorites = favorites.filter(id => id !== siteId);
        } else {
            // お気に入りに追加
            favorites.push(siteId);
        }

        localStorage.setItem(key, JSON.stringify(favorites));

        // 現場一覧を再読み込み
        await loadEmployeeSiteList();

    } catch (error) {
        console.error('お気に入り切り替えエラー:', error);
        alert('お気に入りの切り替えに失敗しました');
    }
}

/**
 * HTMLエスケープ関数（従業員用）
 */
function escapeHtmlEmployee(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 従業員用現場管理関数をグローバルスコープに公開
window.editEmployeeSite = editEmployeeSite;
window.toggleEmployeeSiteStatus = toggleEmployeeSiteStatus;
window.toggleEmployeeFavorite = toggleEmployeeFavorite;
window.selectSiteFromHistory = selectSiteFromHistory;
window.loadEmployeeSiteList = loadEmployeeSiteList;

