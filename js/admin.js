
// テナント対応のFirestoreコレクション取得関数（main.jsの統一関数を使用）
function getAttendanceCollection() {
    try {
        logger.log('🔍 勤怠コレクション取得開始', {
            hasTenantFirestore: !!(window.getTenantFirestore),
            currentUser: window.currentUser,
            currentTenant: window.currentTenant
        });
        
        if (window.getTenantFirestore && typeof window.getTenantFirestore === 'function') {
            const collection = window.getTenantFirestore('attendance');
            logger.log('🏢 テナント対応勤怠コレクション取得成功', collection.path);
            return collection;
        } else {
            logger.warn('⚠️ テナント対応関数が利用できません - フォールバック');
            const fallbackCollection = firebase.firestore().collection('attendance');
            logger.log('📁 フォールバック勤怠コレクション:', fallbackCollection.path);
            return fallbackCollection;
        }
    } catch (error) {
        console.error('❌ 勤怠コレクション取得エラー:', {
            error: error,
            message: error.message,
            code: error.code,
            stack: error.stack,
            firebase: typeof firebase,
            firestore: typeof firebase?.firestore
        });
        throw new Error(`勤怠データコレクションの取得に失敗しました: ${error.message}`);
    }
}

function getBreaksCollection() {
    return window.getTenantFirestore ? window.getTenantFirestore('breaks') : firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks');
}

function getUsersCollection() {
    return window.getUserCollection ? window.getUserCollection() : firebase.firestore().collection('users');
}

/**
 * 管理者登録依頼の管理機能
 */
function initAdminRequestsManagement() {
    
    // 管理者依頼タブのクリックイベント
    const adminRequestsTab = document.getElementById('admin-requests-tab');
    if (adminRequestsTab) {
        adminRequestsTab.addEventListener('click', () => {
            showAdminRequestsTab();
        });
    }
    
    // 更新ボタンのイベント
    const refreshBtn = document.getElementById('refresh-requests-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAdminRequests);
    }
}

/**
 * 管理者依頼タブを表示（スーパー管理者のみ）
 */
function showAdminRequestsTab() {
    logger.log('showAdminRequestsTab: 管理者依頼タブを表示中...');
    logger.log('showAdminRequestsTab: currentUser:', window.currentUser);
    logger.log('showAdminRequestsTab: user role:', window.currentUser ? window.currentUser.role : 'No user');
    
    // 権限チェック
    if (!window.currentUser || window.currentUser.role !== 'super_admin') {
        logger.log('showAdminRequestsTab: 権限不足でリターン');
        return;
    }
    
    logger.log('showAdminRequestsTab: 権限チェック通過');
    
    // 全てのタブコンテンツを非表示
    document.querySelectorAll('.tab-content, .attendance-table-container').forEach(el => {
        el.classList.add('hidden');
    });
    
    // フィルター行を非表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) filterRow.style.display = 'none';
    
    // 管理者依頼コンテンツを表示
    const adminRequestsContent = document.getElementById('admin-requests-content');
    logger.log('showAdminRequestsTab: adminRequestsContent要素:', adminRequestsContent);
    if (adminRequestsContent) {
        adminRequestsContent.classList.remove('hidden');
        adminRequestsContent.style.display = 'block'; // 強制的に表示
        
        // 管理者依頼テーブルコンテナも表示
        const tableContainer = adminRequestsContent.querySelector('.attendance-table-container');
        if (tableContainer) {
            tableContainer.classList.remove('hidden');
            tableContainer.style.display = 'block';
            logger.log('showAdminRequestsTab: テーブルコンテナも表示設定');
        }
        
        logger.log('showAdminRequestsTab: コンテンツを表示設定');
        logger.log('showAdminRequestsTab: コンテンツのdisplay:', window.getComputedStyle(adminRequestsContent).display);
    } else {
        console.error('showAdminRequestsTab: admin-requests-content要素が見つかりません');
    }
    
    // タブの状態を更新
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('admin-requests-tab').classList.add('active');
    
    // 依頼データを読み込み
    loadAdminRequests();
}

/**
 * 従業員管理の初期化（管理者以上）
 */
function initEmployeeManagement() {
    // 管理者権限チェック（admin または super_admin）
    if (!window.currentUser || (window.currentUser.role !== 'super_admin' && window.currentUser.role !== 'admin')) {
        logger.log('従業員管理機能: 管理者のみアクセス可能');
        return;
    }

    console.log('[initEmployeeManagement] 従業員管理タブを初期化:', window.currentUser.role);

    // 管理者の場合タブを表示
    const employeeManagementTab = document.getElementById('employee-management-tab');
    if (employeeManagementTab) {
        employeeManagementTab.style.display = 'block';
        employeeManagementTab.addEventListener('click', () => {
            showEmployeeManagementTab();
        });
    }
}

/**
 * 従業員管理タブを表示（管理者以上）
 */
function showEmployeeManagementTab() {
    logger.log('従業員管理タブを表示中...');
    console.log('[showEmployeeManagementTab] ユーザー権限:', window.currentUser?.role);

    // 管理者権限チェック（admin または super_admin）
    if (!window.currentUser || (window.currentUser.role !== 'super_admin' && window.currentUser.role !== 'admin')) {
        logger.log('従業員管理タブ: 管理者のみアクセス可能');
        alert('この機能は管理者のみアクセス可能です。');
        return;
    }

    // 全てのタブコンテンツを非表示
    document.querySelectorAll('.tab-content, .attendance-table-container').forEach(el => {
        el.classList.add('hidden');
    });

    // フィルター行を非表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) filterRow.style.display = 'none';

    // 従業員管理コンテンツを表示
    const employeeContent = document.getElementById('employee-management-content');
    if (employeeContent) {
        employeeContent.classList.remove('hidden');
        employeeContent.style.display = 'block';
    }

    // タブの状態を更新
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('employee-management-tab').classList.add('active');

    // 権限に応じて適切な従業員一覧を読み込み
    if (window.currentUser.role === 'super_admin') {
        console.log('[showEmployeeManagementTab] スーパー管理者: 全テナント従業員を読み込み');
        loadAllTenantsEmployeeList();
    } else {
        console.log('[showEmployeeManagementTab] テナント管理者: 自テナント従業員を読み込み');
        loadEmployeeList();
    }
}

/**
 * 招待管理タブを表示
 */
function showInviteTab() {
    logger.log('showInviteTab: 招待タブを表示中...');
    
    // 全てのタブコンテンツを非表示
    document.querySelectorAll('.tab-content, .attendance-table-container').forEach(el => {
        el.classList.add('hidden');
    });
    
    // フィルター行を非表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) filterRow.style.display = 'none';
    
    // 招待管理コンテンツを表示
    const inviteContent = document.getElementById('invite-content');
    logger.log('invite-content要素:', inviteContent);
    if (inviteContent) {
        inviteContent.classList.remove('hidden');
        inviteContent.style.display = 'block'; // 強制的に表示
        logger.log('invite-contentのhiddenクラスを削除しました');
        logger.log('invite-contentのスタイル:', window.getComputedStyle(inviteContent).display);
        logger.log('invite-contentのvisibility:', window.getComputedStyle(inviteContent).visibility);
    } else {
        logger.warn('invite-content要素が見つかりません');
    }
    
    // タブの状態を更新
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const inviteTab = document.querySelector('[data-tab="invite"]');
    if (inviteTab) inviteTab.classList.add('active');
    
    // 招待機能を確実に初期化
    if (typeof initInviteAdmin === 'function') {
        logger.log('showInviteTab内でinitInviteAdminを呼び出し');
        initInviteAdmin();
    }
    
    // 招待履歴を読み込み
    if (typeof loadInviteHistory === 'function') {
        loadInviteHistory();
    }
}

/**
 * Firestoreから管理者登録依頼を読み込み
 */
async function loadAdminRequests() {
    try {
        logger.log('loadAdminRequests: 管理者依頼データを読み込み中...');
        
        const tbody = document.getElementById('admin-requests-data');
        logger.log('loadAdminRequests: tbody要素:', tbody);
        if (!tbody) {
            console.error('loadAdminRequests: admin-requests-data要素が見つかりません');
            return;
        }
        
        // 現在のユーザーの役割とテナント情報を確認
        const currentUser = window.currentUser;
        const isSuper = currentUser && currentUser.role === 'super_admin';
        
        logger.log('loadAdminRequests: ユーザー権限確認:', isSuper ? 'スーパー管理者' : '通常管理者');
        
        let requestsSnapshot;
        
        if (isSuper) {
            // スーパー管理者：全ての依頼を表示
            logger.log('loadAdminRequests: 全ての管理者依頼を取得中...');
            requestsSnapshot = await firebase.firestore()
                .collection('admin_requests')
                .orderBy('requestedAt', 'desc')
                .get();
        } else {
            // 通常管理者：自分のテナントの依頼のみ表示
            const tenantId = getCurrentTenantId();
            logger.log('loadAdminRequests: テナント固有の依頼を取得中...', tenantId);
            
            if (!tenantId) {
                console.error('loadAdminRequests: テナントIDが取得できません');
                tbody.innerHTML = '<tr><td colspan="7" class="error">テナント情報が取得できません</td></tr>';
                return;
            }
            
            requestsSnapshot = await firebase.firestore()
                .collection('admin_requests')
                .where('targetTenantId', '==', tenantId)
                .orderBy('requestedAt', 'desc')
                .get();
        }
        
        logger.log('loadAdminRequests: クエリ結果:', requestsSnapshot);
        logger.log('loadAdminRequests: ドキュメント数:', requestsSnapshot.size);
        logger.log('loadAdminRequests: empty:', requestsSnapshot.empty);
        
        if (requestsSnapshot.empty) {
            logger.log('loadAdminRequests: 依頼データが見つかりません');
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">管理者登録依頼はありません</td></tr>';
            return;
        }
        
        const requests = [];
        requestsSnapshot.forEach(doc => {
            const data = doc.data();
            logger.log('loadAdminRequests: 依頼データ:', doc.id, data);
            requests.push({
                id: doc.id,
                ...data,
                requestedAtFormatted: data.requestedAt ? 
                    data.requestedAt.toDate().toLocaleString('ja-JP') : 
                    '日時不明'
            });
        });
        
        logger.log('loadAdminRequests: 処理済み依頼配列:', requests);
        logger.log('loadAdminRequests: テーブルHTMLを生成中...');
        
        tbody.innerHTML = requests.map(request => `
            <tr>
                <td>${request.requestedAtFormatted}</td>
                <td>${request.requesterName}</td>
                <td>${request.requesterEmail}</td>
                <td>${request.companyName}</td>
                <td>${request.department || '-'}</td>
                <td><span class="status-${request.status}">${getAdminRequestStatusText(request.status)}</span></td>
                <td class="action-buttons">
                    ${request.status === 'pending' ? 
                        `<button class="btn btn-primary btn-sm" onclick="approveAdminRequest('${request.id}')">承認</button>
                         <button class="btn btn-danger btn-sm" onclick="rejectAdminRequest('${request.id}')">却下</button>` : 
                        `<span class="text-muted">処理済み</span>`}
                    <button class="btn btn-secondary btn-sm" onclick="viewRequestDetails('${request.id}')">詳細</button>
                </td>
            </tr>
        `).join('');
        
        logger.log('loadAdminRequests: テーブル表示完了');
        
    } catch (error) {
        console.error('loadAdminRequests: エラーが発生しました:', error);
        const tbody = document.getElementById('admin-requests-data');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="error">データの読み込みに失敗しました</td></tr>';
        }
    }
}

/**
 * 管理者登録依頼のステータス表示テキストを取得
 */
function getAdminRequestStatusText(status) {
    switch (status) {
        case 'pending': return '承認待ち';
        case 'approved': return '承認済み';
        case 'rejected': return '却下';
        default: return status;
    }
}

/**
 * 管理者登録依頼を承認
 */
async function approveAdminRequest(requestId) {
    try {
        if (!confirm('この管理者登録依頼を承認しますか？')) {
            return;
        }

        logger.log('approveAdminRequest: 依頼を承認中...', requestId);

        // Firestoreでステータスを更新
        await firebase.firestore()
            .collection('admin_requests')
            .doc(requestId)
            .update({
                status: 'approved',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: firebase.auth().currentUser?.email || 'unknown'
            });

        alert('管理者登録依頼を承認しました');
        
        // 依頼一覧を再読み込み
        loadAdminRequests();

    } catch (error) {
        console.error('承認エラー:', error);
        alert('承認処理に失敗しました: ' + error.message);
    }
}

/**
 * 管理者登録依頼を却下
 */
async function rejectAdminRequest(requestId) {
    try {
        const reason = prompt('却下理由を入力してください（任意）:');
        if (reason === null) return; // キャンセル

        if (!confirm('この管理者登録依頼を却下しますか？')) {
            return;
        }

        logger.log('rejectAdminRequest: 依頼を却下中...', requestId);

        // Firestoreでステータスを更新
        await firebase.firestore()
            .collection('admin_requests')
            .doc(requestId)
            .update({
                status: 'rejected',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectedBy: firebase.auth().currentUser?.email || 'unknown',
                rejectionReason: reason || ''
            });

        alert('管理者登録依頼を却下しました');
        
        // 依頼一覧を再読み込み
        loadAdminRequests();

    } catch (error) {
        console.error('却下エラー:', error);
        alert('却下処理に失敗しました: ' + error.message);
    }
}

/**
 * 管理者登録依頼の詳細を表示
 */
function viewRequestDetails(requestId) {
    // 現在のデータから詳細を取得
    const requests = document.querySelectorAll('#admin-requests-data tr');
    // 詳細表示機能は今後実装
    alert('詳細表示機能は今後実装予定です。\nID: ' + requestId);
}

/**
 * 勤怠ステータス表示テキストを取得
 */
function getAttendanceStatusText(status) {
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
    if (!status) return '不明';
    const lowerStatus = String(status).toLowerCase();
    return statusMap[lowerStatus] || statusMap[status] || '不明';
}

/**
 * 管理者登録依頼用のステータステキスト取得（名前変更により従業員側との競合を回避）
 */
function getAdminStatusText(status) {
    return getAdminRequestStatusText(status);
}

/**
 * 管理者登録依頼を承認
 */
async function approveAdminRequest(requestId) {
    if (!confirm('この依頼を承認して管理者アカウントを作成しますか？')) return;
    
    try {
        
        // 依頼データを取得
        const requestDoc = await firebase.firestore()
            .collection('admin_requests')
            .doc(requestId)
            .get();
        
        if (!requestDoc.exists) {
            alert('依頼データが見つかりません。');
            return;
        }
        
        const requestData = requestDoc.data();
        
        // テナントIDを生成
        const tenantId = generateTenantId(requestData.companyName);
        
        // 🔐 現在の管理者の認証情報を保存
        const currentAdmin = firebase.auth().currentUser;
        const adminEmail = currentAdmin ? currentAdmin.email : null;
        const adminPassword = prompt('管理者承認のため、あなたのパスワードを入力してください:');
        
        if (!adminPassword) {
            alert('パスワードが入力されませんでした。承認を中止します。');
            return;
        }
        
        // Firebase Authアカウント作成
        let userCredential;
        let newUserUID = null;
        try {
            userCredential = await firebase.auth().createUserWithEmailAndPassword(
                requestData.requesterEmail, 
                requestData.password
            );
            
            // 新しく作成されたユーザーのUIDを保存
            newUserUID = userCredential.user.uid;
            logger.log('✅ 新規ユーザー作成完了:', newUserUID);
            
            // プロフィール更新
            await userCredential.user.updateProfile({
                displayName: requestData.requesterName
            });
            
            // 🔄 管理者の認証セッションを復元
            await firebase.auth().signInWithEmailAndPassword(adminEmail, adminPassword);
            logger.log('✅ 管理者認証セッションを復元しました');
            
        } catch (authError) {
            
            // メールアドレスが既に使用されている場合の処理
            if (authError.code === 'auth/email-already-in-use') {
                // 既存アカウントの処理は後続のFirestoreデータ作成で対応
                logger.log('📝 既存アカウントが存在するため、Firestoreデータのみ更新します');
                
                // 既存ユーザーのUIDを取得（管理者認証セッション復元後なので直接は取得できない）
                // この場合は後でlogin.jsでUIDを更新する必要がある
                newUserUID = 'pending-uid';
            } else {
                throw new Error(`Firebase Authアカウント作成失敗: ${authError.message}`);
            }
        }
        
        // テナント作成
        const tenantData = {
            tenantId: tenantId,
            companyName: requestData.companyName,
            adminEmail: requestData.requesterEmail,
            adminName: requestData.requesterName,
            phone: requestData.phone || '',
            department: requestData.department || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .set(tenantData);
        
        // グローバルユーザー管理に管理者を登録
        const globalUserData = {
            uid: newUserUID,
            email: requestData.requesterEmail,
            displayName: requestData.requesterName,
            role: 'admin',
            tenantId: tenantId,
            company: requestData.companyName,
            department: requestData.department || '',
            phone: requestData.phone || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: window.currentUser?.email || 'system'
        };
        
        // 🔧 メールアドレスを小文字に統一（Firestore検索時の一貫性確保）
        const normalizedEmail = requestData.requesterEmail.toLowerCase();
        
        logger.log('💾 global_users保存開始:', {
            originalEmail: requestData.requesterEmail,
            normalizedEmail: normalizedEmail,
            data: globalUserData
        });
        
        await firebase.firestore()
            .collection('global_users')
            .doc(normalizedEmail)
            .set(globalUserData);
            
        logger.log('✅ global_users保存完了:', normalizedEmail);
        
        // テナント内のusersコレクションに管理者データを保存
        const tenantUserData = {
            uid: newUserUID,
            email: requestData.requesterEmail,
            displayName: requestData.requesterName,
            role: 'admin',
            company: requestData.companyName,
            department: requestData.department || '',
            phone: requestData.phone || '',
            tenantId: tenantId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: window.currentUser?.email || 'system'
        };
        
        await firebase.firestore()
            .collection('tenants').doc(tenantId)
            .collection('users').doc(newUserUID)
            .set(tenantUserData);
        
        // legacy usersコレクションにも保存（後方互換性）
        if (newUserUID && newUserUID !== 'pending-uid') {
            await firebase.firestore()
                .collection('users')
                .doc(newUserUID)
                .set(tenantUserData);
        }
        
        // 依頼ステータスを承認済みに更新
        await firebase.firestore()
            .collection('admin_requests')
            .doc(requestId)
            .update({
                status: 'approved',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: window.currentUser?.email || 'system',
                tenantId: tenantId
            });
        
        const loginUrl = `${window.location.origin}${window.location.pathname}?tenant=${tenantId}`;
        
        alert(`管理者アカウントを承認しました。\\n\\n【ログイン情報】\\nメール: ${requestData.requesterEmail}\\nパスワード: (依頼時に設定されたもの)\\nテナントID: ${tenantId}\\nログインURL: ${loginUrl}\\n\\n承認されたユーザーにこの情報をお知らせください。`);
        loadAdminRequests(); // リストを再読み込み
        
    } catch (error) {
        alert('管理者アカウントの承認に失敗しました: ' + error.message);
    }
}

/**
 * テナントID生成関数
 */
function generateTenantId(companyName) {
    // 会社名をもとにテナントIDを生成
    const baseId = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // 英数字以外を削除
        .substring(0, 15); // 15文字に制限
    
    // ランダムな文字列を追加してユニーク性を確保
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    return `${baseId}-${randomSuffix}`;
}

/**
 * 管理者登録依頼を却下
 */
async function rejectAdminRequest(requestId) {
    const reason = prompt('却下理由を入力してください（省略可）:');
    if (!confirm('この依頼を却下しますか？')) return;
    
    try {
        
        // 依頼ステータスを却下に更新
        await firebase.firestore()
            .collection('admin_requests')
            .doc(requestId)
            .update({
                status: 'rejected',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectedBy: window.currentUser?.email || 'system',
                rejectionReason: reason || ''
            });
        
        alert('依頼を却下しました。');
        loadAdminRequests(); // リストを再読み込み
        
    } catch (error) {
        alert('依頼の却下に失敗しました: ' + error.message);
    }
}

/**
 * 依頼詳細を表示
 */
async function viewRequestDetails(requestId) {
    try {
        const requestDoc = await firebase.firestore()
            .collection('admin_requests')
            .doc(requestId)
            .get();
        
        if (!requestDoc.exists) {
            alert('依頼データが見つかりません。');
            return;
        }
        
        const request = requestDoc.data();
        const requestedAt = request.requestedAt ? 
            request.requestedAt.toDate().toLocaleString('ja-JP') : 
            '日時不明';
        
        let statusInfo = '';
        if (request.status === 'approved') {
            const approvedAt = request.approvedAt ? 
                request.approvedAt.toDate().toLocaleString('ja-JP') : 
                '日時不明';
            statusInfo = `\n承認日時: ${approvedAt}\n承認者: ${request.approvedBy || '不明'}\nテナントID: ${request.tenantId || '不明'}`;
        } else if (request.status === 'rejected') {
            const rejectedAt = request.rejectedAt ? 
                request.rejectedAt.toDate().toLocaleString('ja-JP') : 
                '日時不明';
            statusInfo = `\n却下日時: ${rejectedAt}\n却下者: ${request.rejectedBy || '不明'}\n却下理由: ${request.rejectionReason || '理由未記入'}`;
        }
        
        const details = `
管理者登録依頼詳細:

氏名: ${request.requesterName}
メールアドレス: ${request.requesterEmail}
電話番号: ${request.phone || '（未記入）'}
会社名・組織名: ${request.companyName}
部署名: ${request.department || '（未記入）'}
ステータス: ${getAdminStatusText(request.status)}
依頼日時: ${requestedAt}
依頼方法: ${request.requestedBy || '不明'}${statusInfo}
        `;
        
        alert(details);
        
    } catch (error) {
        alert('依頼詳細の取得に失敗しました。');
    }
}


// グローバル関数として公開
window.approveAdminRequest = approveAdminRequest;
window.rejectAdminRequest = rejectAdminRequest;
window.viewRequestDetails = viewRequestDetails;

/**
 * 管理者画面の初期化処理（Firebase v8対応版）
 * 全てのイベントリスナーを設定し、初期データを読み込みます
 */
async function initAdminPage() {
    logger.log('initAdminPage (FIRST): 管理者画面を初期化中...');
    
    // 権限チェック
    if (!checkAuth('admin')) return;

    // ユーザー情報を再確認・設定
    const currentFirebaseUser = firebase.auth().currentUser;
    if (currentFirebaseUser && (!window.currentUser || !window.currentUser.role)) {
        // Firestoreからユーザー情報を取得
        try {
            const userDoc = await firebase.firestore().collection('global_users').doc(currentFirebaseUser.email).get();
            if (userDoc.exists) {
                window.currentUser = {
                    ...currentFirebaseUser,
                    ...userDoc.data()
                };
                logger.log('User data loaded from Firestore:', window.currentUser);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // デバッグ: 現在のユーザー情報を確認
    logger.log('Current user in initAdminPage:', window.currentUser);
    logger.log('User role:', window.currentUser ? window.currentUser.role : 'No role');
    
    // 管理者依頼タブの表示制御
    const adminRequestsTab = document.getElementById('admin-requests-tab');
    const employeeInviteTab = document.querySelector('[data-tab="invite"]');
    
    logger.log('Admin requests tab:', adminRequestsTab);
    logger.log('Employee invite tab:', employeeInviteTab);
    
    if (window.currentUser && window.currentUser.role === 'super_admin') {
        logger.log('Setting up super admin tabs...');
        // スーパー管理者：管理者依頼タブを表示、従業員招待タブを非表示
        if (adminRequestsTab) {
            adminRequestsTab.style.display = 'block';
            logger.log('Admin requests tab shown');
        }
        if (employeeInviteTab) {
            employeeInviteTab.style.display = 'none';
            logger.log('Employee invite tab hidden');
        }
    } else {
        logger.log('Setting up regular admin tabs...');
        // 通常管理者：管理者依頼タブを非表示、従業員招待タブを表示
        if (adminRequestsTab) {
            adminRequestsTab.style.display = 'none';
            logger.log('Admin requests tab hidden');
        }
        if (employeeInviteTab) {
            employeeInviteTab.style.display = 'block';
            logger.log('Employee invite tab shown');
        }
    }

    // 基本的なUI初期化
    setupAdminBasics();
    
    // 編集機能を初期化
    initAdminEditFeatures();
    
    // 管理者登録依頼管理機能を初期化（スーパー管理者のみ）
    if (window.currentUser && window.currentUser.role === 'super_admin') {
        initAdminRequestsManagement();
    }
    
    // 従業員管理機能を初期化（スーパー管理者のみ）
    initEmployeeManagement();
    
    // 招待リンク管理機能を初期化（全ての管理者）
    // DOMが完全に読み込まれた後に実行
    logger.log('initInviteAdmin呼び出し前チェック:', typeof initInviteAdmin);
    setTimeout(() => {
        logger.log('setTimeout内でのinitInviteAdminチェック:', typeof initInviteAdmin);
        if (typeof initInviteAdmin === 'function') {
            logger.log('initInviteAdminを呼び出し中...');
            initInviteAdmin();
        } else {
            logger.warn('initInviteAdmin関数が見つかりません');
        }
    }, 100);
    
    
    // 残りの初期化を少し遅延させて実行
    setTimeout(async function() {
        try {
            // 今日の日付をセット
            const today = new Date().toISOString().split('T')[0];
            const filterDate = getElement('filter-date');
            if (filterDate) filterDate.value = today;
            
            // 今月をセット
            const thisMonth = today.substring(0, 7);
            const filterMonth = getElement('filter-month');
            if (filterMonth) filterMonth.value = thisMonth;
            
            // データの読み込み（Firebase対応）
            await loadEmployeeFilterList();
            await loadSiteFilterList();
            await loadAttendanceData();
            
            // イベントリスナーの設定
            setupAdminEvents();
            
        } catch (error) {
            showError('データの読み込みに失敗しました');
        }
    }, 200);
}

/**
 * 管理者画面の基本的なUI初期化
 */
function setupAdminBasics() {
    // ユーザー名を表示
    const currentUser = getCurrentUser();
    if (currentUser) {
        const userNameEl = getElement('admin-user-name');
        if (userNameEl) {
            userNameEl.textContent = currentUser.displayName || currentUser.email;
        }
    }

    // ログアウトボタン
    const logoutBtn = getElement('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            signOut();
        });
    }

    // タブ切り替えイベント（重複防止ガード付き）
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
        if (!btn.hasAttribute('data-listener-set')) {
            btn.addEventListener('click', function() {
                const tab = this.getAttribute('data-tab');
                switchTab(tab);
            });
            btn.setAttribute('data-listener-set', 'true');
        }
    });
}

