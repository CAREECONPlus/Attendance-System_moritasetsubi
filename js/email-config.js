/**
 * EmailJS設定ファイル
 * 管理者登録依頼のメール通知機能設定
 */

// EmailJS設定値
const EMAIL_CONFIG = {
    // EmailJSの公開キー（環境変数から取得推奨）
    PUBLIC_KEY: 'MKAevwRJGDmMihv62',
    
    // EmailJSのサービスID
    SERVICE_ID: 'service_6abef5b',
    
    // EmailJSのテンプレートID
    TEMPLATE_ID: 'template_xth8wr7',
    
    // 通知先メールアドレス
    NOTIFICATION_EMAIL: 'dxconsulting.branu2@gmail.com'
};

/**
 * EmailJS初期化
 */
function initEmailJS() {
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAIL_CONFIG.PUBLIC_KEY);
        return true;
    } else {
        return false;
    }
}

/**
 * 管理者登録依頼通知メール送信
 */
async function sendAdminRequestNotification(requestData, requestId) {
    try {
        if (!initEmailJS()) {
            throw new Error('EmailJS初期化失敗');
        }

        
        const templateParams = {
            // EmailJSテンプレートで使用する変数
            to_email: EMAIL_CONFIG.NOTIFICATION_EMAIL,
            subject: '【勤怠管理システム】新しい管理者登録依頼',
            requester_name: requestData.requesterName,
            requester_email: requestData.requesterEmail,
            company_name: requestData.companyName,
            department: requestData.department || '未記入',
            phone: requestData.phone || '未記入',
            request_id: requestId,
            request_date: new Date().toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }),
            admin_url: `${window.location.origin}/admin.html?tenant=system`
        };
        
        const response = await emailjs.send(
            EMAIL_CONFIG.SERVICE_ID,
            EMAIL_CONFIG.TEMPLATE_ID,
            templateParams
        );
        
        return { success: true, response };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// グローバル関数として公開
window.EMAIL_CONFIG = EMAIL_CONFIG;
window.sendAdminRequestNotification = sendAdminRequestNotification;
window.initEmailJS = initEmailJS;

