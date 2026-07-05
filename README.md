This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 静岡駅 喫煙所検索プロトタイプ

`/smoking` にアクセスすると、静岡駅周辺半径1000m以内のコンビニ・飲食店をGoogle Places APIで検索し、口コミをClaudeで解析して喫煙可否を地図上に表示します。ダミーデータは使用せず、毎回APIから直接取得します。

### 事前準備

1. `.env.local.example` を `.env.local` にコピーし、キーを設定する。
   - `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: Google Cloud で **Places API** と **Maps JavaScript API** を有効化して取得。`NEXT_PUBLIC_*` はブラウザに露出するため、HTTPリファラー制限を設定すること。
   - `ANTHROPIC_API_KEY`: Anthropic Consoleで発行したAPIキー。
2. `npm install`（インストール済みであれば不要）。
3. `npm run dev` で起動し、`http://localhost:3000/smoking` を開く。

### 実装箇所

- `app/api/smoking-spots/route.ts`: Nearby Search → Place Details（口コミ取得）→ Claude（口コミから喫煙可否をツール呼び出しで抽出）の順に処理し、結果をJSONで返すAPI Route。
- `app/smoking/page.tsx`: Google Maps JS APIをスクリプトタグで読み込み、マーカー色分け（緑=紙タバコOK / 青=電子タバコ限定 / 黄=コンビニ店外灰皿あり）とサイドバー一覧を表示するクライアントコンポーネント。

## 便利マップ（venuesテーブル）

Supabaseの `venues` テーブルに登録した店舗・施設（喫煙所、インボイス対応カフェ、コインランドリー、ジムなど）を、市町村・カテゴリで絞り込んで返すAPI。

### 事前準備

1. Supabaseプロジェクトで `supabase/migrations/0001_create_venues_table.sql` → `0002_add_location_gist_index.sql` の順にSQLを実行する（Supabase SQL Editor、または `supabase db push`）。
2. `.env.local` に以下を設定する（サービスロールキーは秘匿情報のためブラウザに公開しないこと）。
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 実装箇所

- `supabase/migrations/0001_create_venues_table.sql`: `venues` テーブル定義（`category` は `smoking` / `invoice-cafe` / `laundry` / `gym` のCHECK制約付き）。
- `supabase/migrations/0002_add_location_gist_index.sql`: `cube` / `earthdistance` 拡張を使い、緯度経度に対するGiSTインデックスを追加（半径検索を高速化）。
- `lib/supabaseClient.ts`: サービスロールキーでSupabaseに接続するサーバー専用クライアント。
- `app/api/locations/route.ts`: `?city=` `&category=` クエリで `venues` を絞り込み取得するAPI Route。`category` は許可された値以外だと400を返す。
- `scripts/sync-places.ts`: 指定した市町村の施設をGoogle Places API (New) のText Search / Place Detailsで収集し、口コミをClaudeで解析して `venues.metadata` へ`google_place_id`基準でUpsertするスタンドアロンスクリプト。`npm run sync-places -- <市町村名> <smoking|invoice-cafe>` で実行する。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
