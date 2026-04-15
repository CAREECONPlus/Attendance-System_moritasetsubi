/**
 * monthly-summary.js - 月次勤怠集計モジュール
 *
 * 既存の勤怠データを月次で集計し、以下の区分で時間を分類:
 * - 通常勤務時間
 * - 夜間勤務時間（20:00以降出勤）
 * - 通し夜間時間（昼出勤→深夜退勤）
 * - 休日出勤時間
 * - 残業時間（8h超過分）
 *
 * 【20日締め対応】
 * - 集計期間: 前月21日〜当月20日
 * - 例: 2025年1月度 = 2024/12/21 〜 2025/1/20
 */

// ========================================
// 20日締め用ユーティリティ
// ========================================

/**
 * 20日締めの期間文字列を取得
 * @param {string} yearMonth - YYYY-MM形式
 * @returns {Object} { startDate, endDate, periodLabel }
 */
function get20thCutoffPeriod(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);

    // 開始日: 前月21日
    let startYear = year;
    let startMonth = month - 1;
    if (startMonth === 0) {
        startMonth = 12;
        startYear = year - 1;
    }
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-21`;

    // 終了日: 当月20日
    const endDate = `${year}-${String(month).padStart(2, '0')}-20`;

    // 表示用ラベル
    const periodLabel = `${year}年${month}月度 (${startYear}/${startMonth}/21〜${year}/${month}/20)`;

    return { startDate, endDate, periodLabel };
}

// ========================================
// 月次集計のメイン関数
// ========================================

/**
 * 指定月の勤怠データを従業員ごとに集計
 * @param {string} yearMonth - 対象年月（YYYY-MM形式）
 * @param {Object} filters - フィルターオプション
 * @param {string} filters.employeeId - 特定の従業員IDでフィルター
 * @param {string} filters.siteName - 特定の現場名でフィルター
 * @returns {Promise<Array>} 従業員ごとの集計結果
 */
async function calculateMonthlySummary(yearMonth, filters = {}) {
    try {
        logger.log(`📊 月次集計開始: ${yearMonth}`);
        if (filters.employeeId) logger.log(`  従業員フィルター: ${filters.employeeId}`);
        if (filters.siteName) logger.log(`  現場フィルター: ${filters.siteName}`);

        // 1. 対象月の勤怠データを取得
        let attendanceData = await fetchMonthlyAttendanceData(yearMonth);
        logger.log(`  取得件数: ${attendanceData.length}件`);

        if (attendanceData.length === 0) {
            return [];
        }

        // 1.5 現場フィルターを適用
        if (filters.siteName) {
            attendanceData = attendanceData.filter(record => record.siteName === filters.siteName);
            logger.log(`  現場フィルター後: ${attendanceData.length}件`);
        }

        if (attendanceData.length === 0) {
            return [];
        }

        // 2. 従業員情報を取得してマッピング
        const userMap = await fetchUserMap();

        // 3. 従業員ごとにグループ化
        let groupedByUser = groupAttendanceByUser(attendanceData);

        // 3.5 従業員フィルターを適用
        if (filters.employeeId) {
            const filteredGroup = {};
            if (groupedByUser[filters.employeeId]) {
                filteredGroup[filters.employeeId] = groupedByUser[filters.employeeId];
            }
            groupedByUser = filteredGroup;
            logger.log(`  従業員フィルター後: ${Object.keys(groupedByUser).length}名`);
        }

        // 4. 各従業員の勤務時間を集計
        const summaryResults = [];

        for (const [userId, records] of Object.entries(groupedByUser)) {
            const userInfo = userMap[userId] || { displayName: '不明', email: '' };
            const summary = aggregateWorkHours(records, userInfo);
            summaryResults.push(summary);
        }

        // 5. 従業員名でソート
        summaryResults.sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ja'));

        logger.log(`📊 月次集計完了: ${summaryResults.length}名`);
        return summaryResults;

    } catch (error) {
        console.error('月次集計エラー:', error);
        throw error;
    }
}

// ========================================
// データ取得関数
// ========================================

/**
 * 指定月の勤怠データをFirestoreから取得
 * 20日締め対応: 前月21日〜当月20日の期間で集計
 * @param {string} yearMonth - YYYY-MM形式（締め月を指定）
 * @returns {Promise<Array>} 勤怠データ配列
 */
async function fetchMonthlyAttendanceData(yearMonth) {
    try {
        // 20日締め: 前月21日〜当月20日
        const [year, month] = yearMonth.split('-').map(Number);

        // 開始日: 前月21日
        let startYear = year;
        let startMonth = month - 1;
        if (startMonth === 0) {
            startMonth = 12;
            startYear = year - 1;
        }
        const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-21`;

        // 終了日: 当月20日
        const endDate = `${year}-${String(month).padStart(2, '0')}-20`;

        logger.log(`  期間（20日締め）: ${startDate} 〜 ${endDate}`);

        // テナント対応のコレクション取得
        const attendanceCollection = window.getTenantFirestore
            ? window.getTenantFirestore('attendance')
            : firebase.firestore().collection('attendance');

        // 日付範囲でクエリ
        const snapshot = await attendanceCollection
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'asc')
            .get();

        const data = [];
        snapshot.forEach(doc => {
            data.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return data;

    } catch (error) {
        console.error('月次勤怠データ取得エラー:', error);
        throw error;
    }
}

