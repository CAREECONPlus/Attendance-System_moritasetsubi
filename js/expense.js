// expense.js - 経費精算機能

/**
 * 経費項目のカテゴリー表示名を取得
 */
function getCategoryDisplayName(category) {
    const categories = {
        'parking': '🅿️ 駐車場代',
        'tools': '🔧 工具代',
        'highway': '🛣️ 高速代',
        'other': '📝 その他'
    };
    return categories[category] || category;
}

/**
 * 経費精算機能の初期化
 */
function initExpenseManagement() {
    console.log('initExpenseManagement: 初期化開始');

    // 経費追加ボタンのイベント
    const addExpenseBtn = document.getElementById('add-expense-btn');
    console.log('initExpenseManagement: 経費追加ボタン', addExpenseBtn);

    if (addExpenseBtn && !addExpenseBtn.hasAttribute('data-listener-set')) {
        console.log('initExpenseManagement: イベントリスナーを設定');
        addExpenseBtn.addEventListener('click', openExpenseModal);
        addExpenseBtn.setAttribute('data-listener-set', 'true');
    } else if (addExpenseBtn) {
        console.log('initExpenseManagement: イベントリスナーは既に設定済み');
    }

    // 経費更新ボタンのイベント
    const refreshBtn = document.getElementById('expense-refresh-btn');
    if (refreshBtn && !refreshBtn.hasAttribute('data-listener-set')) {
        refreshBtn.addEventListener('click', loadExpenseList);
        refreshBtn.setAttribute('data-listener-set', 'true');
    }

    // 経費フォームのsubmitイベント
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm && !expenseForm.hasAttribute('data-listener-set')) {
        expenseForm.addEventListener('submit', saveExpense);
        expenseForm.setAttribute('data-listener-set', 'true');
    }

    // 月別フィルターのイベント
    const monthFilter = document.getElementById('expense-month-filter');
    if (monthFilter && !monthFilter.hasAttribute('data-listener-set')) {
        monthFilter.addEventListener('change', loadExpenseList);
        monthFilter.setAttribute('data-listener-set', 'true');
    }

    // 現場別フィルターのイベント
    const siteFilter = document.getElementById('expense-site-filter');
    if (siteFilter && !siteFilter.hasAttribute('data-listener-set')) {
        siteFilter.addEventListener('change', loadExpenseList);
        siteFilter.setAttribute('data-listener-set', 'true');
    }

    // フィルタークリアボタンのイベント
    const clearFilterBtn = document.getElementById('expense-clear-filter-btn');
    if (clearFilterBtn && !clearFilterBtn.hasAttribute('data-listener-set')) {
        clearFilterBtn.addEventListener('click', clearExpenseFilters);
        clearFilterBtn.setAttribute('data-listener-set', 'true');
    }

    // 現場フィルターのリストを読み込む
    loadExpenseSiteFilter();
}

/**
 * 経費登録モーダルを開く（新規）
 */
async function openExpenseModal() {
    console.log('openExpenseModal: 関数が呼ばれました');

    try {
        // モーダル要素を取得
        const modal = document.getElementById('expense-modal');
        console.log('openExpenseModal: モーダル要素', modal);

        if (!modal) {
            alert('経費モーダル要素が見つかりません。ページをリロードしてください。');
            return;
        }

        // モーダルタイトルを設定
        const modalTitle = document.getElementById('expense-modal-title');
        if (modalTitle) {
            modalTitle.textContent = '💰 経費を追加';
        }

        // フォームをリセット
        const form = document.getElementById('expense-form');
        if (form) {
            form.reset();
        }

        const expenseId = document.getElementById('expense-id');
        if (expenseId) {
            expenseId.value = '';
        }

        // 今日の日付をデフォルト設定
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('expense-date');
        if (dateInput) {
            dateInput.value = today;
        }

        // 現場リストを読み込む
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (tenantId && typeof window.getTenantSites === 'function') {
            const sites = await window.getTenantSites(tenantId);
            const siteSelect = document.getElementById('expense-site-name');
            if (siteSelect) {
                siteSelect.innerHTML = '<option value="">現場を選択してください</option>';

                sites.filter(s => s.active).forEach(site => {
                    const option = document.createElement('option');
                    option.value = site.name;
                    option.textContent = site.name;
                    siteSelect.appendChild(option);
                });
            }
        }

        // モーダルを表示
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('モーダル表示エラー:', error);
        alert('モーダルの表示に失敗しました: ' + error.message);
    }
}

