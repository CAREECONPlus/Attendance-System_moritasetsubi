# セキュリティ設定ガイド

## Firebase API キーの設定

### 🚨 重要: セキュリティ上の注意事項

1. **APIキーを直接コードに埋め込まないでください**
2. **本番環境では必ず環境変数を使用してください**
3. **Firebase Console でAPIキーの制限を設定してください**

### 設定手順

#### 1. 開発環境での設定

開発環境では `js/config.js` ファイルの `window.FIREBASE_CONFIG` オブジェクトに値を設定してください：

```javascript
// js/config.js (開発環境用)
if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = {
        apiKey: "your_development_api_key",
        authDomain: "your_project.firebaseapp.com",
        projectId: "your_project_id",
        storageBucket: "your_project.appspot.com",
        messagingSenderId: "your_messaging_sender_id",
        appId: "your_app_id",
        measurementId: "your_measurement_id"
    };
}
```

#### 2. 本番環境での設定

本番環境では環境変数を設定し、ビルドスクリプトで設定ファイルを生成します：

```bash
# 環境変数を設定
export FIREBASE_API_KEY=your_actual_api_key_here
export FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
export FIREBASE_PROJECT_ID=your_project_id
export FIREBASE_STORAGE_BUCKET=your_project.appspot.com
export FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
export FIREBASE_APP_ID=your_app_id
export FIREBASE_MEASUREMENT_ID=your_measurement_id

# 本番用設定ファイルを生成
npm run build

# デプロイスクリプトを実行
./scripts/deploy.sh
```

#### 3. Firebase Console でのAPIキー制限設定

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクトを選択
3. 「設定」→「プロジェクトの設定」→「全般」タブ
4. 「ウェブAPIキー」セクションでAPIキーを確認
5. Google Cloud Console でAPIキーの制限を設定：
   - HTTPリファラー制限を設定
   - 必要最小限のAPIのみを有効化

### 推奨設定

#### HTTPリファラー制限例：
```
https://yourdomain.com/*
https://www.yourdomain.com/*
http://localhost:*（開発環境用）
```

#### 有効化すべきAPI：
- Firebase Authentication API
- Cloud Firestore API
- Firebase Management API（必要に応じて）

## 緊急時の対応

### APIキーが漏洩した場合

1. **即座にAPIキーを無効化**
   - Firebase Console でAPIキーを削除
   - 新しいAPIキーを生成

2. **セキュリティログの確認**
   - Firebase Console で認証ログを確認
   - 不正なアクセスがないか確認

3. **コードの更新**
   - 新しいAPIキーで設定を更新
   - Git履歴からAPIキーを完全に削除

### Git履歴からのAPIキー削除

```bash
# BFG Repo-Cleaner を使用（推奨）
java -jar bfg.jar --replace-text passwords.txt your-repo.git

# または git filter-branch を使用
git filter-branch --force --index-filter \
'git rm --cached --ignore-unmatch path/to/file/with/api-key' \
--prune-empty --tag-name-filter cat -- --all
```

## チェックリスト

- [ ] APIキーがコードから削除されている
- [ ] `.env` ファイルが `.gitignore` に追加されている  
- [ ] Firebase Console でAPIキー制限が設定されている
- [ ] セキュリティルールが適切に設定されている
- [ ] チーム全体にセキュリティガイドラインが共有されている