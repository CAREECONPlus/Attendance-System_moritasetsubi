/**
 * 勤怠管理システム - ログイン機能（簡略化版 v2）
 */

// 初期化フラグ
let loginInitialized = false;

/**
 * Firebase初期化完了を待つ
 */
function waitForFirebase() {
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
        }
    });
}

/**
 * ログイン機能の初期化
 */
async function initLogin() {
    if (loginInitialized) {
        return;
    }
    
    
    try {
        // Firebase初期化完了を待つ
        await waitForFirebase();
        
        // ログインフォーム
        const loginForm = document.getElementById('loginForm');
        
        // 従業員登録フォーム
        const registerForm = document.getElementById('registerForm');
        
        if (loginForm) {
            // 既存のイベントリスナーを削除（重複防止）
            const newLoginForm = loginForm.cloneNode(true);
            loginForm.parentNode.replaceChild(newLoginForm, loginForm);
            
            // 新しいフォームにイベントリスナーを追加
            const freshLoginForm = document.getElementById('loginForm');
            freshLoginForm.addEventListener('submit', handleLogin);
        }
        
        if (registerForm) {
            // 既存のイベントリスナーを削除（重複防止）
            const newRegisterForm = registerForm.cloneNode(true);
            registerForm.parentNode.replaceChild(newRegisterForm, registerForm);
            
            // 新しいフォームにイベントリスナーを追加
            const freshRegisterForm = document.getElementById('registerForm');
            freshRegisterForm.addEventListener('submit', handleEmployeeRegister);
        }
        
        // Firebase認証状態の監視
        firebase.auth().onAuthStateChanged(handleAuthStateChange);
        
        // localStorage から認証状態を復元
        try {
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
                const parsedUser = JSON.parse(savedUser);
                
                // データ形式の検証
                if (parsedUser && typeof parsedUser === 'object' && parsedUser.uid) {
                    const urlTenant = getTenantFromURL();
                    
                    // テナント不一致チェックを緩和
                    if (urlTenant && parsedUser.tenantId && urlTenant !== parsedUser.tenantId) {
                        console.log('⚠️ URL テナントとローカルテナントが異なります:', {
                            urlTenant,
                            savedTenant: parsedUser.tenantId
                        });
                        // 異なるテナントでも認証状態は保持し、後でチェック
                        window.currentUser = parsedUser;
                        console.log('🔄 認証状態を保持してテナント確認を延期');
                    } else {
                        window.currentUser = parsedUser;
                        console.log('✅ 認証状態をlocalStorageから復元しました:', window.currentUser.email);
                    }
                } else {
                    console.warn('⚠️ 不正なlocalStorageデータ形式を検出 - クリアします');
                    localStorage.removeItem('currentUser');
                }
            }
        } catch (error) {
            console.warn('localStorage認証状態の復元に失敗:', error);
            localStorage.removeItem('currentUser');
        }
        
        loginInitialized = true;
        
        // 招待システムの初期化
        if (typeof initInviteSystem === 'function') {
            await initInviteSystem();
        }
        
        // 既存認証状態でのテナント情報確保
        if (window.currentUser && window.currentUser.tenantId) {
            await ensureTenantInfo(window.currentUser.tenantId);
        }
        
        // リダイレクト後の場合は迅速にページ遷移
        const authRedirect = localStorage.getItem('authRedirect');
        if (authRedirect && window.currentUser) {
            localStorage.removeItem('authRedirect');
            console.log('🚀 リダイレクト後の迅速ページ遷移を実行');
            
            const userRole = window.currentUser.role;
            if (userRole === 'admin' || userRole === 'super_admin') {
                showPage('admin');
                setTimeout(() => {
                    if (typeof initAdminPage === 'function') {
                        initAdminPage();
                    }
                }, 100);
            } else {
                showPage('employee');
                setTimeout(() => {
                    if (typeof initEmployeePage === 'function') {
                        initEmployeePage();
                    }
                }, 100);
            }
        }
        
        
    } catch (error) {
        // 3秒後に再試行
        setTimeout(() => {
            loginInitialized = false;
            initLogin();
        }, 3000);
    }
}