/**
 * タブ切り替え関数
 */
function switchTab(tab) {
    // 管理者依頼タブの特別処理（スーパー管理者のみ）
    if (tab === 'admin-requests') {
        if (window.currentUser && window.currentUser.role === 'super_admin') {
            showAdminRequestsTab();
        }
        return;
    }

    // 従業員招待タブの特別処理
    if (tab === 'invite') {
        showInviteTab();
        return;
    }

    // 経費レポートタブの特別処理
    if (tab === 'expense-report') {
        showExpenseReportTab();
        return;
    }

    // 月次給与タブの特別処理
    if (tab === 'monthly-salary') {
        showMonthlySalaryTab();
        return;
    }

    // 設定タブの特別処理
    if (tab === 'settings') {
        showSettingsTab();
        return;
    }


    // 管理者依頼コンテンツを非表示
    const adminRequestsContent = document.getElementById('admin-requests-content');
    if (adminRequestsContent) {
        adminRequestsContent.classList.add('hidden');
    }

    // 招待コンテンツを非表示
    const inviteContent = document.getElementById('invite-content');
    if (inviteContent) {
        inviteContent.classList.add('hidden');
    }

    // 経費レポートコンテンツを非表示
    const expenseReportContent = document.getElementById('expense-report-content');
    if (expenseReportContent) {
        expenseReportContent.classList.add('hidden');
    }

    // 月次給与コンテンツを非表示
    const monthlySalaryContent = document.getElementById('monthly-salary-content');
    if (monthlySalaryContent) {
        monthlySalaryContent.classList.add('hidden');
    }

    // 設定コンテンツを非表示
    const settingsContent = document.getElementById('settings-content');
    if (settingsContent) {
        settingsContent.classList.add('hidden');
    }

    // 従業員管理コンテンツを非表示
    const employeeManagementContent = document.getElementById('employee-management-content');
    if (employeeManagementContent) {
        employeeManagementContent.classList.add('hidden');
    }

    // 通常の勤怠データテーブルをすべて表示
    const attendanceContainers = document.querySelectorAll('.attendance-table-container');
    attendanceContainers.forEach(container => {
        container.classList.remove('hidden');
        container.style.display = '';  // style.displayをリセット
    });

    // フィルター行を表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) {
        filterRow.classList.remove('hidden');
        filterRow.style.display = 'flex';
    }
    
    // アクティブタブの切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // フィルター表示の切り替え
    document.querySelectorAll('.date-filter, .month-filter, .employee-filter, .site-filter').forEach(filter => {
        filter.classList.add('hidden');
    });
    
    if (tab === 'daily') {
        const dateFilter = document.querySelector('.date-filter');
        if (dateFilter) dateFilter.classList.remove('hidden');
    } else if (tab === 'monthly') {
        const monthFilter = document.querySelector('.month-filter');
        if (monthFilter) monthFilter.classList.remove('hidden');
    } else if (tab === 'employee') {
        const employeeFilter = document.querySelector('.employee-filter');
        if (employeeFilter) employeeFilter.classList.remove('hidden');
        // 従業員別タブを開いたときに従業員フィルターを更新
        loadEmployeeFilterList();
    } else if (tab === 'site') {
        const siteFilter = document.querySelector('.site-filter');
        if (siteFilter) siteFilter.classList.remove('hidden');
        // 現場別タブを開いたときに現場フィルターを更新
        loadSiteFilterList();
    }

    // データを再読み込み
    loadAttendanceData();
}

/**
 * 従業員フィルターリストの読み込み（Firebase v8対応版）
 */
async function loadEmployeeFilterList() {
    try {
        const tenantId = getCurrentTenantId();

        const querySnapshot = await firebase.firestore()
            .collection('tenants').doc(tenantId)
            .collection('users')
            .where('role', '==', 'employee')
            .get();

        const select = getElement('filter-employee');
        if (!select) {
            return;
        }

        // 既存のオプションをクリア（最初の「全員」オプションは残す）
        while (select.options.length > 1) {
            select.remove(1);
        }

        // 従業員リストを配列に変換してソート
        const employees = [];
        querySnapshot.forEach(doc => {
            const employee = doc.data();
            employees.push({
                id: doc.id,
                displayName: employee.displayName || employee.email,
                email: employee.email
            });
        });

        // 名前順にソート
        employees.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

        // オプションを追加
        employees.forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = employee.displayName;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('従業員リストの読み込みエラー:', error);
        showError('従業員リストの読み込みに失敗しました');
    }
}

/**
 * 現場フィルターリストの読み込み（Firebase v8対応版）
 */
async function loadSiteFilterList() {
    try {
        const tenantId = getCurrentTenantId();
        const querySnapshot = await getAttendanceCollection().get();

        // 管理者が設定した現場を取得
        const managedSites = tenantId ? await getTenantSites(tenantId) : [];
        const managedSiteNames = new Set(managedSites.map(site => site.name));

        const usedSites = new Set();

        // すべての勤怠記録から現場名を抽出
        querySnapshot.forEach(doc => {
            const record = doc.data();
            if (record.siteName) {
                usedSites.add(record.siteName);
            }
        });

        const select = getElement('filter-site');
        if (!select) {
            return;
        }

        // 既存のオプションをクリア（最初の「全ての現場」オプションは残す）
        while (select.options.length > 1) {
            select.remove(1);
        }

        // 現場リストを構築（管理現場を優先、その後その他の現場）
        const allSites = [];

        // 1. 管理者が設定した現場（使用されているもの）
        managedSites.forEach(site => {
            if (usedSites.has(site.name)) {
                allSites.push({
                    name: site.name,
                    category: 'managed',
                    displayName: `🏢 ${site.name}`
                });
            }
        });

        // 2. その他の現場（自由入力等）
        Array.from(usedSites).forEach(siteName => {
            if (!managedSiteNames.has(siteName)) {
                allSites.push({
                    name: siteName,
                    category: 'other',
                    displayName: `📍 ${siteName}`
                });
            }
        });

        // ソート: 管理現場を先に、アルファベット順
        allSites.sort((a, b) => {
            if (a.category !== b.category) {
                return a.category === 'managed' ? -1 : 1;
            }
            return a.name.localeCompare(b.name, 'ja');
        });

        // オプションを追加
        allSites.forEach(site => {
            const option = document.createElement('option');
            option.value = site.name;
            option.textContent = site.displayName;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('現場フィルター読み込みエラー:', error);
        showError('現場リストの読み込みに失敗しました');
    }
}

/**
 * スーパー管理者向けの全テナント勤怠データ読み込み
 */
async function loadAttendanceDataForSuperAdmin(activeTab) {
    try {
        logger.log('Loading attendance data for super admin');
        
        // 全テナントのデータを取得
        const allData = [];
        
        // 全テナントを取得
        const tenantsSnapshot = await firebase.firestore().collection('tenants').get();
        
        for (const tenantDoc of tenantsSnapshot.docs) {
            const tenantId = tenantDoc.id;
            const tenantData = tenantDoc.data();
            
            // 各テナントの勤怠データを取得
            let query = firebase.firestore().collection(`tenants/${tenantId}/attendance`);
            
            // フィルター条件の適用
            if (activeTab === 'daily') {
                const filterDate = getElement('filter-date')?.value;
                if (filterDate) {
                    query = query.where('date', '==', filterDate);
                }
            } else if (activeTab === 'monthly') {
                const filterMonth = getElement('filter-month')?.value;
                if (filterMonth) {
                    const startDate = `${filterMonth}-01`;
                    const endDate = `${filterMonth}-31`;
                    query = query.where('date', '>=', startDate).where('date', '<=', endDate);
                }
            } else if (activeTab === 'employee') {
                const employeeId = getElement('filter-employee')?.value;
                if (employeeId) {
                    query = query.where('userId', '==', employeeId);
                }
            } else if (activeTab === 'site') {
                const siteName = getElement('filter-site')?.value;
                if (siteName) {
                    query = query.where('siteName', '==', siteName);
                }
            }
            
            query = query.orderBy('date', 'desc');
            
            const attendanceSnapshot = await query.get();
            
            // テナント情報を追加してデータを収集
            attendanceSnapshot.docs.forEach(doc => {
                allData.push({
                    id: doc.id,
                    tenantId: tenantId,
                    tenantName: tenantData.companyName || tenantId,
                    ...doc.data()
                });
            });
        }
        
        // 日付でソート
        allData.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        
        // 従業員情報を結合
        await enrichAttendanceDataWithUserInfoForSuperAdmin(allData);
        
        logger.log('Super admin loaded records:', allData.length);
        
        // グローバル currentData 配列を更新
        currentData = allData;
        
        // ソート機能を適用（テーブル描画も含む）
        applySortToTable();
        
    } catch (error) {
        console.error('Error loading super admin attendance data:', error);
        showError('スーパー管理者データの読み込みでエラーが発生しました: ' + error.message);
    }
}

/**
 * 勤怠データの読み込み（Firebase v8対応版）
 */
async function loadAttendanceData() {
    try {
        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
        if (!activeTab) return;

        // スーパー管理者の場合は全テナントのデータを取得
        if (window.currentUser && window.currentUser.role === 'super_admin') {
            await loadAttendanceDataForSuperAdmin(activeTab);
            return;
        }

        let query = getAttendanceCollection();
        let filteredData = [];

        // フィルター条件の適用
        if (activeTab === 'daily') {
            const filterDate = getElement('filter-date')?.value;
            if (filterDate) {
                query = query.where('date', '==', filterDate);
            }
        } else if (activeTab === 'monthly') {
            const filterMonth = getElement('filter-month')?.value;
            if (filterMonth) {
                // 月の最初と最後の日付を計算
                const startDate = `${filterMonth}-01`;
                const endDate = `${filterMonth}-31`;
                query = query.where('date', '>=', startDate).where('date', '<=', endDate);
            }
        } else if (activeTab === 'employee') {
            const employeeSelect = getElement('filter-employee');
            const employeeId = employeeSelect?.value;
            if (employeeId) {
                query = query.where('userId', '==', employeeId);
            }
        } else if (activeTab === 'site') {
            const siteSelect = getElement('filter-site');
            const siteName = siteSelect?.value;
            if (siteName) {
                query = query.where('siteName', '==', siteName);
            }
        }

        // 日付でソート
        query = query.orderBy('date', 'desc');

        const querySnapshot = await query.get();

        // データを配列に変換
        filteredData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // 従業員情報を結合
        await enrichAttendanceDataWithUserInfo(filteredData);

        // 休憩データも取得
        await loadBreakDataForRecords(filteredData);

        // グローバル currentData 配列を更新
        currentData = filteredData;

        // ソート機能を適用（テーブル描画も含む）
        applySortToTable();

    } catch (error) {
        console.error('勤怠データ読み込みエラー:', error);
        showError('勤怠データの読み込みに失敗しました: ' + error.message);
    }
}

/**
 * スーパー管理者用：全テナントの勤怠データに従業員情報を結合
 * @param {Array} attendanceData 勤怠データ配列
 */
async function enrichAttendanceDataWithUserInfoForSuperAdmin(attendanceData) {
    try {
        // テナントごとにユーザー情報を取得
        const tenantUserMaps = {};
        
        // 各テナントのユーザー情報を取得
        const uniqueTenantIds = [...new Set(attendanceData.map(record => record.tenantId))];
        
        for (const tenantId of uniqueTenantIds) {
            try {
                const usersSnapshot = await firebase.firestore()
                    .collection('tenants')
                    .doc(tenantId)
                    .collection('users')
                    .get();
                
                const userMap = {};
                usersSnapshot.forEach(doc => {
                    const userData = doc.data();
                    userMap[doc.id] = userData;
                });
                
                tenantUserMaps[tenantId] = userMap;
            } catch (error) {
                console.error(`テナント${tenantId}のユーザー情報取得に失敗:`, error);
                tenantUserMaps[tenantId] = {};
            }
        }
        
        // 勤怠データに従業員情報を結合
        attendanceData.forEach(record => {
            const userMap = tenantUserMaps[record.tenantId];
            if (userMap && record.userId) {
                const userInfo = userMap[record.userId];
                if (userInfo) {
                    record.displayName = userInfo.displayName;
                    record.userName = userInfo.displayName || userInfo.email;
                }
            }
        });
        
    } catch (error) {
        console.error('スーパー管理者用従業員情報の取得に失敗しました:', error);
    }
}

/**
 * 勤怠データに従業員情報を結合
 * @param {Array} attendanceData 勤怠データ配列
 */
async function enrichAttendanceDataWithUserInfo(attendanceData) {
    try {
        const tenantId = getCurrentTenantId();
        if (!tenantId) return;
        
        // 従業員情報を取得
        const usersSnapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .get();
        
        // ユーザーIDからユーザー情報へのマップを作成
        const userMap = {};
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            userMap[doc.id] = userData;
        });
        
        // 勤怠データに従業員情報を結合
        attendanceData.forEach(record => {
            const userInfo = userMap[record.userId];
            if (userInfo) {
                record.displayName = userInfo.displayName;
                record.userName = userInfo.displayName || userInfo.email;
            }
        });
        
    } catch (error) {
        console.error('従業員情報の取得に失敗しました:', error);
    }
}

/**
 * 各勤怠記録の休憩データを読み込み
 * @param {Array} attendanceData 勤怠データ配列
 */
async function loadBreakDataForRecords(attendanceData) {
    try {
        const promises = attendanceData.map(async (record) => {
            try {
                // テナント対応の休憩データコレクション取得
                const breaksCollection = getBreaksCollection();
                const breakQuery = await breaksCollection
                    .where('attendanceId', '==', record.id)
                    .orderBy('startTime')
                    .get();
                
                record.breakTimes = breakQuery.docs.map(doc => {
                    const breakData = doc.data();
                    return {
                        id: doc.id,
                        start: breakData.startTime,
                        end: breakData.endTime
                    };
                });
                
                return record;
            } catch (error) {
                logger.warn(`休憩データ取得失敗 (${record.id}):`, error);
                record.breakTimes = []; // エラー時は空配列
                return record;
            }
        });
        
        await Promise.all(promises);
        logger.log(`🛑 ${attendanceData.length}件の休憩データを取得しました`);
        
    } catch (error) {
        console.error('❌ 休憩データ取得エラー:', error);
        // エラー時は全レコードに空の休憩時間を設定
        attendanceData.forEach(record => {
            record.breakTimes = [];
        });
    }
}

/**
 * 勤怠テーブルのレンダリング（編集機能統合版）
 */
function renderAttendanceTable(data) {
    const tbody = getElement('attendance-data');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">データがありません</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(record => {
        const breakTime = calculateTotalBreakTime(record.breakTimes || []);
        const workTime = calculateWorkingTime(
            record.startTime,
            record.endTime,
            record.breakTimes || []
        );

        // 🆕 特殊勤務情報の整形
        let specialWorkBadges = '';
        let overtimeInfo = '';

        // 残業時間を表示
        if (record.overtimeMinutes && record.overtimeMinutes > 0) {
            const overtimeHours = Math.floor(record.overtimeMinutes / 60);
            const overtimeMins = record.overtimeMinutes % 60;
            overtimeInfo = `
                <div class="work-time-row overtime">
                    <span class="work-time-label">残業:</span>
                    <span class="work-time-value">${overtimeHours}時間${overtimeMins}分</span>
                </div>`;
        }

        // 有給・代休・休日出勤・夜間勤務のバッジ
        if (record.specialWorkType === 'paid_leave') {
            specialWorkBadges += '<span class="badge badge-leave">🌴 有給休暇</span>';
        } else if (record.specialWorkType === 'compensatory_leave') {
            specialWorkBadges += '<span class="badge badge-leave">🔄 代休</span>';
        } else if (record.specialWorkType === 'absence') {
            specialWorkBadges += '<span class="badge badge-absence">❌ 欠勤</span>';
        } else {
            // 通常勤務系の場合のみ休日・夜間バッジを表示
            if (record.isHolidayWork) {
                specialWorkBadges += '<span class="badge badge-holiday">📅 休日出勤</span>';
            }
            if (record.nightWorkType === 'through_night') {
                specialWorkBadges += '<span class="badge badge-night">🌙 通し夜間</span>';
            } else if (record.nightWorkType === 'night_only') {
                specialWorkBadges += '<span class="badge badge-night">🌙 夜間</span>';
            }
        }

        return `
            <tr>
                <td>${record.displayName || record.userName || record.userEmail || '-'}</td>
                <td>${formatDate(record.date)}</td>
                <td>${record.siteName || '-'}</td>
                <td>
                    <div class="work-times">
                        <div class="work-time-row">
                            <span class="work-time-label">出勤:</span>
                            <span class="work-time-value">${formatTime(record.startTime)}</span>
                        </div>
                        <div class="work-time-row">
                            <span class="work-time-label">退勤:</span>
                            <span class="work-time-value">${formatTime(record.endTime)}</span>
                        </div>
                        <div class="work-time-row break">
                            <span class="work-time-label">休憩:</span>
                            <span class="work-time-value">${breakTime.formatted || '0時間0分'}</span>
                        </div>
                        <div class="work-time-row total">
                            <span class="work-time-label">実労働:</span>
                            <span class="work-time-value">${workTime.formatted || '0時間0分'}</span>
                        </div>
                        ${overtimeInfo}
                        ${specialWorkBadges ? `<div class="work-badges">${specialWorkBadges}</div>` : ''}
                    </div>
                </td>
                <td>
                    <button onclick="showEditDialog(${JSON.stringify(record).replace(/"/g, '&quot;')})"
                            class="btn btn-sm btn-primary edit-btn">
                        🔧 編集
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 管理者イベントの設定
 */
function setupAdminEvents() {
    // CSV出力ボタン
    const exportBtn = getElement('export-csv');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }

    // 特殊勤務CSV出力ボタン
    const exportSpecialWorkBtn = getElement('export-special-work-csv');
    if (exportSpecialWorkBtn) {
        exportSpecialWorkBtn.addEventListener('click', exportSpecialWorkToCSV);
    }

    // フィルター変更イベント
    const filterInputs = document.querySelectorAll('#filter-date, #filter-month, #filter-employee, #filter-site');
    filterInputs.forEach((input) => {
        input.addEventListener('change', () => {
            loadAttendanceData();
        });
    });

    // 設定タブ: 休憩時間設定フォーム
    const breakTimeSettingsForm = document.getElementById('break-time-settings-form');
    if (breakTimeSettingsForm && !breakTimeSettingsForm.hasAttribute('data-listener-set')) {
        breakTimeSettingsForm.addEventListener('submit', saveBreakTimeSettings);
        breakTimeSettingsForm.setAttribute('data-listener-set', 'true');
    }

    // 設定タブ: リセットボタン
    const resetBreakSettings = document.getElementById('reset-break-settings');
    if (resetBreakSettings && !resetBreakSettings.hasAttribute('data-listener-set')) {
        resetBreakSettings.addEventListener('click', resetBreakTimeSettings);
        resetBreakSettings.setAttribute('data-listener-set', 'true');
    }

}

/**
 * CSV出力関数
 */
async function exportToCSV() {
    let exportBtn = null;

    try {
        // ローディング表示
        exportBtn = getElement('export-csv');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = 'CSV出力中...';
        }

        // Firebase初期化確認
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('Firebaseが初期化されていません');
        }

        // 認証状態確認
        const currentUser = window.getCurrentUser ? window.getCurrentUser() : window.currentUser;

        if (!currentUser) {
            throw new Error('認証が必要です。再度ログインしてください。');
        }

        if (typeof currentUser === 'string') {
            console.error('不正な認証状態:', currentUser);
            throw new Error('認証状態が不正です。再度ログインしてください。');
        }

        // テナント情報確認
        if (!window.currentTenant && currentUser.tenantId) {
            if (typeof window.loadTenantInfo === 'function') {
                try {
                    const tenantInfo = await window.loadTenantInfo(currentUser.tenantId);
                    if (tenantInfo) {
                        window.currentTenant = tenantInfo;
                    }
                } catch (tenantError) {
                    console.error('テナント情報取得エラー:', tenantError);
                }
            }
        }

        const data = await getCurrentFilteredData();

        if (!data || data.length === 0) {
            showToast('出力するデータがありません', 'warning');
            return;
        }

        const csvContent = generateCSVContent(data);
        if (!csvContent) {
            throw new Error('CSVコンテンツの生成に失敗しました');
        }

        const filename = generateCSVFilename();

        downloadCSV(csvContent, filename);

        showToast(`${data.length}件のデータをCSV出力しました`, 'success');

    } catch (error) {
        console.error('CSV出力エラー:', {
            name: error.name,
            message: error.message,
            code: error.code
        });

        let errorMessage = 'CSV出力に失敗しました';
        if (error.code === 'permission-denied') {
            errorMessage = 'データアクセス権限がありません。管理者にお問い合わせください。';
        } else if (error.message.includes('認証')) {
            errorMessage = '認証エラーです。再度ログインしてください。';
        } else if (error.message.includes('network') || error.message.includes('NETWORK_ERROR')) {
            errorMessage = 'ネットワークエラーです。接続を確認してください。';
        } else if (error.message.includes('Firebaseが初期化')) {
            errorMessage = 'システムの初期化中です。しばらく待ってから再試行してください。';
        } else if (error.message.includes('コレクション')) {
            errorMessage = 'データベース接続エラーです。管理者にお問い合わせください。';
        }

        showToast(errorMessage, 'error');
    } finally {
        // ボタンを元に戻す
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = 'CSV出力';
        }
    }
}

/**
 * CSVファイル名を生成
 */
function generateCSVFilename() {
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
    const today = getTodayString();
    let prefix = 'attendance';
    let suffix = '';
    
    // タブごとにファイル名を変更
    switch (activeTab) {
        case 'daily':
            const filterDate = getElement('filter-date')?.value;
            if (filterDate) {
                suffix = `_daily_${filterDate}`;
            } else {
                suffix = '_daily';
            }
            break;
        case 'monthly':
            const filterMonth = getElement('filter-month')?.value;
            if (filterMonth) {
                suffix = `_monthly_${filterMonth}`;
            } else {
                suffix = '_monthly';
            }
            break;
        case 'employee':
            const employeeSelect = getElement('filter-employee');
            const employeeName = employeeSelect?.selectedOptions[0]?.text || '';
            if (employeeName && employeeName !== '全員') {
                suffix = `_employee_${employeeName.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')}`;
            } else {
                suffix = '_employee';
            }
            break;
        case 'site':
            const siteName = getElement('filter-site')?.value;
            if (siteName) {
                suffix = `_site_${siteName.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')}`;
            } else {
                suffix = '_site';
            }
            break;
        default:
            suffix = '_all';
    }
    
    // テナント情報があれば追加
    const tenantInfo = window.currentTenant;
    if (tenantInfo && tenantInfo.companyName) {
        const companyName = tenantInfo.companyName.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
        prefix = `${companyName}_${prefix}`;
    }
    
    return `${prefix}${suffix}_${today}.csv`;
}

/**
 * 現在のフィルター設定でデータを取得
 */
