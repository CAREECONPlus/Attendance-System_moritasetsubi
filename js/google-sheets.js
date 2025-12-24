/**
 * google-sheets.js - Google Sheets API 連携モジュール
 *
 * Google Identity Services (GIS) を使用した OAuth 認証と
 * Google Sheets API による読み書き機能を提供
 */

// ========================================
// 設定値
// ========================================

const GOOGLE_CONFIG = {
    CLIENT_ID: '444922759492-ealpv0n2h378ajdusuqf4ssf9oe1oqji.apps.googleusercontent.com',
    API_KEY: 'AIzaSyBNYtEypmQ22slU2PSVYiR6g76B5mlM0gw',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4'
};

// ========================================
// 状態管理
// ========================================

let tokenClient = null;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

// 設定をlocalStorageに保存
const STORAGE_KEY = 'moritasetsubi_sheets_settings';

/**
 * Sheets設定を取得
 */
function getSheetsSettings() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {
            spreadsheetId: '',
            masterSheetName: 'マスタ',
            settingsSheetName: '設定'
        };
    } catch (e) {
        console.error('設定の読み込みエラー:', e);
        return {
            spreadsheetId: '',
            masterSheetName: 'マスタ',
            settingsSheetName: '設定'
        };
    }
}

/**
 * Sheets設定を保存
 */
function saveSheetsSettings(settings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        return true;
    } catch (e) {
        console.error('設定の保存エラー:', e);
        return false;
    }
}

// ========================================
// Google API 初期化
// ========================================

/**
 * Google API クライアントを初期化
 */
async function initGoogleAPI() {
    return new Promise((resolve, reject) => {
        // GAPI (Google API Client) の読み込み確認
        if (typeof gapi === 'undefined') {
            loadScript('https://apis.google.com/js/api.js')
                .then(() => {
                    gapi.load('client', async () => {
                        try {
                            await gapi.client.init({
                                apiKey: GOOGLE_CONFIG.API_KEY,
                                discoveryDocs: [GOOGLE_CONFIG.DISCOVERY_DOC]
                            });
                            gapiInited = true;
                            resolve();
                        } catch (error) {
                            console.error('GAPI初期化エラー:', error);
                            reject(error);
                        }
                    });
                })
                .catch(reject);
        } else {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: GOOGLE_CONFIG.API_KEY,
                        discoveryDocs: [GOOGLE_CONFIG.DISCOVERY_DOC]
                    });
                    gapiInited = true;
                    resolve();
                } catch (error) {
                    console.error('GAPI初期化エラー:', error);
                    reject(error);
                }
            });
        }
    });
}

/**
 * Google Identity Services を初期化
 */
async function initGIS() {
    return new Promise((resolve, reject) => {
        if (typeof google === 'undefined' || !google.accounts) {
            loadScript('https://accounts.google.com/gsi/client')
                .then(() => {
                    initTokenClient();
                    resolve();
                })
                .catch(reject);
        } else {
            initTokenClient();
            resolve();
        }
    });
}

/**
 * Token Client を初期化
 */
function initTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.CLIENT_ID,
        scope: GOOGLE_CONFIG.SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error('認証エラー:', response.error);
                return;
            }
            accessToken = response.access_token;
            gapi.client.setToken({ access_token: accessToken });
            updateAuthStatusUI(true);
        }
    });
    gisInited = true;
}

/**
 * スクリプトを動的に読み込み
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ========================================
// 認証
// ========================================

/**
 * Google認証を実行
 */
async function authenticateGoogle() {
    try {
        // 初期化されていない場合は初期化
        if (!gapiInited) {
            await initGoogleAPI();
        }
        if (!gisInited) {
            await initGIS();
        }

        // 既にトークンがある場合はスキップ
        if (accessToken) {
            return true;
        }

        // 認証リクエスト
        return new Promise((resolve, reject) => {
            tokenClient.callback = (response) => {
                if (response.error) {
                    console.error('認証エラー:', response.error);
                    reject(new Error(response.error));
                    return;
                }
                accessToken = response.access_token;
                gapi.client.setToken({ access_token: accessToken });
                updateAuthStatusUI(true);
                resolve(true);
            };

            // ポップアップで認証
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });

    } catch (error) {
        console.error('認証処理エラー:', error);
        throw error;
    }
}

/**
 * 認証状態を確認
 */
function isAuthenticated() {
    return !!accessToken;
}

/**
 * ログアウト
 */
function signOut() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {});
        accessToken = null;
        gapi.client.setToken(null);
        updateAuthStatusUI(false);
    }
}

/**
 * 認証状態UIを更新
 */
function updateAuthStatusUI(isAuthed) {
    const statusIndicator = document.querySelector('#sheets-status .status-indicator');
    const statusIcon = document.querySelector('#sheets-status .status-icon');
    const statusText = document.querySelector('#sheets-status .status-text');

    if (statusIndicator && statusIcon && statusText) {
        if (isAuthed) {
            statusIndicator.classList.remove('disconnected');
            statusIndicator.classList.add('connected');
            statusIcon.textContent = '✅';
            statusText.textContent = 'Google Sheets 連携済み';
        } else {
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('disconnected');
            statusIcon.textContent = '🔒';
            statusText.textContent = 'Google Sheets 未連携';
        }
    }

    // スプレッドシート出力ボタンの状態更新
    const exportBtn = document.getElementById('salary-export-sheets-btn');
    if (exportBtn) {
        const settings = getSheetsSettings();
        exportBtn.disabled = !isAuthed || !settings.spreadsheetId;
    }
}

