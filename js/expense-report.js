// expense-report.js - 管理者用経費集計レポート機能

// ===== 経費明細（日別・現場別）用の状態 =====
const EXPENSE_CATEGORIES = ['parking', 'tools', 'highway', 'other'];
const EXPENSE_DETAIL_STRING_FIELDS = ['siteName', 'userName', 'categoryName'];

let expenseReportData = [];        // 月フィルター適用後の経費データ（明細表示・CSV出力で共用）
let expenseUserNameMap = null;     // uid / email → 表示名（テナントのusersから1回だけ取得）
let expenseDetailSort = { field: 'date', dir: 'desc' };

/**
 * 経費レポート機能の初期化
 */
function initExpenseReport() {
    // ===== 経費明細（日別・現場別）のイベント =====
    ['expense-detail-site-filter', 'expense-detail-employee-filter', 'expense-detail-category-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.hasAttribute('data-listener-set')) {
            el.addEventListener('change', renderExpenseDetail);
            el.setAttribute('data-listener-set', 'true');
        }
    });

    const groupMode = document.getElementById('expense-detail-group-mode');
    if (groupMode && !groupMode.hasAttribute('data-listener-set')) {
        groupMode.addEventListener('change', () => {
            // 表示方法が変わると列も変わるので並び順は日付降順に戻す
            expenseDetailSort = { field: 'date', dir: 'desc' };
            renderExpenseDetail();
        });
        groupMode.setAttribute('data-listener-set', 'true');
    }

    const clearBtn = document.getElementById('expense-detail-clear-btn');
    if (clearBtn && !clearBtn.hasAttribute('data-listener-set')) {
        clearBtn.addEventListener('click', clearExpenseDetailFilters);
        clearBtn.setAttribute('data-listener-set', 'true');
    }

    const detailCsvBtn = document.getElementById('expense-detail-csv-btn');
    if (detailCsvBtn && !detailCsvBtn.hasAttribute('data-listener-set')) {
        detailCsvBtn.addEventListener('click', exportExpenseDetailCSV);
        detailCsvBtn.setAttribute('data-listener-set', 'true');
    }

    // 見出しクリックで並べ替え（theadはモードごとに描き直すので委譲で受ける）
    const detailHead = document.getElementById('expense-detail-head');
    if (detailHead && !detailHead.hasAttribute('data-listener-set')) {
        detailHead.addEventListener('click', (e) => {
            const th = e.target.closest('th.sortable');
            if (!th) return;
            const field = th.dataset.sort;
            if (expenseDetailSort.field === field) {
                expenseDetailSort.dir = expenseDetailSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                // 文字列は昇順、日付・金額・件数は降順を初期値にする
                expenseDetailSort = {
                    field,
                    dir: EXPENSE_DETAIL_STRING_FIELDS.includes(field) ? 'asc' : 'desc'
                };
            }
            renderExpenseDetail();
        });
        detailHead.setAttribute('data-listener-set', 'true');
    }

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

        // 従業員名（メールアドレス→表示名）を解決してから描画
        await ensureExpenseUserNames(tenantId);

        // 集計処理
        generateExpenseReport(expenses);

        // 経費明細（日別・現場別）
        expenseReportData = expenses;
        populateExpenseDetailFilters(expenses);
        renderExpenseDetail();

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

    // 経費明細もクリア
    expenseReportData = [];
    populateExpenseDetailFilters([]);
    renderExpenseDetail();
}

// ============================================================
// 経費明細（日別・現場別）
// ============================================================

/**
 * テナントの従業員一覧から uid / email → 表示名 のマップを作る（初回のみ取得）
 * 経費データには userEmail しか入っていないため、画面には勤怠一覧と同じ表示名を出す
 */
