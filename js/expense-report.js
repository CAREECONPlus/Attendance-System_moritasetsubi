// expense-report.js - 管理者用経費集計レポート機能

/**
 * 経費レポート機能の初期化
 */
function initExpenseReport() {
    console.log('initExpenseReport: 経費レポート初期化開始');

    // 更新ボタンのイベント
    const refreshBtn = document.getElementById('expense-report-refresh-btn');
    if (refreshBtn && !refreshBtn.hasAttribute('data-listener-set')) {
        refreshBtn.addEventListener('click', loadExpenseReport);
        refreshBtn.setAttribute('data-listener-set', 'true');
        console.log('initExpenseReport: 更新ボタンのイベント登録完了');
    }

    // CSV出力ボタンのイベント（全データ詳細）
    const csvBtn = document.getElementById('expense-report-csv-btn');
    if (csvBtn && !csvBtn.hasAttribute('data-listener-set')) {
        csvBtn.addEventListener('click', exportExpenseReportCSV);
        csvBtn.setAttribute('data-listener-set', 'true');
        console.log('initExpenseReport: メインCSVボタンのイベント登録完了');
    }

    // 従業員別CSV出力ボタンのイベント
    const employeeCsvBtn = document.getElementById('expense-employee-csv-btn');
    if (employeeCsvBtn && !employeeCsvBtn.hasAttribute('data-listener-set')) {
        employeeCsvBtn.addEventListener('click', exportEmployeeExpenseCSV);
        employeeCsvBtn.setAttribute('data-listener-set', 'true');
        console.log('initExpenseReport: 従業員別CSVボタンのイベント登録完了');
    }

    // 現場別CSV出力ボタンのイベント
    const siteCsvBtn = document.getElementById('expense-site-csv-btn');
    if (siteCsvBtn && !siteCsvBtn.hasAttribute('data-listener-set')) {
        siteCsvBtn.addEventListener('click', exportSiteExpenseCSV);
        siteCsvBtn.setAttribute('data-listener-set', 'true');
        console.log('initExpenseReport: 現場別CSVボタンのイベント登録完了');
    }

    // カテゴリー別CSV出力ボタンのイベント
    const categoryCsvBtn = document.getElementById('expense-category-csv-btn');
    if (categoryCsvBtn && !categoryCsvBtn.hasAttribute('data-listener-set')) {
        categoryCsvBtn.addEventListener('click', exportCategoryExpenseCSV);
        categoryCsvBtn.setAttribute('data-listener-set', 'true');
        console.log('initExpenseReport: カテゴリー別CSVボタンのイベント登録完了');
    }

    // 月フィルターのイベント
    const monthFilter = document.getElementById('expense-report-month-filter');
    if (monthFilter && !monthFilter.hasAttribute('data-listener-set')) {
        monthFilter.addEventListener('change', loadExpenseReport);
        monthFilter.setAttribute('data-listener-set', 'true');

        // デフォルトで今月を設定
        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7);
        monthFilter.value = currentMonth;
        console.log('initExpenseReport: 月フィルターのイベント登録完了');
    }

    console.log('initExpenseReport: 経費レポート初期化完了');
}

/**
 * 経費レポートを読み込み
 */
async function loadExpenseReport() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) return;

        // フィルター値を取得
        const monthFilter = document.getElementById('expense-report-month-filter')?.value || '';

        // 経費データを取得
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .get();

        if (snapshot.empty) {
            showNoExpenseData();
            return;
        }

        // 経費データを配列に変換してソート（クライアント側）
        let expenses = [];
        snapshot.forEach(doc => {
            expenses.push({ id: doc.id, ...doc.data() });
        });

        // 日付降順でソート
        expenses.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            return dateB.localeCompare(dateA);
        });

        // 月フィルターを適用
        if (monthFilter) {
            expenses = expenses.filter(expense => {
                return expense.date && expense.date.startsWith(monthFilter);
            });
        }

        if (expenses.length === 0) {
            showNoExpenseData();
            return;
        }

        // 集計処理
        generateExpenseReport(expenses);

    } catch (error) {
        console.error('経費レポート読み込みエラー:', error);
        alert('経費レポートの読み込みに失敗しました');
    }
}

/**
 * データがない場合の表示
 */