async function getCurrentFilteredData() {
    try {
        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');

        if (!activeTab) {
            return [];
        }

        // テナント対応の勤怠データコレクション取得
        let query;
        try {
            query = getAttendanceCollection();
        } catch (collectionError) {
            console.error('勤怠コレクション取得エラー:', {
                error: collectionError,
                message: collectionError.message,
                code: collectionError.code
            });
            throw new Error(`データベースコレクションの取得に失敗しました: ${collectionError.message}`);
        }

        // フィルター条件の適用
        if (activeTab === 'daily') {
            const filterDate = getElement('filter-date')?.value;
            if (filterDate) {
                query = query.where('date', '==', filterDate);
            }
        } else if (activeTab === 'monthly') {
            const filterMonth = getElement('filter-month')?.value;
            if (filterMonth) {
                const startDate = `${filterMonth}-01`;
                const endDate = `${filterMonth}-31`;
                query = query.where('date', '>=', startDate).where('date', '<=', endDate);
            }
        } else if (activeTab === 'employee') {
            const employeeId = getElement('filter-employee')?.value;
            if (employeeId) {
                query = query.where('userId', '==', employeeId);
            }
        } else if (activeTab === 'site') {
            const siteName = getElement('filter-site')?.value;
            if (siteName) {
                query = query.where('siteName', '==', siteName);
            }
        }

        // ソート条件を追加
        const sortField = getElement('sort-field')?.value || 'date';
        const sortDirection = getElement('sort-direction')?.value || 'desc';

        try {
            query = query.orderBy(sortField, sortDirection);
        } catch (sortError) {
            query = query.orderBy('date', 'desc');
        }

        let querySnapshot;
        let needsClientSideSort = false;

        try {
            querySnapshot = await query.get();
        } catch (queryError) {
            // インデックスエラーの場合、orderByを除去して再試行（想定内の動作）
            if (queryError.code === 'failed-precondition' && queryError.message.includes('index')) {
                console.info('[getCurrentFilteredData] 複合インデックス未設定のためフォールバック処理を実行');

                // 新しいクエリを作成（orderByなし）
                let fallbackQuery = getAttendanceCollection();

                // フィルター条件のみ適用
                if (activeTab === 'daily') {
                    const filterDate = getElement('filter-date')?.value;
                    if (filterDate) {
                        fallbackQuery = fallbackQuery.where('date', '==', filterDate);
                    }
                } else if (activeTab === 'monthly') {
                    const filterMonth = getElement('filter-month')?.value;
                    if (filterMonth) {
                        const startDate = `${filterMonth}-01`;
                        const endDate = `${filterMonth}-31`;
                        fallbackQuery = fallbackQuery.where('date', '>=', startDate).where('date', '<=', endDate);
                    }
                } else if (activeTab === 'employee') {
                    const employeeId = getElement('filter-employee')?.value;
                    if (employeeId) {
                        fallbackQuery = fallbackQuery.where('userId', '==', employeeId);
                    }
                } else if (activeTab === 'site') {
                    const siteName = getElement('filter-site')?.value;
                    if (siteName) {
                        fallbackQuery = fallbackQuery.where('siteName', '==', siteName);
                    }
                }

                try {
                    querySnapshot = await fallbackQuery.get();
                    needsClientSideSort = true;
                    console.info('[getCurrentFilteredData] フォールバック成功 - クライアント側でソート処理');
                } catch (fallbackError) {
                    console.error('フォールバッククエリも失敗:', fallbackError);
                    throw new Error(`データベースクエリの実行に失敗しました: ${fallbackError.message}`);
                }
            } else {
                // インデックスエラー以外は本当のエラーとしてログ出力
                console.error('Firestoreクエリ実行エラー:', {
                    error: queryError,
                    message: queryError.message,
                    code: queryError.code
                });
                // 具体的なエラーメッセージを生成
                let errorMessage = 'データベースクエリの実行に失敗しました';
                if (queryError.code === 'permission-denied') {
                    errorMessage = 'データアクセス権限がありません。管理者権限を確認してください。';
                } else if (queryError.code === 'unavailable') {
                    errorMessage = 'データベースサービスが一時的に利用できません。';
                } else if (queryError.code === 'unauthenticated') {
                    errorMessage = '認証が無効です。再度ログインしてください。';
                }

                throw new Error(`${errorMessage} (${queryError.code}: ${queryError.message})`);
            }
        }

        let data = querySnapshot.docs.map(doc => {
            try {
                return {
                    id: doc.id,
                    ...doc.data()
                };
            } catch (docError) {
                return {
                    id: doc.id,
                    error: `データ取得エラー: ${docError.message}`
                };
            }
        });

        // クライアント側でソートが必要な場合
        if (needsClientSideSort && data.length > 0) {
            console.info(`[getCurrentFilteredData] クライアント側ソート実行: ${sortField} ${sortDirection}`);
            data.sort((a, b) => {
                const aVal = a[sortField] || '';
                const bVal = b[sortField] || '';
                if (sortDirection === 'asc') {
                    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                } else {
                    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
                }
            });
        }

        if (data.length === 0) {
            return data;
        }

        // ユーザー情報とマージ
        try {
            await enrichDataWithUserInfo(data);
        } catch (userError) {
            // ユーザー情報取得に失敗してもCSV出力は続行
        }

        // 休憩データも取得
        try {
            await loadBreakDataForRecords(data);
        } catch (breakError) {
            // 休憩データ取得に失敗してもCSV出力は続行
        }

        return data;

    } catch (error) {
        console.error('CSV用データ取得エラー:', {
            message: error.message,
            code: error.code
        });
        throw error;
    }
}

/**
 * ユーザー情報を勤怠データにマージ
 */
async function enrichDataWithUserInfo(data) {
    try {
        const userIds = [...new Set(data.map(record => record.userId).filter(Boolean))];
        const usersCollection = getUsersCollection();
        
        const userPromises = userIds.map(async (userId) => {
            try {
                const userDoc = await usersCollection.doc(userId).get();
                return userDoc.exists ? { id: userId, ...userDoc.data() } : null;
            } catch (error) {
                logger.warn(`ユーザー情報取得失敗 (${userId}):`, error);
                return null;
            }
        });
        
        const users = (await Promise.all(userPromises)).filter(Boolean);
        const userMap = new Map(users.map(user => [user.id, user]));
        
        // 勤怠データにユーザー情報をマージ
        data.forEach(record => {
            const user = userMap.get(record.userId);
            if (user) {
                record.userName = user.displayName || user.email || record.userId;
                record.userEmail = user.email || '';
            } else {
                record.userName = record.userId || '不明';
                record.userEmail = '';
            }
        });
        
        logger.log(`👥 ${users.length}名のユーザー情報をマージしました`);
    } catch (error) {
        console.error('❌ ユーザー情報のマージに失敗:', error);
    }
}

/**
 * CSV形式のコンテンツを生成
 */
function generateCSVContent(data) {
    // より詳細なヘッダーを追加
    const headers = [
        '従業員名',
        'メールアドレス', 
        '日付',
        '曜日',
        '現場名',
        '出勤時間',
        '退勤時間',
        '休憩時間',
        '実労働時間',
        '休憩回数',
        'メモ',
        '作成日時',
        '更新日時'
    ];
    
    const rows = data.map(record => {
        const recordDate = new Date(record.date);
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][recordDate.getDay()];

        // 休憩時間の計算（breakTimes配列 or breakMinutes/breakDuration フィールド）
        let breakTime;
        const breakTimesArray = record.breakTimes || [];
        if (breakTimesArray.length > 0) {
            breakTime = calculateTotalBreakTime(breakTimesArray);
        } else {
            // breakMinutes または breakDuration から計算
            const breakMins = record.breakMinutes || record.breakDuration || 0;
            const hours = Math.floor(breakMins / 60);
            const minutes = breakMins % 60;
            breakTime = {
                minutes: breakMins,
                formatted: `${hours}時間${minutes}分`
            };
        }

        // 実労働時間の計算
        let workTime;
        if (breakTimesArray.length > 0) {
            workTime = calculateWorkingTime(record.startTime, record.endTime, breakTimesArray);
        } else if (record.workingMinutes !== undefined && record.workingMinutes !== null) {
            // データベースに保存された workingMinutes を使用
            const hours = Math.floor(record.workingMinutes / 60);
            const minutes = record.workingMinutes % 60;
            workTime = {
                minutes: record.workingMinutes,
                formatted: `${hours}時間${minutes}分`
            };
        } else if (record.startTime && record.endTime) {
            // 開始・終了時刻と休憩時間から計算
            const start = parseJapaneseTime(record.startTime);
            const end = parseJapaneseTime(record.endTime);
            if (start && end && end > start) {
                const totalMins = Math.floor((end - start) / (1000 * 60));
                const workMins = totalMins - (breakTime.minutes || 0);
                const hours = Math.floor(workMins / 60);
                const minutes = workMins % 60;
                workTime = {
                    minutes: workMins,
                    formatted: `${hours}時間${minutes}分`
                };
            } else {
                workTime = { minutes: 0, formatted: '計算エラー' };
            }
        } else {
            workTime = { minutes: 0, formatted: '-' };
        }

        return [
            record.userName || '不明',
            record.userEmail || '',
            formatDate(record.date),
            dayOfWeek,
            record.siteName || '',
            formatTime(record.startTime),
            formatTime(record.endTime) || (record.startTime ? '未退勤' : ''),
            breakTime.formatted || '0時間0分',
            workTime.formatted || (record.endTime ? '0時間0分' : '計算不可'),
            (record.breakTimes || []).length || '0',
            (record.notes || '').replace(/\n/g, ' '), // 改行をスペースに変換
            formatDateTime(record.createdAt),
            formatDateTime(record.updatedAt)
        ];
    });
    
    const csvArray = [headers, ...rows];
    return csvArray.map(row => 
        row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

/**
 * 日時をフォーマット（CSV用）
 */
function formatDateTime(timestamp) {
    if (!timestamp) return '';
    
    let date;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else {
        date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * CSVファイルをダウンロード
 */
function downloadCSV(csvContent, filename) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ========================================
// 🆕 特殊勤務CSV出力機能
// ========================================

/**
 * 特殊勤務データをCSV出力
 */
async function exportSpecialWorkToCSV() {
    let exportBtn = null;

    try {
        // ローディング表示
        exportBtn = getElement('export-special-work-csv');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = '特殊勤務CSV出力中...';
        }

        // Firebase初期化確認
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('Firebaseが初期化されていません');
        }

        // 認証状態確認
        const currentUser = window.getCurrentUser ? window.getCurrentUser() : window.currentUser;

        if (!currentUser) {
            throw new Error('認証が必要です。再度ログインしてください。');
        }

        if (typeof currentUser === 'string') {
            console.error('不正な認証状態:', currentUser);
            throw new Error('認証状態が不正です。再度ログインしてください。');
        }

        const data = await getCurrentFilteredData();

        if (!data || data.length === 0) {
            showToast('出力するデータがありません', 'warning');
            return;
        }

        // 🆕 特殊勤務データのみフィルタリング（オプション：全データでもOK）
        const csvContent = generateSpecialWorkCSVContent(data);
        if (!csvContent) {
            throw new Error('特殊勤務CSVコンテンツの生成に失敗しました');
        }

        const filename = generateSpecialWorkCSVFilename();

        downloadCSV(csvContent, filename);

        showToast(`${data.length}件の特殊勤務データをCSV出力しました`, 'success');

    } catch (error) {
        console.error('特殊勤務CSV出力エラー:', {
            name: error.name,
            message: error.message,
            code: error.code
        });

        let errorMessage = '特殊勤務CSV出力に失敗しました';
        if (error.code === 'permission-denied') {
            errorMessage = 'データアクセス権限がありません。管理者にお問い合わせください。';
        } else if (error.message.includes('認証')) {
            errorMessage = '認証エラーです。再度ログインしてください。';
        } else if (error.message.includes('network') || error.message.includes('NETWORK_ERROR')) {
            errorMessage = 'ネットワークエラーです。接続を確認してください。';
        }

        showToast(errorMessage, 'error');
    } finally {
        // ボタンを元に戻す
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = '特殊勤務CSV出力';
        }
    }
}

/**
 * 特殊勤務データ用のCSVコンテンツを生成
 */
