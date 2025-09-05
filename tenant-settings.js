/**
 * テナント設定管理モジュール
 * 
 * テナント固有の設定情報を管理します：
 * - 会社情報
 * - 勤怠設定
 * - サイト管理
 * - 通知設定
 */


// ================ テナント設定のデフォルト値 ================

const DEFAULT_TENANT_SETTINGS = {
    // 会社基本情報
    company: {
        name: '',
        address: '',
        phone: '',
        email: '',
        website: ''
    },
    
    // 勤怠設定
    attendance: {
        workingHours: {
            start: '09:00',
            end: '18:00'
        },
        breakTime: {
            default: 60, // 分
            allowMultiple: true
        },
        overtime: {
            enabled: true,
            threshold: 480 // 8時間（分）
        },
        rounding: {
            enabled: true,
            minutes: 15 // 15分単位
        }
    },
    
    // サイト管理
    sites: {
        enabled: true,
        requireSiteSelection: true,
        sites: [
            { id: 'default', name: 'メインオフィス', address: '', active: true }
        ]
    },
    
    // 通知設定
    notifications: {
        email: {
            enabled: true,
            adminNotifications: true,
            employeeReminders: false
        },
        system: {
            clockInReminder: false,
            clockOutReminder: false
        }
    },
    
    // UI設定
    ui: {
        theme: 'light',
        language: 'ja',
        timezone: 'Asia/Tokyo'
    },
    
    // システム設定
    system: {
        dataRetention: 365, // 日数
        exportFormats: ['csv', 'excel'],
        apiAccess: false
    }
};

// ================ テナント設定管理関数 ================

/**
 * テナント設定を取得
 * @param {string} tenantId テナントID
 * @returns {Promise<Object>} テナント設定
 */
async function getTenantSettings(tenantId) {
    try {
        if (!tenantId) {
            return DEFAULT_TENANT_SETTINGS;
        }
        
        const settingsDoc = await firebase.firestore()
            .collection(`tenants/${tenantId}/settings`)
            .doc('config')
            .get();
        
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            // デフォルト設定とマージ
            return mergeSettings(DEFAULT_TENANT_SETTINGS, settings);
        } else {
            return DEFAULT_TENANT_SETTINGS;
        }
    } catch (error) {
        return DEFAULT_TENANT_SETTINGS;
    }
}

/**
 * テナント設定を保存
 * @param {string} tenantId テナントID
 * @param {Object} settings 設定データ
 * @returns {Promise<boolean>} 成功/失敗
 */
async function saveTenantSettings(tenantId, settings) {
    try {
        if (!tenantId) {
            throw new Error('テナントIDが指定されていません');
        }
        
        const settingsData = {
            ...settings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            version: '1.0'
        };
        
        await firebase.firestore()
            .collection(`tenants/${tenantId}/settings`)
            .doc('config')
            .set(settingsData, { merge: true });
        
        
        // キャッシュを更新
        if (window.currentTenant && window.currentTenant.id === tenantId) {
            window.currentTenant.settings = settingsData;
        }
        
        return true;
    } catch (error) {
        throw error;
    }
}

/**
 * デフォルト設定と現在の設定をマージ
 * @param {Object} defaultSettings デフォルト設定
 * @param {Object} currentSettings 現在の設定
 * @returns {Object} マージされた設定
 */
function mergeSettings(defaultSettings, currentSettings) {
    const merged = { ...defaultSettings };
    
    for (const key in currentSettings) {
        if (currentSettings.hasOwnProperty(key)) {
            if (typeof currentSettings[key] === 'object' && !Array.isArray(currentSettings[key])) {
                merged[key] = mergeSettings(merged[key] || {}, currentSettings[key]);
            } else {
                merged[key] = currentSettings[key];
            }
        }
    }
    
    return merged;
}

/**
 * 初回テナント作成時の設定初期化
 * @param {string} tenantId テナントID
 * @param {Object} companyInfo 会社情報
 * @returns {Promise<boolean>} 成功/失敗
 */
async function initializeTenantSettings(tenantId, companyInfo = {}) {
    try {
        const initialSettings = {
            ...DEFAULT_TENANT_SETTINGS,
            company: {
                ...DEFAULT_TENANT_SETTINGS.company,
                ...companyInfo
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            version: '1.0'
        };
        
        await saveTenantSettings(tenantId, initialSettings);
        return true;
    } catch (error) {
        throw error;
    }
}

/**
 * サイト設定を取得
 * @param {string} tenantId テナントID
 * @returns {Promise<Array>} サイト一覧
 */
async function getTenantSites(tenantId) {
    try {
        const settings = await getTenantSettings(tenantId);
        return settings.sites?.sites || [];
    } catch (error) {
        console.error('getTenantSites - エラー:', error);
        return [];
    }
}

/**
 * サイト情報を保存
 * @param {string} tenantId テナントID
 * @param {Array} sites サイト一覧
 * @returns {Promise<boolean>} 成功/失敗
 */
async function saveTenantSites(tenantId, sites) {
    try {
        const currentSettings = await getTenantSettings(tenantId);
        currentSettings.sites.sites = sites;
        
        await saveTenantSettings(tenantId, currentSettings);
        return true;
    } catch (error) {
        throw error;
    }
}

/**
 * 勤怠設定を取得
 * @param {string} tenantId テナントID
 * @returns {Promise<Object>} 勤怠設定
 */
async function getAttendanceSettings(tenantId) {
    try {
        const settings = await getTenantSettings(tenantId);
        return settings.attendance || DEFAULT_TENANT_SETTINGS.attendance;
    } catch (error) {
        return DEFAULT_TENANT_SETTINGS.attendance;
    }
}

// ================ グローバル関数エクスポート ================

// 設定管理関数をグローバルスコープに公開
window.getTenantSettings = getTenantSettings;
window.saveTenantSettings = saveTenantSettings;
window.initializeTenantSettings = initializeTenantSettings;
window.getTenantSites = getTenantSites;
window.saveTenantSites = saveTenantSites;
window.getAttendanceSettings = getAttendanceSettings;
window.mergeSettings = mergeSettings;

// デフォルト設定もエクスポート
window.DEFAULT_TENANT_SETTINGS = DEFAULT_TENANT_SETTINGS;

