/**
 * 行政オープンデータ（CSV / JSON / GeoJSON）を venues テーブルへ一括インポートする汎用スクリプト。
 *
 * このスクリプトはインポートの「型」だけを提供する。実在するオープンデータの
 * 自動収集・ダウンロードは行わない（自治体ごとに公開有無・形式がバラバラで、
 * 存在しないURLを推測して叩くのは避けたいため）。手元に用意したファイルを渡して使う。
 *
 * 使い方:
 *   npx tsx scripts/import-opendata.ts <ファイルパス> <smoking|invoice-cafe|laundry|gym>
 *   例) npx tsx scripts/import-opendata.ts ./data/shizuoka-smoking-areas.csv smoking
 *
 * 対応フォーマット:
 *   - CSV（UTF-8 / Shift-JIS 自動判定、BOM可）
 *   - JSON配列、{ data | results | items | records: [...] } 形式
 *   - GeoJSON FeatureCollection（features[].properties + geometry.coordinates）
 *
 * 列名は下記 FIELD_ALIASES のいずれかに一致すれば自動認識する。
 * 認識できなかった列はそのまま metadata (jsonb) に格納する。
 * name / 緯度経度 が無い行は登録せずスキップし、理由をログに出す（クラッシュさせない）。
 *
 * 重複防止: googleのplace_idを持たないデータのため、
 * 「category + prefecture + city + name + address(or 座標)」から決定的なハッシュを生成し、
 * 既存の venues.google_place_id（unique制約）に "opendata:<hash>" として保存することで
 * scripts/sync-places.ts と同じ onConflict upsert の仕組みに相乗りする（新規マイグレーション不要）。
 *
 * 必要な環境変数（.env.local から読み込む）: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { parse as parseCsv } from "csv-parse/sync";
import iconv from "iconv-lite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { isVenueCategory, VENUE_CATEGORIES, type VenueCategory } from "@/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local が無い場合はシェル側で環境変数がexport済みという想定でそのまま進める。
}

const BATCH_SIZE = 200;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

// ---- 文字コード自動判定（行政CSVはShift-JIS率が高いため） ----
function readTextAutoDetect(filePath: string): string {
  const buffer = readFileSync(filePath);
  const utf8 = buffer.toString("utf8").replace(/^﻿/, "");
  if (!utf8.includes("�")) return utf8;
  return iconv.decode(buffer, "Shift_JIS").replace(/^﻿/, "");
}

// ---- 都道府県リスト（住所文字列からprefecture/cityを分割するためのフォールバック） ----
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function splitPrefectureCity(address: string): { prefecture: string | null; city: string | null } {
  const prefecture = PREFECTURES.find((p) => address.startsWith(p));
  if (!prefecture) return { prefecture: null, city: null };
  const rest = address.slice(prefecture.length);
  const match = rest.match(/^(.+?郡.+?[町村]|.+?[市区町村])/);
  return { prefecture, city: match ? match[1] : null };
}

// ---- 列名の別名解決 ----
const FIELD_ALIASES = {
  name: ["name", "施設名", "名称", "店舗名", "施設・店舗名"],
  latitude: ["latitude", "緯度", "lat"],
  longitude: ["longitude", "経度", "lng", "lon"],
  address: ["address", "住所", "所在地"],
  prefecture: ["prefecture", "都道府県", "都道府県名"],
  city: ["city", "市区町村", "市町村", "市町村名"],
} as const;

type SourceRow = Record<string, unknown>;

function findFieldKey(row: SourceRow, field: keyof typeof FIELD_ALIASES): string | null {
  return Object.keys(row).find((key) => (FIELD_ALIASES[field] as readonly string[]).includes(key.trim())) ?? null;
}

function resolveField(row: SourceRow, field: keyof typeof FIELD_ALIASES): string | null {
  const key = findFieldKey(row, field);
  if (!key) return null;
  const value = row[key];
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return String(value).trim();
}

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---- カテゴリ別 metadata マッピング ----
// smokingは既存UI（フィルターピル・引用表示）が特定のキーに依存しているため、
// できる範囲で同じ形（SmokingMetadata）へマッピングする。それ以外のカテゴリは
// 認識できなかった列をそのままmetadataへ格納する汎用の入れ物として扱う。
function buildMetadata(category: VenueCategory, row: SourceRow, usedKeys: Set<string>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (usedKeys.has(key)) continue;
    if (value === undefined || value === null || String(value).trim() === "") continue;
    extra[key] = value;
  }

  if (category !== "smoking") {
    return extra;
  }

  const combined = `${Object.keys(row).join(" ")} ${Object.values(row)
    .map((v) => String(v ?? ""))
    .join(" ")}`;

  return {
    // 行政データの表記ゆれ（例:「屋内/屋外」「加熱式限定」）をベストエフォートで推定する。
    // 曖昧な場合はfalse側に倒し、詳細はextraにも残すので後から手動で確認できる。
    allows_paper_cigarettes: /紙巻|紙タバコ/.test(combined) && !/全面禁煙/.test(combined),
    allows_electronic_cigarettes_only: /電子タバコ|加熱式/.test(combined) && !/紙巻|紙タバコ/.test(combined),
    has_outdoor_ashtray: /屋外/.test(combined) && /灰皿|喫煙/.test(combined),
    text_proof: "行政公開データに基づく情報です（口コミのAI解析ではありません）",
    ...extra,
  };
}

// ---- ソースファイルの読み込み（CSV / JSON / GeoJSON） ----
function parseSourceFile(filePath: string): SourceRow[] {
  const text = readTextAutoDetect(filePath);
  const ext = extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return parseCsv(text, { columns: true, skip_empty_lines: true, trim: true }) as SourceRow[];
  }

  if (ext === ".json" || ext === ".geojson") {
    const json = JSON.parse(text);

    if (json && json.type === "FeatureCollection" && Array.isArray(json.features)) {
      return json.features.map((feature: { properties?: SourceRow; geometry?: { coordinates?: [number, number] } }) => {
        const [lng, lat] = feature.geometry?.coordinates ?? [];
        return {
          ...(feature.properties ?? {}),
          longitude: feature.properties?.longitude ?? lng,
          latitude: feature.properties?.latitude ?? lat,
        };
      });
    }

    if (Array.isArray(json)) return json as SourceRow[];

    for (const key of ["data", "results", "items", "records"]) {
      if (Array.isArray(json?.[key])) return json[key] as SourceRow[];
    }

    throw new Error(
      "JSONの構造を認識できませんでした（配列、GeoJSON FeatureCollection、data/results/items/records のいずれかを想定）。"
    );
  }

  throw new Error(`未対応の拡張子です: ${ext || "(なし)"}（.csv / .json / .geojson のみ対応）`);
}

interface VenueRow {
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  google_place_id: string;
  city: string | null;
  prefecture: string | null;
  category: VenueCategory;
  metadata: Record<string, unknown>;
  updated_at: string;
}

type MapResult = { ok: true; venue: VenueRow } | { ok: false; reason: string };

function mapRow(row: SourceRow, category: VenueCategory): MapResult {
  const name = resolveField(row, "name");
  if (!name) return { ok: false, reason: "施設名の列が見つかりません" };

  const latitude = toNumber(resolveField(row, "latitude"));
  const longitude = toNumber(resolveField(row, "longitude"));
  if (latitude === null || longitude === null) {
    return { ok: false, reason: `緯度・経度が取得できません（施設名: ${name}）` };
  }

  const address = resolveField(row, "address");
  let prefecture = resolveField(row, "prefecture");
  let city = resolveField(row, "city");
  if ((!prefecture || !city) && address) {
    const split = splitPrefectureCity(address);
    prefecture = prefecture ?? split.prefecture;
    city = city ?? split.city;
  }

  const usedKeys = new Set<string>();
  for (const field of Object.keys(FIELD_ALIASES) as Array<keyof typeof FIELD_ALIASES>) {
    const key = findFieldKey(row, field);
    if (key) usedKeys.add(key);
  }

  const uniqueSeed = `opendata|${category}|${prefecture ?? ""}|${city ?? ""}|${name}|${address ?? `${latitude},${longitude}`}`;
  const googlePlaceId = `opendata:${createHash("sha256").update(uniqueSeed).digest("hex").slice(0, 32)}`;

  return {
    ok: true,
    venue: {
      name,
      latitude,
      longitude,
      address,
      google_place_id: googlePlaceId,
      city,
      prefecture,
      category,
      metadata: buildMetadata(category, row, usedKeys),
      updated_at: new Date().toISOString(),
    },
  };
}

async function main() {
  const [filePath, categoryArg] = process.argv.slice(2);

  if (!filePath || !categoryArg) {
    console.error(
      "使い方: npx tsx scripts/import-opendata.ts <ファイルパス> <smoking|invoice-cafe|laundry|gym>"
    );
    process.exitCode = 1;
    return;
  }

  if (!isVenueCategory(categoryArg)) {
    console.error(`category は次のいずれかを指定してください: ${VENUE_CATEGORIES.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const category = categoryArg;

  let rows: SourceRow[];
  try {
    rows = parseSourceFile(filePath);
  } catch (error) {
    console.error("[import-opendata] ファイルの読み込みに失敗しました", error);
    process.exitCode = 1;
    return;
  }

  console.log(`[import-opendata] "${filePath}" から ${rows.length}件読み込みました（category: ${category}）`);

  const mapped = rows.map((row) => mapRow(row, category));
  const venues = mapped.filter((r): r is { ok: true; venue: VenueRow } => r.ok).map((r) => r.venue);
  const skipped = mapped.filter((r): r is { ok: false; reason: string } => !r.ok);

  if (venues.length === 0) {
    console.error("[import-opendata] 取り込めるレコードがありませんでした。列名を確認してください。");
    if (skipped.length > 0) {
      console.error(`[import-opendata] スキップ理由の例: ${skipped[0].reason}`);
    }
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < venues.length; i += BATCH_SIZE) {
    const batch = venues.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("venues").upsert(batch, { onConflict: "google_place_id" });
    if (error) {
      errors.push(error.message);
    } else {
      upserted += batch.length;
    }
  }

  console.log(
    `[import-opendata] 完了: 保存 ${upserted}件 / 読み込み時スキップ ${skipped.length}件 / Upsertエラー ${errors.length}件`
  );
  for (const s of skipped.slice(0, 10)) {
    console.warn(`  - skip: ${s.reason}`);
  }
  for (const e of errors) {
    console.error(`  - upsert error: ${e}`);
  }
}

main().catch((error) => {
  console.error("[import-opendata] 致命的なエラーが発生しました", error);
  process.exitCode = 1;
});
