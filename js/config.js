/**
 * Firebase設定ファイル
 * セキュリティ強化版 - GitHub Pages対応
 */

if (typeof window !== 'undefined') {
    // 本番環境用のFirebase設定
    // APIキーは制限付き（GitHub Pages からのアクセスのみ許可）
    window.FIREBASE_CONFIG = {
        apiKey: "AIzaSyCghzgr34hEsD1PuZaGDgiC8DKrX-8ZPLQ",
        authDomain: "attendance-system-morita.firebaseapp.com",
        projectId: "attendance-system-morita",
        storageBucket: "attendance-system-morita.firebasestorage.app",
        messagingSenderId: "830412470887",
        appId: "1:830412470887:web:a48ffbd57f49a21c2432c2"
    };
    
}