#!/bin/bash

# 本番環境デプロイスクリプト
# 使用例: ./scripts/deploy.sh

set -e  # エラー時に終了

echo "🚀 本番環境デプロイを開始します..."

# 環境変数の確認
echo "📋 環境変数を確認中..."
required_vars=(
    "FIREBASE_API_KEY"
    "FIREBASE_AUTH_DOMAIN"
    "FIREBASE_PROJECT_ID"
    "FIREBASE_STORAGE_BUCKET"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ 以下の環境変数が設定されていません:"
    printf '  - %s\n' "${missing_vars[@]}"
    echo ""
    echo "環境変数を設定してから再実行してください:"
    echo "export FIREBASE_API_KEY=your_api_key"
    echo "export FIREBASE_AUTH_DOMAIN=your_domain"
    echo "export FIREBASE_PROJECT_ID=your_project_id"
    echo "export FIREBASE_STORAGE_BUCKET=your_bucket"
    exit 1
fi

echo "✅ 環境変数の確認完了"

# 設定ファイルの生成
echo "🔧 Firebase設定ファイルを生成中..."
npm run build:config

# 本番用設定の確認
echo "📝 生成された設定を確認中..."
if [ ! -f "js/config.js" ]; then
    echo "❌ 設定ファイルの生成に失敗しました"
    exit 1
fi

echo "✅ 設定ファイル生成完了"

# セキュリティチェック
echo "🔒 セキュリティチェック中..."

# APIキーがハードコードされていないかチェック
if grep -r "AIzaSy" --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude="deploy.sh" .; then
    echo "❌ ハードコードされたAPIキーが見つかりました"
    echo "上記のファイルからAPIキーを削除してください"
    exit 1
fi

echo "✅ セキュリティチェック完了"

# ファイルリスト表示
echo "📦 デプロイ対象ファイル:"
echo "  - index.html"
echo "  - admin-register.html"
echo "  - css/"
echo "  - js/ (config.js含む)"
echo "  - その他のアセット"

echo ""
echo "🎉 本番環境デプロイの準備が完了しました！"
echo ""
echo "次の手順:"
echo "1. 生成されたファイルをWebサーバーにアップロード"
echo "2. Firebase Console でAPIキー制限を設定"
echo "3. HTTPSでのアクセスを確認"
echo ""
echo "⚠️  重要: .env ファイルはアップロードしないでください"