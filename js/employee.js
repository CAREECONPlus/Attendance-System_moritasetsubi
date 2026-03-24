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

// 🆕 日本時間で確実に日付を取得する関数
// 🔧 修正: toISOString()はUTCを返すため、早朝打刻が前日になるバグを修正
function getDateJST(date = new Date()) {
    // Intl APIを使用して日本時間の日付を取得（最も確実な方法）
    const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(date); // YYYY-MM-DD形式
}

// 今日の日付を日本時間で取得
function getTodayJST() {
    return getDateJST(new Date());
}

// N日前の日付を日本時間で取得
function getDaysAgoJST(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return getDateJST(date);
}

// ========================================
// 🆕 特殊勤務判定用のヘルパー関数群
// ========================================

/**
 * 時刻文字列（HH:MM:SS）をDateオブジェクトに変換
 * @param {string} timeString - "HH:MM:SS" 形式の時刻文字列
 * @param {string} dateString - "YYYY-MM-DD" 形式の日付文字列（オプション）
 * @returns {Date} Dateオブジェクト
 */
function parseTimeString(timeString, dateString = null) {
    const baseDate = dateString ? new Date(dateString) : new Date();
    const [hours, minutes, seconds] = timeString.split(':').map(Number);

    const result = new Date(baseDate);
    result.setHours(hours, minutes, seconds || 0, 0);

    return result;
}

/**
 * 実働時間を計算（分単位）
 * @param {string} startTime - 出勤時刻（HH:MM:SS）
 * @param {string} endTime - 退勤時刻（HH:MM:SS）
 * @param {number} breakMinutes - 休憩時間（分）
 * @param {string} dateString - 勤務日（YYYY-MM-DD）
 * @returns {number} 実働時間（分）
 */
function calculateWorkingMinutes(startTime, endTime, breakMinutes, dateString) {
    try {
        const start = parseTimeString(startTime, dateString);
        let end = parseTimeString(endTime, dateString);

        // 退勤時刻が出勤時刻より前の場合は翌日とみなす（夜勤対応）
        if (end < start) {
            end.setDate(end.getDate() + 1);
        }

        // 総労働時間（ミリ秒）
        const totalMilliseconds = end - start;
        const totalMinutes = Math.floor(totalMilliseconds / (1000 * 60));

        // 実働時間 = 総労働時間 - 休憩時間
        const workingMinutes = totalMinutes - (breakMinutes || 0);

        return Math.max(0, workingMinutes); // 負の値を防止
    } catch (error) {
        console.error('実働時間の計算エラー:', error);
        return 0;
    }
}

/**
 * 残業時間を計算（分単位）
 * @param {number} workingMinutes - 実働時間（分）
 * @returns {number} 残業時間（分）
 */
function calculateOvertimeMinutes(workingMinutes) {
    const standardWorkMinutes = 8 * 60; // 8時間 = 480分
    const overtime = workingMinutes - standardWorkMinutes;
    return Math.max(0, overtime); // 8時間以下の場合は0
}

/**
 * 夜間勤務かどうか判定
 * @param {string} startTime - 出勤時刻（HH:MM:SS）
 * @param {string} endTime - 退勤時刻（HH:MM:SS）
 * @returns {object} { isNight: boolean, type: 'none' | 'night_only' | 'through_night' }
 */
function detectNightWork(startTime, endTime) {
    try {
        const [startHour] = startTime.split(':').map(Number);
        const [endHour] = endTime.split(':').map(Number);

        // 夜勤の定義：20時以降の出勤、または退勤が深夜（22時〜翌朝5時）
        const isStartNight = startHour >= 20 || startHour < 5; // 20:00〜翌朝5:00
        const isEndNight = endHour >= 22 || endHour < 5; // 22:00〜翌朝5:00

        // 判定ロジック
        if (isStartNight && isEndNight) {
            // 出勤も退勤も夜間 → 「夜間のみ」
            return { isNight: true, type: 'night_only' };
        } else if (!isStartNight && isEndNight) {
            // 出勤は昼間、退勤は夜間 → 「通し夜間」
            return { isNight: true, type: 'through_night' };
        } else if (isStartNight && !isEndNight) {
            // 出勤は夜間、退勤は昼間（深夜から朝まで）→ 「夜間のみ」
            return { isNight: true, type: 'night_only' };
        } else {
            // どちらも昼間 → 通常勤務
            return { isNight: false, type: 'none' };
        }
    } catch (error) {
        console.error('夜間勤務判定エラー:', error);
        return { isNight: false, type: 'none' };
    }
}

/**
 * 休日出勤かどうか判定（土日のみ）
 * @param {string} dateString - 日付（YYYY-MM-DD）
 * @returns {boolean} 休日出勤ならtrue
 */
function isWeekendWork(dateString) {
    try {
        const date = new Date(dateString);
        const dayOfWeek = date.getDay(); // 0=日曜, 6=土曜
        return dayOfWeek === 0 || dayOfWeek === 6;
    } catch (error) {
        console.error('休日判定エラー:', error);
        return false;
    }
}

/**
 * 特殊勤務ステータスを総合的に判定
 * @param {string} startTime - 出勤時刻（HH:MM:SS）
 * @param {string} endTime - 退勤時刻（HH:MM:SS）
 * @param {number} breakMinutes - 休憩時間（分）
 * @param {string} dateString - 勤務日（YYYY-MM-DD）
 * @returns {object} 特殊勤務データ
 */