async function ensureExpenseUserNames(tenantId) {
    if (expenseUserNameMap) return;
    expenseUserNameMap = {};
    try {
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .get();
        snapshot.forEach(doc => {
            const user = doc.data();
            const name = user.displayName || user.email || '';
            if (!name) return;
            expenseUserNameMap[doc.id] = name;
            if (user.uid) expenseUserNameMap[user.uid] = name;
            if (user.email) expenseUserNameMap[user.email.toLowerCase()] = name;
        });
    } catch (error) {
        // 名前が引けなくてもメールアドレスで表示できるので処理は続行
        console.warn('従業員名の取得に失敗しました（メールアドレスで表示します）:', error);
    }
}

/**
 * 経費データから表示用の従業員名を取得
 */
function getExpenseUserName(exp) {
    const map = expenseUserNameMap || {};
    return map[exp.userId]
        || (exp.userEmail && map[exp.userEmail.toLowerCase()])
        || exp.userEmail
        || '不明';
}

/**
 * 経費データの従業員を一意に識別するキー
 */
function getExpenseUserKey(exp) {
    return exp.userId || exp.userEmail || 'unknown';
}

/**
 * 金額を「¥1,234」形式に
 */
function formatYen(amount) {
    return '¥' + (Number(amount) || 0).toLocaleString('ja-JP');
}

/**
 * 絞り込み用セレクトの選択肢を、読み込んだ経費データから作り直す
 * （選択中の値がまだ存在する場合は維持する）
 */
function populateExpenseDetailFilters(expenses) {
    const fillSelect = (id, options) => {
        const select = document.getElementById(id);
        if (!select) return;
        const previous = select.value;
        select.innerHTML = '<option value="">すべて</option>' + options
            .map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
            .join('');
        if (options.some(opt => opt.value === previous)) {
            select.value = previous;
        }
    };

    const siteNames = [...new Set(expenses.map(exp => exp.siteName || '不明'))]
        .sort((a, b) => a.localeCompare(b, 'ja'));
    fillSelect('expense-detail-site-filter', siteNames.map(name => ({ value: name, label: name })));

    const employees = {};
    expenses.forEach(exp => {
        const key = getExpenseUserKey(exp);
        if (!employees[key]) employees[key] = { value: key, label: getExpenseUserName(exp) };
    });
    fillSelect('expense-detail-employee-filter',
        Object.values(employees).sort((a, b) => a.label.localeCompare(b.label, 'ja')));
}

/**
 * 現在の絞り込み条件を取得
 */
function getExpenseDetailFilters() {
    return {
        site: document.getElementById('expense-detail-site-filter')?.value || '',
        employee: document.getElementById('expense-detail-employee-filter')?.value || '',
        category: document.getElementById('expense-detail-category-filter')?.value || '',
        mode: document.getElementById('expense-detail-group-mode')?.value || 'date-site'
    };
}

/**
 * 絞り込み条件を適用した経費データ
 */
function getFilteredExpenseDetail() {
    const filters = getExpenseDetailFilters();
    return expenseReportData.filter(exp =>
        (!filters.site || (exp.siteName || '不明') === filters.site) &&
        (!filters.employee || getExpenseUserKey(exp) === filters.employee) &&
        (!filters.category || (exp.category || 'other') === filters.category)
    );
}

/**
 * 絞り込みをすべて解除
 */