/**
 * ユーザー情報のマップを取得
 * @returns {Promise<Object>} userId → userInfo のマップ
 */
async function fetchUserMap() {
    try {
        const usersCollection = window.getUserCollection
            ? window.getUserCollection()
            : firebase.firestore().collection('users');

        const snapshot = await usersCollection.get();

        const userMap = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            userMap[doc.id] = {
                displayName: data.displayName || data.name || '',
                email: data.email || '',
                employeeCode: data.employeeCode || ''
            };
        });

        return userMap;

    } catch (error) {
        console.error('ユーザー情報取得エラー:', error);
        return {};
    }
}

// ========================================
// 集計ロジック
// ========================================

/**
 * 勤怠データを従業員ごとにグループ化
 * @param {Array} attendanceData - 勤怠データ配列
 * @returns {Object} userId → records[] のマップ
 */
function groupAttendanceByUser(attendanceData) {
    const grouped = {};

    attendanceData.forEach(record => {
        const userId = record.userId || record.uid;
        if (!userId) return;

        if (!grouped[userId]) {
            grouped[userId] = [];
        }
        grouped[userId].push(record);
    });

    return grouped;
}

/**
 * 1従業員の勤務時間を区分ごとに集計
 * @param {Array} records - 勤怠レコード配列
 * @param {Object} userInfo - ユーザー情報
 * @returns {Object} 集計結果
 */
