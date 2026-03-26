/**
 * マルチテナント管理ユーティリティ
 * URLパラメータ方式でテナント識別
 */


// テナント情報をグローバルに保持
window.currentTenant = null;

/**
 * URLからテナントIDを取得
 */
function getTenantFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tenant');
}

/**
 * テナントIDを生成（管理者登録時）
 * 会社名から安全なIDを生成
 */
function generateTenantId(companyName) {
    // 会社名を安全なID形式に変換
    const baseId = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-') // 英数字以外をハイフンに
        .replace(/-+/g, '-') // 連続するハイフンを1つに
        .replace(/^-|-$/g, ''); // 先頭末尾のハイフンを削除
    
    // タイムスタンプを追加してユニーク性を確保
    const timestamp = Date.now().toString(36);
    return `${baseId}-${timestamp}`;
}

/**
 * 現在のテナントIDを取得
 */
function getCurrentTenantId() {
    if (window.currentTenant) {
        return window.currentTenant.id;
    }
    return getTenantFromURL();
}

/**
 * テナント情報をFirestoreから取得
 */
async function loadTenantInfo(tenantId) {
    try {
        if (!tenantId) return null;
        
        const tenantDoc = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .get();
        
        if (tenantDoc.exists) {
            const tenantData = tenantDoc.data();
            window.currentTenant = {
                id: tenantId,
                ...tenantData
            };
            return window.currentTenant;
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}

/**
 * 新しいテナントを作成（管理者登録時）
 */
async function createTenant(tenantData) {
    try {
        const tenantId = generateTenantId(tenantData.companyName);
        const tenantInfo = {
            id: tenantId,
            companyName: tenantData.companyName,
            adminEmail: tenantData.adminEmail,
            adminName: tenantData.adminName,
            department: tenantData.department || '',
            phone: tenantData.phone || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        // Firestoreにテナント情報を保存
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .set(tenantInfo);
        
        return tenantId;
    } catch (error) {
        throw error;
    }
}

/**
 * テナント対応のFirestoreコレクション参照を取得
 */
function getTenantCollection(collection) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
        throw new Error('テナントIDが設定されていません');
    }
    return `tenants/${tenantId}/${collection}`;
}

/**
 * テナント対応のFirestore参照を取得
 */
function getTenantFirestore(collection) {
    const tenantPath = getTenantCollection(collection);
    return firebase.firestore().collection(tenantPath);
}

/**
 * スーパー管理者かどうかの判定
 */
function isSuperAdmin() {
    return window.currentUser && window.currentUser.role === 'super_admin';
}

/**
 * テナント選択画面の表示（セキュア実装）
 */
async function showTenantSelection(user = null) {
    try {
        
        // 現在のユーザーを取得
        const currentUser = user || firebase.auth().currentUser;
        if (!currentUser) {
            showPage('login');
            return;
        }
        
        // ユーザー情報を取得
        const userDoc = await firebase.firestore().collection('global_users').doc(currentUser.uid).get();
        const userData = userDoc.data();
        
        if (!userData) {
            showPage('login');
            return;
        }
        
        
        // super_adminの場合：テナント管理ダッシュボードを表示
        if (userData.role === 'super_admin') {
            await showSuperAdminDashboard();
            return;
        }
        
        // 通常ユーザーの場合：自分のテナントに直接リダイレクト
        if (userData.tenantId) {
            const tenantUrl = `${window.location.origin}${window.location.pathname}?tenant=${userData.tenantId}`;
            window.location.href = tenantUrl;
            return;
        }
        
        // テナントIDがない場合：エラー処理
        showError('テナント情報が見つかりません。管理者にお問い合わせください。');
        showPage('login');
        
    } catch (error) {
        showError('テナント情報の取得に失敗しました');
        showPage('login');
    }
}

/**
 * スーパー管理者用テナント管理ダッシュボードを表示
 */
async function showSuperAdminDashboard() {
    try {
        
        // 全テナント一覧を取得
        const tenantsSnapshot = await firebase.firestore()
            .collection('tenants')
            .orderBy('createdAt', 'desc')
            .get();
        
        const tenants = [];
        tenantsSnapshot.forEach(doc => {
            tenants.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        
        // テナント管理画面を表示
        showPage('tenant-management');
        
        // テナント一覧を描画
        renderTenantList(tenants);
        
    } catch (error) {
        showError('テナント管理画面の読み込みに失敗しました');
    }
}

/**
 * HTMLエスケープ関数（XSS対策）
 */
function escapeHtmlForTenant(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * テナント一覧を描画
 */
function renderTenantList(tenants) {
    const container = document.getElementById('tenant-list-container');
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="tenant-management-header">
            <h2>🏢 テナント管理ダッシュボード</h2>
            <p>登録テナント数: ${tenants.length}件</p>
        </div>

        <div class="tenant-list">
            ${tenants.map(tenant => `
                <div class="tenant-card" data-tenant-id="${escapeHtmlForTenant(tenant.id)}">
                    <div class="tenant-info">
                        <h3>${escapeHtmlForTenant(tenant.companyName)}</h3>
                        <p><strong>管理者:</strong> ${escapeHtmlForTenant(tenant.adminName)} (${escapeHtmlForTenant(tenant.adminEmail)})</p>
                        <p><strong>部署:</strong> ${escapeHtmlForTenant(tenant.department) || '未設定'}</p>
                        <p><strong>電話:</strong> ${escapeHtmlForTenant(tenant.phone) || '未設定'}</p>
                        <p><strong>作成日:</strong> ${tenant.createdAt ? new Date(tenant.createdAt.toDate()).toLocaleDateString('ja-JP') : '不明'}</p>
                        <p><strong>ステータス:</strong> <span class="status-${escapeHtmlForTenant(tenant.status)}">${tenant.status === 'active' ? '有効' : '無効'}</span></p>
                    </div>
                    <div class="tenant-actions">
                        <button class="btn btn-primary" onclick="accessTenant('${escapeHtmlForTenant(tenant.id)}')">
                            🔍 テナントにアクセス
                        </button>
                        <button class="btn btn-secondary" onclick="editTenant('${escapeHtmlForTenant(tenant.id)}')">
                            ⚙️ 設定編集
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>

        ${tenants.length === 0 ? `
            <div class="no-tenants">
                <p>📭 登録されているテナントがありません</p>
            </div>
        ` : ''}
    `;
}

/**
 * テナントにアクセス（スーパー管理者用）
 */
function accessTenant(tenantId) {
    const tenantUrl = `${window.location.origin}${window.location.pathname}?tenant=${tenantId}`;
    window.location.href = tenantUrl;
}

/**
 * テナント設定編集
 *
 * @param {string} tenantId - テナントID
 *
 * 📝 将来の実装予定:
 * - テナント名の編集
 * - テナント設定（業務時間、休憩時間など）の編集
 * - サイト（作業場所）の一括管理
 * - モーダルUIでの編集フォーム
 */
function editTenant(tenantId) {
    // 現在は準備中メッセージを表示
    showInfo('テナント設定編集機能は準備中です');
}

/**
 * URLにテナントパラメータを追加してリダイレクト
 */
function redirectWithTenant(tenantId) {
    const newUrl = `${window.location.pathname}?tenant=${tenantId}`;
    window.history.replaceState({}, '', newUrl);
}

/**
 * テナント情報をURLから読み込んで初期化
 */
async function initializeTenant() {
    try {
        const tenantId = getTenantFromURL();
        
        if (tenantId) {
            // 認証前はテナントIDを保存してFirestoreアクセスを回避
            if (!firebase.auth().currentUser) {
                logger.log('🔄 未認証状態 - テナントID保存:', tenantId);
                // URLパラメータは保持してFirestoreアクセスは認証後に延期
                return { id: tenantId, deferred: true };
            }
            
            const tenantInfo = await loadTenantInfo(tenantId);
            
            if (tenantInfo) {
                return tenantInfo;
            } else {
                logger.log('⚠️ 無効なテナントID:', tenantId);
                // 認証済みで無効なテナントの場合のみパラメータを削除
                const url = new URL(window.location);
                url.searchParams.delete('tenant');
                window.history.replaceState({}, '', url.toString());
            }
        } else {
        }
        
        return null;
    } catch (error) {
        console.error('テナント初期化エラー:', error);
        // ネットワークエラーなどの場合はURLを変更しない
        return null;
    }
}

/**
 * ユーザーのテナント判定（ログイン時）
 */
async function determineUserTenant(userEmail) {
    try {
        // 🔧 メールアドレスを小文字に統一（保存時と同じ形式で検索）
        const normalizedEmail = userEmail.toLowerCase();

        logger.log('🔍 determineUserTenant開始:', {
            originalEmail: userEmail,
            normalizedEmail: normalizedEmail
        });

        // global_usersコレクションからユーザーのテナント情報を取得
        const globalUserDoc = await firebase.firestore()
            .collection('global_users')
            .doc(normalizedEmail)
            .get();

        logger.log('📋 global_users検索結果:', {
            exists: globalUserDoc.exists,
            searchedEmail: normalizedEmail,
            data: globalUserDoc.exists ? globalUserDoc.data() : null
        });

        if (globalUserDoc.exists) {
            const userData = globalUserDoc.data();

            // 削除済みユーザーのチェック
            if (userData.isDeleted) {
                logger.log('🚫 削除済みユーザー検出:', normalizedEmail);
                return null; // nullを返すことでログイン処理を中断
            }

            logger.log('✅ テナントID取得成功:', userData.tenantId);
            return userData.tenantId;
        }

        logger.log('❌ global_usersにユーザーデータが見つかりません');
        return null;
    } catch (error) {
        logger.error('❌ determineUserTenant エラー:', error);
        return null;
    }
}

/**
 * 成功時のリダイレクト先URLを生成
 */
function generateSuccessUrl(tenantId) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const url = new URL(baseUrl);
    
    // テナントパラメータを確実に設定
    if (tenantId) {
        url.searchParams.set('tenant', tenantId);
    }
    
    // 他の必要なパラメータがあれば保持
    const currentParams = new URLSearchParams(window.location.search);
    for (const [key, value] of currentParams.entries()) {
        if (key !== 'tenant') {
            url.searchParams.set(key, value);
        }
    }
    
    logger.log('🔗 リダイレクトURL生成:', url.toString());
    return url.toString();
}

// グローバル関数として公開
window.getTenantFromURL = getTenantFromURL;
window.generateTenantId = generateTenantId;
window.getCurrentTenantId = getCurrentTenantId;
window.loadTenantInfo = loadTenantInfo;
window.createTenant = createTenant;
window.getTenantCollection = getTenantCollection;
window.getTenantFirestore = getTenantFirestore;
window.isSuperAdmin = isSuperAdmin;
window.showTenantSelection = showTenantSelection;
window.showSuperAdminDashboard = showSuperAdminDashboard;
window.renderTenantList = renderTenantList;
window.accessTenant = accessTenant;
window.editTenant = editTenant;
window.redirectWithTenant = redirectWithTenant;
window.initializeTenant = initializeTenant;
window.determineUserTenant = determineUserTenant;
window.generateSuccessUrl = generateSuccessUrl;

