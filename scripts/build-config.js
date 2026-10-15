#!/usr/bin/env node

/**
 * Firebase設定ファイル生成スクリプト
 *
 * 使い方:
 *   # CI（環境変数 → js/config.js）
 *   FIREBASE_API_KEY=... FIREBASE_AUTH_DOMAIN=... node scripts/build-config.js
 *
 *   # 手元の開発（.env.dev → js/config.local.js。git には含めない）
 *   node scripts/build-config.js --env dev --local
 *
 * オプション:
 *   --env <name>  .env.<name> ファイルを読み込んでから生成する（環境変数が優先）
 *   --local       js/config.js ではなく js/config.local.js に書き出す
 *                 （index.html が config.js の後に読み込み、設定を上書きする）
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const envName = args.includes('--env') ? args[args.indexOf('--env') + 1] : null;
const writeLocal = args.includes('--local');
const rootDir = path.join(__dirname, '..');

/**
 * KEY=VALUE 形式の .env ファイルを process.env に読み込む（既に設定済みの変数は上書きしない）
 */
function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
        if (!line.trim() || line.trim().startsWith('#')) return;
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) return;
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    });
    return true;
}

if (envName) {
    const envFile = path.join(rootDir, `.env.${envName}`);
    if (!loadEnvFile(envFile)) {
        console.error(`❌ ${envFile} が見つかりません。.env.dev.example をコピーして作成してください。`);
        process.exit(1);
    }
    console.log(`📄 .env.${envName} を読み込みました`);
}

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

const outputName = writeLocal ? 'config.local.js' : 'config.js';
const description = writeLocal
    ? 'ローカル開発用の上書き設定（git には含めない）'
    : '自動生成';

// config.js ファイルの内容を生成
const configContent = `/**
 * Firebase設定ファイル (${description})
 * このファイルは scripts/build-config.js により自動生成されます。直接編集しないでください。
 * 生成日時: ${new Date().toISOString()}
 */

if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = ${JSON.stringify(config, null, 8)};
}
`;

// ファイルを書き出し
const outputPath = path.join(rootDir, 'js', outputName);
fs.writeFileSync(outputPath, configContent, 'utf8');

console.log('✅ Firebase設定ファイルを生成しました:', outputPath);
console.log('📋 設定内容:');
console.log(`  - Project ID: ${config.projectId}`);
console.log(`  - Auth Domain: ${config.authDomain}`);
console.log(`  - Storage Bucket: ${config.storageBucket}`);