function aggregateWorkHours(records, userInfo) {
    // 集計用の変数（分単位）
    let normalMinutes = 0;      // 通常勤務
    let nightOnlyMinutes = 0;   // 夜間のみ
    let throughNightMinutes = 0; // 通し夜間
    let holidayMinutes = 0;     // 休日出勤
    let overtimeMinutes = 0;    // 残業時間
    let breakMinutes = 0;       // 休憩時間

    // 日数カウント
    let workDays = 0;           // 出勤日数
    let paidLeaveDays = 0;      // 有給日数
    let compensatoryDays = 0;   // 代休日数
    let absenceDays = 0;        // 欠勤日数
    let holidayWorkDays = 0;    // 休日出勤日数
    let nightWorkDays = 0;      // 夜間勤務日数
    let throughNightDays = 0;   // 通し夜間日数

    records.forEach(record => {
        // 有給の場合
        if (record.specialWorkType === 'paid_leave') {
            paidLeaveDays++;
            return;
        }
        // 代休の場合
        if (record.specialWorkType === 'compensatory_leave') {
            compensatoryDays++;
            return;
        }
        // 欠勤の場合
        if (record.specialWorkType === 'absence') {
            absenceDays++;
            return;
        }

        // 実働時間がない場合はスキップ
        const workingMins = record.workingMinutes || 0;
        if (workingMins === 0) return;

        workDays++;

        // 休憩時間の集計
        const breakMins = record.breakDuration || record.breakMinutes || 0;
        breakMinutes += breakMins;

        // 残業時間の集計（8h超過分）
        // overtimeMinutesが未定義/null、または0で実働8時間超の場合は再計算
        let overtimeMins = record.overtimeMinutes;
        const expectedOvertime = Math.max(0, workingMins - 480);
        if (overtimeMins === undefined || overtimeMins === null ||
            (overtimeMins === 0 && expectedOvertime > 0)) {
            overtimeMins = expectedOvertime;
        }
        overtimeMinutes += overtimeMins;

        // 基本労働時間（残業を除いた分）
        const baseWorkingMins = workingMins - overtimeMins;

        // 勤務区分による分類（時間と日数両方カウント）
        if (record.isHolidayWork) {
            // 休日出勤
            holidayMinutes += baseWorkingMins;
            holidayWorkDays++;
        } else if (record.nightWorkType === 'through_night') {
            // 通し夜間
            throughNightMinutes += baseWorkingMins;
            throughNightDays++;
        } else if (record.nightWorkType === 'night_only' || record.isNightWork) {
            // 夜間のみ
            nightOnlyMinutes += baseWorkingMins;
            nightWorkDays++;
        } else {
            // 通常勤務
            normalMinutes += baseWorkingMins;
        }
    });

    // 時間に変換（小数点1桁）
    const toHours = (minutes) => Math.round(minutes / 60 * 10) / 10;

    return {
        // 従業員情報
        userId: records[0]?.userId || records[0]?.uid || '',
        employeeName: userInfo.displayName || '不明',
        email: userInfo.email || '',
        employeeCode: userInfo.employeeCode || '',

        // 勤務時間（時間単位）
        normalHours: toHours(normalMinutes),
        nightOnlyHours: toHours(nightOnlyMinutes),
        throughNightHours: toHours(throughNightMinutes),
        holidayHours: toHours(holidayMinutes),
        overtimeHours: toHours(overtimeMinutes),
        breakHours: toHours(breakMinutes),

        // 合計時間
        totalHours: toHours(normalMinutes + nightOnlyMinutes + throughNightMinutes + holidayMinutes + overtimeMinutes),

        // 日数（従来）
        workDays: workDays,
        paidLeaveDays: paidLeaveDays,
        compensatoryDays: compensatoryDays,

        // 日数（新規追加 - 弥生用）
        absenceDays: absenceDays,
        holidayWorkDays: holidayWorkDays,
        nightWorkDays: nightWorkDays,
        throughNightDays: throughNightDays,

        // 生データ（分単位、デバッグ用）
        _raw: {
            normalMinutes,
            nightOnlyMinutes,
            throughNightMinutes,
            holidayMinutes,
            overtimeMinutes,
            breakMinutes
        }
    };
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 年月のリストを生成（過去12ヶ月）
 * 20日締め対応: ラベルに期間を表示
 * @returns {Array} [{value: 'YYYY-MM', label: 'YYYY年MM月度 (MM/21-MM/20)'}, ...]
 */
function generateYearMonthOptions() {
    const options = [];
    const now = new Date();

    // 現在の締め月を計算（21日以降は翌月度）
    let currentPeriodMonth = now.getMonth() + 1; // 1-12
    let currentPeriodYear = now.getFullYear();
    if (now.getDate() >= 21) {
        currentPeriodMonth++;
        if (currentPeriodMonth > 12) {
            currentPeriodMonth = 1;
            currentPeriodYear++;
        }
    }

    for (let i = 0; i < 12; i++) {
        let targetMonth = currentPeriodMonth - i;
        let targetYear = currentPeriodYear;

        while (targetMonth <= 0) {
            targetMonth += 12;
            targetYear--;
        }

        const month = String(targetMonth).padStart(2, '0');

        // 前月を計算（期間表示用）
        let prevMonth = targetMonth - 1;
        let prevYear = targetYear;
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear--;
        }

        options.push({
            value: `${targetYear}-${month}`,
            label: `${targetYear}年${targetMonth}月度 (${prevMonth}/21-${targetMonth}/20)`
        });
    }

    return options;
}