function generateSpecialWorkCSVContent(data) {
    // 特殊勤務データに特化したヘッダー
    const headers = [
        '従業員名',
        'メールアドレス',
        '日付',
        '曜日',
        '現場名',
        '出勤時間',
        '退勤時間',
        '休憩時間（分）',
        '実働時間（分）',
        '実働時間（時:分）',
        '残業時間（分）',
        '残業時間（時:分）',
        '特殊勤務区分',
        '休日出勤',
        '夜間勤務区分',
        'メモ'
    ];

    const rows = data.map(record => {
        const recordDate = new Date(record.date);
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][recordDate.getDay()];

        // 実働時間（分）
        const workingMinutes = record.workingMinutes || 0;
        const workingHours = Math.floor(workingMinutes / 60);
        const workingMins = workingMinutes % 60;
        const workingTimeFormatted = `${workingHours}:${String(workingMins).padStart(2, '0')}`;

        // 残業時間（分）
        const overtimeMinutes = record.overtimeMinutes || 0;
        const overtimeHours = Math.floor(overtimeMinutes / 60);
        const overtimeMins = overtimeMinutes % 60;
        const overtimeTimeFormatted = `${overtimeHours}:${String(overtimeMins).padStart(2, '0')}`;

        // 特殊勤務区分
        let specialWorkLabel = '通常勤務';
        if (record.specialWorkType === 'paid_leave') {
            specialWorkLabel = '有給休暇';
        } else if (record.specialWorkType === 'compensatory_leave') {
            specialWorkLabel = '代休';
        } else if (record.specialWorkType === 'holiday_work') {
            specialWorkLabel = '休日出勤';
        } else if (record.specialWorkType === 'through_night') {
            specialWorkLabel = '通し夜間';
        } else if (record.specialWorkType === 'night_only') {
            specialWorkLabel = '夜間のみ';
        } else if (record.specialWorkType === 'overtime') {
            specialWorkLabel = '残業';
        }

        // 夜間勤務区分
        let nightWorkLabel = 'なし';
        if (record.nightWorkType === 'through_night') {
            nightWorkLabel = '通し夜間';
        } else if (record.nightWorkType === 'night_only') {
            nightWorkLabel = '夜間のみ';
        }

        return [
            record.userName || '不明',
            record.userEmail || '',
            formatDate(record.date),
            dayOfWeek,
            record.siteName || '',
            formatTime(record.startTime),
            formatTime(record.endTime) || (record.startTime ? '未退勤' : ''),
            record.breakMinutes || record.breakDuration || 0,
            workingMinutes,
            workingTimeFormatted,
            overtimeMinutes,
            overtimeTimeFormatted,
            specialWorkLabel,
            record.isHolidayWork ? 'はい' : 'いいえ',
            nightWorkLabel,
            (record.notes || '').replace(/\n/g, ' ') // 改行をスペースに変換
        ];
    });

    const csvArray = [headers, ...rows];
    return csvArray.map(row =>
        row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

/**
 * 特殊勤務CSV用のファイル名を生成
 */
function generateSpecialWorkCSVFilename() {
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
    const today = getTodayString();
    let prefix = 'special_work';
    let suffix = '';

    // タブごとにファイル名を変更
    switch (activeTab) {
        case 'daily':
            const filterDate = getElement('filter-date')?.value;
            if (filterDate) {
                suffix = `_${filterDate}`;
            }
            break;
        case 'monthly':
            const filterMonth = getElement('filter-month')?.value;
            if (filterMonth) {
                suffix = `_${filterMonth}`;
            }
            break;
        case 'employee':
            const filterEmployee = getElement('filter-employee')?.value;
            if (filterEmployee) {
                suffix = `_${filterEmployee.replace(/[@.]/g, '_')}`;
            }
            break;
        case 'site':
            const filterSite = getElement('filter-site')?.value;
            if (filterSite) {
                suffix = `_${filterSite.replace(/\s+/g, '_')}`;
            }
            break;
    }

    return `${prefix}${suffix}_${today}.csv`;
}

// ================== 編集機能のグローバル変数 ==================
let currentEditRecord = null;
let editBreakRecords = [];
let changeHistory = [];

// ================== 編集ダイアログの表示 ==================
function showEditDialog(record) {
    
    currentEditRecord = { ...record };
    editBreakRecords = [];
    
    const dialog = document.getElementById('edit-dialog');
    if (!dialog) {
        createEditDialog();
        return showEditDialog(record);
    }
    
    // フォームに現在の値を設定
    populateEditForm(record);
    
    // 休憩記録を読み込み
    loadBreakRecords(record.id);
    
    // 変更履歴を読み込み
    loadChangeHistory(record.id);
    
    dialog.style.display = 'block';
}

// ================== 編集ダイアログの作成 ==================
function createEditDialog() {
    const dialog = document.createElement('div');
    dialog.id = 'edit-dialog';
    dialog.className = 'modal';
    dialog.innerHTML = `
        <div class="modal-content" style="max-width: 800px; width: 90%;">
            <div class="modal-header">
                <h3>🔧 勤怠記録の編集</h3>
                <span class="close" onclick="closeEditDialog()">&times;</span>
            </div>
            
            <div class="modal-body">
                <!-- 基本情報タブ -->
                <div class="tab-container">
                    <div class="tab-buttons">
                        <button class="tab-btn active" onclick="showEditTab('basic')">基本情報</button>
                        <button class="tab-btn" onclick="showEditTab('breaks')">休憩時間</button>
                        <button class="tab-btn" onclick="showEditTab('history')">変更履歴</button>
                    </div>
                    
                    <!-- 基本情報タブ -->
                    <div id="basic-tab" class="tab-content active">
                        <form id="edit-attendance-form">
                            <div class="form-group">
                                <label for="edit-date">📅 日付:</label>
                                <input type="date" id="edit-date" name="date" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-site-name">🏢 現場名:</label>
                                <input type="text" id="edit-site-name" name="siteName" required>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="edit-start-time">⏰ 出勤時間:</label>
                                    <input type="time" id="edit-start-time" name="startTime" required>
                                </div>
                                
                                <div class="form-group">
                                    <label for="edit-end-time">🏁 退勤時間:</label>
                                    <input type="time" id="edit-end-time" name="endTime">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-status">📊 ステータス:</label>
                                <select id="edit-status" name="status" required>
                                    <option value="working">勤務中</option>
                                    <option value="completed">勤務完了</option>
                                    <option value="break">休憩中</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-notes">📝 メモ:</label>
                                <textarea id="edit-notes" name="notes" rows="3"></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-reason">✏️ 変更理由 (必須):</label>
                                <textarea id="edit-reason" placeholder="変更の理由を記入してください..." rows="2" required></textarea>
                            </div>
                        </form>
                    </div>
                    
                    <!-- 休憩時間タブ -->
                    <div id="breaks-tab" class="tab-content">
                        <div class="breaks-header">
                            <h4>☕ 休憩時間の管理</h4>
                            <button type="button" onclick="addNewBreak()" class="btn btn-primary">
                                ➕ 休憩時間を追加
                            </button>
                        </div>
                        
                        <div id="breaks-list" class="breaks-list">
                            <!-- 休憩記録がここに表示される -->
                        </div>
                        
                        <div class="total-break-time">
                            <strong>📊 合計休憩時間: <span id="total-break-display">0時間0分</span></strong>
                        </div>
                    </div>
                    
                    <!-- 変更履歴タブ -->
                    <div id="history-tab" class="tab-content">
                        <h4>📜 変更履歴</h4>
                        <div id="change-history-list" class="history-list">
                            <!-- 変更履歴がここに表示される -->
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal-footer">
                <button type="button" onclick="closeEditDialog()" class="btn btn-secondary">キャンセル</button>
                <button type="button" onclick="deleteEditAttendanceRecord()" class="btn btn-danger">🗑️ 削除</button>
                <button type="button" onclick="saveAttendanceChanges()" class="btn btn-success">💾 保存</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // ダイアログ外クリックで閉じる
    dialog.addEventListener('click', function(e) {
        if (e.target === dialog) {
            closeEditDialog();
        }
    });
}

// ================== フォームに値を設定 ==================
function populateEditForm(record) {
    document.getElementById('edit-date').value = record.date || '';
    document.getElementById('edit-site-name').value = record.siteName || '';
    
    // 時間フォーマットの変換
    document.getElementById('edit-start-time').value = convertToTimeInput(record.startTime);
    document.getElementById('edit-end-time').value = convertToTimeInput(record.endTime);
    
    document.getElementById('edit-status').value = record.status || 'working';
    document.getElementById('edit-notes').value = record.notes || '';
    document.getElementById('edit-reason').value = '';
}

// ================== 時間フォーマット変換 ==================
function convertToTimeInput(timeString) {
    if (!timeString) return '';
    
    // "HH:MM:SS" または "HH:MM" を "HH:MM" に変換
    const parts = timeString.split(':');
    if (parts.length >= 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    return '';
}

function convertFromTimeInput(timeInput) {
    if (!timeInput) return '';
    return `${timeInput}:00`;
}

// ================== 休憩記録の読み込み ==================
async function loadBreakRecords(attendanceId) {
    
    try {
        const tenantId = getCurrentTenantId();
        const query = firebase.firestore()
            .collection('tenants').doc(tenantId)
            .collection('breaks')
            .where('attendanceId', '==', attendanceId);
        
        const snapshot = await query.get();
        
        editBreakRecords = [];
        snapshot.forEach(doc => {
            editBreakRecords.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // 開始時間でソート
        editBreakRecords.sort((a, b) => {
            const timeA = a.startTime || '';
            const timeB = b.startTime || '';
            return timeA.localeCompare(timeB);
        });
        
        displayBreakRecords();
        calculateTotalBreakTimeDisplay();
        
    } catch (error) {
        showErrorMessage('休憩記録の読み込みに失敗しました');
    }
}

// ================== 休憩記録の表示 ==================
function displayBreakRecords() {
    const breaksList = document.getElementById('breaks-list');
    
    if (editBreakRecords.length === 0) {
        breaksList.innerHTML = `
            <div class="no-breaks">
                <p>📋 休憩記録がありません</p>
                <p>「休憩時間を追加」ボタンで追加できます</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    editBreakRecords.forEach((breakRecord, index) => {
        if (breakRecord.isDeleted) return; // 削除予定の記録は表示しない
        
        html += `
            <div class="break-item" data-index="${index}">
                <div class="break-header">
                    <span class="break-number">休憩 ${index + 1}</span>
                    <button type="button" onclick="removeBreak(${index})" class="btn-remove">🗑️</button>
                </div>
                
                <div class="break-times">
                    <div class="time-group">
                        <label>開始時間:</label>
                        <input type="time" 
                               value="${convertToTimeInput(breakRecord.startTime)}" 
                               onchange="updateBreakTime(${index}, 'startTime', this.value)"
                               required>
                    </div>
                    
                    <div class="time-group">
                        <label>終了時間:</label>
                        <input type="time" 
                               value="${convertToTimeInput(breakRecord.endTime)}" 
                               onchange="updateBreakTime(${index}, 'endTime', this.value)">
                    </div>
                    
                    <div class="break-duration">
                        <span>⏱️ ${calculateBreakDuration(breakRecord)}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    breaksList.innerHTML = html;
}

// ================== 休憩時間の計算 ==================
function calculateBreakDuration(breakRecord) {
    if (!breakRecord.startTime || !breakRecord.endTime) {
        return '進行中';
    }
    
    const start = new Date(`2000-01-01 ${breakRecord.startTime}`);
    const end = new Date(`2000-01-01 ${breakRecord.endTime}`);
    
    if (end <= start) {
        return '無効';
    }
    
    const diffMs = end - start;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    
    return `${hours}時間${minutes}分`;
}

// ================== 合計休憩時間の計算 ==================
function calculateTotalBreakTimeDisplay() {
    let totalMinutes = 0;
    
    editBreakRecords.forEach(breakRecord => {
        if (breakRecord.isDeleted) return;
        
        if (breakRecord.startTime && breakRecord.endTime) {
            const start = new Date(`2000-01-01 ${breakRecord.startTime}`);
            const end = new Date(`2000-01-01 ${breakRecord.endTime}`);
            
            if (end > start) {
                const diffMs = end - start;
                totalMinutes += Math.floor(diffMs / (1000 * 60));
            }
        }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    const totalDisplay = document.getElementById('total-break-display');
    if (totalDisplay) {
        totalDisplay.textContent = `${hours}時間${minutes}分`;
    }
}

// ================== 新しい休憩記録の追加 ==================
function addNewBreak() {
    const newBreak = {
        id: `temp_${Date.now()}`, // 一時的なID
        attendanceId: currentEditRecord.id,
        userId: currentEditRecord.userId,
        startTime: '',
        endTime: '',
        date: currentEditRecord.date,
        isNew: true // 新規追加フラグ
    };
    
    editBreakRecords.push(newBreak);
    displayBreakRecords();
    calculateTotalBreakTimeDisplay();
}

// ================== 休憩記録の削除 ==================
function removeBreak(index) {
    if (confirm('この休憩記録を削除しますか？')) {
        const breakRecord = editBreakRecords[index];
        
        // 既存記録の場合は削除フラグを設定
        if (!breakRecord.isNew) {
            breakRecord.isDeleted = true;
        } else {
            // 新規追加の場合は配列から削除
            editBreakRecords.splice(index, 1);
        }
        
        displayBreakRecords();
        calculateTotalBreakTimeDisplay();
    }
}

// ================== 休憩時間の更新 ==================
function updateBreakTime(index, field, value) {
    if (editBreakRecords[index]) {
        editBreakRecords[index][field] = convertFromTimeInput(value);
        editBreakRecords[index].isModified = true;
        displayBreakRecords();
        calculateTotalBreakTimeDisplay();
    }
}

// ================== 変更履歴の読み込み ==================
async function loadChangeHistory(attendanceId) {
    
    try {
        const query = firebase.firestore()
            .collection('attendance_history')
            .where('attendanceId', '==', attendanceId);
        
        const snapshot = await query.get();
        
        changeHistory = [];
        snapshot.forEach(doc => {
            changeHistory.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // 手動でソート（タイムスタンプの降順）
        changeHistory.sort((a, b) => {
            const timeA = a.timestamp ? a.timestamp.seconds : 0;
            const timeB = b.timestamp ? b.timestamp.seconds : 0;
            return timeB - timeA;
        });
        
        displayChangeHistory();
        
    } catch (error) {
        displayChangeHistoryError();
    }
}

// ================== 変更履歴の表示 ==================
function displayChangeHistory() {
    const historyList = document.getElementById('change-history-list');
    
    if (changeHistory.length === 0) {
        historyList.innerHTML = `
            <div class="no-history">
                <p>📋 変更履歴がありません</p>
                <p>この記録はまだ編集されていません</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    changeHistory.forEach(history => {
        const timestamp = history.timestamp ? 
            new Date(history.timestamp.seconds * 1000).toLocaleString('ja-JP') : 
            '不明';
        
        html += `
            <div class="history-item">
                <div class="history-header">
                    <span class="history-date">📅 ${timestamp}</span>
                    <span class="history-user">👤 ${history.changedBy || '不明'}</span>
                </div>
                
                <div class="history-reason">
                    <strong>理由:</strong> ${history.reason || '記載なし'}
                </div>
                
                <div class="history-changes">
                    <strong>変更内容:</strong>
                    <div class="changes-detail">
                        ${formatChanges(history.changes)}
                    </div>
                </div>
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}

// ================== 変更内容のフォーマット ==================
function formatChanges(changes) {
    if (!changes) return '変更内容が記録されていません';
    
    let html = '<ul>';
    Object.keys(changes).forEach(field => {
        const change = changes[field];
        const fieldName = getFieldDisplayName(field);
        
        html += `
            <li>
                <strong>${fieldName}:</strong> 
                "${change.before}" → "${change.after}"
            </li>
        `;
    });
    html += '</ul>';
    
    return html;
}

// ================== フィールド名の表示用変換 ==================
function getFieldDisplayName(field) {
    const fieldNames = {
        'siteName': '現場名',
        'startTime': '出勤時間',
        'endTime': '退勤時間',
        'status': 'ステータス',
        'notes': 'メモ',
        'date': '日付'
    };
    
    return fieldNames[field] || field;
}

// ================== 変更履歴表示エラー ==================
function displayChangeHistoryError() {
    const historyList = document.getElementById('change-history-list');
    historyList.innerHTML = `
        <div class="history-error">
            <h4>⚠️ 変更履歴の読み込みエラー</h4>
            <p>変更履歴の読み込みで問題が発生しました</p>
            <p>編集機能は正常に動作します</p>
        </div>
    `;
}

// ================== 勤怠記録の保存 ==================
async function saveAttendanceChanges() {
    
    const form = document.getElementById('edit-attendance-form');
    const formData = new FormData(form);
    
    const reason = document.getElementById('edit-reason').value.trim();
    if (!reason) {
        alert('変更理由を入力してください');
        return;
    }
    
    try {
        // 変更内容を検証
        const newData = {
            date: formData.get('date'),
            siteName: formData.get('siteName'),
            startTime: convertFromTimeInput(formData.get('startTime')),
            endTime: convertFromTimeInput(formData.get('endTime')),
            status: formData.get('status'),
            notes: formData.get('notes') || ''
        };
        
        // 変更箇所を特定
        const changes = detectChanges(newData);
        
        if (Object.keys(changes).length === 0 && !hasBreakChanges()) {
            alert('変更がありません');
            return;
        }
        
        // バリデーション
        if (!validateAttendanceData(newData)) {
            return;
        }
        
        // 保存実行
        await saveChangesToFirestore(newData, changes, reason);
        
        alert('✅ 変更を保存しました');
        closeEditDialog();
        
        // 管理者画面のデータを再読み込み
        await loadAttendanceData();
        
    } catch (error) {
        alert('保存中にエラーが発生しました: ' + error.message);
    }
}

// ================== 変更箇所の検出 ==================
function detectChanges(newData) {
    const changes = {};
    
    Object.keys(newData).forEach(field => {
        const oldValue = currentEditRecord[field] || '';
        const newValue = newData[field] || '';
        
        if (oldValue !== newValue) {
            changes[field] = {
                before: oldValue,
                after: newValue
            };
        }
    });
    
    return changes;
}

// ================== 休憩記録の変更チェック ==================
function hasBreakChanges() {
    return editBreakRecords.some(breakRecord => 
        breakRecord.isNew || breakRecord.isDeleted || breakRecord.isModified
    );
}

// ================== データバリデーション ==================
function validateAttendanceData(data) {
    // 必須項目チェック
    if (!data.date || !data.siteName || !data.startTime) {
        alert('日付、現場名、出勤時間は必須です');
        return false;
    }
    
    // 時間の妥当性チェック
    if (data.endTime && data.startTime >= data.endTime) {
        alert('退勤時間は出勤時間より後である必要があります');
        return false;
    }
    
    // 休憩時間の妥当性チェック
    for (let breakRecord of editBreakRecords) {
        if (breakRecord.isDeleted) continue;
        
        if (breakRecord.startTime && breakRecord.endTime) {
            if (breakRecord.startTime >= breakRecord.endTime) {
                alert('休憩の終了時間は開始時間より後である必要があります');
                return false;
            }
        }
    }
    
    return true;
}

// ================== Firestoreへの保存 ==================
async function saveChangesToFirestore(newData, changes, reason) {
    const batch = firebase.firestore().batch();
    
    // 1. 勤怠記録の更新
    const attendanceRef = firebase.firestore()
        .collection('attendance')
        .doc(currentEditRecord.id);
    
    const updateData = {
        ...newData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastModifiedBy: firebase.auth().currentUser?.email || 'unknown'
    };
    
    batch.update(attendanceRef, updateData);
    
    // 2. 変更履歴の記録
    if (Object.keys(changes).length > 0) {
        const historyRef = firebase.firestore().collection('attendance_history').doc();
        
        const historyData = {
            attendanceId: currentEditRecord.id,
            changes: changes,
            reason: reason,
            changedBy: firebase.auth().currentUser?.email || 'unknown',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            changeType: 'edit'
        };
        
        batch.set(historyRef, historyData);
    }
    
    // 3. 休憩記録の処理
    for (let breakRecord of editBreakRecords) {
        if (breakRecord.isDeleted && !breakRecord.isNew) {
            // 既存記録の削除
            const breakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc(breakRecord.id);
            batch.delete(breakRef);
            
        } else if (breakRecord.isNew && !breakRecord.isDeleted) {
            // 新規記録の追加
            const newBreakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc();
            const breakData = {
                attendanceId: currentEditRecord.id,
                userId: currentEditRecord.userId,
                startTime: breakRecord.startTime,
                endTime: breakRecord.endTime,
                date: currentEditRecord.date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.set(newBreakRef, breakData);
            
        } else if (!breakRecord.isNew && !breakRecord.isDeleted && breakRecord.isModified) {
            // 既存記録の更新
            const breakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc(breakRecord.id);
            const breakUpdateData = {
                startTime: breakRecord.startTime,
                endTime: breakRecord.endTime,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.update(breakRef, breakUpdateData);
        }
    }
    
    // バッチ実行
    await batch.commit();
}

// ================== 勤怠記録の削除 ==================
async function deleteEditAttendanceRecord() {
    if (!currentEditRecord) return;
    
    const confirmMessage = `⚠️ 以下の勤怠記録を完全に削除しますか？\n\n` +
                          `日付: ${currentEditRecord.date}\n` +
                          `現場: ${currentEditRecord.siteName}\n` +
                          `従業員: ${currentEditRecord.userEmail}\n\n` +
                          `この操作は取り消せません。`;
    
    if (!confirm(confirmMessage)) return;
    
    const reason = prompt('削除理由を入力してください（必須）:');
    if (!reason || reason.trim() === '') {
        alert('削除理由を入力してください');
        return;
    }
    
    try {
        const batch = firebase.firestore().batch();
        
        // 1. 勤怠記録の削除
        const attendanceRef = firebase.firestore()
            .collection('attendance')
            .doc(currentEditRecord.id);
        batch.delete(attendanceRef);
        
        // 2. 関連する休憩記録の削除
        for (let breakRecord of editBreakRecords) {
            if (!breakRecord.isNew) {
                const breakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc(breakRecord.id);
                batch.delete(breakRef);
            }
        }
        
        // 3. 削除履歴の記録
        const historyRef = firebase.firestore().collection('attendance_history').doc();
        const historyData = {
            attendanceId: currentEditRecord.id,
            originalData: currentEditRecord,
            reason: reason.trim(),
            changedBy: firebase.auth().currentUser?.email || 'unknown',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            changeType: 'delete'
        };
        batch.set(historyRef, historyData);
        
        await batch.commit();
        
        alert('✅ 記録を削除しました');
        closeEditDialog();
        
        // 管理者画面のデータを再読み込み
        await loadAttendanceData();
        
    } catch (error) {
        alert('削除中にエラーが発生しました: ' + error.message);
    }
}

// ================== 編集ダイアログのタブ切り替え ==================
function showEditTab(tabName) {
    // 全てのタブを非表示
    document.querySelectorAll('#edit-dialog .tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 全てのタブボタンを非アクティブ
    document.querySelectorAll('#edit-dialog .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 指定されたタブを表示
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // 対応するタブボタンをアクティブ
    event.target.classList.add('active');
}

// ================== ダイアログを閉じる ==================
function closeEditDialog() {
    const dialog = document.getElementById('edit-dialog');
    if (dialog) {
        dialog.style.display = 'none';
    }
    
    // 変数をリセット
    currentEditRecord = null;
    editBreakRecords = [];
    changeHistory = [];
}

// ================== 編集機能の初期化 ==================
function initAdminEditFeatures() {
    
    // スタイルを適用
    initEditFunctionStyles();
    
    // 編集機能が利用可能であることをログ出力
}

// ================== 編集機能のスタイル適用 ==================
function initEditFunctionStyles() {
    if (document.getElementById('edit-dialog-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'edit-dialog-styles';
    styleElement.innerHTML = `
        .modal.hidden {
            display: none;
        }

        .modal:not(.hidden) {
            display: flex;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            align-items: center;
            justify-content: center;
        }
        
        .modal-content {
            background-color: #fefefe;
            margin: 2% auto;
            border: none;
            border-radius: 8px;
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid #ddd;
            background-color: #f8f9fa;
            border-radius: 8px 8px 0 0;
        }
        
        .modal-header h3 {
            margin: 0;
            color: #333;
        }
        
        .close {
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            color: #aaa;
            transition: color 0.3s;
        }
        
        .close:hover {
            color: #000;
        }
        
        .modal-body {
            padding: 20px;
        }
        
        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 20px;
            border-top: 1px solid #ddd;
            background-color: #f8f9fa;
            border-radius: 0 0 8px 8px;
        }
        
        .tab-container {
            margin-top: 10px;
        }
        
        .tab-buttons {
            display: flex;
            border-bottom: 2px solid #ddd;
            margin-bottom: 20px;
        }
        
        .tab-btn {
            background: none;
            border: none;
            padding: 12px 20px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            font-weight: 500;
            transition: all 0.3s;
        }
        
        .tab-btn:hover {
            background-color: #f8f9fa;
        }
        
        .tab-btn.active {
            border-bottom-color: #007bff;
            color: #007bff;
            background-color: #f8f9fa;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        .form-row {
            display: flex;
            gap: 15px;
        }
        
        .form-row .form-group {
            flex: 1;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #333;
        }
        
        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            transition: border-color 0.3s;
            box-sizing: border-box;
        }
        
        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
        }
        
        .breaks-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        
        .breaks-header h4 {
            margin: 0;
        }
        
        .breaks-list {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 15px;
        }
        
        .break-item {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 10px;
        }
        
        .break-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .break-number {
            font-weight: bold;
            color: #495057;
        }
        
        .btn-remove {
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .btn-remove:hover {
            background: #c82333;
        }
        
        .break-times {
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
        }
        
        .time-group {
            display: flex;
            flex-direction: column;
            min-width: 120px;
        }
        
        .time-group label {
            font-size: 12px;
            margin-bottom: 3px;
            color: #6c757d;
        }
        
        .time-group input {
            width: 100%;
            padding: 6px 8px;
            font-size: 13px;
        }
        
        .break-duration {
            margin-left: auto;
            font-weight: 500;
            color: #28a745;
        }
        
        .total-break-time {
            text-align: center;
            padding: 15px;
            background: #e9f7ef;
            border-radius: 6px;
            color: #155724;
        }
        
        .no-breaks,
        .no-history {
            text-align: center;
            padding: 40px 20px;
            color: #6c757d;
        }
        
        .history-list {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 15px;
        }
        
        .history-item {
            background: #f8f9fa;
            border-left: 4px solid #007bff;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 0 6px 6px 0;
        }
        
        .history-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .history-date {
            font-weight: 500;
            color: #495057;
        }
        
        .history-user {
            font-size: 14px;
            color: #6c757d;
        }
        
        .history-reason {
            margin-bottom: 10px;
            padding: 8px 12px;
            background: #fff3cd;
            border-radius: 4px;
            color: #856404;
        }
        
        .history-changes {
            color: #333;
        }
        
        .changes-detail {
            margin-top: 8px;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border: 1px solid #e9ecef;
        }
        
        .changes-detail ul {
            margin: 0;
            padding-left: 20px;
        }
        
        .changes-detail li {
            margin-bottom: 5px;
        }
        
        .history-error {
            text-align: center;
            padding: 40px 20px;
            color: #dc3545;
            background: #f8d7da;
            border-radius: 6px;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background-color: #007bff;
            color: white;
        }
        
        .btn-primary:hover {
            background-color: #0056b3;
        }
        
        .btn-success {
            background-color: #28a745;
            color: white;
        }
        
        .btn-success:hover {
            background-color: #1e7e34;
        }
        
        .btn-danger {
            background-color: #dc3545;
            color: white;
        }
        
        .btn-danger:hover {
            background-color: #c82333;
        }
        
        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }
        
        .btn-secondary:hover {
            background-color: #545b62;
        }
        
        .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
        }
        
        .edit-btn {
            min-width: 60px;
        }
        
        @media (max-width: 768px) {
            .modal-content {
                width: 95%;
                margin: 5% auto;
            }
            
            .form-row {
                flex-direction: column;
                gap: 0;
            }
            
            .break-times {
                flex-direction: column;
                gap: 10px;
            }
            
            .time-group {
                min-width: 100%;
            }
            
            .history-header {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .modal-footer {
                flex-direction: column;
                gap: 10px;
            }
            
            .modal-footer .btn {
                width: 100%;
            }
        }
    `;
    
    document.head.appendChild(styleElement);
}

// ================== ユーティリティ関数 ==================

/**
 * 要素を取得する関数
 */
function getElement(id) {
    return document.getElementById(id);
}

/**
 * 現在のユーザーを取得
 */
function getCurrentUser() {
    return firebase.auth().currentUser;
}

/**
 * 権限チェック
 */
function checkAuth(requiredRole) {
    const user = getCurrentUser();
    if (!user) {
        return false;
    }
    return true;
}

/**
 * 日付のフォーマット
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP');
    } catch (error) {
        return dateString;
    }
}

/**
 * 時間のフォーマット
 */
function formatTime(timeString) {
    if (!timeString) return '-';
    return timeString;
}

/**
 * 今日の日付文字列を取得
 */
function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * 日本語形式の時刻文字列をDateオブジェクトにパース
 * 対応形式: "午後2:38:09", "午前9:00:00", "14:38:09", "9:00:00"
 */
function parseJapaneseTime(timeString) {
    if (!timeString) return null;

    try {
        let hours, minutes, seconds;

        // 日本語形式 (午前/午後) の場合
        if (timeString.includes('午前') || timeString.includes('午後')) {
            const isPM = timeString.includes('午後');
            const timeMatch = timeString.match(/(\d{1,2}):(\d{2}):?(\d{2})?/);

            if (!timeMatch) return null;

            hours = parseInt(timeMatch[1], 10);
            minutes = parseInt(timeMatch[2], 10);
            seconds = parseInt(timeMatch[3] || '0', 10);

            // 午後の場合、12時間を加算（12時は除く）
            if (isPM && hours !== 12) {
                hours += 12;
            }
            // 午前12時は0時として扱う
            if (!isPM && hours === 12) {
                hours = 0;
            }
        } else {
            // 24時間形式の場合
            const timeMatch = timeString.match(/(\d{1,2}):(\d{2}):?(\d{2})?/);
            if (!timeMatch) return null;

            hours = parseInt(timeMatch[1], 10);
            minutes = parseInt(timeMatch[2], 10);
            seconds = parseInt(timeMatch[3] || '0', 10);
        }

        const date = new Date(2000, 0, 1, hours, minutes, seconds);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.error('時刻パースエラー:', timeString, error);
        return null;
    }
}

/**
 * 合計休憩時間を計算
 */
function calculateTotalBreakTime(breakTimes) {
    if (!breakTimes || breakTimes.length === 0) {
        return { minutes: 0, formatted: '0時間0分' };
    }

    let totalMinutes = 0;
    breakTimes.forEach(breakTime => {
        if (breakTime.start && breakTime.end) {
            const start = parseJapaneseTime(breakTime.start);
            const end = parseJapaneseTime(breakTime.end);
            if (start && end && end > start) {
                totalMinutes += Math.floor((end - start) / (1000 * 60));
            }
        }
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
        minutes: totalMinutes,
        formatted: `${hours}時間${minutes}分`
    };
}

/**
 * 実労働時間を計算
 */
function calculateWorkingTime(startTime, endTime, breakTimes) {
    if (!startTime || !endTime) {
        return { minutes: 0, formatted: '-' };
    }

    try {
        const start = parseJapaneseTime(startTime);
        const end = parseJapaneseTime(endTime);

        if (!start || !end) {
            return { minutes: 0, formatted: '計算エラー' };
        }

        if (end <= start) {
            return { minutes: 0, formatted: '計算エラー' };
        }

        const totalMinutes = Math.floor((end - start) / (1000 * 60));
        const breakTime = calculateTotalBreakTime(breakTimes || []);
        const workingMinutes = totalMinutes - breakTime.minutes;

        const hours = Math.floor(workingMinutes / 60);
        const minutes = workingMinutes % 60;

        return {
            minutes: workingMinutes,
            formatted: `${hours}時間${minutes}分`
        };
    } catch (error) {
        return { minutes: 0, formatted: '計算エラー' };
    }
}

/**
 * エラーメッセージの表示
 */
function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        border-radius: 8px;
        padding: 15px;
        max-width: 300px;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

/**
 * 成功メッセージの表示
 */
function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
        border-radius: 8px;
        padding: 15px;
        max-width: 300px;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

/**
 * トースト通知の表示
 */
function showToast(message, type = 'info') {
    const colors = {
        info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },
        success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
        warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' },
        error: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' }
    };
    
    const colorSet = colors[type] || colors.info;
    
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colorSet.bg};
        color: ${colorSet.color};
        border: 1px solid ${colorSet.border};
        border-radius: 8px;
        padding: 15px;
        max-width: 300px;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, type === 'error' ? 5000 : 3000);
}

/**
 * エラーメッセージ表示（編集機能用）
 */
function showErrorMessage(message) {
    showError(message);
}

/**
 * サインアウト処理
 */
function signOut() {
    if (confirm('ログアウトしますか？')) {
        firebase.auth().signOut()
            .then(() => {
                showPage('login');
            })
            .catch((error) => {
                showError('ログアウトでエラーが発生しました');
            });
    }
}

/**
 * 編集記録の処理（既存のeditRecord関数を置き換え）
 */
function editRecord(recordId) {
    
    // recordIdから完全なレコードデータを取得して編集ダイアログを表示
    const allRows = document.querySelectorAll('#attendance-data tr');
    for (let row of allRows) {
        const editBtn = row.querySelector('.edit-btn');
        if (editBtn && editBtn.onclick) {
            const onclickStr = editBtn.getAttribute('onclick');
            if (onclickStr && onclickStr.includes(recordId)) {
                editBtn.click();
                return;
            }
        }
    }
    
    showToast('レコードが見つかりませんでした', 'warning');
}

// ================== 既存関数のオーバーライド ==================

/**
 * 勤怠記録の保存（編集機能と区別するため名前変更）
 */
async function saveAttendanceRecordOriginal() {
    const recordId = getElement('edit-id')?.value;
    const date = getElement('edit-date')?.value;
    const clockIn = getElement('edit-clock-in')?.value;
    const clockOut = getElement('edit-clock-out')?.value;
    const siteName = getElement('edit-site')?.value;
    const notes = getElement('edit-notes')?.value;
    
    // バリデーション
    if (!date || !siteName) {
        showError('必須項目を入力してください');
        return;
    }
    
    try {
        const updateData = {
            date: date,
            siteName: siteName,
            notes: notes || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 時間情報の更新
        if (clockIn) {
            updateData.clockInTime = firebase.firestore.Timestamp.fromDate(new Date(clockIn));
        }
        
        if (clockOut) {
            updateData.clockOutTime = firebase.firestore.Timestamp.fromDate(new Date(clockOut));
            // 総労働時間の計算
            if (clockIn) {
                const totalMinutes = calculateTimeDiff(clockIn, clockOut).minutes;
                updateData.totalWorkTime = totalMinutes;
            }
        }
        
        // Firestoreに保存
        await firebase.firestore().collection('attendance').doc(recordId).update(updateData);
        
        // モーダルを閉じる
        const modal = getElement('edit-modal');
        if (modal) modal.classList.add('hidden');
        
        // データを再読み込み
        await loadAttendanceData();
        
        showSuccess('勤怠データを更新しました');
    } catch (error) {
        showError('勤怠データの更新に失敗しました');
    }
}

/**
 * 勤怠記録の削除（編集機能と区別するため名前変更）
 */
async function deleteAttendanceRecordOriginal() {
    const recordId = getElement('edit-id')?.value;
    if (!recordId) return;
    
    if (!confirm('この勤怠記録を削除しますか？')) return;
    
    try {
        // 関連する休憩記録も削除
        const breakQuery = await firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks')
            .where('attendanceId', '==', recordId)
            .get();
        
        const batch = firebase.firestore().batch();
        
        // 休憩記録を削除
        breakQuery.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // 勤怠記録を削除
        batch.delete(firebase.firestore().collection('attendance').doc(recordId));
        
        await batch.commit();
        
        // モーダルを閉じる
        const modal = getElement('edit-modal');
        if (modal) modal.classList.add('hidden');
        
        // データを再読み込み
        await loadAttendanceData();
        
        showSuccess('勤怠データを削除しました');
    } catch (error) {
        showError('勤怠データの削除に失敗しました');
    }
}

/**
 * 休憩時間を追加（編集機能と区別するため名前変更）
 */
async function addBreakTimeOriginal() {
    const attendanceId = getElement('edit-id')?.value;
    const breakStart = getElement('break-start')?.value;
    const breakEnd = getElement('break-end')?.value;
    
    if (!attendanceId || !breakStart || !breakEnd) {
        showError('必須項目を入力してください');
        return;
    }
    
    // 開始時間が終了時間より後の場合はエラー
    if (new Date(breakStart) >= new Date(breakEnd)) {
        showError('休憩開始時間は終了時間より前である必要があります');
        return;
    }
    
    try {
        const currentUser = getCurrentUser();
        const startTime = firebase.firestore.Timestamp.fromDate(new Date(breakStart));
        const endTime = firebase.firestore.Timestamp.fromDate(new Date(breakEnd));
        const duration = Math.floor((new Date(breakEnd) - new Date(breakStart)) / (1000 * 60));
        
        const breakData = {
            attendanceId: attendanceId,
            userId: currentUser.uid,
            startTime: startTime,
            endTime: endTime,
            duration: duration,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').add(breakData);
        
        // 休憩時間リストを再描画（新しいデータを取得）
        await loadBreakTimesForEdit(attendanceId);
        
        // 休憩追加モーダルを閉じる
        const modal = getElement('break-modal');
        if (modal) modal.classList.add('hidden');
        
        showSuccess('休憩時間を追加しました');
    } catch (error) {
        showError('休憩時間の追加に失敗しました');
    }
}

/**
 * 編集用の休憩時間データを読み込み
 * @param {string} attendanceId 勤怠記録ID
 */
async function loadBreakTimesForEdit(attendanceId) {
    try {
        const breakQuery = await firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks')
            .where('attendanceId', '==', attendanceId)
            .orderBy('startTime')
            .get();
        
        const breakTimes = breakQuery.docs.map(doc => {
            const breakData = doc.data();
            return {
                id: doc.id,
                start: breakData.startTime?.toDate()?.toISOString(),
                end: breakData.endTime?.toDate()?.toISOString()
            };
        });
        
        renderBreakTimesList(breakTimes);
    } catch (error) {
    }
}

/**
 * 休憩時間リストのレンダリング
 */
function renderBreakTimesList(breakTimes) {
    const breakList = getElement('break-list');
    if (!breakList) return;
    
    if (!breakTimes || breakTimes.length === 0) {
        breakList.innerHTML = '<div class="no-data">休憩時間が登録されていません</div>';
        return;
    }
    
    breakList.innerHTML = breakTimes.map((breakTime, index) => {
        const duration = calculateTimeDiff(breakTime.start, breakTime.end);
        return `
            <div class="break-item">
                <div class="break-time">
                    ${formatTime(breakTime.start)} - ${formatTime(breakTime.end)}
                </div>
                <div class="break-duration">${duration.formatted}</div>
                <button class="break-remove" onclick="removeBreakTimeOriginal(${index})" title="削除">×</button>
            </div>
        `;
    }).join('');
    
    // 合計休憩時間を更新
    const totalBreakTime = calculateTotalBreakTime(breakTimes);
    const totalEl = getElement('total-break-time');
    if (totalEl) {
        totalEl.textContent = `合計休憩時間: ${totalBreakTime.formatted}`;
    }
}

/**
 * 休憩時間を削除（編集機能と区別するため名前変更）
 * @param {number} index 削除する休憩時間のインデックス
 */
async function removeBreakTimeOriginal(index) {
    const attendanceId = getElement('edit-id')?.value;
    if (!attendanceId) return;
    
    if (!confirm('この休憩時間を削除しますか？')) return;
    
    try {
        const breakQuery = await firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks')
            .where('attendanceId', '==', attendanceId)
            .orderBy('startTime')
            .get();
        
        if (index >= breakQuery.docs.length) return;
        
        const breakDoc = breakQuery.docs[index];
        await breakDoc.ref.delete();
        
        // 休憩時間リストを再描画
        await loadBreakTimesForEdit(attendanceId);
        
        showSuccess('休憩時間を削除しました');
    } catch (error) {
        showError('休憩時間の削除に失敗しました');
    }
}

/**
 * 時間差計算のユーティリティ関数
 */
function calculateTimeDiff(startTime, endTime) {
    if (!startTime || !endTime) {
        return { minutes: 0, formatted: '0時間0分' };
    }
    
    try {
        const start = new Date(startTime);
        const end = new Date(endTime);
        
        if (end <= start) {
            return { minutes: 0, formatted: '無効' };
        }
        
        const diffMs = end - start;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        
        return {
            minutes: diffMinutes,
            formatted: `${hours}時間${minutes}分`
        };
    } catch (error) {
        return { minutes: 0, formatted: '計算エラー' };
    }
}

// ================== グローバルスコープに関数をエクスポート ==================
window.initAdminPage = initAdminPage;
window.switchTab = switchTab;
window.loadAttendanceData = loadAttendanceData;
window.editRecord = editRecord;
window.exportToCSV = exportToCSV;
window.saveAttendanceRecord = saveAttendanceRecordOriginal;
window.deleteAttendanceRecord = deleteAttendanceRecordOriginal;
window.addBreakTime = addBreakTimeOriginal;
window.removeBreakTime = removeBreakTimeOriginal;

// 編集機能の関数もエクスポート
window.showEditDialog = showEditDialog;
window.closeEditDialog = closeEditDialog;
window.showEditTab = showEditTab;
window.saveAttendanceChanges = saveAttendanceChanges;
window.deleteEditAttendanceRecord = deleteEditAttendanceRecord;
window.addNewBreak = addNewBreak;
window.removeBreak = removeBreak;
window.updateBreakTime = updateBreakTime;

// DOM読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', function() {
    // 管理者ページの場合のみ編集機能を初期化
    if (window.location.hash === '#admin' || document.getElementById('admin-page')) {
        // 少し遅延させて確実に初期化
        setTimeout(initAdminEditFeatures, 100);
    }
});



// admin.js の修正版 - Firebase権限エラー対応

// ================== Firebase権限エラー対応 ==================

// 変更履歴の読み込み（権限エラー対応版）
async function loadChangeHistory(attendanceId) {
    
    const historyList = document.getElementById('change-history-list');
    if (!historyList) return;
    
    // 初期状態で「読み込み中」を表示
    historyList.innerHTML = `
        <div class="loading-history">
            <p>📋 変更履歴を読み込み中...</p>
        </div>
    `;
    
    try {
        // シンプルなクエリで試行
        const query = firebase.firestore()
            .collection('attendance_history')
            .where('attendanceId', '==', attendanceId);
        
        const snapshot = await query.get();
        
        changeHistory = [];
        snapshot.forEach(doc => {
            changeHistory.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // 手動でソート（タイムスタンプの降順）
        changeHistory.sort((a, b) => {
            const timeA = a.timestamp ? a.timestamp.seconds : 0;
            const timeB = b.timestamp ? b.timestamp.seconds : 0;
            return timeB - timeA;
        });
        
        displayChangeHistory();
        
    } catch (error) {
        
        // 権限エラーの場合は適切なメッセージを表示
        if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
            displayChangeHistoryPermissionError();
        } else {
            displayChangeHistoryNotFound();
        }
    }
}

// 変更履歴の表示（改善版）
function displayChangeHistory() {
    const historyList = document.getElementById('change-history-list');
    
    if (changeHistory.length === 0) {
        historyList.innerHTML = `
            <div class="no-history">
                <div class="no-history-icon">📋</div>
                <h4>変更履歴がありません</h4>
                <p>この記録はまだ編集されていません。</p>
                <p>編集や削除を行うと、ここに変更履歴が表示されます。</p>
                <div class="history-info">
                    <small>💡 変更履歴には以下の情報が記録されます：</small>
                    <ul>
                        <li>変更日時</li>
                        <li>変更者</li>
                        <li>変更理由</li>
                        <li>変更内容の詳細</li>
                    </ul>
                </div>
            </div>
        `;
        return;
    }
    
    let html = '<div class="history-header-info"><h4>📜 変更履歴 (全 ' + changeHistory.length + ' 件)</h4></div>';
    
    changeHistory.forEach((history, index) => {
        const timestamp = history.timestamp ? 
            new Date(history.timestamp.seconds * 1000).toLocaleString('ja-JP') : 
            '不明';
        
        html += `
            <div class="history-item">
                <div class="history-number">#${index + 1}</div>
                <div class="history-content">
                    <div class="history-header">
                        <span class="history-date">📅 ${timestamp}</span>
                        <span class="history-user">👤 ${history.changedBy || '不明'}</span>
                    </div>
                    
                    <div class="history-type">
                        <span class="change-type-badge ${history.changeType}">
                            ${getChangeTypeText(history.changeType)}
                        </span>
                    </div>
                    
                    <div class="history-reason">
                        <strong>💭 変更理由:</strong> ${history.reason || '記載なし'}
                    </div>
                    
                    <div class="history-changes">
                        <strong>📝 変更内容:</strong>
                        <div class="changes-detail">
                            ${formatChangesImproved(history.changes, history.changeType)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}

// 変更タイプのテキスト変換
function getChangeTypeText(changeType) {
    const typeMap = {
        'edit': '✏️ 編集',
        'delete': '🗑️ 削除',
        'create': '➕ 作成'
    };
    return typeMap[changeType] || '🔄 変更';
}

// 変更内容のフォーマット改善版
function formatChangesImproved(changes, changeType) {
    if (changeType === 'delete') {
        return '<div class="delete-info">📋 この記録は削除されました</div>';
    }
    
    if (!changes || Object.keys(changes).length === 0) {
        return '<div class="no-changes">変更内容が記録されていません</div>';
    }
    
    let html = '<div class="changes-list">';
    Object.keys(changes).forEach(field => {
        const change = changes[field];
        const fieldName = getFieldDisplayName(field);
        
        html += `
            <div class="change-item">
                <div class="field-name">${fieldName}</div>
                <div class="change-values">
                    <span class="old-value">${change.before || '(空)'}</span>
                    <span class="arrow">→</span>
                    <span class="new-value">${change.after || '(空)'}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    return html;
}

// 権限エラー時の表示
function displayChangeHistoryPermissionError() {
    const historyList = document.getElementById('change-history-list');
    historyList.innerHTML = `
        <div class="history-permission-error">
            <div class="error-icon">🔒</div>
            <h4>変更履歴へのアクセス権限がありません</h4>
            <p>変更履歴を表示するには、Firebase セキュリティルールの設定が必要です。</p>
            <div class="permission-info">
                <details>
                    <summary>🛠️ 解決方法</summary>
                    <div class="solution-steps">
                        <p><strong>Firebase Console での設定:</strong></p>
                        <ol>
                            <li>Firebase Console → Firestore Database → ルール</li>
                            <li>attendance_history コレクションへの読み取り権限を追加</li>
                        </ol>
                    </div>
                </details>
            </div>
            <p><strong>💡 編集機能は正常に動作します</strong></p>
        </div>
    `;
}

// 変更履歴が見つからない場合の表示
function displayChangeHistoryNotFound() {
    const historyList = document.getElementById('change-history-list');
    historyList.innerHTML = `
        <div class="no-history">
            <div class="no-history-icon">📋</div>
            <h4>変更履歴がありません</h4>
            <p>この記録はまだ編集されていません。</p>
            <p>編集や削除を行うと、ここに変更履歴が表示されます。</p>
        </div>
    `;
}

// ================== 保存処理の権限エラー対応 ==================

// Firestoreへの保存（権限エラー対応版）
async function saveChangesToFirestore(newData, changes, reason) {
    
    try {
        // 基本的な保存（attendance_historyを除く）
        await saveBasicChanges(newData, changes, reason);
        
        // テスト用に変更履歴も保存を試行
        try {
            await saveChangeHistory(changes, reason);
        } catch (historyError) {
            // 変更履歴の保存に失敗しても、基本的な保存は成功として扱う
        }
        
        
    } catch (error) {
        throw error;
    }
}

// 基本的な変更の保存
async function saveBasicChanges(newData, changes, reason) {
    const batch = firebase.firestore().batch();
    
    // 1. 勤怠記録の更新
    const attendanceRef = firebase.firestore()
        .collection('attendance')
        .doc(currentEditRecord.id);
    
    const updateData = {
        ...newData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastModifiedBy: firebase.auth().currentUser?.email || 'unknown'
    };
    
    batch.update(attendanceRef, updateData);
    
    // 2. 休憩記録の処理
    for (let breakRecord of editBreakRecords) {
        if (breakRecord.isDeleted && !breakRecord.isNew) {
            // 既存記録の削除
            const breakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc(breakRecord.id);
            batch.delete(breakRef);
            
        } else if (breakRecord.isNew && !breakRecord.isDeleted) {
            // 新規記録の追加
            const newBreakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc();
            const breakData = {
                attendanceId: currentEditRecord.id,
                userId: currentEditRecord.userId,
                startTime: breakRecord.startTime,
                endTime: breakRecord.endTime,
                date: currentEditRecord.date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.set(newBreakRef, breakData);
            
        } else if (!breakRecord.isNew && !breakRecord.isDeleted && breakRecord.isModified) {
            // 既存記録の更新
            const breakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc(breakRecord.id);
            const breakUpdateData = {
                startTime: breakRecord.startTime,
                endTime: breakRecord.endTime,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.update(breakRef, breakUpdateData);
        }
    }
    
    // 基本的な保存を実行
    await batch.commit();
}

// 変更履歴の保存（分離版）
async function saveChangeHistory(changes, reason) {
    if (!changes || Object.keys(changes).length === 0) {
        return; // 変更がない場合はスキップ
    }
    
    const historyRef = firebase.firestore().collection('attendance_history').doc();
    
    const historyData = {
        attendanceId: currentEditRecord.id,
        changes: changes,
        reason: reason,
        changedBy: firebase.auth().currentUser?.email || 'unknown',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        changeType: 'edit'
    };
    
    await historyRef.set(historyData);
}

// ================== 削除処理の権限エラー対応 ==================

// 勤怠記録の削除（権限エラー対応版）
async function deleteEditAttendanceRecord() {
    if (!currentEditRecord) return;
    
    const confirmMessage = `⚠️ 以下の勤怠記録を完全に削除しますか？\n\n` +
                          `日付: ${currentEditRecord.date}\n` +
                          `現場: ${currentEditRecord.siteName}\n` +
                          `従業員: ${currentEditRecord.userEmail || currentEditRecord.userName}\n\n` +
                          `この操作は取り消せません。`;
    
    if (!confirm(confirmMessage)) return;
    
    const reason = prompt('削除理由を入力してください（必須）:');
    if (!reason || reason.trim() === '') {
        alert('削除理由を入力してください');
        return;
    }
    
    try {
        // 基本的な削除を実行
        await deleteBasicRecord(reason);
        
        // 変更履歴の保存を試行
        try {
            await saveDeleteHistory(reason);
        } catch (historyError) {
        }
        
        alert('✅ 記録を削除しました');
        closeEditDialog();
        
        // 管理者画面のデータを再読み込み
        await loadAttendanceData();
        
    } catch (error) {
        
        if (error.code === 'permission-denied') {
            alert('削除権限がありません。Firebase のセキュリティルールを確認してください。');
        } else {
            alert('削除中にエラーが発生しました: ' + error.message);
        }
    }
}

// 基本的なレコード削除
async function deleteBasicRecord(reason) {
    const batch = firebase.firestore().batch();
    
    // 1. 勤怠記録の削除
    const attendanceRef = firebase.firestore()
        .collection('attendance')
        .doc(currentEditRecord.id);
    batch.delete(attendanceRef);
    
    // 2. 関連する休憩記録の削除
    for (let breakRecord of editBreakRecords) {
        if (!breakRecord.isNew) {
            const breakRef = firebase.firestore().collection('tenants').doc(getCurrentTenantId()).collection('breaks').doc(breakRecord.id);
            batch.delete(breakRef);
        }
    }
    
    await batch.commit();
}

// 削除履歴の保存
async function saveDeleteHistory(reason) {
    const historyRef = firebase.firestore().collection('attendance_history').doc();
    const historyData = {
        attendanceId: currentEditRecord.id,
        originalData: currentEditRecord,
        reason: reason.trim(),
        changedBy: firebase.auth().currentUser?.email || 'unknown',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        changeType: 'delete'
    };
    
    await historyRef.set(historyData);
}

// ================== 追加CSSスタイル ==================
function addImprovedHistoryStyles() {
    const additionalStyles = `
        <style>
        .loading-history {
            text-align: center;
            padding: 40px 20px;
            color: #6c757d;
        }
        
        .no-history {
            text-align: center;
            padding: 40px 20px;
            color: #6c757d;
            background: #f8f9fa;
            border-radius: 8px;
            margin: 10px 0;
        }
        
        .no-history-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        
        .no-history h4 {
            color: #495057;
            margin-bottom: 12px;
        }
        
        .history-info {
            margin-top: 20px;
            padding: 15px;
            background: white;
            border-radius: 6px;
            text-align: left;
        }
        
        .history-info ul {
            margin: 8px 0 0 20px;
            padding: 0;
        }
        
        .history-info li {
            margin-bottom: 4px;
            color: #6c757d;
        }
        
        .history-permission-error {
            text-align: center;
            padding: 40px 20px;
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            color: #856404;
        }
        
        .error-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        
        .permission-info {
            margin: 20px 0;
            text-align: left;
        }
        
        .solution-steps {
            background: white;
            padding: 15px;
            border-radius: 6px;
            margin-top: 10px;
        }
        
        .solution-steps ol {
            margin: 10px 0 0 20px;
        }
        
        .history-header-info {
            margin-bottom: 20px;
            padding: 10px 15px;
            background: #e9f7ef;
            border-radius: 6px;
            color: #155724;
        }
        
        .history-item {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-left: 4px solid #007bff;
            border-radius: 0 6px 6px 0;
            margin-bottom: 15px;
            overflow: hidden;
        }
        
        .history-number {
            background: #007bff;
            color: white;
            padding: 8px 12px;
            font-weight: bold;
            font-size: 12px;
        }
        
        .history-content {
            padding: 15px;
        }
        
        .history-type {
            margin-bottom: 10px;
        }
        
        .change-type-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        
        .change-type-badge.edit {
            background: #cce5ff;
            color: #0056b3;
        }
        
        .change-type-badge.delete {
            background: #f8d7da;
            color: #721c24;
        }
        
        .change-type-badge.create {
            background: #d4edda;
            color: #155724;
        }
        
        .changes-list {
            background: white;
            border-radius: 4px;
            padding: 10px;
            margin-top: 8px;
        }
        
        .change-item {
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .change-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .field-name {
            font-weight: bold;
            color: #495057;
            margin-bottom: 4px;
        }
        
        .change-values {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .old-value {
            background: #f8d7da;
            color: #721c24;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 13px;
        }
        
        .new-value {
            background: #d4edda;
            color: #155724;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 13px;
        }
        
        .arrow {
            color: #6c757d;
            font-weight: bold;
        }
        
        .delete-info {
            background: #f8d7da;
            color: #721c24;
            padding: 10px;
            border-radius: 4px;
            text-align: center;
            font-weight: bold;
        }
        
        .no-changes {
            color: #6c757d;
            font-style: italic;
            text-align: center;
            padding: 10px;
        }
        </style>
    `;
    
    // スタイルを追加
    if (!document.getElementById('improved-history-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'improved-history-styles';
        styleElement.innerHTML = additionalStyles.replace('<style>', '').replace('</style>', '');
        document.head.appendChild(styleElement);
    }
}

// 編集機能の初期化時にスタイルを追加
function initAdminEditFeaturesImproved() {
    
    // 既存のスタイルを適用
    initEditFunctionStyles();
    
    // 改善されたスタイルを追加
    addImprovedHistoryStyles();
    
}

// 既存の初期化関数を上書き
window.initAdminEditFeatures = initAdminEditFeaturesImproved;

// ================ テナント内ユーザー管理機能 ================

/**
 * テナント内のユーザー一覧を表示（従業員別タブ機能の拡張）
 */
async function loadTenantUsers() {
    try {
        
        const usersCollection = getUsersCollection();
        const querySnapshot = await usersCollection.orderBy('displayName').get();
        
        const users = [];
        querySnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                id: doc.id,
                uid: doc.id,
                ...userData
            });
        });
        
        return users;
        
    } catch (error) {
        return [];
    }
}

/**
 * ユーザー情報を更新
 */
async function updateUserInfo(userId, updates) {
    try {
        const usersCollection = getUsersCollection();
        await usersCollection.doc(userId).update({
            ...updates,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return true;
        
    } catch (error) {
        throw error;
    }
}

/**
 * ユーザーのロールを変更
 */
async function changeUserRole(userId, newRole) {
    try {
        if (!['admin', 'employee'].includes(newRole)) {
            throw new Error('無効なロールです');
        }
        
        await updateUserInfo(userId, { role: newRole });
        
        // グローバルユーザー情報も更新（該当する場合）
        const user = await getUsersCollection().doc(userId).get();
        if (user.exists) {
            const userData = user.data();
            if (userData.email) {
                try {
                    await firebase.firestore().collection('global_users').doc(userData.email).update({
                        role: newRole,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (globalError) {
                }
            }
        }
        
        return true;
        
    } catch (error) {
        throw error;
    }
}

/**
 * ユーザーを無効化/有効化
 */
async function toggleUserStatus(userId, isActive = true) {
    try {
        await updateUserInfo(userId, { 
            active: isActive,
            disabledAt: isActive ? null : firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return true;
        
    } catch (error) {
        throw error;
    }
}

/**
 * 新しい従業員を招待（メールアドレスベース）
 */
async function inviteNewEmployee(emailAddress, displayName, role = 'employee') {
    try {
        // 既存ユーザーチェック
        const usersCollection = getUsersCollection();
        const existingQuery = await usersCollection.where('email', '==', emailAddress).get();
        
        if (!existingQuery.empty) {
            throw new Error('このメールアドレスは既に登録済みです');
        }
        
        // 仮ユーザーデータを作成（実際の登録は別途行う）
        const inviteData = {
            email: emailAddress,
            displayName: displayName,
            role: role,
            status: 'invited',
            invitedAt: firebase.firestore.FieldValue.serverTimestamp(),
            tenantId: window.getCurrentTenantId ? window.getCurrentTenantId() : null
        };
        
        // 招待記録を保存（実装に応じて調整）
        
        // 実際の招待メール送信は別途実装
        alert(`${emailAddress} への招待を準備しました。\n実際の招待機能は今後実装予定です。`);
        
        return true;
        
    } catch (error) {
        throw error;
    }
}

/**
 * 🆕 従業員管理機能
 */

// 全テナント従業員一覧を読み込む（スーパー管理者専用）
async function loadAllTenantsEmployeeList() {
    try {
        // スーパー管理者権限チェック
        if (!window.currentUser || window.currentUser.role !== 'super_admin') {
            console.error('loadAllTenantsEmployeeList: スーパー管理者のみアクセス可能');
            showEmployeeError('この機能はスーパー管理者のみアクセス可能です');
            return;
        }

        logger.log('全テナント従業員一覧読み込み開始');

        // 全テナントを取得
        const tenantsSnapshot = await firebase.firestore()
            .collection('tenants')
            .orderBy('createdAt', 'desc')
            .get();

        const allEmployees = [];

        // 各テナントの従業員を取得
        for (const tenantDoc of tenantsSnapshot.docs) {
            const tenantId = tenantDoc.id;
            const tenantData = tenantDoc.data();

            logger.log(`テナント ${tenantId} の従業員を取得中...`);

            // テナント内のユーザーを取得
            const usersSnapshot = await firebase.firestore()
                .collection('tenants')
                .doc(tenantId)
                .collection('users')
                .orderBy('createdAt', 'desc')
                .get();

            // 従業員情報にテナント情報を追加
            usersSnapshot.docs.forEach(doc => {
                const userData = doc.data();
                allEmployees.push({
                    id: doc.id,
                    uid: userData.uid,
                    email: userData.email,
                    displayName: userData.displayName || '名前未設定',
                    role: userData.role || 'employee',
                    createdAt: userData.createdAt,
                    isActive: userData.isActive !== false,
                    lastLogin: userData.lastLogin || null,
                    // テナント情報を追加
                    tenantId: tenantId,
                    tenantName: tenantData.companyName || tenantId,
                    companyName: tenantData.companyName || '未設定'
                });
            });
        }

        logger.log('取得した全従業員数:', allEmployees.length);
        displayAllTenantsEmployeeList(allEmployees);

    } catch (error) {
        console.error('全テナント従業員一覧読み込みエラー:', error);
        showEmployeeError('全テナント従業員データの読み込みに失敗しました');
    }
}

// 従業員一覧を読み込む（通常の管理者用）
async function loadEmployeeList() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) {
            console.error('テナントIDが取得できません');
            return;
        }

        logger.log('従業員一覧読み込み開始:', tenantId);

        // テナント内のユーザーを取得
        const usersSnapshot = await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .orderBy('createdAt', 'desc')
            .get();

        const employees = [];
        usersSnapshot.docs.forEach(doc => {
            const userData = doc.data();
            employees.push({
                id: doc.id,
                uid: userData.uid,
                email: userData.email,
                displayName: userData.displayName || '名前未設定',
                role: userData.role || 'employee',
                createdAt: userData.createdAt,
                isActive: userData.isActive !== false,
                lastLogin: userData.lastLogin || null,
                tenantId: tenantId
            });
        });

        logger.log('取得した従業員数:', employees.length);
        displayEmployeeList(employees);

    } catch (error) {
        console.error('従業員一覧読み込みエラー:', error);
        showEmployeeError('従業員データの読み込みに失敗しました');
    }
}

// 全テナント従業員一覧を表示（スーパー管理者専用）
function displayAllTenantsEmployeeList(employees) {
    const tableBody = document.getElementById('employee-list-data');
    if (!tableBody) return;

    if (employees.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="loading-cell">従業員が登録されていません</td>
            </tr>
        `;
        return;
    }

    let html = '';
    employees.forEach(employee => {
        const createdDate = employee.createdAt ? 
            employee.createdAt.toDate().toLocaleDateString('ja-JP') : '不明';
        
        const lastLoginDate = employee.lastLogin ? 
            employee.lastLogin.toDate().toLocaleDateString('ja-JP') : '未ログイン';

        const statusClass = employee.isActive ? 'active' : 'inactive';
        const statusText = employee.isActive ? 'アクティブ' : '無効';

        html += `
            <tr data-employee-id="${employee.id}" data-employee-uid="${employee.uid}" data-tenant-id="${employee.tenantId}">
                <td>
                    <div class="employee-info">
                        <div class="employee-name">${employee.displayName}</div>
                        <div class="employee-role-badge">${getRoleDisplayName(employee.role)}</div>
                    </div>
                </td>
                <td>${employee.email}</td>
                <td>
                    <div class="tenant-info">
                        <div class="tenant-name">${employee.companyName}</div>
                        <div class="tenant-id">${employee.tenantId}</div>
                    </div>
                </td>
                <td>${getRoleDisplayName(employee.role)}</td>
                <td>${createdDate}</td>
                <td>${lastLoginDate}</td>
                <td>
                    <span class="employee-status ${statusClass}">${statusText}</span>
                </td>
                <td>
                    <div class="employee-actions">
                        <button class="btn btn-edit" onclick="editEmployee('${employee.id}', '${employee.tenantId}')">
                            ✏️ 編集
                        </button>
                        ${employee.isActive ? `
                            <button class="btn btn-deactivate" onclick="deactivateEmployeeFromAllTenants('${employee.id}', '${employee.displayName}', '${employee.tenantId}')">
                                ⏸️ 無効化
                            </button>
                        ` : `
                            <button class="btn btn-activate" onclick="activateEmployeeFromAllTenants('${employee.id}', '${employee.displayName}', '${employee.tenantId}')">
                                ▶️ 有効化
                            </button>
                        `}
                        <button class="btn btn-delete" onclick="deleteEmployeeFromAllTenants('${employee.id}', '${employee.displayName}', '${employee.email}', '${employee.tenantId}')">
                            🗑️ 削除
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

// 従業員一覧を表示（通常の管理者用）
function displayEmployeeList(employees) {
    const tableBody = document.getElementById('employee-list-data');
    const tableHead = document.querySelector('#employee-management-content .employee-list-table thead tr');
    if (!tableBody) return;

    // テナント管理者用のヘッダーに変更（テナント・最終ログイン列を削除）
    if (tableHead) {
        tableHead.innerHTML = `
            <th style="min-width: 180px;">氏名</th>
            <th>メールアドレス</th>
            <th>役割</th>
            <th>登録日</th>
            <th style="min-width: 100px;">ステータス</th>
            <th style="min-width: 200px;">操作</th>
        `;
    }

    if (employees.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-cell">従業員が登録されていません</td>
            </tr>
        `;
        return;
    }

    console.log('[displayEmployeeList] 従業員数:', employees.length);

    let html = '';
    employees.forEach(employee => {
        const createdDate = employee.createdAt ?
            employee.createdAt.toDate().toLocaleDateString('ja-JP') : '不明';

        const statusClass = employee.isActive ? 'active' : 'inactive';
        const statusText = employee.isActive ? 'アクティブ' : '無効';

        html += `
            <tr data-employee-id="${employee.id}" data-employee-uid="${employee.uid}">
                <td>
                    <div class="employee-info-cell">
                        <div class="employee-name-large">${employee.displayName}</div>
                        <div class="employee-role-badge ${employee.role}">${getRoleDisplayName(employee.role)}</div>
                    </div>
                </td>
                <td class="employee-email">${employee.email}</td>
                <td>${getRoleDisplayName(employee.role)}</td>
                <td>${createdDate}</td>
                <td>
                    <span class="employee-status-badge ${statusClass}">${statusText}</span>
                </td>
                <td>
                    <div class="employee-action-buttons">
                        <button class="action-btn action-btn-primary" onclick="editEmployee('${employee.id}', '${employee.tenantId}')" title="編集">
                            <span class="action-icon">✏️</span>
                            <span class="action-text">編集</span>
                        </button>
                        ${employee.isActive ? `
                            <button class="action-btn action-btn-warning" onclick="deactivateEmployee('${employee.id}', '${employee.displayName}')" title="無効化">
                                <span class="action-icon">⏸️</span>
                                <span class="action-text">無効化</span>
                            </button>
                        ` : `
                            <button class="action-btn action-btn-success" onclick="activateEmployee('${employee.id}', '${employee.displayName}')" title="有効化">
                                <span class="action-icon">▶️</span>
                                <span class="action-text">有効化</span>
                            </button>
                        `}
                        <button class="action-btn action-btn-danger" onclick="deleteEmployee('${employee.id}', '${employee.displayName}', '${employee.email}')" title="削除">
                            <span class="action-icon">🗑️</span>
                            <span class="action-text">削除</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

// 役割の表示名を取得
function getRoleDisplayName(role) {
    const roleMap = {
        'admin': '管理者',
        'employee': '従業員',
        'super_admin': 'スーパー管理者'
    };
    return roleMap[role] || '不明';
}

// 従業員を無効化
async function deactivateEmployee(employeeId, employeeName) {
    if (!confirm(`${employeeName}さんのアカウントを無効化しますか？\n\n無効化すると、このユーザーはログインできなくなります。`)) {
        return;
    }

    try {
        const tenantId = window.getCurrentTenantId();
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .doc(employeeId)
            .update({
                isActive: false,
                deactivatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deactivatedBy: window.currentUser?.email || 'admin'
            });

        alert(`${employeeName}さんのアカウントを無効化しました`);
        loadEmployeeList();

    } catch (error) {
        console.error('従業員無効化エラー:', error);
        alert('無効化処理でエラーが発生しました');
    }
}

// 従業員を有効化
async function activateEmployee(employeeId, employeeName) {
    if (!confirm(`${employeeName}さんのアカウントを有効化しますか？`)) {
        return;
    }

    try {
        const tenantId = window.getCurrentTenantId();
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .doc(employeeId)
            .update({
                isActive: true,
                activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                activatedBy: window.currentUser?.email || 'admin'
            });

        alert(`${employeeName}さんのアカウントを有効化しました`);
        loadEmployeeList();

    } catch (error) {
        console.error('従業員有効化エラー:', error);
        alert('有効化処理でエラーが発生しました');
    }
}

// 従業員を完全削除
async function deleteEmployee(employeeId, employeeName, employeeEmail) {
    console.log('[deleteEmployee] 関数呼び出し:', { employeeId, employeeName, employeeEmail });

    const confirmation = prompt(
        `⚠️ 重要な操作です ⚠️\n\n${employeeName}さん（${employeeEmail}）のアカウントを完全に削除します。\n\n` +
        `この操作は元に戻せません。関連する勤怠データもすべて削除されます。\n\n` +
        `削除を実行するには「DELETE」と入力してください:`
    );

    if (confirmation !== 'DELETE') {
        console.log('[deleteEmployee] ユーザーがキャンセル');
        alert('削除がキャンセルされました');
        return;
    }

    try {
        const tenantId = window.getCurrentTenantId();
        const isSuper = window.currentUser?.role === 'super_admin';
        console.log('[deleteEmployee] tenantId:', tenantId, 'isSuper:', isSuper);

        logger.log('従業員削除開始:', employeeId, employeeName);

        // 1. テナント内のユーザーデータを削除
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .doc(employeeId)
            .delete();
        console.log('[deleteEmployee] テナントユーザー削除完了');

        // 2. テナント内のdeleted_usersコレクションに記録（権限あり）
        const normalizedEmail = employeeEmail.toLowerCase();
        try {
            await firebase.firestore()
                .collection('tenants')
                .doc(tenantId)
                .collection('deleted_users')
                .doc(normalizedEmail)
                .set({
                    email: normalizedEmail,
                    originalEmail: employeeEmail,
                    employeeId: employeeId,
                    employeeName: employeeName,
                    deletedBy: window.currentUser?.email || 'admin',
                    deletedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            console.log('[deleteEmployee] deleted_usersに記録完了');
        } catch (deletedUsersError) {
            console.warn('[deleteEmployee] deleted_users記録失敗:', deletedUsersError.message);
        }

        // 3. global_usersの処理（スーパー管理者のみ）
        const globalUserRef = firebase.firestore().collection('global_users').doc(normalizedEmail);

        if (isSuper) {
            try {
                await globalUserRef.delete();
                console.log('[deleteEmployee] global_users削除完了');
            } catch (globalError) {
                console.warn('[deleteEmployee] global_users削除失敗:', globalError.message);
            }
        }

        // 4. 関連する勤怠データを削除
        const attendanceQuery = getAttendanceCollection()
            .where('userEmail', '==', employeeEmail);

        const attendanceSnapshot = await attendanceQuery.get();
        const deletePromises = [];

        attendanceSnapshot.docs.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });

        // 5. 関連する休憩データを削除
        const breakQuery = getBreaksCollection()
            .where('userId', '==', employeeId);

        const breakSnapshot = await breakQuery.get();
        breakSnapshot.docs.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });

        await Promise.all(deletePromises);

        // 6. 削除ログを記録
        try {
            await firebase.firestore().collection('admin_logs').add({
                action: 'delete_employee',
                deletedEmployee: {
                    id: employeeId,
                    name: employeeName,
                    email: employeeEmail
                },
                deletedBy: window.currentUser?.email || 'admin',
                tenantId: tenantId,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deletedRecords: {
                    attendance: attendanceSnapshot.size,
                    breaks: breakSnapshot.size
                }
            });
        } catch (logError) {
            console.warn('[deleteEmployee] ログ記録スキップ:', logError.message);
        }

        console.log('[deleteEmployee] 削除完了:', {
            employeeId,
            employeeName,
            attendanceDeleted: attendanceSnapshot.size,
            breaksDeleted: breakSnapshot.size
        });

        alert(`${employeeName}さんのアカウントと関連データを削除しました`);
        loadEmployeeList();

    } catch (error) {
        console.error('[deleteEmployee] 削除エラー:', error);
        console.error('[deleteEmployee] エラー詳細:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        alert('削除処理でエラーが発生しました: ' + error.message);
    }
}

// 全テナント対応の従業員無効化（スーパー管理者専用）
async function deactivateEmployeeFromAllTenants(employeeId, employeeName, tenantId) {
    // スーパー管理者権限チェック
    if (!window.currentUser || window.currentUser.role !== 'super_admin') {
        alert('この操作はスーパー管理者のみ実行可能です。');
        return;
    }

    if (!confirm(`${employeeName}さんのアカウントを無効化しますか？\n\nテナント: ${tenantId}\n無効化すると、このユーザーはログインできなくなります。`)) {
        return;
    }

    try {
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .doc(employeeId)
            .update({
                isActive: false,
                deactivatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deactivatedBy: window.currentUser?.email || 'super_admin'
            });

        alert(`${employeeName}さんのアカウントを無効化しました`);
        loadAllTenantsEmployeeList();

    } catch (error) {
        console.error('従業員無効化エラー:', error);
        alert('無効化処理でエラーが発生しました');
    }
}

// 全テナント対応の従業員有効化（スーパー管理者専用）
async function activateEmployeeFromAllTenants(employeeId, employeeName, tenantId) {
    // スーパー管理者権限チェック
    if (!window.currentUser || window.currentUser.role !== 'super_admin') {
        alert('この操作はスーパー管理者のみ実行可能です。');
        return;
    }

    if (!confirm(`${employeeName}さんのアカウントを有効化しますか？\n\nテナント: ${tenantId}`)) {
        return;
    }

    try {
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .doc(employeeId)
            .update({
                isActive: true,
                activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                activatedBy: window.currentUser?.email || 'super_admin'
            });

        alert(`${employeeName}さんのアカウントを有効化しました`);
        loadAllTenantsEmployeeList();

    } catch (error) {
        console.error('従業員有効化エラー:', error);
        alert('有効化処理でエラーが発生しました');
    }
}

// 全テナント対応の従業員完全削除（スーパー管理者専用）
async function deleteEmployeeFromAllTenants(employeeId, employeeName, employeeEmail, tenantId) {
    // スーパー管理者権限チェック
    if (!window.currentUser || window.currentUser.role !== 'super_admin') {
        alert('この操作はスーパー管理者のみ実行可能です。');
        return;
    }

    const confirmation = prompt(
        `⚠️ 重要な操作です ⚠️\n\n${employeeName}さん（${employeeEmail}）のアカウントを完全に削除します。\n\n` +
        `テナント: ${tenantId}\n\n` +
        `この操作は元に戻せません。関連する勤怠データもすべて削除されます。\n\n` +
        `削除を実行するには「DELETE」と入力してください:`
    );

    if (confirmation !== 'DELETE') {
        alert('削除がキャンセルされました');
        return;
    }

    try {
        // 1. Firebase Authアカウントを削除（Admin SDKが必要のためスキップ）
        logger.log('Firebase Authアカウントの削除は管理者が手動で実行してください');

        // 2. テナント内のユーザーデータを削除
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .doc(employeeId)
            .delete();

        // 3. 関連する勤怠データを削除
        const attendanceQuery = firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('attendance')
            .where('userId', '==', employeeId);
        
        const attendanceSnapshot = await attendanceQuery.get();
        const deletePromises = [];
        
        attendanceSnapshot.docs.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });

        // 4. 関連する休憩データを削除
        const breakQuery = firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('breaks')
            .where('userId', '==', employeeId);
        
        const breakSnapshot = await breakQuery.get();
        breakSnapshot.docs.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });

        await Promise.all(deletePromises);

        // 5. 削除ログを記録
        await firebase.firestore().collection('admin_logs').add({
            action: 'delete_employee_super_admin',
            deletedEmployee: {
                id: employeeId,
                name: employeeName,
                email: employeeEmail,
                tenantId: tenantId
            },
            deletedBy: window.currentUser?.email || 'super_admin',
            deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
            deletedRecords: {
                attendance: attendanceSnapshot.size,
                breaks: breakSnapshot.size
            }
        });

        alert(`${employeeName}さんのアカウントと関連データを完全に削除しました\n\n注意: Firebase Authアカウントは手動で削除してください`);
        loadAllTenantsEmployeeList();

    } catch (error) {
        console.error('従業員削除エラー:', error);
        alert('削除処理でエラーが発生しました');
    }
}

// 従業員編集モーダルを開く
async function editEmployee(employeeId, tenantId) {
    try {
        // テナントIDが指定されていない場合は現在のテナントIDを使用
        const targetTenantId = tenantId || window.getCurrentTenantId();
        if (!targetTenantId) {
            alert('テナントIDが取得できません');
            return;
        }

        // 従業員データを取得
        const userDoc = await firebase.firestore()
            .collection('tenants')
            .doc(targetTenantId)
            .collection('users')
            .doc(employeeId)
            .get();

        if (!userDoc.exists) {
            alert('従業員データが見つかりません');
            return;
        }

        const userData = userDoc.data();

        // モーダルにデータをセット
        const editEmployeeId = document.getElementById('edit-employee-id');
        const editEmployeeTenantId = document.getElementById('edit-employee-tenant-id');
        const editEmployeeName = document.getElementById('edit-employee-name');
        const editEmployeeEmail = document.getElementById('edit-employee-email');
        const editEmployeeCode = document.getElementById('edit-employee-code');

        if (editEmployeeId) editEmployeeId.value = employeeId;
        if (editEmployeeTenantId) editEmployeeTenantId.value = targetTenantId;
        if (editEmployeeName) editEmployeeName.value = userData.displayName || '';
        if (editEmployeeEmail) editEmployeeEmail.value = userData.email || '';
        if (editEmployeeCode) editEmployeeCode.value = userData.employeeCode || '';

        // モーダルを表示
        const modal = document.getElementById('employee-edit-modal');
        if (modal) {
            modal.classList.remove('hidden');
        } else {
            alert('編集モーダルが見つかりません。ページを再読み込みしてください。');
        }
    } catch (error) {
        console.error('従業員データ取得エラー:', error);
        alert('従業員データの取得に失敗しました');
    }
}

// 従業員編集モーダルを閉じる
function closeEmployeeEditModal() {
    const modal = document.getElementById('employee-edit-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// 従業員編集を保存
async function saveEmployeeEdit() {
    try {
        const employeeId = document.getElementById('edit-employee-id').value;
        const tenantId = document.getElementById('edit-employee-tenant-id').value;
        const employeeCode = document.getElementById('edit-employee-code').value.trim();

        if (!employeeId || !tenantId) {
            alert('保存に必要な情報が不足しています');
            return;
        }

        // 従業員コードを更新
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('users')
            .doc(employeeId)
            .update({
                employeeCode: employeeCode,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        alert('従業員情報を更新しました');
        closeEmployeeEditModal();

        // 従業員一覧を再読み込み
        if (typeof loadTenantEmployeeList === 'function') {
            loadTenantEmployeeList();
        } else if (typeof loadAllTenantsEmployeeList === 'function') {
            loadAllTenantsEmployeeList();
        }
    } catch (error) {
        console.error('従業員情報更新エラー:', error);
        alert('保存に失敗しました: ' + error.message);
    }
}

// 従業員エラー表示
function showEmployeeError(message) {
    const tableBody = document.getElementById('employee-list-data');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="loading-cell">❌ ${message}</td>
            </tr>
        `;
    }
}

/**
 * ユーザー管理UI用のヘルパー関数群
 */
/**
 * 管理者ページの初期化関数
 */
async function initAdminPage() {
    logger.log('initAdminPage (SECOND): 管理者画面を初期化中...');
    
    try {
        // 管理者権限チェック
        const authUser = firebase.auth().currentUser;
        if (!authUser) {
            logger.log('initAdminPage (SECOND): Firebase認証ユーザーが見つかりません');
            return;
        }
        
        // login.jsで設定された正しいcurrentUserオブジェクトを確認
        if (!window.currentUser) {
            logger.log('initAdminPage (SECOND): window.currentUserが未設定 - 認証状態を確認');
            return;
        }
        
        // ユーザーのrole情報を確認
        logger.log('initAdminPage (SECOND): currentUser:', window.currentUser);
        logger.log('initAdminPage (SECOND): user role:', window.currentUser.role);
        
        // 管理者画面の基本設定
        setupAdminPageElements();
        
        // タブ機能の初期化
        initAdminTabs();
        
        // イベントリスナーの設定
        setupAdminEvents();
        
        // 管理者登録依頼管理（スーパー管理者のみ）
        initAdminRequestsManagement();

        // role情報の確認（login.jsで既に設定済みの場合はスキップ）
        try {
            if (window.currentUser && window.currentUser.email) {
                if (window.currentUser.role) {
                    logger.log('initAdminPage (SECOND): role情報は既に設定済み:', window.currentUser.role);
                } else {
                    logger.log('initAdminPage (SECOND): Firestoreからrole情報を取得中...');
                    const userDoc = await firebase.firestore().collection('global_users').doc(window.currentUser.email.toLowerCase()).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        window.currentUser.role = userData.role;
                        window.currentUser.tenantId = userData.tenantId; // テナントIDも確保
                        logger.log('initAdminPage (SECOND): role情報を取得:', userData.role);
                    } else {
                        logger.log('initAdminPage (SECOND): global_usersにドキュメントが見つかりません');
                    }
                }
            }
        } catch (error) {
            console.error('initAdminPage (SECOND): role情報取得エラー:', error);
        }

        // role取得完了後にタブ制御を実行
        await setupTabsBasedOnRole();

        // 従業員管理機能を初期化（admin または super_admin）
        // ※ role情報が確定してから呼び出す
        initEmployeeManagement();

        // 現場管理機能の初期化
        initSiteManagement();
        
        // ソート機能の初期化
        initSortFeatures();
        
        // 編集機能の初期化
        initAdminEditFeatures();

        // Google Sheets連携の初期化（トークン復元）
        if (window.GoogleSheets && window.GoogleSheets.init) {
            try {
                await window.GoogleSheets.init();
                logger.log('initAdminPage: Google Sheets初期化完了');
            } catch (sheetsError) {
                console.error('Google Sheets初期化エラー:', sheetsError);
                // Sheets初期化失敗は致命的ではないので続行
            }
        }

        // 初期データの読み込み
        loadAttendanceData();
        
        
    } catch (error) {
        showError('管理者ページの初期化に失敗しました');
    }
}

/**
 * ロールに基づいてタブ表示を制御する関数
 */
async function setupTabsBasedOnRole() {
    // タブ表示制御（スーパー管理者用）
    const adminRequestsTab = document.getElementById('admin-requests-tab');
    const employeeInviteTab = document.querySelector('[data-tab="invite"]');
    
    logger.log('initAdminPage (SECOND): タブ制御開始');
    logger.log('initAdminPage (SECOND): final user role:', window.currentUser?.role);
    logger.log('initAdminPage (SECOND): adminRequestsTab:', adminRequestsTab);
    logger.log('initAdminPage (SECOND): employeeInviteTab:', employeeInviteTab);
    
    if (window.currentUser && window.currentUser.role === 'super_admin') {
        logger.log('initAdminPage (SECOND): スーパー管理者として設定中...');
        // スーパー管理者：管理者依頼タブを表示、従業員招待タブを非表示
        if (adminRequestsTab) {
            adminRequestsTab.style.display = 'block';
            logger.log('initAdminPage (SECOND): 管理者依頼タブを表示');
        }
        if (employeeInviteTab) {
            employeeInviteTab.style.display = 'none';
            logger.log('initAdminPage (SECOND): 従業員招待タブを非表示');
        }
    } else {
        logger.log('initAdminPage (SECOND): 通常管理者として設定中...');
        // 通常管理者：管理者依頼タブを非表示、従業員招待タブを表示
        if (adminRequestsTab) {
            adminRequestsTab.style.display = 'none';
            logger.log('initAdminPage (SECOND): 管理者依頼タブを非表示');
        }
        if (employeeInviteTab) {
            employeeInviteTab.style.display = 'block';
            logger.log('initAdminPage (SECOND): 従業員招待タブを表示');
        }
    }
}

/**
 * 管理者ページの基本要素設定
 */
function setupAdminPageElements() {
    // ユーザー名表示
    const adminUserNameEl = document.getElementById('admin-user-name');
    if (adminUserNameEl && window.currentUser) {
        adminUserNameEl.textContent = window.currentUser.displayName || window.currentUser.email || '管理者';
    }
    
    // ログアウトボタン
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn && !logoutBtn.hasAttribute('data-listener-set')) {
        logoutBtn.addEventListener('click', signOut);
        logoutBtn.setAttribute('data-listener-set', 'true');
    }
    
    // 今日の日付をデフォルト設定
    const filterDate = document.getElementById('filter-date');
    if (filterDate && !filterDate.value) {
        filterDate.value = new Date().toISOString().split('T')[0];
    }
    
    // 今月をデフォルト設定
    const filterMonth = document.getElementById('filter-month');
    if (filterMonth && !filterMonth.value) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        filterMonth.value = `${year}-${month}`;
    }
}

/**
 * 管理者タブの初期化
 */
function initAdminTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    logger.log('initAdminTabs: タブボタン数:', tabBtns.length);
    tabBtns.forEach(btn => {
        logger.log('タブボタン:', btn.getAttribute('data-tab'));
        if (!btn.hasAttribute('data-listener-set')) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const tabName = this.getAttribute('data-tab');  // e.target → this に変更
                logger.log('タブクリック:', tabName);
                if (tabName) {
                    switchTab(tabName);
                }
            });
            btn.setAttribute('data-listener-set', 'true');
        }
    });
}

/**
 * タブ切り替え機能
 */

window.loadTenantUsers = loadTenantUsers;
window.updateUserInfo = updateUserInfo;
window.changeUserRole = changeUserRole;
window.toggleUserStatus = toggleUserStatus;
window.inviteNewEmployee = inviteNewEmployee;

// ================== 現場管理機能 ==================

/**
 * 現場管理機能の初期化
 */
function initSiteManagement() {
    // 現場追加フォームのイベント
    const addSiteForm = document.getElementById('add-site-form');
    if (addSiteForm) {
        // 既存のイベントリスナーを削除してから追加（重複防止）
        const newForm = addSiteForm.cloneNode(true);
        addSiteForm.parentNode.replaceChild(newForm, addSiteForm);
        
        const freshForm = document.getElementById('add-site-form');
        freshForm.addEventListener('submit', handleAddSite);
    }
    
    // 現場更新ボタンのイベント
    const refreshSitesBtn = document.getElementById('refresh-sites-btn');
    if (refreshSitesBtn) {
        refreshSitesBtn.addEventListener('click', loadSiteManagementList);
    }
}

/**
 * 新規現場追加処理
 */
async function handleAddSite(e) {
    e.preventDefault();
    
    const siteName = document.getElementById('add-site-name')?.value?.trim() || '';
    const siteAddress = document.getElementById('add-site-address')?.value?.trim() || '';
    const siteDescription = document.getElementById('add-site-description')?.value?.trim() || '';
    
    if (!siteName) {
        alert('現場名を入力してください');
        return;
    }
    
    try {
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
            alert('テナント情報が取得できません');
            return;
        }
        
        // 現場名の重複チェック
        const existingSites = await getTenantSites(tenantId);
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
            createdBy: firebase.auth().currentUser?.email || 'unknown'
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
        document.getElementById('add-site-form').reset();
        
        // 現場一覧を更新
        await loadSiteManagementList();
        
        alert('現場を追加しました');
        
    } catch (error) {
        console.error('現場追加エラー:', error);
        alert('現場の追加に失敗しました');
    }
}