/**
 * 経費編集モーダルを開く
 */
async function openEditExpenseModal(expenseId) {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) return;

        // 経費データを取得
        const expenseDoc = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .doc(expenseId)
            .get();

        if (!expenseDoc.exists) {
            alert('経費データが見つかりませんでした');
            return;
        }

        const expense = expenseDoc.data();

        // モーダルタイトルを設定
        document.getElementById('expense-modal-title').textContent = '✏️ 経費を編集';

        // フォームに値を設定
        document.getElementById('expense-id').value = expenseId;
        document.getElementById('expense-date').value = expense.date || '';
        document.getElementById('expense-category').value = expense.category || '';
        document.getElementById('expense-amount').value = expense.amount || '';
        document.getElementById('expense-description').value = expense.description || '';

        // 現場リストを読み込む
        const sites = await window.getTenantSites(tenantId);
        const siteSelect = document.getElementById('expense-site-name');
        siteSelect.innerHTML = '<option value="">現場を選択してください</option>';

        sites.filter(s => s.active).forEach(site => {
            const option = document.createElement('option');
            option.value = site.name;
            option.textContent = site.name;
            if (site.name === expense.siteName) {
                option.selected = true;
            }
            siteSelect.appendChild(option);
        });

        // モーダルを表示
        document.getElementById('expense-modal').classList.remove('hidden');

    } catch (error) {
        console.error('編集モーダル表示エラー:', error);
        alert('編集モーダルの表示に失敗しました');
    }
}

/**
 * 経費モーダルを閉じる
 */
function closeExpenseModal() {
    document.getElementById('expense-modal').classList.add('hidden');
    document.getElementById('expense-form').reset();
}

/**
 * 経費を保存
 */
async function saveExpense(e) {
    e.preventDefault();

    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        const currentUser = window.currentUser || firebase.auth().currentUser;

        if (!tenantId || !currentUser) {
            alert('ユーザー情報が取得できません');
            return;
        }

        const expenseId = document.getElementById('expense-id').value;
        const date = document.getElementById('expense-date').value;
        const category = document.getElementById('expense-category').value;
        const amount = parseFloat(document.getElementById('expense-amount').value);
        const siteName = document.getElementById('expense-site-name').value;
        const description = document.getElementById('expense-description').value.trim();

        if (!date || !category || !amount || !siteName) {
            alert('必須項目を入力してください');
            return;
        }

        const expenseData = {
            date,
            category,
            amount,
            siteName,
            description,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const expensesRef = firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses');

        if (expenseId) {
            // 更新
            await expensesRef.doc(expenseId).update(expenseData);
            alert('経費を更新しました');
        } else {
            // 新規作成
            expenseData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await expensesRef.add(expenseData);
            alert('経費を登録しました');
        }

        // モーダルを閉じる
        closeExpenseModal();

        // 一覧を再読み込み
        await loadExpenseList();

    } catch (error) {
        console.error('経費保存エラー:', error);
        alert('経費の保存に失敗しました');
    }
}

/**
 * 経費一覧を読み込み
 */