/**
 * 現在の締め月を取得（20日締め対応）
 * 21日以降は翌月度として扱う
 * @returns {string} YYYY-MM形式
 */
function getCurrentYearMonth() {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1; // 1-12

    // 21日以降は翌月度
    if (now.getDate() >= 21) {
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }

    return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * 集計結果をCSV形式に変換（生データ形式）
 * @param {Array} summaryData - 集計結果
 * @param {string} yearMonth - 対象年月
 * @returns {string} CSV文字列
 */
function convertSummaryToCSV(summaryData, yearMonth) {
    const headers = [
        '従業員名',
        'メールアドレス',
        '通常勤務(h)',
        '夜間勤務(h)',
        '通し夜間(h)',
        '休日出勤(h)',
        '残業(h)',
        '休憩(h)',
        '合計(h)',
        '出勤日数',
        '休日出勤日数',
        '夜間勤務日数',
        '通し夜間日数',
        '欠勤日数',
        '有給日数',
        '代休日数'
    ];

    const rows = summaryData.map(record => [
        record.employeeName,
        record.email,
        record.normalHours,
        record.nightOnlyHours,
        record.throughNightHours,
        record.holidayHours,
        record.overtimeHours,
        record.breakHours || 0,
        record.totalHours,
        record.workDays,
        record.holidayWorkDays || 0,
        record.nightWorkDays || 0,
        record.throughNightDays || 0,
        record.absenceDays || 0,
        record.paidLeaveDays,
        record.compensatoryDays
    ]);

    const csvArray = [headers, ...rows];
    return csvArray.map(row =>
        row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

/**
 * 集計結果を弥生給与Next用CSV形式に変換
 * @param {Array} summaryData - 集計結果
 * @param {Object} masterData - マスタデータ（従業員コード用）
 * @returns {string} CSV文字列
 */
function convertSummaryToYayoiCSV(summaryData, masterData = {}) {
    // 弥生給与Next用ヘッダー
    const headers = [
        '従業員コード',
        '出勤日数',
        '休日出勤日数',
        '欠勤日数',
        '残業時間',
        '代休',
        '有給休暇',
        '夜間勤務日数',
        '通し夜間勤務'
    ];

    const rows = summaryData.map(record => {
        // 従業員コード: Firestoreのユーザー情報 > マスタ > 従業員名
        const employeeCode = record.employeeCode ||
                            masterData[record.email]?.employeeCode ||
                            masterData[record.employeeName]?.employeeCode ||
                            record.employeeName;

        // 残業時間を分から時間に変換（小数点1桁）
        const overtimeHours = record.overtimeHours || 0;

        return [
            employeeCode,
            record.workDays || 0,
            record.holidayWorkDays || 0,
            record.absenceDays || 0,
            overtimeHours,
            record.compensatoryDays || 0,
            record.paidLeaveDays || 0,
            record.nightWorkDays || 0,
            record.throughNightDays || 0
        ];
    });

    const csvArray = [headers, ...rows];
    return csvArray.map(row =>
        row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

// ========================================
// グローバルスコープにエクスポート
// ========================================

window.MonthlySummary = {
    calculate: calculateMonthlySummary,
    generateYearMonthOptions: generateYearMonthOptions,
    getCurrentYearMonth: getCurrentYearMonth,
    convertToCSV: convertSummaryToCSV,
    convertToYayoiCSV: convertSummaryToYayoiCSV,
    get20thCutoffPeriod: get20thCutoffPeriod
};

// 後方互換性のため個別関数もエクスポート
window.calculateMonthlySummary = calculateMonthlySummary;
window.generateYearMonthOptions = generateYearMonthOptions;
window.getCurrentYearMonth = getCurrentYearMonth;
window.convertSummaryToYayoiCSV = convertSummaryToYayoiCSV;
window.get20thCutoffPeriod = get20thCutoffPeriod;

logger.log('✅ monthly-summary.js 読み込み完了');
