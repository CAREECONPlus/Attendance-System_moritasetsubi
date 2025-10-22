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
    // 経費追加ボタンのイベント
    const addExpenseBtn = document.getElementById('add-expense-btn');
    if (addExpenseBtn && !addExpenseBtn.hasAttribute('data-listener-set')) {
        addExpenseBtn.addEventListener('click', openExpenseModal);
        addExpenseBtn.setAttribute('data-listener-set', 'true');
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
}

/**
 * 経費登録モーダルを開く（新規）
 */
async function openExpenseModal() {
    try {
        // モーダルタイトルを設定
        document.getElementById('expense-modal-title').textContent = '💰 経費を追加';

        // フォームをリセット
        document.getElementById('expense-form').reset();
        document.getElementById('expense-id').value = '';

        // 今日の日付をデフォルト設定
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('expense-date').value = today;

        // 現場リストを読み込む
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (tenantId) {
            const sites = await window.getTenantSites(tenantId);
            const siteSelect = document.getElementById('expense-site-name');
            siteSelect.innerHTML = '<option value="">現場を選択してください</option>';

            sites.filter(s => s.active).forEach(site => {
                const option = document.createElement('option');
                option.value = site.name;
                option.textContent = site.name;
                siteSelect.appendChild(option);
            });
        }

        // モーダルを表示
        document.getElementById('expense-modal').classList.remove('hidden');

    } catch (error) {
        console.error('モーダル表示エラー:', error);
        alert('モーダルの表示に失敗しました');
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

        // 経費データを取得（ユーザーのデータのみ）
        const snapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('expenses')
            .where('userId', '==', currentUser.uid)
            .orderBy('date', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            expensesGrid.innerHTML = `
                <div class="no-expenses">
                    <div class="no-expenses-icon">💰</div>
                    <h4>経費データがありません</h4>
                    <p>「経費を追加」ボタンから記録を始めましょう</p>
                </div>
            `;
            return;
        }

        // 経費カードを生成
        const expenses = [];
        snapshot.forEach(doc => {
            expenses.push({ id: doc.id, ...doc.data() });
        });

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

// グローバルスコープに公開
window.openExpenseModal = openExpenseModal;
window.openEditExpenseModal = openEditExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.deleteExpense = deleteExpense;
window.loadExpenseList = loadExpenseList;
window.initExpenseManagement = initExpenseManagement;
