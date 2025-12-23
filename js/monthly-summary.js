/**
 * monthly-summary.js - 月次勤怠集計モジュール
 *
 * 既存の勤怠データを月次で集計し、以下の区分で時間を分類:
 * - 通常勤務時間
 * - 夜間勤務時間（20:00以降出勤）
 * - 通し夜間時間（昼出勤→深夜退勤）
 * - 休日出勤時間
 * - 残業時間（8h超過分）
 */

// ========================================
// 月次集計のメイン関数
// ========================================

/**
 * 指定月の勤怠データを従業員ごとに集計
 * @param {string} yearMonth - 対象年月（YYYY-MM形式）
 * @returns {Promise<Array>} 従業員ごとの集計結果
 */
async function calculateMonthlySummary(yearMonth) {
    try {
        logger.log(`📊 月次集計開始: ${yearMonth}`);

        // 1. 対象月の勤怠データを取得
        const attendanceData = await fetchMonthlyAttendanceData(yearMonth);
        logger.log(`  取得件数: ${attendanceData.length}件`);

        if (attendanceData.length === 0) {
            return [];
        }

        // 2. 従業員情報を取得してマッピング
        const userMap = await fetchUserMap();

        // 3. 従業員ごとにグループ化
        const groupedByUser = groupAttendanceByUser(attendanceData);

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
 * @param {string} yearMonth - YYYY-MM形式
 * @returns {Promise<Array>} 勤怠データ配列
 */
async function fetchMonthlyAttendanceData(yearMonth) {
    try {
        // 月の開始日と終了日を計算
        const startDate = `${yearMonth}-01`;
        const [year, month] = yearMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

        logger.log(`  期間: ${startDate} 〜 ${endDate}`);

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
                email: data.email || ''
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

    let workDays = 0;           // 出勤日数
    let paidLeaveDays = 0;      // 有給日数
    let compensatoryDays = 0;   // 代休日数

    records.forEach(record => {
        // 有給・代休の場合
        if (record.specialWorkType === 'paid_leave') {
            paidLeaveDays++;
            return;
        }
        if (record.specialWorkType === 'compensatory_leave') {
            compensatoryDays++;
            return;
        }

        // 実働時間がない場合はスキップ
        const workingMins = record.workingMinutes || 0;
        if (workingMins === 0) return;

        workDays++;

        // 残業時間の集計（8h超過分）
        const overtimeMins = record.overtimeMinutes || 0;
        overtimeMinutes += overtimeMins;

        // 基本労働時間（残業を除いた分）
        const baseWorkingMins = workingMins - overtimeMins;

        // 勤務区分による分類
        if (record.isHolidayWork) {
            // 休日出勤
            holidayMinutes += baseWorkingMins;
        } else if (record.nightWorkType === 'through_night') {
            // 通し夜間
            throughNightMinutes += baseWorkingMins;
        } else if (record.nightWorkType === 'night_only') {
            // 夜間のみ
            nightOnlyMinutes += baseWorkingMins;
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

        // 勤務時間（時間単位）
        normalHours: toHours(normalMinutes),
        nightOnlyHours: toHours(nightOnlyMinutes),
        throughNightHours: toHours(throughNightMinutes),
        holidayHours: toHours(holidayMinutes),
        overtimeHours: toHours(overtimeMinutes),

        // 合計時間
        totalHours: toHours(normalMinutes + nightOnlyMinutes + throughNightMinutes + holidayMinutes + overtimeMinutes),

        // 日数
        workDays: workDays,
        paidLeaveDays: paidLeaveDays,
        compensatoryDays: compensatoryDays,

        // 生データ（分単位、デバッグ用）
        _raw: {
            normalMinutes,
            nightOnlyMinutes,
            throughNightMinutes,
            holidayMinutes,
            overtimeMinutes
        }
    };
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 年月のリストを生成（過去12ヶ月）
 * @returns {Array} [{value: 'YYYY-MM', label: 'YYYY年MM月'}, ...]
 */
function generateYearMonthOptions() {
    const options = [];
    const now = new Date();

    for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');

        options.push({
            value: `${year}-${month}`,
            label: `${year}年${date.getMonth() + 1}月`
        });
    }

    return options;
}

/**
 * 現在の年月を取得
 * @returns {string} YYYY-MM形式
 */
function getCurrentYearMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * 集計結果をCSV形式に変換
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
        '合計(h)',
        '出勤日数',
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
        record.totalHours,
        record.workDays,
        record.paidLeaveDays,
        record.compensatoryDays
    ]);

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
    convertToCSV: convertSummaryToCSV
};

// 後方互換性のため個別関数もエクスポート
window.calculateMonthlySummary = calculateMonthlySummary;
window.generateYearMonthOptions = generateYearMonthOptions;
window.getCurrentYearMonth = getCurrentYearMonth;

logger.log('✅ monthly-summary.js 読み込み完了');
