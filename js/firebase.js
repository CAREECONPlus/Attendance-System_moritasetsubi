
/**
 * 勤怠管理システム - Firebase初期化 (v8 SDK対応版・修正版)
 * 権限エラー解決のためオフライン機能を一時的に無効化
 */

// Firebase設定 - 環境に応じて設定を取得
const firebaseConfig = (() => {
    // 本番環境では window.FIREBASE_CONFIG が設定される
    if (window.FIREBASE_CONFIG) {
        return window.FIREBASE_CONFIG;
    }
    
    // 設定が見つからない場合のエラーハンドリング
    throw new Error('Firebase configuration not found');
})();

// Firebase初期化状態を追跡
let isFirebaseInitialized = false;

try {
    
    // Firebase v8 SDKで初期化
    firebase.initializeApp(firebaseConfig);
    
    // データベースとAuth インスタンスを取得
    const db = firebase.firestore();
    const auth = firebase.auth();
    
    
    // 🔧 オフライン機能を一時的に無効化（権限問題回避のため）
    /*
    db.enablePersistence({
        synchronizeTabs: true
    }).catch((err) => {
        if (err.code === 'failed-precondition') {
        } else if (err.code === 'unimplemented') {
        }
    });
    */
    
    // 🆕 Firestore設定を簡略化
    
    // グローバルスコープにエクスポート
    window.db = db;
    window.auth = auth;
    window.firebase = firebase;
    
    isFirebaseInitialized = true;
    
    // 🔇 接続テストを無効化（誤検知防止のため）
    // TODO: より適切なテスト方法に改良予定
    /*
    setTimeout(async () => {
        try {
            
            // 最もシンプルなテスト（read権限で動作）
            const testDoc = db.collection('_test').doc('connection-test');
            await testDoc.get();
            
            
        } catch (testError) {
            
            // 詳細なエラー情報を表示
            if (testError.code === 'permission-denied') {
                showFirestoreRuleError();
            } else if (testError.code === 'unavailable') {
                showFirestoreUnavailableError();
            } else {
            }
        }
    }, 1000); // より早い段階でテスト
    */
    
} catch (initError) {
    
    // より詳細なエラー情報
    
    // 初期化失敗時のフォールバック処理
    window.db = null;
    window.auth = null;
    
    // エラーメッセージを表示
    showInitializationError(initError);
}

/**
 * 🚨 Firestoreルールエラーの表示
 */
function showFirestoreRuleError() {
    const errorDiv = createErrorDiv();
    errorDiv.innerHTML = `
        <h3>🔒 Firestore セキュリティルール エラー</h3>
        <p><strong>権限が不足しています</strong></p>
        <div style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; font-size: 12px; text-align: left;">
            <strong>解決方法:</strong><br>
            1. Firebase Console → Firestore → ルール<br>
            2. 以下をコピー&ペースト:<br>
            <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 3px; font-size: 10px; display: block; white-space: pre;">
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Global users collection
    match /global_users/{email} {
      allow read, write: if request.auth != null && request.auth.token.email == email;
      allow write: if request.auth != null && isSuperAdmin(request.auth.token.email);
    }
    
    // Legacy users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Tenants collection
    match /tenants/{tenantId} {
      allow read: if request.auth != null && 
                 (isSuperAdmin(request.auth.token.email) || 
                  getUserTenantId(request.auth.token.email) == tenantId);
      allow write: if request.auth != null && 
                  (isSuperAdmin(request.auth.token.email) || 
                   isAdmin(request.auth.token.email, tenantId));
    }
    
    // Tenant subcollections
    match /tenants/{tenantId}/{subcollection}/{docId} {
      allow read, write: if request.auth != null && 
                        (isSuperAdmin(request.auth.token.email) || 
                         getUserTenantId(request.auth.token.email) == tenantId);
    }
    
    // Admin requests
    match /admin_requests/{docId} {
      allow read, write: if request.auth != null && isSuperAdmin(request.auth.token.email);
      allow create: if request.auth != null;
    }
    
    // Test collection
    match /_test/{docId} {
      allow read, write: if request.auth != null;
    }
    
    // Helper functions
    function getUserTenantId(email) {
      return get(/databases/$(database)/documents/global_users/$(email)).data.tenantId;
    }
    
    function isSuperAdmin(email) {
      return get(/databases/$(database)/documents/global_users/$(email)).data.role == 'super_admin';
    }
    
    function isAdmin(email, tenantId) {
      let userData = get(/databases/$(database)/documents/global_users/$(email)).data;
      return userData.tenantId == tenantId && userData.role in ['admin', 'super_admin'];
    }
  }
}
            </code><br>
            3. 「公開」をクリック<br>
            4. 1-2分待ってからリロード
        </div>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: white; color: #ff4d4d; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
            🔄 リロード
        </button>
        <button onclick="this.parentElement.remove()" style="margin-left: 10px; padding: 8px 16px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 4px; cursor: pointer;">
            ✕ 閉じる
        </button>
    `;
}