function clearExpenseDetailFilters() {
    ['expense-detail-site-filter', 'expense-detail-employee-filter', 'expense-detail-category-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderExpenseDetail();
}

/**
 * 日付×現場で小計行を作る
 */
function groupExpensesByDateSite(expenses) {
    const groups = {};
    expenses.forEach(exp => {
        const date = exp.date || '';
        const siteName = exp.siteName || '不明';
        const key = `${date}|${siteName}`;
        if (!groups[key]) {
            groups[key] = {
                date, siteName, count: 0, total: 0,
                parking: 0, tools: 0, highway: 0, other: 0,
                employees: new Set()
            };
        }
        const group = groups[key];
        const amount = Number(exp.amount) || 0;
        const category = EXPENSE_CATEGORIES.includes(exp.category) ? exp.category : 'other';
        group.count++;
        group.total += amount;
        group[category] += amount;
        group.employees.add(getExpenseUserName(exp));
    });
    return Object.values(groups);
}

/**
 * 明細1件ずつの表示用に整形
 */
function toExpenseDetailRows(expenses) {
    return expenses.map(exp => ({
        date: exp.date || '',
        userName: getExpenseUserName(exp),
        siteName: exp.siteName || '不明',
        category: exp.category || 'other',
        categoryName: getCategoryDisplayName(exp.category || 'other'),
        amount: Number(exp.amount) || 0,
        description: exp.description || ''
    }));
}

/**
 * 現在の並び順で並べ替え（同値は日付降順→現場名で安定させる）
 */
function sortExpenseDetailRows(rows) {
    const { field, dir } = expenseDetailSort;
    const sign = dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
        const va = a[field];
        const vb = b[field];
        let cmp;
        if (typeof va === 'number' || typeof vb === 'number') {
            cmp = (Number(va) || 0) - (Number(vb) || 0);
        } else {
            cmp = String(va || '').localeCompare(String(vb || ''), 'ja');
        }
        if (cmp !== 0) return cmp * sign;
        return String(b.date || '').localeCompare(String(a.date || ''))
            || String(a.siteName || '').localeCompare(String(b.siteName || ''), 'ja');
    });
}

/**
 * 経費明細テーブルを描画（絞り込み・並べ替え・合計行）
 */
