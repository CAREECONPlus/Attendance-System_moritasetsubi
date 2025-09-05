/**
 * グローバルエラーハンドラー
 * セキュリティインシデントの検出と報告
 */

class ErrorHandler {
    constructor() {
        this.setupGlobalHandlers();
        this.errorLog = [];
        this.securityIncidents = [];
    }

    setupGlobalHandlers() {
        // JavaScript エラーのキャッチ
        window.addEventListener('error', (event) => {
            this.handleError({
                type: 'javascript',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error,
                timestamp: new Date().toISOString()
            });
        });

        // Promise rejection のキャッチ
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError({
                type: 'promise-rejection',
                message: event.reason?.message || event.reason,
                promise: event.promise,
                timestamp: new Date().toISOString()
            });
        });

        // Firebase エラーのインターセプト
        this.setupFirebaseErrorHandling();
    }

    setupFirebaseErrorHandling() {
        // Firebase Auth エラー
        if (typeof firebase !== 'undefined' && firebase.auth) {
            const originalSignIn = firebase.auth().signInWithEmailAndPassword;
            firebase.auth().signInWithEmailAndPassword = async (...args) => {
                try {
                    return await originalSignIn.apply(firebase.auth(), args);
                } catch (error) {
                    this.handleFirebaseError('auth', error);
                    throw error;
                }
            };
        }
    }

    handleError(errorInfo) {
        console.error('🚨 グローバルエラー検出:', errorInfo);
        
        // エラーログに記録
        this.errorLog.push(errorInfo);
        
        // セキュリティインシデントの検出
        this.detectSecurityIncident(errorInfo);
        
        // ユーザーへの通知
        this.notifyUser(errorInfo);
        
        // 必要に応じてサーバーに報告
        this.reportToServer(errorInfo);
    }

    handleFirebaseError(service, error) {
        const errorInfo = {
            type: 'firebase',
            service: service,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            user: window.currentUser?.email || 'anonymous'
        };

        // セキュリティ関連エラーの特別処理
        if (this.isSecurityError(error)) {
            this.handleSecurityIncident(errorInfo);
        }

        this.handleError(errorInfo);
    }

    isSecurityError(error) {
        const securityCodes = [
            'permission-denied',
            'unauthenticated',
            'unauthorized',
            'auth/user-disabled',
            'auth/invalid-api-key',
            'auth/too-many-requests'
        ];
        
        return securityCodes.includes(error.code);
    }

    detectSecurityIncident(errorInfo) {
        // 連続した認証失敗
        if (errorInfo.type === 'firebase' && 
            errorInfo.code === 'auth/wrong-password') {
            this.trackFailedLogin(errorInfo);
        }

        // 権限エラーの連続発生
        if (errorInfo.code === 'permission-denied') {
            this.trackPermissionViolation(errorInfo);
        }

        // 異常なAPI呼び出し頻度
        this.trackAPICallFrequency(errorInfo);
    }

    trackFailedLogin(errorInfo) {
        const recentFailures = this.errorLog.filter(log => 
            log.type === 'firebase' && 
            log.code === 'auth/wrong-password' && 
            Date.now() - new Date(log.timestamp).getTime() < 300000 // 5分以内
        );

        if (recentFailures.length >= 3) {
            this.handleSecurityIncident({
                type: 'brute-force-attempt',
                message: '複数回のログイン失敗を検出',
                severity: 'high',
                details: recentFailures
            });
        }
    }

    trackPermissionViolation(errorInfo) {
        const recentViolations = this.errorLog.filter(log => 
            log.code === 'permission-denied' && 
            Date.now() - new Date(log.timestamp).getTime() < 600000 // 10分以内
        );

        if (recentViolations.length >= 5) {
            this.handleSecurityIncident({
                type: 'permission-abuse',
                message: '権限違反の連続発生を検出',
                severity: 'medium',
                details: recentViolations
            });
        }
    }

    trackAPICallFrequency(errorInfo) {
        const recentCalls = this.errorLog.filter(log => 
            Date.now() - new Date(log.timestamp).getTime() < 60000 // 1分以内
        );

        if (recentCalls.length >= 10) {
            this.handleSecurityIncident({
                type: 'api-abuse',
                message: 'API呼び出し頻度異常を検出',
                severity: 'medium',
                details: { callCount: recentCalls.length }
            });
        }
    }

    handleSecurityIncident(incident) {
        console.error('🚨 セキュリティインシデント:', incident);
        
        this.securityIncidents.push({
            ...incident,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ip: this.getClientIP(),
            user: window.currentUser?.email || 'anonymous',
            session: this.getSessionId()
        });

        // 重大度に応じた対応
        switch (incident.severity) {
            case 'high':
                this.handleHighSeverityIncident(incident);
                break;
            case 'medium':
                this.handleMediumSeverityIncident(incident);
                break;
            default:
                this.handleLowSeverityIncident(incident);
        }
    }

    handleHighSeverityIncident(incident) {
        // ユーザーセッションの無効化を検討
        if (incident.type === 'brute-force-attempt') {
            this.showSecurityWarning('セキュリティ上の理由により、一時的にアクセスを制限しています。');
            // 必要に応じて強制ログアウト
            // this.forceLogout();
        }
    }

    handleMediumSeverityIncident(incident) {
        // 警告メッセージの表示
        this.showSecurityWarning('異常なアクティビティを検出しました。');
    }

    handleLowSeverityIncident(incident) {
        // ログ記録のみ
        console.warn('セキュリティインシデント記録:', incident);
    }

    notifyUser(errorInfo) {
        // ユーザーフレンドリーなエラーメッセージ
        let userMessage = 'システムエラーが発生しました。';

        switch (errorInfo.code) {
            case 'permission-denied':
                userMessage = 'アクセス権限がありません。管理者にお問い合わせください。';
                break;
            case 'unauthenticated':
                userMessage = 'セッションが無効です。再度ログインしてください。';
                break;
            case 'auth/user-disabled':
                userMessage = 'アカウントが無効化されています。管理者にお問い合わせください。';
                break;
            case 'auth/too-many-requests':
                userMessage = 'リクエストが多すぎます。しばらく時間をおいてから再試行してください。';
                break;
        }

        if (typeof showToast === 'function') {
            showToast(userMessage, 'error');
        } else {
            console.error(userMessage);
        }
    }

    reportToServer(errorInfo) {
        // 重要なエラーのみサーバーに報告
        if (this.shouldReportToServer(errorInfo)) {
            // 実装例：Firebase Functionsへの報告
            // この機能は必要に応じて実装
            console.log('サーバー報告対象エラー:', errorInfo);
        }
    }

    shouldReportToServer(errorInfo) {
        const reportableCodes = [
            'permission-denied',
            'unauthenticated',
            'auth/user-disabled'
        ];
        
        return reportableCodes.includes(errorInfo.code) || 
               errorInfo.type === 'security-incident';
    }

    showSecurityWarning(message) {
        if (typeof showToast === 'function') {
            showToast(`🔒 ${message}`, 'warning');
        } else {
            alert(`セキュリティ警告: ${message}`);
        }
    }

    getClientIP() {
        // 実際の実装ではサーバーサイドで取得
        return 'client-side-unavailable';
    }

    getSessionId() {
        return sessionStorage.getItem('sessionId') || 
               Math.random().toString(36).substring(2);
    }

    forceLogout() {
        if (typeof window.signOut === 'function') {
            window.signOut();
        } else if (firebase?.auth) {
            firebase.auth().signOut();
        }
    }

    // 公開メソッド
    getErrorLog() {
        return this.errorLog;
    }

    getSecurityIncidents() {
        return this.securityIncidents;
    }

    clearLogs() {
        this.errorLog = [];
        this.securityIncidents = [];
    }
}

// グローバルインスタンス作成
window.errorHandler = new ErrorHandler();

// 既存のエラーハンドリング関数との統合
if (typeof showError === 'function') {
    const originalShowError = showError;
    window.showError = function(message, error = null) {
        if (error) {
            window.errorHandler.handleError({
                type: 'application',
                message: message,
                error: error,
                timestamp: new Date().toISOString()
            });
        }
        return originalShowError(message);
    };
}

console.log('🛡️ グローバルエラーハンドラー初期化完了');