# EmailJS セットアップ手順書

管理者登録依頼のメール通知機能を有効にするためのEmailJSセットアップ手順です。

## 1. EmailJSアカウント作成

1. [EmailJS公式サイト](https://www.emailjs.com/)にアクセス
2. アカウントを作成してログイン

## 2. メールサービス設定

1. EmailJSダッシュボードで「Email Services」を選択
2. Gmailサービスを追加
3. dxconsulting.branu2@gmail.comでGoogleアカウント認証

## 3. メールテンプレート作成

1. EmailJSダッシュボードで「Email Templates」を選択
2. 新しいテンプレートを作成
3. テンプレート内容:

```
件名: 【勤怠管理システム】新しい管理者登録依頼

本文:
勤怠管理システムに新しい管理者登録依頼が届きました。
■ 依頼詳細
依頼者名: {{requester_name}}
メールアドレス: {{requester_email}}
会社名: {{company_name}}
部署: {{department}}
電話番号: {{phone}}
依頼日時: {{request_date}}
依頼ID: {{request_id}}

■ 確認・承認
以下のURLから管理画面にアクセスして依頼を確認してください。
{{admin_url}}

※ 管理者依頼タブから承認・却下を行えます。

---
勤怠管理システム 自動通知
```

## 4. 設定値の取得

EmailJSダッシュボードから以下の値を取得:

- **Public Key**: Account設定画面
- **Service ID**: Email Servicesの一覧画面
- **Template ID**: Email Templatesの一覧画面

## 5. 設定値の更新

`js/email-config.js`ファイルの以下の部分を実際の値に更新:

```javascript
const EMAIL_CONFIG = {
    PUBLIC_KEY: 'your_actual_public_key_here',
    SERVICE_ID: 'your_actual_service_id_here', 
    TEMPLATE_ID: 'your_actual_template_id_here',
    NOTIFICATION_EMAIL: 'dxconsulting.branu2@gmail.com'
};
```

## 6. 動作確認

1. 管理者登録フォームから依頼を送信
2. dxconsulting.branu2@gmail.comにメールが届くことを確認
3. エラーが発生した場合はブラウザのデベロッパーツールコンソールを確認

## セキュリティ注意事項

- Public Keyは公開されても問題ありませんが、Service IDとTemplate IDは可能な限り秘匿を推奨
- EmailJSの無料プランは月200通まで
- 本番環境では環境変数での管理を検討

## トラブルシューティング

### メールが送信されない場合
1. EmailJSの設定値が正しいか確認
2. Gmailサービスの認証が有効か確認
3. ブラウザのネットワークタブでAPI呼び出しエラーを確認

### メールが届かない場合
1. スパムフォルダを確認
2. EmailJSダッシュボードでログを確認
3. テンプレートの設定を再確認