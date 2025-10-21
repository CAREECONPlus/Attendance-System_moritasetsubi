#!/usr/bin/env node

/**
 * 本番環境用Firebase設定ビルドスクリプト
 * 環境変数からFirebase設定を読み込み、config.js ファイルを生成します
 */

const fs = require('fs');
const path = require('path');

// 環境変数から設定を読み込み
const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// 必須設定の確認
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket'];
const missingKeys = requiredKeys.filter(key => !config[key]);

if (missingKeys.length > 0) {
    console.error('❌ 必須環境変数が設定されていません:');
    missingKeys.forEach(key => {
        console.error(`  - FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
    });
    process.exit(1);
}

// config.js ファイルの内容を生成
const configContent = `/**
 * Firebase設定ファイル (本番用)
 * このファイルは自動生成されます。直接編集しないでください。
 * 生成日時: ${new Date().toISOString()}
 */

if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = ${JSON.stringify(config, null, 8)};
}`;

// ファイルを書き出し
const outputPath = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(outputPath, configContent, 'utf8');

console.log('✅ Firebase設定ファイルを生成しました:', outputPath);
console.log('📋 設定内容:');
console.log(`  - Project ID: ${config.projectId}`);
console.log(`  - Auth Domain: ${config.authDomain}`);
console.log(`  - Storage Bucket: ${config.storageBucket}`);