// ========================================
// Sheets API 操作
// ========================================

/**
 * スプレッドシートの情報を取得（接続テスト）
 */
async function testConnection(spreadsheetId) {
    try {
        if (!accessToken) {
            throw new Error('認証が必要です');
        }

        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId
        });

        return {
            success: true,
            title: response.result.properties.title,
            sheets: response.result.sheets.map(s => s.properties.title)
        };

    } catch (error) {
        console.error('接続テストエラー:', error);
        throw error;
    }
}

/**
 * シートにデータを書き込む
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} sheetName - シート名（例: "2024-01"）
 * @param {Array} data - 書き込むデータ（2次元配列）
 */
async function writeToSheet(spreadsheetId, sheetName, data) {
    try {
        if (!accessToken) {
            throw new Error('認証が必要です');
        }

        // シートが存在するか確認、なければ作成
        await ensureSheetExists(spreadsheetId, sheetName);

        // データ範囲を計算
        const range = `${sheetName}!A1`;

        // 既存データをクリア
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A:Z`
        });

        // データを書き込み
        const response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: data
            }
        });

        return response.result;

    } catch (error) {
        console.error('シート書き込みエラー:', error);
        throw error;
    }
}

/**
 * シートからデータを読み込む
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} range - 範囲（例: "マスタ!A:D"）
 */
async function readFromSheet(spreadsheetId, range) {
    try {
        if (!accessToken) {
            throw new Error('認証が必要です');
        }

        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: range
        });

        return response.result.values || [];

    } catch (error) {
        console.error('シート読み込みエラー:', error);
        throw error;
    }
}

/**
 * シートが存在しなければ作成
 */
async function ensureSheetExists(spreadsheetId, sheetName) {
    try {
        // 現在のシート一覧を取得
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId
        });

        const existingSheets = response.result.sheets.map(s => s.properties.title);

        if (!existingSheets.includes(sheetName)) {
            // シートを新規作成
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName
                            }
                        }
                    }]
                }
            });
        }

    } catch (error) {
        console.error('シート確認/作成エラー:', error);
        throw error;
    }
}

// ========================================
// 月次データ出力
// ========================================

/**
 * 月次集計データをスプレッドシートに出力
 * @param {Array} summaryData - 月次集計データ
 * @param {string} yearMonth - 対象年月（YYYY-MM）
 */
async function exportMonthlySummaryToSheets(summaryData, yearMonth) {
    try {
        const settings = getSheetsSettings();

        if (!settings.spreadsheetId) {
            throw new Error('スプレッドシートIDが設定されていません');
        }

        if (!accessToken) {
            throw new Error('Google認証が必要です');
        }

        // ヘッダー行
        const headers = [
            '従業員名',
            'メールアドレス',
            '通常勤務(h)',
            '夜間勤務(h)',
            '通し夜間(h)',
            '休日出勤(h)',
            '残業(h)',
            '休憩(h)',
            '合計(h)',
            '出勤日数',
            '有給日数',
            '代休日数'
        ];

        // データ行
        const rows = summaryData.map(record => [
            record.employeeName || '',
            record.email || '',
            record.normalHours,
            record.nightOnlyHours,
            record.throughNightHours,
            record.holidayHours,
            record.overtimeHours,
            record.breakHours || 0,
            record.totalHours,
            record.workDays,
            record.paidLeaveDays,
            record.compensatoryDays
        ]);

        // 書き込みデータ
        const data = [headers, ...rows];

        // シート名（YYYY-MM形式）
        const sheetName = yearMonth;

        // 書き込み実行
        await writeToSheet(settings.spreadsheetId, sheetName, data);

        return {
            success: true,
            sheetName: sheetName,
            rowCount: rows.length
        };

    } catch (error) {
        console.error('月次データ出力エラー:', error);
        throw error;
    }
}

/**
 * マスタシートから基本給データを取得
 */
async function fetchMasterData() {
    try {
        const settings = getSheetsSettings();

        if (!settings.spreadsheetId) {
            throw new Error('スプレッドシートIDが設定されていません');
        }

        const range = `${settings.masterSheetName}!A:D`;
        const data = await readFromSheet(settings.spreadsheetId, range);

        if (data.length <= 1) {
            return []; // ヘッダーのみ or データなし
        }

        // ヘッダーを除いてパース
        const [headers, ...rows] = data;
        return rows.map(row => ({
            employeeName: row[0] || '',
            email: row[1] || '',
            baseSalary: parseFloat(row[2]) || 0
        }));

    } catch (error) {
        console.error('マスタデータ取得エラー:', error);
        throw error;
    }
}

// ========================================
// グローバルスコープにエクスポート
// ========================================

window.GoogleSheets = {
    // 初期化
    init: async function() {
        await initGoogleAPI();
        await initGIS();
    },

    // 認証
    authenticate: authenticateGoogle,
    isAuthenticated: isAuthenticated,
    signOut: signOut,

    // 設定
    getSettings: getSheetsSettings,
    saveSettings: saveSheetsSettings,

    // API操作
    testConnection: testConnection,
    readFromSheet: readFromSheet,
    writeToSheet: writeToSheet,

    // 月次データ
    exportMonthlySummary: exportMonthlySummaryToSheets,
    fetchMasterData: fetchMasterData,

    // UI更新
    updateAuthStatus: updateAuthStatusUI
};