function renderExpenseDetail() {
    const thead = document.getElementById('expense-detail-head');
    const tbody = document.getElementById('expense-detail-data');
    const tfoot = document.getElementById('expense-detail-footer');
    const summary = document.getElementById('expense-detail-result-summary');
    if (!thead || !tbody || !tfoot) return;

    const filters = getExpenseDetailFilters();
    const filtered = getFilteredExpenseDetail();
    const totalAmount = filtered.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    // 勤怠一覧と同じ見た目（.sort-indicator に ⇅ / ↑ / ↓ が出る）
    const th = (label, field) => {
        if (!field) return `<th>${label}</th>`;
        const active = expenseDetailSort.field === field ? ` active ${expenseDetailSort.dir}` : '';
        return `<th class="sortable${active}" data-sort="${field}">${label} <span class="sort-indicator"></span></th>`;
    };

    if (filters.mode === 'date-site') {
        thead.innerHTML = `<tr>
            ${th('日付', 'date')}${th('現場名', 'siteName')}<th>従業員</th>${th('件数', 'count')}
            ${th('駐車場代', 'parking')}${th('工具代', 'tools')}${th('高速代', 'highway')}${th('その他', 'other')}${th('合計金額', 'total')}
        </tr>`;

        const rows = sortExpenseDetailRows(groupExpensesByDateSite(filtered));
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="no-data">該当する経費データがありません</td></tr>';
            tfoot.innerHTML = '';
        } else {
            tbody.innerHTML = rows.map(g => `
                <tr>
                    <td>${escapeHtml(g.date)}</td>
                    <td class="text-left">${escapeHtml(g.siteName)}</td>
                    <td class="text-left">${escapeHtml([...g.employees].join('、'))}</td>
                    <td>${g.count}件</td>
                    <td>${formatYen(g.parking)}</td>
                    <td>${formatYen(g.tools)}</td>
                    <td>${formatYen(g.highway)}</td>
                    <td>${formatYen(g.other)}</td>
                    <td>${formatYen(g.total)}</td>
                </tr>
            `).join('');

            const sum = (key) => rows.reduce((acc, g) => acc + g[key], 0);
            tfoot.innerHTML = `
                <tr class="expense-total-row">
                    <td colspan="3">合計（${rows.length}件の日付×現場）</td>
                    <td>${sum('count')}件</td>
                    <td>${formatYen(sum('parking'))}</td>
                    <td>${formatYen(sum('tools'))}</td>
                    <td>${formatYen(sum('highway'))}</td>
                    <td>${formatYen(sum('other'))}</td>
                    <td>${formatYen(sum('total'))}</td>
                </tr>`;
        }
    } else {
        thead.innerHTML = `<tr>
            ${th('日付', 'date')}${th('従業員', 'userName')}${th('現場名', 'siteName')}${th('経費項目', 'categoryName')}${th('金額', 'amount')}<th>説明</th>
        </tr>`;

        const rows = sortExpenseDetailRows(toExpenseDetailRows(filtered));
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">該当する経費データがありません</td></tr>';
            tfoot.innerHTML = '';
        } else {
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td>${escapeHtml(r.date)}</td>
                    <td class="text-left">${escapeHtml(r.userName)}</td>
                    <td class="text-left">${escapeHtml(r.siteName)}</td>
                    <td><span class="expense-category-badge ${escapeHtml(r.category)}">${escapeHtml(r.categoryName)}</span></td>
                    <td>${formatYen(r.amount)}</td>
                    <td class="text-left expense-detail-description">${escapeHtml(r.description)}</td>
                </tr>
            `).join('');
            tfoot.innerHTML = `
                <tr class="expense-total-row">
                    <td colspan="4">合計（${rows.length}件）</td>
                    <td>${formatYen(totalAmount)}</td>
                    <td></td>
                </tr>`;
        }
    }

    if (summary) {
        const isFiltered = filters.site || filters.employee || filters.category;
        summary.textContent = `${isFiltered ? '絞り込み結果' : '全体'}: ${filtered.length}件 ／ 合計 ${formatYen(totalAmount)}`;
    }
}

/**
 * CSVダウンロード（BOM付き）
 */
function downloadCSV(filename, csvContent, previewOptions) {
    // 保存前にプレビューで内容を確認（ui-csv.js）。無い場合はそのまま保存
    if (window.UI && typeof UI.csvPreview === 'function') {
        UI.csvPreview(csvContent, filename, previewOptions || {});
        return;
    }
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

/**
 * 経費明細CSV出力（画面の絞り込み・表示方法・並び順をそのまま出力）
 */
function exportExpenseDetailCSV() {
    try {
        const filters = getExpenseDetailFilters();
        const filtered = getFilteredExpenseDetail();
        if (filtered.length === 0) {
            alert('出力するデータがありません');
            return;
        }

        const quote = (field) => `"${String(field ?? '').replace(/"/g, '""')}"`;
        let csvContent = '';
        let modeLabel = '';

        if (filters.mode === 'date-site') {
            modeLabel = '日別現場別';
            csvContent += '日付,現場名,従業員,件数,駐車場代,工具代,高速代,その他,合計金額\n';
            sortExpenseDetailRows(groupExpensesByDateSite(filtered)).forEach(g => {
                csvContent += [
                    g.date, g.siteName, [...g.employees].join('、'), g.count,
                    g.parking, g.tools, g.highway, g.other, g.total
                ].map(quote).join(',') + '\n';
            });
        } else {
            modeLabel = '明細';
            csvContent += '日付,従業員,現場名,経費項目,金額,説明\n';
            sortExpenseDetailRows(toExpenseDetailRows(filtered)).forEach(r => {
                csvContent += [
                    r.date, r.userName, r.siteName, r.categoryName, r.amount, r.description
                ].map(quote).join(',') + '\n';
            });
        }

        const monthFilter = document.getElementById('expense-report-month-filter')?.value || '全期間';
        const siteSuffix = filters.site ? `_${filters.site}` : '';
        const filename = `経費明細_${modeLabel}_${monthFilter}${siteSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
        downloadCSV(filename, csvContent);
        alert('経費明細CSVを出力しました');

    } catch (error) {
        console.error('経費明細CSV出力エラー:', error);
        alert('CSV出力に失敗しました');
    }
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
        const employeeKey = getExpenseUserKey(exp);
        const employeeName = getExpenseUserName(exp);

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
        downloadCSV(filename, csvContent);

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
            const employeeKey = getExpenseUserKey(exp);
            const employeeName = getExpenseUserName(exp);

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

        downloadCSV(filename, csvContent);

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

        downloadCSV(filename, csvContent);

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
        downloadCSV(filename, csvContent);

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
window.renderExpenseDetail = renderExpenseDetail;
window.exportExpenseDetailCSV = exportExpenseDetailCSV;