/**
 * 現場管理用の現場一覧を読み込み表示
 */
async function loadSiteManagementList() {
    try {
        const tenantId = getCurrentTenantId();
        if (!tenantId) return;
        
        const sites = await getTenantSites(tenantId);
        const siteListData = document.getElementById('site-list-data');
        
        if (!siteListData) return;
        
        if (sites.length === 0) {
            siteListData.innerHTML = '<tr><td colspan="6" class="no-data">現場が登録されていません</td></tr>';
            return;
        }
        
        // 現場の使用状況を取得
        const siteUsageStats = await getSiteUsageStats(tenantId);
        
        const siteRows = sites.map(site => {
            const usage = siteUsageStats[site.name] || { count: 0, lastUsed: null };
            const statusBadge = site.active ? 
                '<span class="status-badge status-active">有効</span>' : 
                '<span class="status-badge status-inactive">無効</span>';
            
            const usageText = usage.count > 0 ? 
                `${usage.count}回使用` : 
                '未使用';
            
            return `
                <tr>
                    <td class="site-name">${escapeHtml(site.name)}</td>
                    <td class="site-address">${escapeHtml(site.address || '未設定')}</td>
                    <td class="site-created">${site.createdAt ? new Date(site.createdAt.toDate()).toLocaleDateString('ja-JP') : '不明'}</td>
                    <td class="site-status">${statusBadge}</td>
                    <td class="site-usage">${usageText}</td>
                    <td class="site-actions">
                        <button class="btn btn-secondary btn-small" onclick="editSite('${site.id}')">編集</button>
                        <button class="btn btn-danger btn-small" onclick="toggleSiteStatus('${site.id}', ${!site.active})">${site.active ? '無効化' : '有効化'}</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        siteListData.innerHTML = siteRows;
        
    } catch (error) {
        console.error('現場一覧読み込みエラー:', error);
        console.error('エラー詳細:', error.stack);
        const siteListData = document.getElementById('site-list-data');
        if (siteListData) {
            siteListData.innerHTML = '<tr><td colspan="6" class="error">現場一覧の読み込みに失敗しました</td></tr>';
        }
    }
}

/**
 * 現場の使用状況統計を取得
 */
async function getSiteUsageStats(tenantId) {
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
 * 現場編集処理
 */
async function editSite(siteId) {
    try {
        const tenantId = getCurrentTenantId();
        const sites = await getTenantSites(tenantId);
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
            updatedBy: firebase.auth().currentUser?.email || 'unknown'
        };
        
        // テナント設定を更新
        const updatedSites = sites.map(s => s.id === siteId ? updatedSite : s);
        await updateTenantSites(tenantId, updatedSites);
        
        // 現場一覧を更新
        await loadSiteManagementList();
        
        alert('現場情報を更新しました');
        
    } catch (error) {
        console.error('現場編集エラー:', error);
        alert('現場情報の更新に失敗しました');
    }
}

/**
 * 現場の有効/無効を切り替え
 */
async function toggleSiteStatus(siteId, newStatus) {
    try {
        const tenantId = getCurrentTenantId();
        const sites = await getTenantSites(tenantId);
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
            updatedBy: firebase.auth().currentUser?.email || 'unknown'
        };
        
        // テナント設定を更新
        const updatedSites = sites.map(s => s.id === siteId ? updatedSite : s);
        await updateTenantSites(tenantId, updatedSites);
        
        // 現場一覧を更新
        await loadSiteManagementList();
        
        alert(`現場を${action}しました`);
        
    } catch (error) {
        console.error('現場ステータス更新エラー:', error);
        alert('現場ステータスの更新に失敗しました');
    }
}

/**
 * テナントの現場設定を更新
 */
async function updateTenantSites(tenantId, sites) {
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
 * 現場管理タブを表示
 */
function showSiteManagementTab() {
    // 勤怠テーブルを非表示
    const attendanceContainer = document.querySelector('.attendance-table-container');
    if (attendanceContainer) {
        attendanceContainer.classList.add('hidden');
    }
    
    // フィルター行を非表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) {
        filterRow.classList.add('hidden');
        filterRow.style.display = 'none';
    }
    
    // 他のコンテンツを非表示
    const inviteContent = document.getElementById('invite-content');
    if (inviteContent) {
        inviteContent.classList.add('hidden');
        inviteContent.style.display = 'none';
    }
    
    const adminRequestsContent = document.getElementById('admin-requests-content');
    if (adminRequestsContent) {
        adminRequestsContent.classList.add('hidden');
        adminRequestsContent.style.display = 'none';
    }
    
    // 現場管理コンテンツを表示
    const siteManagementContent = document.getElementById('site-management-content');
    if (siteManagementContent) {
        siteManagementContent.classList.remove('hidden');
        siteManagementContent.style.display = 'block';
    }
    
    // 現場管理機能の初期化（タブ切り替え時に実行）
    if (typeof initSiteManagement === 'function') {
        initSiteManagement();
    }
    
    // 現場一覧を読み込み
    loadSiteManagementList();
}

/**
 * HTMLエスケープ関数
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 現場管理関数をグローバルスコープに公開
window.editSite = editSite;
window.toggleSiteStatus = toggleSiteStatus;
window.loadSiteManagementList = loadSiteManagementList;

// ================== ソート機能 ==================

// ソート状態を管理
let currentSortField = 'date';
let currentSortDirection = 'desc';
let currentData = [];

/**
 * ソート機能の初期化
 */
function initSortFeatures() {
    // プルダウンソートのイベントリスナー
    const sortField = document.getElementById('sort-field');
    const sortDirection = document.getElementById('sort-direction');
    
    if (sortField) {
        sortField.addEventListener('change', () => {
            currentSortField = sortField.value;
            applySortToTable();
        });
    }
    
    if (sortDirection) {
        sortDirection.addEventListener('change', () => {
            currentSortDirection = sortDirection.value;
            applySortToTable();
        });
    }
    
    // テーブルヘッダーのクリックソート
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const sortField = header.getAttribute('data-sort');
            handleHeaderSort(sortField);
        });
    });
}

/**
 * ヘッダークリックによるソート処理
 */
function handleHeaderSort(field) {
    if (currentSortField === field) {
        // 同じフィールドをクリックした場合は昇順/降順を切り替え
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // 異なるフィールドをクリックした場合は新しいフィールドで昇順
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    
    // プルダウンを更新
    const sortFieldSelect = document.getElementById('sort-field');
    const sortDirectionSelect = document.getElementById('sort-direction');
    
    if (sortFieldSelect) sortFieldSelect.value = currentSortField;
    if (sortDirectionSelect) sortDirectionSelect.value = currentSortDirection;
    
    applySortToTable();
}

/**
 * テーブルにソートを適用
 */
function applySortToTable() {
    if (currentData.length === 0) {
        // データがない場合は空のテーブルを表示
        const tbody = document.getElementById('attendance-data');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">データがありません</td></tr>';
        }
        return;
    }
    
    const sortedData = [...currentData].sort((a, b) => {
        let valueA = getSortValue(a, currentSortField);
        let valueB = getSortValue(b, currentSortField);
        
        // 日付の場合は Date オブジェクトとして比較
        if (currentSortField === 'date') {
            valueA = new Date(valueA);
            valueB = new Date(valueB);
        }
        // 時刻の場合は時刻文字列として比較
        else if (currentSortField === 'startTime') {
            valueA = valueA || '00:00:00';
            valueB = valueB || '00:00:00';
        }
        
        let comparison = 0;
        if (valueA < valueB) comparison = -1;
        if (valueA > valueB) comparison = 1;
        
        return currentSortDirection === 'desc' ? -comparison : comparison;
    });
    
    // テーブルを更新
    displaySortedData(sortedData);
    updateSortIndicators();
}

/**
 * ソート用の値を取得
 */
function getSortValue(record, field) {
    switch (field) {
        case 'userName':
            return record.userName || record.userEmail || '';
        case 'date':
            return record.date || '';
        case 'siteName':
            return record.siteName || '';
        case 'startTime':
            return record.startTime || '';
        case 'endTime':
            return record.endTime || '';
        default:
            return '';
    }
}

/**
 * ソートされたデータを表示
 */
function displaySortedData(data) {
    const tbody = document.getElementById('attendance-data');
    if (!tbody) return;

    tbody.innerHTML = data.map(record => {
        const breakDuration = calculateBreakDuration(record);
        const workDuration = calculateWorkDuration(record);
        const actualWorkDuration = calculateActualWorkDuration(record, breakDuration);

        // 有給・代休・欠勤のバッジ
        let badge = '';
        if (record.specialWorkType === 'paid_leave') {
            badge = '<span class="badge badge-leave">🌴 有給休暇</span>';
        } else if (record.specialWorkType === 'compensatory_leave') {
            badge = '<span class="badge badge-leave">🔄 代休</span>';
        } else if (record.specialWorkType === 'absence') {
            badge = '<span class="badge badge-absence">❌ 欠勤</span>';
        } else if (record.specialWorkType === 'holiday_work' || record.isHolidayWork) {
            badge = '<span class="badge badge-holiday">📅 休日出勤</span>';
        } else if (record.specialWorkType === 'night_only' || record.specialWorkType === 'through_night') {
            badge = '<span class="badge badge-night">🌙 夜間</span>';
        }

        return `
            <tr>
                <td class="${currentSortField === 'userName' ? 'sorted-column' : ''}">${escapeHtml(record.userName || record.userEmail)}${badge ? '<br>' + badge : ''}</td>
                <td class="${currentSortField === 'date' ? 'sorted-column' : ''}">${record.date}</td>
                <td class="${currentSortField === 'siteName' ? 'sorted-column' : ''}">${escapeHtml(record.siteName || '未設定')}</td>
                <td class="${currentSortField === 'startTime' ? 'sorted-column' : ''}">${record.startTime || '未出勤'}</td>
                <td class="${currentSortField === 'endTime' ? 'sorted-column' : ''}">${record.endTime || '勤務中'}</td>
                <td>${breakDuration}</td>
                <td>${actualWorkDuration}</td>
                <td>
                    <button class="btn btn-secondary btn-small" onclick="editAttendanceRecord('${record.id}')">編集</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * ソートインジケーターを更新
 */
function updateSortIndicators() {
    // すべてのヘッダーからアクティブクラスを削除
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('active', 'asc', 'desc');
    });
    
    // 現在のソートフィールドにアクティブクラスを追加
    const activeHeader = document.querySelector(`[data-sort="${currentSortField}"]`);
    if (activeHeader) {
        activeHeader.classList.add('active', currentSortDirection);
    }
}

/**
 * 休憩時間の計算
 */
function calculateBreakDuration(record) {
    // breakDuration または breakMinutes を確認（フィールド名の互換性対応）
    const breakMins = record.breakDuration || record.breakMinutes || 0;
    if (breakMins > 0) {
        const hours = Math.floor(breakMins / 60);
        const minutes = breakMins % 60;
        if (hours > 0) {
            return `${hours}時間${minutes}分`;
        } else {
            return `${minutes}分`;
        }
    }
    return '0分';
}

/**
 * 勤務時間の計算（総勤務時間）
 */
function calculateWorkDuration(record) {
    if (!record.startTime) return '未出勤';
    if (!record.endTime) return '勤務中';
    
    try {
        const start = new Date(`${record.date} ${record.startTime}`);
        const end = new Date(`${record.date} ${record.endTime}`);
        const diffMs = end - start;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}時間${minutes}分`;
    } catch (error) {
        return '計算エラー';
    }
}

/**
 * 実稼働時間の計算（総勤務時間 - 休憩時間）
 */
function calculateActualWorkDuration(record, breakDurationText) {
    if (!record.startTime) return '未出勤';
    if (!record.endTime) return '勤務中';

    try {
        const start = new Date(`${record.date} ${record.startTime}`);
        const end = new Date(`${record.date} ${record.endTime}`);
        const totalMinutes = Math.floor((end - start) / (1000 * 60));

        // 休憩時間を分に変換（breakDuration または breakMinutes を確認）
        const breakMinutes = record.breakDuration || record.breakMinutes || 0;
        
        // 実稼働時間を計算
        const actualMinutes = Math.max(0, totalMinutes - breakMinutes);
        const hours = Math.floor(actualMinutes / 60);
        const minutes = actualMinutes % 60;
        
        return `${hours}時間${minutes}分`;
    } catch (error) {
        return '計算エラー';
    }
}

/**
 * ステータスバッジの取得（既存関数の流用）
 */
function getStatusBadge(status) {
    const badges = {
        'working': '<span class="status-badge status-working">勤務中</span>',
        'break': '<span class="status-badge status-break">休憩中</span>',
        'completed': '<span class="status-badge status-completed">退勤済み</span>'
    };
    return badges[status] || '<span class="status-badge">不明</span>';
}

// 現在編集中のレコードID
let currentEditingRecordId = null;

/**
 * モーダルのイベントリスナーを設定
 */
function setupModalEventListeners() {
    logger.log('Setting up modal event listeners...');

    // 保存ボタン
    const saveBtn = document.querySelector('#admin-edit-attendance-modal .btn-primary');
    if (saveBtn) {
        // 既存のイベントリスナーを削除
        saveBtn.replaceWith(saveBtn.cloneNode(true));
        const newSaveBtn = document.querySelector('#admin-edit-attendance-modal .btn-primary');

        newSaveBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            logger.log('Save button clicked via event listener');
            try {
                await saveAttendanceRecordInternal();
            } catch (error) {
                console.error('Error in save button handler:', error);
            }
        });
        logger.log('Save button event listener added');
    }

    // 削除ボタン
    const deleteBtn = document.querySelector('#admin-edit-attendance-modal .btn-danger');
    if (deleteBtn) {
        // 既存のイベントリスナーを削除
        deleteBtn.replaceWith(deleteBtn.cloneNode(true));
        const newDeleteBtn = document.querySelector('#admin-edit-attendance-modal .btn-danger');

        newDeleteBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            logger.log('Delete button clicked via event listener');
            try {
                await deleteAttendanceRecordInternal();
            } catch (error) {
                console.error('Error in delete button handler:', error);
            }
        });
        logger.log('Delete button event listener added');
    }

    // キャンセルボタン
    const cancelBtn = document.querySelector('#admin-edit-attendance-modal .btn-secondary');
    if (cancelBtn) {
        // 既存のイベントリスナーを削除
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        const newCancelBtn = document.querySelector('#admin-edit-attendance-modal .btn-secondary');

        newCancelBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logger.log('Cancel button clicked via event listener');
            closeEditModal();
        });
        logger.log('Cancel button event listener added');
    }
}

/**
 * 勤怠レコードを編集（モーダル表示）
 */
async function editAttendanceRecord(recordId) {
    try {
        logger.log('editAttendanceRecord called with ID:', recordId);
        logger.log('currentData length:', currentData.length);
        logger.log('currentData:', currentData);
        
        // データが読み込まれていない場合の対応
        if (currentData.length === 0) {
            alert('データが読み込み中です。少々お待ちください。');
            return;
        }
        
        // レコードを検索
        const record = currentData.find(r => r.id === recordId);
        logger.log('Found record:', record);
        
        if (!record) {
            alert('レコードが見つかりません');
            return;
        }
        
        currentEditingRecordId = recordId;
        
        // モーダルのフォームに値を設定
        logger.log('Setting modal form values...');
        document.getElementById('admin-edit-employee-name').value = record.userName || record.userEmail || '';
        document.getElementById('admin-edit-date').value = record.date || '';
        document.getElementById('admin-edit-site-name').value = record.siteName || '';
        document.getElementById('admin-edit-start-time').value = record.startTime || '';
        document.getElementById('admin-edit-end-time').value = record.endTime || '';
        document.getElementById('admin-edit-break-duration').value = record.breakDuration || record.breakMinutes || 0;
        document.getElementById('admin-edit-notes').value = record.notes || '';

        // モーダルを表示
        logger.log('Showing modal...');
        const modal = document.getElementById('admin-edit-attendance-modal');
        logger.log('Modal element:', modal);
        
        if (modal) {
            // hiddenクラスを削除
            modal.classList.remove('hidden');
            
            // 強制的にdisplayスタイルを設定
            modal.style.display = 'flex';
            
            // ボタンのイベントリスナーを設定
            setupModalEventListeners();
            
            logger.log('Modal display after setting style:', window.getComputedStyle(modal).display);
            logger.log('Modal classList:', modal.classList.toString());
        } else {
            console.error('Modal element not found!');
            alert('編集画面が見つかりません');
        }
        
    } catch (error) {
        console.error('勤怠データ編集エラー:', error);
        alert('編集画面の表示に失敗しました: ' + error.message);
    }
}

/**
 * モーダルを閉じる
 */
function closeEditModal() {
    const modal = document.getElementById('admin-edit-attendance-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    currentEditingRecordId = null;
}

// ========================================
// 勤務時間計算ヘルパー関数
// ========================================

/**
 * 出勤・退勤時刻から実働時間を計算（分単位）
 * @param {string} startTime - 出勤時刻（HH:MM形式）
 * @param {string} endTime - 退勤時刻（HH:MM形式）
 * @param {number} breakMinutes - 休憩時間（分）
 * @returns {number} 実働時間（分）
 */
function calculateWorkingMinutesFromTimes(startTime, endTime, breakMinutes) {
    try {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        let startTotalMins = startHour * 60 + startMin;
        let endTotalMins = endHour * 60 + endMin;

        // 退勤が出勤より前の場合は翌日とみなす（夜勤対応）
        if (endTotalMins <= startTotalMins) {
            endTotalMins += 24 * 60;
        }

        const totalMinutes = endTotalMins - startTotalMins;
        const workingMinutes = totalMinutes - (breakMinutes || 0);

        return Math.max(0, workingMinutes);
    } catch (error) {
        console.error('勤務時間計算エラー:', error);
        return 0;
    }
}

/**
 * 夜間勤務かどうか判定
 * @param {string} startTime - 出勤時刻（HH:MM形式）
 * @param {string} endTime - 退勤時刻（HH:MM形式）
 * @returns {object} { isNight: boolean, type: 'none' | 'night_only' | 'through_night' }
 */
function detectNightWorkFromTimes(startTime, endTime) {
    try {
        const [startHour] = startTime.split(':').map(Number);
        const [endHour] = endTime.split(':').map(Number);

        // 夜間の定義：20時以降または翌朝5時前
        const isStartNight = startHour >= 20 || startHour < 5;
        const isEndNight = endHour >= 22 || endHour < 5;

        if (isStartNight) {
            return { isNight: true, type: 'night_only' };
        } else if (isEndNight) {
            return { isNight: true, type: 'through_night' };
        } else {
            return { isNight: false, type: 'none' };
        }
    } catch (error) {
        console.error('夜間勤務判定エラー:', error);
        return { isNight: false, type: 'none' };
    }
}

/**
 * 指定日が休日かどうか判定
 * @param {string} dateString - 日付（YYYY-MM-DD形式）
 * @returns {boolean} 休日ならtrue
 */
function isHolidayDate(dateString) {
    try {
        const date = new Date(dateString);
        const dayOfWeek = date.getDay();

        // 土曜(6)または日曜(0)
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return true;
        }

        // 祝日判定（簡易版：主要な祝日のみ）
        const holidays = getJapaneseHolidays(date.getFullYear());
        return holidays.includes(dateString);
    } catch (error) {
        console.error('休日判定エラー:', error);
        return false;
    }
}

/**
 * 日本の祝日リストを取得（簡易版）
 * @param {number} year - 年
 * @returns {Array<string>} 祝日の日付リスト（YYYY-MM-DD形式）
 */
function getJapaneseHolidays(year) {
    // 固定祝日
    const holidays = [
        `${year}-01-01`, // 元日
        `${year}-02-11`, // 建国記念日
        `${year}-02-23`, // 天皇誕生日
        `${year}-04-29`, // 昭和の日
        `${year}-05-03`, // 憲法記念日
        `${year}-05-04`, // みどりの日
        `${year}-05-05`, // こどもの日
        `${year}-08-11`, // 山の日
        `${year}-11-03`, // 文化の日
        `${year}-11-23`, // 勤労感謝の日
    ];
    return holidays;
}

/**
 * 勤怠レコードを保存
 */
async function saveAttendanceRecord() {
    logger.log('saveAttendanceRecord called (wrapper)');
    return await saveAttendanceRecordInternal();
}

/**
 * 勤怠レコードを保存（内部実装）
 */
async function saveAttendanceRecordInternal() {
    try {
        logger.log('saveAttendanceRecordInternal called');
        logger.log('currentEditingRecordId:', currentEditingRecordId);
        
        if (!currentEditingRecordId) {
            alert('編集対象のレコードが見つかりません');
            return;
        }
        
        // フォームデータを取得
        const date = document.getElementById('admin-edit-date').value;
        const siteName = document.getElementById('admin-edit-site-name').value.trim();
        const startTime = document.getElementById('admin-edit-start-time').value;
        const endTime = document.getElementById('admin-edit-end-time').value;
        const breakDuration = parseInt(document.getElementById('admin-edit-break-duration').value) || 0;
        const notes = document.getElementById('admin-edit-notes').value.trim();
        
        // バリデーション
        if (!date || !siteName || !startTime) {
            alert('日付、現場名、出勤時間は必須です');
            return;
        }
        
        // 終了時刻が開始時刻より前でないかチェック
        if (endTime && startTime >= endTime) {
            alert('退勤時刻は出勤時刻より後に設定してください');
            return;
        }
        
        // レコードを検索
        const record = currentData.find(r => r.id === currentEditingRecordId);
        if (!record) {
            alert('レコードが見つかりません');
            return;
        }
        
        // 更新データを準備
        const updateData = {
            date: date,
            siteName: siteName,
            startTime: startTime,
            breakDuration: breakDuration,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: firebase.auth().currentUser?.email || 'admin'
        };

        // 退勤時刻がある場合は勤務時間も計算
        if (endTime) {
            updateData.endTime = endTime;
            updateData.status = 'completed';

            // 勤務時間を計算
            const workingMinutes = calculateWorkingMinutesFromTimes(startTime, endTime, breakDuration);
            updateData.workingMinutes = workingMinutes;

            // 残業時間を計算（8時間超過分）
            const standardWorkMinutes = 8 * 60;
            updateData.overtimeMinutes = Math.max(0, workingMinutes - standardWorkMinutes);

            // 夜間勤務判定
            const nightWork = detectNightWorkFromTimes(startTime, endTime);
            updateData.isNightWork = nightWork.isNight;
            updateData.nightWorkType = nightWork.type;

            // 休日出勤判定
            updateData.isHolidayWork = isHolidayDate(date);
        }

        // メモがある場合のみ追加
        if (notes) {
            updateData.notes = notes;
        }
        
        // Firestoreを更新
        await updateAttendanceRecordInFirestore(currentEditingRecordId, record.tenantId, updateData);
        
        // モーダルを閉じる
        closeEditModal();
        
        // データを再読み込み
        await loadAttendanceData();
        
        alert('勤怠データを更新しました');
        
    } catch (error) {
        console.error('勤怠データ保存エラー:', error);
        alert('勤怠データの保存に失敗しました: ' + error.message);
    }
}

/**
 * 勤怠レコードを削除
 */
async function deleteAttendanceRecord() {
    logger.log('deleteAttendanceRecord called (wrapper)');
    return await deleteAttendanceRecordInternal();
}

/**
 * 勤怠レコードを削除（内部実装）
 */
async function deleteAttendanceRecordInternal() {
    try {
        logger.log('deleteAttendanceRecordInternal called');
        logger.log('currentEditingRecordId:', currentEditingRecordId);
        
        if (!currentEditingRecordId) {
            alert('削除対象のレコードが見つかりません');
            return;
        }
        
        // 確認ダイアログ
        if (!confirm('この勤怠レコードを削除してもよろしいですか？\n削除したデータは復元できません。')) {
            return;
        }
        
        // レコードを検索
        const record = currentData.find(r => r.id === currentEditingRecordId);
        if (!record) {
            alert('レコードが見つかりません');
            return;
        }
        
        // Firestoreから削除
        await deleteAttendanceRecordFromFirestore(currentEditingRecordId, record.tenantId);
        
        // モーダルを閉じる
        closeEditModal();
        
        // データを再読み込み
        await loadAttendanceData();
        
        alert('勤怠データを削除しました');
        
    } catch (error) {
        console.error('勤怠データ削除エラー:', error);
        alert('勤怠データの削除に失敗しました: ' + error.message);
    }
}

/**
 * Firestoreの勤怠レコードを更新
 */
async function updateAttendanceRecordInFirestore(recordId, tenantId, updateData) {
    if (tenantId) {
        // テナント専用データの場合
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('attendance')
            .doc(recordId)
            .update(updateData);
    } else {
        // 通常のattendanceコレクションの場合
        await getAttendanceCollection()
            .doc(recordId)
            .update(updateData);
    }
}

/**
 * Firestoreの勤怠レコードを削除
 */
async function deleteAttendanceRecordFromFirestore(recordId, tenantId) {
    if (tenantId) {
        // テナント専用データの場合
        await firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('attendance')
            .doc(recordId)
            .delete();
    } else {
        // 通常のattendanceコレクションの場合
        await getAttendanceCollection()
            .doc(recordId)
            .delete();
    }
}

/**
 * 経費レポートタブを表示
 */
function showExpenseReportTab() {
    // すべてのタブボタンから active を削除
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // 経費レポートタブボタンに active を追加
    const expenseReportBtn = document.querySelector('[data-tab="expense-report"]');
    if (expenseReportBtn) {
        expenseReportBtn.classList.add('active');
    }

    // すべての.tab-contentを非表示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // フィルター行を非表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) {
        filterRow.style.display = 'none';
        filterRow.classList.add('hidden');
    }

    // すべての勤怠テーブルコンテナを確実に非表示
    const attendanceContainers = document.querySelectorAll('.attendance-table-container');
    attendanceContainers.forEach((container) => {
        container.classList.add('hidden');
        container.style.display = 'none';
    });

    // 経費レポートコンテンツを表示
    const expenseReportContent = document.getElementById('expense-report-content');
    if (expenseReportContent) {
        expenseReportContent.classList.remove('hidden');
        expenseReportContent.style.display = 'block';
    }

    // 経費レポート機能を初期化
    if (typeof window.initExpenseReport === 'function') {
        window.initExpenseReport();
    }

    // 経費レポートデータを読み込み
    if (typeof window.loadExpenseReport === 'function') {
        window.loadExpenseReport();
    }
}

/**
 * 設定タブを表示
 */
function showSettingsTab() {
    // すべてのタブボタンから active を削除
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // 設定タブボタンに active を追加
    const settingsBtn = document.querySelector('[data-tab="settings"]');
    if (settingsBtn) {
        settingsBtn.classList.add('active');
    }

    // すべての.tab-contentを非表示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // フィルター行を非表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) {
        filterRow.style.display = 'none';
        filterRow.classList.add('hidden');
    }

    // すべての勤怠テーブルコンテナを確実に非表示
    const attendanceContainers = document.querySelectorAll('.attendance-table-container');
    attendanceContainers.forEach((container) => {
        container.classList.add('hidden');
        container.style.display = 'none';
    });

    // 設定コンテンツを表示
    const settingsContent = document.getElementById('settings-content');
    if (settingsContent) {
        settingsContent.classList.remove('hidden');
        settingsContent.style.display = 'block';
    }

    // 設定機能を初期化
    if (typeof window.initSettings === 'function') {
        window.initSettings();
    }

    // 現場一覧を読み込み
    if (typeof window.loadSiteList === 'function') {
        window.loadSiteList();
    }

    // 休憩時間設定を読み込み
    loadBreakTimeSettings();
}

/**
 * 休憩時間設定を読み込み
 */
async function loadBreakTimeSettings() {
    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) return;

        const settings = await window.getTenantSettings(tenantId);

        // デフォルト休憩時間を設定
        const defaultBreakMinutes = settings?.breakTime?.defaultMinutes || 60;
        const breakTimeOptions = settings?.breakTime?.options || [30, 45, 60, 90, 120];

        document.getElementById('default-break-minutes').value = defaultBreakMinutes;
        document.getElementById('break-time-options').value = breakTimeOptions.join(',');

    } catch (error) {
        console.error('休憩時間設定の読み込みエラー:', error);
    }
}

/**
 * 休憩時間設定を保存
 */
async function saveBreakTimeSettings(e) {
    e.preventDefault();

    try {
        const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
        if (!tenantId) {
            alert('テナント情報が取得できません');
            return;
        }

        const defaultBreakMinutes = parseInt(document.getElementById('default-break-minutes').value) || 60;
        const breakTimeOptionsStr = document.getElementById('break-time-options').value || '30,45,60,90,120';
        const breakTimeOptions = breakTimeOptionsStr.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));

        const tenantSettingsRef = firebase.firestore()
            .collection('tenants')
            .doc(tenantId)
            .collection('settings')
            .doc('config');

        // 現在の設定を取得
        const settingsDoc = await tenantSettingsRef.get();
        const currentSettings = settingsDoc.exists ? settingsDoc.data() : {};

        // 休憩時間設定を更新
        const updateData = {
            ...currentSettings,
            breakTime: {
                defaultMinutes: defaultBreakMinutes,
                options: breakTimeOptions,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (settingsDoc.exists) {
            await tenantSettingsRef.update(updateData);
        } else {
            await tenantSettingsRef.set(updateData);
        }

        alert('休憩時間設定を保存しました');

    } catch (error) {
        console.error('休憩時間設定の保存エラー:', error);
        alert('休憩時間設定の保存に失敗しました');
    }
}

/**
 * 休憩時間設定をリセット
 */
function resetBreakTimeSettings() {
    document.getElementById('default-break-minutes').value = 60;
    document.getElementById('break-time-options').value = '30,45,60,90,120';
}

// ========================================
// 月次給与タブの処理
// ========================================

// 月次給与の集計データを保持
let currentMonthlySummaryData = [];
let isMonthlySalaryTabInitializing = false;

/**
 * 月次給与タブを表示
 */
function showMonthlySalaryTab() {
    // 全てのタブコンテンツを非表示
    document.querySelectorAll('.tab-content, .attendance-table-container').forEach(el => {
        el.classList.add('hidden');
    });

    // フィルター行を非表示
    const filterRow = document.querySelector('.filter-row');
    if (filterRow) filterRow.style.display = 'none';

    // 月次給与コンテンツを表示
    const monthlySalaryContent = document.getElementById('monthly-salary-content');
    if (monthlySalaryContent) {
        monthlySalaryContent.classList.remove('hidden');
        monthlySalaryContent.style.display = 'block';
    }

    // タブの状態を更新
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector('[data-tab="monthly-salary"]');
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // 初回表示時に初期化
    initMonthlySalaryTab();
}

/**
 * 月次給与タブの初期化
 */
async function initMonthlySalaryTab() {
    // 並行実行を防止
    if (isMonthlySalaryTabInitializing) {
        return;
    }
    isMonthlySalaryTabInitializing = true;

    try {
    // 年月セレクトボックスを生成
    const yearMonthSelect = document.getElementById('salary-year-month');
    if (yearMonthSelect && yearMonthSelect.options.length === 0) {
        const options = window.generateYearMonthOptions ? window.generateYearMonthOptions() : [];
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            yearMonthSelect.appendChild(option);
        });
    }

    // 従業員フィルターを生成
    const employeeFilter = document.getElementById('salary-employee-filter');
    if (employeeFilter) {
        try {
            // 既存のオプションをクリア（最初の「全員」オプションは残す）
            while (employeeFilter.options.length > 1) {
                employeeFilter.remove(1);
            }

            const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
            if (tenantId) {
                const usersSnapshot = await firebase.firestore()
                    .collection('tenants')
                    .doc(tenantId)
                    .collection('users')
                    .get();

                // 従業員リストを配列に変換してソート
                const employees = [];
                usersSnapshot.forEach(doc => {
                    const userData = doc.data();
                    employees.push({
                        id: doc.id,
                        displayName: userData.displayName || userData.email || doc.id
                    });
                });

                // 名前順にソート
                employees.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

                // オプションを追加
                employees.forEach(employee => {
                    const option = document.createElement('option');
                    option.value = employee.id;
                    option.textContent = employee.displayName;
                    employeeFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('従業員リスト読み込みエラー:', error);
        }
    }

    // 現場フィルターを生成
    const siteFilter = document.getElementById('salary-site-filter');
    if (siteFilter) {
        // 既存のオプションをクリア（最初の「すべて」オプションは残す）
        while (siteFilter.options.length > 1) {
            siteFilter.remove(1);
        }

        try {
            const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
            if (tenantId && typeof window.getTenantSites === 'function') {
                const sites = await window.getTenantSites(tenantId);
                sites.filter(s => s.active).forEach(site => {
                    const option = document.createElement('option');
                    option.value = site.name;
                    option.textContent = site.name;
                    siteFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('現場リスト読み込みエラー:', error);
        }
    }

    // イベントリスナーを設定（重複防止）
    const calculateBtn = document.getElementById('salary-calculate-btn');
    if (calculateBtn && !calculateBtn.hasAttribute('data-listener-set')) {
        calculateBtn.addEventListener('click', handleCalculateMonthlySummary);
        calculateBtn.setAttribute('data-listener-set', 'true');
    }

    const exportCsvBtn = document.getElementById('salary-export-csv-btn');
    if (exportCsvBtn && !exportCsvBtn.hasAttribute('data-listener-set')) {
        exportCsvBtn.addEventListener('click', handleExportMonthlySummaryCSV);
        exportCsvBtn.setAttribute('data-listener-set', 'true');
    }

    const exportSheetsBtn = document.getElementById('salary-export-sheets-btn');
    if (exportSheetsBtn && !exportSheetsBtn.hasAttribute('data-listener-set')) {
        exportSheetsBtn.addEventListener('click', handleExportToSheets);
        exportSheetsBtn.setAttribute('data-listener-set', 'true');
    }

    // 弥生用エクスポートボタン
    const exportYayoiCsvBtn = document.getElementById('salary-export-yayoi-csv-btn');
    if (exportYayoiCsvBtn && !exportYayoiCsvBtn.hasAttribute('data-listener-set')) {
        exportYayoiCsvBtn.addEventListener('click', handleExportYayoiCSV);
        exportYayoiCsvBtn.setAttribute('data-listener-set', 'true');
    }

    const exportYayoiSheetsBtn = document.getElementById('salary-export-yayoi-sheets-btn');
    if (exportYayoiSheetsBtn && !exportYayoiSheetsBtn.hasAttribute('data-listener-set')) {
        exportYayoiSheetsBtn.addEventListener('click', handleExportYayoiToSheets);
        exportYayoiSheetsBtn.setAttribute('data-listener-set', 'true');
    }

    const sheetsSettingsBtn = document.getElementById('sheets-settings-btn');
    if (sheetsSettingsBtn && !sheetsSettingsBtn.hasAttribute('data-listener-set')) {
        sheetsSettingsBtn.addEventListener('click', openSheetsSettings);
        sheetsSettingsBtn.setAttribute('data-listener-set', 'true');
    }
    } finally {
        isMonthlySalaryTabInitializing = false;
    }
}

/**
 * 月次集計を実行
 */
async function handleCalculateMonthlySummary() {
    const yearMonthSelect = document.getElementById('salary-year-month');
    const employeeFilter = document.getElementById('salary-employee-filter');
    const siteFilter = document.getElementById('salary-site-filter');
    const calculateBtn = document.getElementById('salary-calculate-btn');
    const tbody = document.getElementById('monthly-salary-data');

    if (!yearMonthSelect || !yearMonthSelect.value) {
        alert('対象月を選択してください');
        return;
    }

    const yearMonth = yearMonthSelect.value;
    const selectedEmployeeId = employeeFilter ? employeeFilter.value : '';
    const selectedSiteName = siteFilter ? siteFilter.value : '';

    try {
        // ローディング表示
        calculateBtn.disabled = true;
        calculateBtn.textContent = '集計中...';
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">集計中...</td></tr>';

        // 月次集計を実行（フィルターを渡す）
        const summaryData = await window.calculateMonthlySummary(yearMonth, {
            employeeId: selectedEmployeeId,
            siteName: selectedSiteName
        });
        currentMonthlySummaryData = summaryData;

        // 結果を表示
        renderMonthlySummaryTable(summaryData);
        updateMonthlySummarySummary(summaryData, yearMonth);

        // ボタンを有効化
        const hasData = summaryData.length > 0;
        document.getElementById('salary-export-csv-btn').disabled = !hasData;
        document.getElementById('salary-export-yayoi-csv-btn').disabled = !hasData;
        document.getElementById('salary-export-yayoi-sheets-btn').disabled = !hasData;

    } catch (error) {
        console.error('月次集計エラー:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="no-data">エラー: ${error.message}</td></tr>`;
        alert('月次集計に失敗しました: ' + error.message);
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = '🔄 集計する';
    }
}

/**
 * 月次集計結果をテーブルに表示
 */
function renderMonthlySummaryTable(data) {
    const tbody = document.getElementById('monthly-salary-data');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">データがありません</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(record => `
        <tr>
            <td>${record.employeeName || '不明'}</td>
            <td>${record.normalHours.toFixed(1)}</td>
            <td>${record.nightOnlyHours.toFixed(1)}</td>
            <td>${record.throughNightHours.toFixed(1)}</td>
            <td>${record.holidayHours.toFixed(1)}</td>
            <td>${record.overtimeHours.toFixed(1)}</td>
            <td>${(record.breakHours || 0).toFixed(1)}</td>
            <td><strong>${record.totalHours.toFixed(1)}</strong></td>
            <td>${record.workDays}日</td>
        </tr>
    `).join('');
}

/**
 * サマリーカードを更新
 */
function updateMonthlySummarySummary(data, yearMonth) {
    // 従業員数
    const employeeCountEl = document.getElementById('salary-employee-count');
    if (employeeCountEl) {
        employeeCountEl.textContent = `${data.length}名`;
    }

    // 総勤務時間
    const totalHours = data.reduce((sum, r) => sum + r.totalHours, 0);
    const totalHoursEl = document.getElementById('salary-total-hours');
    if (totalHoursEl) {
        totalHoursEl.textContent = `${totalHours.toFixed(1)}h`;
    }

    // 対象期間
    const periodEl = document.getElementById('salary-period');
    if (periodEl) {
        const [year, month] = yearMonth.split('-');
        periodEl.textContent = `${year}年${parseInt(month)}月`;
    }
}

/**
 * 月次集計結果をCSV出力
 */
function handleExportMonthlySummaryCSV() {
    if (!currentMonthlySummaryData || currentMonthlySummaryData.length === 0) {
        alert('出力するデータがありません');
        return;
    }

    const yearMonth = document.getElementById('salary-year-month').value;
    const csvContent = window.MonthlySummary.convertToCSV(currentMonthlySummaryData, yearMonth);

    // BOM付きでダウンロード
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `monthly_salary_${yearMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * スプレッドシートに出力
 */
async function handleExportToSheets() {
    if (!currentMonthlySummaryData || currentMonthlySummaryData.length === 0) {
        alert('出力するデータがありません。先に集計を実行してください。');
        return;
    }

    const yearMonth = document.getElementById('salary-year-month').value;
    if (!yearMonth) {
        alert('対象月を選択してください');
        return;
    }

    // 認証確認
    if (!window.GoogleSheets || !window.GoogleSheets.isAuthenticated()) {
        alert('Google認証が必要です。連携設定から認証を行ってください。');
        openSheetsSettings();
        return;
    }

    const settings = window.GoogleSheets.getSettings();
    if (!settings.spreadsheetId) {
        alert('スプレッドシートIDが設定されていません。連携設定を行ってください。');
        openSheetsSettings();
        return;
    }

    const exportBtn = document.getElementById('salary-export-sheets-btn');

    try {
        exportBtn.disabled = true;
        exportBtn.textContent = '出力中...';

        const result = await window.GoogleSheets.exportMonthlySummary(currentMonthlySummaryData, yearMonth);

        alert(`スプレッドシートに出力しました！\nシート名: ${result.sheetName}\n出力件数: ${result.rowCount}名`);

    } catch (error) {
        console.error('スプレッドシート出力エラー:', error);
        alert('スプレッドシートへの出力に失敗しました: ' + error.message);
    } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = '📤 スプレッドシート';
    }
}

/**
 * 弥生給与用CSV出力
 */
function handleExportYayoiCSV() {
    if (!currentMonthlySummaryData || currentMonthlySummaryData.length === 0) {
        alert('出力するデータがありません');
        return;
    }

    const yearMonth = document.getElementById('salary-year-month').value;
    const csvContent = window.MonthlySummary.convertToYayoiCSV(currentMonthlySummaryData, {});

    // BOM付きでダウンロード
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `yayoi_salary_${yearMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 弥生給与用スプレッドシート出力
 */
async function handleExportYayoiToSheets() {
    if (!currentMonthlySummaryData || currentMonthlySummaryData.length === 0) {
        alert('出力するデータがありません。先に集計を実行してください。');
        return;
    }

    const yearMonth = document.getElementById('salary-year-month').value;
    if (!yearMonth) {
        alert('対象月を選択してください');
        return;
    }

    // 認証確認
    if (!window.GoogleSheets || !window.GoogleSheets.isAuthenticated()) {
        alert('Google認証が必要です。連携設定から認証を行ってください。');
        openSheetsSettings();
        return;
    }

    const settings = window.GoogleSheets.getSettings();
    if (!settings.spreadsheetId) {
        alert('スプレッドシートIDが設定されていません。連携設定を行ってください。');
        openSheetsSettings();
        return;
    }

    const exportBtn = document.getElementById('salary-export-yayoi-sheets-btn');

    try {
        exportBtn.disabled = true;
        exportBtn.textContent = '出力中...';

        const result = await window.GoogleSheets.exportYayoiSummary(currentMonthlySummaryData, yearMonth);

        alert(`弥生用データをスプレッドシートに出力しました！\nシート名: ${result.sheetName}\n出力件数: ${result.rowCount}名`);

    } catch (error) {
        console.error('弥生用スプレッドシート出力エラー:', error);
        alert('スプレッドシートへの出力に失敗しました: ' + error.message);
    } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = '📤 スプレッドシート';
    }
}

/**
 * Sheets設定モーダルを開く
 */
function openSheetsSettings() {
    const modal = document.getElementById('sheets-settings-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // 現在の設定を読み込み
        const settings = window.GoogleSheets ? window.GoogleSheets.getSettings() : {};
        document.getElementById('sheets-spreadsheet-id').value = settings.spreadsheetId || '';
        document.getElementById('sheets-master-name').value = settings.masterSheetName || 'マスタ';

        // 認証状態を更新
        updateModalAuthStatus();
    }
}

/**
 * Sheets設定モーダルを閉じる
 */
function closeSheetsSettingsModal() {
    const modal = document.getElementById('sheets-settings-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

/**
 * Google認証を実行
 */
async function handleGoogleAuth() {
    const authBtn = document.getElementById('btn-google-auth');

    try {
        authBtn.disabled = true;
        authBtn.textContent = '認証中...';

        await window.GoogleSheets.authenticate();

        updateModalAuthStatus();
        alert('Google認証に成功しました！');

    } catch (error) {
        console.error('認証エラー:', error);
        alert('認証に失敗しました: ' + error.message);
    } finally {
        authBtn.disabled = false;
        authBtn.textContent = 'Google認証';
    }
}

/**
 * モーダルの認証状態UIを更新
 */
function updateModalAuthStatus() {
    const isAuthed = window.GoogleSheets && window.GoogleSheets.isAuthenticated();
    const statusCard = document.getElementById('modal-auth-status');
    const icon = document.getElementById('modal-auth-icon');
    const title = document.getElementById('modal-auth-title');
    const desc = document.getElementById('modal-auth-desc');
    const authBtn = document.getElementById('btn-google-auth');

    if (isAuthed) {
        statusCard.classList.add('authenticated');
        icon.textContent = '✅';
        title.textContent = '認証済み';
        desc.textContent = 'Googleアカウントで認証されています';
        authBtn.textContent = '再認証';
    } else {
        statusCard.classList.remove('authenticated');
        icon.textContent = '🔒';
        title.textContent = '未認証';
        desc.textContent = 'Googleアカウントで認証してください';
        authBtn.textContent = 'Google認証';
    }

    // メイン画面の認証状態も更新
    if (window.GoogleSheets) {
        window.GoogleSheets.updateAuthStatus(isAuthed);
    }
}

/**
 * 接続テスト
 */
async function handleTestConnection() {
    const spreadsheetId = document.getElementById('sheets-spreadsheet-id').value.trim();
    const resultDiv = document.getElementById('connection-result');

    if (!spreadsheetId) {
        alert('スプレッドシートIDを入力してください');
        return;
    }

    if (!window.GoogleSheets || !window.GoogleSheets.isAuthenticated()) {
        alert('先にGoogle認証を行ってください');
        return;
    }

    try {
        resultDiv.classList.remove('hidden', 'success', 'error');
        resultDiv.textContent = '接続テスト中...';

        const result = await window.GoogleSheets.testConnection(spreadsheetId);

        resultDiv.classList.add('success');
        resultDiv.innerHTML = `
            <strong>✅ 接続成功！</strong><br>
            スプレッドシート名: ${result.title}<br>
            シート数: ${result.sheets.length}枚（${result.sheets.join(', ')}）
        `;

    } catch (error) {
        console.error('接続テストエラー:', error);
        resultDiv.classList.add('error');
        resultDiv.innerHTML = `
            <strong>❌ 接続失敗</strong><br>
            ${error.message}<br>
            スプレッドシートIDが正しいか、アクセス権限があるか確認してください。
        `;
    }
}

/**
 * スプレッドシートを開く
 */
function handleOpenSheet() {
    const spreadsheetId = document.getElementById('sheets-spreadsheet-id').value.trim();
    if (spreadsheetId) {
        window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, '_blank');
    } else {
        alert('スプレッドシートIDを入力してください');
    }
}

/**
 * Sheets設定を保存
 */
function saveSheetsSettings() {
    const spreadsheetId = document.getElementById('sheets-spreadsheet-id').value.trim();
    const masterSheetName = document.getElementById('sheets-master-name').value.trim() || 'マスタ';

    if (!spreadsheetId) {
        alert('スプレッドシートIDを入力してください');
        return;
    }

    const settings = {
        spreadsheetId: spreadsheetId,
        masterSheetName: masterSheetName,
        settingsSheetName: '設定'
    };

    if (window.GoogleSheets) {
        window.GoogleSheets.saveSettings(settings);
    }

    // スプレッドシート出力ボタンの状態を更新
    const exportBtn = document.getElementById('salary-export-sheets-btn');
    if (exportBtn && window.GoogleSheets && window.GoogleSheets.isAuthenticated()) {
        exportBtn.disabled = false;
    }

    alert('設定を保存しました！');
    closeSheetsSettingsModal();
}

// グローバルスコープに関数をエクスポート
window.initAdminPage = initAdminPage;
window.switchTab = switchTab;
window.initSiteManagement = initSiteManagement;
window.initSortFeatures = initSortFeatures;
window.editAttendanceRecord = editAttendanceRecord;
window.closeEditModal = closeEditModal;
window.saveAttendanceRecord = saveAttendanceRecord;
window.deleteAttendanceRecord = deleteAttendanceRecord;
window.approveAdminRequest = approveAdminRequest;
window.rejectAdminRequest = rejectAdminRequest;
window.viewRequestDetails = viewRequestDetails;
window.currentData = currentData;
window.showExpenseReportTab = showExpenseReportTab;
window.showSettingsTab = showSettingsTab;
window.saveBreakTimeSettings = saveBreakTimeSettings;
window.resetBreakTimeSettings = resetBreakTimeSettings;
window.showMonthlySalaryTab = showMonthlySalaryTab;
window.initMonthlySalaryTab = initMonthlySalaryTab;
window.openSheetsSettings = openSheetsSettings;
window.closeSheetsSettingsModal = closeSheetsSettingsModal;
window.handleGoogleAuth = handleGoogleAuth;
window.handleTestConnection = handleTestConnection;
window.handleOpenSheet = handleOpenSheet;
window.saveSheetsSettings = saveSheetsSettings;

// 従業員管理関連（削除・無効化・有効化・編集）
window.deleteEmployee = deleteEmployee;
window.deleteEmployeeFromAllTenants = deleteEmployeeFromAllTenants;
window.deactivateEmployee = deactivateEmployee;
window.activateEmployee = activateEmployee;
window.deactivateEmployeeFromAllTenants = deactivateEmployeeFromAllTenants;
window.activateEmployeeFromAllTenants = activateEmployeeFromAllTenants;
window.showEmployeeManagementTab = showEmployeeManagementTab;
window.loadEmployeeList = loadEmployeeList;
window.loadAllTenantsEmployeeList = loadAllTenantsEmployeeList;
window.editEmployee = editEmployee;
window.closeEmployeeEditModal = closeEmployeeEditModal;
window.saveEmployeeEdit = saveEmployeeEdit;