function showNoExpenseData() {
    document.getElementById('expense-report-total').textContent = '¥0';
    document.getElementById('expense-report-count').textContent = '0件';
    document.getElementById('expense-report-employees').textContent = '0名';

    const noDataMessage = '<tr><td colspan="7" class="no-data">該当する経費データがありません</td></tr>';
    document.getElementById('expense-report-employee-data').innerHTML = noDataMessage;
    document.getElementById('expense-report-site-data').innerHTML = noDataMessage;
    document.getElementById('expense-report-category-data').innerHTML = '<tr><td colspan="4" class="no-data">該当する経費データがありません</td></tr>';
}

/**
 * 経費レポートを生成
 */
function generateExpenseReport(expenses) {
    // サマリー計算
    const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const uniqueEmployees = new Set(expenses.map(exp => exp.userId)).size;

    // サマリー表示を更新
    document.getElementById('expense-report-total').textContent = '¥' + totalAmount.toLocaleString('ja-JP');
    document.getElementById('expense-report-count').textContent = expenses.length + '件';
    document.getElementById('expense-report-employees').textContent = uniqueEmployees + '名';

    // 従業員別集計
    generateEmployeeReport(expenses);

    // 現場別集計
    generateSiteReport(expenses);

    // カテゴリー別集計
    generateCategoryReport(expenses);
}

/**
 * 従業員別集計レポート
 */
function generateEmployeeReport(expenses) {
    const employeeData = {};

    expenses.forEach(exp => {
        const employeeKey = exp.userId || 'unknown';
        const employeeName = exp.userEmail || '不明';

        if (!employeeData[employeeKey]) {
            employeeData[employeeKey] = {
                name: employeeName,
                count: 0,
                parking: 0,
                tools: 0,
                highway: 0,
                other: 0,
                total: 0
            };
        }

        employeeData[employeeKey].count++;
        employeeData[employeeKey].total += exp.amount || 0;

        // カテゴリー別集計
        switch (exp.category) {
            case 'parking':
                employeeData[employeeKey].parking += exp.amount || 0;
                break;
            case 'tools':
                employeeData[employeeKey].tools += exp.amount || 0;
                break;
            case 'highway':
                employeeData[employeeKey].highway += exp.amount || 0;
                break;
            case 'other':
                employeeData[employeeKey].other += exp.amount || 0;
                break;
        }
    });

    // テーブル行を生成
    const tbody = document.getElementById('expense-report-employee-data');
    const rows = Object.values(employeeData)
        .sort((a, b) => b.total - a.total)
        .map(emp => `
            <tr>
                <td>${escapeHtml(emp.name)}</td>
                <td>${emp.count}件</td>
                <td>¥${emp.parking.toLocaleString('ja-JP')}</td>
                <td>¥${emp.tools.toLocaleString('ja-JP')}</td>
                <td>¥${emp.highway.toLocaleString('ja-JP')}</td>
                <td>¥${emp.other.toLocaleString('ja-JP')}</td>
                <td>¥${emp.total.toLocaleString('ja-JP')}</td>
            </tr>
        `).join('');

    tbody.innerHTML = rows || '<tr><td colspan="7" class="no-data">データがありません</td></tr>';
}

/**
 * 現場別集計レポート
 */
function generateSiteReport(expenses) {
    const siteData = {};

    expenses.forEach(exp => {
        const siteName = exp.siteName || '不明';

        if (!siteData[siteName]) {
            siteData[siteName] = {
                count: 0,
                parking: 0,
                tools: 0,
                highway: 0,
                other: 0,
                total: 0
            };
        }

        siteData[siteName].count++;
        siteData[siteName].total += exp.amount || 0;

        // カテゴリー別集計
        switch (exp.category) {
            case 'parking':
                siteData[siteName].parking += exp.amount || 0;
                break;
            case 'tools':
                siteData[siteName].tools += exp.amount || 0;
                break;
            case 'highway':
                siteData[siteName].highway += exp.amount || 0;
                break;
            case 'other':
                siteData[siteName].other += exp.amount || 0;
                break;
        }
    });

    // テーブル行を生成
    const tbody = document.getElementById('expense-report-site-data');
    const rows = Object.entries(siteData)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([siteName, data]) => `
            <tr>
                <td>${escapeHtml(siteName)}</td>
                <td>${data.count}件</td>
                <td>¥${data.parking.toLocaleString('ja-JP')}</td>
                <td>¥${data.tools.toLocaleString('ja-JP')}</td>
                <td>¥${data.highway.toLocaleString('ja-JP')}</td>
                <td>¥${data.other.toLocaleString('ja-JP')}</td>
                <td>¥${data.total.toLocaleString('ja-JP')}</td>
            </tr>
        `).join('');

    tbody.innerHTML = rows || '<tr><td colspan="7" class="no-data">データがありません</td></tr>';
}

