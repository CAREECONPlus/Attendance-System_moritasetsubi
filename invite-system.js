/**
 * 招待リンクシステム
 * 管理者が生成した招待リンクで従業員を安全に登録
 */


/**
 * URLパラメータから招待トークンを取得
 */
function getInviteTokenFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('invite');
}

/**
 * 招待トークンの検証
 */
async function validateInviteToken(inviteToken) {
    try {
        if (!inviteToken) {
            throw new Error('招待トークンが指定されていません');
        }
        
        if (!firebase || !firebase.firestore) {
            throw new Error('Firebase が初期化されていません');
        }
        
        console.log('🔍 招待トークン検証開始:', inviteToken);
        
        // グローバルのinvite_codesコレクションから検索
        const inviteRef = await firebase.firestore()
            .collection('invite_codes')
            .where('code', '==', inviteToken)
            .where('active', '==', true)
            .get();
        
        console.log('📋 招待コード検索結果:', {
            empty: inviteRef.empty,
            size: inviteRef.size
        });
        
        if (inviteRef.empty) {
            throw new Error('無効な招待トークンです');
        }
        
        const inviteData = inviteRef.docs[0].data();
        console.log('📄 招待データ:', {
            tenantId: inviteData.tenantId,
            companyName: inviteData.companyName,
            expiresAt: inviteData.expiresAt,
            used: inviteData.used,
            maxUses: inviteData.maxUses
        });
        
        // 有効期限チェック
        if (inviteData.expiresAt && inviteData.expiresAt.toDate() < new Date()) {
            throw new Error('招待トークンの有効期限が切れています');
        }
        
        // 使用回数チェック
        if (inviteData.maxUses && inviteData.used >= inviteData.maxUses) {
            throw new Error('招待トークンの使用回数上限に達しています');
        }
        
        console.log('✅ 招待トークン検証成功');
        
        return {
            valid: true,
            tenantId: inviteData.tenantId,
            companyName: inviteData.companyName,
            inviteId: inviteRef.docs[0].id,
            data: inviteData
        };
        
    } catch (error) {
        console.error('❌ 招待トークン検証エラー:', error);
        
        // Firebaseの権限エラーの場合は詳細なメッセージ
        if (error.code === 'permission-denied') {
            return {
                valid: false,
                error: 'データベースアクセス権限がありません。システム管理者にお問い合わせください。'
            };
        }
        
        return {
            valid: false,
            error: error.message
        };
    }
}

/**
 * 招待トークン使用回数を増加
 */
async function incrementInviteTokenUsage(inviteId) {
    try {
        await firebase.firestore()
            .collection('invite_codes')
            .doc(inviteId)
            .update({
                used: firebase.firestore.FieldValue.increment(1),
                lastUsedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
    } catch (error) {
    }
}

/**
 * 招待コードのスタイル設定
 */
function setupInviteStyles() {
    if (document.getElementById('invite-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'invite-styles';
    styleElement.textContent = `
        .invite-info {
            background: #e8f5e8;
            border: 1px solid #4CAF50;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .invite-company {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .invite-label {
            font-weight: 600;
            color: #2E7D32;
        }
        
        .invite-company-name {
            font-weight: 700;
            color: #1B5E20;
            background: #C8E6C9;
            padding: 4px 12px;
            border-radius: 4px;
        }
        
        .invite-error {
            background: #ffebee;
            border: 1px solid #f44336;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
            color: #c62828;
        }
        
        .invite-warning {
            background: #fff3e0;
            border: 1px solid #ff9800;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
            color: #ef6c00;
        }
    `;
    
    document.head.appendChild(styleElement);
}

/**
 * Firebase初期化完了を待つ
 */
function waitForFirebaseInit() {
    return new Promise((resolve) => {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 10000);
        }
    });
}

/**
 * 招待リンクの初期化処理
 */
async function initInviteSystem() {
    console.log('🎫 招待システムを初期化中...');
    
    setupInviteStyles();
    
    const inviteToken = getInviteTokenFromURL();
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const inviteInfo = document.getElementById('invite-info');
    
    console.log('🔍 URLから招待トークンを確認:', inviteToken);
    
    if (inviteToken) {
        await waitForFirebaseInit();
        
        const validation = await validateInviteToken(inviteToken);
        const companyNameDisplay = document.getElementById('company-name-display');
        
        if (validation.valid) {
            // 有効な招待コードの場合 - 登録フォームを表示
            
            // 会社名を表示
            if (companyNameDisplay) {
                companyNameDisplay.textContent = validation.companyName || '会社名';
            }
            
            // 招待情報を表示
            if (inviteInfo) {
                inviteInfo.classList.remove('hidden');
                inviteInfo.className = 'invite-info';
            }
            
            // 登録フォームを表示、ログインフォームを隠す
            if (registerForm) {
                registerForm.classList.remove('hidden');
            }
            if (loginForm) {
                loginForm.classList.add('hidden');
            }
            
            // 招待トークンをグローバル変数として保存
            window.currentInviteToken = inviteToken;
            
        } else {
            // 無効な招待リンクの場合 - エラー表示してログインフォーム表示
            if (inviteInfo) {
                inviteInfo.classList.remove('hidden');
                inviteInfo.className = 'invite-error';
                inviteInfo.innerHTML = `
                    <div>❌ ${validation.error}</div>
                    <div style="margin-top: 10px; font-size: 14px;">
                        管理者に正しい招待リンクを確認してください
                    </div>
                `;
            }
            
            // ログインフォームを表示
            if (loginForm) {
                loginForm.classList.remove('hidden');
            }
            if (registerForm) {
                registerForm.classList.add('hidden');
            }
        }
    } else {
        // 招待トークンなしの場合 - ログインフォームのみ表示
        if (loginForm) {
            loginForm.classList.remove('hidden');
        }
        if (registerForm) {
            registerForm.classList.add('hidden');
        }
        if (inviteInfo) {
            inviteInfo.classList.add('hidden');
            inviteInfo.innerHTML = `
                <div>⚠️ 招待リンクが必要です</div>
                <div style="margin-top: 10px; font-size: 14px;">
                    従業員登録には管理者からの招待リンクが必要です
                </div>
            `;
            inviteInfo.style.display = 'block';
        }
    }
}



// グローバル関数として公開
window.initInviteSystem = initInviteSystem;
window.validateInviteToken = validateInviteToken;
window.getInviteTokenFromURL = getInviteTokenFromURL;

