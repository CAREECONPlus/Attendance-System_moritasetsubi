/**
 * 不足している関数の実装
 * マルチテナント化で欠落した関数を定義
 */


/**
 * 情報メッセージを表示
 */
function showInfo(message) {
    showNotification(message, 'info');
}

/**
 * 成功メッセージを表示
 */
function showSuccess(message) {
    showNotification(message, 'success');
}

/**
 * エラーメッセージを表示
 */
function showError(message) {
    showNotification(message, 'error');
}

/**
 * 汎用通知メッセージ表示
 */
function showNotification(message, type = 'info') {
    const types = {
        info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb', icon: 'ℹ️' },
        success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb', icon: '✅' },
        error: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb', icon: '❌' },
        warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7', icon: '⚠️' }
    };
    
    const typeConfig = types[type] || types.info;
    
    // 既存の通知があれば削除
    const existingToast = document.querySelector('.notification-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 新しい通知を作成
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
        <span class="notification-icon">${typeConfig.icon}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${typeConfig.bg};
        color: ${typeConfig.color};
        border: 1px solid ${typeConfig.border};
        border-radius: 8px;
        padding: 15px;
        min-width: 300px;
        max-width: 500px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
    `;
    
    // アニメーション用CSS
    if (!document.getElementById('notification-animations')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'notification-animations';
        styleElement.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .notification-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: inherit;
                opacity: 0.7;
                margin-left: auto;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: opacity 0.2s;
            }
            .notification-close:hover {
                opacity: 1;
                background: rgba(0,0,0,0.1);
            }
            .notification-icon {
                font-size: 16px;
                flex-shrink: 0;
            }
            .notification-message {
                flex: 1;
                word-break: break-word;
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    document.body.appendChild(toast);
    
    // 自動消去（エラーは長めに表示）
    const duration = type === 'error' ? 8000 : 5000;
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

/**
 * 現在のテナントIDを取得（フォールバック付き）
 */
function getCurrentTenantId() {
    // main.jsまたはtenant.jsの関数を呼び出し
    if (typeof window.getCurrentTenantId === 'function') {
        return window.getCurrentTenantId();
    }
    
    // フォールバック: グローバル変数から取得
    if (window.currentTenantId) {
        return window.currentTenantId;
    }
    
    // フォールバック: ユーザー情報から取得
    if (window.currentUser && window.currentUser.tenantId) {
        return window.currentUser.tenantId;
    }
    
    return null;
}

/**
 * 日付フォーマット関数
 */
function formatDate(date) {
    if (!date) return '-';
    
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';
        
        return d.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (error) {
        return '-';
    }
}

/**
 * 時間フォーマット関数
 */
function formatTime(time) {
    if (!time) return '-';
    
    try {
        if (typeof time === 'string') {
            return time;
        }
        
        if (time.toDate) {
            // Firestore Timestamp
            return time.toDate().toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (time instanceof Date) {
            return time.toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        return String(time);
    } catch (error) {
        return '-';
    }
}

/**
 * エラーハンドリング強化
 */
function handleError(error, context = '') {
    
    let message = 'エラーが発生しました';
    
    if (error.code) {
        switch (error.code) {
            case 'permission-denied':
                message = 'アクセス権限がありません';
                break;
            case 'unavailable':
                message = 'サービスが一時的に利用できません';
                break;
            case 'not-found':
                message = 'データが見つかりません';
                break;
            default:
                message = error.message || message;
        }
    } else if (error.message) {
        message = error.message;
    }
    
    showError(message);
    return false;
}

/**
 * 関数存在チェック
 */
function checkFunction(functionName) {
    const fn = window[functionName];
    if (typeof fn !== 'function') {
        return false;
    }
    return true;
}

/**
 * 安全な関数呼び出し
 */
function safeCall(functionName, ...args) {
    if (checkFunction(functionName)) {
        try {
            return window[functionName](...args);
        } catch (error) {
            return null;
        }
    }
    return null;
}

// グローバルスコープにエクスポート
window.showInfo = showInfo;
window.showSuccess = showSuccess;
window.showError = showError;
window.showNotification = showNotification;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.handleError = handleError;
window.checkFunction = checkFunction;
window.safeCall = safeCall;

// getCurrentTenantIdのフォールバック
if (!window.getCurrentTenantId) {
    window.getCurrentTenantId = getCurrentTenantId;
}

