# 本番環境デプロイガイド

## 🚀 デプロイ手順

### 1. 事前準備

1. **新しいFirebase APIキーを生成**
   - Firebase Console で古いAPIキーを削除
   - 新しいAPIキーを生成
   - APIキー制限を設定（HTTPリファラー、API制限）

2. **環境変数を設定**
   ```bash
   export FIREBASE_API_KEY=your_new_api_key
   export FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   export FIREBASE_PROJECT_ID=your_project_id
   export FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   export FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   export FIREBASE_APP_ID=your_app_id
   export FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

### 2. ビルド実行

```bash
# 依存関係をインストール（初回のみ）
npm install

# 本番用設定ファイルを生成
npm run build

# デプロイ準備確認
./scripts/deploy.sh
```

### 3. ファイルアップロード

以下のファイルをWebサーバーにアップロードしてください：

#### 必須ファイル
- `index.html`
- `admin-register.html`
- `js/config.js` ← **ビルドで生成された本番用設定**
- `js/firebase.js`
- `js/` フォルダ内の全JavaScriptファイル
- `css/` フォルダ内の全CSSファイル

#### アップロード禁止ファイル
- `.env` ファイル
- `scripts/` フォルダ
- `node_modules/` フォルダ
- `SECURITY.md`、`PRODUCTION_DEPLOY.md`

### 4. Firebase Console 設定

1. **APIキー制限設定**
   ```
   HTTPリファラー制限:
   - https://yourdomain.com/*
   - https://www.yourdomain.com/*
   ```

2. **認証設定**
   - 承認済みドメインにプロダクションドメインを追加

3. **Firestore セキュリティルール確認**
   - 適切な権限設定がされているか確認

### 5. 動作確認

1. **ブラウザでアクセス**
   - `https://yourdomain.com`
   - HTTPSでアクセスできることを確認

2. **機能テスト**
   - ユーザー登録・ログイン
   - 勤怠記録
   - 管理者機能

3. **ブラウザコンソール確認**
   - エラーが出ていないか確認
   - Firebase接続が正常か確認

## 🔧 トラブルシューティング

### Firebase接続エラー
```javascript
// ブラウザコンソールで実行
checkFirebaseConnection()
```

### 設定確認
```javascript
// ブラウザコンソールで実行
console.log(window.FIREBASE_CONFIG)
```

### セキュリティエラー
- Firebase Console でAPIキー制限を確認
- 認証済みドメインを確認
- HTTPSでアクセスしているか確認

## 📋 チェックリスト

- [ ] 古いAPIキーを無効化済み
- [ ] 新しいAPIキーで環境変数設定済み
- [ ] `npm run build` でconfig.js生成済み
- [ ] デプロイスクリプトでセキュリティチェック完了
- [ ] 本番ファイルをアップロード済み
- [ ] Firebase Console でAPIキー制限設定済み
- [ ] HTTPSでアクセス確認済み
- [ ] 全機能の動作確認済み
- [ ] ブラウザコンソールエラーなし

## 🚨 緊急時対応

### APIキー漏洩時
1. Firebase Console で即座にAPIキー削除
2. 新しいAPIキー生成
3. 本ガイドに従って再デプロイ

### サービス停止時
1. 管理者登録を一時停止
2. Firebase Console でセキュリティルール確認
3. 問題解決後に再開