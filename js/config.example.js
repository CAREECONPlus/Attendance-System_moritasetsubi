/**
 * Firebase設定ファイル (サンプル)
 *
 * このファイルをコピーして使用してください：
 * 1. このファイルをjs/config.jsにコピー
 * 2. 実際のFirebase設定値を記入
 * 3. js/config.jsはGitにコミットしないでください（セキュリティのため）
 *
 * Firebase設定値の取得方法：
 * 1. Firebase Console (https://console.firebase.google.com/) にアクセス
 * 2. プロジェクトを選択
 * 3. 「プロジェクトの設定」→「全般」→「マイアプリ」→「SDK の設定と構成」
 * 4. 「構成」を選択してコピー
 *
 * セキュリティ推奨事項:
 * - Firebase ConsoleでAPIキーを制限（HTTPリファラー、IPアドレス等）
 * - Firestore Security Rulesを適切に設定
 * - 本番環境では環境変数を使用（scripts/build-config.js参照）
 */

if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = {
        apiKey: "YOUR_API_KEY_HERE",
        authDomain: "your-project.firebaseapp.com",
        projectId: "your-project-id",
        storageBucket: "your-project.firebasestorage.app",
        messagingSenderId: "123456789012",
        appId: "1:123456789012:web:abcdef1234567890"
    };
}
