/**
 * ロガーユーティリティ
 *
 * 環境に応じてログ出力を制御します。
 * 本番環境ではログを抑制し、開発環境でのみログを出力します。
 *
 * 使用例:
 *   logger.log('デバッグ情報');
 *   logger.warn('警告メッセージ');
 *   logger.error('エラー情報');
 */

/**
 * 環境判定
 * @returns {boolean} 開発環境ならtrue
 */
function isDevelopment() {
    // 開発環境の条件
    const devHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
    const currentHost = window.location.hostname;

    // localhostまたはIPアドレスでアクセスしている場合は開発環境
    if (devHosts.includes(currentHost)) {
        return true;
    }

    // URLパラメータで強制的にデバッグモードを有効化
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') {
        return true;
    }

    // localStorageでデバッグモードを設定可能
    try {
        if (localStorage.getItem('debugMode') === 'true') {
            return true;
        }
    } catch (e) {
        // localStorageアクセスエラーは無視
    }

    return false;
}

/**
 * ロガーオブジェクト
 */
const logger = {
    /**
     * 開発環境判定結果をキャッシュ
     */
    _isDev: isDevelopment(),

    /**
     * 通常のログ出力
     * @param {...any} args - ログに出力する引数
     */
    log: function(...args) {
        if (this._isDev) {
            console.log(...args);
        }
    },

    /**
     * 警告ログ出力
     * @param {...any} args - ログに出力する引数
     */
    warn: function(...args) {
        if (this._isDev) {
            console.warn(...args);
        }
    },

    /**
     * エラーログ出力（本番環境でも出力）
     * @param {...any} args - ログに出力する引数
     */
    error: function(...args) {
        // エラーは本番環境でも出力（重要）
        console.error(...args);
    },

    /**
     * 情報ログ出力
     * @param {...any} args - ログに出力する引数
     */
    info: function(...args) {
        if (this._isDev) {
            console.info(...args);
        }
    },

    /**
     * デバッグログ出力（詳細デバッグ用）
     * @param {...any} args - ログに出力する引数
     */
    debug: function(...args) {
        if (this._isDev) {
            console.debug(...args);
        }
    },

    /**
     * グループログ開始
     * @param {string} label - グループラベル
     */
    group: function(label) {
        if (this._isDev && console.group) {
            console.group(label);
        }
    },

    /**
     * グループログ終了
     */
    groupEnd: function() {
        if (this._isDev && console.groupEnd) {
            console.groupEnd();
        }
    },

    /**
     * テーブル形式でログ出力
     * @param {any} data - テーブル表示するデータ
     */
    table: function(data) {
        if (this._isDev && console.table) {
            console.table(data);
        }
    },

    /**
     * 開発環境かどうかを確認
     * @returns {boolean}
     */
    isDevelopment: function() {
        return this._isDev;
    },

    /**
     * デバッグモードを有効化（localStorage利用）
     */
    enableDebug: function() {
        try {
            localStorage.setItem('debugMode', 'true');
            this._isDev = true;
            console.log('✅ デバッグモードを有効にしました。ページをリロードしてください。');
        } catch (e) {
            console.error('デバッグモードの有効化に失敗しました:', e);
        }
    },

    /**
     * デバッグモードを無効化
     */
    disableDebug: function() {
        try {
            localStorage.removeItem('debugMode');
            this._isDev = isDevelopment();
            console.log('✅ デバッグモードを無効にしました。ページをリロードしてください。');
        } catch (e) {
            console.error('デバッグモードの無効化に失敗しました:', e);
        }
    }
};

// グローバルスコープにエクスポート
window.logger = logger;
window.isDevelopment = isDevelopment;

// 初期化メッセージ（開発環境のみ）
if (logger.isDevelopment()) {
    console.log('%c🔧 開発モード', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
    console.log('環境:', window.location.hostname);
    console.log('デバッグコマンド: logger.enableDebug() / logger.disableDebug()');
}