async function loadExpenseList() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        const currentUser = window.currentUser || firebase.auth().currentUser;

        if (!tenantId || !currentUser) return;

        const expensesGrid = document.getElementById('expense-cards-grid');
        if (!expensesGrid) return;

        // フィルター値を取得
        const monthFilter = document.getElementById('expense-month-filter')?.value || '';
        const siteFilter = document.getElementById('expense-site-filter')?.value || '';

        // 経費データを取得（ユーザーのデータのみ）
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .where('userId', '==', currentUser.uid)
            .get();

        if (snapshot.empty) {
            expensesGrid.innerHTML = `
                <div class="no-expenses">
                    <div class="no-expenses-icon">💰</div>
                    <h4>経費データがありません</h4>
                    <p>「経費を追加」ボタンから記録を始めましょう</p>
                </div>
            `;
            updateExpenseSummary(0, 0);
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

        // フィルターを適用
        if (monthFilter) {
            expenses = expenses.filter(expense => {
                return expense.date && expense.date.startsWith(monthFilter);
            });
        }

        if (siteFilter) {
            expenses = expenses.filter(expense => {
                return expense.siteName === siteFilter;
            });
        }

        // フィルター後のデータが空の場合
        if (expenses.length === 0) {
            expensesGrid.innerHTML = `
                <div class="no-expenses">
                    <div class="no-expenses-icon">🔍</div>
                    <h4>該当する経費がありません</h4>
                    <p>フィルター条件を変更してください</p>
                </div>
            `;
            updateExpenseSummary(0, 0);
            return;
        }

        // 合計金額を計算
        const totalAmount = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
        updateExpenseSummary(totalAmount, expenses.length);

        // 経費カードを生成
        const expenseCards = expenses.map(expense => {
            const categoryName = getCategoryDisplayName(expense.category);
            const formattedAmount = expense.amount.toLocaleString('ja-JP');
            const formattedDate = new Date(expense.date).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            return `
                <div class="expense-card-item">
                    <div class="expense-card-header-row">
                        <h3 class="expense-card-title">${formattedDate}</h3>
                        <div class="expense-card-amount">¥${formattedAmount}</div>
                    </div>

                    <div class="expense-card-body-info">
                        <div class="expense-info-row">
                            <span class="expense-info-icon">📂</span>
                            <span class="expense-category-badge ${expense.category}">${categoryName}</span>
                        </div>

                        <div class="expense-info-row">
                            <span class="expense-info-icon">🏢</span>
                            <span class="expense-info-text">${escapeHtml(expense.siteName)}</span>
                        </div>

                        ${expense.description ? `
                            <div class="expense-info-row">
                                <span class="expense-info-icon">📝</span>
                                <span class="expense-info-text secondary">${escapeHtml(expense.description)}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="expense-card-footer">
                        <button class="btn btn-secondary btn-small" onclick="openEditExpenseModal('${expense.id}')">
                            ✏️ 編集
                        </button>
                        <button class="btn btn-danger btn-small" onclick="deleteExpense('${expense.id}')">
                            🗑️ 削除
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        expensesGrid.innerHTML = expenseCards;

    } catch (error) {
        console.error('経費一覧読み込みエラー:', error);
        const expensesGrid = document.getElementById('expense-cards-grid');
        if (expensesGrid) {
            expensesGrid.innerHTML = '<div class="error">経費一覧の読み込みに失敗しました</div>';
        }
        updateExpenseSummary(0, 0);
    }
}

/**
 * 経費を削除
 */
async function deleteExpense(expenseId) {
    if (!confirm('この経費を削除しますか？')) {
        return;
    }

    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) return;

        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .doc(expenseId)
            .delete();

        alert('経費を削除しました');

        // 一覧を再読み込み
        await loadExpenseList();

    } catch (error) {
        console.error('経費削除エラー:', error);
        alert('経費の削除に失敗しました');
    }
}

/**
 * HTMLエスケープ関数
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 合計金額と件数を表示
 */
function updateExpenseSummary(totalAmount, count) {
    const totalAmountEl = document.getElementById('expense-total-amount');
    const countEl = document.getElementById('expense-count');

    if (totalAmountEl) {
        totalAmountEl.textContent = '¥' + totalAmount.toLocaleString('ja-JP');
    }

    if (countEl) {
        countEl.textContent = count + '件';
    }
}

/**
 * 現場フィルターのリストを読み込む
 */
async function loadExpenseSiteFilter() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) return;

        const siteFilter = document.getElementById('expense-site-filter');
        if (!siteFilter) return;

        // 現場リストを取得
        const sites = await window.getTenantSites(tenantId);

        // フィルター用のセレクトボックスを更新
        siteFilter.innerHTML = '<option value="">すべて</option>';
        sites.filter(s => s.active).forEach(site => {
            const option = document.createElement('option');
            option.value = site.name;
            option.textContent = site.name;
            siteFilter.appendChild(option);
        });

    } catch (error) {
        console.error('現場フィルター読み込みエラー:', error);
    }
}

/**
 * フィルターをクリア
 */
function clearExpenseFilters() {
    const monthFilter = document.getElementById('expense-month-filter');
    const siteFilter = document.getElementById('expense-site-filter');

    if (monthFilter) monthFilter.value = '';
    if (siteFilter) siteFilter.value = '';

    // 一覧を再読み込み
    loadExpenseList();
}

// グローバルスコープに公開
window.openExpenseModal = openExpenseModal;
window.openEditExpenseModal = openEditExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.deleteExpense = deleteExpense;
window.loadExpenseList = loadExpenseList;
window.initExpenseManagement = initExpenseManagement;
window.clearExpenseFilters = clearExpenseFilters;