/**
 * ログイン処理
 */
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();
    
    if (!email || !password) {
        showError('メールアドレスとパスワードを入力してください');
        return;
    }
    
    // ローディング表示
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'ログイン中...';
    }
    
    try {
        // 🔄 既存のフラグをクリア（前回の処理が残っている可能性）
        window.isAuthStateChanging = false;
        window.isInitializingUser = false;
        window.isLoggingIn = true;
        
        console.log('🔐 ログイン処理開始:', email);
        
        // 明示的にログインページを表示
        showPage('login');
        
        // Firebase認証のみ実行（以降の処理はhandleAuthStateChangeに委譲）
        await firebase.auth().signInWithEmailAndPassword(email, password);
        
        console.log('✅ Firebase認証成功 - handleAuthStateChangeを待機中...');
        
    } catch (error) {
        
        let message = 'ログインに失敗しました';
        if (error.code === 'auth/user-not-found') {
            message = 'ユーザーが見つかりません';
        } else if (error.code === 'auth/wrong-password') {
            message = 'パスワードが正しくありません';
        } else if (error.code === 'auth/invalid-email') {
            message = 'メールアドレスの形式が正しくありません';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'ログイン試行回数が多すぎます。しばらく時間をおいてから再試行してください';
        }
        
        showError(message);
    } finally {
        // エラー時のみフラグをクリア（成功時はhandleAuthStateChangeでクリア）
        if (!firebase.auth().currentUser) {
            window.isAuthStateChanging = false;
            window.isLoggingIn = false;
            window.isInitializingUser = false;
        }
        hideLoadingOverlay();
        
        // ローディング解除
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText || 'ログイン';
        }
        
        console.log('🔧 ログイン処理完了 - 成功時はhandleAuthStateChangeでフラグクリア');
    }
}


/**
 * 認証状態変化の処理
 */