/**
 * 🌐 Firestore利用不可エラーの表示
 */
function showFirestoreUnavailableError() {
    const errorDiv = createErrorDiv();
    errorDiv.innerHTML = `
        <h3>🌐 Firestore サービス利用不可</h3>
        <p>Firestoreサービスに接続できません</p>
        <div style="margin: 15px 0;">
            <strong>考えられる原因:</strong><br>
            • インターネット接続の問題<br>
            • Firebaseサービスの一時的な障害<br>
            • プロジェクト設定の問題
        </div>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: white; color: #ff4d4d; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
            🔄 リロード
        </button>
    `;
}

/**
 * 🔧 初期化エラーの表示
 */
function showInitializationError(error) {
    document.addEventListener('DOMContentLoaded', () => {
        const errorDiv = createErrorDiv();
        errorDiv.innerHTML = `
            <h3>❌ Firebase初期化エラー</h3>
            <p>システムが正常に動作しない可能性があります</p>
            <div style="margin: 15px 0; font-size: 12px;">
                <strong>エラー:</strong> ${error.message}
            </div>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: white; color: #ff4d4d; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                🔄 リロード
            </button>
        `;
    });
}

/**
 * エラー表示用のDIV作成
 */
function createErrorDiv() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4d4d;
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 9999;
        font-family: Arial, sans-serif;
        max-width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(errorDiv);
    return errorDiv;
}

// Firebase接続状態の確認
if (isFirebaseInitialized) {
    // 🔇 認証状態の監視は login.js で管理するため無効化
    // auth.onAuthStateChanged((user) => {
    //     if (user) {
    //     } else {
    //     }
    // });
    console.log('🔧 Firebase初期化完了 - 認証監視はlogin.jsに委譲');
}

/**
 * Firebase初期化の確認関数（改良版）
 */
window.checkFirebaseConnection = function() {
    const result = {
        initialized: isFirebaseInitialized,
        app: isFirebaseInitialized && !!firebase.app(),
        database: isFirebaseInitialized && !!window.db,
        auth: isFirebaseInitialized && !!window.auth,
        user: isFirebaseInitialized && window.auth ? window.auth.currentUser : null,
        projectId: isFirebaseInitialized ? firebaseConfig.projectId : null
    };
    
    return result;
};

/**
 * Firebase設定情報の取得（デバッグ用・改良版）
 */
window.getFirebaseInfo = function() {
    if (!isFirebaseInitialized) {
        return { error: 'Firebase未初期化' };
    }
    
    const info = {
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        currentUser: window.auth && window.auth.currentUser ? {
            uid: window.auth.currentUser.uid,
            email: window.auth.currentUser.email,
            displayName: window.auth.currentUser.displayName
        } : null,
        firestoreReady: !!window.db
    };
    
    return info;
};

/**
 * Firebase再初期化関数（緊急時用・改良版）
 */
window.reinitializeFirebase = function() {
    
    try {
        // 既存のアプリを削除
        if (firebase.apps.length > 0) {
            firebase.app().delete();
        }
        
        // 再初期化
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();
        
        isFirebaseInitialized = true;
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * 🧪 強制Firestoreテスト関数
 */
window.testFirestore = async function() {
    
    if (!window.db) {
        return false;
    }
    
    try {
        // 読み取りテスト
        await window.db.collection('_test').limit(1).get();
        
        // 書き込みテスト
        await window.db.collection('_test').doc('connection-test').set({
            test: true,
            timestamp: new Date(),
            browser: navigator.userAgent
        });
        
        return true;
        
    } catch (error) {
        return false;
    }
};

// エラーハンドリング（改良版）
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.code) {
        if (event.reason.code.startsWith('auth/')) {
        } else if (event.reason.code.startsWith('firestore/')) {
            
            // 権限エラーの場合は特別な処理
            if (event.reason.code === 'firestore/permission-denied') {
            }
        }
    }
});

// Firebase初期化完了の通知
if (isFirebaseInitialized) {
    // カスタムイベントを発火して他のスクリプトに初期化完了を通知
    document.addEventListener('DOMContentLoaded', () => {
        const event = new CustomEvent('firebaseInitialized', {
            detail: {
                db: window.db,
                auth: window.auth,
                firebase: window.firebase
            }
        });
        document.dispatchEvent(event);
        
    });
}

// デバッグ用コマンド一覧
 
