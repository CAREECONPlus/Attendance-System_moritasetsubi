
/**
 * 勤怠管理システム - Firebase認証機能 (v8 SDK対応版)
 * 
 * このファイルには、Firebase Authenticationを使用した
 * ログイン、登録、ログアウト、認証状態管理の機能が含まれています。
 */

// Firebase関連の参照を取得（グローバル変数を使用）
let firebaseAuth;
let firestoreDb;

// 初期化関数
function initAuth() {
    // Firebase参照を取得（firebase.js で定義されたものを使用）
    firebaseAuth = window.auth;
    firestoreDb = window.db;
    
    if (!firebaseAuth || !firestoreDb) {
        return;
    }
    
}

/**
 * 招待トークンを使った従業員登録
 * @param {string} email メールアドレス
 * @param {string} password パスワード
 * @param {string} displayName 表示名
 * @param {string} inviteToken 招待トークン
 * @returns {Object} { success: boolean, user?: User, error?: string }
 */
async function registerEmployeeWithInvite(email, password, displayName, inviteToken) {
    try {
        // 招待トークンを検証
        const validation = await validateInviteToken(inviteToken);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // Firebase Authenticationでユーザー作成
        const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // ユーザープロフィールを更新
        await user.updateProfile({
            displayName: displayName
        });
        
        // Firebase Auth状態の同期 - onAuthStateChangedを使用した確実な同期
        await new Promise(async (resolve, reject) => {
            let timeoutId;
            let unsubscribe;
            
            // タイムアウト設定（10秒）
            timeoutId = setTimeout(() => {
                if (unsubscribe) unsubscribe();
                reject(new Error('認証状態の同期がタイムアウトしました'));
            }, 10000);
            
            // 認証状態変更リスナー
            unsubscribe = firebaseAuth.onAuthStateChanged(async (currentUser) => {
                if (currentUser && currentUser.uid === user.uid) {
                    // 認証状態が正しく同期された
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve();
                }
            });
            
            // 手動で認証状態を更新
            try {
                await firebaseAuth.updateCurrentUser(user);
            } catch (error) {
                // 手動更新が失敗した場合でも、リスナーで同期を待つ
                console.log('Manual updateCurrentUser failed, waiting for auth state change:', error);
            }
        });
        
        // IDトークンを取得
        let idToken;
        try {
            idToken = await user.getIdToken(true);
        } catch (tokenError) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            idToken = await user.getIdToken(true);
        }
        
        // テナント情報を取得
        const tenantId = validation.tenantId;

        // Firestore書き込み処理
        try {
            const authenticatedFirestore = firebase.firestore();
            
            // 1. テナント内ユーザー情報を保存
            const userCollection = authenticatedFirestore.collection('tenants').doc(tenantId).collection('users');
            
            const userDocPromise = userCollection.doc(user.uid).set({
                email: email,
                displayName: displayName,
                role: 'employee',
                tenantId: tenantId,
                inviteToken: inviteToken,
                createdAt: new Date(),
                updatedAt: new Date(),
                siteHistory: []
            });
            
            await userDocPromise;

            // 2. global_usersに追加（メールアドレスをキーとして使用）
            try {
                await authenticatedFirestore.collection('global_users').doc(email).set({
                    uid: user.uid,
                    email: email,
                    displayName: displayName,
                    tenantId: tenantId,
                    role: 'employee',
                    createdAt: new Date()
                });
            } catch (globalWriteError) {
                // global_users の失敗は致命的ではないので、処理を継続
                console.warn('Global usersの保存に失敗しましたが、テナントユーザー登録は完了しました', globalWriteError);
            }

            // 3. 招待コードの使用回数を更新
            try {
                await authenticatedFirestore.collection('invite_codes').doc(validation.inviteId).update({
                    used: firebase.firestore.FieldValue.increment(1),
                    lastUsedAt: new Date()
                });
            } catch (inviteUpdateError) {
                // 招待コード更新の失敗は致命的ではないので、警告のみ
                console.warn('招待コードの更新に失敗しましたが、ユーザー登録は完了しました');
            }
            
        } catch (firestoreError) {
            console.error('Firestore operation failed:', firestoreError);
            // ユーザー作成は成功したが、Firestore保存で失敗した場合
            // ユーザーを削除するかログに記録する
            throw new Error(`ユーザー情報の保存に失敗しました: ${firestoreError.message}`);
        }

        return { success: true, user: user, tenantId: tenantId };
        
    } catch (error) {
        console.error('Employee registration with invite failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * メールアドレスとパスワードでユーザー登録
 * @param {string} email メールアドレス
 * @param {string} password パスワード
 * @param {string} displayName 表示名
 * @param {string} role ユーザーの役割（'admin' または 'employee'）
 * @returns {Object} { success: boolean, user?: User, error?: string }
 */
async function registerUser(email, password, displayName, role = 'employee') {
    // セキュリティ: 通常の登録では管理者権限を付与しない
    if (role === 'admin' || role === 'super_admin') {
        role = 'employee';
    }
    try {
        // Firebase Authenticationでユーザー作成
        const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // ユーザープロフィールを更新
        await user.updateProfile({
            displayName: displayName
        });
        
        // Firestoreにユーザー情報を保存（テナント対応）
        const userCollection = window.getUserCollection ? window.getUserCollection() : firestoreDb.collection('users');
        await userCollection.doc(user.uid).set({
            email: email,
            displayName: displayName,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            siteHistory: []
        });
        
        return { success: true, user: user };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * メールアドレスとパスワードでログイン
 * @param {string} email メールアドレス
 * @param {string} password パスワード
 * @returns {Object} { success: boolean, user?: User, error?: string }
 */
async function loginUser(email, password) {
    try {
        const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        return { success: true, user: user };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * ログアウト
 * @returns {Object} { success: boolean, error?: string }
 */
async function logoutUser() {
    try {
        await firebaseAuth.signOut();
        return { success: true };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 現在のユーザーの情報を取得
 * @returns {Object|null} ユーザー情報またはnull
 */
function getCurrentUser() {
    return firebaseAuth ? firebaseAuth.currentUser : null;
}

/**
 * ユーザーのロール情報をFirestoreから取得
 * @param {string} userId ユーザーID
 * @returns {Object} { success: boolean, role?: string, userData?: Object, error?: string }
 */
async function getUserRole(userId) {
    try {
        if (!userId) {
            return { success: false, error: 'ユーザーIDが無効です' };
        }
        
        // テナント対応のユーザー情報取得
        const userCollection = window.getUserCollection ? window.getUserCollection() : firestoreDb.collection('users');
        const userDoc = await userCollection.doc(userId).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            return { 
                success: true, 
                role: userData.role || 'employee',
                userData: userData
            };
        } else {
            return { success: false, error: 'ユーザー情報が見つかりません' };
        }
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 認証状態の変化を監視
 * @param {Function} callback 認証状態が変化した時に呼び出されるコールバック
 * @returns {Function} アンサブスクライブ関数
 */
function onAuthChanged(callback) {
    if (!firebaseAuth) {
        return () => {};
    }
    
    return firebaseAuth.onAuthStateChanged(callback);
}

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', () => {
    // Firebaseの初期化を待つ
    if (window.auth && window.db) {
        initAuth();
    } else {
        // Firebaseが初期化されるまで待機
        const checkInterval = setInterval(() => {
            if (window.auth && window.db) {
                clearInterval(checkInterval);
                initAuth();
            }
        }, 100);
    }
});

// グローバルスコープに関数をエクスポート
window.registerUser = registerUser;
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.getCurrentUser = getCurrentUser;
window.getUserRole = getUserRole;
window.onAuthChanged = onAuthChanged;