async function handleAuthStateChange(user) {
    console.log('🔄 認証状態変更トリガー:', {
        hasUser: !!user,
        userEmail: user?.email,
        isInitializing: window.isInitializingUser,
        currentUser: window.currentUser?.email,
        isLoggingIn: window.isLoggingIn
    });
    
    // 処理中の場合は重複実行を防止
    if (window.isAuthStateChanging) {
        console.log('🔄 認証状態変更処理中のため、スキップ');
        return;
    }
    
    // 既存認証状態のチェックと処理
    if (user && window.currentUser && !window.isLoggingIn) {
        // currentUserが文字列の場合（不正な状態）は再処理が必要
        const isValidCurrentUser = typeof window.currentUser === 'object' && 
                                  window.currentUser.uid === user.uid;
        
        if (!isValidCurrentUser) {
            console.log('⚠️ 不正な認証状態を検出 - 再処理します:', typeof window.currentUser);
            // 不正な状態をクリアして再処理
            window.currentUser = null;
            localStorage.removeItem('currentUser');
        } else {
            // 正常な認証状態の場合
            const isOnLoginPage = document.getElementById('login-page') && 
                                 !document.getElementById('login-page').classList.contains('hidden');
            
            if (isOnLoginPage) {
                console.log('🔄 認証済みユーザーをログインページから遷移させます');
                
                // テナント情報の再確認と必要に応じてリダイレクト
                const currentTenantFromUrl = getTenantFromURL();
                const userTenantId = window.currentUser.tenantId;
                
                if (userTenantId && (!currentTenantFromUrl || currentTenantFromUrl !== userTenantId)) {
                    console.log('🔄 テナント不一致のためリダイレクト:', {
                        urlTenant: currentTenantFromUrl,
                        userTenant: userTenantId
                    });
                    const tenantUrl = generateSuccessUrl(userTenantId);
                    window.location.href = tenantUrl;
                    return;
                }
                
                // 適切なページに遷移
                const userRole = window.currentUser.role;
                if (userRole === 'admin' || userRole === 'super_admin') {
                    showPage('admin');
                    setTimeout(() => {
                        if (typeof initAdminPage === 'function') {
                            console.log('🔧 管理者ページ初期化実行');
                            initAdminPage();
                        }
                    }, 300);
                } else {
                    showPage('employee');
                    setTimeout(() => {
                        if (typeof initEmployeePage === 'function') {
                            console.log('🔧 従業員ページ初期化実行');
                            initEmployeePage();
                        }
                    }, 300);
                }
                return;
            }
            
            console.log('🔄 認証状態変更をスキップ: 既に適切なページにいます');
            return;
        }
    }
    
    // 重複実行防止のためのタイムスタンプチェック
    const now = Date.now();
    if (window.lastAuthStateChange && (now - window.lastAuthStateChange) < 1000) {
        console.log('🔄 認証状態変更を短時間内でスキップ');
        return;
    }
    window.lastAuthStateChange = now;
    window.isAuthStateChanging = true;
    
    if (user) {
        try {
            // 初期化開始フラグ
            window.isInitializingUser = true;
            
            // ローディング表示
            showLoadingOverlay('システムを初期化中...');
            
            // ユーザー情報の取得開始
            // ユーザーのテナント情報を取得
            console.log('🔍 テナント情報取得開始:', user.email);
            const userTenantId = await determineUserTenant(user.email);
            console.log('📋 テナント情報取得結果:', userTenantId);
            
            // テナント対応のユーザーデータ取得
            let userData;
            let userDoc;
            
            if (userTenantId) {
                // テナント内からユーザーデータを取得
                console.log('🔍 テナント内ユーザーデータ取得開始:', userTenantId);
                const tenantUsersPath = `tenants/${userTenantId}/users`;
                userDoc = await firebase.firestore().collection(tenantUsersPath).doc(user.uid).get();
                console.log('📋 テナント内ユーザーデータ取得結果:', userDoc.exists);
                
                // デバッグ: テナント内の全ユーザーを確認
                if (!userDoc.exists) {
                    console.log('🔍 デバッグ: テナント内の全ユーザーを確認');
                    const allUsersSnapshot = await firebase.firestore().collection(tenantUsersPath).get();
                    console.log('📋 テナント内全ユーザー数:', allUsersSnapshot.size);
                    allUsersSnapshot.forEach(doc => {
                        console.log('📋 テナント内ユーザー:', {
                            id: doc.id,
                            email: doc.data().email,
                            uid: doc.data().uid,
                            role: doc.data().role
                        });
                    });
                }
                
                if (userDoc.exists) {
                    userData = userDoc.data();
                } else {
                    // メールアドレスベースで検索して修正
                    console.log('🔍 メールアドレスベースでテナント内ユーザー検索開始');
                    const emailQuerySnapshot = await firebase.firestore()
                        .collection(tenantUsersPath)
                        .where('email', '==', user.email)
                        .get();
                    
                    if (!emailQuerySnapshot.empty) {
                        const userDocByEmail = emailQuerySnapshot.docs[0];
                        userData = userDocByEmail.data();
                        console.log('📋 メールアドレスベース検索成功:', {
                            foundDocId: userDocByEmail.id,
                            expectedUID: user.uid,
                            actualUID: userData.uid
                        });
                        
                        // UIDが一致しない場合は修正
                        if (userData.uid !== user.uid) {
                            console.log('🔄 UIDが一致しないため、データを修正します');
                            
                            // 新しいドキュメントを正しいUIDで作成
                            const updatedData = {
                                ...userData,
                                uid: user.uid,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            
                            await firebase.firestore().collection(tenantUsersPath).doc(user.uid).set(updatedData);
                            
                            // 古いドキュメントを削除
                            await firebase.firestore().collection(tenantUsersPath).doc(userDocByEmail.id).delete();
                            
                            console.log('✅ テナント内ユーザーデータのUID修正完了');
                        }
                    } else {
                        // フォールバック: 従来のusersコレクションから取得
                        console.log('🔍 フォールバック: 従来のusersコレクション取得開始');
                        userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
                        console.log('📋 従来のusersコレクション取得結果:', userDoc.exists);
                        if (userDoc.exists) {
                            userData = userDoc.data();
                        }
                    }
                }
            } else {
                // テナント未設定の場合は従来のusersコレクションから取得
                console.log('🔍 テナント未設定: 従来のusersコレクション取得開始');
                userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
                console.log('📋 従来のusersコレクション取得結果:', userDoc.exists);
                if (userDoc.exists) {
                    userData = userDoc.data();
                }
            }
            
            console.log('📋 最終ユーザーデータ確認:', {
                hasUserData: !!userData,
                userEmail: userData?.email,
                userRole: userData?.role,
                userTenantId: userData?.tenantId
            });
            
            // Legacy usersコレクションからの自動移行処理
            if (userData && !userTenantId) {
                console.log('🔄 Legacy usersコレクションのユーザーをテナントシステムに移行します');
                
                // dx5アカウント専用のテナントIDを生成
                const legacyTenantId = `legacy-${userData.email.split('@')[0]}`;
                
                // テナントデータを作成
                await firebase.firestore().collection('tenants').doc(legacyTenantId).set({
                    tenantId: legacyTenantId,
                    companyName: userData.displayName || 'Legacy Account',
                    adminEmail: userData.email,
                    adminName: userData.displayName || 'Legacy Admin',
                    department: '',
                    phone: '',
                    status: 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    migrated: true,
                    migratedFrom: 'legacy-users'
                });
                
                // global_usersコレクションに登録
                const normalizedEmail = user.email.toLowerCase();
                await firebase.firestore().collection('global_users').doc(normalizedEmail).set({
                    uid: user.uid,
                    email: userData.email,
                    displayName: userData.displayName || 'Legacy User',
                    role: userData.role || 'admin',
                    tenantId: legacyTenantId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    migratedFrom: 'legacy-users'
                });
                
                // テナント内のusersコレクションに保存
                await firebase.firestore().collection(`tenants/${legacyTenantId}/users`).doc(user.uid).set({
                    uid: user.uid,
                    email: userData.email,
                    displayName: userData.displayName || 'Legacy User',
                    role: userData.role || 'admin',
                    isActive: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    migratedFrom: 'legacy-users'
                });
                
                // userTenantIdを更新
                userTenantId = legacyTenantId;
                userData.tenantId = legacyTenantId;
                
                console.log('✅ Legacy usersコレクションからの移行完了:', legacyTenantId);
            }
            
            // UIDの不一致をチェックし、必要に応じて更新
            if (userData && userData.uid === 'pending-uid') {
                console.log('🔄 UIDが未設定のため、global_usersを更新します');
                
                // global_usersのUIDを更新
                const normalizedEmail = user.email.toLowerCase();
                await firebase.firestore().collection('global_users').doc(normalizedEmail).update({
                    uid: user.uid,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // テナント内のusersコレクションのUIDも更新
                if (userTenantId) {
                    await firebase.firestore().collection(`tenants/${userTenantId}/users`).doc(user.uid).update({
                        uid: user.uid,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                console.log('✅ UID更新完了:', user.uid);
                userData.uid = user.uid;
            }
            
            if (userData) {
                console.log('✅ ユーザーデータ取得成功 - ロール決定開始');
                
                // ユーザーのロールを決定
                let userRole = userData.role || 'employee';
                
                // dxconsulting.branu2@gmail.comは自動的にsuper_adminに設定
                if (user.email === 'dxconsulting.branu2@gmail.com') {
                    userRole = 'super_admin';
                    if (userData.role !== 'super_admin') {
                        await firebase.firestore().collection('users').doc(user.uid).update({ 
                            role: 'super_admin',
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
                
                // グローバル変数設定
                window.currentUser = {
                    uid: user.uid,
                    email: user.email,
                    displayName: userData.displayName || user.displayName,
                    role: userRole,
                    tenantId: userTenantId || userData.tenantId
                };
                
                // localStorage に認証状態を保存（テナント情報含む）
                try {
                    localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
                    console.log('💾 ユーザー情報をlocalStorageに保存:', window.currentUser.email);
                } catch (error) {
                    console.warn('⚠️ localStorageへの保存に失敗:', error);
                }
                
                // テナント情報を設定（権限エラー対策）
                const currentTenantFromUrl = getTenantFromURL();
                let shouldRedirect = false;
                let redirectUrl = null;
                
                // テナント情報の確実な設定
                const finalTenantId = currentTenantFromUrl || userTenantId;
                if (finalTenantId && typeof window.loadTenantInfo === 'function') {
                    try {
                        const tenantInfo = await window.loadTenantInfo(finalTenantId);
                        if (tenantInfo) {
                            window.currentTenant = tenantInfo;
                            console.log('🏢 テナント情報設定完了:', finalTenantId);
                        } else {
                            console.warn('⚠️ テナント情報が見つかりません:', finalTenantId);
                        }
                    } catch (error) {
                        console.error('🚨 テナント情報設定エラー:', error);
                    }
                }
                
                // ロール別のテナント処理とリダイレクト判定を分離
                if (userRole === 'super_admin') {
                    // スーパー管理者：テナントパラメータがあればそれを保持、なければリダイレクトしない
                    console.log('🔑 スーパー管理者：テナントパラメータ保持');
                } else if (userRole === 'admin') {
                    // 通常管理者：テナントパラメータがあればそれを保持、なければ自分のテナントにリダイレクト
                    if (!currentTenantFromUrl && userTenantId) {
                        console.log('🔄 管理者テナントリダイレクト準備中...');
                        shouldRedirect = true;
                        redirectUrl = generateSuccessUrl(userTenantId);
                    } else {
                        console.log('🔑 管理者：テナントパラメータ保持');
                    }
                } else if (userTenantId) {
                    // 一般ユーザー：必ず自分のテナントにリダイレクト
                    console.log('🔍 テナント判定:', {
                        userTenantId,
                        currentTenantFromUrl,
                        isMatch: currentTenantFromUrl === userTenantId
                    });
                    
                    if (!currentTenantFromUrl || currentTenantFromUrl !== userTenantId) {
                        console.log('🔄 テナントリダイレクト準備中...');
                        shouldRedirect = true;
                        redirectUrl = generateSuccessUrl(userTenantId);
                    } else {
                        console.log('✅ テナントURL一致 - リダイレクトなし');
                    }
                }
                
                // リダイレクトが必要な場合は実行（認証状態保持）
                if (shouldRedirect && redirectUrl) {
                    // localStorage を更新してテナント情報を同期
                    try {
                        const updatedUser = {
                            ...window.currentUser,
                            tenantId: userTenantId || userData.tenantId
                        };
                        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
                        localStorage.setItem('authRedirect', 'true'); // リダイレクトフラグ
                        console.log('💾 リダイレクト前に認証状態を保存:', updatedUser.email);
                    } catch (error) {
                        console.warn('⚠️ リダイレクト前の状態保存に失敗:', error);
                    }
                    
                    window.isAuthStateChanging = false;
                    window.isInitializingUser = false;
                    window.isLoggingIn = false;
                    hideLoadingOverlay();
                    console.log('🔄 テナントリダイレクト実行:', redirectUrl);
                    window.location.href = redirectUrl;
                    return;
                }
                
                // ログイン成功時の画面遷移
                // 現在のページをチェック（より確実な判定）
                const isOnLoginPage = document.getElementById('login-page') && 
                                     !document.getElementById('login-page').classList.contains('hidden');
                const isOnEmployeePage = document.getElementById('employee-page') && 
                                        !document.getElementById('employee-page').classList.contains('hidden');
                const isOnAdminPage = document.getElementById('admin-page') && 
                                     !document.getElementById('admin-page').classList.contains('hidden');
                
                console.log('📄 現在のページ状態:', {
                    isOnLoginPage,
                    isOnEmployeePage,
                    isOnAdminPage,
                    userRole
                });
                
                // ページ遷移の必要性を判定
                const needsPageTransition = isOnLoginPage || 
                                          (userRole === 'admin' && !isOnAdminPage) ||
                                          (userRole === 'employee' && !isOnEmployeePage);
                
                if (needsPageTransition) {
                    console.log('🔄 ページ遷移を実行します...');
                    
                    if (userRole === 'admin' || userRole === 'super_admin') {
                        showPage('admin');
                        // 少し遅延してから管理者ページ初期化
                        setTimeout(() => {
                            if (typeof initAdminPage === 'function') {
                                console.log('🔧 管理者ページ初期化実行');
                                initAdminPage();
                            }
                        }, 300);
                    } else {
                        showPage('employee');
                        // 少し遅延してから従業員ページ初期化
                        setTimeout(() => {
                            if (typeof initEmployeePage === 'function') {
                                console.log('🔧 従業員ページ初期化実行');
                                initEmployeePage();
                            }
                        }, 300);
                    }
                } else {
                    console.log('✅ ページ遷移は不要です（既に適切なページにいます）');
                }
            } else {
                console.log('❌ ユーザーデータが見つかりません - サインアウト実行');
                console.log('📋 検索条件:', {
                    userEmail: user.email,
                    userUID: user.uid,
                    searchedTenantId: userTenantId
                });
                await firebase.auth().signOut();
            }
        } catch (error) {
            console.error('❌ 認証処理中にエラー発生:', error);
            console.error('📋 エラー詳細:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            
            // 重大なエラーの場合のみサインアウト
            if (error.code === 'permission-denied' || error.code === 'unauthorized') {
                console.log('🔐 権限エラーのためサインアウト実行');
                await firebase.auth().signOut();
            } else {
                console.log('⚠️ 一時的なエラーの可能性 - セッション維持');
                // セッションを維持してリトライ可能にする
                window.isInitializingUser = false;
                window.isLoggingIn = false;
                hideLoadingOverlay();
            }
        } finally {
            // 初期化完了
            window.isAuthStateChanging = false;
            window.isInitializingUser = false;
            window.isLoggingIn = false;
            hideLoadingOverlay();
            console.log('🔧 認証状態変更処理完了 - フラグクリア');
        }
    } else {
        // ログアウト状態
        window.currentUser = null;
        window.isAuthStateChanging = false;
        window.isInitializingUser = false;
        window.isLoggingIn = false;
        hideLoadingOverlay();
        showPage('login');
    }
}


/**
 * ログインフォームを表示
 */
function showLoginForm() {
    const loginForm = document.querySelector('#loginForm');
    
    if (loginForm) loginForm.style.display = 'block';
}

/**
 * エラーメッセージ表示
 */
function showError(message) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    }
    
}


// showPage関数はutils.jsで定義済み

/**
 * DOM読み込み完了時の初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
    
    // 初期状態では全ページを非表示
    document.querySelectorAll('#login-page, #employee-page, #admin-page, #admin-request-page')
        .forEach(el => el.classList.add('hidden'));
    
    // テナント初期化
    try {
        await initializeTenant();
    } catch (error) {
    }
    
    // 少し遅延させてFirebase初期化を確実に待つ
    setTimeout(() => {
        initLogin();
    }, 500);
});

/**
 * グローバル関数のエクスポート
 */
window.signOut = async function() {
    try {
        await firebase.auth().signOut();
    } catch (error) {
    }
};

window.getCurrentUser = function() {
    return window.currentUser;
};

window.checkAuth = function(requiredRole) {
    const user = window.getCurrentUser();
    if (!user) {
        showPage('login');
        return false;
    }
    
    if (requiredRole) {
        // 管理者権限チェック（adminまたはsuper_adminで満たす）
        if (requiredRole === 'admin') {
            if (user.role !== 'admin' && user.role !== 'super_admin') {
                return false;
            }
        } else if (user.role !== requiredRole) {
            return false;
        }
    }
    
    return true;
};

window.showPage = showPage;

/**
 * テナント情報を確実に設定する
 */
async function ensureTenantInfo(tenantId) {
    if (!tenantId) return;
    
    try {
        if (typeof window.loadTenantInfo === 'function') {
            const tenantInfo = await window.loadTenantInfo(tenantId);
            if (tenantInfo) {
                window.currentTenant = tenantInfo;
                console.log('🏢 テナント情報を確保しました:', tenantId);
            } else {
                console.warn('⚠️ テナント情報が見つかりません:', tenantId);
            }
        } else {
            console.warn('⚠️ loadTenantInfo関数が利用できません');
        }
    } catch (error) {
        console.error('❌ テナント情報確保エラー:', error);
    }
}

/**
 * 従業員登録処理
 */
async function handleEmployeeRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('register-name')?.value?.trim();
    const email = document.getElementById('register-email')?.value?.trim();
    const password = document.getElementById('register-password')?.value?.trim();
    const passwordConfirm = document.getElementById('register-password-confirm')?.value?.trim();
    const inviteToken = window.currentInviteToken;
    
    // バリデーション
    if (!name || !email || !password || !passwordConfirm) {
        showRegisterError('すべての項目を入力してください');
        return;
    }
    
    if (password !== passwordConfirm) {
        showRegisterError('パスワードが一致しません');
        return;
    }
    
    if (password.length < 6) {
        showRegisterError('パスワードは6文字以上で入力してください');
        return;
    }
    
    if (!inviteToken) {
        showRegisterError('招待トークンが見つかりません');
        return;
    }
    
    // ローディング表示
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '登録中...';
    }
    
    let result = null;
    try {
        // 招待トークンを使って従業員登録
        result = await registerEmployeeWithInvite(email, password, name, inviteToken);
        
        if (result.success) {
            // 登録成功メッセージを表示
            showRegisterSuccess(`${name}さん、従業員登録が完了しました！3秒後に勤怠画面に移動します...`);
            
            // ボタンを成功状態に変更
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '登録完了！';
                submitBtn.style.backgroundColor = 'var(--careecon-green)';
                submitBtn.style.borderColor = 'var(--careecon-green)';
            }
            
            // フォームをリセット
            document.getElementById('register-name').value = '';
            document.getElementById('register-email').value = '';
            document.getElementById('register-password').value = '';
            document.getElementById('register-password-confirm').value = '';
            
            // グローバル変数にユーザー情報を設定
            window.currentUser = {
                uid: result.user.uid,
                email: result.user.email,
                displayName: result.user.displayName || name,
                role: 'employee',
                tenantId: result.tenantId
            };
            
            // localStorage にも保存して認証状態を維持
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            
            // 3秒後にページ遷移
            setTimeout(() => {
                if (result.tenantId) {
                    const tenantUrl = `${window.location.origin}${window.location.pathname}?tenant=${result.tenantId}`;
                    window.location.href = tenantUrl;
                } else {
                    if (typeof showPage === 'function') {
                        showPage('employee');
                        setTimeout(() => {
                            if (typeof initEmployeePage === 'function') {
                                initEmployeePage();
                            }
                        }, 200);
                    }
                }
            }, 3000);
        } else {
            showRegisterError(result.error || '登録に失敗しました');
        }
        
    } catch (error) {
        console.error('Registration error:', error);
        let message = '登録に失敗しました';
        
        if (error.code === 'auth/email-already-in-use') {
            message = 'このメールアドレスは既に使用されています。別のメールアドレスを使用するか、既存のアカウントでログインしてください。';
        } else if (error.code === 'auth/invalid-email') {
            message = 'メールアドレスの形式が正しくありません';
        } else if (error.code === 'auth/weak-password') {
            message = 'パスワードが弱すぎます';
        }
        
        showRegisterError(message);
    } finally {
        // ローディング解除（成功時以外）
        if (submitBtn && !result?.success) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText || '登録';
            submitBtn.style.backgroundColor = '';
            submitBtn.style.borderColor = '';
        }
    }
}

/**
 * 登録エラー表示
 */
function showRegisterError(message) {
    const errorElement = document.getElementById('register-error-message');
    const successElement = document.getElementById('register-success-message');
    
    // 成功メッセージを隠す
    if (successElement) {
        successElement.classList.add('hidden');
    }
    
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        // 5秒後に自動で隠す
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    }
}

/**
 * 登録成功表示
 */
function showRegisterSuccess(message) {
    const successElement = document.getElementById('register-success-message');
    const errorElement = document.getElementById('register-error-message');
    
    // エラーメッセージを隠す
    if (errorElement) {
        errorElement.classList.add('hidden');
    }
    
    if (successElement) {
        successElement.textContent = message;
        successElement.classList.remove('hidden');
        
        // 10秒後に自動で隠す（成功メッセージは少し長めに表示）
        setTimeout(() => {
            successElement.classList.add('hidden');
        }, 10000);
    }
}