/**
 * カテゴリー別集計レポート
 */
function generateCategoryReport(expenses) {
    const categoryData = {
        'parking': { name: '🅿️ 駐車場代', count: 0, total: 0 },
        'tools': { name: '🔧 工具代', count: 0, total: 0 },
        'highway': { name: '🛣️ 高速代', count: 0, total: 0 },
        'other': { name: '📝 その他', count: 0, total: 0 }
    };

    expenses.forEach(exp => {
        const category = exp.category || 'other';
        if (categoryData[category]) {
            categoryData[category].count++;
            categoryData[category].total += exp.amount || 0;
        }
    });

    // 総額を計算
    const totalAmount = Object.values(categoryData).reduce((sum, cat) => sum + cat.total, 0);

    // テーブル行を生成
    const tbody = document.getElementById('expense-report-category-data');
    const rows = Object.values(categoryData)
        .filter(cat => cat.total > 0)
        .sort((a, b) => b.total - a.total)
        .map(cat => {
            const percentage = totalAmount > 0 ? ((cat.total / totalAmount) * 100).toFixed(1) : 0;
            return `
                <tr>
                    <td>${cat.name}</td>
                    <td>${cat.count}件</td>
                    <td>¥${cat.total.toLocaleString('ja-JP')}</td>
                    <td>${percentage}%</td>
                </tr>
            `;
        }).join('');

    tbody.innerHTML = rows || '<tr><td colspan="4" class="no-data">データがありません</td></tr>';
}

/**
 * CSV出力機能
 */
async function exportExpenseReportCSV() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) return;

        // フィルター値を取得
        const monthFilter = document.getElementById('expense-report-month-filter')?.value || '';

        // 経費データを取得
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .get();

        if (snapshot.empty) {
            alert('出力するデータがありません');
            return;
        }

        // 経費データを配列に変換してソート（クライアント側）
        let expenses = [];
        snapshot.forEach(doc => {
            expenses.push({ id: doc.id, ...doc.data() });
        });

        // 日付降順でソート
        expenses.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            return dateB.localeCompare(dateA);
        });

        // 月フィルターを適用
        if (monthFilter) {
            expenses = expenses.filter(expense => {
                return expense.date && expense.date.startsWith(monthFilter);
            });
        }

        if (expenses.length === 0) {
            alert('出力するデータがありません');
            return;
        }

        // CSV生成
        let csvContent = '\uFEFF'; // BOM for Excel
        csvContent += '日付,従業員,現場名,経費項目,金額,説明\n';

        expenses.forEach(exp => {
            const categoryName = getCategoryDisplayName(exp.category);
            const row = [
                exp.date || '',
                exp.userEmail || '',
                exp.siteName || '',
                categoryName,
                exp.amount || 0,
                (exp.description || '').replace(/"/g, '""')
            ].map(field => `"${field}"`).join(',');

            csvContent += row + '\n';
        });

        // ファイル名を生成
        const filename = `経費レポート_${monthFilter || '全期間'}_${new Date().toISOString().slice(0, 10)}.csv`;

        // ダウンロード
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();

        alert('CSV出力が完了しました');

    } catch (error) {
        console.error('CSV出力エラー:', error);
        alert('CSV出力に失敗しました');
    }
}

/**
 * 従業員別集計CSV出力
 */