function calculateSpecialWorkStatus(startTime, endTime, breakMinutes, dateString) {
    // 実働時間を計算
    const workingMinutes = calculateWorkingMinutes(startTime, endTime, breakMinutes, dateString);

    // 残業時間を計算
    const overtimeMinutes = calculateOvertimeMinutes(workingMinutes);

    // 夜間勤務を判定
    const nightWork = detectNightWork(startTime, endTime);

    // 休日出勤を判定
    const isHoliday = isWeekendWork(dateString);

    // 特殊勤務タイプを決定
    let specialWorkType = 'normal'; // デフォルトは通常勤務

    if (isHoliday) {
        specialWorkType = 'holiday_work'; // 休日出勤が最優先
    } else if (nightWork.type === 'through_night') {
        specialWorkType = 'through_night'; // 通し夜間
    } else if (nightWork.type === 'night_only') {
        specialWorkType = 'night_only'; // 夜間のみ
    } else if (overtimeMinutes > 0) {
        specialWorkType = 'overtime'; // 残業
    }

    return {
        workingMinutes,           // 実働時間（分）
        overtimeMinutes,          // 残業時間（分）
        isNightWork: nightWork.isNight,  // 夜間勤務フラグ
        nightWorkType: nightWork.type,   // 夜間勤務タイプ
        isHolidayWork: isHoliday,        // 休日出勤フラグ
        specialWorkType                   // 特殊勤務タイプ
    };
}

