// テナント対応のコレクションアクセス関数
window.getTenantCollection = function(collection) {
    const tenantId = window.getCurrentTenantId ? window.getCurrentTenantId() : null;
    const currentUser = window.currentUser;
    
    // super_adminは全テナントのデータにアクセス可能
    if (tenantId && currentUser && currentUser.role !== 'super_admin') {
        return `tenants/${tenantId}/${collection}`;
    }
    return collection;
};

window.getTenantFirestore = function(collection) {
    const collectionPath = getTenantCollection(collection);
    return firebase.firestore().collection(collectionPath);
};

// 現在のテナントIDを取得
window.getCurrentTenantId = function() {
    return window.currentTenant ? window.currentTenant.id : null;
};

// テナント対応のユーザーコレクションアクセス
window.getUserCollection = function() {
    const tenantId = getCurrentTenantId();
    const currentUser = window.currentUser;
    
    if (tenantId && currentUser && currentUser.role !== 'super_admin') {
        return firebase.firestore().collection(`tenants/${tenantId}/users`);
    }
    return firebase.firestore().collection('users');
};

// グローバルユーザー情報の取得
window.getGlobalUserDoc = function(userEmail) {
    return firebase.firestore().collection('global_users').doc(userEmail);
};

// デバッグ用のグローバル関数（開発環境のみ）
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.debugInfo = function() {
        return {
            tenant: window.currentTenant,
            user: window.currentUser,
            auth: firebase.auth().currentUser
        };
    };
    
    window.forceLogin = function() {
        if (window.showPage) {
            window.showPage('login');
        }
    };
    
    window.testAuth = function() {
        return window.checkAuthStatus ? window.checkAuthStatus() : null;
    };
    
    window.testTenantAccess = function(collection) {
        return getTenantCollection(collection);
    };
}

// グローバルスコープにエクスポート
if (typeof window.initializeSystem === 'function') {
    window.initializeSystem = window.initializeSystem;
}
if (typeof window.showError === 'function') {
    window.showError = window.showError;
}
if (typeof window.showSuccess === 'function') {
    window.showSuccess = window.showSuccess;
}
if (typeof window.checkAuthStatus === 'function') {
    window.checkAuthStatus = window.checkAuthStatus;
}
if (typeof window.diagnoseApplication === 'function') {
    window.diagnoseApplication = window.diagnoseApplication;
}