async function exportEmployeeExpenseCSV() {
    console.log('[exportEmployeeExpenseCSV] 関数呼び出し開始');
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        console.log('[exportEmployeeExpenseCSV] tenantId:', tenantId);
        if (!tenantId) {
            console.error('[exportEmployeeExpenseCSV] テナントIDが取得できません');
            alert('テナントIDが取得できません');
            return;
        }

        const monthFilter = document.getElementById('expense-report-month-filter')?.value || '';

        // 経費データを取得
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .get();

        if (snapshot.empty) {
            alert('出力するデータがありません');
            return;
        }

        let expenses = [];
        snapshot.forEach(doc => {
            expenses.push({ id: doc.id, ...doc.data() });
        });

        // 月フィルターを適用
        if (monthFilter) {
            expenses = expenses.filter(expense => expense.date && expense.date.startsWith(monthFilter));
        }

        if (expenses.length === 0) {
            alert('出力するデータがありません');
            return;
        }

        // 従業員別に集計
        const employeeData = {};
        expenses.forEach(exp => {
            const employeeKey = exp.userId || 'unknown';
            const employeeName = exp.userEmail || '不明';

            if (!employeeData[employeeKey]) {
                employeeData[employeeKey] = {
                    name: employeeName,
                    count: 0,
                    parking: 0,
                    tools: 0,
                    highway: 0,
                    other: 0,
                    total: 0
                };
            }

            employeeData[employeeKey].count++;
            employeeData[employeeKey].total += exp.amount || 0;

            switch (exp.category) {
                case 'parking': employeeData[employeeKey].parking += exp.amount || 0; break;
                case 'tools': employeeData[employeeKey].tools += exp.amount || 0; break;
                case 'highway': employeeData[employeeKey].highway += exp.amount || 0; break;
                case 'other': employeeData[employeeKey].other += exp.amount || 0; break;
            }
        });

        // CSV生成
        let csvContent = '\uFEFF';
        csvContent += '従業員,件数,駐車場代,工具代,高速代,その他,合計金額\n';

        Object.values(employeeData)
            .sort((a, b) => b.total - a.total)
            .forEach(emp => {
                const row = [
                    emp.name,
                    emp.count,
                    emp.parking,
                    emp.tools,
                    emp.highway,
                    emp.other,
                    emp.total
                ].map(field => `"${field}"`).join(',');
                csvContent += row + '\n';
            });

        // ダウンロード
        const filename = `経費_従業員別集計_${monthFilter || '全期間'}_${new Date().toISOString().slice(0, 10)}.csv`;
        console.log('[exportEmployeeExpenseCSV] ファイル名:', filename);
        console.log('[exportEmployeeExpenseCSV] 集計データ件数:', Object.keys(employeeData).length);

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();

        console.log('[exportEmployeeExpenseCSV] CSV出力完了');
        alert('従業員別集計CSVを出力しました');

    } catch (error) {
        console.error('[exportEmployeeExpenseCSV] エラー:', error);
        console.error('[exportEmployeeExpenseCSV] エラー詳細:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        alert('CSV出力に失敗しました: ' + error.message);
    }
}

/**
 * 現場別集計CSV出力
 */
async function exportSiteExpenseCSV() {
    console.log('[exportSiteExpenseCSV] 関数呼び出し開始');
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        console.log('[exportSiteExpenseCSV] tenantId:', tenantId);
        if (!tenantId) {
            console.error('[exportSiteExpenseCSV] テナントIDが取得できません');
            alert('テナントIDが取得できません');
            return;
        }

        const monthFilter = document.getElementById('expense-report-month-filter')?.value || '';

        // 経費データを取得
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .get();

        if (snapshot.empty) {
            alert('出力するデータがありません');
            return;
        }

        let expenses = [];
        snapshot.forEach(doc => {
            expenses.push({ id: doc.id, ...doc.data() });
        });

        // 月フィルターを適用
        if (monthFilter) {
            expenses = expenses.filter(expense => expense.date && expense.date.startsWith(monthFilter));
        }

        if (expenses.length === 0) {
            alert('出力するデータがありません');
            return;
        }

        // 現場別に集計
        const siteData = {};
        expenses.forEach(exp => {
            const siteName = exp.siteName || '不明';

            if (!siteData[siteName]) {
                siteData[siteName] = {
                    count: 0,
                    parking: 0,
                    tools: 0,
                    highway: 0,
                    other: 0,
                    total: 0
                };
            }

            siteData[siteName].count++;
            siteData[siteName].total += exp.amount || 0;

            switch (exp.category) {
                case 'parking': siteData[siteName].parking += exp.amount || 0; break;
                case 'tools': siteData[siteName].tools += exp.amount || 0; break;
                case 'highway': siteData[siteName].highway += exp.amount || 0; break;
                case 'other': siteData[siteName].other += exp.amount || 0; break;
            }
        });

        // CSV生成
        let csvContent = '\uFEFF';
        csvContent += '現場名,件数,駐車場代,工具代,高速代,その他,合計金額\n';

        Object.entries(siteData)
            .sort((a, b) => b[1].total - a[1].total)
            .forEach(([siteName, data]) => {
                const row = [
                    siteName,
                    data.count,
                    data.parking,
                    data.tools,
                    data.highway,
                    data.other,
                    data.total
                ].map(field => `"${field}"`).join(',');
                csvContent += row + '\n';
            });

        // ダウンロード
        const filename = `経費_現場別集計_${monthFilter || '全期間'}_${new Date().toISOString().slice(0, 10)}.csv`;
        console.log('[exportSiteExpenseCSV] ファイル名:', filename);
        console.log('[exportSiteExpenseCSV] 集計データ件数:', Object.keys(siteData).length);

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();

        console.log('[exportSiteExpenseCSV] CSV出力完了');
        alert('現場別集計CSVを出力しました');

    } catch (error) {
        console.error('[exportSiteExpenseCSV] エラー:', error);
        console.error('[exportSiteExpenseCSV] エラー詳細:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        alert('CSV出力に失敗しました: ' + error.message);
    }
}