// ========================================
// ヘルパー関数群 ここまで
// ========================================

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

    } catch (error) {
        console.error('現場切り替えエラー:', error);
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
    const logoutBtn = document.getElementById('logout-btn');

    if (clockInBtn) clockInBtn.addEventListener('click', handleClockIn);
    if (clockOutBtn) clockOutBtn.addEventListener('click', handleClockOut);
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

        const siteSelect = document.getElementById('site-name');

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

        // 休憩時間を取得
        const breakMinutesElement = document.getElementById('break-minutes');
        const breakMinutes = breakMinutesElement ? parseInt(breakMinutesElement.value) || 60 : 60;

        // チェックボックスの状態を取得
        const isHolidayWork = document.getElementById('is-holiday-work')?.checked || false;
        const isNightWork = document.getElementById('is-night-work')?.checked || false;

        // デフォルト時刻: 8:00-17:00（実働8時間、休憩1時間）
        const defaultStartTime = '08:00:00';
        const defaultEndTime = '17:00:00';
        const workingMinutes = 480; // 8時間
        const overtimeMinutes = 0;

        // 勤務タイプを判定
        let nightWorkType = 'none';
        let specialWorkType = 'normal';

        if (isHolidayWork) {
            specialWorkType = 'holiday_work';
        } else if (isNightWork) {
            nightWorkType = 'night_only';
            specialWorkType = 'night_work';
        }

        const attendanceData = {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            date: today,
            siteName: siteName,
            startTime: defaultStartTime,
            endTime: defaultEndTime,
            breakMinutes: breakMinutes,
            workingMinutes: workingMinutes,
            overtimeMinutes: overtimeMinutes,
            status: 'completed', // 即座に完了状態
            isHolidayWork: isHolidayWork,
            isNightWork: isNightWork,
            nightWorkType: nightWorkType,
            specialWorkType: specialWorkType,
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

        // UI更新（即座に完了状態）
        updateClockButtons('completed');
        updateStatusDisplay('completed', todayAttendanceData);

        // 現場を履歴に追加
        addSiteToHistory(siteName);

        // チェックボックスをリセット
        const holidayCheckbox = document.getElementById('is-holiday-work');
        const nightCheckbox = document.getElementById('is-night-work');
        if (holidayCheckbox) holidayCheckbox.checked = false;
        if (nightCheckbox) nightCheckbox.checked = false;

        let alertMsg = `✅ 勤怠を登録しました！\n`;
        alertMsg += `現場: ${siteName}\n`;
        alertMsg += `日付: ${today}\n`;
        alertMsg += `時間: 08:00 - 17:00（実働8時間）\n`;
        if (isHolidayWork) alertMsg += `📅 休日出勤\n`;
        if (isNightWork) alertMsg += `🌙 夜間勤務\n`;
        alertMsg += `\n※ 編集が必要な場合は下の記録から編集できます`;

        alert(alertMsg);

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
        const endTime = now.toLocaleTimeString('ja-JP');

        // 現在の勤怠データから必要な情報を取得
        const startTime = todayAttendanceData?.startTime;
        const breakMinutes = todayAttendanceData?.breakMinutes || 60;
        const dateString = todayAttendanceData?.date || getTodayJST();

        if (!startTime) {
            alert('出勤時刻が見つかりません。データに問題があります。');
            return;
        }

        // 🆕 特殊勤務ステータスを自動判定
        const specialWorkData = calculateSpecialWorkStatus(
            startTime,
            endTime,
            breakMinutes,
            dateString
        );

        // 🆕 更新データに特殊勤務情報を含める
        const updateData = {
            endTime: endTime,
            status: 'completed',
            breakMinutes: breakMinutes,                               // 休憩時間（分）- CSV出力用
            breakDuration: breakMinutes,                              // 休憩時間（分）- 互換性のため両方保存
            workingMinutes: specialWorkData.workingMinutes,           // 実働時間（分）
            overtimeMinutes: specialWorkData.overtimeMinutes,         // 残業時間（分）
            isNightWork: specialWorkData.isNightWork,                 // 夜間勤務フラグ
            nightWorkType: specialWorkData.nightWorkType,             // 夜間勤務タイプ
            isHolidayWork: specialWorkData.isHolidayWork,             // 休日出勤フラグ
            specialWorkType: specialWorkData.specialWorkType,         // 特殊勤務タイプ
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await getAttendanceCollection()
            .doc(currentAttendanceId)
            .update(updateData);


        // グローバル変数更新
        todayAttendanceData = {
            ...todayAttendanceData,
            endTime: endTime,
            status: 'completed',
            ...specialWorkData
        };

        // UI更新
        updateClockButtons('completed');
        updateStatusDisplay('completed', todayAttendanceData);

        // 🆕 特殊勤務情報を含むアラート
        const workingHours = Math.floor(specialWorkData.workingMinutes / 60);
        const workingMins = specialWorkData.workingMinutes % 60;
        const overtimeHours = Math.floor(specialWorkData.overtimeMinutes / 60);
        const overtimeMins = specialWorkData.overtimeMinutes % 60;

        let alertMessage = 'お疲れさまでした！\n\n';
        alertMessage += `実働時間: ${workingHours}時間${workingMins}分\n`;

        if (specialWorkData.overtimeMinutes > 0) {
            alertMessage += `残業時間: ${overtimeHours}時間${overtimeMins}分\n`;
        }

        if (specialWorkData.isHolidayWork) {
            alertMessage += `📅 休日出勤\n`;
        } else if (specialWorkData.nightWorkType === 'through_night') {
            alertMessage += `🌙 通し夜間勤務\n`;
        } else if (specialWorkData.nightWorkType === 'night_only') {
            alertMessage += `🌙 夜間勤務\n`;
        }

        alert(alertMessage);

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

    // 全ボタンの特殊クラスをリセット
    [clockInBtn, clockOutBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('processing');
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
            break;

        case 'working':
        case 'break': // breakステータスもworkingと同じ扱い（休憩は自動控除）
            // 出勤済み、退勤が有効
            if (clockInBtn) {
                clockInBtn.disabled = true;
                clockInBtn.textContent = '出勤済み';
            }
            if (clockOutBtn) {
                clockOutBtn.disabled = false;
                clockOutBtn.textContent = '退勤';
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
            break;
    }
    
    // 🎯 強制的にスタイルを再適用（キャッシュ問題対策）
    setTimeout(() => {
        [clockInBtn, clockOutBtn].forEach(btn => {
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
            case 'break': // breakステータスもworkingと同じ表示（休憩は自動控除）
                const breakInfo = attendanceData.breakMinutes > 0
                    ? `<p>休憩時間: ${attendanceData.breakMinutes}分（自動控除）</p>`
                    : '';
                statusHtml = `
                    <div class="status-working">
                        <h4>💼 勤務中です</h4>
                        <p>現場: ${attendanceData.siteName}</p>
                        <p>出勤時刻: ${attendanceData.startTime}</p>
                        ${breakInfo}
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
    const recentList = document.getElementById('recent-list');
    if (!recentList) {
        console.error('recent-list element not found');
        return;
    }

    try {
        if (!currentUser) {
            showWelcomeMessage();
            return;
        }

        // 直近3日間の日付範囲を計算（日本時間）
        const today = getTodayJST();
        const threeDaysAgoString = getDaysAgoJST(2); // 今日含めて3日間

        // インデックス不要の簡素化クエリ（ユーザーIDのみでフィルター）
        const query = getAttendanceCollection()
            .where('userId', '==', currentUser.uid)
            .limit(20); // 多めに取得してクライアント側でフィルター

        const snapshot = await query.get();

        // クライアント側で直近3日間でフィルター
        const filteredDocs = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const recordDate = data.date;
            if (recordDate && recordDate >= threeDaysAgoString && recordDate <= today) {
                filteredDocs.push(doc);
            }
        });

        // 擬似的なsnapshot作成
        const filteredSnapshot = {
            empty: filteredDocs.length === 0,
            size: filteredDocs.length,
            docs: filteredDocs
        };

        if (filteredSnapshot.empty) {
            showWelcomeMessage();
            return;
        }

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

    // renderAttendanceRecordを使用して統一されたUIを表示
    let html = '';
    records.forEach(record => {
        html += renderAttendanceRecord(record.id, record);
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
        console.error('勤怠状態リセットエラー:', error);
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

        // 経費精算機能の初期化
        if (typeof initExpenseManagement === 'function') {
            initExpenseManagement();
        }

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

    // 勤怠編集フォーム
    const editAttendanceForm = document.getElementById('edit-attendance-form');
    if (editAttendanceForm && !editAttendanceForm.hasAttribute('data-listener-set')) {
        editAttendanceForm.addEventListener('submit', saveEditedAttendance);
        editAttendanceForm.setAttribute('data-listener-set', 'true');
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

    // 経費精算タブを開いた時、初期化と経費一覧を読み込む
    if (tabName === 'expense-management') {
        if (typeof initExpenseManagement === 'function') {
            initExpenseManagement();
        }
        if (typeof loadExpenseList === 'function') {
            loadExpenseList();
        }
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

/**
 * 勤怠記録編集モーダルを開く
 */
async function openEditModal(recordId) {
    try {
        // 記録を取得
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;

        if (!tenantId) {
            console.error('テナント情報が取得できませんでした');
            alert('テナント情報が取得できませんでした');
            return;
        }

        const recordDoc = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('attendance')
            .doc(recordId)
            .get();

        if (!recordDoc.exists) {
            alert('記録が見つかりませんでした');
            return;
        }

        const record = recordDoc.data();

        // フォームに値を設定
        const editRecordIdEl = document.getElementById('edit-record-id');
        const editDateEl = document.getElementById('edit-date');

        if (!editRecordIdEl || !editDateEl) {
            console.error('必要なフォーム要素が見つかりません');
            alert('フォーム要素が見つかりませんでした');
            return;
        }

        editRecordIdEl.value = recordId;
        editDateEl.value = record.date || '';

        // 現場リストを読み込む
        const sites = await window.getTenantSites(tenantId);

        const siteSelect = document.getElementById('edit-site-name');
        if (!siteSelect) {
            console.error('現場選択フォームが見つかりません');
            alert('現場選択フォームが見つかりませんでした');
            return;
        }

        siteSelect.innerHTML = '<option value="">現場を選択してください</option>';

        sites.filter(s => s.active).forEach(site => {
            const option = document.createElement('option');
            option.value = site.name;
            option.textContent = site.name;
            if (site.name === record.siteName) {
                option.selected = true;
            }
            siteSelect.appendChild(option);
        });

        // 時刻を設定（HH:MM形式に変換）
        const editStartTimeEl = document.getElementById('edit-start-time');
        const editEndTimeEl = document.getElementById('edit-end-time');
        const editNotesEl = document.getElementById('edit-notes');
        const editReasonEl = document.getElementById('edit-reason');

        if (editStartTimeEl) editStartTimeEl.value = convertToTimeInput(record.startTime);
        if (editEndTimeEl) editEndTimeEl.value = convertToTimeInput(record.endTime);
        if (editNotesEl) editNotesEl.value = record.notes || '';
        if (editReasonEl) editReasonEl.value = '';

        // モーダルを表示
        const modal = document.getElementById('edit-attendance-modal');

        if (!modal) {
            console.error('編集モーダルが見つかりません');
            alert('編集モーダルが見つかりませんでした');
            return;
        }

        modal.classList.remove('hidden');
        modal.style.display = 'block';

        // イベントリスナーを設定
        setupEditModalCloseListeners();

    } catch (error) {
        console.error('モーダル表示エラー:', error);
        alert('記録の読み込みに失敗しました:\n' + error.message);
    }
}

/**
 * 編集モーダルの閉じるイベントリスナーを設定
 */
function setupEditModalCloseListeners() {
    const modal = document.getElementById('edit-attendance-modal');
    const overlay = modal?.querySelector('.modal-overlay');
    const closeBtn = modal?.querySelector('.modal-close-btn');
    const cancelBtn = modal?.querySelector('.btn-secondary');

    // モーダルを閉じる処理を直接定義
    const closeModalDirectly = function() {
        const modalEl = document.getElementById('edit-attendance-modal');

        if (modalEl) {
            modalEl.classList.add('hidden');
            modalEl.style.display = 'none';
        }

        const formEl = document.getElementById('edit-attendance-form');
        if (formEl) {
            formEl.reset();
        }
    };

    // 既存のイベントリスナーをクリア（クローンして置き換え）
    if (overlay) {
        const newOverlay = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(newOverlay, overlay);
        newOverlay.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeModalDirectly();
        });
    }

    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeModalDirectly();
        });
    }

    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeModalDirectly();
        });
    }
}

// 即座にグローバルスコープに公開（HTMLから呼び出せるように）
window.openEditModal = openEditModal;

/**
 * 編集モーダルを閉じる
 */
function closeEditModal() {
    const modal = document.getElementById('edit-attendance-modal');

    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }

    const form = document.getElementById('edit-attendance-form');
    if (form) {
        form.reset();
    }
}

// 即座にグローバルスコープに公開
window.closeEditModal = closeEditModal;

/**
 * 時刻を HH:MM 形式に変換
 */
function convertToTimeInput(timeString) {
    if (!timeString) return '';

    // "09:00:00" または "9:00" 形式を "09:00" に変換
    const parts = timeString.split(':');
    if (parts.length >= 2) {
        const hour = parts[0].padStart(2, '0');
        const minute = parts[1].padStart(2, '0');
        return `${hour}:${minute}`;
    }

    return '';
}

/**
 * 勤怠記録を編集保存
 */
async function saveEditedAttendance(e) {
    e.preventDefault();

    try {
        const recordId = document.getElementById('edit-record-id').value;
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId || !recordId) return;

        const siteName = document.getElementById('edit-site-name').value;
        const startTime = document.getElementById('edit-start-time').value;
        const endTime = document.getElementById('edit-end-time').value;
        const notes = document.getElementById('edit-notes').value;
        const editReason = document.getElementById('edit-reason').value;

        if (!siteName || !startTime) {
            alert('現場名と出勤時刻は必須です');
            return;
        }

        if (!editReason.trim()) {
            alert('修正理由を入力してください');
            return;
        }

        // 編集履歴を作成
        const editHistoryEntry = {
            editedAt: new Date().toISOString(),
            editedBy: currentUser?.email || 'unknown',
            reason: editReason,
            changes: {
                siteName,
                startTime: startTime + ':00', // 秒を追加
                endTime: endTime ? endTime + ':00' : null,
                notes
            }
        };

        // 更新データを準備
        const updateData = {
            siteName,
            startTime: startTime + ':00',
            notes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            editHistory: firebase.firestore.FieldValue.arrayUnion(editHistoryEntry)
        };

        if (endTime) {
            updateData.endTime = endTime + ':00';
            updateData.status = 'completed';
        }

        // Firestoreを更新
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('attendance')
            .doc(recordId)
            .update(updateData);

        alert('勤怠記録を更新しました');

        // モーダルを閉じる（直接処理）
        const modalEl = document.getElementById('edit-attendance-modal');
        if (modalEl) {
            modalEl.classList.add('hidden');
            modalEl.style.display = 'none';
        }
        const formEl = document.getElementById('edit-attendance-form');
        if (formEl) {
            formEl.reset();
        }

        // 記録一覧を再読み込み
        await loadRecentRecordsSafely();

    } catch (error) {
        console.error('記録更新エラー:', error);
        alert('記録の更新に失敗しました');
    }
}

// 従業員用現場管理関数をグローバルスコープに公開
window.editEmployeeSite = editEmployeeSite;
window.toggleEmployeeSiteStatus = toggleEmployeeSiteStatus;
window.toggleEmployeeFavorite = toggleEmployeeFavorite;
window.selectSiteFromHistory = selectSiteFromHistory;
window.loadEmployeeSiteList = loadEmployeeSiteList;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;

// ========================================
// 🆕 月選択機能・勤怠編集機能
// ========================================

/**
 * 月選択ドロップダウンを初期化
 */
function initMonthSelector() {
    const selector = document.getElementById('employee-month-selector');
    if (!selector) return;

    const options = [];
    const now = new Date();

    // 過去12ヶ月分の選択肢を生成
    for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const value = `${year}-${month}`;
        const label = `${year}年${date.getMonth() + 1}月`;

        options.push({ value, label });
    }

    selector.innerHTML = options.map(opt =>
        `<option value="${opt.value}">${opt.label}</option>`
    ).join('');

    // 変更イベントを設定
    selector.addEventListener('change', () => {
        loadMonthlyRecords(selector.value);
    });

    // 初期表示：当月
    if (options.length > 0) {
        loadMonthlyRecords(options[0].value);
    }
}

/**
 * 指定月の勤怠記録を読み込み
 */
async function loadMonthlyRecords(yearMonth) {
    const listContainer = document.getElementById('recent-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="loading-message">🔄 記録を読み込み中...</div>';

    try {
        if (!currentUser) {
            listContainer.innerHTML = '<div class="no-records">ログインが必要です</div>';
            return;
        }

        // 月の開始日と終了日を計算
        const startDate = `${yearMonth}-01`;
        const [year, month] = yearMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

        // Firestoreからデータ取得
        const snapshot = await getAttendanceCollection()
            .where('userId', '==', currentUser.uid)
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'desc')
            .get();

        if (snapshot.empty) {
            listContainer.innerHTML = '<div class="no-records">📭 この月の記録はありません</div>';
            return;
        }

        // 記録を表示
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            html += renderAttendanceRecord(doc.id, data);
        });

        listContainer.innerHTML = html;

    } catch (error) {
        console.error('月次記録読み込みエラー:', error);
        listContainer.innerHTML = '<div class="error-message">❌ 記録の読み込みに失敗しました</div>';
    }
}

/**
 * 勤怠記録をHTMLにレンダリング
 */
function renderAttendanceRecord(recordId, data) {
    const date = data.date || '';
    const dateObj = new Date(date);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

    const startTime = data.startTime ? data.startTime.substring(0, 5) : '-';
    const endTime = data.endTime ? data.endTime.substring(0, 5) : '-';
    const siteName = data.siteName || '-';

    // 勤務タイプの表示
    let workTypeLabel = '';
    let workTypeClass = '';

    if (data.specialWorkType === 'paid_leave') {
        workTypeLabel = '🏖️ 有給';
        workTypeClass = 'type-leave';
    } else if (data.specialWorkType === 'compensatory_leave') {
        workTypeLabel = '🔄 代休';
        workTypeClass = 'type-leave';
    } else if (data.specialWorkType === 'absence') {
        workTypeLabel = '❌ 欠勤';
        workTypeClass = 'type-absence';
    } else if (data.isHolidayWork) {
        workTypeLabel = '📅 休日出勤';
        workTypeClass = 'type-holiday';
    } else if (data.nightWorkType === 'through_night') {
        workTypeLabel = '🌙 通し夜間';
        workTypeClass = 'type-night';
    } else if (data.nightWorkType === 'night_only' || data.isNightWork) {
        workTypeLabel = '🌙 夜間';
        workTypeClass = 'type-night';
    } else {
        workTypeLabel = '✅ 出勤';
        workTypeClass = 'type-normal';
    }

    // 勤務時間の計算表示
    const workingHours = data.workingMinutes ? Math.floor(data.workingMinutes / 60) : 0;
    const workingMins = data.workingMinutes ? data.workingMinutes % 60 : 0;
    const workingTimeStr = data.workingMinutes ? `${workingHours}h${workingMins}m` : '-';

    return `
        <div class="record-item ${workTypeClass}" data-record-id="${recordId}">
            <div class="record-buttons">
                <button class="record-edit-btn" onclick="openEmployeeAttendanceModal('${recordId}')">編集</button>
                <button class="record-delete-btn" onclick="deleteEmployeeAttendanceRecord('${recordId}')">削除</button>
            </div>
            <div class="record-date ${isWeekend ? 'weekend' : ''}">
                ${date} (${dayOfWeek})
            </div>
            <div class="record-details">
                <span class="record-time">${startTime} - ${endTime}</span>
                <span class="record-site">${siteName}</span>
                <span class="record-type ${workTypeClass}">${workTypeLabel}</span>
                <span class="record-working">${workingTimeStr}</span>
            </div>
        </div>
    `;
}

/**
 * 従業員用勤怠編集モーダルを開く
 */
async function openEmployeeAttendanceModal(recordId) {
    const modal = document.getElementById('employee-attendance-modal');
    if (!modal) return;

    try {
        // 記録を取得
        const doc = await getAttendanceCollection().doc(recordId).get();
        if (!doc.exists) {
            alert('記録が見つかりません');
            return;
        }

        const data = doc.data();

        // 編集モードを設定
        document.getElementById('emp-attendance-mode').value = 'edit';
        document.getElementById('emp-modal-title').textContent = '📝 勤怠記録の編集';
        document.getElementById('emp-date-group').style.display = 'none';

        // フォームに値をセット
        document.getElementById('emp-attendance-id').value = recordId;
        document.getElementById('emp-attendance-date').value = data.date || '';

        // 勤務タイプのラジオボタンをセット
        let workType = 'normal';
        if (data.specialWorkType === 'paid_leave') {
            workType = 'paid_leave';
        } else if (data.specialWorkType === 'compensatory_leave') {
            workType = 'compensatory_leave';
        } else if (data.specialWorkType === 'absence') {
            workType = 'absence';
        } else if (data.isHolidayWork) {
            workType = 'holiday_work';
        } else if (data.nightWorkType === 'through_night') {
            workType = 'through_night';
        } else if (data.nightWorkType === 'night_only' || data.isNightWork) {
            workType = 'night_work';
        }

        const radioBtn = document.querySelector(`input[name="emp-work-type"][value="${workType}"]`);
        if (radioBtn) radioBtn.checked = true;

        // 時刻をセット
        const startTime = data.startTime ? data.startTime.substring(0, 5) : '08:00';
        const endTime = data.endTime ? data.endTime.substring(0, 5) : '17:00';
        document.getElementById('emp-start-time').value = startTime;
        document.getElementById('emp-end-time').value = endTime;

        // 休憩時間をセット
        const breakMinutes = data.breakMinutes || data.breakDuration || 60;
        document.getElementById('emp-break-minutes').value = breakMinutes;

        // 残業時間をセット
        document.getElementById('emp-overtime-minutes').value = data.overtimeMinutes || 0;

        // 現場名をセット
        await populateEmployeeSiteSelector();
        document.getElementById('emp-site-name').value = data.siteName || '';

        // メモをセット
        document.getElementById('emp-notes').value = data.notes || '';

        // 計算プレビューを更新
        updateEmployeeCalculationPreview();

        // 勤務タイプに応じて入力欄の表示/非表示を切り替え
        toggleEmployeeTimeInputs();

        // モーダルを表示
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

    } catch (error) {
        console.error('モーダル表示エラー:', error);
        alert('記録の読み込みに失敗しました');
    }
}

/**
 * 従業員用勤怠編集モーダルを閉じる
 */
function closeEmployeeAttendanceModal() {
    const modal = document.getElementById('employee-attendance-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

/**
 * 新規勤怠記録追加モーダルを開く
 */
async function openNewAttendanceModal() {
    const modal = document.getElementById('employee-attendance-modal');
    if (!modal) return;

    try {
        // 新規追加モードを設定
        document.getElementById('emp-attendance-mode').value = 'add';
        document.getElementById('emp-modal-title').textContent = '➕ 勤怠記録の追加';
        document.getElementById('emp-date-group').style.display = 'block';

        // フォームをリセット
        document.getElementById('emp-attendance-id').value = '';

        // デフォルトで今日の日付を設定（日本時間）
        const today = getTodayJST();
        document.getElementById('emp-attendance-date').value = today;

        // 勤務タイプを「出勤」にデフォルト設定（編集画面と同じ項目を表示するため）
        const normalRadio = document.querySelector('input[name="emp-work-type"][value="normal"]');
        if (normalRadio) normalRadio.checked = true;

        // 時刻をデフォルト値に
        document.getElementById('emp-start-time').value = '08:00';
        document.getElementById('emp-end-time').value = '17:00';
        document.getElementById('emp-break-minutes').value = '60';
        document.getElementById('emp-overtime-minutes').value = '0';

        // 現場セレクターを埋める
        await populateEmployeeSiteSelector();
        document.getElementById('emp-site-name').value = '';

        // メモをクリア
        document.getElementById('emp-notes').value = '';

        // 計算プレビューを更新
        updateEmployeeCalculationPreview();

        // 勤務タイプに応じて入力欄の表示/非表示を切り替え
        toggleEmployeeTimeInputs();

        // モーダルを表示
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

    } catch (error) {
        console.error('モーダル表示エラー:', error);
        alert('モーダルの表示に失敗しました');
    }
}

/**
 * 現場セレクターを埋める
 */
async function populateEmployeeSiteSelector() {
    const selector = document.getElementById('emp-site-name');
    if (!selector) return;

    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) {
            console.error('テナントIDが取得できません');
            return;
        }

        const sites = await window.getTenantSites(tenantId);

        let html = '<option value="">選択してください</option>';
        sites.filter(s => s.active !== false).forEach(site => {
            html += `<option value="${site.name}">${site.name}</option>`;
        });

        selector.innerHTML = html;

    } catch (error) {
        console.error('現場リスト取得エラー:', error);
    }
}

/**
 * 勤務タイプに応じて時刻入力欄の表示/非表示を切り替え
 */
function toggleEmployeeTimeInputs() {
    const selectedType = document.querySelector('input[name="emp-work-type"]:checked')?.value;
    const timeInputs = document.getElementById('emp-time-inputs');
    const siteGroup = document.getElementById('emp-site-group');

    const hideTimeTypes = ['absence', 'paid_leave', 'compensatory_leave'];

    if (hideTimeTypes.includes(selectedType)) {
        if (timeInputs) timeInputs.style.display = 'none';
        if (siteGroup) siteGroup.style.display = 'none';
    } else {
        if (timeInputs) timeInputs.style.display = 'block';
        if (siteGroup) siteGroup.style.display = 'block';
    }
}

/**
 * 計算プレビューを更新
 */
function updateEmployeeCalculationPreview() {
    const startTime = document.getElementById('emp-start-time')?.value || '08:00';
    const endTime = document.getElementById('emp-end-time')?.value || '17:00';
    const breakMinutes = parseInt(document.getElementById('emp-break-minutes')?.value) || 0;

    // 実働時間計算
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let startTotalMins = startH * 60 + startM;
    let endTotalMins = endH * 60 + endM;

    // 日をまたぐ場合
    if (endTotalMins <= startTotalMins) {
        endTotalMins += 24 * 60;
    }

    const totalMinutes = endTotalMins - startTotalMins;
    const workingMinutes = Math.max(0, totalMinutes - breakMinutes);
    const overtimeMinutes = Math.max(0, workingMinutes - 480);

    // 表示更新
    const workingH = Math.floor(workingMinutes / 60);
    const workingM = workingMinutes % 60;
    const overtimeH = Math.floor(overtimeMinutes / 60);
    const overtimeM = overtimeMinutes % 60;

    const workingEl = document.getElementById('emp-preview-working');
    const overtimeEl = document.getElementById('emp-preview-overtime');

    if (workingEl) workingEl.textContent = `${workingH}時間${workingM}分`;
    if (overtimeEl) overtimeEl.textContent = `${overtimeH}時間${overtimeM}分`;

    // 残業時間フィールドも自動更新（時刻変更時に残業が正しく反映されるように）
    const overtimeInput = document.getElementById('emp-overtime-minutes');
    if (overtimeInput) {
        overtimeInput.value = overtimeMinutes;
    }
}

/**
 * 従業員用勤怠記録を保存
 */
async function saveEmployeeAttendance() {
    try {
        const mode = document.getElementById('emp-attendance-mode').value;
        const recordId = document.getElementById('emp-attendance-id').value;
        const date = document.getElementById('emp-attendance-date').value;
        const workType = document.querySelector('input[name="emp-work-type"]:checked')?.value || 'normal';

        // 共通で取得する値
        const siteName = document.getElementById('emp-site-name').value;
        const notes = document.getElementById('emp-notes').value;

        // 新規追加モードの場合は日付が必須
        if (mode === 'add' && !date) {
            alert('日付を選択してください');
            return;
        }

        // 編集モードの場合はrecordIdが必須
        if (mode === 'edit' && !recordId) {
            alert('記録IDが見つかりません');
            return;
        }

        const updateData = {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            siteName: siteName,
            notes: notes
        };

        // 勤務タイプによって保存データを変更
        if (workType === 'absence') {
            updateData.specialWorkType = 'absence';
            updateData.status = 'completed';
            updateData.startTime = null;
            updateData.endTime = null;
            updateData.workingMinutes = 0;
            updateData.overtimeMinutes = 0;
            updateData.breakMinutes = 0;
            updateData.isNightWork = false;
            updateData.nightWorkType = 'none';
            updateData.isHolidayWork = false;
        } else if (workType === 'paid_leave') {
            updateData.specialWorkType = 'paid_leave';
            updateData.status = 'completed';
            updateData.startTime = null;
            updateData.endTime = null;
            updateData.workingMinutes = 0;
            updateData.overtimeMinutes = 0;
            updateData.breakMinutes = 0;
            updateData.isNightWork = false;
            updateData.nightWorkType = 'none';
            updateData.isHolidayWork = false;
        } else if (workType === 'compensatory_leave') {
            updateData.specialWorkType = 'compensatory_leave';
            updateData.status = 'completed';
            updateData.startTime = null;
            updateData.endTime = null;
            updateData.workingMinutes = 0;
            updateData.overtimeMinutes = 0;
            updateData.breakMinutes = 0;
            updateData.isNightWork = false;
            updateData.nightWorkType = 'none';
            updateData.isHolidayWork = false;
        } else {
            // 出勤系
            const startTime = document.getElementById('emp-start-time').value + ':00';
            const endTime = document.getElementById('emp-end-time').value + ':00';
            const breakMinutes = parseInt(document.getElementById('emp-break-minutes').value) || 60;
            const manualOvertime = document.getElementById('emp-overtime-minutes').value;

            // 実働時間計算
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            let startTotalMins = startH * 60 + startM;
            let endTotalMins = endH * 60 + endM;
            if (endTotalMins <= startTotalMins) endTotalMins += 24 * 60;

            const totalMinutes = endTotalMins - startTotalMins;
            const workingMinutes = Math.max(0, totalMinutes - breakMinutes);
            const overtimeMinutes = manualOvertime ? parseInt(manualOvertime) : Math.max(0, workingMinutes - 480);

            updateData.startTime = startTime;
            updateData.endTime = endTime;
            updateData.breakMinutes = breakMinutes;
            updateData.breakDuration = breakMinutes;
            updateData.workingMinutes = workingMinutes;
            updateData.overtimeMinutes = overtimeMinutes;
            updateData.status = 'completed';

            // 勤務タイプフラグ
            if (workType === 'holiday_work') {
                updateData.isHolidayWork = true;
                updateData.isNightWork = false;
                updateData.nightWorkType = 'none';
                updateData.specialWorkType = 'holiday_work';
            } else if (workType === 'night_work') {
                updateData.isHolidayWork = false;
                updateData.isNightWork = true;
                updateData.nightWorkType = 'night_only';
                updateData.specialWorkType = 'night_work';
            } else if (workType === 'through_night') {
                updateData.isHolidayWork = false;
                updateData.isNightWork = true;
                updateData.nightWorkType = 'through_night';
                updateData.specialWorkType = 'through_night';
            } else {
                updateData.isHolidayWork = false;
                updateData.isNightWork = false;
                updateData.nightWorkType = 'none';
                updateData.specialWorkType = 'normal';
            }
        }

        // Firestoreに保存
        if (mode === 'add') {
            // 新規追加モード
            const user = firebase.auth().currentUser;
            if (!user) {
                alert('ログインが必要です');
                return;
            }

            const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
            if (!tenantId) {
                alert('テナント情報が取得できません');
                return;
            }

            // 同じ日付の記録が既にあるかチェック
            const existingRecords = await getAttendanceCollection()
                .where('userId', '==', user.uid)
                .where('date', '==', date)
                .get();

            if (!existingRecords.empty) {
                alert('この日付には既に記録があります。編集から修正してください。');
                return;
            }

            // ユーザー情報を取得
            const userDoc = await firebase.firestore()
                .collection('tenants').doc(tenantId)
                .collection('users').doc(user.uid)
                .get();
            const userData = userDoc.exists ? userDoc.data() : {};

            // 新規ドキュメントを作成
            const newData = {
                ...updateData,
                userId: user.uid,
                userName: userData.name || user.displayName || 'Unknown',
                tenantId: tenantId,
                date: date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await getAttendanceCollection().add(newData);
            alert('✅ 勤怠記録を追加しました');
        } else {
            // 編集モード
            await getAttendanceCollection().doc(recordId).update(updateData);
            alert('✅ 勤怠記録を更新しました');
        }

        // モーダルを閉じる
        closeEmployeeAttendanceModal();

        // 一覧を更新
        const monthSelector = document.getElementById('employee-month-selector');
        if (monthSelector) {
            loadMonthlyRecords(monthSelector.value);
        }

    } catch (error) {
        console.error('勤怠保存エラー:', error);
        alert('❌ 保存に失敗しました: ' + error.message);
    }
}

/**
 * 勤怠記録を削除（従業員用）
 * ※ admin.jsのdeleteAttendanceRecordとの衝突を避けるため別名
 */
async function deleteEmployeeAttendanceRecord(recordId) {
    console.log('[deleteEmployeeAttendanceRecord] 呼び出し:', recordId);

    if (!confirm('この勤怠記録を削除しますか？\n削除すると元に戻せません。')) {
        return;
    }

    try {
        await getAttendanceCollection().doc(recordId).delete();
        alert('✅ 勤怠記録を削除しました');

        // 一覧を更新
        const monthSelector = document.getElementById('employee-month-selector');
        if (monthSelector) {
            loadMonthlyRecords(monthSelector.value);
        }
    } catch (error) {
        console.error('勤怠削除エラー:', error);
        alert('❌ 削除に失敗しました: ' + error.message);
    }
}

// イベントリスナー設定
document.addEventListener('DOMContentLoaded', () => {
    // 月選択セレクターの初期化
    setTimeout(initMonthSelector, 500);

    // 勤務タイプ変更時の処理
    document.querySelectorAll('input[name="emp-work-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            toggleEmployeeTimeInputs();
            updateEmployeeCalculationPreview();
        });
    });

    // 時刻変更時の計算プレビュー更新
    ['emp-start-time', 'emp-end-time', 'emp-break-minutes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', updateEmployeeCalculationPreview);
        }
    });
});

// グローバルスコープに公開
window.openEmployeeAttendanceModal = openEmployeeAttendanceModal;
window.openNewAttendanceModal = openNewAttendanceModal;
window.closeEmployeeAttendanceModal = closeEmployeeAttendanceModal;
window.saveEmployeeAttendance = saveEmployeeAttendance;
window.loadMonthlyRecords = loadMonthlyRecords;
window.initMonthSelector = initMonthSelector;
window.deleteEmployeeAttendanceRecord = deleteEmployeeAttendanceRecord;