/**
 * カテゴリー別（月次）集計CSV出力
 */
async function exportCategoryExpenseCSV() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) {
            alert('テナントIDが取得できません');
            return;
        }

        const monthFilter = document.getElementById('expense-report-month-filter')?.value || '';

        // 経費データを取得
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .get();

        if (snapshot.empty) {
            alert('出力するデータがありません');
            return;
        }

        let expenses = [];
        snapshot.forEach(doc => {
            expenses.push({ id: doc.id, ...doc.data() });
        });

        // 月フィルターを適用
        if (monthFilter) {
            expenses = expenses.filter(expense => expense.date && expense.date.startsWith(monthFilter));
        }

        if (expenses.length === 0) {
            alert('出力するデータがありません');
            return;
        }

        // カテゴリー別に集計
        const categoryData = {
            'parking': { name: '駐車場代', count: 0, total: 0 },
            'tools': { name: '工具代', count: 0, total: 0 },
            'highway': { name: '高速代', count: 0, total: 0 },
            'other': { name: 'その他', count: 0, total: 0 }
        };

        expenses.forEach(exp => {
            const category = exp.category || 'other';
            if (categoryData[category]) {
                categoryData[category].count++;
                categoryData[category].total += exp.amount || 0;
            }
        });

        // 総額を計算
        const totalAmount = Object.values(categoryData).reduce((sum, cat) => sum + cat.total, 0);

        // CSV生成
        let csvContent = '\uFEFF';
        csvContent += 'カテゴリー,件数,合計金額,割合\n';

        Object.values(categoryData)
            .filter(cat => cat.total > 0)
            .sort((a, b) => b.total - a.total)
            .forEach(cat => {
                const percentage = totalAmount > 0 ? ((cat.total / totalAmount) * 100).toFixed(1) : 0;
                const row = [
                    cat.name,
                    cat.count,
                    cat.total,
                    percentage + '%'
                ].map(field => `"${field}"`).join(',');
                csvContent += row + '\n';
            });

        // ダウンロード
        const filename = `経費_カテゴリー別集計_${monthFilter || '全期間'}_${new Date().toISOString().slice(0, 10)}.csv`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();

        alert('カテゴリー別集計CSVを出力しました');

    } catch (error) {
        console.error('カテゴリー別CSV出力エラー:', error);
        alert('CSV出力に失敗しました');
    }
}

/**
 * カテゴリー表示名を取得
 */
function getCategoryDisplayName(category) {
    const categories = {
        'parking': '駐車場代',
        'tools': '工具代',
        'highway': '高速代',
        'other': 'その他'
    };
    return categories[category] || category;
}

/**
 * HTMLエスケープ関数
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// グローバルスコープに公開
window.initExpenseReport = initExpenseReport;
window.loadExpenseReport = loadExpenseReport;
window.exportExpenseReportCSV = exportExpenseReportCSV;
window.exportEmployeeExpenseCSV = exportEmployeeExpenseCSV;
window.exportSiteExpenseCSV = exportSiteExpenseCSV;
window.exportCategoryExpenseCSV = exportCategoryExpenseCSV;
